"""Admin API data (docs/api.md, Admin API)."""
from django.utils import timezone
from rest_framework import serializers

from apps.core.enums import OrderEnum, UserRole
from apps.core.models import Category, Client, Descriptions, User
from apps.core.utils import parse_price, parse_quantity
from apps.telegram.models import StaffLink
from ..common.fields import LimitedImageField, PhoneField
from ..common.representations import iso, items_count, order_address, person_name, product_image_url
from ..shop import serializers as shop

ROLES = [role.value for role in UserRole]
ORDER_STATUSES = [status.value for status in OrderEnum if status != OrderEnum.new]


def blank(value):
    return value or ''


# ---------------------------------------------------------------------------
# staff users
# ---------------------------------------------------------------------------

class StaffUserSerializer(serializers.ModelSerializer):
    """Read: StaffUser. Write: password required on create (8+ characters), optional on update."""
    phone_number = PhoneField()
    role = serializers.ChoiceField(choices=ROLES)
    password = serializers.CharField(write_only=True, required=False, min_length=8, max_length=128,
                                     trim_whitespace=False)

    class Meta:
        model = User
        fields = ['id', 'phone_number', 'first_name', 'last_name', 'role', 'is_active', 'created_at', 'password']
        read_only_fields = ['id', 'created_at']
        extra_kwargs = {'first_name': {'allow_null': False}, 'last_name': {'allow_null': False}}

    def validate_phone_number(self, value):
        taken = User.objects.filter(phone_number=value)
        if self.instance:
            taken = taken.exclude(pk=self.instance.pk)
        if taken.exists():
            raise serializers.ValidationError('unique', code='unique')
        return value

    def validate(self, attrs):
        if self.instance is None and not attrs.get('password'):
            raise serializers.ValidationError({'password': serializers.ErrorDetail('required', code='required')})
        return attrs

    def create(self, validated_data):
        password = validated_data.pop('password')
        return User.objects.create_user(password=password, **validated_data)

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance

    def to_representation(self, user):
        return {
            'id': user.pk,
            'phone_number': user.phone_number,
            'first_name': blank(user.first_name),
            'last_name': blank(user.last_name),
            'role': user.role,
            'is_active': user.is_active,
            'created_at': iso(user.created_at),
        }


# ---------------------------------------------------------------------------
# catalog
# ---------------------------------------------------------------------------

class UnitSerializer(serializers.ModelSerializer):
    class Meta:
        model = Descriptions
        fields = ['id', 'name_uz', 'name_ru']


class CategorySerializer(serializers.ModelSerializer):
    products_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Category
        fields = ['id', 'name_uz', 'name_ru', 'products_count']


class CategoryRefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name_uz', 'name_ru']


class ProductSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name_uz = serializers.CharField()
    name_ru = serializers.CharField()
    desc_uz = serializers.CharField()
    desc_ru = serializers.CharField()
    price = serializers.IntegerField()
    unit = UnitSerializer(allow_null=True)
    category = CategoryRefSerializer(allow_null=True)
    image = serializers.CharField(allow_null=True)
    frozen = serializers.BooleanField(help_text='The shop shows it as unavailable; staff may still sell it')
    frozen_at = serializers.DateTimeField(allow_null=True)
    created_at = serializers.DateTimeField()

    def to_representation(self, product):
        unit, category = product.measure, product.category
        return {
            'id': product.pk,
            'name_uz': product.name_uz,
            'name_ru': product.name_ru,
            'desc_uz': blank(product.desc_uz),
            'desc_ru': blank(product.desc_ru),
            'price': parse_price(product.price),
            'unit': {'id': unit.pk, 'name_uz': unit.name_uz, 'name_ru': unit.name_ru} if unit else None,
            'category': ({'id': category.pk, 'name_uz': category.name_uz, 'name_ru': category.name_ru}
                         if category else None),
            'image': product_image_url(product),
            'frozen': product.is_frozen,
            'frozen_at': iso(product.frozen_at),
            'created_at': iso(product.created_at),
        }


