"""Branches in the staff bot: who gets which order's card, sending orders to branches from Telegram, moves,
permissions, today's list and orders dictated in the bot — with branches off everything stays as before."""
from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace

import pytest
from sqlalchemy import event, update

from app import branches
from app.branches import OFF, Setup, Viewer
from app.db.models import Branch, Business, Draft, Order, OrderCard, OrderTicket
from app.staff import cards, service
from app.telegram.api import Backoff
from app.utils import now
from .fakes import NetworkFailure, callback, message

HEAD = 5101  # admin, head office
MANAGER = 5102  # manager, head office, Russian
CHILONZOR_COOK = 5201
YUNUSOBOD_COOK = 5301
EVERYONE = (HEAD, MANAGER, CHILONZOR_COOK, YUNUSOBOD_COOK)
# A delivery point 1,4 km from Chilonzor and 9,7 km from Yunusobod (straight lines).
NEAR_CHILONZOR = {'l_t': '41.295', 'e_t': '69.215'}


async def set_branches(db, shop, enabled):
    """Our panel's switch."""
    async with db.public() as session:
        await session.execute(update(Business).where(Business.id == shop.info.id).values(branches_enabled=enabled))
        await session.commit()


@pytest.fixture
async def firm(db, shop):
    """A business with branches on and two active branches (dispatch mode); a head office and a cook per branch."""
    await set_branches(db, shop, True)
    chilonzor = await shop.branch('Chilonzor', Decimal('41.285000'), Decimal('69.204000'))
    yunusobod = await shop.branch('Yunusobod', Decimal('41.365000'), Decimal('69.285000'))
    unit = await shop.unit()
    head = await shop.user('+998900000201', 'Xasan')
    manager = await shop.user('+998900000202', 'Bobur', role='manager')
    chilonzor_cook = await shop.user('+998900000203', 'Ali', role='branch', branch=chilonzor)
    yunusobod_cook = await shop.user('+998900000204', 'Vali', role='branch', branch=yunusobod)
    await shop.link(HEAD, head, 'Xasan')
    await shop.link(MANAGER, manager, 'Bobur', lang='ru')
    await shop.link(CHILONZOR_COOK, chilonzor_cook, 'Ali')
    await shop.link(YUNUSOBOD_COOK, yunusobod_cook, 'Vali')
    return SimpleNamespace(
        chilonzor=chilonzor, yunusobod=yunusobod, head=head, manager=manager, chilonzor_cook=chilonzor_cook,
        yunusobod_cook=yunusobod_cook, burger=await shop.product('Chizburger', 'Чизбургер', '35 000', unit),
    )


async def customer_order(shop, firm, tg_id='777', branch=None, **fields):
    """A delivery order from the shop: waiting for the head office, or (`branch`) with the branch the backend gave
    it (a pickup choice, the only branch)."""
    client = await shop.client(tg_id=tg_id, lang='ru')
    if branch is not None:
        fields.update(branch_id=branch.id, assigned_at=now())
    return await shop.order([(firm.burger, 2)], client=client, **{**NEAR_CHILONZOR, **fields})


def cards_of(telegram, chat_id, order):
    return [payload for payload in telegram.payloads('sendMessage', chat_id) if f'#{order.id}' in payload['text']]


def rows(payload):
    return [[button['callback_data'] for button in row] for row in payload['reply_markup']['inline_keyboard']]


async def card_of(shop, chat_id, order=None):
    """The card (OrderCard) in the chat — of `order` when the chat has more."""
    where = [OrderCard.chat_id == chat_id]
    if order is not None:
        where.append(OrderCard.ticket_id == (await shop.one(OrderTicket, OrderTicket.order_id == order.id)).id)
    return await shop.one(OrderCard, *where)


async def round_(staff_bot, shop):
    """A background round of the staff bot (with the BusinessInfo the tests started with)."""
    await service.push_new_orders(staff_bot.db, shop.info, staff_bot.bot)
    await service.sync_changed_orders(staff_bot.db, shop.info, staff_bot.bot)


# ---------------------------------------------------------------------------
# who gets the cards
# ---------------------------------------------------------------------------

