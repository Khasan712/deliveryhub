"""Customer messages (order placed, status changed): rows that the backend — and the staff bot, when staff
change a status — write to adminbot_outbox. They are sent from the business's customers' bot to the customer's
Telegram chat (app_client.tg_id), in the customer's language.

A row is finished when `sent_at` is set (delivered) or `attempts` reaches MAX_ATTEMPTS (given up; `error` says
why). Network trouble and Telegram server errors count an attempt and are retried with growing pauses
(RETRY_DELAYS); a blocked bot, an unknown chat, a customer without Telegram or a message older than MAX_AGE are
given up at once. Messages about one order go out in order: a row waits while an earlier row of the same order is
still pending. Each row is sent in its own transaction holding the row lock, so two running services never send
the same message. On the first sign of Telegram trouble (no answer, 5xx, flood control, a revoked token) the
round stops with Backoff — nobody sleeps holding a row lock, and the rest of the round is not tried row by row;
flood control is not the message's fault, so it costs no attempt."""
import logging
from datetime import timedelta

from aiogram.exceptions import TelegramBadRequest, TelegramForbiddenError, TelegramNotFound, TelegramRetryAfter
from sqlalchemy import and_, literal, select, update

from .customer.texts import STATUS_EVENTS, order_created_text, order_language, order_status_text
from .db.models import Outbox
from .orders import load_order
from .telegram.api import ERRORS, PARSE_MODE, Backoff, describe, is_retryable, no_flood_wait
from .utils import now

logger = logging.getLogger('outbox')

MAX_ATTEMPTS = 5
# Per business and round: messages sent at most, pending rows looked at.
BATCH = 50
SCAN = 500
MAX_AGE = timedelta(hours=6)
# How long after the row was created attempt N+1 may run.
RETRY_DELAYS = (timedelta(0), timedelta(seconds=10), timedelta(minutes=1), timedelta(minutes=5),
                timedelta(minutes=30))
# Telegram's final answers: repeating the request will not help.
PERMANENT_ERRORS = (TelegramForbiddenError, TelegramBadRequest, TelegramNotFound)

SENT, RETRY, GAVE_UP = 'sent', 'retry', 'gave_up'


class Undeliverable(Exception):
    """There is nothing to send or nobody to send it to."""


def pending():
    """Rows still to send. MAX_ATTEMPTS is written into the SQL, not bound as a parameter: only then may every
    execution of the prepared statement (generic plans too) use the partial index adminbot_outbox_due
    (id) WHERE sent_at IS NULL AND attempts < 5 — whose 5 is this MAX_ATTEMPTS."""
    return and_(Outbox.sent_at.is_(None), Outbox.attempts < literal(MAX_ATTEMPTS, literal_execute=True))


def is_due(row, stamp):
    return row.created_at <= stamp - RETRY_DELAYS[row.attempts]


async def pending_rows(session):
    return (await session.execute(
        select(Outbox.id, Outbox.order_id, Outbox.attempts, Outbox.created_at)
        .where(pending()).order_by(Outbox.id).limit(SCAN)
    )).all()


async def message_for(session, row, business):
    """(chat id, text) of an outbox row."""
    order = await load_order(session, row.order_id)
    if order is None:
        raise Undeliverable('order not found')
    client = order.client
    if not client or not client.tg_id:
        raise Undeliverable('the customer has no Telegram chat')
    lang = order_language(client)
    if row.kind == Outbox.KIND_ORDER_CREATED:
        return client.tg_id, order_created_text(order, lang)
    if row.kind == Outbox.KIND_ORDER_STATUS and row.event in STATUS_EVENTS:
        return client.tg_id, order_status_text(order, row.event, lang, business.support_phone)
    raise Undeliverable(f'unknown message {row.kind}:{row.event}'[:200])


async def send_one(session, bot, business, row_id):
    row = await session.scalar(select(Outbox).where(Outbox.id == row_id, pending()).with_for_update(skip_locked=True))
    if row is None:
        await session.rollback()
        return None  # sent or taken by another process meanwhile
    try:
        chat_id, text = await message_for(session, row, business)
    except Undeliverable as reason:
        row.attempts, row.error = MAX_ATTEMPTS, str(reason)
        await session.commit()
        return GAVE_UP

    try:
        with no_flood_wait():
            await bot.send_message(chat_id=chat_id, text=text, parse_mode=PARSE_MODE)
    except ERRORS as exc:
        if isinstance(exc, TelegramRetryAfter):
            await session.rollback()  # untouched: it goes out once the bot may send again
            raise Backoff(exc) from None
        final = isinstance(exc, PERMANENT_ERRORS)
        row.attempts = MAX_ATTEMPTS if final else row.attempts + 1
        row.error = describe(exc)[:200]
        await session.commit()
        logger.warning('%s: message %s about order #%s %s: %s', business.slug, row.id, row.order_id,
                       'given up' if final else f'failed (attempt {row.attempts})', row.error)
        if is_retryable(exc):
            raise Backoff(exc) from None
        return GAVE_UP if final else RETRY
    row.sent_at = now()
    await session.commit()
    return SENT


async def send_pending(db, business, bot, stopping=None):
    """Sends the due customer messages of one business. Returns how many were sent. Stops between two messages
    once `stopping` (an asyncio.Event) is set; raises Backoff on Telegram trouble."""
    stamp = now()
    async with db.tenant(business.schema_name) as session:
        # A status message that comes hours late only confuses: such rows are dropped.
        await session.execute(update(Outbox).where(pending(), Outbox.created_at < stamp - MAX_AGE)
                              .values(attempts=MAX_ATTEMPTS, error='expired')
                              .execution_options(synchronize_session=False))
        await session.commit()
        rows = await pending_rows(session)
        await session.commit()

    sent = 0
    waiting = set()  # orders whose earlier message is not out yet: their later messages wait
    for row in rows:
        if stopping is not None and stopping.is_set():
            break
        if row.order_id in waiting:
            continue
        if not is_due(row, stamp):
            waiting.add(row.order_id)
            continue
        async with db.tenant(business.schema_name) as session:
            outcome = await send_one(session, bot, business, row.id)
        if outcome == SENT:
            sent += 1
            if sent >= BATCH:
                break
        elif outcome != GAVE_UP:  # failed for now, or another service is sending it
            waiting.add(row.order_id)
    return sent
