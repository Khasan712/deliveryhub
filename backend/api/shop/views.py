"""Shop API: the customer shop of a business (website and Telegram Mini App) — docs/api.md, Shop API."""
import hashlib
import logging
import re
import secrets
from datetime import timedelta

from django.conf import settings
from django.core.cache import cache
from django.db.models import Count, F, Func, Value
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.enums import DeliveryTypeEnum, LoginTokenStatusEnum, OrderEnum, OrderSourceEnum, PaymentMethodEnum
from apps.core.models import Category, Client, Order, OrderItem, PhoneOTP, Product, TelegramLoginToken
from apps.core.services import OrderError, create_order, resolve_items
from apps.core.utils import normalize_phone, parse_price
from apps.platform import hours
from apps.platform.current import business_bot
from apps.platform.models import BusinessBot
from apps.telegram.outbox import queue_order_created
from ..common import geo
from ..common.errors import ApiError
from ..common.fields import UZ_PHONE_RE
from ..common.permissions import IsCustomer
from ..common.ratelimit import client_ip, rate_limited, throttle
from ..common.representations import business_point
from ..common.telegram import telegram_user
from . import serializers as s
from .authentication import CustomerTokenAuthentication, issue_token
from .sms import SmsError, send_code

logger = logging.getLogger('api')

OTP_TTL = timedelta(minutes=5)
OTP_RESEND_SECONDS = 60
OTP_MAX_PER_HOUR = 5
OTP_MAX_ATTEMPTS = 5
TELEGRAM_LOGIN_TTL = timedelta(minutes=5)
POPULAR_COUNT = 8
POPULAR_CACHE_SECONDS = 5 * 60
ORDERS_PER_10_MINUTES = 10


class ShopView(APIView):
    authentication_classes = [CustomerTokenAuthentication]
    permission_classes = [AllowAny]


class CustomerView(ShopView):
    permission_classes = [IsCustomer]


def text(value, limit):
    return str(value or '').strip()[:limit]


def client_bot():
    return business_bot(BusinessBot.ROLE_CLIENT)


def auth_result(client, created=False):
    return {'token': issue_token(client), 'client': s.ClientSerializer(client).data, 'created': created}


# ---------------------------------------------------------------------------
# catalog
# ---------------------------------------------------------------------------

def popular_product_ids():
    """Most ordered products first (cached: the aggregate scans every order)."""
    ids = cache.get('shop:popular')
    if ids is None:
        ids = list(
            OrderItem.objects.filter(order__isnull=False, product__isnull=False)
            .exclude(order__status=OrderEnum.new.value)
            .values('product_id').annotate(times=Count('id')).order_by('-times', 'product_id')
            .values_list('product_id', flat=True)[:POPULAR_COUNT]
        )
        cache.set('shop:popular', ids, POPULAR_CACHE_SECONDS)
    return ids


class ShopCatalogView(ShopView):
    @extend_schema(summary='Business profile and the whole catalog', responses=inline_serializer('Shop', {
        'business': s.BusinessSerializer(),
        'bot_username': serializers.CharField(allow_null=True),
        'categories': s.CategorySerializer(many=True),
        'products': s.ProductSerializer(many=True),
        'popular': serializers.ListField(child=serializers.IntegerField()),
        'client': s.ClientSerializer(allow_null=True),
    }))
    def get(self, request):
        products = list(Product.objects.select_related('measure').order_by('category_id', 'id'))
        category_ids = {product.category_id for product in products if product.category_id}
        product_ids = {product.pk for product in products}
        bot = client_bot()
        client = getattr(request.user, 'client', None)
        return Response({
            'business': s.BusinessSerializer(request.tenant).data,
            'bot_username': bot.username if bot else None,
            'categories': s.CategorySerializer(Category.objects.filter(pk__in=category_ids).order_by('id'),
                                               many=True).data,
            'products': s.ProductSerializer(products, many=True).data,
            'popular': [product_id for product_id in popular_product_ids() if product_id in product_ids],
            'client': s.ClientSerializer(client).data if client else None,
        })


# ---------------------------------------------------------------------------
# sign-in: Telegram Mini App
# ---------------------------------------------------------------------------

