"""The runtime: which bots run, polling, one chat at a time, back-off, heartbeat, the background rounds."""
import asyncio
import time

import pytest
from aiohttp import web
from sqlalchemy import select, update

from app.config import settings
from app.crypto import encrypt
from app.db.models import Business, BusinessBot, OrderCard, Outbox
from app.telegram import runtime as runtime_module
from app.telegram.api import BACKOFF_SECONDS, BotFactory
from app.telegram.runtime import ALIVE_WINDOW, BUSINESS_JOBS, Poller, Runtime, Target
from .conftest import CUSTOMER_TOKEN, STAFF_TOKEN, add_bot, make_business, wait_until
from .fakes import ApiFailure, BrokenAnswer, NetworkFailure, raw_message

PLATFORM_TOKEN = '1000:PLATFORM-TOKEN-00000000000000000000'
OTHER_TOKEN = '3003:OTHER-TOKEN-0000000000000000000000'


@pytest.fixture
async def runtime(db, telegram):
    runtime = Runtime(db, telegram.factory)
    yield runtime
    await runtime.shutdown(timeout=2)


async def set_bot(db, bot_id, **values):
    async with db.public() as session:
        await session.execute(update(BusinessBot).where(BusinessBot.id == bot_id).values(**values))
        await session.commit()


async def test_active_bots_of_active_businesses_are_polled(runtime, db, shop, other_shop, test_settings):
    client_bot = await add_bot(db, shop, 'client', CUSTOMER_TOKEN, 'a_bot', 2003)
    admin_bot = await add_bot(db, shop, 'admin', STAFF_TOKEN, 'a_admin_bot', 2002)
    await add_bot(db, other_shop, 'client', '3003:OTHER-TOKEN-0000000000000000000000', 'b_bot', 3003,
                  is_active=False)
    test_settings.platform_bot_token = PLATFORM_TOKEN
    desired = await runtime.desired_bots()
    assert set(desired) == {'platform', f'bot{client_bot.id}', f'bot{admin_bot.id}'}
    assert (desired[f'bot{client_bot.id}'].token, desired[f'bot{client_bot.id}'].role) == (CUSTOMER_TOKEN, 'client')
    assert desired[f'bot{admin_bot.id}'].business.schema_name == 'test_shop'

    test_settings.platform_bot_token = ''
    await set_bot(db, admin_bot.id, is_active=False)
    assert set(await runtime.desired_bots()) == {f'bot{client_bot.id}'}
    async with db.public() as session:
        await session.execute(update(Business).where(Business.id == shop.info.id).values(status='suspended'))
        await session.commit()
    assert await runtime.desired_bots() == {}


async def test_tokens_that_cannot_be_decrypted_are_skipped(runtime, db, shop, test_settings):
    bot = await add_bot(db, shop, 'client', CUSTOMER_TOKEN, 'a_bot', 2003)
    test_settings.secret_key = 'another-secret-key'
    assert await runtime.desired_bots() == {}
    test_settings.secret_key = 'test-secret-key-for-the-bot-service'
    assert set(await runtime.desired_bots()) == {f'bot{bot.id}'}


async def test_a_malformed_token_does_not_stop_the_other_bots(runtime, db, shop, telegram, test_settings):
    bot = await add_bot(db, shop, 'client', CUSTOMER_TOKEN, 'a_bot', 2003)
    test_settings.platform_bot_token = 'not a token'
    await runtime.reconcile()
    assert set(runtime.pollers) == {f'bot{bot.id}'}


