from datetime import timedelta
from unittest import mock

from django.test import override_settings
from django.utils import timezone

from apps.core.models import Category, Client, Descriptions, Order, OrderItem, Product, User
from apps.platform.models import Business, BusinessBot
from apps.platform.testing import ADMIN_HOST, BusinessTestCase
from apps.telegram.models import Outbox, StaffInvite, StaffLink
from apps.voice import understanding as voice
from .helpers import make_catalog, png, signed_init_data

STAFF_BOT_TOKEN = '222:STAFF-BOT-TOKEN'


class AdminTestCase(BusinessTestCase):
    def setUp(self):
        super().setUp()
        self.admin = User.objects.create_user(phone_number='+998900000001', role='admin', password='pass-12345',
                                              first_name='Aziz')
        self.manager = User.objects.create_user(phone_number='+998900000002', role='manager', password='pass-12345',
                                                first_name='Malika')

    def sign_in(self, user=None):
        self.client.force_login(user or self.admin)


class AuthTests(AdminTestCase):
    def test_login_with_csrf(self):
        client = self.make_client(ADMIN_HOST, enforce_csrf_checks=True)
        csrf = client.get('/api/v1/auth/csrf')
        self.assertEqual(csrf.status_code, 204)
        token = csrf.cookies['csrftoken'].value

        response = client.post('/api/v1/auth/login', {'phone': '90 000 00 01', 'password': 'pass-12345'}, format='json')
        self.assertEqual((response.status_code, response.json()), (403, {'error': 'csrf_failed'}))

        response = client.post('/api/v1/auth/login', {'phone': '90 000 00 01', 'password': 'pass-12345'},
                               format='json', HTTP_X_CSRFTOKEN=token)
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual((body['user']['id'], body['user']['role']), (self.admin.id, 'admin'))
        self.assertEqual(body['business']['name'], 'Test Shop')
        self.assertEqual(client.get('/api/v1/auth/me').json()['user']['phone_number'], '+998900000001')

        # A signed-in session needs the (rotated) CSRF token for changes too.
        token = response.cookies['csrftoken'].value
        self.assertEqual(client.post('/api/v1/auth/logout').status_code, 403)
        self.assertEqual(client.post('/api/v1/auth/logout', HTTP_X_CSRFTOKEN=token).status_code, 204)
        self.assertEqual(client.get('/api/v1/auth/me').status_code, 401)

    def test_wrong_password_and_unknown_phone(self):
        for phone, password in (('+998900000001', 'wrong-pass'), ('+998909999999', 'pass-12345')):
            response = self.client.post('/api/v1/auth/login', {'phone': phone, 'password': password}, format='json')
            self.assertEqual((response.status_code, response.json()), (400, {'error': 'invalid_credentials'}))

    def test_inactive_and_deleted_users_are_shut_out(self):
        self.sign_in(self.manager)
        User.objects.filter(pk=self.manager.pk).update(is_deleted=True)
        self.assertEqual(self.client.get('/api/v1/auth/me').status_code, 401)
        response = self.client.post('/api/v1/auth/login', {'phone': '+998900000002', 'password': 'pass-12345'},
                                    format='json')
        self.assertEqual(response.json(), {'error': 'invalid_credentials'})
        User.objects.filter(pk=self.admin.pk).update(is_active=False)
        response = self.client.post('/api/v1/auth/login', {'phone': '+998900000001', 'password': 'pass-12345'},
                                    format='json')
        self.assertEqual(response.json(), {'error': 'invalid_credentials'})

    def test_login_attempts_are_limited(self):
        for _ in range(10):
            self.client.post('/api/v1/auth/login', {'phone': '+998900000001', 'password': 'nope'}, format='json')
        response = self.client.post('/api/v1/auth/login', {'phone': '+998900000001', 'password': 'pass-12345'},
                                    format='json')
        self.assertEqual((response.status_code, response.json()), (429, {'error': 'too_many_requests'}))

    def test_me_has_the_shop_address(self):
        self.sign_in()
        business = self.client.get('/api/v1/auth/me').json()['business']
        self.assertEqual(business, {'name': 'Test Shop', 'slug': 'test-shop', 'logo': None, 'brand_color': '',
                                    'shop_url': 'https://test-shop.example.uz/'})
        local = self.make_client('test-shop-admin.localhost:5174')
        Business.objects.get(pk=self.tenant.pk).domains.create(domain='test-shop-admin.localhost', kind='admin',
                                                               is_primary=False)
        local.force_login(self.admin)
        self.assertEqual(local.get('/api/v1/auth/me').json()['business']['shop_url'],
                         'http://test-shop.localhost:5174/')


