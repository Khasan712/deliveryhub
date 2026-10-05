"""Test fixtures: a real PostgreSQL (TEST_DATABASE_URL, a throwaway *_test database) with the mapped tables
created from the service's metadata in the public schema and in two business schemas; a fake Bot API.

    docker run --rm -d --name dh-bot-test-db -e POSTGRES_PASSWORD=test -p 55432:5432 postgres:16
"""
import asyncio
import inspect
import os
from datetime import timedelta

import pytest
import pytest_asyncio
from sqlalchemy import func, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.businesses import BusinessInfo
from app.config import settings
from app.crypto import encrypt
from app.db import Database
from app.db.models import (
    PUBLIC, TENANT, Base, Business, BusinessBot, Client, Descriptions, Order, OrderItem, Product, StaffLink, User,
)
from app.telegram.runtime import Handlers, handle_business_update, handle_platform_update
from app.utils import now
from .fakes import FakeTelegram

DATABASE_URL = os.getenv('TEST_DATABASE_URL', 'postgresql+asyncpg://postgres:test@127.0.0.1:55432/deliveryhub_bot_test')
SCHEMAS = ('test_shop', 'other_shop')
SECRET_KEY = 'test-secret-key-for-the-bot-service'


def _tables():
    names = []
    for table in Base.metadata.sorted_tables:
        if table.schema == PUBLIC:
            names.append(f'public."{table.name}"')
        else:
            names += [f'"{schema}"."{table.name}"' for schema in SCHEMAS]
    return ', '.join(names)


async def _prepare(url):
    url = make_url(url)
    if not url.database.endswith('_test'):
        raise RuntimeError('TEST_DATABASE_URL must point to a throwaway database named *_test')
    admin = create_async_engine(url.set(database='postgres'), isolation_level='AUTOCOMMIT', poolclass=NullPool)
    try:
        for attempt in range(30):  # a container that has just started may still be initialising
            try:
                async with admin.connect() as conn:
                    if not await conn.scalar(text('SELECT 1 FROM pg_database WHERE datname = :name'),
                                             {'name': url.database}):
                        await conn.execute(text(f'CREATE DATABASE "{url.database}"'))
                break
            except (OSError, DBAPIError) as exc:
                if attempt == 29:
                    raise RuntimeError(f'No test PostgreSQL at {url.host}:{url.port} — start it '
                                       '(see tests/conftest.py)') from exc
                await asyncio.sleep(1)
    finally:
        await admin.dispose()

    engine = create_async_engine(url, poolclass=NullPool)
    try:
        async with engine.begin() as conn:
            for schema in (*SCHEMAS, 'public'):
                await conn.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
                await conn.execute(text(f'CREATE SCHEMA "{schema}"'))
            for schema in SCHEMAS:
                await conn.run_sync(lambda sync, schema=schema: Base.metadata.create_all(
                    sync.execution_options(schema_translate_map={TENANT: schema})))
    finally:
        await engine.dispose()


@pytest.fixture(scope='session')
def database_url():
    asyncio.run(_prepare(DATABASE_URL))
    return DATABASE_URL


@pytest.fixture(autouse=True)
def test_settings(monkeypatch):
    monkeypatch.setattr(settings, 'secret_key', SECRET_KEY)
    monkeypatch.setattr(settings, 'platform_domain', 'example.uz')
    monkeypatch.setattr(settings, 'platform_bot_token', '')
    monkeypatch.setattr(settings, 'telegram_api_url', 'http://telegram.test')
    monkeypatch.setattr(settings, 'gemini_api_key', '')
    monkeypatch.setattr(settings, 'time_zone', 'Asia/Tashkent')
    return settings


@pytest_asyncio.fixture
async def db(database_url):
    engine = create_async_engine(database_url, pool_size=5, max_overflow=5)
    async with engine.begin() as conn:
        await conn.execute(text(f'TRUNCATE {_tables()} RESTART IDENTITY CASCADE'))
    database = Database(engine)
    yield database
    await database.close()


@pytest.fixture
def telegram():
    return FakeTelegram()


@pytest.fixture
def handlers():
    return Handlers()


# ---------------------------------------------------------------------------
# data
# ---------------------------------------------------------------------------

