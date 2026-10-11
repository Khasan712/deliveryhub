"""Branches (apps.core.branches, docs/api.md → Branches): our panel's toggle, the admin's branches, who sees which
orders, sending orders to the nearest branch, a pickup customer's choice."""
from django_tenants.utils import get_public_schema_name, schema_context

from apps.core import branches
from apps.core.models import Branch, Client, Order, OrderItem, Product, User
from apps.platform.models import Business
from api.shop.authentication import issue_token
from .helpers import make_catalog
from .test_admin_api import AdminTestCase

CHILONZOR = {'name': 'Chilonzor', 'address': 'Bunyodkor 1', 'lat': 41.2856, 'lng': 69.2044}
YUNUSOBOD = {'name': 'Yunusobod', 'address': 'Amir Temur 100', 'lat': 41.364, 'lng': 69.287}
NEAR_CHILONZOR = ('41.29', '69.21')


def turn_branches(business, on=True):
    Business.objects.filter(pk=business.pk).update(branches_enabled=on)


def add_branch(name, lat, lng, address='', **fields):
    return Branch.objects.create(name=name, address=address, latitude=lat, longitude=lng, **fields)


class DistanceTests(AdminTestCase):
    def test_straight_line_and_order_points(self):
        # Chilonzor → Yunusobod in Tashkent: about 11.5 km as the crow flies.
        self.assertAlmostEqual(branches.distance_km((41.2856, 69.2044), (41.364, 69.287)), 11.3, delta=0.3)
        order = Order(l_t='41.29', e_t='69.21')
        self.assertEqual(branches.order_point(order), (41.29, 69.21))
        self.assertEqual(branches.order_point(Order(location='41.3 69.2')), (41.3, 69.2))  # a shared pin
        self.assertIsNone(branches.order_point(Order(location='Chilonzor 9')))  # a typed address only
        self.assertIsNone(branches.order_point(Order(l_t='abc', e_t='69.2')))

    def test_an_order_page_puts_a_shared_pin_on_the_map(self):
        self.sign_in()
        order = Order.objects.create(status='ordered', source='bot', location='41.3 69.2')
        detail = self.client.get(f'/api/v1/orders/{order.pk}').json()
        self.assertEqual((detail['lat'], detail['lng'], detail['address']), ('41.3', '69.2', ''))


class PlatformToggleTests(AdminTestCase):
    def test_our_panel_turns_branches_on_and_counts_them(self):
        add_branch('Eski', 41.3, 69.2, is_active=False)
        panel = self.platform_client()
        with schema_context(get_public_schema_name()):  # our staff live in the public schema
            superuser = User.objects.create_superuser(phone_number='+998900000099', role='admin', password='x' * 10)
            panel.force_login(superuser)
        detail = panel.get('/api/v1/businesses/test-shop').json()
        self.assertEqual((detail['branches_enabled'], detail['branches']), (False, {'total': 1, 'active': 0}))
        response = panel.patch('/api/v1/businesses/test-shop', {'branches_enabled': True}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['branches_enabled'])
        self.assertTrue(Business.objects.get(pk=self.tenant.pk).branches_enabled)


