"""Staff bot business logic: invites, drafts → orders, order status buttons, order cards in staff chats.

Every function works in the schema of one business (a `db.tenant(schema)` session). Database work is committed
before Telegram is asked anything, so no row stays locked while a chat is being updated (a new order card goes out
under an advisory lock of its ticket instead, see push_order)."""
import hashlib
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import BigInteger, and_, delete, func, literal, or_, select, update
from sqlalchemy.dialects.postgresql import insert

from app.customer.texts import STATUS_EVENTS
from app.db.models import (
    Client, Descriptions, Draft, Order, OrderCard, OrderTicket, Outbox, Product, StaffInvite, StaffLink, User,
)
from app.orders import (
    COMPLETED, DELIVERY, NEW, ON_THE_WAY, ORDERED, REJECTED, SOURCE_ADMIN, OrderError, create_order, load_order,
    load_orders, resolve_items,
)
from app.telegram import api
from app.utils import day_range, localdate, normalize_phone, now, parse_price
from . import cards

logger = logging.getLogger('staff')

DRAFT_TTL = timedelta(minutes=30)
# Customer orders older than this are not pushed when the service starts after a pause.
PUSH_WINDOW = timedelta(hours=3)
# A card that did not reach a staff chat (Telegram trouble) is sent again for this long after the order was taken
# — while nobody has accepted the order and it is still `ordered`.
REPUSH_WINDOW = timedelta(minutes=15)
PUSH_BATCH = 20
SYNC_WINDOW = timedelta(days=2)
SYNC_BATCH = 50
# Every update of a staff member passes mark_seen: an unchanged link is written at most this often.
SEEN_EVERY = timedelta(minutes=1)
DRAFT_STATUSES = (ORDERED, ON_THE_WAY, COMPLETED)

# action → (allowed current statuses, new status or None, event for the customer)
TRANSITIONS = {
    'accept': ((ORDERED,), None, 'accepted'),
    'on_the_way': ((ORDERED,), ON_THE_WAY, 'on_the_way'),
    'done': ((ORDERED, ON_THE_WAY), COMPLETED, 'completed'),
    'reject': ((ORDERED, ON_THE_WAY), REJECTED, 'rejected'),
}


def hash_token(token):
    return hashlib.sha256(token.encode()).hexdigest()


# ---------------------------------------------------------------------------
# staff
# ---------------------------------------------------------------------------

@dataclass
class Staff:
    """A linked staff member: their StaffLink and the admin-panel user behind it."""
    id: int
    telegram_id: int
    user_id: int
    lang: str
    user_first_name: str | None
    user_phone: str
    # The link as stored, for mark_seen.
    first_name: str = ''
    username: str = ''
    last_seen_at: datetime | None = None
    blocked: bool = False


def _staff(link, user):
    return Staff(id=link.id, telegram_id=link.telegram_id, user_id=user.id, lang=link.lang,
                 user_first_name=user.first_name, user_phone=user.phone_number, first_name=link.first_name,
                 username=link.username, last_seen_at=link.last_seen_at, blocked=link.blocked_at is not None)


async def find_staff(session, telegram_id):
    """The staff member behind a Telegram account, if their user is still active."""
    if not telegram_id:
        return None
    row = (await session.execute(
        select(StaffLink, User).join(User, User.id == StaffLink.user_id).where(StaffLink.telegram_id == telegram_id)
    )).first()
    if row and row[1].is_active and not row[1].is_deleted:
        return _staff(*row)
    return None


async def mark_seen(session, staff, sender):
    """Notes the visit and clears blocked_at — skipped when nothing but the time would change and the last visit
    is less than SEEN_EVERY ago."""
    stamp = now()
    values = {'last_seen_at': stamp, 'blocked_at': None, 'username': (sender.username or '')[:100]}
    if sender.first_name:
        values['first_name'] = sender.first_name[:150]
    unchanged = (not staff.blocked and values['username'] == staff.username
                 and values.get('first_name', staff.first_name) == staff.first_name)
    if unchanged and staff.last_seen_at and stamp - staff.last_seen_at < SEEN_EVERY:
        return
    await session.execute(update(StaffLink).where(StaffLink.id == staff.id).values(**values))


