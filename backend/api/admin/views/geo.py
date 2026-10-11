"""GET /api/v1/geo/reverse and /api/v1/geo/search for the admin panel: the map of a branch's place."""
from ...common import geo
from ...common.representations import business_point
from .base import StaffView


class GeoReverseView(geo.GeoReverseMixin, StaffView):
    pass


class GeoSearchView(geo.GeoSearchMixin, StaffView):
    def near(self, request):
        point = business_point(request.tenant)
        return (point['lat'], point['lng']) if point['lat'] is not None else None
