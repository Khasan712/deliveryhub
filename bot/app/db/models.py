"""The tables the bot service uses, mapped from the backend's Django models.

The backend owns the schema (Django migrations); the service never creates or alters tables at runtime
(`Base.metadata.create_all` is used only by the tests). Column names, types and constraints follow the
migrations of apps/core (label `app`), apps/platform (label `hub`) and apps/telegram (label `adminbot`).
Django keeps no column defaults in the database (except `db_default` columns: app_order.source,
app_telegramlogintoken.status and adminbot_outbox), so every insert here fills every NOT NULL column.

* public schema (django-tenants SHARED_APPS): hub_business, hub_businessbot, hub_botsetup;
* every business schema (TENANT_APPS): app_*, adminbot_* — mapped in the placeholder schema TENANT and
  translated to the business's schema per session (`Database.tenant`, schema_translate_map).
Read-only tables (users, products, businesses) map only the columns the bots read.
"""
from datetime import datetime

from sqlalchemy import (
    BigInteger, Boolean, CheckConstraint, DateTime, ForeignKey, Identity, Index, MetaData, SmallInteger, String,
    Text, UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.utils import now

PUBLIC = 'public'
TENANT = 'tenant'


class Base(DeclarativeBase):
    metadata = MetaData()


def _pk():
    return mapped_column(BigInteger, Identity(), primary_key=True)


def _fk(target):
    # Django creates foreign keys DEFERRABLE INITIALLY DEFERRED and emulates ON DELETE itself.
    return ForeignKey(target, deferrable=True, initially='DEFERRED')


def _created(**kwargs):
    return mapped_column(DateTime(timezone=True), default=now, **kwargs)


def _updated():
    # Django's auto_now: set on every save.
    return mapped_column(DateTime(timezone=True), default=now, onupdate=now)


# ---------------------------------------------------------------------------
# public schema: the platform
# ---------------------------------------------------------------------------

class Business(Base):
    """hub.Business — a django-tenants tenant; its data lives in the schema `schema_name`."""
    __tablename__ = 'hub_business'
    __table_args__ = {'schema': PUBLIC}
    STATUS_ACTIVE = 'active'
    STATUS_SUSPENDED = 'suspended'

    id: Mapped[int] = _pk()
    schema_name: Mapped[str] = mapped_column(String(63), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    slug: Mapped[str] = mapped_column(String(40), unique=True)
    status: Mapped[str] = mapped_column(String(20), default=STATUS_ACTIVE)
    support_phone: Mapped[str] = mapped_column(String(30), default='')


class BusinessBot(Base):
    """hub.BusinessBot — the customers' bot (role client) or the staff bot (role admin) of a business."""
    __tablename__ = 'hub_businessbot'
    __table_args__ = (
        UniqueConstraint('business_id', 'role', name='hub_one_bot_per_role'),
        {'schema': PUBLIC},
    )
    ROLE_CLIENT = 'client'
    ROLE_ADMIN = 'admin'
    VIA_MANAGED = 'managed'
    VIA_TOKEN = 'token'

    id: Mapped[int] = _pk()
    business_id: Mapped[int] = mapped_column(BigInteger, _fk(f'{PUBLIC}.hub_business.id'), index=True)
    role: Mapped[str] = mapped_column(String(10))
    telegram_id: Mapped[int] = mapped_column(BigInteger, unique=True)
    username: Mapped[str] = mapped_column(String(64))
    name: Mapped[str] = mapped_column(String(128), default='')
    token_encrypted: Mapped[str] = mapped_column(Text)
    created_via: Mapped[str] = mapped_column(String(10), default=VIA_TOKEN)
    owner_telegram_id: Mapped[int | None] = mapped_column(BigInteger)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _created()


class BotSetup(Base):
    """hub.BotSetup — a link to our platform bot that creates the bots of a business (only a hash is stored)."""
    __tablename__ = 'hub_botsetup'
    __table_args__ = {'schema': PUBLIC}

    id: Mapped[int] = _pk()
    business_id: Mapped[int] = mapped_column(BigInteger, _fk(f'{PUBLIC}.hub_business.id'), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    telegram_user_id: Mapped[int | None] = mapped_column(BigInteger, index=True)
    created_at: Mapped[datetime] = _created()
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


# ---------------------------------------------------------------------------
# business schema: catalog, customers, orders (app)
# ---------------------------------------------------------------------------

class User(Base):
    """app.User of a business: staff accounts of the admin panel (read only)."""
    __tablename__ = 'app_user'
    __table_args__ = {'schema': TENANT}

    id: Mapped[int] = _pk()
    first_name: Mapped[str | None] = mapped_column(String(100))
    last_name: Mapped[str | None] = mapped_column(String(100))
    phone_number: Mapped[str] = mapped_column(String(100), unique=True)
    role: Mapped[str] = mapped_column(String(10))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)


class Descriptions(Base):
    """app.Descriptions — units of measure ("dona" / "шт")."""
    __tablename__ = 'app_descriptions'
    __table_args__ = {'schema': TENANT}

    id: Mapped[int] = _pk()
    name_uz: Mapped[str] = mapped_column(String(100))
    name_ru: Mapped[str] = mapped_column(String(100))


class Product(Base):
    __tablename__ = 'app_product'
    __table_args__ = {'schema': TENANT}

    id: Mapped[int] = _pk()
    name_uz: Mapped[str] = mapped_column(String(255))
    name_ru: Mapped[str] = mapped_column(String(255))
    # Stored as text ("35 000"): see utils.parse_price.
    price: Mapped[str] = mapped_column(String(255))
    measure_id: Mapped[int | None] = mapped_column(BigInteger, _fk(f'{TENANT}.app_descriptions.id'), index=True)
    category_id: Mapped[int | None] = mapped_column(BigInteger)
    # Frozen by the business (sold out): customers cannot order it; staff still may, with a warning.
    is_frozen: Mapped[bool] = mapped_column(Boolean, default=False)


class Client(Base):
    """app.Client — a customer (of the shop, the Mini App or the customers' bot)."""
    __tablename__ = 'app_client'
    __table_args__ = {'schema': TENANT}

    id: Mapped[int] = _pk()
    first_name: Mapped[str | None] = mapped_column(String(100))
    last_name: Mapped[str | None] = mapped_column(String(100))
    phone: Mapped[str | None] = mapped_column(String(100))
    tg_phone: Mapped[str | None] = mapped_column(String(100))
    tg_id: Mapped[str | None] = mapped_column(String(100), unique=True)
    tg_nick: Mapped[str | None] = mapped_column(String(100))
    location: Mapped[str | None] = mapped_column(String(255))
    l_t: Mapped[str | None] = mapped_column(String(255))
    e_t: Mapped[str | None] = mapped_column(String(255))
    lang: Mapped[str | None] = mapped_column(String(10))
    phone_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = _updated()


class Order(Base):
    __tablename__ = 'app_order'
    __table_args__ = {'schema': TENANT}

    id: Mapped[int] = _pk()
    client_id: Mapped[int | None] = mapped_column(BigInteger, _fk(f'{TENANT}.app_client.id'), index=True)
    # new (a cart) / ordered / on_the_way / completed / rejected
    status: Mapped[str] = mapped_column(String(100))
    phone: Mapped[str | None] = mapped_column(String(100))
    location: Mapped[str | None] = mapped_column(String(255))
    l_t: Mapped[str | None] = mapped_column(String(255))
    e_t: Mapped[str | None] = mapped_column(String(255))
    # bot / web / miniapp / admin (db_default 'bot')
    source: Mapped[str] = mapped_column(String(20), server_default='bot')
    customer_name: Mapped[str | None] = mapped_column(String(150))
    delivery_type: Mapped[str | None] = mapped_column(String(20))
    payment_method: Mapped[str | None] = mapped_column(String(20))
    comment: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[int | None] = mapped_column(BigInteger, _fk(f'{TENANT}.app_user.id'), index=True)
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = _updated()


class OrderItem(Base):
    __tablename__ = 'app_orderitem'
    __table_args__ = {'schema': TENANT}

    id: Mapped[int] = _pk()
    order_id: Mapped[int | None] = mapped_column(BigInteger, _fk(f'{TENANT}.app_order.id'), index=True)
    product_id: Mapped[int | None] = mapped_column(BigInteger, _fk(f'{TENANT}.app_product.id'), index=True)
    quantity: Mapped[str | None] = mapped_column(String(50))
    price: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = _updated()


class TelegramLoginToken(Base):
    """Website sign-in through the customers' bot: t.me/<bot>?start=login_<token>."""
    __tablename__ = 'app_telegramlogintoken'
    __table_args__ = {'schema': TENANT}

    id: Mapped[int] = _pk()
    token: Mapped[str] = mapped_column(String(64), unique=True)
    # pending / confirmed / used (db_default 'pending')
    status: Mapped[str] = mapped_column(String(20), server_default='pending')
    client_id: Mapped[int | None] = mapped_column(BigInteger, _fk(f'{TENANT}.app_client.id'), index=True)
    created_at: Mapped[datetime] = _created()
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# ---------------------------------------------------------------------------
# business schema: Telegram bookkeeping (adminbot)
# ---------------------------------------------------------------------------

class StaffLink(Base):
    """A staff member's Telegram account connected to their admin-panel user."""
    __tablename__ = 'adminbot_stafflink'
    __table_args__ = {'schema': TENANT}

    id: Mapped[int] = _pk()
    telegram_id: Mapped[int] = mapped_column(BigInteger, unique=True)
    user_id: Mapped[int] = mapped_column(BigInteger, _fk(f'{TENANT}.app_user.id'), index=True)
    first_name: Mapped[str] = mapped_column(String(150), default='')
    username: Mapped[str] = mapped_column(String(100), default='')
    lang: Mapped[str] = mapped_column(String(2), default='uz')
    notify_orders: Mapped[bool] = mapped_column(Boolean, default=True)
    # Set when Telegram refuses delivery (the bot was blocked); cleared when the person writes again.
    blocked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _created()
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class StaffInvite(Base):
    """One-time link t.me/<staff bot>?start=inv_<token>, created by the admin panel (only a hash is stored)."""
    __tablename__ = 'adminbot_staffinvite'
    __table_args__ = {'schema': TENANT}

    id: Mapped[int] = _pk()
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    user_id: Mapped[int] = mapped_column(BigInteger, _fk(f'{TENANT}.app_user.id'), index=True)
    created_by_id: Mapped[int | None] = mapped_column(BigInteger, _fk(f'{TENANT}.app_user.id'), index=True)
    created_at: Mapped[datetime] = _created()
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Draft(Base):
    """The order being dictated in a staff chat (one per staff member)."""
    __tablename__ = 'adminbot_draft'
    __table_args__ = {'schema': TENANT}

    id: Mapped[int] = _pk()
    staff_id: Mapped[int] = mapped_column(BigInteger, _fk(f'{TENANT}.adminbot_stafflink.id'), unique=True)
    # The same form as the admin panel's voice entry (ai.understanding.clean_state).
    state: Mapped[dict] = mapped_column(JSONB, default=lambda: {})
    transcript: Mapped[str] = mapped_column(Text, default='')
    unmatched: Mapped[list] = mapped_column(JSONB, default=lambda: [])
    # The card with the ✅ / ❌ buttons.
    message_id: Mapped[int | None] = mapped_column(BigInteger)
    updated_at: Mapped[datetime] = _updated()


class OrderTicket(Base):
    """Bot bookkeeping for an order: staff were told about it, who accepted it and who changed it last."""
    __tablename__ = 'adminbot_orderticket'
    __table_args__ = {'schema': TENANT}

    id: Mapped[int] = _pk()
    order_id: Mapped[int] = mapped_column(BigInteger, _fk(f'{TENANT}.app_order.id'), unique=True)
    # The order status the cards in the chats currently show.
    status_seen: Mapped[str] = mapped_column(String(20))
    accepted_by_id: Mapped[int | None] = mapped_column(BigInteger, _fk(f'{TENANT}.app_user.id'), index=True)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    changed_by_id: Mapped[int | None] = mapped_column(BigInteger, _fk(f'{TENANT}.app_user.id'), index=True)
    changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _created(index=True)


class OrderCard(Base):
    """A message about an order in a staff chat; every copy is updated when the order changes."""
    __tablename__ = 'adminbot_ordercard'
    __table_args__ = (
        UniqueConstraint('chat_id', 'message_id', name='adminbot_card_message'),
        {'schema': TENANT},
    )

    id: Mapped[int] = _pk()
    ticket_id: Mapped[int] = mapped_column(BigInteger, _fk(f'{TENANT}.adminbot_orderticket.id'), index=True)
    chat_id: Mapped[int] = mapped_column(BigInteger)
    message_id: Mapped[int] = mapped_column(BigInteger)
    created_at: Mapped[datetime] = _created()


class Outbox(Base):
    """A message to a customer, sent from the business's customers' bot. The backend (and the staff bot) write
    a row when an order is placed or its status changes; the service sends it and sets sent_at.
    Unlike the other tables, this one has database defaults (migration adminbot 0003_outbox)."""
    __tablename__ = 'adminbot_outbox'
    __table_args__ = (
        CheckConstraint('attempts >= 0', name='adminbot_outbox_attempts_check'),
        Index('adminbot_outbox_pending', 'sent_at', 'id'),
        {'schema': TENANT},
    )
    KIND_ORDER_CREATED = 'order_created'
    KIND_ORDER_STATUS = 'order_status'

    id: Mapped[int] = _pk()
    kind: Mapped[str] = mapped_column(String(30))
    order_id: Mapped[int] = mapped_column(BigInteger, _fk(f'{TENANT}.app_order.id'), index=True)
    # For order_status: accepted, on_the_way, completed or rejected.
    event: Mapped[str] = mapped_column(String(30), default='', server_default='')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, server_default=func.now())
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(SmallInteger, default=0, server_default='0')
    error: Mapped[str] = mapped_column(String(200), default='', server_default='')