async def test_with_branches_off_everything_is_as_before(staff_bot, telegram, db, shop, firm):
    await set_branches(db, shop, False)  # the branches and their staff are kept, but ignored
    order = await customer_order(shop, firm, branch=firm.chilonzor)
    waiting = await customer_order(shop, firm, tg_id='778')
    await round_(staff_bot, shop)
    for chat_id in EVERYONE:  # role `branch` acts like a manager
        for each in (order, waiting):
            [card] = cards_of(telegram, chat_id, each)
            assert '🏪' not in card['text'] and 'Филиал' not in card['text']
            assert telegram.buttons(card) == [f'order:{each.id}:accept', f'order:{each.id}:ask_reject']

    yunusobod_card = await card_of(shop, YUNUSOBOD_COOK, order)
    await staff_bot.send(callback(YUNUSOBOD_COOK, f'order:{order.id}:accept', yunusobod_card.message_id))
    assert telegram.last('answerCallbackQuery')['text'] == 'Saqlandi'
    await staff_bot.send(callback(HEAD, f'order:{waiting.id}:to:{firm.yunusobod.id}', 300))
    assert telegram.last('answerCallbackQuery')['text'] == "Filiallar o'chirilgan"
    assert (await shop.one(Order, Order.id == waiting.id)).branch_id is None

    await staff_bot.send(message(YUNUSOBOD_COOK, '/today'))
    listing = telegram.last('sendMessage', YUNUSOBOD_COOK)['text']
    assert f'#{order.id}' in listing and f'#{waiting.id}' in listing and '🏪' not in listing


async def test_with_one_active_branch_its_staff_get_its_orders(staff_bot, telegram, shop, firm):
    await shop.update(update(Branch).where(Branch.id == firm.yunusobod.id).values(is_active=False))
    order = await customer_order(shop, firm, branch=firm.chilonzor)  # the backend gave it the only branch
    await round_(staff_bot, shop)
    for chat_id in (HEAD, MANAGER, CHILONZOR_COOK):
        [card] = cards_of(telegram, chat_id, order)
        assert ('🏪 Filial: Chilonzor' if chat_id != MANAGER else '🏪 Филиал: Chilonzor') in card['text']
        # No dispatch mode: no moves either.
        assert telegram.buttons(card) == [f'order:{order.id}:accept', f'order:{order.id}:ask_reject']
    assert cards_of(telegram, YUNUSOBOD_COOK, order) == []
    assert (await shop.one(OrderTicket)).branch_seen_id == firm.chilonzor.id


async def test_in_dispatch_mode_an_order_waits_for_the_head_office(staff_bot, telegram, shop, firm):
    order = await customer_order(shop, firm)
    await round_(staff_bot, shop)
    [card] = cards_of(telegram, HEAD, order)
    assert '🏪 Filial tanlanmagan · eng yaqini: Chilonzor (1,4 km)' in card['text']
    assert '🟡 Yangi' in card['text']
    # Nearest first, two per row, then «Rad etish» — no «Qabul qilish» before it has a branch.
    assert rows(card) == [[f'order:{order.id}:to:{firm.chilonzor.id}', f'order:{order.id}:to:{firm.yunusobod.id}'],
                          [f'order:{order.id}:ask_reject']]
    labels = [button['text'] for row in card['reply_markup']['inline_keyboard'] for button in row]
    assert labels == ['Chilonzor · 1,4 km', 'Yunusobod · 9,7 km', '❌ Rad etish']
    [russian] = cards_of(telegram, MANAGER, order)
    assert '🏪 Филиал не выбран · ближайший: Chilonzor (1,4 км)' in russian['text']
    assert [button['text'] for button in russian['reply_markup']['inline_keyboard'][0]] == [
        'Chilonzor · 1,4 км', 'Yunusobod · 9,7 км']
    # Branch staff see nothing of it yet.
    assert cards_of(telegram, CHILONZOR_COOK, order) == [] and cards_of(telegram, YUNUSOBOD_COOK, order) == []

    # «Rad etish» keeps its confirmation, and «Orqaga» brings the branches back.
    head_card = await card_of(shop, HEAD)
    await staff_bot.send(callback(HEAD, f'order:{order.id}:ask_reject', head_card.message_id))
    assert telegram.buttons(telegram.last('editMessageText', HEAD)) == [f'order:{order.id}:reject',
                                                                        f'order:{order.id}:back']
    await staff_bot.send(callback(HEAD, f'order:{order.id}:back', head_card.message_id))
    assert rows(telegram.last('editMessageText', HEAD))[0] == [f'order:{order.id}:to:{firm.chilonzor.id}',
                                                               f'order:{order.id}:to:{firm.yunusobod.id}']