async def test_reconcile_configures_starts_stops_and_restarts_bots(runtime, db, shop, telegram):
    client_bot = await add_bot(db, shop, 'client', CUSTOMER_TOKEN, 'testshop_bot', 2003)
    staff_bot = await add_bot(db, shop, 'admin', STAFF_TOKEN, 'testshop_admin_bot', 2002)
    await runtime.reconcile()
    assert set(runtime.pollers) == {f'bot{client_bot.id}', f'bot{staff_bot.id}'}
    await wait_until(lambda: 'getUpdates' in telegram.methods(CUSTOMER_TOKEN)
                     and 'getUpdates' in telegram.methods(STAFF_TOKEN))

    # Customers' bot: commands, descriptions (uz default, ru) and the shop as the Mini App.
    assert telegram.methods(CUSTOMER_TOKEN)[:8] == [
        'setMyCommands', 'setMyDescription', 'setMyShortDescription',
        'setMyCommands', 'setMyDescription', 'setMyShortDescription', 'setChatMenuButton', 'deleteWebhook']
    uz_commands, ru_commands = telegram.payloads('setMyCommands', token=CUSTOMER_TOKEN)
    assert uz_commands == {'commands': [{'command': 'start', 'description': 'Boshlash'},
                                        {'command': 'lang', 'description': 'Til / Язык'}]}
    assert ru_commands['language_code'] == 'ru'
    assert telegram.payloads('setMyShortDescription', token=CUSTOMER_TOKEN)[0]['short_description'] == \
        'Test Shop — onlayn buyurtma'
    assert telegram.last('setChatMenuButton', token=CUSTOMER_TOKEN)['menu_button'] == {
        'type': 'web_app', 'text': "🛍 Do'kon", 'web_app': {'url': 'https://test-shop.example.uz/'}}
    # Staff bot: its commands and the admin panel's Mini App sign-in route.
    assert [command['command'] for command in telegram.payloads('setMyCommands', token=STAFF_TOKEN)[0]['commands']] \
        == ['start', 'today', 'stats', 'lang']
    assert telegram.last('setChatMenuButton', token=STAFF_TOKEN)['menu_button'] == {
        'type': 'web_app', 'text': '📊 Panel', 'web_app': {'url': 'https://test-shop-admin.example.uz/tg'}}
    updates = telegram.last('getUpdates', token=CUSTOMER_TOKEN)
    assert (updates['allowed_updates'], updates['timeout']) == (['message', 'callback_query'], 50)

    # Switched off in the panel: stopped.
    old_poller = runtime.pollers[f'bot{client_bot.id}']
    await set_bot(db, client_bot.id, is_active=False)
    await runtime.reconcile()
    assert set(runtime.pollers) == {f'bot{staff_bot.id}'}
    assert old_poller.task.done()

    # A new token: restarted with it (and configured again).
    new_token = '2002:NEW-STAFF-TOKEN-00000000000000000'
    await set_bot(db, staff_bot.id, token_encrypted=encrypt(new_token))
    previous = runtime.pollers[f'bot{staff_bot.id}']
    await runtime.reconcile()
    assert runtime.pollers[f'bot{staff_bot.id}'].bot.token == new_token
    assert previous.task.done()
    await wait_until(lambda: 'getUpdates' in telegram.methods(new_token))
    assert 'setChatMenuButton' in telegram.methods(new_token)


async def test_reconcile_restarts_a_poller_that_died(runtime, db, shop, telegram):
    row = await add_bot(db, shop, 'client', CUSTOMER_TOKEN, 'a_bot', 2003)
    await runtime.reconcile()
    dead = runtime.pollers[f'bot{row.id}']
    await wait_until(lambda: 'getUpdates' in telegram.methods(CUSTOMER_TOKEN))
    dead.task.cancel()  # however it happened
    await asyncio.gather(dead.task, return_exceptions=True)

    await runtime.reconcile()
    restarted = runtime.pollers[f'bot{row.id}']
    assert restarted is not dead and not restarted.task.done()
    await wait_until(lambda: telegram.methods(CUSTOMER_TOKEN).count('deleteWebhook') == 2)