class BranchApiTests(AdminTestCase):
    def test_off_until_our_panel_allows_it(self):
        self.sign_in()
        for call in (lambda: self.client.get('/api/v1/branches'),
                     lambda: self.client.post('/api/v1/branches', CHILONZOR, format='json')):
            response = call()
            self.assertEqual((response.status_code, response.json()), (403, {'error': 'branches_disabled'}))
        self.assertEqual(self.client.get('/api/v1/auth/me').json()['business']['branches_enabled'], False)

    def test_admin_opens_edits_stops_and_deletes_branches(self):
        turn_branches(self.tenant)
        self.sign_in()
        response = self.client.post('/api/v1/branches', {'name': 'Chilonzor', 'address': 'Bunyodkor 1'},
                                    format='json')
        self.assertEqual(response.json(), {'error': 'validation', 'fields': {'lat': ['required'],
                                                                             'lng': ['required']}})
        created = self.client.post('/api/v1/branches', {**CHILONZOR, 'phone': '90 111 22 33'}, format='json')
        self.assertEqual(created.status_code, 201)
        branch = created.json()
        self.assertEqual({key: branch[key] for key in ('name', 'address', 'lat', 'lng', 'phone', 'is_active',
                                                       'staff_count', 'today')},
                         {'name': 'Chilonzor', 'address': 'Bunyodkor 1', 'lat': 41.2856, 'lng': 69.2044,
                          'phone': '+998901112233', 'is_active': True, 'staff_count': 0,
                          'today': {'orders': 0, 'revenue': 0}})
        self.client.post('/api/v1/branches', YUNUSOBOD, format='json')
        self.assertEqual(self.client.get('/api/v1/auth/me').json()['business'],
                         {**self.client.get('/api/v1/auth/me').json()['business'], 'branches_enabled': True,
                          'dispatch': True})

        response = self.client.patch(f'/api/v1/branches/{branch["id"]}', {'lat': 41.3}, format='json')
        self.assertEqual(response.json(), {'error': 'validation', 'fields': {'lng': ['required']}})
        stopped = self.client.patch(f'/api/v1/branches/{branch["id"]}', {'is_active': False}, format='json').json()
        self.assertFalse(stopped['is_active'])
        self.assertEqual(self.client.get('/api/v1/auth/me').json()['business']['dispatch'], False)
        self.assertEqual([row['name'] for row in self.client.get('/api/v1/branches').json()],
                         ['Yunusobod', 'Chilonzor'])  # active first

        Order.objects.create(status='completed', source='admin', branch_id=branch['id'])
        response = self.client.delete(f'/api/v1/branches/{branch["id"]}')
        self.assertEqual((response.status_code, response.json()), (409, {'error': 'branch_in_use'}))
        Order.objects.all().delete()
        self.assertEqual(self.client.delete(f'/api/v1/branches/{branch["id"]}').status_code, 204)

    def test_managers_read_and_branch_staff_see_only_their_branch(self):
        turn_branches(self.tenant)
        chilonzor, yunusobod = add_branch(**{**CHILONZOR}), add_branch(**YUNUSOBOD)
        self.sign_in(self.manager)
        self.assertEqual(len(self.client.get('/api/v1/branches').json()), 2)
        self.assertEqual(self.client.post('/api/v1/branches', CHILONZOR, format='json').status_code, 403)
        self.assertEqual(self.client.patch(f'/api/v1/branches/{chilonzor.pk}', {'name': 'X'},
                                           format='json').status_code, 403)

        cook = User.objects.create_user(phone_number='+998900000005', role='branch', password='pass-12345',
                                        branch=yunusobod)
        self.sign_in(cook)
        self.assertEqual([row['name'] for row in self.client.get('/api/v1/branches').json()], ['Yunusobod'])
        self.assertEqual(self.client.get(f'/api/v1/branches/{chilonzor.pk}').status_code, 404)
        mine = self.client.get(f'/api/v1/branches/{yunusobod.pk}').json()
        self.assertEqual((mine['staff_count'], mine['staff']),
                         (1, [{'id': cook.pk, 'name': '+998900000005', 'phone_number': '+998900000005'}]))
        me = self.client.get('/api/v1/auth/me').json()['user']
        self.assertEqual((me['role'], me['branch']), ('branch', {'id': yunusobod.pk, 'name': 'Yunusobod'}))


