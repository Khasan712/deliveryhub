"""The staff bot: invites, voice / text orders, customer orders in staff chats, status buttons, today."""
import secrets
from datetime import timedelta
from types import SimpleNamespace

import pytest
from sqlalchemy import update

from app.ai import understanding
from app.db.models import Draft, Order, OrderCard, OrderItem, OrderTicket, Outbox, Product, StaffInvite, StaffLink, User
from app.staff import service
from app.utils import now
from .fakes import ApiFailure, NetworkFailure, callback, message, voice

OPERATOR = 5001
COURIER = 5002


@pytest.fixture
async def team(shop):
    unit = await shop.unit()
    admin = await shop.user('+998900000101', 'Xasan')
    courier_user = await shop.user('+998900000102', 'Bobur', role='manager')
    return SimpleNamespace(
        burger=await shop.product('Chizburger', 'Чизбургер', '35 000', unit),
        cola=await shop.product('Kola', 'Кола', '12 000', unit),
        admin=admin,
        courier_user=courier_user,
        operator=await shop.link(OPERATOR, admin, 'Xasan'),
        courier=await shop.link(COURIER, courier_user, 'Bobur'),
    )


async def customer_order(shop, team, tg_id='777', **fields):
    client = await shop.client(tg_id=tg_id, lang='ru')
    return await shop.order([(team.burger, 2)], client=client, **fields)


async def invite(shop, user, created_by=None, expires_in=timedelta(hours=24)):
    """What the admin panel does: only the hash of the token is stored."""
    token = secrets.token_urlsafe(18)
    row = await shop.add(StaffInvite(token_hash=service.hash_token(token), user_id=user.id,
                                     created_by_id=created_by.id if created_by else None,
                                     expires_at=now() + expires_in))
    return token, row


def understood(items, **fields):
    result = {
        'customer_name': '', 'phone': '', 'address': '', 'delivery_type': '', 'payment_method': '', 'status': '',
        'comment': '', 'unmatched': [], 'submit': False, 'reply': '', 'transcript': 'ikkita chizburger',
    }
    result.update(fields)
    result['items'] = [{'product_id': product.id, 'quantity': quantity} for product, quantity in items]
    return result, 'gemini'


class FakeUnderstanding:
    def __init__(self, answer):
        self.answer = answer
        self.calls = []

    async def __call__(self, catalog, state, **kwargs):
        self.calls.append(SimpleNamespace(catalog=catalog, state=state, **kwargs))
        if isinstance(self.answer, Exception):
            raise self.answer
        return self.answer


@pytest.fixture
def ai(monkeypatch):
    """Gemini is configured; `ai(answer)` sets what it understands next."""
    monkeypatch.setattr(understanding, 'is_configured', lambda: True)

    def answer(value):
        fake = FakeUnderstanding(value)
        monkeypatch.setattr(understanding, 'understand', fake)
        return fake

    return answer


def recorded_voice(telegram, sender_id, message_id, **fields):
    telegram.add_file(f'file-{message_id}', b'OggS voice')
    return voice(sender_id, message_id, f'file-{message_id}', **fields)


# ---------------------------------------------------------------------------
# linking
# ---------------------------------------------------------------------------

async def test_strangers_are_told_how_to_connect(staff_bot, telegram, shop, team):
    await staff_bot.send(message(9999, '/start'))
    assert 'Telegram bot' in telegram.last('sendMessage', 9999)['text']
    assert await shop.count(StaffLink, StaffLink.telegram_id == 9999) == 0


