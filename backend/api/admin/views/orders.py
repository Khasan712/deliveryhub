from django.db.models import Prefetch, Q
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response

from apps.core import branches
from apps.core.enums import OrderEnum
from apps.core.models import Order, Product
from apps.telegram.outbox import queue_order_status
from ...common.errors import ApiError
from ...common.permissions import IsHeadOffice
from ..serializers import (OrderBranchSerializer, OrderDetailSerializer, OrderStatusSerializer,
                           OrderSummarySerializer)
from .base import StaffListView, StaffView, branch_staff, scoped, search_term


def orders():
    """Every real order (unfinished bot carts have status `new` and are never shown)."""
    return Order.objects.exclude(status=OrderEnum.new.value).select_related('client').order_by('-created_at')


def with_lines(queryset):
    """Orders with their branch, lines and the lines' products: an OrderSummary names what was ordered."""
    return queryset.select_related('branch').prefetch_related(
        Prefetch('order_items__product', Product.objects.light()))


def search_orders(queryset, search):
    if not search:
        return queryset
    query = (Q(customer_name__icontains=search) | Q(phone__icontains=search) | Q(client__first_name__icontains=search)
             | Q(client__last_name__icontains=search) | Q(client__phone__icontains=search))
    number = search.lstrip('#')
    if number.isdigit():
        query |= Q(pk=int(number))
    return queryset.filter(query)


def summary_context(request):
    """The head office, while orders are dispatched: the branches an order without one may go to (the nearest is
    named in the list)."""
    if branch_staff(request) or not branches.enabled(request.tenant):
        return {}
    active = list(branches.active_branches())
    return {'dispatch_to': active} if len(active) >= 2 else {}


def detail_context(request):
    """The head office with branches on: every active branch, to send the order to."""
    if branch_staff(request) or not branches.enabled(request.tenant):
        return {}
    return {'branch_options': list(branches.active_branches())}


@extend_schema(summary='Orders, newest first', parameters=[
    OpenApiParameter('status', str), OpenApiParameter('source', str),
    OpenApiParameter('branch', str, description='Head office: a branch id, or `none` for orders without a branch'),
    OpenApiParameter('search', str, description='Order number, customer name or phone')])
class OrderListView(StaffListView):
    serializer_class = OrderSummarySerializer

    def get_queryset(self):
        params = self.request.query_params
        queryset = with_lines(scoped(self.request, orders()))
        if params.get('status'):
            queryset = queryset.filter(status=params['status'])
        if params.get('source'):
            queryset = queryset.filter(source=params['source'])
        branch = params.get('branch', '')
        if branch and not branch_staff(self.request):
            queryset = queryset.filter(branch__isnull=True) if branch == 'none' else (
                queryset.filter(branch_id=int(branch)) if branch.isdigit() else queryset.none())
        return search_orders(queryset, search_term(self.request))

    def get_serializer_context(self):
        return {**super().get_serializer_context(), **summary_context(self.request)}


def order_detail(request, pk):
    return get_object_or_404(with_lines(scoped(request, orders()).select_related('created_by', 'assigned_by')), pk=pk)


def detail(request, order):
    return OrderDetailSerializer(order, context=detail_context(request)).data


class OrderDetailView(StaffView):
    @extend_schema(summary='One order', responses=OrderDetailSerializer)
    def get(self, request, pk):
        return Response(detail(request, order_detail(request, pk)))

    @extend_schema(summary='Change the status (the customer gets a Telegram message)',
                   request=OrderStatusSerializer, responses=OrderDetailSerializer)
    def patch(self, request, pk):
        order = order_detail(request, pk)
        data = OrderStatusSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        status = data.validated_data['status']
        if status != order.status:
            order.status = status
            order.save(update_fields=['status', 'updated_at'])
            queue_order_status(order, status)
        return Response(detail(request, order))


class OrderBranchView(StaffView):
    permission_classes = [IsHeadOffice]

    @extend_schema(summary='Send the order to a branch (head office; the staff bot tells the branch)',
                   request=OrderBranchSerializer, responses=OrderDetailSerializer,
                   description='Also moves it to another branch. Errors: 400 branches_disabled, 400 validation '
                               '(branch_id: does_not_exist, inactive), 403 for branch staff.')
    def put(self, request, pk):
        if not branches.enabled(request.tenant):
            raise ApiError('branches_disabled')
        order = order_detail(request, pk)
        data = OrderBranchSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        branches.assign(order, data.validated_data['branch_id'], request.user)
        return Response(detail(request, order_detail(request, pk)))