class BranchStaffAccountTests(AdminTestCase):
    def test_a_branch_admin_needs_branches_on_and_an_active_branch(self):
        self.sign_in()
        body = {'phone_number': '+998900000007', 'first_name': 'Dilshod', 'last_name': '', 'role': 'branch',
                'is_active': True, 'password': 'pass-12345'}
        response = self.client.post('/api/v1/users', body, format='json')
        self.assertEqual(response.json(), {'error': 'validation', 'fields': {'role': ['branches_disabled']}})

        turn_branches(self.tenant)
        self.assertEqual(self.client.post('/api/v1/users', body, format='json').json()['fields'],
                         {'branch_id': ['required']})
        self.assertEqual(self.client.post('/api/v1/users', {**body, 'branch_id': 999}, format='json').json()['fields'],
                         {'branch_id': ['does_not_exist']})
        stopped = add_branch('Eski', 41.3, 69.2, is_active=False)
        self.assertEqual(self.client.post('/api/v1/users', {**body, 'branch_id': stopped.pk},
                                          format='json').json()['fields'], {'branch_id': ['inactive']})

        branch = add_branch(**CHILONZOR)
        created = self.client.post('/api/v1/users', {**body, 'branch_id': branch.pk}, format='json').json()
        self.assertEqual((created['role'], created['branch']), ('branch', {'id': branch.pk, 'name': 'Chilonzor'}))
        listed = {row['id']: row['branch'] for row in self.client.get('/api/v1/users').json()['results']}
        self.assertEqual(listed[created['id']], {'id': branch.pk, 'name': 'Chilonzor'})

        # Made a manager: the head office has no branch.
        changed = self.client.patch(f'/api/v1/users/{created["id"]}', {'role': 'manager', 'branch_id': branch.pk},
                                    format='json').json()
        self.assertEqual((changed['role'], changed['branch']), ('manager', None))

        # With branches off again the account still edits (e.g. is switched off).
        user = User.objects.get(pk=created['id'])
        user.role, user.branch = 'branch', branch
        user.save()
        turn_branches(self.tenant, on=False)
        response = self.client.patch(f'/api/v1/users/{user.pk}', {'is_active': False}, format='json')
        self.assertEqual(response.status_code, 200)


