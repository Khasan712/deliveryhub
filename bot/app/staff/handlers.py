"""Telegram updates → actions: everything a staff member does in the staff bot.

The runtime feeds every update with `db` (the database) and `business` (whose bot it is); the handlers work in
that business's schema. The business's branches are read for every update (branches.load_setup)."""
import logging
from html import escape

from aiogram import Bot, Dispatcher, F, Router
from aiogram.dispatcher.middlewares.base import BaseMiddleware
from aiogram.enums import ChatType
from aiogram.exceptions import TelegramAPIError
from aiogram.filters import or_f
from aiogram.types import CallbackQuery, Message

from app.ai import understanding as voice
from app.branches import load_setup
from app.orders import NEW, ORDERED, OrderError, load_order
from app.telegram import api
from app.telegram.filters import CallbackKind, PlainText, TextCommand, TextIs
from . import cards, service
from .texts import LANGUAGES, language_of, t, variants

logger = logging.getLogger('staff')

MAX_VOICE_SECONDS = 120
MAX_AUDIO_BYTES = 10 * 1024 * 1024
VOICE_ERRORS = {
    'not_configured': 'voice_not_configured',
    'transcription_failed': 'voice_failed',
    'empty_transcript': 'voice_failed',
}
DETAIL_FIELDS = ('customer_name', 'phone', 'address', 'comment')


def message_id_of(query: CallbackQuery):
    return query.message.message_id if query.message else None


class StaffMiddleware(BaseMiddleware):
    """Only linked staff whose admin-panel user is active get further; strangers are told how to connect.
    Passes `staff` to the handler and notes the visit (it also clears `blocked_at`)."""

    async def __call__(self, handler, event, data):
        bot, db, business = data['bot'], data['db'], data['business']
        sender = event.from_user
        async with db.tenant(business.schema_name) as session:
            staff = await service.find_staff(session, sender.id if sender else None)
            if staff:
                await service.mark_seen(session, staff, sender)
                await session.commit()
        if staff is None:
            lang = language_of(sender)
            if isinstance(event, CallbackQuery):
                return await api.answer(bot, event.id, t(lang, 'not_linked_short'), alert=True)
            return await api.send(bot, event.chat.id, t(lang, 'not_linked'))
        data['staff'] = staff
        return await handler(event, data)


# ---------------------------------------------------------------------------
# messages
# ---------------------------------------------------------------------------

async def join(message: Message, bot: Bot, db, business, argument: str):
    """/start inv_<token> — the invite link from the admin panel."""
    sender = message.from_user
    lang = language_of(sender)
    async with db.tenant(business.schema_name) as session:
        staff = await service.redeem_invite(session, argument[4:], sender, lang)
    if not staff:
        return await api.send(bot, message.chat.id, t(lang, 'invite_invalid'))
    name = staff.user_first_name or sender.first_name or staff.user_phone
    await api.send(bot, staff.telegram_id, t(staff.lang, 'linked', name=escape(name), shop=escape(business.name)))
    await send_welcome(bot, staff)


async def send_welcome(bot, staff):
    await api.send(bot, staff.telegram_id, t(staff.lang, 'welcome'), cards.main_keyboard(staff.lang))


async def on_start(message: Message, bot: Bot, staff):
    await send_welcome(bot, staff)


async def on_language_command(message: Message, bot: Bot, staff):
    await api.send(bot, staff.telegram_id, t(staff.lang, 'lang_choose'), cards.language_keyboard())


async def load_today(db, business, staff):
    """Today's orders the staff member sees (branch staff: their branch's) with what renders them."""
    async with db.tenant(business.schema_name) as session:
        setup = await load_setup(session, business.id)
        viewer = service.viewer_of(staff, setup)
        orders, tickets = await service.todays_orders(session, viewer)
    return orders, tickets, staff.lang, setup, viewer


async def on_today(message: Message, bot: Bot, db, business, staff):
    await api.send(bot, staff.telegram_id, *cards.today_list(*await load_today(db, business, staff)))


async def on_stats(message: Message, bot: Bot, db, business, staff):
    await api.send(bot, staff.telegram_id, cards.today_stats(*await load_today(db, business, staff)))


async def on_voice(message: Message, bot: Bot, db, business, staff):
    await take_order(bot, db, business, staff, message, audio=message.voice or message.audio)