async def test_invite_link_connects_the_account_once(staff_bot, telegram, shop, team):
    token, row = await invite(shop, team.courier_user, created_by=team.admin)
    assert token not in row.token_hash

    await staff_bot.send(message(7001, f'/start inv_{token}', language_code='ru'))
    link = await shop.one(StaffLink, StaffLink.telegram_id == 7001)
    assert (link.user_id, link.lang, link.notify_orders) == (team.courier_user.id, 'ru', True)
    assert (await shop.one(StaffInvite, StaffInvite.id == row.id)).used_at is not None
    linked, welcome = telegram.payloads('sendMessage', 7001)
    assert 'Bobur' in linked['text'] and '«Test Shop»' in linked['text']
    assert welcome['reply_markup']['keyboard'][0][0]['text'] == '📋 Заказы сегодня'  # the two main buttons

    await staff_bot.send(message(7002, f'/start inv_{token}'))
    assert '❌' in telegram.last('sendMessage', 7002)['text']
    assert await shop.count(StaffLink, StaffLink.telegram_id == 7002) == 0


async def test_each_invite_works_until_it_expires(staff_bot, shop, team):
    first, _ = await invite(shop, team.courier_user)
    second, row = await invite(shop, team.courier_user)
    await staff_bot.send(message(7003, f'/start inv_{first}'))  # a newer invite does not cancel an older one
    assert await shop.count(StaffLink, StaffLink.telegram_id == 7003) == 1

    await shop.update(update(StaffInvite).where(StaffInvite.id == row.id).values(expires_at=now() - timedelta(minutes=1)))
    await staff_bot.send(message(7004, f'/start inv_{second}'))
    assert await shop.count(StaffLink, StaffLink.telegram_id == 7004) == 0


async def test_relinking_moves_the_account_and_drops_its_draft(staff_bot, shop, team):
    await shop.add(Draft(staff_id=team.operator.id, state={'items': []}, transcript='', unmatched=[]))
    token, _ = await invite(shop, team.courier_user)
    await staff_bot.send(message(OPERATOR, f'/start inv_{token}', language_code='ru'))
    link = await shop.one(StaffLink, StaffLink.telegram_id == OPERATOR)
    assert (link.user_id, link.lang) == (team.courier_user.id, 'uz')  # the language stays
    assert await shop.count(Draft) == 0


async def test_deactivated_users_lose_access(staff_bot, telegram, shop, team):
    await shop.update(update(User).where(User.id == team.courier_user.id).values(is_active=False))
    await staff_bot.send(message(COURIER, 'ikkita chizburger'))
    assert 'Telegram bot' in telegram.last('sendMessage', COURIER)['text']
    assert await shop.count(Draft) == 0


async def test_language_switch(staff_bot, telegram, shop, team):
    await staff_bot.send(message(OPERATOR, '/lang'))
    assert telegram.buttons(telegram.last('sendMessage', OPERATOR)) == ['lang:uz', 'lang:ru']
    await staff_bot.send(callback(OPERATOR, 'lang:ru', 101))
    assert (await shop.one(StaffLink, StaffLink.telegram_id == OPERATOR)).lang == 'ru'
    assert telegram.last('editMessageText', OPERATOR)['text'] == '✅ Язык: русский'
    keyboard = telegram.last('sendMessage', OPERATOR)['reply_markup']['keyboard']
    assert keyboard[0][0]['text'] == '📋 Заказы сегодня'


async def test_messages_mark_the_staff_member_as_seen(staff_bot, shop, team):
    await shop.update(update(StaffLink).where(StaffLink.id == team.operator.id).values(blocked_at=now()))
    await staff_bot.send(message(OPERATOR, '/help'))
    link = await shop.one(StaffLink, StaffLink.telegram_id == OPERATOR)
    assert link.blocked_at is None and link.last_seen_at is not None and link.username == 'ali'


async def test_group_chats_are_ignored(staff_bot, telegram, team):
    await staff_bot.send(message(OPERATOR, '/start', chat_type='group'))
    assert telegram.calls == []


async def test_unknown_commands_get_a_hint(staff_bot, telegram, team):
    await staff_bot.send(message(OPERATOR, '/whatever'))
    assert '🎤' in telegram.last('sendMessage', OPERATOR)['text']


# ---------------------------------------------------------------------------
# voice and text orders
# ---------------------------------------------------------------------------

