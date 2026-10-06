"""Platform API: our own panel — businesses, their owners and bots (docs/api.md, Platform API)."""
import secrets
from datetime import timedelta

from django.conf import settings
from django.db.models import Count
from django.utils import timezone
from django_tenants.utils import tenant_context
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.generics import get_object_or_404
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core import images
from apps.platform import provisioning
from apps.platform.bots import BotInUse, connect_bot, create_setup_link, release_bot
from apps.platform.current import url_for
from apps.platform.models import Business, BusinessBot, Domain, Landing, Lead, MobileApp
from apps.platform.overview import businesses, owner_of
from apps.platform.telegram_api import TelegramError
from ..common import geo
from ..common.auth import BaseLoginView, SessionAuthentication, login_schema
from ..common.errors import ApiError
from ..common.pagination import Pagination
from ..common.permissions import IsPlatformStaff
from ..common.qr import qr_svg
from ..common.ratelimit import client_ip, throttle
from ..common.representations import iso
from . import serializers as s

Me = inline_serializer('PlatformMe', {'user': s.PlatformUserSerializer()})


class PlatformView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsPlatformStaff]

    def business(self, slug):
        return get_object_or_404(businesses(), slug=slug)

    def detail(self, business):
        return s.BusinessDetailSerializer(business, context={'request': self.request}).data


@login_schema(Me)
class LoginView(BaseLoginView):
    def can_sign_in(self, user):
        return user.is_superuser

    def me(self, request, user):
        return {'user': s.PlatformUserSerializer(user).data}


class MeView(PlatformView):
    @extend_schema(summary='The signed-in member of our staff', responses=Me)
    def get(self, request):
        return Response({'user': s.PlatformUserSerializer(request.user).data})


BusinessList = inline_serializer('Businesses', {
    'domain': serializers.CharField(help_text='PLATFORM_DOMAIN: businesses live at <slug>.<domain>'),
    'totals': inline_serializer('BusinessTotals', {
        'businesses': serializers.IntegerField(), 'active': serializers.IntegerField(),
        'orders_today': serializers.IntegerField(), 'revenue_today': serializers.IntegerField()}),
    'results': s.BusinessCardSerializer(many=True),
})


class BusinessListView(PlatformView):
    @extend_schema(summary='All businesses with today\'s numbers', operation_id='businesses_list',
                   responses=BusinessList)
    def get(self, request):
        cards = s.BusinessCardSerializer(businesses(), many=True, context={'request': request}).data
        return Response({
            'domain': settings.PLATFORM_DOMAIN,
            'totals': {
                'businesses': len(cards),
                'active': sum(1 for card in cards if card['status'] == Business.STATUS_ACTIVE),
                'orders_today': sum(card['stats']['orders_today'] for card in cards),
                'revenue_today': sum(card['stats']['revenue_today'] for card in cards),
            },
            'results': cards,
        })

    @extend_schema(summary='Open a business: its schema, addresses and the owner\'s admin account',
                   request=s.BusinessCreateSerializer,
                   responses={201: inline_serializer('BusinessCreated', {
                       'business': s.BusinessDetailSerializer(), 'credentials': s.CredentialsSerializer()})})
    def post(self, request):
        data = s.BusinessCreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        fields = dict(data.validated_data)
        logo = fields.pop('logo', None)
        password = fields.pop('owner_password', '') or secrets.token_urlsafe(9)
        try:
            business = provisioning.create_business(owner_password=password, **fields)
        except provisioning.ProvisioningError as exc:  # taken in the meantime
            raise ApiError('validation', fields={'slug': [exc.code]})
        if logo:
            business.logo = images.logo(logo)
            business.save(update_fields=['logo'])
        return Response({
            'business': self.detail(businesses().get(pk=business.pk)),
            'credentials': {'phone': fields['owner_phone'], 'password': password},
        }, status=201)


class CheckSlugView(PlatformView):
    @extend_schema(summary='Is this address free?', parameters=[OpenApiParameter('slug', str, required=True)],
                   responses=inline_serializer('SlugCheck', {
                       'available': serializers.BooleanField(),
                       'error': serializers.ChoiceField(['slug_invalid', 'slug_reserved', 'slug_taken'],
                                                        required=False)}))
    def get(self, request):
        try:
            provisioning.validate_slug(request.query_params.get('slug', '').strip().lower())
        except provisioning.ProvisioningError as exc:
            return Response({'available': False, 'error': exc.code})
        return Response({'available': True})