class DispatchTests(AdminTestCase):
    """Two branches: delivery orders wait for the head office, which sends each to a branch."""

    def setUp(self):
        super().setUp()
        turn_branches(self.tenant)
        _, _, self.burger, self.cola = make_catalog()
        self.chilonzor, self.yunusobod = add_branch(**CHILONZOR), add_branch(**YUNUSOBOD)
        self.cook = User.objects.create_user(phone_number='+998900000005', role='branch', password='pass-12345',
                                             first_name='Dilshod', branch=self.yunusobod)
        self.customer = Client.objects.create(first_name='Ali', phone='+998901234567')
        self.token = {'HTTP_AUTHORIZATION': f'Bearer {issue_token(self.customer)}'}

    def place(self, **fields):
        body = {'items': [{'product_id': self.burger.id, 'quantity': 2}], 'name': 'Ali', 'phone': '901234567',
                'delivery_type': 'delivery', 'address': 'Qatortol 5', 'lat': NEAR_CHILONZOR[0],
                'lng': NEAR_CHILONZOR[1], 'payment_method': 'cash', 'platform': 'web', **fields}
        return self.shop.post('/api/v1/orders', body, format='json', **self.token)

    def test_the_head_office_sends_an_order_to_the_nearest_branch(self):
        order_id = self.place().json()['order']['id']
        self.assertIsNone(Order.objects.get(pk=order_id).branch_id)

        self.sign_in(self.manager)
        row = self.client.get('/api/v1/orders').json()['results'][0]
        self.assertIsNone(row['branch'])
        self.assertEqual(row['suggested_branch'], {'id': self.chilonzor.pk, 'name': 'Chilonzor', 'distance_km': 0.7})
        self.assertEqual([row['id'] for row in self.client.get('/api/v1/orders?branch=none').json()['results']],
                         [order_id])
        options = self.client.get(f'/api/v1/orders/{order_id}').json()['branch_options']
        self.assertEqual([(option['name'], option['nearest']) for option in options],
                         [('Chilonzor', True), ('Yunusobod', False)])
        self.assertGreater(options[1]['distance_km'], 10)
        self.assertEqual(self.client.get('/api/v1/dashboard').json()['unassigned'], 1)

        # The branch staff do not see it yet.
        self.sign_in(self.cook)
        self.assertEqual(self.client.get('/api/v1/orders').json()['results'], [])
        self.assertEqual(self.client.get(f'/api/v1/orders/{order_id}').status_code, 404)
        response = self.client.put(f'/api/v1/orders/{order_id}/branch', {'branch_id': self.yunusobod.pk},
                                   format='json')
        self.assertEqual((response.status_code, response.json()), (403, {'error': 'forbidden'}))

        # The manager picks another branch than the nearest one.
        self.sign_in(self.manager)
        response = self.client.put(f'/api/v1/orders/{order_id}/branch', {'branch_id': 999}, format='json')
        self.assertEqual(response.json(), {'error': 'validation', 'fields': {'branch_id': ['does_not_exist']}})
        sent = self.client.put(f'/api/v1/orders/{order_id}/branch', {'branch_id': self.yunusobod.pk},
                               format='json').json()
        self.assertEqual(sent['branch'], {'id': self.yunusobod.pk, 'name': 'Yunusobod'})
        self.assertEqual(sent['assigned_by'], {'id': self.manager.pk, 'name': 'Malika'})
        self.assertIsNotNone(sent['assigned_at'])
        self.assertEqual(self.client.get('/api/v1/orders').json()['results'][0]['suggested_branch'], None)

        self.sign_in(self.cook)
        self.assertEqual([row['id'] for row in self.client.get('/api/v1/orders').json()['results']], [order_id])
        detail = self.client.get(f'/api/v1/orders/{order_id}').json()
        self.assertEqual(detail['branch_options'], [])  # branch staff do not send orders anywhere
        self.assertEqual(self.client.patch(f'/api/v1/orders/{order_id}', {'status': 'on_the_way'},
                                           format='json').json()['status'], 'on_the_way')

        # Moved to the other branch: gone from this one.
        self.sign_in(self.manager)
        self.client.put(f'/api/v1/orders/{order_id}/branch', {'branch_id': self.chilonzor.pk}, format='json')
        self.sign_in(self.cook)
        self.assertEqual(self.client.get(f'/api/v1/orders/{order_id}').status_code, 404)

    def test_a_pickup_customer_chooses_the_branch(self):
        shop = self.shop.get('/api/v1/shop').json()['business']['branches']
        self.assertEqual(shop, [{'id': self.chilonzor.pk, 'name': 'Chilonzor', 'address': 'Bunyodkor 1',
                                 'lat': 41.2856, 'lng': 69.2044},
                                {'id': self.yunusobod.pk, 'name': 'Yunusobod', 'address': 'Amir Temur 100',
                                 'lat': 41.364, 'lng': 69.287}])
        pickup = {'delivery_type': 'pickup', 'address': '', 'lat': None, 'lng': None}
        self.assertEqual(self.place(**pickup).json(), {'error': 'validation', 'fields': {'branch_id': ['required']}})
        self.assertEqual(self.place(**pickup, branch_id=999).json()['fields'], {'branch_id': ['invalid']})
        order = self.place(**pickup, branch_id=self.yunusobod.pk).json()['order']
        self.assertEqual(order['branch'], {'name': 'Yunusobod', 'address': 'Amir Temur 100', 'lat': 41.364,
                                           'lng': 69.287})
        saved = Order.objects.get(pk=order['id'])
        self.assertEqual((saved.branch_id, saved.assigned_by_id), (self.yunusobod.pk, None))
        self.assertIsNotNone(saved.assigned_at)

    def test_sales_are_for_a_branch(self):
        self.sign_in(self.cook)
        sale = {'items': [{'product_id': self.cola.id, 'quantity': 1}], 'delivery_type': 'pickup',
                'branch_id': self.chilonzor.pk}
        response = self.client.post('/api/v1/sales', sale, format='json')
        order = Order.objects.get(pk=response.json()['order']['id'])
        self.assertEqual((order.branch_id, order.assigned_by_id), (self.yunusobod.pk, None))  # always their own
        data = self.client.get('/api/v1/sales').json()
        self.assertEqual((data['branches'], data['stats']['count']), ([], 1))

        self.sign_in(self.manager)
        data = self.client.get('/api/v1/sales').json()
        self.assertEqual(data['branches'], [{'id': self.chilonzor.pk, 'name': 'Chilonzor'},
                                            {'id': self.yunusobod.pk, 'name': 'Yunusobod'}])
        response = self.client.post('/api/v1/sales', {**sale, 'branch_id': 999}, format='json')
        self.assertEqual(response.json(), {'error': 'validation', 'fields': {'branch_id': ['does_not_exist']}})
        order = Order.objects.get(pk=self.client.post('/api/v1/sales', sale, format='json').json()['order']['id'])
        self.assertEqual((order.branch_id, order.assigned_by_id), (self.chilonzor.pk, self.manager.pk))
        # Two branches: the head office says which one every sale is for.
        response = self.client.post('/api/v1/sales', {**sale, 'branch_id': None}, format='json')
        self.assertEqual(response.json(), {'error': 'validation', 'fields': {'branch_id': ['required']}})

        # The branch's numbers are its own; the head office sees each branch.
        self.sign_in(self.cook)
        self.assertEqual(self.client.get('/api/v1/sales').json()['stats']['count'], 1)
        dashboard = self.client.get('/api/v1/dashboard').json()
        self.assertEqual((dashboard['today']['orders'], dashboard['branches'], dashboard['unassigned']), (1, [], 0))
        self.sign_in(self.manager)
        dashboard = self.client.get('/api/v1/dashboard').json()
        self.assertEqual(dashboard['today']['orders'], 2)
        self.assertEqual(dashboard['branches'], [
            {'id': self.chilonzor.pk, 'name': 'Chilonzor', 'orders': 1, 'revenue': 12000},
            {'id': self.yunusobod.pk, 'name': 'Yunusobod', 'orders': 1, 'revenue': 12000}])

    def test_branch_staff_keep_out_of_the_menu_and_the_customers(self):
        self.sign_in(self.cook)
        self.assertEqual(self.client.get('/api/v1/products').status_code, 200)
        for response in (self.client.patch(f'/api/v1/products/{self.cola.id}', {'frozen': True}, format='json'),
                         self.client.post('/api/v1/categories', {'name_uz': 'A', 'name_ru': 'A'}, format='json'),
                         self.client.delete(f'/api/v1/products/{self.cola.id}'),
                         self.client.get('/api/v1/clients'),
                         self.client.get(f'/api/v1/clients/{self.customer.pk}')):
            self.assertEqual((response.status_code, response.json()), (403, {'error': 'forbidden'}))
        self.assertFalse(Product.objects.get(pk=self.cola.id).is_frozen)

    def test_with_branches_off_a_branch_admin_acts_like_a_manager(self):
        order = Order.objects.create(status='ordered', source='web', delivery_type='delivery')
        OrderItem.objects.create(order=order, product=self.cola, quantity='1', price='12000')
        turn_branches(self.tenant, on=False)
        self.sign_in(self.cook)
        self.assertEqual([row['id'] for row in self.client.get('/api/v1/orders').json()['results']], [order.id])
        self.assertEqual(self.client.get('/api/v1/clients').status_code, 200)
        self.assertEqual(self.shop.get('/api/v1/shop').json()['business']['branches'], [])
        new = self.place().json()['order']
        self.assertIsNone(Order.objects.get(pk=new['id']).branch_id)