async def test_a_frozen_product_is_sold_with_a_warning(staff_bot, telegram, shop, team, ai):
    osh = await shop.add(Product(name_uz='Osh', name_ru='Плов', price='45 000', is_frozen=True))
    ai(understood([(osh, 1), (team.burger, 1)]))
    await staff_bot.send(recorded_voice(telegram, OPERATOR, 1))
    card = telegram.last('editMessageText', OPERATOR)['text']
    assert 'Osh ❄️ × 1 — 45 000' in card
    assert '⚠️ Muzlatilgan: Osh — mijozlar hozir buyurtma qila olmaydi, siz baribir sotishingiz mumkin.' in card
    assert 'Chizburger ❄️' not in card

    await staff_bot.send(callback(OPERATOR, 'draft:confirm', (await shop.one(Draft)).message_id))
    assert [item.product_id for item in await shop.all(OrderItem)] == [osh.id, team.burger.id]


async def test_voice_draft_edit_and_confirm(staff_bot, telegram, shop, other_shop, team, ai):
    fake = ai(understood([(team.burger, 2)], customer_name='Aziz', address='Chilonzor 9'))
    await staff_bot.send(recorded_voice(telegram, OPERATOR, 1))
    assert (fake.calls[0].audio, fake.calls[0].mime_type, fake.calls[0].lang) == (b'OggS voice', 'audio/ogg', 'uz')
    assert [item['uz'] for item in fake.calls[0].catalog] == ['Chizburger', 'Kola']
    assert fake.calls[0].catalog[0]['unit'] == 'dona'

    draft = await shop.one(Draft)
    card = telegram.last('editMessageText', OPERATOR)
    assert card['message_id'] == draft.message_id
    assert 'Chizburger × 2 — 70 000' in card['text']
    assert 'Aziz' in card['text']
    assert telegram.buttons(card) == ['draft:confirm', 'draft:discard']

    # A second voice message changes the same draft; the old card is replaced by a new one.
    first_card = draft.message_id
    fake = ai(understood([(team.burger, 2), (team.cola, 1)], customer_name='Aziz', address='Chilonzor 9'))
    await staff_bot.send(recorded_voice(telegram, OPERATOR, 2))
    assert fake.calls[0].state['items'] == [{'product_id': team.burger.id, 'quantity': 2}]
    assert telegram.last('deleteMessage')['message_id'] == first_card
    assert '82 000' in telegram.last('editMessageText', OPERATOR)['text']
    draft = await shop.one(Draft)

    await staff_bot.send(callback(OPERATOR, 'draft:confirm', draft.message_id))
    order = await shop.one(Order)
    assert (order.source, order.status, order.created_by_id, order.delivery_type, order.location, order.customer_name) \
        == ('admin', 'ordered', team.admin.id, 'delivery', 'Chilonzor 9', 'Aziz')
    items = await shop.all(OrderItem)
    assert [(item.product_id, item.quantity, item.price) for item in items] == [
        (team.burger.id, '2', '35 000'), (team.cola.id, '1', '12 000')]
    assert await shop.count(Draft) == 0
    assert await shop.count(Outbox) == 0  # no customer account behind a dictated order
    assert await other_shop.count(Order) == 0  # the business's own schema only

    ticket = await shop.one(OrderTicket)
    assert (ticket.order_id, ticket.accepted_by_id, ticket.status_seen) == (order.id, team.admin.id, 'ordered')
    card = telegram.last('editMessageText', OPERATOR)
    assert card['message_id'] == draft.message_id
    assert f'#{order.id}' in card['text'] and '82 000' in card['text']
    assert telegram.buttons(card) == [f'order:{order.id}:on_the_way', f'order:{order.id}:done',
                                      f'order:{order.id}:ask_reject']
    assert telegram.last('answerCallbackQuery')['text'] == f'✅ #{order.id} yaratildi'
    # The rest of the team sees the new order too.
    assert f'#{order.id}' in telegram.last('sendMessage', COURIER)['text']
    assert await shop.count(OrderCard, OrderCard.ticket_id == ticket.id) == 2


