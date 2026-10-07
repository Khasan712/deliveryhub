from datetime import timedelta

from django.db.models import Count
from django.db.models.functions import TruncDate
from django.utils import timezone
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.response import Response

from apps.core.enums import OrderEnum
from apps.core.models import Category, Client, Order, Product
from apps.core.utils import created_on
from ..serializers import OrderSummarySerializer
from .base import StaffView
from .orders import with_lines

DAYS = 7
Number = serializers.IntegerField


class DashboardView(StaffView):
    @extend_schema(summary='Key numbers of the business', responses=inline_serializer('Dashboard', {
        'orders': inline_serializer('DashboardOrders', {
            'total': Number(), 'new': Number(), 'on_the_way': Number(), 'completed': Number(),
            'last_7_days': Number()}),
        'clients': inline_serializer('DashboardClients', {'total': Number(), 'new_7_days': Number()}),
        'products': inline_serializer('DashboardProducts', {'total': Number()}),
        'categories': inline_serializer('DashboardCategories', {'total': Number()}),
        'by_status': inline_serializer('StatusCount', {'status': serializers.CharField(), 'count': Number()},
                                       many=True),
        'daily': inline_serializer('DailyCount', {'date': serializers.DateField(), 'count': Number()}, many=True),
        'today': inline_serializer('DashboardToday', {'orders': Number(), 'revenue': Number()}),
        'latest_orders': OrderSummarySerializer(many=True),
    }))
    def get(self, request):
        today = timezone.localdate()
        first_day = today - timedelta(days=DAYS - 1)
        orders = Order.objects.exclude(status=OrderEnum.new.value)  # unfinished bot carts never count

        by_status = {row['status']: row['count'] for row in orders.values('status').annotate(count=Count('id'))}
        recent = orders.filter(**created_on(first_day, today))
        per_day = {
            row['day']: row['count']
            for row in recent.annotate(day=TruncDate('created_at')).values('day').annotate(count=Count('id'))
        }
        latest = with_lines(orders.select_related('client')).order_by('-created_at')[:10]
        # Today's money: every channel, a rejected order brings none.
        today_orders = orders.filter(**created_on(today)).prefetch_related('order_items')
        revenue = sum(order.get_total() for order in today_orders if order.status != OrderEnum.rejected.value)
        return Response({
            'orders': {
                'total': sum(by_status.values()),
                'new': by_status.get(OrderEnum.ordered.value, 0),
                'on_the_way': by_status.get(OrderEnum.on_the_way.value, 0),
                'completed': by_status.get(OrderEnum.completed.value, 0),
                'last_7_days': sum(per_day.values()),
            },
            'clients': {
                'total': Client.objects.count(),
                'new_7_days': Client.objects.filter(**created_on(first_day, today)).count(),
            },
            'products': {'total': Product.objects.count()},
            'categories': {'total': Category.objects.count()},
            'by_status': [{'status': status, 'count': count} for status, count in sorted(by_status.items())],
            'daily': [
                {'date': (first_day + timedelta(days=offset)).isoformat(),
                 'count': per_day.get(first_day + timedelta(days=offset), 0)}
                for offset in range(DAYS)
            ],
            'today': {'orders': per_day.get(today, 0), 'revenue': revenue},
            'latest_orders': OrderSummarySerializer(latest, many=True).data,
        })