async def on_text(message: Message, bot: Bot, db, business, staff, text: str):
    await take_order(bot, db, business, staff, message, text=text)


async def on_other(message: Message, bot: Bot, staff):
    await api.send(bot, staff.telegram_id, t(staff.lang, 'hint'))


async def take_order(bot, db, business, staff, message, text=None, audio=None):
    """Voice or text → the draft card (a new utterance changes the current draft)."""
    chat_id, lang, schema = staff.telegram_id, staff.lang, business.schema_name
    if audio:
        if (audio.duration or 0) > MAX_VOICE_SECONDS:
            return await api.send(bot, chat_id, t(lang, 'voice_too_long'), reply_to=message.message_id)
        if not voice.is_configured():
            return await api.send(bot, chat_id, t(lang, 'voice_not_configured'), reply_to=message.message_id)

    card_id = (await api.send(bot, chat_id, t(lang, 'listening' if audio else 'thinking'),
                              reply_to=message.message_id)).message_id
    async with db.tenant(schema) as session:
        draft = await service.current_draft(session, bot, staff)
        catalog = await service.load_catalog(session)
    try:
        audio_bytes = await api.download(bot, audio.file_id, MAX_AUDIO_BYTES) if audio else None
        result, _engine = await voice.understand(
            catalog, draft.state if draft else {}, text=text, audio=audio_bytes,
            mime_type=(audio.mime_type or 'audio/ogg') if audio else None, lang=lang,
        )
    except api.DownloadError as exc:
        logger.warning('Voice download failed: %s', exc)
        return await api.edit(bot, chat_id, card_id, t(lang, 'voice_failed'))
    except voice.VoiceError as exc:
        return await api.edit(bot, chat_id, card_id, t(lang, VOICE_ERRORS.get(exc.code, 'ai_failed')))

    state = voice.clean_state(result)
    if not draft and not state['items'] and not any(state[field] for field in DETAIL_FIELDS):
        heard = escape((result.get('transcript') or text or '')[:300])
        return await api.edit(bot, chat_id, card_id, t(lang, 'nothing_found', heard=heard))

    async with db.tenant(schema) as session:
        draft = await service.save_draft(session, bot, staff, draft, state, result, card_id)
        products = await service.products_by_id(session, [item['product_id'] for item in state['items']])
    if result.get('submit') and state['items']:
        return await confirm(bot, db, business, staff, draft)  # the operator said "tasdiqla" / "подтверди"
    await api.edit(bot, chat_id, card_id, *cards.draft_card(draft, products, lang))


async def confirm(bot, db, business, staff, draft, callback_id=None):
    """The draft becomes an order: its card turns into the order card and the rest of the team gets the order
    (with branches on: the head office, and the staff of its branch if it got one — service.draft_branch)."""
    lang, schema = staff.lang, business.schema_name
    async with db.tenant(schema) as session:
        setup = await load_setup(session, business.id)
        try:
            order_id = await service.create_order_from_draft(session, staff, draft.id, setup)
        except OrderError:
            order_id = None
        if order_id:
            order = await load_order(session, order_id)
            ticket = await service.load_ticket(session, order_id)
    if order_id is None:
        if callback_id:
            await api.answer(bot, callback_id, t(lang, 'draft_empty'), alert=True)
        return

    card = cards.order_card(order, ticket, lang, setup=setup, viewer=service.viewer_of(staff, setup))
    try:
        await api.edit(bot, staff.telegram_id, draft.message_id, *card)
        edited = True
    except TelegramAPIError as exc:
        logger.warning('Order #%s: the draft card could not become the order card: %s', order_id, api.describe(exc))
        edited = False
    async with db.tenant(schema) as session:
        if edited:
            await service.remember_card(session, ticket.id, staff.telegram_id, draft.message_id)
        if callback_id:
            await api.answer(bot, callback_id, t(lang, 'created_toast', id=order_id))
        if order.status in cards.ACTIVE_STATUSES:
            try:
                links = await service.staff_seeing(session, setup, order.id)
                await service.push_order(session, bot, schema, order, ticket, links, setup)
            except api.Backoff as exc:  # accepted by its author already: it is not pushed again later
                logger.warning('Order #%s: not every staff chat got the card: %s', order_id, exc)


# ---------------------------------------------------------------------------
# buttons
# ---------------------------------------------------------------------------