async def redeem_invite(session, token, sender, lang):
    """Connects the Telegram account to the invited user (committed). Returns the Staff or None."""
    stamp = now()
    row = (await session.execute(
        select(StaffInvite, User).join(User, User.id == StaffInvite.user_id)
        .where(StaffInvite.token_hash == hash_token(token), StaffInvite.used_at.is_(None),
               StaffInvite.expires_at > stamp)
        .with_for_update(of=StaffInvite)
    )).first()
    if not row or not row[1].is_active or row[1].is_deleted:
        await session.rollback()
        return None
    invite, user = row
    statement = insert(StaffLink).values(
        telegram_id=sender.id, user_id=user.id, first_name=(sender.first_name or '')[:150],
        username=(sender.username or '')[:100], lang=lang, notify_orders=True, blocked_at=None,
        created_at=stamp, last_seen_at=stamp,
    )
    # An account linked before keeps its language; it now belongs to the invited user.
    statement = statement.on_conflict_do_update(index_elements=[StaffLink.telegram_id], set_={
        'user_id': user.id, 'first_name': statement.excluded.first_name, 'username': statement.excluded.username,
        'blocked_at': None, 'last_seen_at': stamp,
    }).returning(StaffLink)
    link = (await session.execute(statement, execution_options={'populate_existing': True})).scalar_one()
    await session.execute(delete(Draft).where(Draft.staff_id == link.id))
    invite.used_at = stamp
    await session.commit()
    return _staff(link, user)


async def set_language(session, staff, lang):
    await session.execute(update(StaffLink).where(StaffLink.id == staff.id).values(lang=lang))
    await session.commit()
    staff.lang = lang


def _notified():
    """Who gets the cards of new orders (StaffLink joined with its User): notifications on, the bot not blocked,
    the user active."""
    return and_(StaffLink.notify_orders.is_(True), StaffLink.blocked_at.is_(None), User.is_active.is_(True),
                User.is_deleted.is_(False))


async def notified_staff(session, exclude_user_id=None):
    """(id, telegram_id, lang) rows of the staff to tell about a new order."""
    statement = (select(StaffLink.id, StaffLink.telegram_id, StaffLink.lang).join(User, User.id == StaffLink.user_id)
                 .where(_notified()).order_by(StaffLink.id))
    if exclude_user_id is not None:
        statement = statement.where(StaffLink.user_id != exclude_user_id)
    return (await session.execute(statement)).all()


# ---------------------------------------------------------------------------
# drafts
# ---------------------------------------------------------------------------

async def current_draft(session, bot, staff):
    """The staff member's draft, or None. A draft forgotten for DRAFT_TTL is dropped (its card loses the
    buttons), so a new order is not mixed into an old one."""
    draft = await session.scalar(select(Draft).where(Draft.staff_id == staff.id))
    if draft and now() - draft.updated_at > DRAFT_TTL:
        card = draft.message_id
        await session.delete(draft)
        await session.commit()
        if card:
            await api.clear_buttons(bot, staff.telegram_id, card)
        return None
    return draft


async def save_draft(session, bot, staff, draft, state, result, message_id):
    """Stores the understood form as the staff member's draft, shown in the card `message_id` (committed)."""
    previous_card = draft.message_id if draft else None
    statement = insert(Draft).values(
        staff_id=staff.id, state=state, transcript=result.get('transcript') or '',
        unmatched=result.get('unmatched') or [], message_id=message_id, updated_at=now(),
    )
    statement = statement.on_conflict_do_update(index_elements=[Draft.staff_id], set_={
        'state': statement.excluded.state, 'transcript': statement.excluded.transcript,
        'unmatched': statement.excluded.unmatched, 'message_id': statement.excluded.message_id,
        'updated_at': statement.excluded.updated_at,
    }).returning(Draft)
    saved = (await session.execute(statement, execution_options={'populate_existing': True})).scalar_one()
    await session.commit()
    if previous_card and previous_card != message_id:
        await api.delete(bot, staff.telegram_id, previous_card)  # the new card replaces it at the bottom of the chat
    return saved


