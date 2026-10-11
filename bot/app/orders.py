"""Orders as the bots see them (an order with its customer, author and items) and order creation, with the
rules of the backend (apps.core.services): prices always come from the catalog."""
from dataclasses import dataclass, field

from sqlalchemy import select

from .db.models import Client, Order, OrderItem, Product, User
from .utils import now, parse_price, parse_quantity

MAX_ITEM_QUANTITY = 99

NEW = 'new'  # an unfinished cart
ORDERED = 'ordered'
ON_THE_WAY = 'on_the_way'
COMPLETED = 'completed'
REJECTED = 'rejected'

DELIVERY = 'delivery'
PICKUP = 'pickup'
DELIVERY_TYPES = (DELIVERY, PICKUP)
PAYMENT_METHODS = ('cash', 'card')

SOURCE_ADMIN = 'admin'
SOURCES = ('bot', 'web', 'miniapp', 'admin')


class OrderError(ValueError):
    def __init__(self, code, detail=None):
        super().__init__(code)
        self.code = code
        self.detail = detail


@dataclass
class Line:
    item: OrderItem
    product: Product | None

    @property
    def quantity(self):
        return self.item.quantity

    @property
    def total(self):
        return parse_price(self.item.price) * parse_quantity(self.item.quantity)


@dataclass
class OrderView:
    """An order with what its cards and messages show. Unknown attributes are read from the order row
    (`view.status`, `view.location`, ...)."""
    order: Order
    client: Client | None = None
    created_by: User | None = None
    lines: list[Line] = field(default_factory=list)

    def __getattr__(self, name):
        if name.startswith('__') or name in ('order', 'client', 'created_by', 'lines'):
            raise AttributeError(name)
        return getattr(self.order, name)

    @property
    def display_name(self):
        if self.order.customer_name:
            return self.order.customer_name
        if self.client:
            return ' '.join(filter(None, [self.client.first_name, self.client.last_name])) or None
        return None

    @property
    def total(self):
        return sum(line.total for line in self.lines)


async def load_orders(session, order_ids) -> dict[int, OrderView]:
    order_ids = list(dict.fromkeys(order_ids))
    if not order_ids:
        return {}
    orders = (await session.scalars(select(Order).where(Order.id.in_(order_ids)))).all()
    client_ids = {order.client_id for order in orders if order.client_id}
    user_ids = {order.created_by_id for order in orders if order.created_by_id}
    clients = {client.id: client for client in (
        await session.scalars(select(Client).where(Client.id.in_(client_ids)))).all()} if client_ids else {}
    users = {user.id: user for user in (
        await session.scalars(select(User).where(User.id.in_(user_ids)))).all()} if user_ids else {}
    views = {order.id: OrderView(order, clients.get(order.client_id), users.get(order.created_by_id))
             for order in orders}
    lines = await session.execute(
        select(OrderItem, Product).outerjoin(Product, Product.id == OrderItem.product_id)
        .where(OrderItem.order_id.in_(list(views))).order_by(OrderItem.id)
    )
    for item, product in lines:
        views[item.order_id].lines.append(Line(item, product))
    return views


async def load_order(session, order_id) -> OrderView | None:
    return (await load_orders(session, [order_id])).get(order_id)


async def resolve_items(session, raw_items):
    """[{"product_id": 1, "quantity": 2}, ...] -> [(Product, 2), ...]; duplicates are merged."""
    if not isinstance(raw_items, list):
        raise OrderError('empty')

    quantities = {}
    for raw in raw_items:
        try:
            product_id = int(raw.get('product_id'))
            quantity = int(raw.get('quantity') or 1)
        except (TypeError, ValueError, AttributeError):
            raise OrderError('invalid_item') from None
        if quantity < 1:
            continue
        quantities[product_id] = min(quantities.get(product_id, 0) + quantity, MAX_ITEM_QUANTITY)

    if not quantities:
        raise OrderError('empty')

    products = {product.id: product for product in (
        await session.scalars(select(Product).where(Product.id.in_(list(quantities))))).all()}
    missing = [product_id for product_id in quantities if product_id not in products]
    if missing:
        raise OrderError('product_not_found', missing)
    return [(products[product_id], quantity) for product_id, quantity in quantities.items()]


def clean_choice(value, allowed):
    return value if value in allowed else None


async def create_order(session, *, items, source, status=ORDERED, client_id=None, created_by_id=None,
                       customer_name=None, phone=None, address=None, latitude=None, longitude=None,
                       delivery_type=None, payment_method=None, comment=None, branch_id=None,
                       assigned_by_id=None) -> Order:
    """Adds an order with its items to the session's transaction (the caller commits). `branch_id`: the branch that
    makes it, sent there by `assigned_by_id` (None: it got the branch by itself)."""
    location = (address or '').strip()[:255] or None
    if not location and latitude and longitude:
        # Same "lat lon" format the bot stores when a location pin is shared.
        location = f'{latitude} {longitude}'
    stamp = now()
    order = Order(
        client_id=client_id,
        status=status,
        source=source,
        phone=(phone or '').strip()[:100] or None,
        location=location,
        l_t=str(latitude)[:255] if latitude else None,
        e_t=str(longitude)[:255] if longitude else None,
        customer_name=(customer_name or '').strip()[:150] or None,
        delivery_type=clean_choice(delivery_type, DELIVERY_TYPES),
        payment_method=clean_choice(payment_method, PAYMENT_METHODS),
        comment=(comment or '').strip() or None,
        created_by_id=created_by_id,
        branch_id=branch_id,
        assigned_at=stamp if branch_id else None,
        assigned_by_id=assigned_by_id if branch_id else None,
        created_at=stamp,
        updated_at=stamp,
    )
    session.add(order)
    await session.flush()
    session.add_all([
        OrderItem(order_id=order.id, product_id=product.id, quantity=str(quantity), price=product.price,
                  created_at=stamp, updated_at=stamp)
        for product, quantity in items
    ])
    await session.flush()
    return order