async def test_saying_confirm_creates_the_order_right_away(staff_bot, telegram, shop, team, ai):
    ai(understood([(team.cola, 3)], submit=True))
    await staff_bot.send(recorded_voice(telegram, OPERATOR, 1))
    order = await shop.one(Order)
    assert order.delivery_type == 'pickup'
    assert f'#{order.id}' in telegram.last('editMessageText', OPERATOR)['text']


async def test_a_sale_already_handed_over_is_not_pushed(staff_bot, telegram, shop, team, ai):
    ai(understood([(team.cola, 1)], status='completed', submit=True))
    await staff_bot.send(recorded_voice(telegram, OPERATOR, 1))
    assert (await shop.one(Order)).status == 'completed'
    assert telegram.payloads('sendMessage', COURIER) == []


async def test_discard_and_outdated_cards(staff_bot, telegram, shop, team, ai):
    ai(understood([(team.burger, 1)]))
    await staff_bot.send(recorded_voice(telegram, OPERATOR, 1))
    draft = await shop.one(Draft)
    await staff_bot.send(callback(OPERATOR, 'draft:confirm', draft.message_id - 50))
    assert telegram.last('answerCallbackQuery')['text'] == 'Bu karta eskirgan'
    assert telegram.last('editMessageReplyMarkup')['message_id'] == draft.message_id - 50
    assert await shop.count(Order) == 0

    await staff_bot.send(callback(OPERATOR, 'draft:discard', draft.message_id))
    assert await shop.count(Draft) == 0
    assert 'bekor' in telegram.last('editMessageText', OPERATOR)['text']


async def test_forgotten_draft_is_not_continued(staff_bot, telegram, shop, team, ai):
    ai(understood([(team.burger, 1)]))
    await staff_bot.send(recorded_voice(telegram, OPERATOR, 1))
    old_card = (await shop.one(Draft)).message_id
    await shop.update(update(Draft).values(updated_at=now() - timedelta(hours=1)))
    fake = ai(understood([(team.cola, 1)]))
    await staff_bot.send(recorded_voice(telegram, OPERATOR, 2))
    assert fake.calls[0].state == {}
    assert (await shop.one(Draft)).state['items'] == [{'product_id': team.cola.id, 'quantity': 1}]
    assert telegram.last('editMessageReplyMarkup')['message_id'] == old_card  # its buttons are gone


async def test_nothing_recognised(staff_bot, telegram, shop, team, ai):
    ai(understood([], transcript='salom'))
    await staff_bot.send(recorded_voice(telegram, OPERATOR, 1))
    assert 'salom' in telegram.last('editMessageText', OPERATOR)['text']
    assert await shop.count(Draft) == 0


async def test_long_voice_is_refused(staff_bot, telegram, team, ai):
    fake = ai(understood([(team.burger, 1)]))
    await staff_bot.send(recorded_voice(telegram, OPERATOR, 1, duration=600))
    assert fake.calls == []
    assert 'uzun' in telegram.last('sendMessage', OPERATOR)['text']


async def test_ai_trouble_is_reported_on_the_card(staff_bot, telegram, shop, team, ai):
    ai(understanding.VoiceError('ai_failed'))
    await staff_bot.send(recorded_voice(telegram, OPERATOR, 1))
    assert 'AI hozir javob bermayapti' in telegram.last('editMessageText', OPERATOR)['text']

    ai(understanding.VoiceError('transcription_failed'))
    await staff_bot.send(recorded_voice(telegram, OPERATOR, 2))
    assert 'Ovozni tushunolmadim' in telegram.last('editMessageText', OPERATOR)['text']
    assert await shop.count(Draft) == 0


