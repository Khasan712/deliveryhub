"""Branches of the business (apps.core.branches): the admin opens and edits them; staff read them. Only while our
panel lets the business have branches."""
from django.db.models import Count, Prefetch, Q
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response

from apps.core import branches
from apps.core.enums import OrderEnum
from apps.core.models import Branch, Order, User
from apps.core.utils import created_on
from ...common.errors import ApiError
from ...common.permissions import IsBusinessAdmin
from ..serializers import BranchSerializer, BranchWriteSerializer
from .base import StaffView, branch_staff


def visible(request):
    """The branches the signed-in user may see: all for the head office, their own for branch staff."""
    if not branches.enabled(request.tenant):
        raise ApiError('branches_disabled', 403)
    active = Q(staff__is_active=True, staff__is_deleted=False)
    queryset = Branch.objects.annotate(staff_count=Count('staff', filter=active)).prefetch_related(Prefetch(
        'staff', User.objects.filter(is_active=True, is_deleted=False).order_by('first_name', 'id'),
        to_attr='active_staff')).order_by('-is_active', 'name', 'id')
    return queryset.filter(pk=request.user.branch_id) if branch_staff(request) else queryset


def today_by_branch():
    """{branch id: {orders, revenue}} of today's orders (a rejected order brings nothing)."""
    today = {}
    orders = (Order.objects.filter(branch__isnull=False, **created_on(timezone.localdate()))
              .exclude(status__in=(OrderEnum.new.value, OrderEnum.rejected.value)).prefetch_related('order_items'))
    for order in orders:
        day = today.setdefault(order.branch_id, {'orders': 0, 'revenue': 0})
        day['orders'] += 1
        day['revenue'] += order.get_total()
    return today


def answer(branch, status=200):
    return Response(BranchSerializer(branch, context={'today': today_by_branch()}).data, status=status)


class AdminWrites:
    def get_permissions(self):
        return super().get_permissions() if self.request.method == 'GET' else [IsBusinessAdmin()]


class BranchListView(AdminWrites, StaffView):
    @extend_schema(summary='Branches (head office: all; branch staff: their own)',
                   responses=BranchSerializer(many=True),
                   description='Errors: 403 branches_disabled (our panel has not allowed branches).')
    def get(self, request):
        return Response(BranchSerializer(visible(request), many=True, context={'today': today_by_branch()}).data)

    @extend_schema(summary='Open a branch (admin role)', request=BranchWriteSerializer,
                   responses={201: BranchSerializer})
    def post(self, request):
        visible(request)  # branches on
        data = BranchWriteSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        branch = data.save_to(Branch())
        return answer(visible(request).get(pk=branch.pk), status=201)


class BranchDetailView(AdminWrites, StaffView):
    @extend_schema(responses=BranchSerializer)
    def get(self, request, pk):
        return answer(get_object_or_404(visible(request), pk=pk))

    @extend_schema(summary='Edit a branch, or stop (is_active: false) and resume it (admin role)',
                   request=BranchWriteSerializer, responses=BranchSerializer)
    def patch(self, request, pk):
        branch = get_object_or_404(visible(request), pk=pk)
        data = BranchWriteSerializer(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        data.save_to(branch)
        return answer(visible(request).get(pk=pk))

    @extend_schema(summary='Delete a branch that has no orders and no staff (admin role)', responses={204: None},
                   description='Errors: 409 branch_in_use — stop it instead (is_active: false).')
    def delete(self, request, pk):
        branch = get_object_or_404(visible(request), pk=pk)
        if branch.orders.exists() or branch.staff.filter(is_deleted=False).exists():
            raise ApiError('branch_in_use', 409)
        branch.staff.update(branch=None)  # accounts deleted long ago
        branch.delete()
        return Response(status=204)