class MiniAppLoginTests(AdminTestCase):
    def setUp(self):
        super().setUp()
        self.add_bot(BusinessBot.ROLE_ADMIN, token=STAFF_BOT_TOKEN, username='staff_bot', telegram_id=2002)

    def login(self, user):
        return self.client.post('/api/v1/auth/telegram', {'init_data': signed_init_data(user, STAFF_BOT_TOKEN)},
                                format='json')

    def test_linked_staff_member_is_signed_in(self):
        StaffLink.objects.create(telegram_id=555, user=self.manager)
        response = self.login({'id': 555, 'first_name': 'Malika'})
        self.assertEqual(response.json()['user']['id'], self.manager.id)
        self.assertEqual(self.client.get('/api/v1/dashboard').status_code, 200)

    def test_strangers_and_forged_data(self):
        self.assertEqual(self.login({'id': 556}).json(), {'error': 'not_linked'})
        response = self.client.post('/api/v1/auth/telegram', {'init_data': signed_init_data({'id': 555}, '1:OTHER')},
                                    format='json')
        self.assertEqual((response.status_code, response.json()), (403, {'error': 'invalid_init_data'}))
        StaffLink.objects.create(telegram_id=557, user=self.manager)
        User.objects.filter(pk=self.manager.pk).update(is_active=False)
        self.assertEqual(self.login({'id': 557}).json(), {'error': 'not_linked'})


class DashboardTests(AdminTestCase):
    def test_numbers(self):
        self.sign_in(self.manager)
        _, _, burger, _ = make_catalog()
        client = Client.objects.create(first_name='Ali')
        for status in ('ordered', 'ordered', 'on_the_way', 'completed', 'new'):
            order = Order.objects.create(status=status, source='web', client=client)
            OrderItem.objects.create(order=order, product=burger, quantity='2', price='35000')
        old = Order.objects.create(status='completed', source='bot')
        Order.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=30))

        data = self.client.get('/api/v1/dashboard').json()
        self.assertEqual(data['orders'], {'total': 5, 'new': 2, 'on_the_way': 1, 'completed': 2, 'last_7_days': 4})
        self.assertEqual(data['clients'], {'total': 1, 'new_7_days': 1})
        self.assertEqual((data['products'], data['categories']), ({'total': 2}, {'total': 1}))
        self.assertEqual({row['status']: row['count'] for row in data['by_status']},
                         {'ordered': 2, 'on_the_way': 1, 'completed': 2})
        self.assertEqual(len(data['daily']), 7)
        self.assertEqual(data['daily'][-1], {'date': timezone.localdate().isoformat(), 'count': 4})
        latest = data['latest_orders'][0]
        self.assertEqual((latest['total'], latest['items_count'], latest['customer_name']), (70000, 2, 'Ali'))
        self.assertEqual(latest['lines'], [{'name_uz': 'Chizburger', 'name_ru': 'Чизбургер', 'quantity': 2}])
        self.assertEqual(data['today'], {'orders': 4, 'revenue': 280000})

    def test_a_rejected_order_brings_no_money_today(self):
        self.sign_in(self.manager)
        _, _, burger, _ = make_catalog()
        for status in ('completed', 'rejected'):
            order = Order.objects.create(status=status, source='admin')
            OrderItem.objects.create(order=order, product=burger, quantity='1', price='35000')
        self.assertEqual(self.client.get('/api/v1/dashboard').json()['today'], {'orders': 2, 'revenue': 35000})