async def test_the_head_office_sends_an_order_to_a_branch(staff_bot, telegram, shop, firm):
    order = await customer_order(shop, firm)
    await round_(staff_bot, shop)
    before = now()
    await staff_bot.send(callback(HEAD, f'order:{order.id}:to:{firm.chilonzor.id}', (await card_of(shop, HEAD))
                                  .message_id))
    assert telegram.last('answerCallbackQuery')['text'] == '✅ «Chilonzor» filialiga yuborildi'
    row = await shop.one(Order)
    assert (row.branch_id, row.assigned_by_id) == (firm.chilonzor.id, firm.head.id)
    assert row.assigned_at >= before and row.updated_at == row.assigned_at
    ticket = await shop.one(OrderTicket)
    assert (ticket.branch_seen_id, ticket.accepted_at) == (firm.chilonzor.id, None)

    # Every head office copy shows the branch, with the usual buttons and a move.
    for chat_id, line in ((HEAD, '🏪 Filial: Chilonzor'), (MANAGER, '🏪 Филиал: Chilonzor')):
        edit = telegram.last('editMessageText', chat_id)
        assert line in edit['text'] and 'tanlanmagan' not in edit['text']
        assert rows(edit) == [[f'order:{order.id}:accept', f'order:{order.id}:ask_reject'],
                              [f'order:{order.id}:ask_move']]
    # The branch's staff get the card now; the other branch does not.
    [card] = cards_of(telegram, CHILONZOR_COOK, order)
    assert '🔔' in card['text'] and '🏪 Filial: Chilonzor' in card['text']
    assert telegram.buttons(card) == [f'order:{order.id}:accept', f'order:{order.id}:ask_reject']
    assert cards_of(telegram, YUNUSOBOD_COOK, order) == []

    # The next rounds have nothing to add: no card twice, no refresh (the ticket saw the branch).
    calls = len(telegram.calls)
    await round_(staff_bot, shop)
    assert len(telegram.calls) == calls

    await staff_bot.send(callback(CHILONZOR_COOK, f'order:{order.id}:accept', (await card_of(shop, CHILONZOR_COOK))
                                  .message_id))
    assert telegram.last('answerCallbackQuery')['text'] == 'Saqlandi'
    assert (await shop.one(OrderTicket)).accepted_by_id == firm.chilonzor_cook.id
    assert "Qabul qilindi · Ali" in telegram.last('editMessageText', HEAD)['text']


async def test_an_order_sent_to_a_branch_long_after_it_was_placed_reaches_the_branch(staff_bot, telegram, shop, firm):
    order = await customer_order(shop, firm)
    await round_(staff_bot, shop)
    # Hours later (past every push window) the admin panel sends it to Yunusobod — without touching updated_at.
    long_ago = now() - timedelta(hours=5)
    await shop.update(update(OrderTicket).values(created_at=long_ago))
    await shop.update(update(Order).values(created_at=long_ago, updated_at=long_ago))
    await shop.update(update(Order).values(branch_id=firm.yunusobod.id, assigned_at=now(),
                                           assigned_by_id=firm.manager.id, updated_at=long_ago))

    await round_(staff_bot, shop)
    [card] = cards_of(telegram, YUNUSOBOD_COOK, order)
    assert '🏪 Filial: Yunusobod' in card['text']
    assert telegram.buttons(card) == [f'order:{order.id}:accept', f'order:{order.id}:ask_reject']
    assert cards_of(telegram, CHILONZOR_COOK, order) == []
    assert len(cards_of(telegram, HEAD, order)) == 1  # the head office is not told again: its copies are refreshed
    assert '🏪 Filial: Yunusobod' in telegram.last('editMessageText', HEAD)['text']
    assert (await shop.one(OrderTicket)).branch_seen_id == firm.yunusobod.id

    calls = len(telegram.calls)
    await round_(staff_bot, shop)
    assert len(telegram.calls) == calls