class ProductWriteSerializer(serializers.Serializer):
    """Create / update (multipart when an image is attached). `image: null` (or empty) removes the image."""
    name_uz = serializers.CharField(max_length=255)
    name_ru = serializers.CharField(max_length=255)
    price = serializers.IntegerField(min_value=0, max_value=1_000_000_000)
    desc_uz = serializers.CharField(required=False, allow_blank=True, default='')
    desc_ru = serializers.CharField(required=False, allow_blank=True, default='')
    unit_id = serializers.IntegerField(required=False, allow_null=True)
    category_id = serializers.IntegerField(required=False, allow_null=True)
    image = LimitedImageField(max_mb=5, required=False, allow_null=True)
    frozen = serializers.BooleanField(required=False)

    def validate_unit_id(self, value):
        if value is not None and not Descriptions.objects.filter(pk=value).exists():
            raise serializers.ValidationError('does_not_exist', code='does_not_exist')
        return value

    def validate_category_id(self, value):
        if value is not None and not Category.objects.filter(pk=value).exists():
            raise serializers.ValidationError('does_not_exist', code='does_not_exist')
        return value

    def save_to(self, product):
        """Applies the validated fields to `product` and saves it."""
        data = self.validated_data
        for field in ('name_uz', 'name_ru', 'desc_uz', 'desc_ru'):
            if field in data:
                setattr(product, field, data[field])
        if 'price' in data:
            product.price = str(data['price'])
        if 'unit_id' in data:
            product.measure_id = data['unit_id']
        if 'category_id' in data:
            product.category_id = data['category_id']
        if 'image' in data:
            product.img = data['image'] or ''
            product.img_64 = None
        if 'frozen' in data and data['frozen'] != product.is_frozen:
            product.is_frozen = data['frozen']
            product.frozen_at = timezone.now() if data['frozen'] else None
        product.save()
        return product


# ---------------------------------------------------------------------------
# customers
# ---------------------------------------------------------------------------

class ClientSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    first_name = serializers.CharField()
    last_name = serializers.CharField()
    phone = serializers.CharField()
    tg_nick = serializers.CharField()
    telegram = serializers.BooleanField()
    lang = serializers.CharField()
    orders_count = serializers.IntegerField()
    created_at = serializers.DateTimeField()

    def to_representation(self, client):
        return {
            'id': client.pk,
            'first_name': blank(client.first_name),
            'last_name': blank(client.last_name),
            'phone': client.phone or client.tg_phone or '',
            'tg_nick': blank(client.tg_nick),
            'telegram': bool(client.tg_id),
            'lang': blank(client.lang),
            'orders_count': getattr(client, 'orders_count', 0),
            'created_at': iso(client.created_at),
        }


class ClientUpdateSerializer(serializers.ModelSerializer):
    phone = PhoneField(required=False, allow_blank=True)

    class Meta:
        model = Client
        fields = ['first_name', 'last_name', 'phone', 'location']
        extra_kwargs = {field: {'allow_null': False, 'required': False}
                        for field in ('first_name', 'last_name', 'location')}


# ---------------------------------------------------------------------------
# orders
# ---------------------------------------------------------------------------

class OrderSummarySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    status = serializers.CharField()
    source = serializers.CharField()
    created_at = serializers.DateTimeField()
    customer_name = serializers.CharField()
    phone = serializers.CharField()
    total = serializers.IntegerField()
    items_count = serializers.IntegerField()
    client_id = serializers.IntegerField(allow_null=True)

    def to_representation(self, order):
        return {
            'id': order.pk,
            'status': order.status,
            'source': order.source,
            'created_at': iso(order.created_at),
            'customer_name': order.display_name or '',
            'phone': order.phone or (order.client.phone if order.client_id and order.client else '') or '',
            'total': order.get_total(),
            'items_count': items_count(order),
            'client_id': order.client_id,
        }


class OrderLineSerializer(serializers.Serializer):
    product_id = serializers.IntegerField(allow_null=True)
    name_uz = serializers.CharField()
    name_ru = serializers.CharField()
    quantity = serializers.IntegerField()
    price = serializers.IntegerField()
    total = serializers.IntegerField()


class PersonRefSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()


class OrderClientSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    first_name = serializers.CharField()
    last_name = serializers.CharField()
    phone = serializers.CharField()
    tg_nick = serializers.CharField()


