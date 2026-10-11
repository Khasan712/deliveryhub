from django.contrib.auth import login
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core import branches
from apps.platform.current import url_for
from apps.platform.models import Domain
from apps.telegram.invites import admin_bot, find_staff
from ...common.auth import BaseLoginView, enforce_csrf, login_schema
from ...common.errors import ApiError
from ...common.permissions import in_business
from ...common.representations import file_url
from ...common.telegram import telegram_user
from ..serializers import StaffUserSerializer
from .base import StaffView

Me = inline_serializer('StaffMe', {
    'user': StaffUserSerializer(),
    'business': inline_serializer('StaffBusiness', {
        'name': serializers.CharField(), 'slug': serializers.CharField(),
        'logo': serializers.CharField(allow_null=True), 'brand_color': serializers.CharField(),
        'shop_url': serializers.URLField(),
        'branches_enabled': serializers.BooleanField(help_text='Our panel lets the business have branches'),
        'dispatch': serializers.BooleanField(help_text=(
            'Branches on and 2+ active branches: delivery orders wait for the head office to send them to a branch')),
    }),
})


def me_payload(request, user):
    business = request.tenant
    return {
        'user': StaffUserSerializer(user).data,
        'business': {
            'name': business.name,
            'slug': business.slug,
            'logo': file_url(business.logo),
            'brand_color': business.brand_color,
            'shop_url': url_for(request, business, Domain.KIND_SHOP),
            'branches_enabled': branches.enabled(business),
            'dispatch': branches.dispatching(business),
        },
    }


@login_schema(Me)
class LoginView(BaseLoginView):
    def can_sign_in(self, user):
        return in_business(self.request)

    def me(self, request, user):
        return me_payload(request, user)


class MeView(StaffView):
    @extend_schema(summary='The signed-in staff member and their business', responses=Me)
    def get(self, request):
        return Response(me_payload(request, request.user))


class TelegramLoginView(APIView):
    """Sign-in of the admin panel opened as a Mini App from the staff bot: Telegram signs initData with the
    bot token, and a staff member whose Telegram account is linked is signed in without a password."""
    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(summary='Sign in from the staff bot Mini App',
                   request=inline_serializer('InitData', {'init_data': serializers.CharField()}), responses=Me)
    def post(self, request):
        enforce_csrf(request)
        bot = admin_bot()
        user = telegram_user(str(request.data.get('init_data') or ''), bot.token if bot else '')
        if not user:
            raise ApiError('invalid_init_data', 403)
        staff = find_staff(user['id'])
        if not staff:
            raise ApiError('not_linked', 403)
        login(request, staff.user, backend='django.contrib.auth.backends.ModelBackend')
        return Response(me_payload(request, staff.user))
