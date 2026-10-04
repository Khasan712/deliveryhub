"""GET /api/v1/geo/reverse and /api/v1/geo/search — the map of the shop's checkout and of our panel (docs/api.md).
Mixed into a view of each API, which brings its own authentication."""
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.response import Response

from apps.platform import geocoding
from .errors import ApiError
from .ratelimit import client_ip, throttle

LANGS = ('uz', 'ru')
# Per IP and 5 minutes: the map asks once the customer stops moving it, a search only on Enter.
REVERSE_PER_5_MINUTES = 60
SEARCH_PER_5_MINUTES = 20
ERRORS = 'Errors: 503 geocoder_unavailable (out of reach or switched off: the address is typed instead).'


class ReverseQuery(serializers.Serializer):
    lat = serializers.FloatField(min_value=-90, max_value=90)
    lng = serializers.FloatField(min_value=-180, max_value=180)
    lang = serializers.ChoiceField(choices=LANGS, default='uz')


class SearchQuery(serializers.Serializer):
    q = serializers.CharField(min_length=2, max_length=200)
    lang = serializers.ChoiceField(choices=LANGS, default='uz')


class PlaceSerializer(serializers.Serializer):
    address = serializers.CharField()
    lat = serializers.FloatField()
    lng = serializers.FloatField()


def valid(serializer_class, request):
    query = serializer_class(data=request.query_params)
    query.is_valid(raise_exception=True)
    return query.validated_data


class GeoReverseMixin:
    @extend_schema(summary='The address at a point of the map', parameters=[ReverseQuery], description=ERRORS,
                   responses=inline_serializer('ReverseGeocode', {
                       'address': serializers.CharField(help_text="'' when the map knows no address there")}))
    def get(self, request):
        query = valid(ReverseQuery, request)
        throttle(f'geo-reverse:{client_ip(request)}', REVERSE_PER_5_MINUTES, 300)
        try:
            address = geocoding.reverse(query['lat'], query['lng'], query['lang'])
        except geocoding.GeocoderError:
            raise ApiError('geocoder_unavailable', 503)
        return Response({'address': address})


class GeoSearchMixin:
    def near(self, request):
        """(lat, lng) whose surroundings come first in the results."""
        return None

    @extend_schema(summary='Places for a typed address (up to 5)', parameters=[SearchQuery], description=ERRORS,
                   responses=inline_serializer('GeoSearch', {'results': PlaceSerializer(many=True)}))
    def get(self, request):
        query = valid(SearchQuery, request)
        throttle(f'geo-search:{client_ip(request)}', SEARCH_PER_5_MINUTES, 300)
        try:
            results = geocoding.search(query['q'], query['lang'], self.near(request))
        except geocoding.GeocoderError:
            raise ApiError('geocoder_unavailable', 503)
        return Response({'results': results})