async def test_a_branch_card_that_did_not_go_out_is_sent_again_once(staff_bot, telegram, shop, firm):
    order = await customer_order(shop, firm)
    await round_(staff_bot, shop)
    await shop.update(update(Order).values(branch_id=firm.chilonzor.id, assigned_at=now(), updated_at=now()))
    telegram.fail('sendMessage', NetworkFailure(), when=lambda call: call.payload['chat_id'] == CHILONZOR_COOK,
                  times=1)
    with pytest.raises(Backoff):
        await service.push_new_orders(staff_bot.db, shop.info, staff_bot.bot)
    await round_(staff_bot, shop)
    await round_(staff_bot, shop)
    assert len(cards_of(telegram, CHILONZOR_COOK, order)) == 2  # the failed try and the card
    assert await shop.count(OrderCard, OrderCard.chat_id == CHILONZOR_COOK) == 1

    # Once the branch has accepted it, a card that failed is not sent any more (as for new orders).
    other = await customer_order(shop, firm, tg_id='778')
    await round_(staff_bot, shop)
    await shop.update(update(Order).where(Order.id == other.id).values(branch_id=firm.yunusobod.id,
                                                                       assigned_at=now()))
    telegram.fail('sendMessage', NetworkFailure(), when=lambda call: call.payload['chat_id'] == YUNUSOBOD_COOK,
                  times=1)
    with pytest.raises(Backoff):
        await service.push_new_orders(staff_bot.db, shop.info, staff_bot.bot)
    await shop.update(update(OrderTicket).where(OrderTicket.order_id == other.id)
                      .values(accepted_at=now(), accepted_by_id=firm.head.id))
    await round_(staff_bot, shop)
    assert len(cards_of(telegram, YUNUSOBOD_COOK, other)) == 1  # only the failed try


async def test_two_head_office_presses_send_the_order_once(staff_bot, telegram, shop, firm):
    order = await customer_order(shop, firm)
    await round_(staff_bot, shop)
    await staff_bot.send(callback(HEAD, f'order:{order.id}:to:{firm.chilonzor.id}', (await card_of(shop, HEAD))
                                  .message_id))
    manager_card = await card_of(shop, MANAGER)
    await staff_bot.send(callback(MANAGER, f'order:{order.id}:to:{firm.yunusobod.id}', manager_card.message_id))
    answer = telegram.last('answerCallbackQuery')
    assert (answer['text'], answer['show_alert']) == ('Заказ уже отправлен в филиал «Chilonzor»', True)
    assert (await shop.one(Order)).branch_id == firm.chilonzor.id
    assert cards_of(telegram, YUNUSOBOD_COOK, order) == []
    assert '🏪 Филиал: Chilonzor' in telegram.last('editMessageText', MANAGER)['text']


async def test_inactive_branches_are_neither_offered_nor_taken(staff_bot, telegram, shop, firm):
    sergeli = await shop.branch('Sergeli', Decimal('41.226000'), Decimal('69.219000'), is_active=False)
    order = await customer_order(shop, firm)
    await round_(staff_bot, shop)
    [card] = cards_of(telegram, HEAD, order)
    assert f':to:{sergeli.id}' not in str(rows(card))
    await staff_bot.send(callback(HEAD, f'order:{order.id}:to:{sergeli.id}', (await card_of(shop, HEAD)).message_id))
    assert telegram.last('answerCallbackQuery')['text'] == 'Bu filial hozir faol emas'
    assert (await shop.one(Order)).branch_id is None


async def test_branches_without_a_point_are_listed_by_name(staff_bot, telegram, shop, firm):
    typed = await customer_order(shop, firm, l_t=None, e_t=None, location='Yunusobod 4-kvartal')
    pinned = await customer_order(shop, firm, tg_id='778', l_t=None, e_t=None, location='41.36 69.29')
    await round_(staff_bot, shop)
    [card] = cards_of(telegram, HEAD, typed)
    assert '🏪 Filial tanlanmagan\n' in card['text'] and 'eng yaqini' not in card['text']
    assert [button['text'] for button in card['reply_markup']['inline_keyboard'][0]] == ['Chilonzor', 'Yunusobod']
    [card] = cards_of(telegram, HEAD, pinned)  # a shared location pin is a point too
    assert 'eng yaqini: Yunusobod (0,7 km)' in card['text']
    assert [button['text'] for button in card['reply_markup']['inline_keyboard'][0]] == [
        'Yunusobod · 0,7 km', 'Chilonzor · 11,0 km']


