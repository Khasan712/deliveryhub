"""Working hours in every API the same way (docs/api.md, "Working hours"): the week, the time zone and whether
the business is open right now."""
from django.conf import settings
from rest_framework import serializers

from apps.platform import hours


class ShiftSerializer(serializers.Serializer):
    open = serializers.CharField(help_text='HH:MM')
    close = serializers.CharField(help_text='HH:MM or 24:00; not after `open`: the next day')


class WeekField(serializers.ListField):
    """Seven shifts (Monday first), `null` for a day off; the whole week `null`: open at any time."""

    def __init__(self, **kwargs):
        kwargs.setdefault('child', ShiftSerializer(allow_null=True))
        kwargs.setdefault('allow_null', True)
        kwargs.setdefault('min_length', hours.DAYS)
        kwargs.setdefault('max_length', hours.DAYS)
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        try:
            return hours.validate(data)
        except ValueError:
            raise serializers.ValidationError('invalid', code='invalid')

    def to_representation(self, value):
        return value


class WorkingHoursSerializer(serializers.Serializer):
    week = WeekField()
    timezone = serializers.CharField()
    open = serializers.BooleanField(help_text='At the time of the response')
    opens_at = serializers.DateTimeField(allow_null=True, help_text='While closed: the next opening')
    closes_at = serializers.DateTimeField(allow_null=True, help_text='While open: the closing (null: never)')


def hours_payload(business):
    """{"week", "timezone", "open", "opens_at", "closes_at"} of a business."""
    return {'week': business.working_hours, 'timezone': settings.TIME_ZONE, **hours.status(business.working_hours)}
