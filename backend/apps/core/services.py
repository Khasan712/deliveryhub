"""Order creation shared by the web shop, the Telegram Mini App and the dashboard "Sales" section."""
import re

from django.db import transaction

from apps.core.enums import DeliveryTypeEnum, PaymentMethodEnum, OrderEnum
from apps.core.models import Order, OrderItem, Product

MAX_ITEM_QUANTITY = 99
COORDINATES_RE = re.compile(r'^\s*-?\d{1,3}\.\d+[\s,]+-?\d{1,3}\.\d+\s*$')


class OrderError(ValueError):
    def __init__(self, code, detail=None):
        super().__init__(code)
        self.code = code
        self.detail = detail


def resolve_items(raw_items):
    """[{"product_id": 1, "quantity": 2}, ...] -> [(Product, 2), ...]; duplicates are merged."""
    if not isinstance(raw_items, list):
        raise OrderError('empty')

    quantities = {}
    for raw in raw_items:
        try:
            product_id = int(raw.get('product_id'))
            quantity = int(raw.get('quantity') or 1)
        except (TypeError, ValueError, AttributeError):
            raise OrderError('invalid_item')
        if quantity < 1:
            continue
        quantities[product_id] = min(quantities.get(product_id, 0) + quantity, MAX_ITEM_QUANTITY)

    if not quantities:
        raise OrderError('empty')

    products = Product.objects.light().in_bulk(list(quantities))
    missing = [product_id for product_id in quantities if product_id not in products]
    if missing:
        raise OrderError('product_not_found', missing)
    return [(products[product_id], quantity) for product_id, quantity in quantities.items()]


def clean_choice(value, enum):
    return value if value in {member.value for member in enum} else None


def create_order(*, items, source, status=OrderEnum.ordered.value, client=None, created_by=None,
                 customer_name=None, phone=None, address=None, latitude=None, longitude=None,
                 delivery_type=None, payment_method=None, comment=None):
    """Create an order with its items. Prices are always taken from the product, never from the caller."""
    location = (address or '').strip()[:255] or None
    if not location and latitude and longitude:
        # Same "lat lon" format the bot stores when a location pin is shared.
        location = f'{latitude} {longitude}'

    with transaction.atomic():
        order = Order.objects.create(
            client=client,
            status=status,
            source=source,
            phone=(phone or '').strip()[:100] or None,
            location=location,
            l_t=str(latitude)[:255] if latitude else None,
            e_t=str(longitude)[:255] if longitude else None,
            customer_name=(customer_name or '').strip()[:150] or None,
            delivery_type=clean_choice(delivery_type, DeliveryTypeEnum),
            payment_method=clean_choice(payment_method, PaymentMethodEnum),
            comment=(comment or '').strip() or None,
            created_by=created_by,
        )
        OrderItem.objects.bulk_create([
            OrderItem(order=order, product=product, quantity=str(quantity), price=product.price)
            for product, quantity in items
        ])
    return order


def is_coordinates(value):
    return bool(value and COORDINATES_RE.match(value))
