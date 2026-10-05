import base64
import time
from datetime import timedelta

from django.core import signing
from django.core.cache import cache
from django.test import SimpleTestCase, override_settings
from django.utils import timezone

from api.common.telegram import validate_init_data
from api.shop.authentication import TOKEN_SALT, issue_token
from apps.core.models import Client, Order, OrderItem, PhoneOTP, Product, TelegramLoginToken
from apps.platform.models import Business, BusinessBot
from apps.platform.testing import BusinessTestCase
from apps.telegram.models import Outbox
from .helpers import BOT_TOKEN, make_catalog, signed_init_data


class InitDataTests(SimpleTestCase):
    user = {'id': 42, 'first_name': 'Ali', 'username': 'ali'}

    def test_valid(self):
        self.assertEqual(validate_init_data(signed_init_data(self.user), BOT_TOKEN)['user']['id'], 42)

    def test_signature_field_either_way(self):
        for sign_signature in (True, False):
            data = signed_init_data(self.user, extra={'signature': 'abc'}, sign_signature=sign_signature)
            self.assertIsNotNone(validate_init_data(data, BOT_TOKEN))

    def test_rejects_tampering_wrong_token_and_stale(self):
        data = signed_init_data(self.user)
        self.assertIsNone(validate_init_data(data.replace('Ali', 'Eve'), BOT_TOKEN))
        self.assertIsNone(validate_init_data(data, '999:OTHER'))
        stale = signed_init_data(self.user, auth_date=int(time.time()) - 3 * 86400)
        self.assertIsNone(validate_init_data(stale, BOT_TOKEN))
        self.assertIsNone(validate_init_data('', BOT_TOKEN))
        self.assertIsNone(validate_init_data(data, ''))


