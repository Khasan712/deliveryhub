"""The bot runtime: long-polls every active bot of every business and our platform bot, handles each update in
the schema of its business, pushes new orders to staff chats, keeps their order cards in sync and sends the
customer messages of the outbox. Bots connected or switched off in the panel are picked up within
RECONCILE_INTERVAL; a bot whose token changed, or whose poller died, is restarted."""
import asyncio
import logging
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass, field

from aiogram.exceptions import TelegramAPIError, TelegramConflictError, TelegramNotFound, TelegramUnauthorizedError
from aiogram.utils.token import TokenValidationError
from cryptography.fernet import InvalidToken

from app import businesses, outbox
from app.businesses import BusinessInfo
from app.config import settings
from app.crypto import decrypt
from app.customer import handlers as customer
from app.db.models import BusinessBot
from app.platform import handlers as platform
from app.staff import handlers as staff
from app.staff import service as staff_service
from .api import ERRORS, Backoff, describe
from .configure import configure_bot

logger = logging.getLogger('bots')

POLL_TIMEOUT = 50
# A bot counts as working while its last successful getUpdates is this recent (a long poll ends within POLL_TIMEOUT).
ALIVE_WINDOW = POLL_TIMEOUT + 20
RECONCILE_INTERVAL = 10
ORDERS_INTERVAL = 3
HEARTBEAT_INTERVAL = 30
WORKERS = 16
# Background rounds (staff cards, customer messages) of different bots running at once.
BUSINESS_JOBS = 4
# Docker stops a container with SIGKILL 10 s after SIGTERM.
SHUTDOWN_TIMEOUT = 8
BUSINESS_UPDATES = ['message', 'callback_query']
PLATFORM_UPDATES = ['message', 'callback_query', 'managed_bot']
PLATFORM = 'platform'


@dataclass(frozen=True)
class Target:
    """A bot the runtime should poll: our platform bot, or a business's customers' / staff bot."""
    key: str
    token: str = field(repr=False)
    role: str  # PLATFORM, BusinessBot.ROLE_CLIENT or BusinessBot.ROLE_ADMIN
    bot_id: int | None = None
    username: str = ''
    business: BusinessInfo | None = None


class Handlers:
    """The dispatchers (routers, filters, middlewares) of the three kinds of bots."""

    def __init__(self):
        self.staff = staff.build_dispatcher()
        self.customer = customer.build_dispatcher()
        self.platform = platform.build_dispatcher()


async def handle_business_update(handlers, db, bot_id, bot, update):
    """An update of a business's bot, handled in that business's schema — unless the bot or the business was
    switched off meanwhile."""
    async with db.public() as session:
        found = await businesses.load_bot(session, bot_id)
    if found is None:
        return
    row, business = found
    if not row.is_active or not business.is_active:
        return
    dispatcher = handlers.staff if row.role == BusinessBot.ROLE_ADMIN else handlers.customer
    await dispatcher.feed_update(bot, update, db=db, business=business)


async def handle_platform_update(handlers, db, bot_factory, bot, update):
    await handlers.platform.feed_update(bot, update, db=db, bot_factory=bot_factory)


def sender_of(update):
    source = update.message or update.callback_query or update.managed_bot
    user = (getattr(source, 'from_user', None) or getattr(source, 'user', None)) if source else None
    return user.id if user else None


class KeyedLocks:
    """One asyncio.Lock per key, dropped when nobody holds or waits for it. Waiters get it in arrival order."""

    def __init__(self):
        self._locks = {}

    @asynccontextmanager
    async def hold(self, key):
        entry = self._locks.get(key)
        if entry is None:
            entry = self._locks[key] = [asyncio.Lock(), 0]
        entry[1] += 1
        try:
            async with entry[0]:
                yield
        finally:
            entry[1] -= 1
            if not entry[1]:
                del self._locks[key]

    def __len__(self):
        return len(self._locks)


def pause_after(exc):
    """Seconds a poller waits after a failed call. 409: somebody else polls this bot (an old container?) — back off
    instead of fighting it; a bad token (401 / 404) will not heal in 3 s either."""
    return 30 if isinstance(exc, (TelegramUnauthorizedError, TelegramNotFound, TelegramConflictError)) else 3


