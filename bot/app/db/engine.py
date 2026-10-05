"""The async engine and sessions: one connection pool, a session per business schema."""
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from .models import TENANT


class Database:
    """`public()` — a session for the platform tables; `tenant(schema)` — a session in which every business
    table (mapped in the placeholder schema TENANT) means the table of that business's schema."""

    def __init__(self, engine: AsyncEngine):
        self.engine = engine
        self._public = async_sessionmaker(engine, expire_on_commit=False)
        self._tenants: dict[str, async_sessionmaker] = {}

    def public(self) -> AsyncSession:
        return self._public()

    def tenant(self, schema: str) -> AsyncSession:
        maker = self._tenants.get(schema)
        if maker is None:
            bind = self.engine.execution_options(schema_translate_map={TENANT: schema})
            maker = self._tenants[schema] = async_sessionmaker(bind, expire_on_commit=False)
        return maker()

    async def close(self):
        await self.engine.dispose()


def create_database(url=None, **engine_options) -> Database:
    # A 2 GB server: few idle PostgreSQL backends (4 kept; more only under load, closed when returned), the most
    # recently used first — it has the warm prepared statements. Every business schema has SQL texts of its own
    # (schema_translate_map), so that per-connection statement cache (an asyncpg DBAPI argument, 100 by default) is
    # sized for many schemas.
    options = {'pool_size': 4, 'max_overflow': 16, 'pool_use_lifo': True, 'pool_pre_ping': True, 'pool_recycle': 1800,
               'connect_args': {'prepared_statement_cache_size': 500}}
    options.update(engine_options)
    return Database(create_async_engine(url or settings.database_url, **options))