class OrderTests(AdminTestCase):
    def setUp(self):
        super().setUp()
        self.sign_in(self.manager)
        _, _, self.burger, self.cola = make_catalog()
        self.telegram_client = Client.objects.create(first_name='Olim', tg_id='777', phone='+998901112233')
        self.web = Order.objects.create(status='ordered', source='web', customer_name='Aziz Karimov',
                                        phone='+998901234567', delivery_type='delivery', location='Chilonzor 9')
        self.bot = Order.objects.create(status='completed', source='bot', client=self.telegram_client,
                                        delivery_type='pickup')
        OrderItem.objects.create(order=self.bot, product=self.burger, quantity='3', price='35000')
        Order.objects.create(status='new', source='bot')  # an unfinished cart is never listed

    def ids(self, query=''):
        return [order['id'] for order in self.client.get(f'/api/v1/orders{query}').json()['results']]

    def test_list_and_filters(self):
        self.assertEqual(self.ids(), [self.bot.id, self.web.id])
        self.assertEqual(self.ids('?status=ordered'), [self.web.id])
        self.assertEqual(self.ids('?source=bot'), [self.bot.id])
        self.assertEqual(self.ids('?search=karimov'), [self.web.id])
        self.assertEqual(self.ids('?search=1112233'), [self.bot.id])  # the client's phone
        self.assertEqual(self.ids(f'?search=%23{self.web.id}'), [self.web.id])
        row = self.client.get('/api/v1/orders?source=bot').json()['results'][0]
        self.assertEqual({key: row[key] for key in ('customer_name', 'phone', 'total', 'items_count', 'client_id')},
                         {'customer_name': 'Olim', 'phone': '+998901112233', 'total': 105000, 'items_count': 3,
                          'client_id': self.telegram_client.id})

    def test_a_list_row_tells_how_and_what(self):
        rows = {row['id']: row for row in self.client.get('/api/v1/orders').json()['results']}
        fields = ('delivery_type', 'payment_method', 'address', 'lines')
        self.assertEqual({key: rows[self.web.id][key] for key in fields},
                         {'delivery_type': 'delivery', 'payment_method': '', 'address': 'Chilonzor 9', 'lines': []})
        self.assertEqual({key: rows[self.bot.id][key] for key in fields},
                         {'delivery_type': 'pickup', 'payment_method': '', 'address': '',
                          'lines': [{'name_uz': 'Chizburger', 'name_ru': 'Чизбургер', 'quantity': 3}]})

    def test_detail(self):
        data = self.client.get(f'/api/v1/orders/{self.bot.id}').json()
        self.assertEqual(data['client'], {'id': self.telegram_client.id, 'first_name': 'Olim', 'last_name': '',
                                          'phone': '+998901112233', 'tg_nick': ''})
        self.assertEqual(data['items'], [{'product_id': self.burger.id, 'name_uz': 'Chizburger', 'name_ru': 'Чизбургер',
                                          'quantity': 3, 'price': 35000, 'total': 105000}])
        self.assertIsNone(data['created_by'])
        self.assertNotIn('lines', data)  # the detail has the full `items`
        self.assertEqual(self.client.get(f'/api/v1/orders/{self.web.id}').json()['address'], 'Chilonzor 9')

    def test_status_change_tells_a_telegram_customer(self):
        response = self.client.patch(f'/api/v1/orders/{self.bot.id}', {'status': 'rejected'}, format='json')
        self.assertEqual(response.json()['status'], 'rejected')
        self.assertEqual(list(Outbox.objects.values_list('kind', 'event')), [('order_status', 'rejected')])
        self.client.patch(f'/api/v1/orders/{self.bot.id}', {'status': 'rejected'}, format='json')  # no change
        self.client.patch(f'/api/v1/orders/{self.bot.id}', {'status': 'ordered'}, format='json')  # nothing to tell
        self.assertEqual(Outbox.objects.count(), 1)
        self.client.patch(f'/api/v1/orders/{self.web.id}', {'status': 'on_the_way'}, format='json')  # no Telegram
        self.assertEqual(Outbox.objects.count(), 1)

    def test_status_must_be_known(self):
        response = self.client.patch(f'/api/v1/orders/{self.web.id}', {'status': 'new'}, format='json')
        self.assertEqual(response.json(), {'error': 'validation', 'fields': {'status': ['invalid_choice']}})


