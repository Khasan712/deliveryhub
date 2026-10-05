"""What our panel shows about a business: its numbers and its owner (both live in the business's schema)."""
from django.utils import timezone
from django_tenants.utils import get_public_schema_name, tenant_context

from apps.core.enums import OrderEnum, UserRole
from .models import Business


def businesses():
    return Business.objects.exclude(schema_name=get_public_schema_name()).prefetch_related('bots')


def business_stats(business):
    from apps.core.models import Client, Order
    from apps.core.utils import created_on

    with tenant_context(business):
        orders = Order.objects.exclude(status__in=(OrderEnum.new.value, OrderEnum.rejected.value))
        today = list(orders.filter(**created_on(timezone.localdate())).prefetch_related('order_items'))
        return {
            'orders_today': len(today),
            'revenue_today': sum(order.get_total() for order in today),
            'orders_total': orders.count(),
            'customers': Client.objects.count(),
        }


def owner_of(business):
    """The first admin account of the business (created with it), or None."""
    from apps.core.models import User

    with tenant_context(business):
        return User.objects.filter(role=UserRole.admin.value, is_deleted=False).order_by('id').first()
