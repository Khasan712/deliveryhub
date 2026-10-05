"""Applications from the landing page's form; our staff see and mark them in the panel (docs/api.md, "Applications")."""
from datetime import timedelta

from django.utils import timezone
from django_tenants.utils import get_public_schema_name, schema_context

from apps.platform.models import Lead
from .test_platform_api import PlatformTestCase

PUBLIC = get_public_schema_name()
FORM = {'name': 'Aziz', 'phone': '90 123 45 67', 'business': "Navro'z Choyxona", 'kind': 'cafe',
        'comment': '2 ta filial', 'lang': 'ru'}


class LeadTests(PlatformTestCase):
    def send(self, client=None, **changes):
        return (client or self.hub).post('/api/v1/leads', {**FORM, **changes}, format='json')

    def leads(self):
        with schema_context(PUBLIC):
            fields = ('name', 'phone', 'business', 'kind', 'comment', 'lang', 'status')
            return list(Lead.objects.order_by('id').values(*fields))

    def make(self, **fields):
        with schema_context(PUBLIC):
            return Lead.objects.create(**{'name': 'Aziz', 'phone': '+998901234567', **fields})

    def test_anyone_can_leave_an_application(self):
        response = self.send()
        self.assertEqual((response.status_code, response.json()), (201, {'ok': True}))
        self.assertEqual(self.leads(), [{'name': 'Aziz', 'phone': '+998901234567', 'business': "Navro'z Choyxona",
                                         'kind': 'cafe', 'comment': '2 ta filial', 'lang': 'ru', 'status': 'new'}])

        self.send(phone='+998 93 555 77 88', business='', kind='', comment='', lang='uz')
        self.assertEqual(self.leads()[1]['phone'], '+998935557788')

    def test_the_form_is_checked(self):
        def errors(**changes):
            return self.send(**changes).json()

        self.assertEqual(errors(name='  '), {'error': 'validation', 'fields': {'name': ['blank']}})
        self.assertEqual(errors(name='x' * 121), {'error': 'validation', 'fields': {'name': ['max_length']}})
        self.assertEqual(errors(phone='12345'), {'error': 'validation', 'fields': {'phone': ['invalid']}})
        self.assertEqual(errors(phone='+7 999 123 45 67'), {'error': 'validation', 'fields': {'phone': ['invalid']}})
        self.assertEqual(errors(kind='bank'), {'error': 'validation', 'fields': {'kind': ['invalid_choice']}})
        response = self.hub.post('/api/v1/leads', {'lang': 'uz'}, format='json')
        self.assertEqual(response.json(),
                         {'error': 'validation', 'fields': {'name': ['required'], 'phone': ['required']}})
        self.assertEqual(self.leads(), [])

    def test_the_same_phone_again_updates_a_new_application(self):
        self.send()
        self.send(name='Aziz aka', comment='', kind='')  # sent again: newer details, nothing erased
        self.assertEqual(self.leads(), [{'name': 'Aziz aka', 'phone': '+998901234567', 'business': "Navro'z Choyxona",
                                         'kind': 'cafe', 'comment': '2 ta filial', 'lang': 'ru', 'status': 'new'}])

        with schema_context(PUBLIC):
            Lead.objects.update(status=Lead.STATUS_CONTACTED)
        self.send()  # we have already called: this is a new request
        self.assertEqual([lead['status'] for lead in self.leads()], ['contacted', 'new'])

        with schema_context(PUBLIC):
            Lead.objects.update(status=Lead.STATUS_NEW, created_at=timezone.now() - timedelta(days=2))
        self.send()
        self.assertEqual(len(self.leads()), 3)

    def test_a_bot_that_fills_the_hidden_field_is_dropped(self):
        response = self.send(website='https://spam.example')
        self.assertEqual((response.status_code, response.json()), (201, {'ok': True}))
        self.assertEqual(self.leads(), [])

    def test_one_address_sends_a_few_an_hour(self):
        for _ in range(10):
            self.send(phone='+998901112233')
        response = self.send(phone='+998901112244')
        self.assertEqual((response.status_code, response.json()), (429, {'error': 'too_many_requests'}))
        self.assertEqual(len(self.leads()), 1)

    def test_a_signed_in_member_of_staff_sends_the_form_without_csrf(self):
        client = self.platform_client(enforce_csrf_checks=True)
        with schema_context(PUBLIC):
            client.force_login(self.staff)
        self.assertEqual(self.send(client).status_code, 201)
        self.assertEqual(client.get('/api/v1/leads').status_code, 200)

    def test_only_our_staff_see_and_change_applications(self):
        lead = self.make()
        self.assertEqual(self.hub.get('/api/v1/leads').status_code, 401)
        self.assertEqual(self.hub.patch(f'/api/v1/leads/{lead.pk}', {'status': 'won'}, format='json').status_code, 401)
        self.assertEqual(self.client.get('/api/v1/leads').status_code, 404)  # not a business's API

    def test_the_list_with_counts_by_status(self):
        old = self.make(name='Old', status=Lead.STATUS_LOST)
        first, second = self.make(name='First'), self.make(name='Second', phone='+998935557788')
        self.sign_in()

        body = self.hub.get('/api/v1/leads').json()
        self.assertEqual((body['count'], body['page'], body['pages']), (3, 1, 1))
        self.assertEqual([lead['name'] for lead in body['results']], ['Second', 'First', 'Old'])
        self.assertEqual(body['counts'], {'new': 2, 'contacted': 0, 'won': 0, 'lost': 1})
        self.assertEqual(body['results'][0], {
            'id': second.pk, 'name': 'Second', 'phone': '+998935557788', 'business': '', 'kind': '', 'comment': '',
            'lang': 'uz', 'status': 'new', 'note': '', 'created_at': body['results'][0]['created_at'],
            'updated_at': body['results'][0]['updated_at'], 'contacted_at': None})

        body = self.hub.get('/api/v1/leads?status=new&page_size=1&page=2').json()
        self.assertEqual((body['count'], body['pages'], [lead['id'] for lead in body['results']]), (2, 2, [first.pk]))
        self.assertEqual(self.hub.get('/api/v1/leads?status=lost').json()['results'][0]['id'], old.pk)
        self.assertEqual(self.hub.get('/api/v1/leads?status=spam').json(),
                         {'error': 'validation', 'fields': {'status': ['invalid_choice']}})

    def test_marking_an_application(self):
        lead = self.make()
        self.sign_in()

        def patch(**data):
            return self.hub.patch(f'/api/v1/leads/{lead.pk}', data, format='json')

        body = patch(status='contacted').json()
        self.assertEqual(body['status'], 'contacted')
        contacted_at = body['contacted_at']
        self.assertIsNotNone(contacted_at)

        body = patch(status='won', note='Ertaga 10:00 da uchrashuv').json()
        self.assertEqual((body['status'], body['note'], body['contacted_at']),
                         ('won', 'Ertaga 10:00 da uchrashuv', contacted_at))  # the first call stays
        self.assertEqual(patch(note='').json()['note'], '')
        counts = self.hub.get('/api/v1/leads').json()['counts']
        self.assertEqual(counts, {'new': 0, 'contacted': 0, 'won': 1, 'lost': 0})

        self.assertEqual(patch(status='spam').json(), {'error': 'validation', 'fields': {'status': ['invalid_choice']}})
        self.assertEqual(patch(note='x' * 1001).json(), {'error': 'validation', 'fields': {'note': ['max_length']}})
        self.assertEqual(self.hub.patch('/api/v1/leads/999999', {'status': 'won'}, format='json').status_code, 404)