async def staff_draft(session, staff):
    return await session.scalar(select(Draft).where(Draft.staff_id == staff.id))


async def discard_draft(session, draft):
    await session.execute(delete(Draft).where(Draft.id == draft.id))
    await session.commit()


async def load_catalog(session):
    """The products the AI may choose from (same form as the admin panel's voice entry)."""
    rows = await session.execute(
        select(Product, Descriptions.name_uz).outerjoin(Descriptions, Descriptions.id == Product.measure_id)
        .order_by(Product.category_id, Product.id)
    )
    return [{'id': product.id, 'uz': product.name_uz, 'ru': product.name_ru or product.name_uz,
             'price': parse_price(product.price), 'unit': unit or ''} for product, unit in rows]


async def products_by_id(session, product_ids):
    product_ids = list(dict.fromkeys(product_ids))
    if not product_ids:
        return {}
    return {product.id: product for product in (
        await session.scalars(select(Product).where(Product.id.in_(product_ids)))).all()}


async def create_order_from_draft(session, staff, draft_id):
    """Creates the order with its ticket and drops the draft, in one transaction (committed). Returns the order
    id. Raises OrderError when the draft is gone or has no valid items (nothing changes then)."""
    try:
        draft = await session.scalar(select(Draft).where(Draft.id == draft_id).with_for_update())
        if draft is None:
            raise OrderError('empty')
        state = draft.state or {}
        items = await resolve_items(session, state.get('items') or [])
        delivery_type = cards.draft_delivery_type(state)
        status = state.get('status') if state.get('status') in DRAFT_STATUSES else ORDERED
        raw_phone = (state.get('phone') or '').strip()
        order = await create_order(
            session,
            items=items,
            source=SOURCE_ADMIN,
            status=status,
            client_id=None,
            created_by_id=staff.user_id,
            customer_name=state.get('customer_name'),
            phone=(normalize_phone(raw_phone) or raw_phone) if raw_phone else None,
            address=state.get('address') if delivery_type == DELIVERY else None,
            delivery_type=delivery_type,
            payment_method=state.get('payment_method'),
            comment=state.get('comment'),
        )
    except OrderError:
        await session.rollback()
        raise
    stamp = now()
    session.add(OrderTicket(order_id=order.id, status_seen=order.status, accepted_by_id=staff.user_id,
                            accepted_at=stamp, changed_by_id=staff.user_id, changed_at=stamp, created_at=stamp))
    await session.delete(draft)
    await session.commit()
    return order.id


# ---------------------------------------------------------------------------
# tickets
# ---------------------------------------------------------------------------

async def _people(session, user_ids):
    user_ids = [user_id for user_id in set(user_ids) if user_id]
    if not user_ids:
        return {}
    rows = await session.execute(select(User.id, User.first_name, User.phone_number).where(User.id.in_(user_ids)))
    return {row.id: cards.Person(row.first_name, row.phone_number) for row in rows}


async def _ticket_views(session, tickets):
    people = await _people(session, [user_id for ticket in tickets
                                     for user_id in (ticket.accepted_by_id, ticket.changed_by_id)])
    return {ticket.order_id: cards.TicketView(
        id=ticket.id, order_id=ticket.order_id, status_seen=ticket.status_seen,
        accepted_at=ticket.accepted_at, accepted_by=people.get(ticket.accepted_by_id),
        changed_at=ticket.changed_at, changed_by=people.get(ticket.changed_by_id),
    ) for ticket in tickets}


async def load_tickets(session, order_ids):
    order_ids = list(order_ids)
    if not order_ids:
        return {}
    tickets = (await session.scalars(select(OrderTicket).where(OrderTicket.order_id.in_(order_ids)))).all()
    return await _ticket_views(session, tickets)