@override_settings(SHOP_OTP_DEBUG=True, SMS_BACKEND='console')
class ShopApiTests(BusinessTestCase):
    def setUp(self):
        super().setUp()
        self.add_bot(BusinessBot.ROLE_CLIENT, token=BOT_TOKEN, username='test_bot')
        self.unit, self.category, self.burger, self.cola = make_catalog()

    def post(self, path, data, token=None):
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'} if token else {}
        return self.shop.post(f'/api/v1/{path}', data, format='json', **headers)

    def get(self, path, token=None):
        headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'} if token else {}
        return self.shop.get(f'/api/v1/{path}', **headers)

    def login_by_phone(self, phone='+998901234567'):
        code = self.post('auth/phone/request', {'phone': phone}).json()['debug_code']
        return self.post('auth/phone/verify', {'phone': phone, 'code': code}).json()

    def order(self, token, **fields):
        body = {'items': [{'product_id': self.cola.id, 'quantity': 1}], 'name': 'Ali', 'phone': '901234567',
                'delivery_type': 'pickup', **fields}
        return self.post('orders', body, token)

    # -- catalog ----------------------------------------------------------------
    def test_catalog(self):
        Business.objects.filter(pk=self.tenant.pk).update(tagline='Tez va mazali', brand_color='#ff6b00')
        data = self.get('shop').json()
        self.assertEqual(data['business']['name'], 'Test Shop')
        self.assertEqual((data['business']['tagline'], data['business']['brand_color']), ('Tez va mazali', '#ff6b00'))
        self.assertEqual(data['bot_username'], 'test_bot')
        self.assertEqual({p['id']: p['price'] for p in data['products']}, {self.burger.id: 35000, self.cola.id: 12000})
        self.assertEqual([c['name_uz'] for c in data['categories']], ['Burgerlar'])  # only categories with products
        burger = next(p for p in data['products'] if p['id'] == self.burger.id)
        self.assertEqual((burger['unit_uz'], burger['unit_ru'], burger['category_id']),
                         ('dona', 'шт', self.category.id))
        self.assertIsNone(burger['image'])  # the file does not exist
        self.assertEqual((data['popular'], data['client']), ([], None))

    def test_popular_products_come_from_orders(self):
        for _ in range(2):
            order = Order.objects.create(status='completed', source='web')
            OrderItem.objects.create(order=order, product=self.cola, quantity='1', price='12000')
        cart = Order.objects.create(status='new', source='bot')  # unfinished carts do not count
        for _ in range(3):
            OrderItem.objects.create(order=cart, product=self.burger, quantity='1', price='35000')
        self.assertEqual(self.get('shop').json()['popular'], [self.cola.id])

    def test_old_product_images_from_the_database(self):
        Product.objects.filter(pk=self.cola.pk).update(img='', img_64=base64.b64encode(b'\x89PNG\r\n\x1a\nxx').decode())
        cola = next(p for p in self.get('shop').json()['products'] if p['id'] == self.cola.id)
        self.assertEqual(cola['image'], f'/api/v1/products/{self.cola.id}/image')
        response = self.shop.get(cola['image'])
        self.assertEqual((response.status_code, response['Content-Type']), (200, 'image/png'))
        self.assertEqual(self.shop.get(f'/api/v1/products/{self.burger.id}/image').status_code, 404)

    def test_catalog_shows_the_signed_in_client(self):
        token = self.login_by_phone()['token']
        self.assertEqual(self.get('shop', token).json()['client']['phone'], '+998901234567')
        self.assertIsNone(self.get('shop', 'garbage').json()['client'])  # a bad token is just an anonymous visitor

    # -- phone sign-in ----------------------------------------------------------
    def test_phone_login_creates_then_reuses_client(self):
        first = self.login_by_phone()
        self.assertTrue(first['created'])
        PhoneOTP.objects.update(created_at=timezone.now() - timedelta(minutes=2))  # skip the resend cooldown
        second = self.login_by_phone()
        self.assertFalse(second['created'])
        self.assertEqual(first['client']['id'], second['client']['id'])
        self.assertEqual(self.get('me', second['token']).json()['client']['phone'], '+998901234567')

    def test_request_response(self):
        body = self.post('auth/phone/request', {'phone': '90 123 45 67'}).json()
        self.assertEqual({key: body[key] for key in ('ok', 'phone', 'resend_in', 'ttl')},
                         {'ok': True, 'phone': '+998901234567', 'resend_in': 60, 'ttl': 300})
        self.assertRegex(body['debug_code'], r'^\d{6}$')

    def test_wrong_code_counts_attempts_and_locks(self):
        self.post('auth/phone/request', {'phone': '901234567'})
        response = self.post('auth/phone/verify', {'phone': '901234567', 'code': '000000'})
        self.assertEqual((response.status_code, response.json()), (400, {'error': 'invalid_code', 'attempts_left': 4}))
        PhoneOTP.objects.update(attempts=5)
        response = self.post('auth/phone/verify', {'phone': '901234567', 'code': '000000'})
        self.assertEqual((response.status_code, response.json()['error']), (429, 'too_many_attempts'))

    def test_expired_code(self):
        self.post('auth/phone/request', {'phone': '901234567'})
        PhoneOTP.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        response = self.post('auth/phone/verify', {'phone': '901234567', 'code': '123456'})
        self.assertEqual(response.json(), {'error': 'code_expired'})

    def test_resend_cooldown_and_invalid_phone(self):
        self.assertEqual(self.post('auth/phone/request', {'phone': '12'}).json(), {'error': 'invalid_phone'})
        self.assertEqual(self.post('auth/phone/request', {'phone': '+7 916 123 45 67'}).json()['error'],
                         'invalid_phone')  # Uzbek numbers only
        self.post('auth/phone/request', {'phone': '901234567'})
        response = self.post('auth/phone/request', {'phone': '901234567'})
        self.assertEqual((response.status_code, response.json()['error']), (429, 'too_soon'))
        self.assertTrue(0 < response.json()['retry_after'] <= 60)

    def test_hourly_limit(self):
        for minutes in range(5):
            PhoneOTP.objects.create(phone='+998901234567', code_hash='x',
                                    expires_at=timezone.now() + timedelta(minutes=5))
            PhoneOTP.objects.filter(code_hash='x').update(created_at=timezone.now() - timedelta(minutes=2 + minutes))
            PhoneOTP.objects.filter(code_hash='x').update(code_hash='y')
        response = self.post('auth/phone/request', {'phone': '901234567'})
        self.assertEqual((response.status_code, response.json()), (429, {'error': 'too_many_requests'}))

    @override_settings(SHOP_OTP_DEBUG=False)
    def test_code_is_not_exposed_without_debug_flag(self):
        self.assertNotIn('debug_code', self.post('auth/phone/request', {'phone': '901234567'}).json())

    def test_unverified_phone_does_not_open_someone_elses_account(self):
        victim = Client.objects.create(first_name='Victim', phone='+998901234567')  # typed at checkout, never verified
        data = self.login_by_phone()
        self.assertTrue(data['created'])
        self.assertNotEqual(data['client']['id'], victim.id)

    def test_telegram_shared_phone_is_trusted(self):
        telegram_client = Client.objects.create(first_name='Tg', tg_id='77', tg_phone='998901234567')
        self.assertEqual(self.login_by_phone()['client']['id'], telegram_client.id)

    # -- Telegram sign-in -------------------------------------------------------
    def test_telegram_webapp_login(self):
        user = {'id': 777, 'first_name': 'Olim', 'username': 'olim', 'language_code': 'ru'}
        data = self.post('auth/telegram/webapp', {'init_data': signed_init_data(user)}).json()
        client = Client.objects.get(tg_id='777')
        self.assertEqual((data['client']['id'], client.first_name, client.lang, data['created']),
                         (client.id, 'Olim', 'ru', True))
        self.assertTrue(data['client']['telegram'])
        self.assertFalse(self.post('auth/telegram/webapp', {'init_data': signed_init_data(user)}).json()['created'])
        response = self.post('auth/telegram/webapp', {'init_data': signed_init_data(user, bot_token='1:BAD')})
        self.assertEqual((response.status_code, response.json()), (401, {'error': 'invalid_init_data'}))

    def test_telegram_deep_link_login(self):
        start = self.post('auth/telegram/start', {}).json()  # the business's own customers' bot
        self.assertTrue(start['url'].startswith('https://t.me/test_bot?start=login_'))
        self.assertEqual(start['expires_in'], 300)
        self.assertEqual(self.get(f"auth/telegram/check?token={start['token']}").json(), {'status': 'pending'})

        # what the bot service does after "/start login_<token>"
        client = Client.objects.create(first_name='Bot user', tg_id='900')
        TelegramLoginToken.objects.filter(token=start['token']).update(status='confirmed', client=client)
        confirmed = self.get(f"auth/telegram/check?token={start['token']}").json()
        self.assertEqual((confirmed['status'], confirmed['client']['id']), ('confirmed', client.id))
        self.assertEqual(self.get('me', confirmed['token']).json()['client']['id'], client.id)
        self.assertEqual(self.get(f"auth/telegram/check?token={start['token']}").status_code, 404)  # single use

    def test_telegram_login_expires_and_needs_a_bot(self):
        start = self.post('auth/telegram/start', {}).json()
        TelegramLoginToken.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.get(f"auth/telegram/check?token={start['token']}").json(), {'status': 'expired'})
        BusinessBot.objects.all().delete()
        response = self.post('auth/telegram/start', {})
        self.assertEqual((response.status_code, response.json()), (503, {'error': 'telegram_unavailable'}))

    # -- profile ------------------------------------------------------------------
    def test_profile_update(self):
        token = self.login_by_phone()['token']
        response = self.shop.patch('/api/v1/me', {'first_name': ' Aziz ', 'lang': 'ru', 'phone': '+1'}, format='json',
                                   HTTP_AUTHORIZATION=f'Bearer {token}')
        client = response.json()['client']
        self.assertEqual((client['first_name'], client['lang'], client['phone']), ('Aziz', 'ru', '+998901234567'))
        response = self.shop.patch('/api/v1/me', {'lang': 'en'}, format='json', HTTP_AUTHORIZATION=f'Bearer {token}')
        self.assertEqual(response.json(), {'error': 'validation', 'fields': {'lang': ['invalid_choice']}})

    def test_customer_token_works_only_in_its_business(self):
        client = Client.objects.create(first_name='Ali', tg_id='555')
        token = issue_token(client)
        self.assertEqual(self.get('me', token).status_code, 200)
        with self.assertRaises(signing.BadSignature):  # the same client id in another business's schema
            signing.loads(token, salt=f'{TOKEN_SALT}:other_business')

    # -- orders ---------------------------------------------------------------------
    def test_order_requires_auth(self):
        response = self.post('orders', {'items': []})
        self.assertEqual((response.status_code, response.json()), (401, {'error': 'auth_required'}))
        self.assertEqual(response['WWW-Authenticate'], 'Bearer')
        self.assertEqual(self.get('orders', 'garbage-token').status_code, 401)

    def test_order_validation(self):
        token = self.login_by_phone()['token']
        response = self.order(token, phone='12', delivery_type='delivery')
        self.assertEqual(response.json(), {'error': 'validation',
                                           'fields': {'phone': ['invalid'], 'address': ['required']}})
        response = self.order(token, items=[{'product_id': 999999, 'quantity': 1}])
        self.assertEqual(response.json(), {'error': 'product_not_found', 'detail': [999999]})
        self.assertEqual(self.post('orders', {'items': []}, token).json()['error'], 'empty')

    def test_create_order_uses_server_prices(self):
        token = self.login_by_phone()['token']
        response = self.post('orders', {
            'items': [{'product_id': self.burger.id, 'quantity': 2, 'price': 1},
                      {'product_id': self.cola.id, 'quantity': 1},
                      {'product_id': self.burger.id, 'quantity': 1}],
            'name': 'Ali Valiyev', 'phone': '90 123 45 67', 'delivery_type': 'delivery',
            'address': 'Chilonzor 9', 'lat': '41.28', 'lng': '69.20', 'payment_method': 'card',
            'comment': 'Piyozsiz', 'platform': 'miniapp', 'lang': 'ru',
        }, token)
        self.assertEqual(response.status_code, 201)
        data = response.json()['order']
        self.assertEqual(data['total'], 3 * 35000 + 12000)
        self.assertEqual({item['product_id']: item['quantity'] for item in data['items']},
                         {self.burger.id: 3, self.cola.id: 1})
        order = Order.objects.get(pk=data['id'])
        self.assertEqual((order.source, order.status, order.payment_method, order.customer_name),
                         ('miniapp', 'ordered', 'card', 'Ali Valiyev'))
        self.assertEqual((order.location, order.l_t, order.e_t), ('Chilonzor 9', '41.28', '69.2'))
        client = order.client
        self.assertEqual((client.first_name, client.lang, client.location), ('Ali', 'ru', 'Chilonzor 9'))
        self.assertEqual([o['id'] for o in self.get('orders', token).json()['orders']], [order.id])
        self.assertFalse(Outbox.objects.exists())  # a website customer without Telegram gets no bot message

    def test_order_of_a_telegram_customer_is_announced_by_the_bot(self):
        user = {'id': 777, 'first_name': 'Olim'}
        token = self.post('auth/telegram/webapp', {'init_data': signed_init_data(user)}).json()['token']
        order_id = self.order(token, platform='miniapp').json()['order']['id']
        self.assertEqual(list(Outbox.objects.values_list('kind', 'order_id', 'sent_at')),
                         [('order_created', order_id, None)])

    def test_delivery_by_location_pin_only(self):
        token = self.login_by_phone()['token']
        data = self.order(token, delivery_type='delivery', lat=41.311081, lng=69.240562).json()['order']
        self.assertEqual((data['address'], data['lat'], data['lng']), ('', '41.311081', '69.240562'))

    def test_pickup_order_ignores_address(self):
        token = self.login_by_phone()['token']
        response = self.order(token, address='x')
        order = Order.objects.get(pk=response.json()['order']['id'])
        self.assertEqual((order.delivery_type, order.location, order.source), ('pickup', None, 'web'))

    def test_order_is_private(self):
        owner = self.login_by_phone('+998901111111')['token']
        other = self.login_by_phone('+998902222222')['token']
        order_id = self.order(owner).json()['order']['id']
        self.assertEqual(self.get(f'orders/{order_id}', owner).status_code, 200)
        self.assertEqual(self.get(f'orders/{order_id}', other).json(), {'error': 'not_found'})

    def test_min_order(self):
        Business.objects.filter(pk=self.tenant.pk).update(min_order=50000)
        token = self.login_by_phone()['token']
        self.assertEqual(self.order(token).json(), {'error': 'min_order', 'min_order': 50000})

    def test_order_flood_is_limited(self):
        token = self.login_by_phone()['token']
        statuses = [self.order(token).status_code for _ in range(11)]
        self.assertEqual(statuses[-1], 429)
        self.assertEqual(statuses.count(201), 10)