async def test_at_most_eight_branches_two_per_row(staff_bot, telegram, shop, firm):
    for number in range(8):
        await shop.branch(f'Filial {number}', Decimal('41.5') + Decimal(number) / 10, Decimal('69.6'))
    order = await customer_order(shop, firm)
    await round_(staff_bot, shop)
    [card] = cards_of(telegram, HEAD, order)
    keyboard = rows(card)
    assert [len(row) for row in keyboard] == [2, 2, 2, 2, 1] and keyboard[-1] == [f'order:{order.id}:ask_reject']
    assert keyboard[0][0] == f'order:{order.id}:to:{firm.chilonzor.id}'


def test_callback_data_fits_telegrams_64_bytes():
    huge = 10 ** 18 - 1
    setup = Setup(True, (branches.BranchInfo(huge, 'A'), branches.BranchInfo(huge - 1, 'B')))
    order = SimpleNamespace(id=huge, status='ordered', branch_id=None, l_t=None, e_t=None, location=None,
                            delivery_type='delivery')
    markup = cards.order_keyboard(order, None, 'uz', setup=setup)
    data = [button.callback_data for row in markup.inline_keyboard for button in row]
    assert data[0] == f'order:{huge}:to:{huge}' and all(len(item.encode()) <= 64 for item in data)
    order.branch_id = huge
    markup = cards.order_keyboard(order, None, 'uz', setup=setup, choose_branch=True)
    assert all(len(button.callback_data.encode()) <= 64 for row in markup.inline_keyboard for button in row)


# ---------------------------------------------------------------------------
# moves and permissions
# ---------------------------------------------------------------------------

async def test_the_head_office_moves_an_order_to_another_branch(staff_bot, telegram, shop, firm):
    order = await customer_order(shop, firm, branch=firm.chilonzor)
    await round_(staff_bot, shop)
    cook_card = await card_of(shop, CHILONZOR_COOK)
    await staff_bot.send(callback(CHILONZOR_COOK, f'order:{order.id}:accept', cook_card.message_id))

    head_card = await card_of(shop, HEAD)
    await staff_bot.send(callback(HEAD, f'order:{order.id}:ask_move', head_card.message_id))
    assert telegram.last('answerCallbackQuery')['text'] == 'Qaysi filialga yuboramiz?'
    assert rows(telegram.last('editMessageText', HEAD)) == [[f'order:{order.id}:mv:{firm.yunusobod.id}'],
                                                            [f'order:{order.id}:back']]
    await staff_bot.send(callback(HEAD, f'order:{order.id}:mv:{firm.yunusobod.id}', head_card.message_id))
    assert telegram.last('answerCallbackQuery')['text'] == '✅ «Yunusobod» filialiga yuborildi'
    row = await shop.one(Order)
    assert (row.branch_id, row.assigned_by_id) == (firm.yunusobod.id, firm.head.id)

    # The old branch's card says where it went, without buttons; the new branch gets it (accepted already).
    moved = telegram.last('editMessageText', CHILONZOR_COOK)
    assert moved['message_id'] == cook_card.message_id
    assert "↪️ Boshqa filialga o'tkazildi: Yunusobod" in moved['text']
    assert 'Qabul qilindi' not in moved['text'] and telegram.buttons(moved) == []
    [card] = cards_of(telegram, YUNUSOBOD_COOK, order)
    assert '🏪 Filial: Yunusobod' in card['text'] and 'Qabul qilindi · Ali' in card['text']
    assert telegram.buttons(card) == [f'order:{order.id}:on_the_way', f'order:{order.id}:done',
                                      f'order:{order.id}:ask_reject']
    assert '🏪 Filial: Yunusobod' in telegram.last('editMessageText', HEAD)['text']

    # The old card is dead: the order is not theirs any more.
    await staff_bot.send(callback(CHILONZOR_COOK, f'order:{order.id}:done', cook_card.message_id))
    answer = telegram.last('answerCallbackQuery')
    assert (answer['text'], answer['show_alert']) == ('Bu buyurtma sizning filialingizniki emas', True)
    assert (await shop.one(Order)).status == 'ordered'
    await staff_bot.send(callback(YUNUSOBOD_COOK, f'order:{order.id}:done', (await card_of(shop, YUNUSOBOD_COOK))
                                  .message_id))
    assert (await shop.one(Order)).status == 'completed'