async def load_ticket(session, order_id):
    return (await load_tickets(session, [order_id])).get(order_id)


async def ensure_ticket(session, order):
    """The order's ticket, created when there is none yet (committed)."""
    await session.execute(
        insert(OrderTicket).values(order_id=order.id, status_seen=order.status, created_at=now())
        .on_conflict_do_nothing(index_elements=[OrderTicket.order_id])
    )
    await session.commit()
    return await load_ticket(session, order.id)


# ---------------------------------------------------------------------------
# order status
# ---------------------------------------------------------------------------

async def queue_status_message(session, order, event):
    """The customer hears about the change from the customers' bot (the outbox), as after a change in the admin
    panel — only customers who use the bot."""
    if event not in STATUS_EVENTS or not order.client_id:
        return
    tg_id = await session.scalar(select(Client.tg_id).where(Client.id == order.client_id))
    if tg_id:
        session.add(Outbox(kind=Outbox.KIND_ORDER_STATUS, order_id=order.id, event=event, created_at=now(),
                           attempts=0, error=''))


async def apply_action(session, order_id, action, user_id):
    """Applies a status button (committed). Returns the customer event, or None if the order is no longer in a
    state where the action makes sense (someone else was faster)."""
    allowed, new_status, event = TRANSITIONS[action]
    stamp = now()
    order = await session.scalar(select(Order).where(Order.id == order_id).with_for_update())
    if not order or order.status not in allowed:
        await session.rollback()
        return None
    await session.execute(
        insert(OrderTicket).values(order_id=order.id, status_seen=order.status, created_at=stamp)
        .on_conflict_do_nothing(index_elements=[OrderTicket.order_id])
    )
    ticket = await session.scalar(select(OrderTicket).where(OrderTicket.order_id == order.id).with_for_update())
    if action == 'accept' and ticket.accepted_at:
        await session.rollback()
        return None
    if new_status:
        order.status = new_status
        order.updated_at = stamp
    if not ticket.accepted_at:
        ticket.accepted_by_id, ticket.accepted_at = user_id, stamp
    ticket.changed_by_id, ticket.changed_at = user_id, stamp
    ticket.status_seen = order.status
    await queue_status_message(session, order, event)
    await session.commit()
    return event


# ---------------------------------------------------------------------------
# cards in staff chats
# ---------------------------------------------------------------------------

async def remember_card(session, ticket_id, chat_id, message_id):
    await session.execute(
        insert(OrderCard).values(ticket_id=ticket_id, chat_id=chat_id, message_id=message_id, created_at=now())
        .on_conflict_do_nothing(index_elements=[OrderCard.chat_id, OrderCard.message_id])
    )
    await session.commit()


async def send_card(session, bot, chat_id, order, ticket, lang):
    text, markup = cards.order_card(order, ticket, lang)
    message = await api.send(bot, chat_id, text, markup)
    await remember_card(session, ticket.id, chat_id, message.message_id)
    return message


def _push_lock(schema, ticket_id):
    """Selects True when this transaction got the advisory lock under which the ticket's new-order cards are sent,
    so that two services (an old and a new container during a deploy) never send a chat the same order twice.
    adminbot_ordercard has no unique (ticket_id, chat_id) to lean on — a chat may hold more copies of a card, e.g.
    one opened from today's list. The key is a stable hash (the same in every process) of the schema and ticket."""
    digest = hashlib.sha256(f'adminbot.push:{schema}:{ticket_id}'.encode()).digest()
    return select(func.pg_try_advisory_xact_lock(literal(int.from_bytes(digest[:8], 'big', signed=True), BigInteger)))