class TelegramWebAppAuthView(ShopView):
    @extend_schema(summary='Sign in inside the Telegram Mini App', request=s.InitDataSerializer,
                   responses=s.AuthResultSerializer)
    def post(self, request):
        data = s.InitDataSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        bot = client_bot()
        user = telegram_user(data.validated_data['init_data'], bot.token if bot else '')
        if not user:
            raise ApiError('invalid_init_data', 401)

        defaults = {
            'first_name': text(user.get('first_name'), 100) or None,
            'last_name': text(user.get('last_name'), 100) or None,
            'tg_nick': text(user.get('username'), 100) or None,
            'lang': 'ru' if (user.get('language_code') or '').startswith('ru') else 'uz',
        }
        client, created = Client.objects.get_or_create(tg_id=str(user['id']), defaults=defaults)
        if not created:
            changed = [field for field in ('first_name', 'last_name', 'tg_nick')
                       if defaults[field] and not getattr(client, field)]
            for field in changed:
                setattr(client, field, defaults[field])
            if not client.lang:
                client.lang = defaults['lang']
                changed.append('lang')
            if changed:
                client.save(update_fields=changed + ['updated_at'])
        return Response(auth_result(client, created))


# ---------------------------------------------------------------------------
# sign-in on the website through the bot: deep link + polling
# ---------------------------------------------------------------------------

class TelegramStartView(ShopView):
    @extend_schema(summary='Start signing in through the customers\' bot', request=None,
                   responses=inline_serializer('TelegramLoginStart', {
                       'token': serializers.CharField(), 'url': serializers.URLField(),
                       'expires_in': serializers.IntegerField()}))
    def post(self, request):
        throttle(f'tg-start:{client_ip(request)}', 30, 3600)
        bot = client_bot()
        if not bot:
            raise ApiError('telegram_unavailable', 503)
        login = TelegramLoginToken.objects.create(
            token=secrets.token_urlsafe(24), expires_at=timezone.now() + TELEGRAM_LOGIN_TTL)
        return Response({
            'token': login.token,
            'url': f'https://t.me/{bot.username}?start=login_{login.token}',
            'expires_in': int(TELEGRAM_LOGIN_TTL.total_seconds()),
        })


class TelegramCheckView(ShopView):
    @extend_schema(summary='Poll a Telegram sign-in (every 2 s)',
                   parameters=[OpenApiParameter('token', str, required=True)],
                   responses=inline_serializer('TelegramLoginCheck', {
                       'status': serializers.ChoiceField(choices=['pending', 'expired', 'confirmed']),
                       'token': serializers.CharField(required=False),
                       'client': s.ClientSerializer(required=False),
                       'created': serializers.BooleanField(required=False)}))
    def get(self, request):
        login = TelegramLoginToken.objects.select_related('client').filter(
            token=request.query_params.get('token', '')).first()
        if not login or login.status == LoginTokenStatusEnum.used.value:
            raise ApiError('not_found', 404)
        if login.status == LoginTokenStatusEnum.confirmed.value and login.client:
            login.status = LoginTokenStatusEnum.used.value
            login.save(update_fields=['status'])
            return Response({'status': 'confirmed', **auth_result(login.client)})
        if login.expires_at < timezone.now():
            return Response({'status': 'expired'})
        return Response({'status': 'pending'})


# ---------------------------------------------------------------------------
# sign-in with a phone number and an SMS code
# ---------------------------------------------------------------------------

def otp_hash(phone, code):
    return hashlib.sha256(f'{phone}:{code}:{settings.SECRET_KEY}'.encode()).hexdigest()


def digits_only(field):
    return Func(F(field), Value(r'\D'), Value(''), Value('g'), function='regexp_replace')


def find_client_by_phone(phone):
    """Only numbers confirmed with an SMS code or shared as the customer's own Telegram contact identify them."""
    last_digits = re.sub(r'\D', '', phone)[-9:]
    clients = Client.objects.annotate(phone_digits=digits_only('phone'), tg_phone_digits=digits_only('tg_phone'))
    return (
        clients.filter(phone_verified_at__isnull=False, phone_digits__endswith=last_digits)
        .order_by('-updated_at').first()
        or clients.filter(tg_phone_digits__endswith=last_digits).order_by('-updated_at').first()
    )