class ClientTests(AdminTestCase):
    def test_list_detail_and_edit(self):
        self.sign_in(self.manager)
        ali = Client.objects.create(first_name='Ali', phone='+998901112233', tg_id='5', lang='ru')
        Client.objects.create(first_name='Vali')
        Order.objects.create(status='completed', source='bot', client=ali)
        Order.objects.create(status='new', source='bot', client=ali)

        rows = self.client.get('/api/v1/clients?search=1112233').json()['results']
        self.assertEqual([(row['id'], row['orders_count'], row['telegram'], row['lang']) for row in rows],
                         [(ali.id, 1, True, 'ru')])
        detail = self.client.get(f'/api/v1/clients/{ali.id}').json()
        self.assertEqual(len(detail['orders']), 1)

        response = self.client.patch(f'/api/v1/clients/{ali.id}', {'phone': '12'}, format='json')
        self.assertEqual(response.json(), {'error': 'validation', 'fields': {'phone': ['invalid']}})
        changes = {'last_name': 'Valiyev', 'location': 'Yunusobod', 'phone': '90 555 44 33'}
        response = self.client.patch(f'/api/v1/clients/{ali.id}', changes, format='json')
        self.assertEqual((response.json()['last_name'], response.json()['location'], response.json()['phone']),
                         ('Valiyev', 'Yunusobod', '+998905554433'))