class Poller:
    """The getUpdates loop of one bot."""

    def __init__(self, runtime, target, bot):
        self.runtime = runtime
        self.target = target
        self.bot = bot
        self.offset = None
        # None — starting, True — Telegram answers, False — the last call failed (bad token, conflict, network).
        self.healthy = None
        self.polled_at = None  # time.monotonic() of the last successful getUpdates
        # After Telegram trouble in a background round of this bot, the next one waits until then (monotonic).
        self.not_before = 0.0
        self.stopped = asyncio.Event()
        self.task = None

    @property
    def key(self):
        return self.target.key

    @property
    def allowed_updates(self):
        return PLATFORM_UPDATES if self.target.role == PLATFORM else BUSINESS_UPDATES

    def is_alive(self):
        """Telegram answered its getUpdates lately — a bot that is starting, failing or whose poller died is not."""
        return bool(self.healthy and self.polled_at is not None and time.monotonic() - self.polled_at <= ALIVE_WINDOW)

    def start(self):
        self.task = asyncio.create_task(self.run(), name=f'poll-{self.key}')

    async def run(self):
        """Polls until stop(). No error ends the loop — a poller that died would go unnoticed (it is logged, the
        poller waits a little and goes on)."""
        if self.target.business is not None:
            try:
                await configure_bot(self.bot, self.target.role, self.target.business, self.target.username)
            except Exception:  # the bot works without its commands and menu button
                logger.exception('%s: configuring failed', self.key)
        webhook_deleted = False
        while not self.stopped.is_set():
            try:
                if not webhook_deleted:
                    await self.bot.delete_webhook()  # polling and a webhook cannot be used together
                    webhook_deleted = True
                await self.poll_once()
            except Exception as exc:  # e.g. an HTML error page instead of the Bot API's JSON
                self.healthy = False
                if isinstance(exc, TelegramAPIError):
                    logger.warning('%s: polling failed: %s', self.key, describe(exc))
                else:
                    logger.exception('%s: polling failed', self.key)
                await self.pause(pause_after(exc))

    async def poll_once(self, timeout=POLL_TIMEOUT):
        try:
            updates = await self.bot.get_updates(offset=self.offset, timeout=timeout,
                                                 allowed_updates=self.allowed_updates, request_timeout=timeout + 10)
        except TelegramAPIError as exc:
            self.healthy = False
            logger.warning('%s: getUpdates failed: %s', self.key, describe(exc))
            await self.pause(pause_after(exc))
            return
        except Exception:  # e.g. an answer aiogram cannot read: keep polling
            self.healthy = False
            logger.exception('%s: getUpdates failed', self.key)
            await self.pause(3)
            return
        self.healthy, self.polled_at = True, time.monotonic()
        for update in updates:
            self.offset = update.update_id + 1
            self.runtime.submit(self, update)

    async def pause(self, seconds):
        try:
            await asyncio.wait_for(self.stopped.wait(), timeout=seconds)
        except TimeoutError:
            pass

    async def stop(self):
        """Stops polling at once (a long poll in progress is cancelled)."""
        self.stopped.set()
        if self.task and not self.task.done():
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
            except Exception:  # pragma: no cover
                logger.exception('%s: poller failed', self.key)

    async def confirm(self):
        """Tells Telegram which updates were taken, so they are not handled again after a restart. (Every
        getUpdates call does that for the updates before its offset: an update taken is never delivered again,
        even if its handling is cut short.)"""
        if self.offset is None:
            return
        try:
            await self.bot.get_updates(offset=self.offset, limit=1, timeout=0, request_timeout=5)
        except ERRORS:
            pass


