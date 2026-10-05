"""Platform API data (docs/api.md, Platform API)."""
from decimal import Decimal

from rest_framework import serializers

from apps.core import images
from apps.platform import provisioning
from apps.platform.bots import is_alive, missing_roles, platform_bot
from apps.platform.current import url_for
from apps.platform.models import Business, BusinessBot, Domain, Lead
from apps.platform.overview import business_stats, owner_of
from ..common.fields import ColorField, LimitedImageField, PhoneField
from ..common.hours import WorkingHoursSerializer, hours_payload
from ..common.representations import business_point, file_url, iso, person_name


class BotSerializer(serializers.Serializer):
    username = serializers.CharField()
    alive = serializers.BooleanField(help_text='The bot service polls it right now')
    created_via = serializers.ChoiceField(choices=[BusinessBot.VIA_MANAGED, BusinessBot.VIA_TOKEN])

    def to_representation(self, bot):
        return {'username': bot.username, 'alive': is_alive(bot), 'created_via': bot.created_via}


class StatsSerializer(serializers.Serializer):
    orders_today = serializers.IntegerField()
    revenue_today = serializers.IntegerField()
    orders_total = serializers.IntegerField()
    customers = serializers.IntegerField()


class LinksSerializer(serializers.Serializer):
    shop = serializers.URLField()
    admin = serializers.URLField()


class BotsSerializer(serializers.Serializer):
    client = BotSerializer(allow_null=True)
    admin = BotSerializer(allow_null=True)


class BusinessCardSerializer(serializers.Serializer):
    """Needs `request` in the context (addresses follow the style of the request: public or *.localhost)."""
    slug = serializers.CharField()
    name = serializers.CharField()
    status = serializers.ChoiceField(choices=[Business.STATUS_ACTIVE, Business.STATUS_SUSPENDED])
    logo = serializers.CharField(allow_null=True)
    brand_color = serializers.CharField()
    tagline = serializers.CharField()
    created_at = serializers.DateTimeField()
    links = LinksSerializer()
    stats = StatsSerializer()
    bots = BotsSerializer()

    def to_representation(self, business):
        request = self.context['request']
        bots = {bot.role: bot for bot in business.bots.all() if bot.is_active}
        return {
            'slug': business.slug,
            'name': business.name,
            'status': business.status,
            'logo': file_url(business.logo),
            'brand_color': business.brand_color,
            'tagline': business.tagline,
            'created_at': iso(business.created_at),
            'links': {'shop': url_for(request, business, Domain.KIND_SHOP),
                      'admin': url_for(request, business, Domain.KIND_ADMIN)},
            'stats': business_stats(business),
            'bots': {role: BotSerializer(bots[role]).data if role in bots else None
                     for role in (BusinessBot.ROLE_CLIENT, BusinessBot.ROLE_ADMIN)},
        }


class OwnerSerializer(serializers.Serializer):
    name = serializers.CharField()
    phone = serializers.CharField()


class PlatformBotSerializer(serializers.Serializer):
    username = serializers.CharField()


class BusinessDetailSerializer(BusinessCardSerializer):
    support_phone = serializers.CharField()
    address = serializers.CharField()
    lat = serializers.FloatField(allow_null=True)
    lng = serializers.FloatField(allow_null=True)
    working_hours = WorkingHoursSerializer(help_text='Set by the business in its admin panel (read-only here)')
    delivery_time = serializers.CharField()
    min_order = serializers.IntegerField()
    owner = OwnerSerializer(allow_null=True)
    platform_bot = PlatformBotSerializer(allow_null=True)
    missing_roles = serializers.ListField(child=serializers.ChoiceField(choices=list(BusinessBot.ROLE_CHOICES)))

    def to_representation(self, business):
        owner = owner_of(business)
        me = platform_bot()
        return {
            **super().to_representation(business),
            'support_phone': business.support_phone,
            'address': business.address,
            **business_point(business),
            'working_hours': hours_payload(business),
            'delivery_time': business.delivery_time,
            'min_order': business.min_order,
            'owner': {'name': person_name(owner), 'phone': owner.phone_number} if owner else None,
            'platform_bot': {'username': me['username']} if me and me.get('username') else None,
            'missing_roles': missing_roles(business),
        }


