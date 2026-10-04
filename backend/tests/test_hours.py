"""Working hours and frozen products (apps/platform/hours.py, docs/api.md)."""
from datetime import datetime
from unittest import mock
from zoneinfo import ZoneInfo

from django.test import SimpleTestCase

from apps.core.models import Client, Order, Product, User
from apps.platform import hours
from apps.platform.models import Business
from apps.platform.testing import BusinessTestCase
from api.shop.authentication import issue_token
from .helpers import make_catalog
from .test_platform_api import PlatformTestCase

TASHKENT = ZoneInfo('Asia/Tashkent')
DAILY = [{'open': '09:00', 'close': '22:00'}] * 7
# Monday to Saturday, Friday and Saturday until 02:00 the next night, Sunday off.
WEEK = [{'open': '09:00', 'close': '22:00'}] * 4 + [{'open': '18:00', 'close': '02:00'}] * 2 + [None]


def at(day, hour, minute=0):
    """A moment of the week of 5 October 2026 (Monday 5 … Sunday 11) in Tashkent."""
    return datetime(2026, 10, day, hour, minute, tzinfo=TASHKENT)


class ValidateTests(SimpleTestCase):
    def test_a_week_of_shifts_and_days_off(self):
        self.assertEqual(hours.validate(WEEK), WEEK)
        self.assertIsNone(hours.validate(None))
        whole_days = [{'open': '00:00', 'close': '24:00'}] * 7
        self.assertEqual(hours.validate(whole_days), whole_days)

    def test_everything_else_is_refused(self):
        bad = [
            DAILY[:6],                                          # six days
            'every day',
            [{'open': '9:00', 'close': '22:00'}] * 7,           # HH:MM
            [{'open': '09:00', 'close': '25:00'}] * 7,
            [{'open': '24:00', 'close': '02:00'}] * 7,          # 24:00 only closes
            [{'open': '09:00', 'close': '09:00'}] * 7,          # an empty shift
            [{'open': '09:00'}] * 7,
            [{'open': '09:00', 'close': '22:00', 'note': 'x'}] * 7,
            [['09:00', '22:00']] * 7,
        ]
        for week in bad:
            with self.subTest(week=week), self.assertRaises(ValueError):
                hours.validate(week)


class StatusTests(SimpleTestCase):
    def status(self, week, moment):
        return hours.status(week, moment)

    def test_no_hours_means_always_open(self):
        self.assertEqual(self.status(None, at(5, 3)), {'open': True, 'opens_at': None, 'closes_at': None})

    def test_open_and_closed_within_a_day(self):
        self.assertEqual(self.status(DAILY, at(5, 10)),
                         {'open': True, 'opens_at': None, 'closes_at': '2026-10-05T22:00:00+05:00'})
        self.assertEqual(self.status(DAILY, at(5, 8, 59)),
                         {'open': False, 'opens_at': '2026-10-05T09:00:00+05:00', 'closes_at': None})
        self.assertEqual(self.status(DAILY, at(5, 22)),  # the close is not part of the shift
                         {'open': False, 'opens_at': '2026-10-06T09:00:00+05:00', 'closes_at': None})

    def test_a_shift_past_midnight_belongs_to_the_day_it_starts(self):
        # Saturday 01:00 is still Friday's shift (18:00–02:00).
        self.assertEqual(self.status(WEEK, at(10, 1)),
                         {'open': True, 'opens_at': None, 'closes_at': '2026-10-10T02:00:00+05:00'})
        # Monday 01:00: Sunday is off, so Saturday's night has ended at 02:00 on Sunday.
        self.assertEqual(self.status(WEEK, at(12, 1))['open'], False)
        self.assertEqual(self.status(WEEK, at(11, 1)),
                         {'open': True, 'opens_at': None, 'closes_at': '2026-10-11T02:00:00+05:00'})

    def test_a_day_off_waits_for_the_next_shift(self):
        self.assertEqual(self.status(WEEK, at(11, 12)),
                         {'open': False, 'opens_at': '2026-10-12T09:00:00+05:00', 'closes_at': None})

    def test_back_to_back_shifts_close_once(self):
        week = [{'open': '18:00', 'close': '24:00'}, {'open': '00:00', 'close': '02:00'}] + [None] * 5
        self.assertEqual(self.status(week, at(5, 23))['closes_at'], '2026-10-06T02:00:00+05:00')

    def test_around_the_clock_and_never(self):
        self.assertEqual(self.status([{'open': '00:00', 'close': '24:00'}] * 7, at(7, 4)),
                         {'open': True, 'opens_at': None, 'closes_at': None})
        self.assertEqual(self.status([None] * 7, at(7, 4)), {'open': False, 'opens_at': None, 'closes_at': None})

    def test_a_shift_once_a_week(self):
        week = [{'open': '09:00', 'close': '12:00'}] + [None] * 6
        self.assertEqual(self.status(week, at(5, 13))['opens_at'], '2026-10-12T09:00:00+05:00')

    def test_now_in_another_time_zone_counts_in_tashkent(self):
        utc = datetime(2026, 10, 5, 4, 30, tzinfo=ZoneInfo('UTC'))  # 09:30 in Tashkent
        self.assertTrue(hours.is_open(DAILY, utc))