async def test_a_move_made_in_the_admin_panel_updates_the_cards(staff_bot, telegram, shop, firm):
    order = await customer_order(shop, firm, branch=firm.chilonzor)
    await round_(staff_bot, shop)
    stamp = now()
    await shop.update(update(Order).values(branch_id=firm.yunusobod.id, assigned_at=stamp, updated_at=stamp,
                                           assigned_by_id=firm.manager.id))
    await round_(staff_bot, shop)
    assert "↪️ Boshqa filialga o'tkazildi: Yunusobod" in telegram.last('editMessageText', CHILONZOR_COOK)['text']
    assert '🏪 Филиал: Yunusobod' in telegram.last('editMessageText', MANAGER)['text']
    assert len(cards_of(telegram, YUNUSOBOD_COOK, order)) == 1
    ticket = await shop.one(OrderTicket)
    assert (ticket.branch_seen_id, ticket.status_seen, ticket.changed_by_id) == (firm.yunusobod.id, 'ordered', None)


async def test_buttons_are_checked(staff_bot, telegram, shop, firm):
    waiting = await customer_order(shop, firm)
    chilonzors = await customer_order(shop, firm, tg_id='778', branch=firm.chilonzor)
    await round_(staff_bot, shop)

    # Branch staff: only their branch's orders, and no sending to branches.
    for data in (f'order:{chilonzors.id}:accept', f'order:{chilonzors.id}:open', f'order:{waiting.id}:ask_reject',
                 f'order:{waiting.id}:to:{firm.yunusobod.id}'):
        await staff_bot.send(callback(YUNUSOBOD_COOK, data, 400))
        assert telegram.last('answerCallbackQuery')['text'] == 'Bu buyurtma sizning filialingizniki emas'
    assert cards_of(telegram, YUNUSOBOD_COOK, chilonzors) == []  # «open» sent nothing
    await staff_bot.send(callback(CHILONZOR_COOK, f'order:{chilonzors.id}:mv:{firm.yunusobod.id}', 401))
    assert telegram.last('answerCallbackQuery')['text'] == 'Filialni faqat bosh ofis tanlaydi'
    rows_after = await shop.all(Order)
    assert [(row.status, row.branch_id) for row in rows_after] == [('ordered', None), ('ordered', firm.chilonzor.id)]
    assert (await shop.one(OrderTicket, OrderTicket.order_id == chilonzors.id)).accepted_at is None

    # The head office: nothing but «Rad etish» before an order has a branch.
    for action in ('accept', 'on_the_way', 'done'):
        await staff_bot.send(callback(HEAD, f'order:{waiting.id}:{action}', 402))
        assert telegram.last('answerCallbackQuery')['text'] == 'Avval filialni tanlang'
    assert (await shop.one(OrderTicket, OrderTicket.order_id == waiting.id)).accepted_at is None
    await staff_bot.send(callback(HEAD, f'order:{waiting.id}:reject', 402))
    assert (await shop.one(Order, Order.id == waiting.id)).status == 'rejected'
    await staff_bot.send(callback(HEAD, f'order:{waiting.id}:to:{firm.chilonzor.id}', 402))
    assert telegram.last('answerCallbackQuery')['text'] == "Holat allaqachon o'zgargan"
    assert (await shop.one(Order, Order.id == waiting.id)).branch_id is None


def test_a_status_press_is_checked_again_under_the_lock():
    """The handler checks first; apply_action checks again on the locked row (the order may have moved)."""
    setup = Setup(True, (branches.BranchInfo(1, 'A'), branches.BranchInfo(2, 'B')))
    cook = Viewer.of(setup, 'branch', 1)
    assert service.may_apply('accept', SimpleNamespace(branch_id=1, status='ordered'), cook, setup)
    assert not service.may_apply('accept', SimpleNamespace(branch_id=2, status='ordered'), cook, setup)
    assert not service.may_apply('accept', SimpleNamespace(branch_id=None, status='ordered'), Viewer(), setup)
    assert service.may_apply('reject', SimpleNamespace(branch_id=None, status='ordered'), Viewer(), setup)
    assert service.may_apply('done', SimpleNamespace(branch_id=None, status='on_the_way'), Viewer(), setup)
    assert Viewer.of(OFF, 'branch', 1) == Viewer()  # branches off: a manager


