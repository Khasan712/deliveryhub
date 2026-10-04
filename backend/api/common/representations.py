"""Small pieces of data every API shows the same way."""
from django.core.files.storage import default_storage
from django.utils import timezone

from apps.core.services import is_coordinates
from apps.core.utils import parse_quantity

PRODUCT_IMAGE_PATH = '/api/v1/products/{id}/image'


def iso(value):
    return timezone.localtime(value).isoformat() if value else None


def business_point(business):
    """{'lat': 41.311081, 'lng': 69.279737} — or nulls while the business has not been put on the map."""
    if business.latitude is None or business.longitude is None:
        return {'lat': None, 'lng': None}
    return {'lat': float(business.latitude), 'lng': float(business.longitude)}


def product_image_url(product):
    """The uploaded image (media/<business>/products/…), or the image an old product keeps in the database."""
    if product.img and product.img.name:
        try:
            if default_storage.exists(product.img.name):
                return product.img.url
        except (OSError, ValueError):
            pass
    if product.img_64:
        return PRODUCT_IMAGE_PATH.format(id=product.pk)
    return None


def order_address(order):
    """The typed address; '' when the order only has coordinates (a shared location pin)."""
    return '' if is_coordinates(order.location) else (order.location or '')


def items_count(order):
    return sum(parse_quantity(item.quantity) for item in order.order_items.all())


def person_name(user):
    return ' '.join(filter(None, [user.first_name, user.last_name])) or user.phone_number


def file_url(field):
    return field.url if field else None
