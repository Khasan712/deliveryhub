from django.urls import path

from ..common.views import ProductImageView
from . import views

urlpatterns = [
    path('shop', views.ShopCatalogView.as_view(), name='shop'),
    path('products/<int:pk>/image', ProductImageView.as_view(), name='product-image'),
    path('auth/telegram/webapp', views.TelegramWebAppAuthView.as_view(), name='auth-telegram-webapp'),
    path('auth/telegram/start', views.TelegramStartView.as_view(), name='auth-telegram-start'),
    path('auth/telegram/check', views.TelegramCheckView.as_view(), name='auth-telegram-check'),
    path('auth/phone/request', views.PhoneRequestView.as_view(), name='auth-phone-request'),
    path('auth/phone/verify', views.PhoneVerifyView.as_view(), name='auth-phone-verify'),
    path('me', views.MeView.as_view(), name='me'),
    path('orders', views.OrdersView.as_view(), name='orders'),
    path('orders/<int:pk>', views.OrderDetailView.as_view(), name='order'),
    path('geo/reverse', views.GeoReverseView.as_view(), name='geo-reverse'),
    path('geo/search', views.GeoSearchView.as_view(), name='geo-search'),
]