class Runtime:
    def __init__(self, db, bot_factory, handlers=None, workers=WORKERS):
        self.db = db
        self.bot_factory = bot_factory
        self.handlers = handlers or Handlers()
        self.pollers = {}
        self.locks = KeyedLocks()
        self.workers = asyncio.Semaphore(workers)
        self.tasks = set()
        self.rounds = {}  # bot key → its background round (staff cards or customer messages) while it runs
        self.round_slots = asyncio.Semaphore(BUSINESS_JOBS)
        self.stopping = asyncio.Event()
        self.unreadable = set()  # bots with a token that cannot be used, already reported

    # --- updates -------------------------------------------------------------

    def submit(self, poller, update):
        task = asyncio.create_task(self.dispatch(poller, update))
        self.tasks.add(task)
        task.add_done_callback(self.tasks.discard)
        return task

    async def dispatch(self, poller, update):
        # One chat at a time and in order; different chats and bots in parallel.
        async with self.locks.hold((poller.key, sender_of(update))):
            async with self.workers:
                try:
                    await self.handle(poller, update)
                except Exception:
                    logger.exception('%s: update %s failed', poller.key, update.update_id)

    async def handle(self, poller, update):
        if poller.target.role == PLATFORM:
            await handle_platform_update(self.handlers, self.db, self.bot_factory, poller.bot, update)
        else:
            await handle_business_update(self.handlers, self.db, poller.target.bot_id, poller.bot, update)

    # --- which bots run ------------------------------------------------------

    async def desired_bots(self):
        desired = {}
        if settings.platform_bot_token:
            desired[PLATFORM] = Target(PLATFORM, settings.platform_bot_token, PLATFORM)
        async with self.db.public() as session:
            rows = await businesses.active_bots(session)
        for row, business in rows:
            try:
                token = decrypt(row.token_encrypted)
            except InvalidToken:
                if (row.id, row.token_encrypted) not in self.unreadable:
                    self.unreadable.add((row.id, row.token_encrypted))
                    logger.warning('@%s: the token cannot be decrypted (SECRET_KEY changed?) — connect the bot again',
                                   row.username)
                continue
            key = f'bot{row.id}'
            desired[key] = Target(key, token, row.role, row.id, row.username, business)
        return desired

    async def reconcile(self):
        desired = await self.desired_bots()
        stopped = []
        for key, poller in list(self.pollers.items()):
            died = poller.task is not None and poller.task.done()
            if died:  # it should not happen (Poller.run survives errors), so it is not left to chance either
                error = None if poller.task.cancelled() else poller.task.exception()
                logger.error('%s: the poller stopped by itself — restarting it', key, exc_info=error)
            if key not in desired or desired[key].token != poller.target.token or died:
                del self.pollers[key]
                stopped.append(poller)
        for poller in stopped:
            await poller.stop()
        await asyncio.gather(*(poller.confirm() for poller in stopped))
        for poller in stopped:
            logger.info('%s: stopped', poller.key)
        for key, target in desired.items():
            if key not in self.pollers:
                try:
                    bot = self.bot_factory.make(target.token)
                except TokenValidationError:
                    if (key, target.token) not in self.unreadable:
                        self.unreadable.add((key, target.token))
                        logger.warning('%s: the token is malformed — the bot is not started', key)
                    continue
                poller = self.pollers[key] = Poller(self, target, bot)
                poller.start()
                logger.info('%s: polling @%s', key, target.username or key)

    # --- staff notifications and customer messages ----------------------------

    async def notify(self):
        """Starts a background round for every business bot that runs: new orders → staff chats and statuses
        changed elsewhere → their cards (staff bot), the outbox → customers (customers' bot). The rounds run side by
        side, BUSINESS_JOBS at most, so a slow business does not hold up the others; a bot whose previous round
        still runs, or that Telegram trouble paused, is skipped. Returns the started rounds."""
        async with self.db.public() as session:
            rows = await businesses.active_bots(session)
        started = []
        current = time.monotonic()
        for row, business in rows:
            key = f'bot{row.id}'
            poller = self.pollers.get(key)
            if poller is None or key in self.rounds or current < poller.not_before or self.stopping.is_set():
                continue
            job = self.staff_job if row.role == BusinessBot.ROLE_ADMIN else self.outbox_job
            task = self.rounds[key] = asyncio.create_task(self.limited(job, business, poller), name=f'round-{key}')
            task.add_done_callback(lambda _task, key=key: self.rounds.pop(key, None))
            started.append(task)
        return started

    async def limited(self, job, business, poller):
        async with self.round_slots:
            if not self.stopping.is_set():
                await job(business, poller)

    async def staff_job(self, business, poller):
        try:
            await staff_service.push_new_orders(self.db, business, poller.bot, self.stopping)
            await staff_service.sync_changed_orders(self.db, business, poller.bot, self.stopping)
        except Backoff as exc:
            self.back_off(poller, exc)
        except Exception:
            logger.exception('Order notifications of %s failed', business.slug)

    async def outbox_job(self, business, poller):
        try:
            await outbox.send_pending(self.db, business, poller.bot, self.stopping)
        except Backoff as exc:
            self.back_off(poller, exc)
        except Exception:
            logger.exception('Customer messages of %s failed', business.slug)

    def back_off(self, poller, exc):
        poller.not_before = time.monotonic() + exc.delay
        logger.warning('%s: Telegram trouble (%s) — its next round in %s s', poller.key, exc, exc.delay)

    async def heartbeat(self):
        """The admin panels show a bot as working while its last_seen_at is fresh."""
        alive = [poller.target.bot_id for poller in self.pollers.values() if poller.target.bot_id and poller.is_alive()]
        async with self.db.public() as session:
            await businesses.mark_alive(session, alive)
            await session.commit()

    # --- main loop -------------------------------------------------------------

    async def run(self):
        """Until request_stop(): reconcile, heartbeat and the background rounds, each on its own schedule — a slow
        reconcile never holds up the order notifications, nor the other way round."""
        logger.info('Bot runtime started')
        try:
            await asyncio.gather(
                self.every(RECONCILE_INTERVAL, self.reconcile),
                self.every(HEARTBEAT_INTERVAL, self.heartbeat),
                self.every(ORDERS_INTERVAL, self.notify),
            )
        finally:
            await self.shutdown()

    async def every(self, seconds, job):
        while not self.stopping.is_set():
            try:
                await job()
            except Exception:
                logger.exception('Bot runtime: %s failed', job.__name__)
            try:
                await asyncio.wait_for(self.stopping.wait(), timeout=seconds)
            except TimeoutError:
                pass

    def request_stop(self):
        self.stopping.set()

    async def shutdown(self, timeout=SHUTDOWN_TIMEOUT):
        """Polling stops at once; updates being handled and background rounds (they stop between two messages) may
        finish within `timeout`, the rest are cancelled; then Telegram is told which updates were taken. An update
        cut short is lost: Telegram does not deliver an update again once it was taken."""
        self.stopping.set()
        pollers = list(self.pollers.values())
        self.pollers.clear()
        for poller in pollers:
            await poller.stop()
        running = self.tasks | set(self.rounds.values())
        if running:
            _done, unfinished = await asyncio.wait(running, timeout=timeout)
            for task in unfinished:
                task.cancel()
            if unfinished:
                logger.warning('Shutdown: %s updates / rounds cut short', len(unfinished))
        await asyncio.gather(*(poller.confirm() for poller in pollers))
        logger.info('Bot runtime stopped')