async def test_a_poller_survives_any_error(runtime, telegram):
    """E.g. a proxy's HTML error page: aiogram's ClientDecodeError is no TelegramAPIError. The poller logs it,
    waits a little and goes on — a poller that died would go unnoticed."""
    poller = runtime.pollers['bot1'] = Poller(runtime, Target('bot1', CUSTOMER_TOKEN, 'client', 1),
                                              telegram.bot(CUSTOMER_TOKEN))
    pauses, seen = [], []

    async def pause(seconds):
        pauses.append(seconds)

    async def handle(poller, update):
        seen.append(update.update_id)

    poller.pause, runtime.handle = pause, handle
    telegram.fail('deleteWebhook', BrokenAnswer(), times=1)
    telegram.fail('getUpdates', BrokenAnswer(), times=1)
    telegram.updates[CUSTOMER_TOKEN] = [raw_message(5, 10, 'a')]
    poller.start()
    await wait_until(lambda: seen == [5])
    assert telegram.methods(CUSTOMER_TOKEN)[:4] == ['deleteWebhook', 'deleteWebhook', 'getUpdates', 'getUpdates']
    assert pauses == [3, 3] and poller.healthy and not poller.task.done()


async def test_poll_hands_updates_over_and_moves_the_offset(runtime, telegram):
    seen = []

    async def handle(poller, update):
        seen.append(update.update_id)

    runtime.handle = handle
    poller = Poller(runtime, Target('bot1', CUSTOMER_TOKEN, 'client', 1), telegram.bot(CUSTOMER_TOKEN))
    telegram.updates[CUSTOMER_TOKEN] = [raw_message(41, 10, 'a'), raw_message(42, 11, 'b')]
    await poller.poll_once(timeout=0)
    await asyncio.gather(*runtime.tasks)
    assert (seen, poller.offset, poller.healthy) == ([41, 42], 43, True)
    assert 'offset' not in telegram.payloads('getUpdates')[0]

    await poller.poll_once(timeout=0)
    assert telegram.last('getUpdates')['offset'] == 43
    assert seen == [41, 42]  # Telegram forgot the taken updates


async def test_one_chat_at_a_time_and_in_order(runtime, telegram):
    events, gate = [], asyncio.Event()

    async def handle(poller, update):
        events.append(('start', update.update_id))
        if update.update_id == 1:
            await gate.wait()
        events.append(('end', update.update_id))

    runtime.handle = handle
    poller = Poller(runtime, Target('bot1', CUSTOMER_TOKEN, 'client', 1), telegram.bot(CUSTOMER_TOKEN))
    telegram.updates[CUSTOMER_TOKEN] = [raw_message(1, 10, 'a'), raw_message(2, 10, 'b'), raw_message(3, 20, 'c')]
    await poller.poll_once(timeout=0)
    await wait_until(lambda: ('end', 3) in events)  # another chat is not held up
    assert ('start', 2) not in events  # the same chat waits for its previous update
    gate.set()
    await asyncio.gather(*runtime.tasks)
    assert events.index(('end', 1)) < events.index(('start', 2))
    assert len(runtime.locks) == 0


async def test_a_failing_update_does_not_stop_the_others(runtime, telegram, caplog):
    async def handle(poller, update):
        if update.update_id == 1:
            raise RuntimeError('boom')

    runtime.handle = handle
    poller = Poller(runtime, Target('bot1', CUSTOMER_TOKEN, 'client', 1), telegram.bot(CUSTOMER_TOKEN))
    telegram.updates[CUSTOMER_TOKEN] = [raw_message(1, 10, 'a'), raw_message(2, 10, 'b')]
    await poller.poll_once(timeout=0)
    await asyncio.gather(*runtime.tasks)
    assert 'bot1: update 1 failed' in caplog.text


@pytest.mark.parametrize('failure, pause', [
    (ApiFailure(409, 'Conflict: terminated by other getUpdates request'), 30),
    (ApiFailure(401, 'Unauthorized'), 30),
    (ApiFailure(404, 'Not Found'), 30),
    (ApiFailure(502, 'Bad Gateway'), 3),
    (NetworkFailure(), 3),
    (BrokenAnswer(), 3),
])
async def test_pollers_back_off(runtime, telegram, failure, pause):
    poller = Poller(runtime, Target('bot1', CUSTOMER_TOKEN, 'client', 1), telegram.bot(CUSTOMER_TOKEN))
    pauses = []

    async def record(seconds):
        pauses.append(seconds)

    poller.pause = record
    telegram.fail('getUpdates', failure)
    await poller.poll_once(timeout=0)
    assert (pauses, poller.healthy) == ([pause], False)