# ---------------------------------------------------------------------------
# today, orders made in the bot, the switch
# ---------------------------------------------------------------------------

async def test_today_and_stats_of_branch_staff_show_their_branch(staff_bot, telegram, shop, firm):
    chilonzors = await customer_order(shop, firm, branch=firm.chilonzor)
    yunusobods = await customer_order(shop, firm, tg_id='778', branch=firm.yunusobod)
    waiting = await customer_order(shop, firm, tg_id='779')

    await staff_bot.send(message(CHILONZOR_COOK, '📋 Bugungi buyurtmalar'))
    listing = telegram.last('sendMessage', CHILONZOR_COOK)
    assert f'#{chilonzors.id}' in listing['text'] and '🏪 Filial: Chilonzor' in listing['text']
    assert f'#{yunusobods.id}' not in listing['text'] and f'#{waiting.id}' not in listing['text']
    assert '1 ta' in listing['text'] and '70 000' in listing['text']
    assert telegram.buttons(listing) == [f'order:{chilonzors.id}:open', 'today']
    await staff_bot.send(callback(CHILONZOR_COOK, f'order:{chilonzors.id}:open', 150))
    assert '🏪 Filial: Chilonzor' in telegram.last('sendMessage', CHILONZOR_COOK)['text']
    await staff_bot.send(message(CHILONZOR_COOK, '/stats'))
    stats = telegram.last('sendMessage', CHILONZOR_COOK)['text']
    assert '🏪 Filial: Chilonzor' in stats and '🧾 Buyurtmalar: <b>1</b>' in stats

    await staff_bot.send(message(HEAD, '/today'))
    listing = telegram.last('sendMessage', HEAD)['text']
    assert all(f'#{order.id}' in listing for order in (chilonzors, yunusobods, waiting))
    assert '3 ta' in listing and '🏪 Filial tanlanmagan: 1 ta' in listing
    await staff_bot.send(message(MANAGER, '/stats'))
    assert '🏪 Филиал не выбран: 1' in telegram.last('sendMessage', MANAGER)['text']


async def dictate(staff_bot, shop, chat_id, text='2 ta chizburger'):
    """A typed order (the local parser) confirmed with ✅; returns the order."""
    await staff_bot.send(message(chat_id, text))
    draft = await shop.one(Draft)
    await staff_bot.send(callback(chat_id, 'draft:confirm', draft.message_id))
    return await shop.one(Order)


async def test_orders_dictated_by_branch_staff_go_to_their_branch(staff_bot, telegram, shop, firm):
    order = await dictate(staff_bot, shop, CHILONZOR_COOK)
    assert (order.branch_id, order.assigned_by_id) == (firm.chilonzor.id, None)  # a branch's own sale
    assert order.created_by_id == firm.chilonzor_cook.id and order.assigned_at is not None
    assert (await shop.one(OrderTicket)).branch_seen_id == firm.chilonzor.id
    assert '🏪 Filial: Chilonzor' in telegram.last('editMessageText', CHILONZOR_COOK)['text']
    for chat_id in (HEAD, MANAGER):
        [card] = cards_of(telegram, chat_id, order)
        assert 'Chilonzor' in card['text']
    assert cards_of(telegram, YUNUSOBOD_COOK, order) == []


async def test_orders_dictated_by_the_head_office_get_the_only_branch(staff_bot, telegram, shop, firm):
    await shop.update(update(Branch).where(Branch.id == firm.yunusobod.id).values(is_active=False))
    order = await dictate(staff_bot, shop, HEAD)
    assert (order.branch_id, order.assigned_by_id) == (firm.chilonzor.id, None)
    [card] = cards_of(telegram, CHILONZOR_COOK, order)
    assert 'Qabul qilindi · Xasan' in card['text']
    assert cards_of(telegram, YUNUSOBOD_COOK, order) == []


