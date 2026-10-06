"""Our page for businesses links to a live sample shop chosen in our panel (docs/api.md, "Our page for businesses")."""
from django_tenants.utils import get_public_schema_name, schema_context

from apps.platform.models import Business
from .test_platform_api import PlatformTestCase

NO_SAMPLE = {'sample': None}


class LandingTests(PlatformTestCase):
    def config(self):
        return self.make_client('hub.localhost').get('/api/v1/landing/config').json()

    def choose(self, sample):
        return self.hub.put('/api/v1/landing', {'sample': sample}, format='json')

    def test_only_our_staff_choose_the_sample(self):
        self.assertEqual(self.hub.get('/api/v1/landing').status_code, 401)
        self.assertEqual(self.choose('test-shop').status_code, 401)

    def test_the_page_links_to_the_chosen_shop(self):
        self.sign_in()
        body = self.hub.get('/api/v1/landing').json()
        self.assertEqual((body['sample'], body['url'], body['config']), (None, 'https://example.uz/', NO_SAMPLE))
        self.assertEqual(self.config(), NO_SAMPLE)  # nobody has to be signed in to ask

        body = self.choose('test-shop').json()
        self.assertEqual(body['sample']['slug'], 'test-shop')
        sample = {'sample': {'name': 'Test Shop', 'url': 'http://test-shop.localhost/'}}
        self.assertEqual(body['config'], sample)
        self.assertEqual(self.config(), sample)

        self.assertEqual(self.choose(None).json()['config'], NO_SAMPLE)

    def test_a_suspended_or_unknown_business_is_not_linked(self):
        self.sign_in()
        self.assertEqual(self.choose('nope').json(), {'error': 'validation', 'fields': {'sample': ['does_not_exist']}})
        self.choose('test-shop')
        with schema_context(get_public_schema_name()):
            Business.objects.filter(pk=self.tenant.pk).update(status=Business.STATUS_SUSPENDED)
        self.assertEqual(self.config(), NO_SAMPLE)  # suspended after it was chosen
        self.assertEqual(self.choose('test-shop').json(), {'error': 'validation', 'fields': {'sample': ['suspended']}})
