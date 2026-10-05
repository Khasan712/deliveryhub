from sqlalchemy import event, text

from app import outbox
from app.db import create_database
from app.db.models import Order
from app.staff import service
from .conftest import CUSTOMER_TOKEN, STAFF_TOKEN


async def test_tables_exist_in_every_schema(db, shop, other_shop):
    async with db.engine.connect() as conn:
        rows = (await conn.execute(text(
            "SELECT table_schema, count(*) FROM information_schema.tables "
            "WHERE table_schema IN ('public', 'test_shop', 'other_shop') GROUP BY table_schema ORDER BY 1"
        ))).all()
    assert [schema for schema, _ in rows] == ['other_shop', 'public', 'test_shop']
    assert await shop.count(Order) == 0


async def test_polling_queries_carry_the_partial_index_predicates_in_their_sql(db, shop, telegram):
    """The predicate values are written into the SQL, not bound as parameters: a prepared statement with a generic
    plan can use a partial index only when its WHERE clause states the index's condition literally."""
    statements = []

    def capture(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    event.listen(db.engine.sync_engine, 'before_cursor_execute', capture)
    try:
        await service.push_new_orders(db, shop.info, telegram.bot(STAFF_TOKEN))
        await outbox.send_pending(db, shop.info, telegram.bot(CUSTOMER_TOKEN))
    finally:
        event.remove(db.engine.sync_engine, 'before_cursor_execute', capture)
    sql = '\n'.join(statements)
    assert "app_order.status = 'ordered'" in sql  # app_order_ordered_idx
    assert f'adminbot_outbox.attempts < {outbox.MAX_ATTEMPTS}' in sql  # adminbot_outbox_due
    assert 'status = $' not in sql and 'attempts < $' not in sql


async def test_the_pool_keeps_few_connections_and_a_big_statement_cache(database_url):
    db = create_database(database_url)
    try:
        pool = db.engine.pool
        assert (pool.size(), pool._max_overflow, pool._pool.use_lifo) == (4, 16, True)
        async with db.engine.connect() as conn:
            raw = await conn.get_raw_connection()
            assert raw.dbapi_connection._prepared_statement_cache.capacity == 500
    finally:
        await db.close()