# ---------------------------------------------------------------------------
# the mobile app
# ---------------------------------------------------------------------------

class AppShopSerializer(serializers.Serializer):
    """The shop the mobile app opens. Needs `request` in the context: the app is not on our host, so every address
    is absolute."""
    slug = serializers.CharField()
    name = serializers.CharField()
    tagline = serializers.CharField()
    logo = serializers.URLField(allow_null=True)
    brand_color = serializers.CharField(help_text='"#rrggbb" or "" (the app then uses its own colour)')
    url = serializers.URLField(help_text='The shop the app shows')

    def to_representation(self, business):
        request = self.context['request']
        return {
            'slug': business.slug,
            'name': business.name,
            'tagline': business.tagline,
            'logo': request.build_absolute_uri(business.logo.url) if business.logo else None,
            'brand_color': business.brand_color,
            'url': url_for(request, business, Domain.KIND_SHOP),
        }


class AppStoreSerializer(serializers.Serializer):
    android = serializers.URLField(allow_null=True)
    ios = serializers.URLField(allow_null=True)


class AppConfigSerializer(serializers.Serializer):
    shop = AppShopSerializer(allow_null=True, help_text='null: no business chosen, or it is suspended')
    min_version = serializers.CharField(help_text='An older app asks to be updated from the store')
    store = AppStoreSerializer()


class MobileAppSerializer(serializers.Serializer):
    business = BusinessCardSerializer(allow_null=True, help_text='Chosen in our panel')
    updated_at = serializers.DateTimeField()
    config = AppConfigSerializer(help_text='Exactly what the app receives now')


def choices(of):
    return [key for key, _ in of]


class LeadSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    phone = serializers.CharField()
    business = serializers.CharField()
    kind = serializers.ChoiceField(choices=[''] + choices(Lead.KIND_CHOICES))
    comment = serializers.CharField()
    lang = serializers.ChoiceField(choices=choices(Lead.LANG_CHOICES), help_text='The language of its page')
    status = serializers.ChoiceField(choices=choices(Lead.STATUS_CHOICES))
    note = serializers.CharField(help_text="Our staff's")
    created_at = serializers.DateTimeField()
    updated_at = serializers.DateTimeField()
    contacted_at = serializers.DateTimeField(allow_null=True, help_text='When it first left "new"')

    def to_representation(self, lead):
        return {
            'id': lead.pk, 'name': lead.name, 'phone': lead.phone, 'business': lead.business, 'kind': lead.kind,
            'comment': lead.comment, 'lang': lead.lang, 'status': lead.status, 'note': lead.note,
            'created_at': iso(lead.created_at), 'updated_at': iso(lead.updated_at),
            'contacted_at': iso(lead.contacted_at),
        }


# ---------------------------------------------------------------------------
# requests
# ---------------------------------------------------------------------------