class OrderDetailSerializer(OrderSummarySerializer):
    updated_at = serializers.DateTimeField()
    address = serializers.CharField()
    lat = serializers.CharField()
    lng = serializers.CharField()
    delivery_type = serializers.CharField()
    payment_method = serializers.CharField()
    comment = serializers.CharField()
    created_by = PersonRefSerializer(allow_null=True)
    client = OrderClientSerializer(allow_null=True)
    items = OrderLineSerializer(many=True)

    def to_representation(self, order):
        client, author = order.client, order.created_by
        items = []
        for item in order.order_items.all():
            product = item.product
            items.append({
                'product_id': item.product_id,
                'name_uz': product.name_uz if product else '—',
                'name_ru': (product.name_ru or product.name_uz) if product else '—',
                'quantity': parse_quantity(item.quantity),
                'price': parse_price(item.price),
                'total': item.get_total(),
            })
        return {
            **super().to_representation(order),
            'updated_at': iso(order.updated_at),
            'address': order_address(order),
            'lat': order.l_t or '',
            'lng': order.e_t or '',
            'delivery_type': order.delivery_type or '',
            'payment_method': order.payment_method or '',
            'comment': order.comment or '',
            'created_by': {'id': author.pk, 'name': person_name(author)} if author else None,
            'client': {
                'id': client.pk, 'first_name': blank(client.first_name), 'last_name': blank(client.last_name),
                'phone': client.phone or client.tg_phone or '', 'tg_nick': blank(client.tg_nick),
            } if client else None,
            'items': items,
        }


class OrderStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=ORDER_STATUSES)


# ---------------------------------------------------------------------------
# sales
# ---------------------------------------------------------------------------

class PosCategorySerializer(shop.CategorySerializer):
    """A category of the point of sale (the shop's shape)."""


class PosProductSerializer(shop.ProductSerializer):
    """A product of the point of sale (the shop's shape)."""


class SaleSummarySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    phone = serializers.CharField()
    status = serializers.CharField()
    total = serializers.IntegerField()
    items_count = serializers.IntegerField()
    created_at = serializers.DateTimeField()

    def to_representation(self, order):
        return {
            'id': order.pk,
            'name': order.display_name or '',
            'phone': order.phone or '',
            'status': order.status,
            'total': order.get_total(),
            'items_count': items_count(order),
            'created_at': iso(order.created_at),
        }


class SalesStatsSerializer(serializers.Serializer):
    count = serializers.IntegerField()
    revenue = serializers.IntegerField()
    average = serializers.IntegerField()
    all_orders_today = serializers.IntegerField()


class SaleLineSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1)


class SaleCreateSerializer(serializers.Serializer):
    """Documents the body of POST /sales."""
    items = SaleLineSerializer(many=True)
    customer_name = serializers.CharField(required=False, allow_blank=True)
    phone = serializers.CharField(required=False, allow_blank=True)
    delivery_type = serializers.ChoiceField(choices=['pickup', 'delivery'], required=False)
    address = serializers.CharField(required=False, allow_blank=True)
    payment_method = serializers.ChoiceField(choices=['cash', 'card'], required=False)
    status = serializers.ChoiceField(choices=['ordered', 'on_the_way', 'completed'], required=False)
    comment = serializers.CharField(required=False, allow_blank=True)


# ---------------------------------------------------------------------------
# Telegram
# ---------------------------------------------------------------------------

class LinkSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    user = PersonRefSerializer()
    telegram_id = serializers.IntegerField()
    first_name = serializers.CharField()
    username = serializers.CharField()
    lang = serializers.CharField()
    notify_orders = serializers.BooleanField()
    blocked = serializers.BooleanField()
    created_at = serializers.DateTimeField()
    last_seen_at = serializers.DateTimeField(allow_null=True)

    def to_representation(self, link: StaffLink):
        return {
            'id': link.pk,
            'user': {'id': link.user_id, 'name': person_name(link.user)},
            'telegram_id': link.telegram_id,
            'first_name': link.first_name,
            'username': link.username,
            'lang': link.lang,
            'notify_orders': link.notify_orders,
            'blocked': link.blocked_at is not None,
            'created_at': iso(link.created_at),
            'last_seen_at': iso(link.last_seen_at),
        }


class LinkUpdateSerializer(serializers.Serializer):
    notify_orders = serializers.BooleanField()


class InviteSerializer(serializers.Serializer):
    user_id = serializers.IntegerField(required=False, allow_null=True)


class VoiceStateSerializer(serializers.Serializer):
    """Documents POST /voice/parse (JSON form; the audio form is multipart: audio, state, live_text, lang)."""
    text = serializers.CharField(required=False, allow_blank=True)
    state = serializers.DictField(required=False)
    lang = serializers.ChoiceField(choices=['uz', 'ru'], required=False)
