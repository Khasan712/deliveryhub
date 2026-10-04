from django.urls import path

from ..common.auth import CsrfView, LogoutView
from ..common.views import ProductImageView
from .views import auth, business, catalog, clients, dashboard, orders, sales, telegram, users, voice

urlpatterns = [
    path('auth/csrf', CsrfView.as_view(), name='auth-csrf'),
    path('auth/login', auth.LoginView.as_view(), name='auth-login'),
    path('auth/logout', LogoutView.as_view(), name='auth-logout'),
    path('auth/me', auth.MeView.as_view(), name='auth-me'),
    path('auth/telegram', auth.TelegramLoginView.as_view(), name='auth-telegram'),

    path('dashboard', dashboard.DashboardView.as_view(), name='dashboard'),
    path('business', business.BusinessView.as_view(), name='business'),

    path('orders', orders.OrderListView.as_view(), name='orders'),
    path('orders/<int:pk>', orders.OrderDetailView.as_view(), name='order'),

    path('clients', clients.ClientListView.as_view(), name='clients'),
    path('clients/<int:pk>', clients.ClientDetailView.as_view(), name='client'),

    path('products', catalog.ProductListView.as_view(), name='products'),
    path('products/<int:pk>', catalog.ProductDetailView.as_view(), name='product'),
    path('products/<int:pk>/image', ProductImageView.as_view(), name='product-image'),
    path('categories', catalog.CategoryListView.as_view(), name='categories'),
    path('categories/<int:pk>', catalog.CategoryDetailView.as_view(), name='category'),
    path('units', catalog.UnitListView.as_view(), name='units'),

    path('users', users.UserListView.as_view(), name='users'),
    path('users/<int:pk>', users.UserDetailView.as_view(), name='user'),

    path('sales', sales.SalesView.as_view(), name='sales'),
    path('voice/token', voice.VoiceTokenView.as_view(), name='voice-token'),
    path('voice/parse', voice.VoiceParseView.as_view(), name='voice-parse'),

    path('telegram', telegram.TelegramView.as_view(), name='telegram'),
    path('telegram/invites', telegram.InviteView.as_view(), name='telegram-invites'),
    path('telegram/links/<int:pk>', telegram.LinkView.as_view(), name='telegram-link'),
]
