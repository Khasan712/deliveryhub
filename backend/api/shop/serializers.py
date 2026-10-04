"""Shop API data (docs/api.md, Shop API). Output serializers declare their fields for the OpenAPI schema and
build plain dicts in to_representation: the catalog is sent whole on every visit, so this path stays fast."""
from rest_framework import serializers

from apps.core.enums import DeliveryTypeEnum, LanguageEnum, OrderSourceEnum, PaymentMethodEnum
from apps.core.utils import parse_price, parse_quantity
from ..common.representations import business_point, file_url, iso, order_address, product_image_url

LANGS = tuple(lang.value for lang in LanguageEnum)


class BusinessSerializer(serializers.Serializer):
    name = serializers.CharField()
    tagline = serializers.CharField()
    support_phone = serializers.CharField()
    address = serializers.CharField(help_text='Where pickup orders are collected')
    lat = serializers.FloatField(allow_null=True)
    lng = serializers.FloatField(allow_null=True)
    delivery_time = serializers.CharField()
    min_order = serializers.IntegerField()
    brand_color = serializers.CharField()
    logo = serializers.CharField(allow_null=True)

    def to_representation(self, business):
        return {
            'name': business.name,
            'tagline': business.tagline,
            'support_phone': business.support_phone,
            'address': business.address,
            **business_point(business),
            'delivery_time': business.delivery_time,
            'min_order': business.min_order,
            'brand_color': business.brand_color,
            'logo': file_url(business.logo),
        }


class CategorySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name_uz = serializers.CharField()
    name_ru = serializers.CharField()

    def to_representation(self, category):
        return {'id': category.pk, 'name_uz': category.name_uz, 'name_ru': category.name_ru or category.name_uz}


class ProductSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name_uz = serializers.CharField()
    name_ru = serializers.CharField()
    desc_uz = serializers.CharField()
    desc_ru = serializers.CharField()
    price = serializers.IntegerField()
    unit_uz = serializers.CharField()
    unit_ru = serializers.CharField()
    category_id = serializers.IntegerField(allow_null=True)
    image = serializers.CharField(allow_null=True)

    def to_representation(self, product):
        measure = product.measure
        return {
            'id': product.pk,
            'name_uz': product.name_uz,
            'name_ru': product.name_ru or product.name_uz,
            'desc_uz': product.desc_uz or '',
            'desc_ru': product.desc_ru or product.desc_uz or '',
            'price': parse_price(product.price),
            'unit_uz': measure.name_uz if measure else '',
            'unit_ru': measure.name_ru if measure else '',
            'category_id': product.category_id,
            'image': product_image_url(product),
        }


class ClientSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    first_name = serializers.CharField()
    last_name = serializers.CharField()
    phone = serializers.CharField()
    telegram = serializers.BooleanField()
    tg_nick = serializers.CharField()
    lang = serializers.CharField()
    address = serializers.CharField(help_text='Last delivery address, to prefill checkout')
    lat = serializers.CharField()
    lng = serializers.CharField()

    def to_representation(self, client):
        return {
            'id': client.pk,
            'first_name': client.first_name or '',
            'last_name': client.last_name or '',
            'phone': client.phone or client.tg_phone or '',
            'telegram': bool(client.tg_id),
            'tg_nick': client.tg_nick or '',
            'lang': client.lang or '',
            'address': order_address(client),
            'lat': client.l_t or '',
            'lng': client.e_t or '',
        }


class OrderItemSerializer(serializers.Serializer):
    product_id = serializers.IntegerField(allow_null=True)
    name_uz = serializers.CharField()
    name_ru = serializers.CharField()
    image = serializers.CharField(allow_null=True)
    quantity = serializers.IntegerField()
    price = serializers.IntegerField()
    total = serializers.IntegerField()

    def to_representation(self, item):
        product = item.product
        return {
            'product_id': item.product_id,
            'name_uz': product.name_uz if product else '—',
            'name_ru': (product.name_ru or product.name_uz) if product else '—',
            'image': product_image_url(product) if product else None,
            'quantity': parse_quantity(item.quantity),
            'price': parse_price(item.price),
            'total': item.get_total(),
        }


class OrderSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    status = serializers.CharField()
    source = serializers.CharField()
    created_at = serializers.DateTimeField()
    updated_at = serializers.DateTimeField()
    total = serializers.IntegerField()
    items = OrderItemSerializer(many=True)
    customer_name = serializers.CharField()
    phone = serializers.CharField()
    address = serializers.CharField()
    lat = serializers.CharField()
    lng = serializers.CharField()
    delivery_type = serializers.CharField()
    payment_method = serializers.CharField()
    comment = serializers.CharField()

    def to_representation(self, order):
        items = [OrderItemSerializer().to_representation(item) for item in order.order_items.all()]
        return {
            'id': order.pk,
            'status': order.status,
            'source': order.source,
            'created_at': iso(order.created_at),
            'updated_at': iso(order.updated_at),
            'total': sum(item['total'] for item in items),
            'items': items,
            'customer_name': order.display_name or '',
            'phone': order.phone or '',
            'address': order_address(order),
            'lat': order.l_t or '',
            'lng': order.e_t or '',
            'delivery_type': order.delivery_type or '',
            'payment_method': order.payment_method or '',
            'comment': order.comment or '',
        }


class AuthResultSerializer(serializers.Serializer):
    token = serializers.CharField()
    client = ClientSerializer()
    created = serializers.BooleanField()


# ---------------------------------------------------------------------------
# requests
# ---------------------------------------------------------------------------

class InitDataSerializer(serializers.Serializer):
    init_data = serializers.CharField(max_length=10000)


class PhoneRequestSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=30)


class PhoneVerifySerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=30)
    code = serializers.CharField(max_length=12)
    lang = serializers.ChoiceField(choices=LANGS, required=False)


class ProfileSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=100, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=100, required=False, allow_blank=True)
    lang = serializers.ChoiceField(choices=LANGS, required=False)


class OrderLineSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1)


class OrderCreateSerializer(serializers.Serializer):
    """Documents the body of POST /orders; the view checks it with the order rules of the contract."""
    items = OrderLineSerializer(many=True)
    name = serializers.CharField(max_length=150)
    phone = serializers.CharField(max_length=30)
    delivery_type = serializers.ChoiceField(choices=[value.value for value in DeliveryTypeEnum])
    address = serializers.CharField(max_length=255, required=False, allow_blank=True)
    lat = serializers.FloatField(required=False, allow_null=True)
    lng = serializers.FloatField(required=False, allow_null=True)
    payment_method = serializers.ChoiceField(choices=[value.value for value in PaymentMethodEnum])
    comment = serializers.CharField(max_length=1000, required=False, allow_blank=True)
    platform = serializers.ChoiceField(choices=[OrderSourceEnum.web.value, OrderSourceEnum.miniapp.value])
    lang = serializers.ChoiceField(choices=LANGS, required=False)