async def push_order(session, bot, schema, order, ticket, exclude_user_id=None):
    """Sends the order card to every staff member who gets notifications and has no card of it yet. A chat counts
    as told once its card is stored: each card goes out in a transaction of its own that holds the ticket's push
    lock, checks the chat has no card and stores the new one. Raises api.Backoff on Telegram trouble — whoever is
    left is told in a later round (push_new_orders)."""
    links = await notified_staff(session, exclude_user_id)
    await session.commit()
    # Each transaction below ends with a commit (which releases the lock) even when it wrote nothing: a rollback
    # would expire the loaded order.
    for link in links:
        if not await session.scalar(_push_lock(schema, ticket.id)):
            await session.commit()
            return  # another service is sending this order's cards right now
        if await session.scalar(select(OrderCard.id).where(OrderCard.ticket_id == ticket.id,
                                                           OrderCard.chat_id == link.telegram_id).limit(1)):
            await session.commit()
            continue
        try:
            await send_card(session, bot, link.telegram_id, order, ticket, link.lang)  # stores the card, commits
        except api.ERRORS as exc:
            await session.commit()
            if api.is_retryable(exc):
                raise api.Backoff(exc) from None
            if api.is_blocked(exc):
                await session.execute(update(StaffLink).where(StaffLink.id == link.id).values(blocked_at=now()))
                await session.commit()
            else:
                logger.warning('Order #%s card to %s failed: %s', order.id, link.telegram_id, api.describe(exc))


async def refresh_cards(session, bot, order_id):
    """Re-renders every copy of the order card (status, who accepted, buttons); copies deleted in the chat are
    forgotten. Raises api.Backoff on Telegram trouble: the copies not edited yet keep their old text."""
    order = await load_order(session, order_id)
    ticket = await load_ticket(session, order_id)
    if order is None or ticket is None:
        await session.commit()
        return
    card_rows = (await session.scalars(
        select(OrderCard).where(OrderCard.ticket_id == ticket.id).order_by(OrderCard.id))).all()
    chat_ids = {card.chat_id for card in card_rows}
    languages = dict((await session.execute(
        select(StaffLink.telegram_id, StaffLink.lang).where(StaffLink.telegram_id.in_(chat_ids))
    )).all()) if chat_ids else {}
    await session.commit()

    gone, trouble = [], None
    for card in card_rows:
        text, markup = cards.order_card(order, ticket, languages.get(card.chat_id, 'uz'))
        try:
            await api.edit(bot, card.chat_id, card.message_id, text, markup)
        except api.ERRORS as exc:
            if api.is_retryable(exc):
                trouble = exc
                break
            if api.is_blocked(exc) or 'not found' in exc.message:
                gone.append(card.id)
            else:
                logger.warning('Order #%s card refresh failed: %s', order.id, api.describe(exc))
    if gone:
        await session.execute(delete(OrderCard).where(OrderCard.id.in_(gone)))
        await session.commit()
    if trouble:
        raise api.Backoff(trouble)


def _is_ordered():
    """`status = 'ordered'` with the value written into the SQL, not bound as a parameter: only then may every
    execution of the prepared statement (generic plans too) use the partial index app_order_ordered_idx
    (updated_at) WHERE status = 'ordered'."""
    return Order.status == literal(ORDERED, literal_execute=True)


def _untold_tickets(stamp):
    """Taken orders whose card has not reached every staff chat that should get it — new tickets, or cards that
    failed — while the order is young, unaccepted and still `ordered`."""
    # Correlated two levels up (to the ticket) and one up (to the staff member): named explicitly.
    told = (
        select(OrderCard.id).where(OrderCard.ticket_id == OrderTicket.id, OrderCard.chat_id == StaffLink.telegram_id)
        .correlate(OrderTicket, StaffLink).exists()
    )
    untold_staff = (
        select(StaffLink.id).join(User, User.id == StaffLink.user_id)
        .where(_notified(), or_(Order.created_by_id.is_(None), StaffLink.user_id != Order.created_by_id), ~told)
        .exists()
    )
    return (
        select(OrderTicket.id, OrderTicket.order_id).join(Order, Order.id == OrderTicket.order_id)
        .where(OrderTicket.created_at >= stamp - REPUSH_WINDOW, OrderTicket.accepted_at.is_(None), _is_ordered(),
               Order.updated_at >= stamp - PUSH_WINDOW, untold_staff)
        .order_by(OrderTicket.id).limit(PUSH_BATCH)
    )


