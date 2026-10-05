"""The mobile app opens the shop of the business chosen in our panel (docs/api.md, "Mobile app")."""
from django.test import override_settings
from django_tenants.utils import get_public_schema_name, schema_context

from apps.platform.models import Business
from .test_platform_api import PlatformTestCase

NO_SHOP = {'shop': None, 'min_version': '1.0.0', 'store': {'android': None, 'ios': None}}


class MobileAppTests(PlatformTestCase):
    def config(self):
        return self.make_client('hub.localhost').get('/api/v1/app/config').json()

    def choose(self, business):
        return self.hub.put('/api/v1/mobile-app', {'business': business}, format='json')

    def test_only_our_staff_choose_the_business(self):
        self.assertEqual(self.hub.get('/api/v1/mobile-app').status_code, 401)
        self.assertEqual(self.choose('test-shop').status_code, 401)

    def test_the_app_opens_the_chosen_shop(self):
        self.sign_in()
        self.assertEqual(self.hub.get('/api/v1/mobile-app').json()['business'], None)
        self.assertEqual(self.config(), NO_SHOP)  # nobody has to be signed in to ask

        with schema_context(get_public_schema_name()):
            Business.objects.filter(pk=self.tenant.pk).update(tagline='Tez va mazali', brand_color='#1e5aa8')
        body = self.choose('test-shop').json()
        self.assertEqual(body['business']['slug'], 'test-shop')
        shop = {'slug': 'test-shop', 'name': 'Test Shop', 'tagline': 'Tez va mazali', 'logo': None,
                'brand_color': '#1e5aa8', 'url': 'http://test-shop.localhost/'}
        self.assertEqual(body['config']['shop'], shop)
        self.assertEqual(self.config()['shop'], shop)

        self.assertEqual(self.choose(None).json()['config'], NO_SHOP)

    def test_a_suspended_or_unknown_business_is_not_shown(self):
        self.sign_in()
        self.assertEqual(self.choose('nope').json(),
                         {'error': 'validation', 'fields': {'business': ['does_not_exist']}})
        self.choose('test-shop')
        with schema_context(get_public_schema_name()):
            Business.objects.filter(pk=self.tenant.pk).update(status=Business.STATUS_SUSPENDED)
        self.assertEqual(self.config()['shop'], None)  # suspended after it was chosen
        self.assertEqual(self.choose('test-shop').json(),
                         {'error': 'validation', 'fields': {'business': ['suspended']}})

    @override_settings(MOBILE_MIN_VERSION='1.2.0', MOBILE_ANDROID_URL='https://play.google.com/store/apps/details?id=x')
    def test_an_old_app_is_told_to_update(self):
        config = self.config()
        self.assertEqual((config['min_version'], config['store']['android'], config['store']['ios']),
                         ('1.2.0', 'https://play.google.com/store/apps/details?id=x', None))