async def test_a_voice_that_cannot_be_downloaded(staff_bot, telegram, shop, team, ai):
    fake = ai(understood([(team.burger, 1)]))
    telegram.fail('getFile', NetworkFailure())
    await staff_bot.send(recorded_voice(telegram, OPERATOR, 1))
    assert fake.calls == []
    assert 'Ovozni tushunolmadim' in telegram.last('editMessageText', OPERATOR)['text']


async def test_text_order_uses_the_local_parser_without_gemini(staff_bot, telegram, team):
    await staff_bot.send(message(OPERATOR, '2 ta chizburger, 1 ta kola'))
    assert telegram.payloads('sendMessage', OPERATOR)[0]['text'] == '⏳ Tushunayapman…'
    card = telegram.last('editMessageText', OPERATOR)
    assert 'Chizburger × 2' in card['text']
    assert 'Kola × 1' in card['text']
    assert '82 000' in card['text']


async def test_voice_without_gemini_asks_for_text(staff_bot, telegram, shop, team):
    await staff_bot.send(voice(OPERATOR, 1, 'x', duration=3))
    assert 'matn' in telegram.last('sendMessage', OPERATOR)['text']
    assert await shop.count(Draft) == 0


# ---------------------------------------------------------------------------
# customer orders in staff chats
# ---------------------------------------------------------------------------

async def test_new_customer_orders_reach_every_staff_chat_once(staff_bot, telegram, shop, team):
    order = await customer_order(shop, team)
    await service.push_new_orders(staff_bot.db, shop.info, staff_bot.bot)
    await service.push_new_orders(staff_bot.db, shop.info, staff_bot.bot)
    for chat_id in (OPERATOR, COURIER):
        sent = [payload for payload in telegram.payloads('sendMessage', chat_id) if f'#{order.id}' in payload['text']]
        assert len(sent) == 1
        assert '🔔' in sent[0]['text'] and 'Aziz' in sent[0]['text'] and '70 000' in sent[0]['text']
        assert telegram.buttons(sent[0]) == [f'order:{order.id}:accept', f'order:{order.id}:ask_reject']
    ticket = await shop.one(OrderTicket)
    assert (ticket.order_id, ticket.status_seen, ticket.accepted_at) == (order.id, 'ordered', None)


async def test_orders_are_not_pushed_to_their_author(staff_bot, telegram, shop, team):
    order = await shop.order([(team.cola, 1)], source='admin', created_by=team.admin)
    await service.push_new_orders(staff_bot.db, shop.info, staff_bot.bot)
    assert telegram.payloads('sendMessage', OPERATOR) == []
    assert f'#{order.id}' in telegram.last('sendMessage', COURIER)['text']


async def test_old_orders_and_carts_are_not_pushed(staff_bot, telegram, shop, team):
    await customer_order(shop, team, status='new')
    await customer_order(shop, team, tg_id='778', stamp=now() - timedelta(hours=5))
    await service.push_new_orders(staff_bot.db, shop.info, staff_bot.bot)
    assert telegram.payloads('sendMessage') == []


async def test_accept_deliver_and_all_copies_follow(staff_bot, telegram, shop, team):
    order = await customer_order(shop, team)
    await service.push_new_orders(staff_bot.db, shop.info, staff_bot.bot)
    operator_card = await shop.one(OrderCard, OrderCard.chat_id == OPERATOR)
    courier_card = await shop.one(OrderCard, OrderCard.chat_id == COURIER)

    await staff_bot.send(callback(OPERATOR, f'order:{order.id}:accept', operator_card.message_id))
    assert telegram.last('answerCallbackQuery')['text'] == 'Saqlandi'
    ticket = await shop.one(OrderTicket)
    assert ticket.accepted_by_id == team.admin.id
    courier_view = telegram.last('editMessageText', COURIER)
    assert courier_view['message_id'] == courier_card.message_id
    assert 'Qabul qilindi · Xasan' in courier_view['text']

    # The courier was a moment late: the order is already accepted.
    await staff_bot.send(callback(COURIER, f'order:{order.id}:accept', courier_card.message_id))
    assert telegram.last('answerCallbackQuery')['show_alert'] is True

    await staff_bot.send(callback(COURIER, f'order:{order.id}:on_the_way', courier_card.message_id))
    await staff_bot.send(callback(COURIER, f'order:{order.id}:done', courier_card.message_id))
    assert (await shop.one(Order)).status == 'completed'
    events = [(row.kind, row.event, row.sent_at, row.attempts) for row in await shop.all(Outbox)]
    assert events == [('order_status', 'accepted', None, 0), ('order_status', 'on_the_way', None, 0),
                      ('order_status', 'completed', None, 0)]
    final = telegram.last('editMessageText', OPERATOR)
    assert 'Yetkazildi · Bobur' in final['text']
    assert telegram.buttons(final) == []
    assert await shop.count(OrderCard) == 2