class PhoneRequestView(ShopView):
    @extend_schema(summary='Send a sign-in code by SMS', request=s.PhoneRequestSerializer,
                   responses=inline_serializer('PhoneCodeSent', {
                       'ok': serializers.BooleanField(), 'phone': serializers.CharField(),
                       'resend_in': serializers.IntegerField(), 'ttl': serializers.IntegerField(),
                       'debug_code': serializers.CharField(required=False)}))
    def post(self, request):
        phone = normalize_phone(request.data.get('phone'))
        if not phone or not UZ_PHONE_RE.match(phone):
            raise ApiError('invalid_phone')

        ip = client_ip(request)
        throttle(f'otp-ip:{ip}', 20, 3600)

        now = timezone.now()
        recent = PhoneOTP.objects.filter(phone=phone, created_at__gte=now - timedelta(hours=1))
        last = recent.order_by('-created_at').first()
        if last and (now - last.created_at).total_seconds() < OTP_RESEND_SECONDS:
            raise ApiError('too_soon', 429,
                           retry_after=OTP_RESEND_SECONDS - int((now - last.created_at).total_seconds()))
        if recent.count() >= OTP_MAX_PER_HOUR:
            raise ApiError('too_many_requests', 429)

        code = f'{secrets.randbelow(900000) + 100000}'
        otp = PhoneOTP.objects.create(phone=phone, code_hash=otp_hash(phone, code), ip=ip, expires_at=now + OTP_TTL)
        try:
            send_code(phone, code, request.tenant.name)
        except SmsError as exc:
            logger.error('Sign-in code was not sent to %s: %s', phone, exc)
            otp.delete()
            raise ApiError('sms_failed', 502)

        response = {'ok': True, 'phone': phone, 'resend_in': OTP_RESEND_SECONDS, 'ttl': int(OTP_TTL.total_seconds())}
        if settings.SHOP_OTP_DEBUG:
            response['debug_code'] = code
        return Response(response)


class PhoneVerifyView(ShopView):
    @extend_schema(summary='Sign in with the SMS code', request=s.PhoneVerifySerializer,
                   responses=s.AuthResultSerializer)
    def post(self, request):
        phone = normalize_phone(request.data.get('phone'))
        code = re.sub(r'\D', '', str(request.data.get('code', '')))
        if not phone or len(code) != 6:
            raise ApiError('invalid_code')

        otp = (PhoneOTP.objects.filter(phone=phone, is_used=False, expires_at__gt=timezone.now())
               .order_by('-created_at').first())
        if not otp:
            raise ApiError('code_expired')
        if otp.attempts >= OTP_MAX_ATTEMPTS:
            raise ApiError('too_many_attempts', 429)
        if otp.code_hash != otp_hash(phone, code):
            otp.attempts += 1
            otp.save(update_fields=['attempts'])
            raise ApiError('invalid_code', attempts_left=max(OTP_MAX_ATTEMPTS - otp.attempts, 0))

        otp.is_used = True
        otp.save(update_fields=['is_used'])

        now = timezone.now()
        client = find_client_by_phone(phone)
        created = client is None
        if created:
            lang = request.data.get('lang')
            client = Client.objects.create(phone=phone, phone_verified_at=now,
                                           lang=lang if lang in s.LANGS else 'uz')
        else:
            client.phone = phone
            client.phone_verified_at = now
            client.save(update_fields=['phone', 'phone_verified_at', 'updated_at'])
        return Response(auth_result(client, created))


# ---------------------------------------------------------------------------
# profile
# ---------------------------------------------------------------------------

ClientEnvelope = inline_serializer('ClientEnvelope', {'client': s.ClientSerializer()})


class MeView(CustomerView):
    @extend_schema(summary='The signed-in customer', responses=ClientEnvelope)
    def get(self, request):
        return Response({'client': s.ClientSerializer(request.user.client).data})

    @extend_schema(summary='Update the profile', request=s.ProfileSerializer, responses=ClientEnvelope)
    def patch(self, request):
        data = s.ProfileSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        client, changed = request.user.client, []
        for field, value in data.validated_data.items():
            setattr(client, field, value if field == 'lang' else value.strip() or None)
            changed.append(field)
        if changed:
            client.save(update_fields=changed + ['updated_at'])
        return Response({'client': s.ClientSerializer(client).data})


# ---------------------------------------------------------------------------
# orders
# ---------------------------------------------------------------------------

def client_orders(client):
    return (
        Order.objects.filter(client=client).exclude(status=OrderEnum.new.value)
        .prefetch_related('order_items__product').order_by('-created_at')
    )


def coordinate(value):
    try:
        return round(float(value), 6) if value not in (None, '') else None
    except (TypeError, ValueError):
        return None


OrderEnvelope = inline_serializer('OrderEnvelope', {'order': s.OrderSerializer()})


