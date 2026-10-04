"""GET /api/v1/business — the business's working hours for its staff; PATCH — the admin sets them (docs/api.md)."""
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.response import Response

from ...common.hours import WeekField, WorkingHoursSerializer, hours_payload
from ...common.permissions import IsBusinessAdmin
from .base import StaffView


class WeekUpdate(serializers.Serializer):
    week = WeekField()


class BusinessView(StaffView):
    def get_permissions(self):
        # Every staff member sees the hours; only the admin (the owner) changes them.
        return [IsBusinessAdmin()] if self.request.method == 'PATCH' else super().get_permissions()

    @extend_schema(summary='Working hours and whether the business is open now', responses=WorkingHoursSerializer)
    def get(self, request):
        return Response(hours_payload(request.tenant))

    @extend_schema(summary='Set the working hours (admin role)', request=WeekUpdate, responses=WorkingHoursSerializer,
                   description='`week`: seven shifts, Monday first, null for a day off; `null` — open at any time.')
    def patch(self, request):
        data = WeekUpdate(data=request.data)
        data.is_valid(raise_exception=True)
        business = request.tenant
        business.working_hours = data.validated_data['week']
        business.save(update_fields=['working_hours'])
        return Response(hours_payload(business))