class ShopHoursTests(BusinessTestCase):
    def setUp(self):
        super().setUp()
        self.unit, self.category, self.burger, self.cola = make_catalog()
        self.token = issue_token(Client.objects.create(first_name='Ali', phone='+998901234567'))

    def order(self, *products):
        body = {'items': [{'product_id': product.id, 'quantity': 1} for product in products], 'name': 'Ali',
                'phone': '901234567', 'delivery_type': 'pickup'}
        return self.shop.post('/api/v1/orders', body, format='json', HTTP_AUTHORIZATION=f'Bearer {self.token}')

    def test_the_shop_shows_the_hours_and_frozen_products(self):
        Business.objects.filter(pk=self.tenant.pk).update(working_hours=DAILY)
        Product.objects.filter(pk=self.cola.pk).update(is_frozen=True)
        with mock.patch('apps.platform.hours.timezone.now', return_value=at(5, 23)):
            data = self.shop.get('/api/v1/shop').json()
        self.assertEqual(data['business']['working_hours'], {
            'week': DAILY, 'timezone': 'Asia/Tashkent', 'open': False,
            'opens_at': '2026-10-06T09:00:00+05:00', 'closes_at': None})
        self.assertEqual({product['id']: product['frozen'] for product in data['products']},
                         {self.burger.id: False, self.cola.id: True})

    def test_no_orders_while_closed(self):
        Business.objects.filter(pk=self.tenant.pk).update(working_hours=DAILY)
        with mock.patch('apps.platform.hours.timezone.now', return_value=at(5, 23)):
            response = self.order(self.burger)
        self.assertEqual(response.json(), {'error': 'business_closed', 'opens_at': '2026-10-06T09:00:00+05:00'})
        with mock.patch('apps.platform.hours.timezone.now', return_value=at(6, 9, 30)):
            self.assertEqual(self.order(self.burger).status_code, 201)

    def test_frozen_products_cannot_be_ordered(self):
        Product.objects.filter(pk=self.cola.pk).update(is_frozen=True)
        response = self.order(self.burger, self.cola)
        self.assertEqual(response.json(), {'error': 'product_unavailable', 'detail': [self.cola.id]})
        self.assertEqual(Order.objects.count(), 0)


class AdminHoursTests(BusinessTestCase):
    def setUp(self):
        super().setUp()
        self.admin = User.objects.create_user(phone_number='+998900000001', role='admin', password='pass-12345')
        self.manager = User.objects.create_user(phone_number='+998900000002', role='manager', password='pass-12345')
        _, _, self.burger, self.cola = make_catalog()

    def test_every_staff_member_sees_the_hours_only_the_admin_sets_them(self):
        self.client.force_login(self.manager)
        body = self.client.get('/api/v1/business').json()
        self.assertEqual((body['week'], body['open'], body['timezone']), (None, True, 'Asia/Tashkent'))
        self.assertEqual(self.client.patch('/api/v1/business', {'week': WEEK}, format='json').status_code, 403)

        self.client.force_login(self.admin)
        body = self.client.patch('/api/v1/business', {'week': WEEK}, format='json').json()
        self.assertEqual(body['week'], WEEK)
        self.tenant.refresh_from_db()
        self.assertEqual(self.tenant.working_hours, WEEK)
        response = self.client.patch('/api/v1/business', {'week': WEEK[:6]}, format='json')
        self.assertEqual(response.json(), {'error': 'validation', 'fields': {'week': ['invalid']}})
        # null: open at any time again.
        self.assertIsNone(self.client.patch('/api/v1/business', {'week': None}, format='json').json()['week'])

    def test_any_staff_member_freezes_a_product(self):
        self.client.force_login(self.manager)
        body = self.client.patch(f'/api/v1/products/{self.cola.id}', {'frozen': True}, format='json').json()
        self.assertTrue(body['frozen'])
        self.assertIsNotNone(body['frozen_at'])
        frozen = self.client.get('/api/v1/products?frozen=true').json()['results']
        self.assertEqual([product['id'] for product in frozen], [self.cola.id])
        on_sale = self.client.get('/api/v1/products?frozen=false').json()['results']
        self.assertEqual([product['id'] for product in on_sale], [self.burger.id])

        body = self.client.patch(f'/api/v1/products/{self.cola.id}', {'frozen': False}, format='json').json()
        self.assertEqual((body['frozen'], body['frozen_at']), (False, None))

    def test_staff_still_sell_a_frozen_product(self):
        Product.objects.filter(pk=self.cola.pk).update(is_frozen=True)
        self.client.force_login(self.manager)
        products = self.client.get('/api/v1/sales').json()['products']
        self.assertEqual({product['id']: product['frozen'] for product in products},
                         {self.burger.id: False, self.cola.id: True})
        response = self.client.post('/api/v1/sales', {'items': [{'product_id': self.cola.id, 'quantity': 1}]},
                                    format='json')
        self.assertEqual(response.status_code, 201)


class PlatformHoursTests(PlatformTestCase):
    def test_our_panel_sees_the_hours(self):
        Business.objects.filter(pk=self.tenant.pk).update(working_hours=DAILY)
        self.sign_in()
        with mock.patch('apps.platform.hours.timezone.now', return_value=at(5, 10)):
            body = self.hub.get('/api/v1/businesses/test-shop').json()
        self.assertEqual(body['status'], 'active')
        self.assertEqual(body['working_hours'], {'week': DAILY, 'timezone': 'Asia/Tashkent', 'open': True,
                                                 'opens_at': None, 'closes_at': '2026-10-05T22:00:00+05:00'})
        # Read-only here: the business sets its hours in its own admin panel.
        self.hub.patch('/api/v1/businesses/test-shop', {'working_hours': {'week': None}}, format='json')
        self.tenant.refresh_from_db()
        self.assertEqual(self.tenant.working_hours, DAILY)
