"""Sales: the point of sale — staff create orders by hand or by voice, no customer account needed."""
from django.conf import settings
from django.utils import timezone
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.response import Response

from apps.core.enums import DeliveryTypeEnum, OrderEnum, OrderSourceEnum
from apps.core.models import Category, Order, Product
from apps.core.services import OrderError, create_order, resolve_items
from apps.core.utils import created_on, normalize_phone
from apps.voice import understanding as voice
from ...common.errors import ApiError
from ..serializers import (PosCategorySerializer, PosProductSerializer, SaleCreateSerializer, SalesStatsSerializer,
                           SaleSummarySerializer)
from .base import StaffView

SALE_STATUSES = (OrderEnum.ordered.value, OrderEnum.on_the_way.value, OrderEnum.completed.value)
RECENT_SALES = 8


def catalog_products():
    return Product.objects.light().select_related('measure').order_by('category_id', 'id')


def sales():
    return Order.objects.filter(source=OrderSourceEnum.admin.value).select_related('client').prefetch_related(
        'order_items')


def today_stats():
    today = timezone.localdate()
    today_sales = list(sales().filter(**created_on(today)).exclude(status=OrderEnum.rejected.value))
    revenue = sum(order.get_total() for order in today_sales)
    return {
        'count': len(today_sales),
        'revenue': revenue,
        'average': revenue // len(today_sales) if today_sales else 0,
        'all_orders_today': Order.objects.filter(**created_on(today)).exclude(status=OrderEnum.new.value).count(),
    }


def voice_features():
    configured = voice.is_configured()
    return {'gemini': configured, 'live': configured and settings.GEMINI_LIVE_ENABLED}


SaleCreated = inline_serializer('SaleCreated', {'order': SaleSummarySerializer(), 'stats': SalesStatsSerializer()})


class SalesView(StaffView):
    @extend_schema(summary='Everything the point of sale needs', responses=inline_serializer('Sales', {
        'categories': PosCategorySerializer(many=True),
        'products': PosProductSerializer(many=True),
        'recent': SaleSummarySerializer(many=True),
        'stats': SalesStatsSerializer(),
        'voice': inline_serializer('VoiceFeatures', {'gemini': serializers.BooleanField(),
                                                     'live': serializers.BooleanField()}),
    }))
    def get(self, request):
        products = list(catalog_products())
        category_ids = {product.category_id for product in products if product.category_id}
        return Response({
            'categories': PosCategorySerializer(Category.objects.filter(pk__in=category_ids).order_by('id'),
                                                many=True).data,
            'products': PosProductSerializer(products, many=True).data,
            'recent': SaleSummarySerializer(sales().order_by('-created_at')[:RECENT_SALES], many=True).data,
            'stats': today_stats(),
            'voice': voice_features(),
        })

    @extend_schema(summary='Record a sale', request=SaleCreateSerializer, responses={201: SaleCreated})
    def post(self, request):
        data = request.data
        try:
            items = resolve_items(data.get('items'))
        except OrderError as exc:
            raise ApiError(exc.code, detail=exc.detail)

        delivery_type = data.get('delivery_type')
        if delivery_type not in (DeliveryTypeEnum.delivery.value, DeliveryTypeEnum.pickup.value):
            delivery_type = DeliveryTypeEnum.pickup.value
        status = data.get('status')
        if status not in SALE_STATUSES:
            status = (OrderEnum.completed.value if delivery_type == DeliveryTypeEnum.pickup.value
                      else OrderEnum.ordered.value)

        raw_phone = str(data.get('phone') or '').strip()
        order = create_order(
            items=items,
            source=OrderSourceEnum.admin.value,
            status=status,
            created_by=request.user,
            customer_name=data.get('customer_name'),
            phone=(normalize_phone(raw_phone) or raw_phone) if raw_phone else None,
            address=data.get('address') if delivery_type == DeliveryTypeEnum.delivery.value else None,
            delivery_type=delivery_type,
            payment_method=data.get('payment_method'),
            comment=data.get('comment'),
        )
        return Response({'order': SaleSummarySerializer(sales().get(pk=order.pk)).data, 'stats': today_stats()},
                        status=201)