async def test_heartbeat_marks_the_bots_that_polled_lately(runtime, db, shop, other_shop, telegram):
    working = await add_bot(db, shop, 'client', CUSTOMER_TOKEN, 'a_bot', 2003)
    failing = await add_bot(db, shop, 'admin', STAFF_TOKEN, 'a_admin_bot', 2002)
    starting = await add_bot(db, other_shop, 'client', OTHER_TOKEN, 'b_bot', 3003)
    stuck = await add_bot(db, other_shop, 'admin', '3004:STUCK-TOKEN-0000000000000000000000', 'b_admin_bot', 3004)
    # (healthy, seconds since the last successful getUpdates): a starting bot or a silent poller is not working.
    for row, (healthy, age) in {working: (True, 1), failing: (False, 1), starting: (None, None),
                                stuck: (True, ALIVE_WINDOW + 1)}.items():
        poller = Poller(runtime, Target(f'bot{row.id}', 'x', row.role, row.id), None)
        poller.healthy, poller.polled_at = healthy, None if age is None else time.monotonic() - age
        runtime.pollers[poller.key] = poller
    await runtime.heartbeat()
    runtime.pollers.clear()
    async with db.public() as session:
        seen = dict((await session.execute(select(BusinessBot.id, BusinessBot.last_seen_at))).all())
    assert {bot_id for bot_id, seen_at in seen.items() if seen_at} == {working.id}


async def test_the_background_loop_notifies_staff_and_customers(runtime, db, shop, telegram):
    await add_bot(db, shop, 'client', CUSTOMER_TOKEN, 'a_bot', 2003)
    await add_bot(db, shop, 'admin', STAFF_TOKEN, 'a_admin_bot', 2002)
    await shop.link(5001, await shop.user('+998900000101', 'Xasan'))
    product = await shop.product('Kola', 'Кола', '12 000')
    order = await shop.order([(product, 1)], client=await shop.client(tg_id='777'))
    await shop.add(Outbox(kind='order_created', order_id=order.id))

    await runtime.reconcile()
    await asyncio.gather(*await runtime.notify())
    assert f'#{order.id}' in telegram.last('sendMessage', 5001, token=STAFF_TOKEN)['text']
    assert telegram.last('sendMessage', '777', token=CUSTOMER_TOKEN)['text'].startswith('✅ <b>Ваш заказ принят!</b>')
    assert await shop.count(OrderCard) == 1
    assert (await shop.one(Outbox)).sent_at is not None


def standing_pollers(runtime, telegram, *bots):
    """Pollers of (row, token) bots that do not poll — the background rounds work with them all the same."""
    for row, token in bots:
        key = f'bot{row.id}'
        runtime.pollers[key] = Poller(runtime, Target(key, token, row.role, row.id), telegram.bot(token))


async def customer_message(shop, tg_id, name='Kola'):
    product = await shop.product(name, name, '12 000')
    order = await shop.order([(product, 1)], client=await shop.client(tg_id=tg_id))
    return await shop.add(Outbox(kind='order_created', order_id=order.id))


async def test_a_slow_business_does_not_hold_up_the_others(runtime, db, shop, other_shop, telegram):
    slow = await add_bot(db, shop, 'client', CUSTOMER_TOKEN, 'a_bot', 2003)
    fast = await add_bot(db, other_shop, 'client', OTHER_TOKEN, 'b_bot', 3003)
    standing_pollers(runtime, telegram, (slow, CUSTOMER_TOKEN), (fast, OTHER_TOKEN))
    await customer_message(shop, '777')
    await customer_message(other_shop, '888')
    gate = telegram.hold('sendMessage', when=lambda call: call.token == CUSTOMER_TOKEN)  # Telegram is slow for it

    first = {task.get_name(): task for task in await runtime.notify()}
    await asyncio.wait_for(first[f'round-bot{fast.id}'], timeout=3)  # done while the slow one hangs
    assert telegram.last('sendMessage', '888', token=OTHER_TOKEN)
    # The next round: the slow bot's round still runs, so it is skipped; the other bot goes on.
    assert [task.get_name() for task in await runtime.notify()] == [f'round-bot{fast.id}']
    gate.set()
    await asyncio.gather(*first.values())
    assert len(telegram.payloads('sendMessage', '777')) == 1