class CatalogTests(AdminTestCase):
    def setUp(self):
        super().setUp()
        self.sign_in(self.manager)
        self.unit = Descriptions.objects.create(name_uz='dona', name_ru='шт')
        self.category = Category.objects.create(name_uz='Ichimliklar', name_ru='Напитки')

    def test_create_product_with_an_image(self):
        response = self.client.post('/api/v1/products', {
            'name_uz': 'Kola', 'name_ru': 'Кола', 'price': '12000', 'desc_uz': 'Muzdek', 'unit_id': self.unit.id,
            'category_id': self.category.id, 'image': png(),
        }, format='multipart')
        self.assertEqual(response.status_code, 201, response.content)
        data = response.json()
        self.assertEqual((data['price'], data['unit']['name_ru'], data['category']['id'], data['desc_ru']),
                         (12000, 'шт', self.category.id, ''))
        self.assertTrue(data['image'].startswith('/media/test_business/products/'))
        self.assertEqual(self.shop.get(data['image']).status_code, 200)

        removed = self.client.patch(f"/api/v1/products/{data['id']}", {'image': None}, format='json').json()
        self.assertIsNone(removed['image'])

    def test_product_validation(self):
        response = self.client.post('/api/v1/products', {'name_uz': 'X', 'price': -1, 'unit_id': 999}, format='json')
        self.assertEqual(response.json(), {'error': 'validation', 'fields': {
            'name_ru': ['required'], 'price': ['min_value'], 'unit_id': ['does_not_exist']}})

    def test_edit_filter_and_delete(self):
        product = Product.objects.create(name_uz='Kola', name_ru='Кола', price='12 000', desc_uz='', desc_ru='',
                                         measure=self.unit, img='')
        changes = {'price': 13000, 'category_id': self.category.id}
        response = self.client.patch(f'/api/v1/products/{product.id}', changes, format='json')
        self.assertEqual((response.json()['price'], response.json()['name_uz']), (13000, 'Kola'))
        self.assertEqual(Product.objects.get(pk=product.pk).price, '13000')
        self.assertEqual(self.client.get(f'/api/v1/products?category={self.category.id}').json()['count'], 1)
        self.assertEqual(self.client.get('/api/v1/products?search=кол').json()['count'], 1)
        self.assertEqual(self.client.delete(f'/api/v1/products/{product.id}').status_code, 204)
        self.assertFalse(Product.objects.exists())

    def test_categories(self):
        Product.objects.create(name_uz='Kola', name_ru='Кола', price='1', desc_uz='', desc_ru='',
                               category=self.category)
        self.assertEqual(self.client.get('/api/v1/categories').json(),
                         [{'id': self.category.id, 'name_uz': 'Ichimliklar', 'name_ru': 'Напитки',
                           'products_count': 1}])
        created = self.client.post('/api/v1/categories', {'name_uz': 'Burgerlar', 'name_ru': 'Бургеры'}, format='json')
        self.assertEqual((created.status_code, created.json()['products_count']), (201, 0))
        renamed = self.client.patch(f"/api/v1/categories/{created.json()['id']}", {'name_ru': 'Бургеры!'},
                                    format='json')
        self.assertEqual(renamed.json()['name_ru'], 'Бургеры!')
        self.assertEqual(self.client.delete(f'/api/v1/categories/{self.category.id}').status_code, 204)
        self.assertIsNone(Product.objects.get().category)  # products stay

    def test_units(self):
        response = self.client.post('/api/v1/units', {'name_uz': 'kg', 'name_ru': 'кг'}, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual([unit['name_uz'] for unit in self.client.get('/api/v1/units').json()], ['dona', 'kg'])


class UserTests(AdminTestCase):
    def test_managers_get_403(self):
        self.sign_in(self.manager)
        response = self.client.get('/api/v1/users')
        self.assertEqual((response.status_code, response.json()), (403, {'error': 'forbidden'}))

    def test_admin_manages_staff(self):
        self.sign_in()
        self.assertEqual(self.client.get('/api/v1/users').json()['count'], 2)
        response = self.client.post('/api/v1/users', {'phone_number': '90 777 66 55', 'first_name': 'Kamol',
                                                      'role': 'manager'}, format='json')
        self.assertEqual(response.json(), {'error': 'validation', 'fields': {'password': ['required']}})
        response = self.client.post('/api/v1/users', {'phone_number': '+998900000002', 'role': 'manager',
                                                      'password': 'short'}, format='json')
        self.assertEqual(response.json()['fields'], {'phone_number': ['unique'], 'password': ['min_length']})

        response = self.client.post('/api/v1/users', {'phone_number': '90 777 66 55', 'first_name': 'Kamol',
                                                      'role': 'manager', 'password': 'kamol-pass-1'}, format='json')
        self.assertEqual(response.status_code, 201)
        user = response.json()
        self.assertNotIn('password', user)
        self.assertEqual((user['phone_number'], user['last_name'], user['is_active']), ('+998907776655', '', True))
        self.assertTrue(User.objects.get(pk=user['id']).check_password('kamol-pass-1'))

        response = self.client.patch(f"/api/v1/users/{user['id']}", {'is_active': False, 'password': 'new-pass-12'},
                                     format='json')
        self.assertFalse(response.json()['is_active'])
        self.assertTrue(User.objects.get(pk=user['id']).check_password('new-pass-12'))
        self.assertEqual(self.client.delete(f"/api/v1/users/{user['id']}").status_code, 204)

    def test_admin_cannot_lock_themselves_out(self):
        self.sign_in()
        self.assertEqual(self.client.delete(f'/api/v1/users/{self.admin.id}').json(), {'error': 'cannot_delete_self'})
        response = self.client.patch(f'/api/v1/users/{self.admin.id}', {'role': 'manager'}, format='json')
        self.assertEqual(response.json(), {'error': 'cannot_change_self'})
        response = self.client.patch(f'/api/v1/users/{self.admin.id}', {'first_name': 'Aziz aka'}, format='json')
        self.assertEqual(response.json()['first_name'], 'Aziz aka')


@override_settings(GEMINI_API_KEY='')
class SalesTests(AdminTestCase):
    def setUp(self):
        super().setUp()
        self.sign_in(self.manager)
        _, _, self.burger, self.cola = make_catalog()

    def test_point_of_sale_data(self):
        data = self.client.get('/api/v1/sales').json()
        self.assertEqual([product['id'] for product in data['products']], [self.burger.id, self.cola.id])
        self.assertEqual(data['stats'], {'count': 0, 'revenue': 0, 'average': 0, 'all_orders_today': 0})
        self.assertEqual(data['voice'], {'gemini': False, 'live': False})

    def test_sale_without_a_customer(self):
        response = self.client.post('/api/v1/sales', {
            'items': [{'product_id': self.burger.id, 'quantity': 2}, {'product_id': self.cola.id, 'quantity': 1}],
            'customer_name': 'Mehmon', 'phone': '90 123 45 67', 'payment_method': 'card',
        }, format='json')
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual((body['order']['total'], body['order']['status'], body['order']['items_count']),
                         (82000, 'completed', 3))
        self.assertEqual(body['stats'], {'count': 1, 'revenue': 82000, 'average': 82000, 'all_orders_today': 1})
        order = Order.objects.get()
        self.assertEqual((order.source, order.client, order.created_by, order.phone, order.delivery_type),
                         ('admin', None, self.manager, '+998901234567', 'pickup'))
        self.assertEqual(self.client.get('/api/v1/sales').json()['recent'][0]['id'], order.id)

    def test_delivery_sale_defaults_to_ordered(self):
        sale = {'items': [{'product_id': self.cola.id, 'quantity': 1}], 'delivery_type': 'delivery',
                'address': 'Chilonzor'}
        response = self.client.post('/api/v1/sales', sale, format='json')
        self.assertEqual(response.json()['order']['status'], 'ordered')

    def test_bad_items(self):
        self.assertEqual(self.client.post('/api/v1/sales', {'items': []}, format='json').json()['error'], 'empty')
        response = self.client.post('/api/v1/sales', {'items': [{'product_id': 999, 'quantity': 1}]}, format='json')
        self.assertEqual(response.json(), {'error': 'product_not_found', 'detail': [999]})

    def test_voice_parse_uses_the_local_parser_without_gemini(self):
        response = self.client.post('/api/v1/voice/parse', {'text': '2 ta chizburger, mijoz Aziz', 'state': {}},
                                    format='json')
        body = response.json()
        self.assertEqual(body['engine'], 'local')
        self.assertEqual(body['result']['items'], [{'product_id': self.burger.id, 'quantity': 2}])
        self.assertEqual(body['result']['customer_name'], 'Aziz')

    def test_voice_needs_gemini_for_audio_and_live(self):
        response = self.client.post('/api/v1/voice/parse', {'audio': png('clip.webm'), 'state': '{}'},
                                    format='multipart')
        self.assertEqual((response.status_code, response.json()), (400, {'error': 'not_configured'}))
        self.assertEqual(self.client.post('/api/v1/voice/token').json(), {'error': 'not_configured'})
        self.assertEqual(self.client.post('/api/v1/voice/parse', {'text': ' '}, format='json').json(),
                         {'error': 'empty'})

    @override_settings(GEMINI_API_KEY='test-key')
    def test_voice_with_gemini(self):
        session = {'token': 'auth_tokens/abc', 'url': 'wss://example', 'setup': {'setup': {}}}
        with mock.patch.object(voice, 'create_live_session', return_value=session):
            self.assertEqual(self.client.post('/api/v1/voice/token').json(), session)
        with mock.patch.object(voice, 'transcribe', return_value='bitta chizburger') as transcribe, \
                mock.patch.object(voice, 'understand_with_gemini', return_value={
                    'items': [{'product_id': self.burger.id, 'quantity': 1}]}) as understand:
            body = self.client.post('/api/v1/voice/parse', {'audio': png('clip.webm'), 'state': '{}', 'lang': 'ru',
                                                            'live_text': 'bitta'}, format='multipart').json()
        transcribe.assert_called_once()
        self.assertEqual((understand.call_args.kwargs['text'], understand.call_args.kwargs['lang']),
                         ('bitta chizburger', 'ru'))
        self.assertEqual((body['engine'], body['result']['transcript']), ('gemini', 'bitta chizburger'))
        with mock.patch.object(voice, 'understand_with_gemini', side_effect=voice.VoiceError('ai_failed')):
            response = self.client.post('/api/v1/voice/parse', {'text': 'x'}, format='json')
        self.assertEqual((response.status_code, response.json()), (502, {'error': 'ai_failed'}))


class TelegramTests(AdminTestCase):
    def test_without_a_staff_bot(self):
        self.sign_in()
        data = self.client.get('/api/v1/telegram').json()
        self.assertEqual((data['bot'], data['my_links'], data['team_links']), (None, [], []))
        self.assertEqual(self.client.post('/api/v1/telegram/invites', {}, format='json').json(),
                         {'error': 'bot_missing'})

    def test_links_and_invites(self):
        bot = self.add_bot(BusinessBot.ROLE_ADMIN, token=STAFF_BOT_TOKEN, username='staff_bot', telegram_id=2002)
        BusinessBot.objects.filter(pk=bot.pk).update(last_seen_at=timezone.now())
        mine = StaffLink.objects.create(telegram_id=1, user=self.manager, first_name='Malika')
        theirs = StaffLink.objects.create(telegram_id=2, user=self.admin, username='aziz')

        self.sign_in(self.manager)
        data = self.client.get('/api/v1/telegram').json()
        self.assertEqual(data['bot'], {'username': 'staff_bot', 'alive': True})
        self.assertEqual(([link['id'] for link in data['my_links']], data['team_links'], data['users']),
                         ([mine.id], [], []))
        invite = self.client.post('/api/v1/telegram/invites', {}, format='json')
        self.assertEqual(invite.status_code, 201)
        self.assertTrue(invite.json()['url'].startswith('https://t.me/staff_bot?start=inv_'))
        self.assertIn('<svg', invite.json()['qr_svg'])
        self.assertEqual(StaffInvite.objects.get().user, self.manager)
        response = self.client.post('/api/v1/telegram/invites', {'user_id': self.admin.id}, format='json')
        self.assertEqual(response.json(), {'error': 'forbidden'})
        self.assertEqual(self.client.delete(f'/api/v1/telegram/links/{theirs.id}').status_code, 403)
        response = self.client.patch(f'/api/v1/telegram/links/{mine.id}', {'notify_orders': False}, format='json')
        self.assertFalse(response.json()['notify_orders'])

        self.sign_in(self.admin)
        data = self.client.get('/api/v1/telegram').json()
        self.assertEqual(len(data['team_links']), 2)
        self.assertEqual({user['name'] for user in data['users']}, {'Aziz', 'Malika'})
        invite = self.client.post('/api/v1/telegram/invites', {'user_id': self.manager.id}, format='json').json()
        self.assertEqual(invite['user'], 'Malika')
        self.assertEqual(self.client.delete(f'/api/v1/telegram/links/{mine.id}').status_code, 204)
