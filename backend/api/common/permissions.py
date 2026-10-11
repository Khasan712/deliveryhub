from django_tenants.utils import get_public_schema_name
from rest_framework.permissions import BasePermission

from apps.core import branches
from apps.core.enums import UserRole


def in_business(request):
    """True on the hosts of a business (shop, admin panel), False on our platform host."""
    tenant = getattr(request, 'tenant', None)
    return tenant is not None and tenant.schema_name != get_public_schema_name()


class IsStaff(BasePermission):
    """A signed-in staff member (admin or manager) of the business of this host."""

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and in_business(request))


class IsBusinessAdmin(IsStaff):
    """Staff with the admin role (managers get 403)."""

    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.role == UserRole.admin.value


class IsHeadOffice(IsStaff):
    """Staff who see the whole business: everyone but the staff of one branch (apps.core.branches)."""

    def has_permission(self, request, view):
        return super().has_permission(request, view) and not branches.is_branch_staff(request.user, request.tenant)


class IsPlatformStaff(BasePermission):
    """Our own staff: superusers of the public schema, on the platform host."""

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_superuser and not in_business(request))


class IsCustomer(BasePermission):
    """A shop customer signed in with a bearer token (api.shop.authentication)."""

    def has_permission(self, request, view):
        return bool(getattr(request.user, 'client', None))