class OneBranchTests(AdminTestCase):
    def test_every_new_order_goes_to_the_only_branch(self):
        turn_branches(self.tenant)
        _, _, burger, _ = make_catalog()
        branch = add_branch(**CHILONZOR)
        customer = Client.objects.create(first_name='Ali', phone='+998901234567')
        body = {'items': [{'product_id': burger.id, 'quantity': 1}], 'name': 'Ali', 'phone': '901234567',
                'delivery_type': 'pickup', 'payment_method': 'cash', 'platform': 'web'}
        response = self.shop.post('/api/v1/orders', body, format='json',
                                  HTTP_AUTHORIZATION=f'Bearer {issue_token(customer)}')
        self.assertEqual(response.json()['order']['branch']['name'], 'Chilonzor')
        self.assertEqual(Order.objects.get(pk=response.json()['order']['id']).branch_id, branch.pk)
        self.sign_in()
        self.assertEqual(self.client.get('/api/v1/auth/me').json()['business']['dispatch'], False)
        self.assertEqual(self.client.get('/api/v1/orders').json()['results'][0]['suggested_branch'], None)
        sale = self.client.post('/api/v1/sales', {'items': [{'product_id': burger.id, 'quantity': 1}]},
                                format='json').json()['order']
        self.assertEqual(Order.objects.get(pk=sale['id']).branch_id, branch.pk)