class FastAnswersTests(BusinessTestCase):
    """Answers that cost little on a bad mobile network (docs/api.md, Conventions)."""

    def setUp(self):
        super().setUp()
        self.unit, self.category, self.burger, self.cola = make_catalog()

    def get(self, path):
        return self.shop.get(f'/api/v1/{path}')

    def sign_in(self):
        return issue_token(Client.objects.create(first_name='Ali', phone='+998901234567'))

    def test_an_unchanged_menu_is_a_304_without_a_body(self):
        first = self.get('shop')
        self.assertEqual(first['Cache-Control'], 'private, no-cache')
        again = self.shop.get('/api/v1/shop', HTTP_IF_NONE_MATCH=first['ETag'])
        self.assertEqual((again.status_code, again.content), (304, b''))
        Product.objects.filter(pk=self.cola.pk).update(price='13 000')
        self.assertEqual(self.shop.get('/api/v1/shop', HTTP_IF_NONE_MATCH=first['ETag']).status_code, 200)

    def test_a_repeated_checkout_returns_the_order_it_placed(self):
        token = self.sign_in()
        key = {'HTTP_IDEMPOTENCY_KEY': 'checkout-7f3a9c'}
        body = {'items': [{'product_id': self.cola.id, 'quantity': 2}], 'name': 'Ali', 'phone': '901234567',
                'delivery_type': 'pickup'}
        first = self.shop.post('/api/v1/orders', body, format='json', HTTP_AUTHORIZATION=f'Bearer {token}', **key)
        again = self.shop.post('/api/v1/orders', body, format='json', HTTP_AUTHORIZATION=f'Bearer {token}', **key)
        self.assertEqual((first.status_code, again.status_code), (201, 201))
        self.assertEqual(again.json()['order']['id'], first.json()['order']['id'])
        self.assertEqual(Order.objects.count(), 1)

        other = self.shop.post('/api/v1/orders', body, format='json', HTTP_AUTHORIZATION=f'Bearer {token}',
                               HTTP_IDEMPOTENCY_KEY='checkout-other1')
        self.assertNotEqual(other.json()['order']['id'], first.json()['order']['id'])

    def test_a_repeat_while_the_first_try_runs_waits(self):
        token = self.sign_in()
        client_id = Client.objects.get().pk
        cache.add(f'order-key-busy:{client_id}:checkout-7f3a9c', 1, 60)  # the first try is still being placed
        body = {'items': [{'product_id': self.cola.id, 'quantity': 1}], 'name': 'Ali', 'phone': '901234567',
                'delivery_type': 'pickup'}
        response = self.shop.post('/api/v1/orders', body, format='json', HTTP_AUTHORIZATION=f'Bearer {token}',
                                  HTTP_IDEMPOTENCY_KEY='checkout-7f3a9c')
        self.assertEqual((response.status_code, response.json()), (409, {'error': 'order_in_progress'}))
