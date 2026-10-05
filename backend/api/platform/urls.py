from django.urls import path

from ..common.auth import CsrfView, LogoutView
from . import views

urlpatterns = [
    path('auth/csrf', CsrfView.as_view(), name='auth-csrf'),
    path('auth/login', views.LoginView.as_view(), name='auth-login'),
    path('auth/logout', LogoutView.as_view(), name='auth-logout'),
    path('auth/me', views.MeView.as_view(), name='auth-me'),

    path('businesses', views.BusinessListView.as_view(), name='businesses'),
    path('businesses/check-slug', views.CheckSlugView.as_view(), name='check-slug'),
    path('businesses/<slug:slug>', views.BusinessDetailView.as_view(), name='business'),
    path('businesses/<slug:slug>/status', views.BusinessStatusView.as_view(), name='business-status'),
    path('businesses/<slug:slug>/owner-password', views.OwnerPasswordView.as_view(), name='owner-password'),
    path('businesses/<slug:slug>/bots/setup-link', views.BotSetupLinkView.as_view(), name='bot-setup-link'),
    path('businesses/<slug:slug>/bots', views.BotConnectView.as_view(), name='bots'),
    path('businesses/<slug:slug>/bots/<str:role>', views.BotDisconnectView.as_view(), name='bot'),
    path('mobile-app', views.MobileAppView.as_view(), name='mobile-app'),
    path('app/config', views.AppConfigView.as_view(), name='app-config'),
    path('leads', views.LeadsView.as_view(), name='leads'),
    path('leads/<int:pk>', views.LeadView.as_view(), name='lead'),
    path('geo/reverse', views.GeoReverseView.as_view(), name='geo-reverse'),
    path('geo/search', views.GeoSearchView.as_view(), name='geo-search'),
]