async def test_reject_asks_for_confirmation(staff_bot, telegram, shop, team):
    order = await customer_order(shop, team)
    await service.push_new_orders(staff_bot.db, shop.info, staff_bot.bot)
    card = await shop.one(OrderCard, OrderCard.chat_id == OPERATOR)

    await staff_bot.send(callback(OPERATOR, f'order:{order.id}:ask_reject', card.message_id))
    assert telegram.buttons(telegram.last('editMessageText', OPERATOR)) == [f'order:{order.id}:reject',
                                                                            f'order:{order.id}:back']
    assert telegram.last('answerCallbackQuery')['text'] == 'Bekor qilishni tasdiqlang'
    assert (await shop.one(Order)).status == 'ordered'

    await staff_bot.send(callback(OPERATOR, f'order:{order.id}:back', card.message_id))
    assert telegram.buttons(telegram.last('editMessageText', OPERATOR)) == [f'order:{order.id}:accept',
                                                                            f'order:{order.id}:ask_reject']

    await staff_bot.send(callback(OPERATOR, f'order:{order.id}:reject', card.message_id))
    assert (await shop.one(Order)).status == 'rejected'
    assert [(row.kind, row.event) for row in await shop.all(Outbox)] == [('order_status', 'rejected')]


async def test_customers_without_telegram_get_no_messages(staff_bot, shop, team):
    client = await shop.client(tg_id=None)
    order = await shop.order([(team.burger, 1)], client=client, source='web')
    await staff_bot.send(callback(OPERATOR, f'order:{order.id}:accept', 77))
    assert (await shop.one(OrderTicket)).accepted_by_id == team.admin.id
    assert await shop.count(Outbox) == 0


async def test_status_changed_in_the_admin_panel_updates_the_cards(staff_bot, telegram, shop, team):
    order = await customer_order(shop, team)
    await service.push_new_orders(staff_bot.db, shop.info, staff_bot.bot)
    await shop.update(update(Order).where(Order.id == order.id).values(status='on_the_way', updated_at=now()))
    await service.sync_changed_orders(staff_bot.db, shop.info, staff_bot.bot)
    edits = telegram.payloads('editMessageText')
    assert {edit['chat_id'] for edit in edits} == {OPERATOR, COURIER}
    assert "Yo'lda" in edits[-1]['text']
    ticket = await shop.one(OrderTicket)
    assert (ticket.status_seen, ticket.changed_by_id) == ('on_the_way', None)
    await service.sync_changed_orders(staff_bot.db, shop.info, staff_bot.bot)
    assert len(telegram.payloads('editMessageText')) == 2


async def test_cards_deleted_in_the_chat_are_forgotten(staff_bot, telegram, shop, team):
    order = await customer_order(shop, team)
    await service.push_new_orders(staff_bot.db, shop.info, staff_bot.bot)
    telegram.fail('editMessageText', ApiFailure(400, 'Bad Request: message to edit not found'),
                  when=lambda call: call.payload['chat_id'] == COURIER)
    await shop.update(update(Order).where(Order.id == order.id).values(status='rejected', updated_at=now()))
    await service.sync_changed_orders(staff_bot.db, shop.info, staff_bot.bot)
    assert [card.chat_id for card in await shop.all(OrderCard)] == [OPERATOR]