async def test_orders_dictated_by_the_head_office_wait_in_dispatch_mode(staff_bot, telegram, shop, firm):
    order = await dictate(staff_bot, shop, HEAD)
    assert order.branch_id is None and order.assigned_at is None
    own = telegram.last('editMessageText', HEAD)
    assert '🏪 Filial tanlanmagan' in own['text'] and 'eng yaqini' not in own['text']  # no point: by name
    assert rows(own) == [[f'order:{order.id}:to:{firm.chilonzor.id}', f'order:{order.id}:to:{firm.yunusobod.id}'],
                         [f'order:{order.id}:ask_reject']]
    assert own['reply_markup']['inline_keyboard'][1][0]['text'] == '❌ Bekor qilish'
    assert len(cards_of(telegram, MANAGER, order)) == 1
    assert cards_of(telegram, CHILONZOR_COOK, order) == [] and cards_of(telegram, YUNUSOBOD_COOK, order) == []

    await staff_bot.send(callback(HEAD, f'order:{order.id}:to:{firm.yunusobod.id}', own['message_id']))
    [card] = cards_of(telegram, YUNUSOBOD_COOK, order)  # accepted by its author when it was made
    assert 'Qabul qilindi · Xasan' in card['text']
    assert telegram.buttons(card) == [f'order:{order.id}:done', f'order:{order.id}:ask_reject']  # a pickup


async def test_the_switch_in_our_panel_takes_effect_at_once(staff_bot, telegram, db, shop, firm):
    # shop.info was read before the switch: the rounds and the handlers read it again.
    await set_branches(db, shop, False)
    before = await customer_order(shop, firm)
    await round_(staff_bot, shop)
    assert all(len(cards_of(telegram, chat_id, before)) == 1 for chat_id in EVERYONE)

    await set_branches(db, shop, True)
    after = await customer_order(shop, firm, tg_id='778')
    await round_(staff_bot, shop)
    assert [len(cards_of(telegram, chat_id, after)) for chat_id in EVERYONE] == [1, 1, 0, 0]
    await staff_bot.send(callback(HEAD, f'order:{before.id}:accept', 500))
    assert telegram.last('answerCallbackQuery')['text'] == 'Avval filialni tanlang'

    await set_branches(db, shop, False)
    head_card = await card_of(shop, HEAD, after)
    await staff_bot.send(callback(HEAD, f'order:{after.id}:to:{firm.chilonzor.id}', head_card.message_id))
    assert telegram.last('answerCallbackQuery')['text'] == "Filiallar o'chirilgan"
    shown = telegram.last('editMessageText', HEAD)
    assert telegram.buttons(shown) == [f'order:{after.id}:accept', f'order:{after.id}:ask_reject']
    assert '🏪' not in shown['text']


# ---------------------------------------------------------------------------
# where
# ---------------------------------------------------------------------------

def test_points_and_distances():
    order = SimpleNamespace(l_t='41.2995', e_t='69.2401', location='Amir Temur 1')
    assert branches.order_point(order) == (41.2995, 69.2401)
    assert branches.order_point(SimpleNamespace(l_t=None, e_t=None, location='41.3, 69.2')) == (41.3, 69.2)
    for bad in (SimpleNamespace(l_t='x', e_t='y', location='Chilonzor'), SimpleNamespace(l_t='0', e_t='0',
                location=None), SimpleNamespace(l_t='95', e_t='69', location=None)):
        assert branches.order_point(bad) is None
    assert round(branches.distance_km((41.2995, 69.2401), (39.6542, 66.9597))) == 266  # Tashkent — Samarkand
    far = branches.BranchInfo(1, 'Uzoq', (41.4, 69.4))
    near = branches.BranchInfo(2, 'Yaqin', (41.3, 69.25))
    nowhere = branches.BranchInfo(3, 'Aaa')  # no point on the map
    assert [(branch.id, km) for branch, km in branches.by_distance((41.2995, 69.2401), [far, near, nowhere])] == [
        (2, 0.8), (1, 17.4), (3, None)]
    assert [branch.id for branch, _ in branches.by_distance(None, [far, near, nowhere])] == [3, 1, 2]  # by name


async def test_the_polling_query_keeps_the_partial_index_with_branches_on(db, shop, firm, telegram):
    statements = []

    def capture(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    event.listen(db.engine.sync_engine, 'before_cursor_execute', capture)
    try:
        await service.push_new_orders(db, shop.info, telegram.bot('2002:TEST-TOKEN-staff-bot-0000000000000'))
    finally:
        event.remove(db.engine.sync_engine, 'before_cursor_execute', capture)
    sql = '\n'.join(statements)
    assert "app_order.status = 'ordered'" in sql and 'status = $' not in sql
    assert 'assigned_at' in sql  # orders sent to a branch lately