class OrdersView(CustomerView):
    @extend_schema(summary="The customer's latest orders", operation_id='orders_list',
                   responses=inline_serializer('OrderList', {'orders': s.OrderSerializer(many=True)}))
    def get(self, request):
        orders = client_orders(request.user.client)[:50]
        return Response({'orders': s.OrderSerializer(orders, many=True).data})

    @extend_schema(summary='Place an order', request=s.OrderCreateSerializer, responses={201: OrderEnvelope})
    def post(self, request):
        client, data, business = request.user.client, request.data, request.tenant
        now = hours.status(business.working_hours)
        if not now['open']:
            raise ApiError('business_closed', opens_at=now['opens_at'])
        try:
            items = resolve_items(data.get('items'))
        except OrderError as exc:
            raise ApiError(exc.code, detail=exc.detail)
        frozen = [product.pk for product, _ in items if product.is_frozen]
        if frozen:
            raise ApiError('product_unavailable', detail=frozen)

        name = text(data.get('name'), 150) or ' '.join(filter(None, [client.first_name, client.last_name]))
        phone = normalize_phone(data.get('phone'))
        delivery = DeliveryTypeEnum.delivery.value
        delivery_type = data.get('delivery_type') if data.get('delivery_type') in (
            delivery, DeliveryTypeEnum.pickup.value) else delivery
        address = text(data.get('address'), 255)
        latitude, longitude = coordinate(data.get('lat')), coordinate(data.get('lng'))
        if latitude is None or longitude is None:
            latitude = longitude = None

        fields = {}
        if not name:
            fields['name'] = ['required']
        if not phone:
            fields['phone'] = ['required' if not data.get('phone') else 'invalid']
        if delivery_type == delivery and not address and latitude is None:
            fields['address'] = ['required']
        if fields:
            raise ApiError('validation', fields=fields)

        subtotal = sum(parse_price(product.price) * quantity for product, quantity in items)
        if business.min_order and subtotal < business.min_order:
            raise ApiError('min_order', min_order=business.min_order)
        if rate_limited(f'order:{client.pk}', ORDERS_PER_10_MINUTES, 600):
            raise ApiError('too_many_requests', 429)

        platform = data.get('platform')
        payment = data.get('payment_method')
        is_delivery = delivery_type == delivery
        order = create_order(
            items=items,
            source=platform if platform in (OrderSourceEnum.web.value, OrderSourceEnum.miniapp.value)
            else OrderSourceEnum.web.value,
            status=OrderEnum.ordered.value,
            client=client,
            customer_name=name,
            phone=phone,
            address=address if is_delivery else '',
            latitude=latitude if is_delivery else None,
            longitude=longitude if is_delivery else None,
            delivery_type=delivery_type,
            payment_method=payment if payment in (PaymentMethodEnum.cash.value, PaymentMethodEnum.card.value)
            else PaymentMethodEnum.cash.value,
            comment=text(data.get('comment'), 1000),
        )
        remember_contacts(client, name, phone, is_delivery, address, latitude, longitude, data.get('lang'))
        queue_order_created(order)
        order = client_orders(client).get(pk=order.pk)
        return Response({'order': s.OrderSerializer(order).data}, status=201)


def remember_contacts(client, name, phone, is_delivery, address, latitude, longitude, lang):
    """Prefill the next checkout (the customers' bot does the same)."""
    changed = []
    if not client.first_name and name:
        client.first_name = name.split(' ')[0][:100]
        changed.append('first_name')
    if not client.phone:
        client.phone = phone
        changed.append('phone')
    if is_delivery:
        client.location = address or f'{latitude} {longitude}'
        client.l_t = str(latitude) if latitude is not None else None
        client.e_t = str(longitude) if longitude is not None else None
        changed += ['location', 'l_t', 'e_t']
    if lang in s.LANGS and client.lang != lang:
        client.lang = lang
        changed.append('lang')
    if changed:
        client.save(update_fields=changed + ['updated_at'])


class GeoReverseView(geo.GeoReverseMixin, ShopView):
    pass


class GeoSearchView(geo.GeoSearchMixin, ShopView):
    def near(self, request):
        point = business_point(request.tenant)
        return (point['lat'], point['lng']) if point['lat'] is not None else None


class OrderDetailView(CustomerView):
    @extend_schema(summary='One order of the customer', responses=OrderEnvelope)
    def get(self, request, pk):
        order = client_orders(request.user.client).filter(pk=pk).first()
        if not order:
            raise ApiError('not_found', 404)
        return Response({'order': s.OrderSerializer(order).data})
