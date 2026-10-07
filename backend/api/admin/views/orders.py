from django.db.models import Prefetch, Q
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response

from apps.core.enums import OrderEnum
from apps.core.models import Order, Product
from apps.telegram.outbox import queue_order_status
from ..serializers import OrderDetailSerializer, OrderStatusSerializer, OrderSummarySerializer
from .base import StaffListView, StaffView, search_term


def orders():
    """Every real order (unfinished bot carts have status `new` and are never shown)."""
    return Order.objects.exclude(status=OrderEnum.new.value).select_related('client').order_by('-created_at')


def with_lines(queryset):
    """Orders with their lines and the lines' products: an OrderSummary names what was ordered."""
    return queryset.prefetch_related(Prefetch('order_items__product', Product.objects.light()))


def search_orders(queryset, search):
    if not search:
        return queryset
    query = (Q(customer_name__icontains=search) | Q(phone__icontains=search) | Q(client__first_name__icontains=search)
             | Q(client__last_name__icontains=search) | Q(client__phone__icontains=search))
    number = search.lstrip('#')
    if number.isdigit():
        query |= Q(pk=int(number))
    return queryset.filter(query)


@extend_schema(summary='Orders, newest first', parameters=[
    OpenApiParameter('status', str), OpenApiParameter('source', str),
    OpenApiParameter('search', str, description='Order number, customer name or phone')])
class OrderListView(StaffListView):
    serializer_class = OrderSummarySerializer

    def get_queryset(self):
        params = self.request.query_params
        queryset = with_lines(orders())
        if params.get('status'):
            queryset = queryset.filter(status=params['status'])
        if params.get('source'):
            queryset = queryset.filter(source=params['source'])
        return search_orders(queryset, search_term(self.request))


def order_detail(pk):
    return get_object_or_404(with_lines(orders().select_related('created_by')), pk=pk)


class OrderDetailView(StaffView):
    @extend_schema(summary='One order', responses=OrderDetailSerializer)
    def get(self, request, pk):
        return Response(OrderDetailSerializer(order_detail(pk)).data)

    @extend_schema(summary='Change the status (the customer gets a Telegram message)',
                   request=OrderStatusSerializer, responses=OrderDetailSerializer)
    def patch(self, request, pk):
        order = order_detail(pk)
        data = OrderStatusSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        status = data.validated_data['status']
        if status != order.status:
            order.status = status
            order.save(update_fields=['status', 'updated_at'])
            queue_order_status(order, status)
        return Response(OrderDetailSerializer(order).data)