class BusinessProfileSerializer(serializers.Serializer):
    """Editable profile; `logo: null` (or empty) removes the logo. The point on the map comes as both `lat` and
    `lng`."""
    name = serializers.CharField(max_length=120)
    tagline = serializers.CharField(max_length=200, required=False, allow_blank=True)
    support_phone = serializers.CharField(max_length=30, required=False, allow_blank=True)
    address = serializers.CharField(max_length=255, required=False, allow_blank=True)
    lat = serializers.FloatField(min_value=-90, max_value=90, required=False, source='latitude')
    lng = serializers.FloatField(min_value=-180, max_value=180, required=False, source='longitude')
    delivery_time = serializers.CharField(max_length=20, required=False, allow_blank=True)
    min_order = serializers.IntegerField(min_value=0, max_value=100_000_000, required=False)
    brand_color = ColorField(required=False)
    logo = LimitedImageField(max_mb=2, required=False, allow_null=True)

    def validate_delivery_time(self, value):
        return value or '30–45'

    def validate(self, attrs):
        if ('latitude' in attrs) != ('longitude' in attrs):
            raise serializers.ValidationError({'lng' if 'latitude' in attrs else 'lat': ['required']},
                                              code='required')
        for field in ('latitude', 'longitude'):
            if field in attrs:
                attrs[field] = Decimal(f'{attrs[field]:.6f}')
        return attrs

    def apply(self, business):
        for field, value in self.validated_data.items():
            if field == 'logo':
                business.logo = images.logo(value) if value else ''
            else:
                setattr(business, field, value)
        business.save()
        return business


class SlugField(serializers.CharField):
    def __init__(self, **kwargs):
        kwargs.setdefault('max_length', 40)
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        slug = super().to_internal_value(data).lower()
        try:
            provisioning.validate_slug(slug)
        except provisioning.ProvisioningError as exc:
            raise serializers.ValidationError(exc.code, code=exc.code)
        return slug


class BusinessCreateSerializer(BusinessProfileSerializer):
    slug = SlugField(help_text='3–30 characters: a-z, 0-9, "-"')
    # A business opens with its place on the map (the pickup address of the shop).
    address = serializers.CharField(max_length=255)
    lat = serializers.FloatField(min_value=-90, max_value=90, source='latitude')
    lng = serializers.FloatField(min_value=-180, max_value=180, source='longitude')
    owner_name = serializers.CharField(max_length=120)
    owner_phone = PhoneField()
    owner_password = serializers.CharField(min_length=8, max_length=128, required=False, allow_blank=True,
                                           trim_whitespace=False, help_text='Empty → generated')


class CredentialsSerializer(serializers.Serializer):
    phone = serializers.CharField()
    password = serializers.CharField()


class StatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=[Business.STATUS_ACTIVE, Business.STATUS_SUSPENDED])


class DeleteBusinessSerializer(serializers.Serializer):
    confirm = serializers.CharField(max_length=40, help_text="The business's slug, typed by hand")


class BotConnectSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=[BusinessBot.ROLE_CLIENT, BusinessBot.ROLE_ADMIN])
    token = serializers.CharField(max_length=100)


class PlatformUserSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    phone_number = serializers.CharField()
    first_name = serializers.CharField()

    def to_representation(self, user):
        return {'id': user.pk, 'phone_number': user.phone_number, 'first_name': user.first_name or ''}


class MobileAppUpdateSerializer(serializers.Serializer):
    business = serializers.SlugField(allow_null=True, help_text='Slug of an active business; null: none')

    def validate_business(self, slug):
        if slug is None:
            return None
        business = Business.objects.filter(slug=slug).first()
        if business is None:
            raise serializers.ValidationError('does_not_exist', code='does_not_exist')
        if not business.is_active:
            raise serializers.ValidationError('suspended', code='suspended')
        return business


class LeadCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    phone = PhoneField(uz_only=True)
    business = serializers.CharField(max_length=120, required=False, allow_blank=True, default='')
    kind = serializers.ChoiceField(choices=choices(Lead.KIND_CHOICES), required=False, allow_blank=True, default='')
    comment = serializers.CharField(max_length=1000, required=False, allow_blank=True, default='')
    lang = serializers.ChoiceField(choices=choices(Lead.LANG_CHOICES), required=False, default='uz')
    website = serializers.CharField(required=False, allow_blank=True, default='',
                                    help_text='Hidden on the page and left empty by people: a trap for bots')


class LeadUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=choices(Lead.STATUS_CHOICES), required=False)
    note = serializers.CharField(max_length=1000, required=False, allow_blank=True)
