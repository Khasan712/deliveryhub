from django.db.models import Q
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response

from apps.core.models import User
from ...common.errors import ApiError
from ..serializers import StaffUserSerializer
from .base import AdminListView, AdminView, search_term


def staff_users():
    return User.objects.filter(is_deleted=False).select_related('branch').order_by('-created_at', '-id')


@extend_schema(summary='Staff users (admins only)', parameters=[OpenApiParameter('search', str)])
class UserListView(AdminListView):
    serializer_class = StaffUserSerializer

    def get_queryset(self):
        queryset, search = staff_users(), search_term(self.request)
        if search:
            queryset = queryset.filter(
                Q(first_name__icontains=search) | Q(last_name__icontains=search) | Q(phone_number__icontains=search))
        return queryset

    @extend_schema(summary='Add a staff user', request=StaffUserSerializer, responses={201: StaffUserSerializer})
    def post(self, request):
        data = StaffUserSerializer(data=request.data, context={'business': request.tenant})
        data.is_valid(raise_exception=True)
        return Response(StaffUserSerializer(data.save()).data, status=201)


class UserDetailView(AdminView):
    @extend_schema(responses=StaffUserSerializer)
    def get(self, request, pk):
        return Response(StaffUserSerializer(get_object_or_404(staff_users(), pk=pk)).data)

    @extend_schema(request=StaffUserSerializer, responses=StaffUserSerializer)
    def patch(self, request, pk):
        user = get_object_or_404(staff_users(), pk=pk)
        data = StaffUserSerializer(user, data=request.data, partial=True, context={'business': request.tenant})
        data.is_valid(raise_exception=True)
        changes = data.validated_data
        if user == request.user and (changes.get('role', user.role) != user.role or changes.get('is_active') is False):
            raise ApiError('cannot_change_self')  # an admin never locks themselves out
        return Response(StaffUserSerializer(data.save()).data)

    @extend_schema(responses={204: None})
    def delete(self, request, pk):
        user = get_object_or_404(staff_users(), pk=pk)
        if user == request.user:
            raise ApiError('cannot_delete_self')
        user.delete()
        return Response(status=204)
