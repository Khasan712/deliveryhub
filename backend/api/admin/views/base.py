from rest_framework import generics
from rest_framework.permissions import SAFE_METHODS
from rest_framework.views import APIView

from apps.core import branches
from ...common.auth import SessionAuthentication
from ...common.permissions import IsBusinessAdmin, IsHeadOffice, IsStaff


class StaffView(APIView):
    """An endpoint for any signed-in staff member of the business (admin, manager or branch staff)."""
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsStaff]


class StaffListView(generics.ListAPIView):
    """A paginated list for staff; subclasses filter in get_queryset()."""
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsStaff]


class AdminView(StaffView):
    permission_classes = [IsBusinessAdmin]


class AdminListView(StaffListView):
    permission_classes = [IsBusinessAdmin]


class HeadOfficeWrites:
    """Every staff member reads; only the head office changes (the menu is one for every branch: a branch hiding a
    dish would hide it everywhere)."""

    def get_permissions(self):
        return super().get_permissions() if self.request.method in SAFE_METHODS else [IsHeadOffice()]


def search_term(request):
    return request.query_params.get('search', '').strip()


def branch_staff(request):
    """The signed-in user sees only their branch's orders (apps.core.branches)."""
    return branches.is_branch_staff(request.user, request.tenant)


def scoped(request, orders):
    """The orders the signed-in user may see."""
    return branches.scope_orders(orders, request.user, request.tenant)