async def push_new_orders(db, business, bot, stopping=None):
    """New orders from customers (shop, Mini App, customers' bot) and from the admin panel → staff chats (the
    author of an order is not told about it). A ticket marks the order as taken; a chat counts as told once its
    card is stored, so a card that did not go out (Telegram trouble) is sent in a later round — at least once, never
    twice (push_order). Stops between two orders once `stopping` is set; raises api.Backoff on Telegram trouble."""
    schema = business.schema_name
    async with db.tenant(schema) as session:
        stamp = now()
        new_ids = (await session.scalars(
            select(Order.id).outerjoin(OrderTicket, OrderTicket.order_id == Order.id)
            .where(_is_ordered(), OrderTicket.id.is_(None), Order.updated_at >= stamp - PUSH_WINDOW)
            .order_by(Order.id).limit(PUSH_BATCH)
        )).all()
        if new_ids:
            await session.execute(
                insert(OrderTicket).values([{'order_id': order_id, 'status_seen': ORDERED, 'created_at': stamp}
                                            for order_id in new_ids])
                .on_conflict_do_nothing(index_elements=[OrderTicket.order_id])
            )
        await session.commit()
        rows = (await session.execute(_untold_tickets(stamp))).all()
        await session.commit()
        with api.no_flood_wait():
            for _ticket_id, order_id in rows:
                if stopping is not None and stopping.is_set():
                    return
                order = await load_order(session, order_id)
                ticket = await load_ticket(session, order_id)
                await session.commit()
                if order is not None and ticket is not None:
                    await push_order(session, bot, schema, order, ticket, exclude_user_id=order.created_by_id)


async def sync_changed_orders(db, business, bot, stopping=None):
    """Status changed elsewhere (admin panel, shop) → every copy of the order card. The ticket takes the new status
    (`status_seen`) only after the copies were edited, so a refresh that Telegram cut short is repeated in a later
    round. Stops between two orders once `stopping` is set; raises api.Backoff on Telegram trouble."""
    async with db.tenant(business.schema_name) as session:
        since = now() - SYNC_WINDOW
        rows = (await session.execute(
            select(OrderTicket.id, OrderTicket.order_id, OrderTicket.status_seen, Order.status, Order.updated_at)
            .join(Order, Order.id == OrderTicket.order_id)
            .where(OrderTicket.created_at >= since, OrderTicket.status_seen != Order.status)
            .order_by(OrderTicket.id).limit(SYNC_BATCH)
        )).all()
        await session.commit()
        with api.no_flood_wait():
            for row in rows:
                if stopping is not None and stopping.is_set():
                    return
                unchanged = and_(OrderTicket.id == row.id, OrderTicket.status_seen == row.status_seen)
                # The change was not made in the bot, so do not credit the last bot user with it.
                result = await session.execute(
                    update(OrderTicket).where(unchanged).values(changed_by_id=None, changed_at=row.updated_at)
                    .execution_options(synchronize_session=False)
                )
                await session.commit()
                if not result.rowcount:
                    continue  # changed in the bot meanwhile, which refreshed the cards itself
                await refresh_cards(session, bot, row.order_id)
                await session.execute(update(OrderTicket).where(unchanged).values(status_seen=row.status)
                                      .execution_options(synchronize_session=False))
                await session.commit()


# ---------------------------------------------------------------------------
# today
# ---------------------------------------------------------------------------

async def todays_orders(session):
    """Today's orders (local day, without unfinished carts), newest first, and their tickets."""
    start, end = day_range(localdate())
    order_ids = (await session.scalars(
        select(Order.id).where(Order.created_at >= start, Order.created_at < end, Order.status != NEW)
        .order_by(Order.created_at.desc(), Order.id.desc())
    )).all()
    views = await load_orders(session, order_ids)
    tickets = await load_tickets(session, order_ids)
    await session.commit()
    return [views[order_id] for order_id in order_ids], tickets