async def on_draft_button(query: CallbackQuery, bot: Bot, db, business, staff, rest: str):
    lang, message_id = staff.lang, message_id_of(query)
    async with db.tenant(business.schema_name) as session:
        draft = await service.staff_draft(session, staff)
        if draft and message_id and draft.message_id == message_id and rest == 'discard':
            await service.discard_draft(session, draft)
    if not draft or not message_id or draft.message_id != message_id:
        await api.answer(bot, query.id, t(lang, 'card_outdated'))
        if message_id:
            await api.clear_buttons(bot, staff.telegram_id, message_id)
        return
    if rest == 'confirm':
        return await confirm(bot, db, business, staff, draft, query.id)
    if rest == 'discard':
        await api.edit(bot, staff.telegram_id, message_id, t(lang, 'draft_discarded'))
    await api.answer(bot, query.id)


def is_id(value):
    return value.isdigit() and len(value) < 19


async def on_order_button(query: CallbackQuery, bot: Bot, db, business, staff, rest: str):
    """order:<id>:<action>[:<branch id>]. Branch staff act only on their branch's orders; only the head office sends
    orders to branches."""
    lang, chat_id, message_id = staff.lang, staff.telegram_id, message_id_of(query)
    schema = business.schema_name
    order_ref, _, action = rest.partition(':')
    action, _, argument = action.partition(':')
    async with db.tenant(schema) as session:
        order = await load_order(session, int(order_ref)) if is_id(order_ref) else None
        ticket = await service.load_ticket(session, order.id) if order else None
        setup = await load_setup(session, business.id)
    if not order or order.status == NEW:
        return await api.answer(bot, query.id, t(lang, 'order_not_found'), alert=True)
    viewer = service.viewer_of(staff, setup)

    async def show(**options):
        """This copy of the card, as the order is now."""
        if message_id:
            await api.edit(bot, chat_id, message_id,
                           *cards.order_card(order, ticket, lang, setup=setup, viewer=viewer, **options))

    if not viewer.may_act(order):  # another branch's order (sent elsewhere meanwhile)
        await api.answer(bot, query.id, t(lang, 'not_your_branch'), alert=True)
        if action != 'open':  # (pressed in today's list, not on a card)
            await show()
        return

    if action == 'open':
        async with db.tenant(schema) as session:
            ticket = await service.ensure_ticket(session, order)
            await service.send_card(session, bot, chat_id, order, ticket, lang, setup, viewer)
        return await api.answer(bot, query.id)

    if action in ('ask_reject', 'back'):
        asking = action == 'ask_reject'
        await show(confirm_reject=asking)
        return await api.answer(bot, query.id, t(lang, 'confirm_reject') if asking else None)
    if action in ('ask_move', 'to', 'mv'):
        refusal = branch_refusal(order, setup, viewer, action)
        if refusal:
            await api.answer(bot, query.id, t(lang, refusal), alert=True)
            return await show()
        if action == 'ask_move':
            await show(choose_branch=True)
            return await api.answer(bot, query.id, t(lang, 'choose_branch'))
        if is_id(argument):
            return await send_to_branch(query, bot, db, business, staff, order, int(argument), move=action == 'mv')
        return await api.answer(bot, query.id)
    if action not in service.TRANSITIONS:
        return await api.answer(bot, query.id)
    if not service.may_apply(action, order, viewer, setup):  # waits for a branch: only «Rad etish» before that
        await api.answer(bot, query.id, t(lang, 'choose_branch_first'), alert=True)
        return await show()

    async with db.tenant(schema) as session:
        event = await service.apply_action(session, order.id, action, staff.user_id, viewer, setup)
    await api.answer(bot, query.id, t(lang, 'saved') if event else t(lang, 'already_changed'), alert=not event)
    await refresh_all(bot, db, business, setup, chat_id, message_id, order.id)


def branch_refusal(order, setup, viewer, action):
    """Why the staff member may not send the order to a branch now (a text key), or None."""
    if not setup.enabled:
        return 'branches_off'
    if viewer.branch_staff:
        return 'head_office_only'
    if order.status != ORDERED or (action == 'ask_move' and (order.branch_id is None or not setup.dispatch)):
        return 'already_changed'
    return None


