from datetime import timedelta

from django.db.models import Count
from django.db.models.functions import TruncDate
from django.utils import timezone
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.response import Response

from apps.core import branches
from apps.core.enums import OrderEnum
from apps.core.models import Branch, Category, Client, Order, Product
from apps.core.utils import created_on
from ..serializers import OrderSummarySerializer
from .base import StaffView, branch_staff, scoped
from .orders import summary_context, with_lines

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
        'branches': inline_serializer('DashboardBranch', {
            'id': Number(), 'name': serializers.CharField(), 'orders': Number(), 'revenue': Number()},
            many=True, help_text="Head office with branches on: today's orders and money of every branch"),
        'unassigned': Number(help_text='Head office: new orders waiting to be sent to a branch'),
    }), description='Branch staff get the numbers of their branch.')
    def get(self, request):
        today = timezone.localdate()
        first_day = today - timedelta(days=DAYS - 1)
        # Unfinished bot carts never count; branch staff count their branch.
        orders = scoped(request, Order.objects.exclude(status=OrderEnum.new.value))

        by_status = {row['status']: row['count'] for row in orders.values('status').annotate(count=Count('id'))}
        recent = orders.filter(**created_on(first_day, today))
        per_day = {
            row['day']: row['count']
            for row in recent.annotate(day=TruncDate('created_at')).values('day').annotate(count=Count('id'))
        }
        latest = with_lines(orders.select_related('client')).order_by('-created_at')[:10]
        # Today's money: every channel, a rejected order brings none.
        today_orders = [order for order in orders.filter(**created_on(today)).prefetch_related('order_items')
                        if order.status != OrderEnum.rejected.value]
        revenue = sum(order.get_total() for order in today_orders)
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
            'latest_orders': OrderSummarySerializer(latest, many=True, context=summary_context(request)).data,
            **self.by_branch(request, orders, today_orders),
        })

    def by_branch(self, request, orders, today_orders):
        if branch_staff(request) or not branches.enabled(request.tenant):
            return {'branches': [], 'unassigned': 0}
        money = {}
        for order in today_orders:
            day = money.setdefault(order.branch_id, {'orders': 0, 'revenue': 0})
            day['orders'] += 1
            day['revenue'] += order.get_total()
        shown = [branch for branch in Branch.objects.order_by('name', 'id')
                 if branch.is_active or branch.pk in money]
        return {
            'branches': [{'id': branch.pk, 'name': branch.name, **money.get(branch.pk, {'orders': 0, 'revenue': 0})}
                         for branch in shown],
            'unassigned': orders.filter(status=OrderEnum.ordered.value, branch__isnull=True).count(),
        }