async def test_rounds_run_side_by_side_but_at_most_four_at_once(runtime, db, telegram):
    bots = []
    for number in range(BUSINESS_JOBS + 2):
        shop = await make_business(db, f'shop_{number}', f'Shop {number}', f'shop-{number}')
        token = f'40{number}0:TOKEN-{number}-0000000000000000000000000'
        bots.append((await add_bot(db, shop, 'client', token, f'bot_{number}', 4000 + number), token))
    standing_pollers(runtime, telegram, *bots)
    running, most, gate = set(), [0], asyncio.Event()

    async def round_(business, poller):
        running.add(poller.key)
        most[0] = max(most[0], len(running))
        await gate.wait()
        running.discard(poller.key)

    runtime.outbox_job = round_
    started = await runtime.notify()
    await wait_until(lambda: len(running) == BUSINESS_JOBS)
    assert len(started) == BUSINESS_JOBS + 2
    assert await runtime.notify() == []  # every bot's round still runs or waits for its turn
    gate.set()
    await asyncio.gather(*started)
    assert most[0] == BUSINESS_JOBS and runtime.rounds == {}


async def test_telegram_trouble_pauses_that_bot_only(runtime, db, shop, other_shop, telegram):
    troubled = await add_bot(db, shop, 'client', CUSTOMER_TOKEN, 'a_bot', 2003)
    healthy = await add_bot(db, other_shop, 'client', OTHER_TOKEN, 'b_bot', 3003)
    standing_pollers(runtime, telegram, (troubled, CUSTOMER_TOKEN), (healthy, OTHER_TOKEN))
    for tg_id in ('771', '772', '773'):
        await customer_message(shop, tg_id, name=f'Kola {tg_id}')
    await customer_message(other_shop, '888')
    telegram.fail('sendMessage', NetworkFailure(), when=lambda call: call.token == CUSTOMER_TOKEN)

    await asyncio.gather(*await runtime.notify())
    assert len(telegram.payloads('sendMessage', token=CUSTOMER_TOKEN)) == 1  # one try, not one timeout per message
    assert telegram.last('sendMessage', '888', token=OTHER_TOKEN)
    paused = runtime.pollers[f'bot{troubled.id}']
    assert paused.not_before > time.monotonic() + BACKOFF_SECONDS - 5
    assert [task.get_name() for task in await runtime.notify()] == [f'round-bot{healthy.id}']

    telegram.heal()
    paused.not_before = 0  # the pause is over
    await asyncio.gather(*await runtime.notify())
    assert [payload['chat_id'] for payload in telegram.payloads('sendMessage', token=CUSTOMER_TOKEN)] == [
        '771', '772', '773']  # the failed one waits for its retry, the others go


async def test_run_serves_updates_and_stops_cleanly(db, shop, telegram, test_settings, monkeypatch):
    monkeypatch.setattr(runtime_module, 'HEARTBEAT_INTERVAL', 0.05)
    await add_bot(db, shop, 'client', CUSTOMER_TOKEN, 'a_bot', 2003)
    test_settings.platform_bot_token = PLATFORM_TOKEN
    telegram.updates[CUSTOMER_TOKEN] = [raw_message(7, 6001, '/start')]
    telegram.updates[PLATFORM_TOKEN] = [raw_message(9, 8008, 'salom')]
    runtime = Runtime(db, telegram.factory)
    task = asyncio.create_task(runtime.run())
    await wait_until(lambda: telegram.last('sendMessage', 6001) and telegram.last('sendMessage', 8008))
    assert 'Test Shop' in telegram.last('sendMessage', 6001, token=CUSTOMER_TOKEN)['text']
    assert 'DeliveryHub' in telegram.last('sendMessage', 8008, token=PLATFORM_TOKEN)['text']
    assert telegram.last('getUpdates', token=PLATFORM_TOKEN)['allowed_updates'] == [
        'message', 'callback_query', 'managed_bot']

    async def last_seen():
        async with db.public() as session:
            return await session.scalar(select(BusinessBot.last_seen_at))

    await wait_until(last_seen)  # the heartbeat, on its own schedule, once the bot has polled

    runtime.request_stop()
    await asyncio.wait_for(task, timeout=5)
    assert runtime.pollers == {}
    # Telegram learnt which updates were taken.
    assert telegram.last('getUpdates', token=CUSTOMER_TOKEN)['offset'] == 8
    assert telegram.updates[CUSTOMER_TOKEN] == []


