"""The map: addresses ⇄ points through a Nominatim server (apps/platform/geocoding.py, docs/api.md)."""
from decimal import Decimal
from unittest import mock

import requests
from django.core.cache import cache
from django.test import SimpleTestCase, override_settings
from django_tenants.utils import get_public_schema_name, schema_context

from apps.platform import geocoding
from apps.platform.models import Business
from apps.platform.testing import BusinessTestCase
from .test_platform_api import PlatformTestCase

PUBLIC = get_public_schema_name()
STREET = {'road': "Amir Temur ko'chasi", 'house_number': '15', 'neighbourhood': 'Qashqar mahalla',
          'city_district': 'Yunusobod tumani', 'city': 'Toshkent', 'postcode': '100000', 'country': 'Oʻzbekiston',
          'country_code': 'uz'}
STREET_LINE = "Amir Temur ko'chasi, 15, Qashqar mahalla, Yunusobod tumani, Toshkent"
FOUND = [
    {'lat': '41.2995', 'lon': '69.2401', 'display_name': 'Chilonzor, Toshkent, Oʻzbekiston',
     'address': {'suburb': 'Chilonzor', 'city': 'Toshkent', 'country': 'Oʻzbekiston'}},
    {'lat': 'not a number', 'lon': '69.1', 'display_name': 'Broken'},
    {'lat': '41.2', 'lon': '69.1', 'display_name': 'Somewhere far, Oʻzbekiston', 'address': {}},
]


def answer(data, status=200):
    response = mock.Mock(status_code=status)
    response.json.return_value = data
    response.raise_for_status.side_effect = requests.HTTPError(str(status)) if status >= 400 else None
    return response


def upstream(data=None, **kwargs):
    return mock.patch('apps.platform.geocoding.requests.get', return_value=answer(data, **kwargs))


class ShortAddressTests(SimpleTestCase):
    def test_street_and_house_then_area_district_and_city(self):
        self.assertEqual(geocoding.short_address(STREET), STREET_LINE)

    def test_a_named_place_without_a_street_and_no_repeats(self):
        self.assertEqual(geocoding.short_address({'amenity': 'Chorsu bozori', 'suburb': 'Toshkent',
                                                  'city': 'Toshkent'}), 'Chorsu bozori, Toshkent')
        self.assertEqual(geocoding.short_address({}), '')


# Requests to the map server wait for their turn (one a second): not in these tests, except where it is tested.
@mock.patch('apps.platform.geocoding._wait_for_turn')
class ShopGeoTests(BusinessTestCase):
    def test_the_address_at_a_point(self, _):
        with upstream({'address': STREET}) as get:
            response = self.shop.get('/api/v1/geo/reverse?lat=41.3111&lng=69.2797&lang=ru')
            self.assertEqual(response.json(), {'address': STREET_LINE})
            self.assertEqual(get.call_args.args, ('http://geocoder.invalid/reverse',))
            params = get.call_args.kwargs['params']
            self.assertEqual((params['lat'], params['lon'], params['accept-language'], params['format']),
                             ('41.311100', '69.279700', 'ru', 'jsonv2'))
            self.assertIn('DeliveryHub', get.call_args.kwargs['headers']['User-Agent'])
            # The same point again (a metre away at most) comes from the cache.
            self.assertEqual(self.shop.get('/api/v1/geo/reverse?lat=41.311102&lng=69.279698&lang=ru').json(),
                             {'address': STREET_LINE})
            self.assertEqual(get.call_count, 1)

    def test_no_address_there(self, _):
        with upstream({'error': 'Unable to geocode'}):
            self.assertEqual(self.shop.get('/api/v1/geo/reverse?lat=40&lng=60').json(), {'address': ''})

    def test_bad_points(self, _):
        response = self.shop.get('/api/v1/geo/reverse?lat=91&lng=69.2&lang=en')
        self.assertEqual(response.json(), {'error': 'validation', 'fields': {
            'lat': ['max_value'], 'lang': ['invalid_choice']}})
        self.assertEqual(self.shop.get('/api/v1/geo/reverse?lat=41.3').json()['fields'], {'lng': ['required']})

    def test_out_of_reach_or_switched_off(self, _):
        with mock.patch('apps.platform.geocoding.requests.get', side_effect=requests.ConnectionError('down')):
            response = self.shop.get('/api/v1/geo/reverse?lat=41.3&lng=69.2')
        self.assertEqual((response.status_code, response.json()), (503, {'error': 'geocoder_unavailable'}))
        with upstream(status=503):
            self.assertEqual(self.shop.get('/api/v1/geo/search?q=Chilonzor').status_code, 503)
        with override_settings(GEOCODER_URL=''), upstream({'address': STREET}) as get:
            self.assertEqual(self.shop.get('/api/v1/geo/reverse?lat=41.3&lng=69.2').status_code, 503)
            get.assert_not_called()

    def test_search_prefers_the_surroundings_of_the_business(self, _):
        Business.objects.filter(pk=self.tenant.pk).update(latitude=Decimal('41.311081'),
                                                          longitude=Decimal('69.279737'))
        with upstream(FOUND) as get:
            body = self.shop.get('/api/v1/geo/search?q=Chilonzor').json()
        self.assertEqual(body, {'results': [
            {'address': 'Chilonzor, Toshkent', 'lat': 41.2995, 'lng': 69.2401},
            {'address': 'Somewhere far, Oʻzbekiston', 'lat': 41.2, 'lng': 69.1},
        ]})
        params = get.call_args.kwargs['params']
        self.assertEqual((params['q'], params['countrycodes'], params['accept-language'], params['limit']),
                         ('Chilonzor', 'uz', 'uz', 5))
        self.assertEqual(params['viewbox'], '68.9797,41.6111,69.5797,41.0111')
        self.assertEqual(self.shop.get('/api/v1/geo/search?q=c').json()['fields'], {'q': ['min_length']})

    def test_searches_are_limited_per_visitor(self, _):
        with upstream([]):
            statuses = [self.shop.get(f'/api/v1/geo/search?q=street-{n}').status_code for n in range(21)]
        self.assertEqual(statuses, [200] * 20 + [429])


class TurnTests(BusinessTestCase):
    def test_one_request_a_second_for_all_businesses(self):
        with schema_context(PUBLIC):
            cache.set('geo:turn', 1, 60)  # another worker (or business) has just asked
        with mock.patch('apps.platform.geocoding.time.sleep'), \
                mock.patch('apps.platform.geocoding.time.monotonic', side_effect=[0, 1, 2, 3]), upstream() as get:
            with self.assertRaises(geocoding.GeocoderError):
                geocoding.reverse(41.3, 69.2, 'uz')
        get.assert_not_called()
        with schema_context(PUBLIC):
            cache.delete('geo:turn')
        with upstream({'address': STREET}):
            self.assertEqual(geocoding.reverse(41.3, 69.2, 'uz'), STREET_LINE)


@mock.patch('apps.platform.geocoding._wait_for_turn')
class PlatformGeoTests(PlatformTestCase):
    def test_only_our_staff(self, _):
        self.assertEqual(self.hub.get('/api/v1/geo/reverse?lat=41.3&lng=69.2').status_code, 401)
        self.sign_in()
        with upstream(FOUND) as get:
            self.assertEqual(len(self.hub.get('/api/v1/geo/search?q=Chilonzor&lang=ru').json()['results']), 2)
            self.assertNotIn('viewbox', get.call_args.kwargs['params'])
        with upstream({'address': STREET}):
            self.assertEqual(self.hub.get('/api/v1/geo/reverse?lat=41.3&lng=69.2').json(), {'address': STREET_LINE})
