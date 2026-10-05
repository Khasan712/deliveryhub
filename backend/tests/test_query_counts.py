"""The busiest endpoints ask the database the same number of times however much data there is — no query per
product, order or customer. A change that adds one per row fails here."""
from django.core.cache import cache
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.core.models import Category, Client, Descriptions, Order, OrderItem, Product, User
from apps.platform.models import BusinessBot
from apps.platform.testing import BusinessTestCase
from api.shop.authentication import issue_token


class QueryCountTests(BusinessTestCase):
    def setUp(self):
        super().setUp()
        self.unit = Descriptions.objects.create(name_uz='dona', name_ru='шт')
        self.customer = Client.objects.create(first_name='Ali', phone='+998901234567', tg_id='1001')
        self.admin = User.objects.create_user(phone_number='+998900000001', role='admin', password='pass-12345')
        self.cashier = User.objects.create_user(phone_number='+998900000002', role='manager', password='pass-12345')
        bot = BusinessBot(business=self.tenant, role='client', telegram_id=9001, username='shop_bot')
        bot.token = '1:test'
        bot.save()
        self.client.force_login(self.admin)
        self.token = {'HTTP_AUTHORIZATION': f'Bearer {issue_token(self.customer)}'}

    def add_data(self, count):
        """`count` categories with three products each, and twice as many orders of every kind with three items."""
        for _ in range(count):
            category = Category.objects.create(name_uz='Kategoriya', name_ru='Категория')
            products = [Product.objects.create(name_uz='Taom', name_ru='Блюдо', price='10 000', desc_uz='', desc_ru='',
                                               measure=self.unit, category=category) for _ in range(3)]
            for source, client, author, name in (('web', self.customer, None, None), ('bot', self.customer, None, None),
                                                 ('admin', None, self.cashier, 'Kassa')):
                order = Order.objects.create(client=client, status='ordered', source=source, created_by=author,
                                             customer_name=name)
                OrderItem.objects.bulk_create([OrderItem(order=order, product=product, quantity='2',
                                                         price=product.price) for product in products])
        self.order = Order.objects.filter(client=self.customer).first()

    def counts(self):
        cache.clear()  # the same cached lookups (popular products, rate limits) on every measurement
        calls = {
            'shop': lambda: self.shop.get('/api/v1/shop', **self.token),
            'shop orders': lambda: self.shop.get('/api/v1/orders', **self.token),
            'shop order': lambda: self.shop.get(f'/api/v1/orders/{self.order.pk}', **self.token),
            'dashboard': lambda: self.client.get('/api/v1/dashboard'),
            'orders': lambda: self.client.get('/api/v1/orders'),
            'order': lambda: self.client.get(f'/api/v1/orders/{self.order.pk}'),
            'clients': lambda: self.client.get('/api/v1/clients'),
            'client': lambda: self.client.get(f'/api/v1/clients/{self.customer.pk}'),
            'products': lambda: self.client.get('/api/v1/products'),
            'categories': lambda: self.client.get('/api/v1/categories'),
            'sales': lambda: self.client.get('/api/v1/sales'),
        }
        result = {}
        for name, call in calls.items():
            with CaptureQueriesContext(connection) as queries:
                self.assertEqual(call().status_code, 200, name)
            result[name] = len(queries)
        return result

    def test_more_data_costs_no_more_queries(self):
        self.add_data(2)
        few = self.counts()
        self.add_data(8)
        self.assertEqual(self.counts(), few)
