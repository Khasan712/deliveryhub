from django.db import models
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin

from apps.core.enums import (
    UserRole, OrderEnum, OrderSourceEnum, DeliveryTypeEnum, PaymentMethodEnum, LoginTokenStatusEnum
)
from apps.core.managers import CustomManager
from apps.core.utils import parse_price, parse_quantity


class User(AbstractBaseUser, PermissionsMixin):
    first_name = models.CharField(max_length=100, blank=True, null=True)
    last_name = models.CharField(max_length=100, blank=True, null=True)
    phone_number = models.CharField(max_length=100, unique=True)
    role = models.CharField(max_length=10, choices=UserRole.choices())
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    is_deleted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = "phone_number"
    REQUIRED_FIELDS = ["role"]

    objects = CustomManager()

    def __str__(self):
        return self.phone_number


class Descriptions(models.Model):
    name_uz = models.CharField(max_length=100)
    name_ru = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'{self.name_uz}: {self.name_ru}'


class Category(models.Model):
    name_uz = models.CharField(max_length=100)
    name_ru = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'{self.name_uz}: {self.name_ru}'


class Product(models.Model):
    img = models.ImageField(upload_to='products/')
    # Images of old products kept in the database (base64); served by GET /api/v1/products/<id>/image.
    img_64 = models.TextField(blank=True, null=True)
    name_uz = models.CharField(max_length=255)
    name_ru = models.CharField(max_length=255)
    price = models.CharField(max_length=255)
    manufacturer_uz = models.CharField(max_length=255, blank=True, null=True)
    manufacturer_ru = models.CharField(max_length=255, blank=True, null=True)
    desc_uz = models.TextField()
    desc_ru = models.TextField()
    measure = models.ForeignKey(Descriptions, on_delete=models.SET_NULL, null=True)
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, blank=True, null=True)
    # Frozen: sold out or not made right now. The shop shows it as unavailable and takes no orders for it;
    # staff may still sell it (with a warning). Unfrozen by hand.
    is_frozen = models.BooleanField(default=False)
    frozen_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'{self.name_uz}'


class Client(models.Model):
    first_name = models.CharField(max_length=100, blank=True, null=True)
    last_name = models.CharField(max_length=100, blank=True, null=True)
    phone = models.CharField(max_length=100, blank=True, null=True)
    tg_phone = models.CharField(max_length=100, blank=True, null=True)
    tg_id = models.CharField(max_length=100, blank=True, null=True, unique=True)
    tg_nick = models.CharField(max_length=100, blank=True, null=True)
    location = models.CharField(max_length=255, blank=True, null=True)
    l_t = models.CharField(max_length=255, blank=True, null=True)
    e_t = models.CharField(max_length=255, blank=True, null=True)
    lang = models.CharField(max_length=10, blank=True, null=True)
    # Set when `phone` was confirmed with an SMS code on the website (phone sign-in matches only these).
    phone_verified_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'{self.id}'


class Order(models.Model):
    client = models.ForeignKey(Client, on_delete=models.SET_NULL, null=True)
    status = models.CharField(max_length=100, choices=OrderEnum.choices())
    phone = models.CharField(max_length=100, blank=True, null=True)
    location = models.CharField(max_length=255, blank=True, null=True)
    l_t = models.CharField(max_length=255, blank=True, null=True)
    e_t = models.CharField(max_length=255, blank=True, null=True)
    # db_default keeps inserts made by the bot (SQLAlchemy, unaware of this column) valid.
    source = models.CharField(
        max_length=20, choices=OrderSourceEnum.choices(),
        default=OrderSourceEnum.bot.value, db_default=OrderSourceEnum.bot.value
    )
    # Filled for orders without a client (dashboard sales) or when the customer gives another name.
    customer_name = models.CharField(max_length=150, blank=True, null=True)
    delivery_type = models.CharField(max_length=20, choices=DeliveryTypeEnum.choices(), blank=True, null=True)
    payment_method = models.CharField(max_length=20, choices=PaymentMethodEnum.choices(), blank=True, null=True)
    comment = models.TextField(blank=True, null=True)
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, blank=True, null=True, related_name='created_orders'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'{self.id}'

    @property
    def display_name(self):
        if self.customer_name:
            return self.customer_name
        if self.client:
            return ' '.join(filter(None, [self.client.first_name, self.client.last_name])) or None
        return None

    def get_total(self):
        return sum(item.get_total() for item in self.order_items.all())


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.SET_NULL, null=True, related_name='order_items')
    product = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True)
    quantity = models.CharField(max_length=50, blank=True, null=True)
    price = models.CharField(max_length=100, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'{self.id}'

    def get_total(self):
        return parse_price(self.price) * parse_quantity(self.quantity)


class PhoneOTP(models.Model):
    """One-time code sent by SMS for customer sign-in on the website."""
    phone = models.CharField(max_length=20, db_index=True)
    code_hash = models.CharField(max_length=64)
    attempts = models.PositiveSmallIntegerField(default=0)
    is_used = models.BooleanField(default=False)
    ip = models.GenericIPAddressField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

    def __str__(self):
        return f'{self.phone} ({self.created_at:%Y-%m-%d %H:%M})'


class TelegramLoginToken(models.Model):
    """Website sign-in through the bot: the site opens t.me/<bot>?start=login_<token>,
    the bot confirms the token (sets client + status), and the site polls for the result."""
    token = models.CharField(max_length=64, unique=True)
    status = models.CharField(
        max_length=20, choices=LoginTokenStatusEnum.choices(),
        default=LoginTokenStatusEnum.pending.value, db_default=LoginTokenStatusEnum.pending.value
    )
    client = models.ForeignKey(Client, on_delete=models.CASCADE, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    confirmed_at = models.DateTimeField(blank=True, null=True)

    def __str__(self):
        return f'{self.token[:8]}… ({self.status})'