async def test_an_update_cut_short_by_a_shutdown_is_not_delivered_again(db, telegram):
    """Telegram forgets an update once a getUpdates call with a later offset was made — which the poller does right
    away. So an update whose handling the shutdown cuts short is lost (never handled twice)."""
    runtime = Runtime(db, telegram.factory)
    started, cancelled = asyncio.Event(), []

    async def handle(poller, update):
        if update.update_id == 22:
            started.set()
            try:
                await asyncio.sleep(60)  # e.g. a voice order waiting for Gemini
            except asyncio.CancelledError:
                cancelled.append(update.update_id)
                raise

    runtime.handle = handle
    poller = runtime.pollers['bot1'] = Poller(runtime, Target('bot1', CUSTOMER_TOKEN, 'client', 1),
                                              telegram.bot(CUSTOMER_TOKEN))
    telegram.updates[CUSTOMER_TOKEN] = [raw_message(21, 10, 'a'), raw_message(22, 11, 'b'), raw_message(23, 12, 'c')]
    poller.start()
    await started.wait()
    await wait_until(lambda: telegram.last('getUpdates').get('offset') == 24)  # the next long poll
    await runtime.shutdown(timeout=0.1)
    assert cancelled == [22]
    assert telegram.last('getUpdates')['offset'] == 24
    assert telegram.updates[CUSTOMER_TOKEN] == []


async def test_the_real_http_session_talks_to_the_bot_api(db, shop, monkeypatch):
    """The production session (aiohttp, TELEGRAM_API_URL) against a local fake Bot API server."""
    received, queued = [], [raw_message(5, 6001, '/start')]

    async def bot_api(request):
        method, data = request.match_info['method'], dict(await request.post())
        received.append((request.match_info['token'], method, data))
        if method == 'getUpdates':
            result, queued[:] = list(queued), []
        elif method == 'sendMessage':
            result = {'message_id': 1, 'date': 1700000000, 'chat': {'id': int(data['chat_id']), 'type': 'private'}}
        else:
            result = True
        return web.json_response({'ok': True, 'result': result})

    server = web.Application()
    server.router.add_post('/bot{token}/{method}', bot_api)
    runner = web.AppRunner(server)
    await runner.setup()
    site = web.TCPSite(runner, '127.0.0.1', 0)
    await site.start()
    port = site._server.sockets[0].getsockname()[1]
    monkeypatch.setattr(settings, 'telegram_api_url', f'http://127.0.0.1:{port}')

    await add_bot(db, shop, 'client', CUSTOMER_TOKEN, 'a_bot', 2003)
    factory = BotFactory()
    runtime = Runtime(db, factory)
    try:
        await runtime.reconcile()
        await wait_until(lambda: any(method == 'sendMessage' for _, method, _ in received))
    finally:
        await runtime.shutdown(timeout=2)
        await factory.close()
        await runner.cleanup()
    token, _, sent = next(item for item in received if item[1] == 'sendMessage')
    assert token == CUSTOMER_TOKEN and sent['chat_id'] == '6001' and sent['parse_mode'] == 'HTML'
    assert '"url": "https://test-shop.example.uz/"' in sent['reply_markup']