async def send_to_branch(query, bot, db, business, staff, order, branch_id, move):
    """A branch button: the order goes to that branch (service.send_to_branch); every copy of its card shows it and
    the branch's staff get it."""
    lang, schema = staff.lang, business.schema_name
    async with db.tenant(schema) as session:
        result = await service.send_to_branch(session, order.id, branch_id, staff.user_id, move=move)
        setup = await load_setup(session, business.id)
        order = await load_order(session, order.id)
        ticket = await service.load_ticket(session, order.id)
    if order is None:
        return await api.answer(bot, query.id, t(lang, 'order_not_found'), alert=True)
    if result == service.SENT:
        await api.answer(bot, query.id, t(lang, 'branch_sent', name=setup.name(branch_id)))
    else:
        key = {service.TAKEN: 'branch_taken', service.INACTIVE: 'branch_inactive'}.get(result, 'already_changed')
        await api.answer(bot, query.id, t(lang, key, name=setup.name(order.branch_id)), alert=True)
    await refresh_all(bot, db, business, setup, staff.telegram_id, message_id_of(query), order.id)
    if result == service.SENT and ticket:
        async with db.tenant(schema) as session:
            try:
                await service.push_due(session, bot, schema, order, ticket, setup)
            except api.Backoff as exc:  # the next rounds try again (push_new_orders)
                logger.warning('Order #%s: not every staff chat of the branch got the card: %s', order.id, exc)


async def refresh_all(bot, db, business, setup, chat_id, message_id, order_id):
    """Every copy of the order card shows the order as it is now — the pressed one too (remembered as a copy)."""
    async with db.tenant(business.schema_name) as session:
        ticket = await service.load_ticket(session, order_id)
        if ticket:
            if message_id:
                await service.remember_card(session, ticket.id, chat_id, message_id)
            try:
                await service.refresh_cards(session, bot, order_id, setup)
            except api.Backoff as exc:
                logger.warning('Order #%s: card copies not refreshed: %s', order_id, exc)


async def on_language(query: CallbackQuery, bot: Bot, db, business, staff, rest: str):
    lang, message_id = rest, message_id_of(query)
    if lang not in LANGUAGES:
        return await api.answer(bot, query.id)
    async with db.tenant(business.schema_name) as session:
        await service.set_language(session, staff, lang)
    if message_id:
        await api.edit(bot, staff.telegram_id, message_id, t(lang, 'lang_saved'))
    await api.answer(bot, query.id)
    await send_welcome(bot, staff)  # the reply keyboard labels change with the language


async def on_today_button(query: CallbackQuery, bot: Bot, db, business, staff):
    message_id = message_id_of(query)
    if message_id:
        await api.edit(bot, staff.telegram_id, message_id, *cards.today_list(*await load_today(db, business, staff)))
    await api.answer(bot, query.id)


async def on_other_button(query: CallbackQuery, bot: Bot):
    await api.answer(bot, query.id)


def build_dispatcher():
    """The staff bot: an invite link works for anyone; everything else only for linked staff."""
    root = Router(name='staff')
    root.message.filter(F.chat.type == ChatType.PRIVATE, F.from_user)  # staff use the bot in private chats only
    root.message.register(join, TextCommand('start', prefix='inv_'))

    linked = Router(name='staff-linked')
    linked.message.middleware(StaffMiddleware())
    linked.callback_query.middleware(StaffMiddleware())
    linked.message.register(on_start, TextCommand('start', 'help'))
    linked.message.register(on_language_command, TextCommand('lang', 'til'))
    linked.message.register(on_today, or_f(TextCommand('today'), TextIs(variants('btn_today'))))
    linked.message.register(on_stats, or_f(TextCommand('stats'), TextIs(variants('btn_stats'))))
    linked.message.register(on_voice, or_f(F.voice, F.audio))
    linked.message.register(on_text, PlainText())
    linked.message.register(on_other)
    linked.callback_query.register(on_draft_button, CallbackKind('draft'))
    linked.callback_query.register(on_order_button, CallbackKind('order'))
    linked.callback_query.register(on_language, CallbackKind('lang'))
    linked.callback_query.register(on_today_button, CallbackKind('today'))
    linked.callback_query.register(on_other_button)
    root.include_router(linked)

    dispatcher = Dispatcher(name='staff', disable_fsm=True)  # drafts live in the database
    dispatcher.include_router(root)
    return dispatcher