class Shop:
    """A business with helpers that write its rows the way the backend would."""

    def __init__(self, db, info):
        self.db = db
        self.info = info

    @property
    def schema(self):
        return self.info.schema_name

    def session(self):
        return self.db.tenant(self.schema)

    async def add(self, *rows):
        async with self.session() as session:
            session.add_all(rows)
            await session.commit()
        return rows[0] if len(rows) == 1 else rows

    async def user(self, phone, first_name=None, role='admin', is_active=True):
        return await self.add(User(phone_number=phone, first_name=first_name, role=role, is_active=is_active))

    async def product(self, name_uz, name_ru, price, unit=None):
        return await self.add(Product(name_uz=name_uz, name_ru=name_ru, price=price,
                                      measure_id=unit.id if unit else None))

    async def unit(self):
        return await self.add(Descriptions(name_uz='dona', name_ru='шт'))

    async def link(self, telegram_id, user, first_name='', lang='uz'):
        return await self.add(StaffLink(telegram_id=telegram_id, user_id=user.id, first_name=first_name, lang=lang))

    async def client(self, tg_id='777', lang='ru', first_name='Aziz'):
        return await self.add(Client(tg_id=tg_id, lang=lang, first_name=first_name))

    async def order(self, items, client=None, status='ordered', source='miniapp', created_by=None, **fields):
        """An order as the shop or the admin panel creates it."""
        fields = {'phone': '+998901234567', 'location': 'Chilonzor 9', 'delivery_type': 'delivery',
                  'payment_method': 'card', **fields}
        stamp = fields.pop('stamp', None) or now()
        order = await self.add(Order(client_id=client.id if client else None, status=status, source=source,
                                     created_by_id=created_by.id if created_by else None, created_at=stamp,
                                     updated_at=stamp, **fields))
        await self.add(*[OrderItem(order_id=order.id, product_id=product.id, quantity=str(quantity),
                                   price=product.price) for product, quantity in items])
        return order

    async def all(self, model, *where, order_by=None):
        async with self.session() as session:
            statement = select(model).where(*where).order_by(order_by if order_by is not None else model.id)
            return list((await session.scalars(statement)).all())

    async def one(self, model, *where):
        rows = await self.all(model, *where)
        assert len(rows) == 1, rows
        return rows[0]

    async def count(self, model, *where):
        async with self.session() as session:
            return await session.scalar(select(func.count()).select_from(model).where(*where))

    async def update(self, statement):
        async with self.session() as session:
            await session.execute(statement)
            await session.commit()


async def make_business(db, schema, name, slug, **fields):
    async with db.public() as session:
        business = Business(schema_name=schema, name=name, slug=slug, **fields)
        session.add(business)
        await session.commit()
        return Shop(db, BusinessInfo.of(business))


@pytest_asyncio.fixture
async def shop(db):
    return await make_business(db, 'test_shop', 'Test Shop', 'test-shop')


@pytest_asyncio.fixture
async def other_shop(db):
    return await make_business(db, 'other_shop', 'Other Shop', 'other-shop')


async def add_bot(db, shop, role, token, username, telegram_id, **fields):
    async with db.public() as session:
        bot = BusinessBot(business_id=shop.info.id, role=role, telegram_id=telegram_id, username=username,
                          token_encrypted=encrypt(token), **fields)
        session.add(bot)
        await session.commit()
        return bot


class BotDriver:
    """Feeds updates to one bot the way the runtime does."""

    def __init__(self, handlers, db, telegram, row, token):
        self.handlers = handlers
        self.db = db
        self.telegram = telegram
        self.row = row
        self.bot = telegram.bot(token)

    async def send(self, update):
        await handle_business_update(self.handlers, self.db, self.row.id, self.bot, update)


class PlatformDriver:
    def __init__(self, handlers, db, telegram, token):
        self.handlers = handlers
        self.db = db
        self.telegram = telegram
        self.bot = telegram.bot(token)

    async def send(self, update):
        await handle_platform_update(self.handlers, self.db, self.telegram.factory, self.bot, update)


STAFF_TOKEN = '2002:TEST-TOKEN-staff-bot-0000000000000'
CUSTOMER_TOKEN = '2003:TEST-TOKEN-client-bot-000000000000'


@pytest_asyncio.fixture
async def staff_bot(db, shop, telegram, handlers):
    row = await add_bot(db, shop, 'admin', STAFF_TOKEN, 'test_admin_bot', 2002)
    return BotDriver(handlers, db, telegram, row, STAFF_TOKEN)


@pytest_asyncio.fixture
async def customer_bot(db, shop, telegram, handlers):
    row = await add_bot(db, shop, 'client', CUSTOMER_TOKEN, 'testshop_bot', 2003)
    return BotDriver(handlers, db, telegram, row, CUSTOMER_TOKEN)


def ago(**delta):
    return now() - timedelta(**delta)


async def wait_until(condition, timeout=3.0):
    """Lets background tasks (pollers, handlers) run until `condition()` (a plain or an async function) holds."""
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout
    while True:
        met = condition()
        if inspect.isawaitable(met):
            met = await met
        if met:
            return
        if loop.time() > deadline:
            raise AssertionError('condition not met in time')
        await asyncio.sleep(0.01)