class BusinessDetailView(PlatformView):
    @extend_schema(responses=s.BusinessDetailSerializer)
    def get(self, request, slug):
        return Response(self.detail(self.business(slug)))

    @extend_schema(summary='Edit the profile', request=s.BusinessProfileSerializer,
                   responses=s.BusinessDetailSerializer)
    def patch(self, request, slug):
        business = self.business(slug)
        data = s.BusinessProfileSerializer(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        data.apply(business)
        return Response(self.detail(self.business(slug)))

    @extend_schema(
        summary='Delete the business for good (only a suspended one; its slug typed as confirmation)',
        request=s.DeleteBusinessSerializer, responses={204: None},
        description='Drops its schema (staff, catalog, customers, orders), domains, bots and uploaded files. '
                    'Errors: 409 business_active, 400 confirmation_required.')
    def delete(self, request, slug):
        business = self.business(slug)
        if business.is_active:
            raise ApiError('business_active', 409)
        if str(request.data.get('confirm', '')).strip() != business.slug:
            raise ApiError('confirmation_required')
        provisioning.delete_business(business)
        return Response(status=204)


class BusinessStatusView(PlatformView):
    @extend_schema(summary='Suspend or activate (a suspended business answers 503 everywhere)',
                   request=s.StatusSerializer, responses=s.BusinessDetailSerializer)
    def post(self, request, slug):
        business = self.business(slug)
        data = s.StatusSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        business.status = data.validated_data['status']
        business.save(update_fields=['status'])
        provisioning.write_tunnels_file()
        return Response(self.detail(business))


class OwnerPasswordView(PlatformView):
    @extend_schema(summary='A new password for the owner (shown once)', request=None,
                   responses=s.CredentialsSerializer)
    def post(self, request, slug):
        business = self.business(slug)
        owner = owner_of(business)
        if owner is None:
            raise ApiError('owner_missing')
        password = secrets.token_urlsafe(9)
        with tenant_context(business):
            owner.set_password(password)
            owner.save(update_fields=['password'])
        return Response({'phone': owner.phone_number, 'password': password})


class BotSetupLinkView(PlatformView):
    @extend_schema(summary='A link to our platform bot that creates both bots in two taps', request=None,
                   responses=inline_serializer('BotSetupLink', {
                       'url': serializers.URLField(), 'qr_svg': serializers.CharField(),
                       'expires_at': serializers.DateTimeField()}))
    def post(self, request, slug):
        link = create_setup_link(self.business(slug))
        if link is None:
            raise ApiError('platform_bot_missing')
        url, setup = link
        return Response({'url': url, 'qr_svg': qr_svg(url), 'expires_at': iso(setup.expires_at)})


class BotConnectView(PlatformView):
    @extend_schema(summary='Connect a bot with a token from @BotFather', request=s.BotConnectSerializer,
                   responses=inline_serializer('ConnectedBot', {'bot': s.BotSerializer()}))
    def post(self, request, slug):
        business = self.business(slug)
        data = s.BotConnectSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        try:
            bot = connect_bot(business, data.validated_data['role'], data.validated_data['token'])
        except BotInUse:
            raise ApiError('bot_in_use')
        except TelegramError:
            raise ApiError('invalid_token')
        return Response({'bot': s.BotSerializer(bot).data})


class BotDisconnectView(PlatformView):
    @extend_schema(summary='Disconnect a bot', responses={204: None})
    def delete(self, request, slug, role):
        if role not in (BusinessBot.ROLE_CLIENT, BusinessBot.ROLE_ADMIN):
            raise ApiError('not_found', 404)
        for bot in BusinessBot.objects.filter(business=self.business(slug), role=role):
            release_bot(bot)
            bot.delete()
        return Response(status=204)


class GeoReverseView(geo.GeoReverseMixin, PlatformView):
    pass


class GeoSearchView(geo.GeoSearchMixin, PlatformView):
    pass


# ---------------------------------------------------------------------------
# the mobile app (mobile/): which shop it opens
# ---------------------------------------------------------------------------

def app_config(request):
    business = MobileApp.current().business
    shown = business if business and business.is_active else None
    return {
        'shop': s.AppShopSerializer(shown, context={'request': request}).data if shown else None,
        'min_version': settings.MOBILE_MIN_VERSION,
        'store': {'android': settings.MOBILE_ANDROID_URL or None, 'ios': settings.MOBILE_IOS_URL or None},
    }


class AppConfigView(APIView):
    """Asked by the app on every start and return to the foreground; no account."""
    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(summary='What the mobile app opens', responses=s.AppConfigSerializer)
    def get(self, request):
        return Response(app_config(request))


class MobileAppView(PlatformView):
    def answer(self, request):
        mobile = MobileApp.current()
        card = s.BusinessCardSerializer(mobile.business, context={'request': request}).data if mobile.business else None
        return Response({'business': card, 'updated_at': iso(mobile.updated_at), 'config': app_config(request)})

    @extend_schema(summary='Which business the mobile app shows', responses=s.MobileAppSerializer)
    def get(self, request):
        return self.answer(request)

    @extend_schema(summary='Show another business in the mobile app (at once: the app asks on every start)',
                   request=s.MobileAppUpdateSerializer, responses=s.MobileAppSerializer)
    def put(self, request):
        data = s.MobileAppUpdateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        mobile = MobileApp.current()
        mobile.business = data.validated_data['business']
        mobile.save()
        return self.answer(request)


# ---------------------------------------------------------------------------
# our page for businesses (landing/): the live sample shop it links to
# ---------------------------------------------------------------------------

def landing_config(request):
    sample = Landing.current().sample
    shown = sample if sample and sample.is_active else None
    return {'sample': {'name': shown.name, 'url': url_for(request, shown, Domain.KIND_SHOP)} if shown else None}


class LandingConfigView(APIView):
    """Asked by our page for businesses when it opens (through the bare domain); no account."""
    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(summary='The live sample shop our page for businesses links to', responses=s.LandingConfigSerializer)
    def get(self, request):
        return Response(landing_config(request))


class LandingView(PlatformView):
    def answer(self, request):
        landing = Landing.current()
        card = s.BusinessCardSerializer(landing.sample, context={'request': request}).data if landing.sample else None
        return Response({'sample': card, 'updated_at': iso(landing.updated_at),
                         'url': f'https://{settings.PLATFORM_DOMAIN}/', 'config': landing_config(request)})

    @extend_schema(summary='The live sample shop of our page for businesses', responses=s.LandingSerializer)
    def get(self, request):
        return self.answer(request)

    @extend_schema(summary='Link another business as the sample (at once: the page asks when it opens)',
                   request=s.LandingUpdateSerializer, responses=s.LandingSerializer)
    def put(self, request):
        data = s.LandingUpdateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        landing = Landing.current()
        landing.sample = data.validated_data['sample']
        landing.save()
        return self.answer(request)


# ---------------------------------------------------------------------------
# applications: the form of our landing page (landing/) → our staff call back
# ---------------------------------------------------------------------------

LEADS_PER_HOUR = 10  # from one address; mobile networks put many phones behind one
SAME_LEAD_WINDOW = timedelta(days=1)

LeadCounts = inline_serializer('LeadCounts', {status: serializers.IntegerField() for status, _ in Lead.STATUS_CHOICES})
LeadList = inline_serializer('Leads', {
    'count': serializers.IntegerField(), 'page': serializers.IntegerField(), 'pages': serializers.IntegerField(),
    'results': s.LeadSerializer(many=True),
    'counts': LeadCounts,
})


def lead_counts():
    counted = dict(Lead.objects.order_by().values_list('status').annotate(n=Count('id')))
    return {status: counted.get(status, 0) for status, _ in Lead.STATUS_CHOICES}


class LeadsView(PlatformView):
    """GET — our staff; POST — anyone (the landing page's form): no session, so no CSRF either, even when one of us
    sends the form while signed in."""

    def initialize_request(self, request, *args, **kwargs):
        self.public = request.method == 'POST'
        return super().initialize_request(request, *args, **kwargs)

    def get_authenticators(self):
        return [] if self.public else super().get_authenticators()

    def get_permissions(self):
        return [AllowAny()] if self.public else super().get_permissions()

    @extend_schema(summary='Applications, newest first', operation_id='leads_list', responses=LeadList,
                   parameters=[OpenApiParameter('status', str, enum=[key for key, _ in Lead.STATUS_CHOICES],
                                                description='Only these; all without it'),
                               OpenApiParameter('page', int), OpenApiParameter('page_size', int)])
    def get(self, request):
        leads = Lead.objects.all()
        status = request.query_params.get('status')
        if status:
            if status not in dict(Lead.STATUS_CHOICES):
                raise serializers.ValidationError({'status': [serializers.ErrorDetail('', code='invalid_choice')]})
            leads = leads.filter(status=status)
        pagination = Pagination()
        page = pagination.paginate_queryset(leads, request, self)
        response = pagination.get_paginated_response(s.LeadSerializer(page, many=True).data)
        response.data['counts'] = lead_counts()
        return response

    @extend_schema(summary='Leave an application (the landing page\'s form; no sign-in)', auth=[],
                   request=s.LeadCreateSerializer,
                   responses={201: inline_serializer('LeadCreated', {'ok': serializers.BooleanField()})})
    def post(self, request):
        throttle(f'lead:{client_ip(request)}', LEADS_PER_HOUR, 3600)
        data = s.LeadCreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        fields = dict(data.validated_data)
        if fields.pop('website'):
            return Response({'ok': True}, status=201)  # a bot filled the field people never see
        # Sent twice (or corrected) before we called: one application, with the newest details.
        same = Lead.objects.filter(phone=fields['phone'], status=Lead.STATUS_NEW,
                                   created_at__gte=timezone.now() - SAME_LEAD_WINDOW).first()
        if same:
            for key, value in fields.items():
                if value:
                    setattr(same, key, value)
            same.save()
        else:
            Lead.objects.create(**fields)
        return Response({'ok': True}, status=201)


class LeadView(PlatformView):
    @extend_schema(summary='Change the status of an application or our note on it',
                   request=s.LeadUpdateSerializer, responses=s.LeadSerializer)
    def patch(self, request, pk):
        lead = get_object_or_404(Lead, pk=pk)
        data = s.LeadUpdateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        status = data.validated_data.get('status')
        if status:
            if status != Lead.STATUS_NEW and lead.contacted_at is None:
                lead.contacted_at = timezone.now()
            lead.status = status
        if 'note' in data.validated_data:
            lead.note = data.validated_data['note']
        lead.save()
        return Response(s.LeadSerializer(lead).data)
