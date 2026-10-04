"""Addresses ⇄ points on the map, for the shops' checkout and our panel: a Nominatim server (OpenStreetMap data,
GEOCODER_URL). The browsers ask us, we ask it: answers are cached for every business at once, and the public
server's rule — at most one request a second for the whole application — holds across all our workers."""
import hashlib
import logging
import time

import requests
from django.conf import settings
from django.core.cache import cache
from django_tenants.utils import get_public_schema_name, schema_context

logger = logging.getLogger(__name__)

TIMEOUT_SECONDS = 6
REVERSE_CACHE_SECONDS = 7 * 24 * 3600
SEARCH_CACHE_SECONDS = 24 * 3600
TURN_WAIT_SECONDS = 2.5
SEARCH_RESULTS = 5
# Search prefers places within this many degrees (~30 km) of the business; farther ones still come after.
NEAR_DEGREES = 0.3

STREET = ('road', 'pedestrian', 'footway', 'path', 'square')
PLACE = ('amenity', 'shop', 'office', 'tourism', 'leisure', 'building')
AREA = ('neighbourhood', 'quarter', 'residential', 'suburb', 'hamlet')
DISTRICT = ('city_district', 'district', 'borough', 'county')
CITY = ('city', 'town', 'village', 'municipality')


class GeocoderError(Exception):
    """Switched off, out of reach or too busy: the customer types the address."""


def short_address(parts):
    """'Amir Temur ko'chasi, 15, Yunusobod tumani, Toshkent' from Nominatim's address parts (no postcode, region
    or country: a courier does not need them)."""
    def first(keys):
        return next((parts[key] for key in keys if parts.get(key)), '')

    street = first(STREET)
    lines = [', '.join(filter(None, [street, parts.get('house_number', '')])) if street else first(PLACE),
             first(AREA), first(DISTRICT), first(CITY)]
    seen, result = set(), []
    for line in lines:
        if line and line.casefold() not in seen:
            seen.add(line.casefold())
            result.append(line)
    return ', '.join(result)


def _shared(action):
    # Cache keys are kept apart per business (django_tenants.cache.make_key); addresses are the same for all.
    with schema_context(get_public_schema_name()):
        return action()


def _wait_for_turn():
    deadline = time.monotonic() + TURN_WAIT_SECONDS
    while not _shared(lambda: cache.add('geo:turn', 1, 1)):
        if time.monotonic() > deadline:
            raise GeocoderError('busy')
        time.sleep(0.2)


def _ask(path, params):
    if not settings.GEOCODER_URL:
        raise GeocoderError('off')
    _wait_for_turn()
    try:
        response = requests.get(f'{settings.GEOCODER_URL.rstrip("/")}/{path}', timeout=TIMEOUT_SECONDS,
                                params={**params, 'format': 'jsonv2', 'addressdetails': 1},
                                headers={'User-Agent': settings.GEOCODER_USER_AGENT})
        response.raise_for_status()
        return response.json()
    except (requests.RequestException, ValueError) as exc:
        logger.warning('geocoder %s failed: %s', path, exc)
        raise GeocoderError('unreachable') from exc


def reverse(lat, lng, lang):
    """The address at a point, or '' when the map knows none there. Raises GeocoderError."""
    key = f'geo:reverse:{lang}:{lat:.5f}:{lng:.5f}'
    address = _shared(lambda: cache.get(key))
    if address is None:
        data = _ask('reverse', {'lat': f'{lat:.6f}', 'lon': f'{lng:.6f}', 'zoom': 18, 'accept-language': lang})
        address = short_address(data.get('address') or {}) if isinstance(data, dict) else ''
        _shared(lambda: cache.set(key, address, REVERSE_CACHE_SECONDS))
    return address


def search(query, lang, near=None):
    """Up to five places for a typed address, nearer to `near` (lat, lng) first. Raises GeocoderError."""
    params = {'q': query, 'limit': SEARCH_RESULTS, 'accept-language': lang}
    if settings.GEOCODER_COUNTRIES:
        params['countrycodes'] = settings.GEOCODER_COUNTRIES
    if near:
        lat, lng = near
        params['viewbox'] = (f'{lng - NEAR_DEGREES:.4f},{lat + NEAR_DEGREES:.4f},'
                             f'{lng + NEAR_DEGREES:.4f},{lat - NEAR_DEGREES:.4f}')
    request = '&'.join(f'{name}={value}' for name, value in sorted(params.items())).casefold()
    key = 'geo:search:' + hashlib.sha256(request.encode()).hexdigest()
    results = _shared(lambda: cache.get(key))
    if results is None:
        data = _ask('search', params)
        results = []
        for place in data if isinstance(data, list) else []:
            try:
                point = {'lat': round(float(place['lat']), 6), 'lng': round(float(place['lon']), 6)}
            except (KeyError, TypeError, ValueError):
                continue
            address = short_address(place.get('address') or {}) or place.get('display_name', '')
            results.append({'address': address, **point})
        _shared(lambda: cache.set(key, results, SEARCH_CACHE_SECONDS))
    return results