async def test_blocked_staff_are_skipped(staff_bot, telegram, shop, team):
    telegram.fail('sendMessage', ApiFailure(403, 'Forbidden: bot was blocked by the user'))
    await customer_order(shop, team)
    await service.push_new_orders(staff_bot.db, shop.info, staff_bot.bot)
    assert await shop.count(StaffLink, StaffLink.blocked_at.is_not(None)) == 2


async def test_staff_who_turned_notifications_off_are_skipped(staff_bot, telegram, shop, team):
    await shop.update(update(StaffLink).where(StaffLink.telegram_id == COURIER).values(notify_orders=False))
    await customer_order(shop, team)
    await service.push_new_orders(staff_bot.db, shop.info, staff_bot.bot)
    assert telegram.payloads('sendMessage', COURIER) == []
    assert len(telegram.payloads('sendMessage', OPERATOR)) == 1


async def test_strangers_cannot_press_buttons(staff_bot, telegram, shop, team):
    order = await customer_order(shop, team)
    await staff_bot.send(callback(4242, f'order:{order.id}:done', 55))
    assert (await shop.one(Order)).status == 'ordered'
    assert telegram.last('answerCallbackQuery')['show_alert'] is True
    assert telegram.last('answerCallbackQuery')['text'] == 'Siz botga ulanmagansiz'


async def test_unknown_and_unfinished_orders_are_not_found(staff_bot, telegram, shop, team):
    cart = await customer_order(shop, team, status='new')
    for data in (f'order:{cart.id}:accept', 'order:999999:accept', 'order:abc:accept'):
        await staff_bot.send(callback(OPERATOR, data, 55))
        assert telegram.last('answerCallbackQuery')['text'] == 'Buyurtma topilmadi'
    assert (await shop.one(Order)).status == 'new'


# ---------------------------------------------------------------------------
# today
# ---------------------------------------------------------------------------

async def test_today_list_and_stats(staff_bot, telegram, shop, team):
    order = await customer_order(shop, team)
    sale = await shop.order([(team.cola, 3)], status='completed', source='admin', created_by=team.admin,
                            delivery_type='pickup', location=None, phone=None)
    await customer_order(shop, team, tg_id='779', status='new')  # a cart: not an order yet

    await staff_bot.send(message(OPERATOR, '📋 Bugungi buyurtmalar'))
    listing = telegram.last('sendMessage', OPERATOR)
    assert f'🟡 #{order.id}' in listing['text']
    assert f'✅ #{sale.id}' in listing['text'] and 'Xasan' in listing['text']
    assert '106 000' in listing['text'] and '2 ta' in listing['text']
    assert telegram.buttons(listing) == [f'order:{order.id}:open', 'today']

    await staff_bot.send(callback(OPERATOR, f'order:{order.id}:open', 150))
    assert f'#{order.id}' in telegram.last('sendMessage', OPERATOR)['text']
    assert await shop.count(OrderCard, OrderCard.chat_id == OPERATOR) == 1

    await staff_bot.send(callback(OPERATOR, 'today', 150))
    assert telegram.last('editMessageText', OPERATOR)['message_id'] == 150

    await staff_bot.send(message(OPERATOR, '📊 Итоги дня'))
    stats = telegram.last('sendMessage', OPERATOR)['text']
    assert '106 000' in stats
    assert 'Kola — 3' in stats and 'Chizburger — 2' in stats
    assert 'Mini App 1' in stats and 'Xodim 1' in stats


async def test_today_without_orders(staff_bot, telegram, team):
    await staff_bot.send(message(OPERATOR, '/today'))
    assert telegram.last('sendMessage', OPERATOR)['text'] == "📋 Bugun hali buyurtma yo'q."
    await staff_bot.send(message(OPERATOR, '/stats'))
    assert "Bugun hali buyurtma yo'q" in telegram.last('sendMessage', OPERATOR)['text']
