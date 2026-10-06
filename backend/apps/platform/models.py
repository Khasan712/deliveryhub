from django.db import models
from django_tenants.models import DomainMixin, TenantMixin

from .crypto import decrypt, encrypt
from .storage import platform_storage


class Business(TenantMixin):
    """A business on the platform. Its products, orders, customers and staff live in its own PostgreSQL
    schema (`schema_name`); only this profile is shared. The public schema is a Business too: our panel."""
    STATUS_ACTIVE = 'active'
    STATUS_SUSPENDED = 'suspended'
    STATUS_CHOICES = ((STATUS_ACTIVE, 'Active'), (STATUS_SUSPENDED, 'Suspended'))

    name = models.CharField(max_length=120)
    # Subdomains: <slug> — shop and Mini App, <slug>-admin — admin panel.
    slug = models.SlugField(max_length=40, unique=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_ACTIVE)
    tagline = models.CharField(max_length=200, blank=True)
    support_phone = models.CharField(max_length=30, blank=True)
    # Where customers pick up their orders (picked on a map in our panel); the point also centres the shop's map.
    address = models.CharField(max_length=255, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    # A shift a day, Monday first: [{"open": "09:00", "close": "22:00"} | null] × 7 (apps.platform.hours).
    # Null: not set — the shop takes orders at any time.
    working_hours = models.JSONField(blank=True, null=True)
    delivery_time = models.CharField(max_length=20, blank=True, default='30–45')
    min_order = models.PositiveIntegerField(default=0)
    brand_color = models.CharField(max_length=7, blank=True)
    logo = models.ImageField(upload_to='logos/', blank=True, storage=platform_storage)
    owner_name = models.CharField(max_length=120, blank=True)
    owner_phone = models.CharField(max_length=30, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    auto_create_schema = True

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.name

    @property
    def is_active(self):
        return self.status == self.STATUS_ACTIVE


class Domain(DomainMixin):
    """A host name of a business and which part of it the host serves."""
    KIND_SHOP = 'shop'
    KIND_ADMIN = 'admin'
    KIND_PLATFORM = 'platform'
    KIND_CHOICES = ((KIND_SHOP, 'Shop'), (KIND_ADMIN, 'Admin panel'), (KIND_PLATFORM, 'Platform panel'))

    kind = models.CharField(max_length=10, choices=KIND_CHOICES, default=KIND_SHOP)


class BusinessBot(models.Model):
    """A Telegram bot of a business: the customers' bot or the staff (admin) bot."""
    ROLE_CLIENT = 'client'
    ROLE_ADMIN = 'admin'
    ROLE_CHOICES = ((ROLE_CLIENT, 'Customers'), (ROLE_ADMIN, 'Staff'))
    VIA_MANAGED = 'managed'
    VIA_TOKEN = 'token'

    business = models.ForeignKey(Business, on_delete=models.CASCADE, related_name='bots')
    role = models.CharField(max_length=10, choices=ROLE_CHOICES)
    telegram_id = models.BigIntegerField(unique=True)
    username = models.CharField(max_length=64)
    name = models.CharField(max_length=128, blank=True)
    token_encrypted = models.TextField()
    # Managed Bots: created by a Telegram user through our platform bot; otherwise a token was pasted.
    created_via = models.CharField(max_length=10, default=VIA_TOKEN)
    owner_telegram_id = models.BigIntegerField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    # Set by the bot runtime while it polls this bot.
    last_seen_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['business', 'role'], name='hub_one_bot_per_role')]

    def __str__(self):
        return f'@{self.username} ({self.business}, {self.role})'

    @property
    def token(self):
        return decrypt(self.token_encrypted)

    @token.setter
    def token(self, value):
        self.token_encrypted = encrypt(value)


class BotSetup(models.Model):
    """A link to our platform bot that creates a business's bots with Telegram Managed Bots:
    t.me/<platform bot>?start=setup_<token>. Only a hash of the token is stored."""
    business = models.ForeignKey(Business, on_delete=models.CASCADE, related_name='bot_setups')
    token_hash = models.CharField(max_length=64, unique=True)
    # The Telegram user who opened the link; the bots they create are attached to the business.
    telegram_user_id = models.BigIntegerField(blank=True, null=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()


class MobileApp(models.Model):
    """Our mobile app (mobile/ — Android and iOS) opens the shop of one business, chosen in our panel: we show a
    business its own shop on a phone, as its customers would use it. A single row (pk 1)."""
    business = models.ForeignKey(Business, on_delete=models.SET_NULL, blank=True, null=True, related_name='+')
    updated_at = models.DateTimeField(auto_now=True)

    @classmethod
    def current(cls):
        return cls.objects.select_related('business').get_or_create(pk=1)[0]


class Landing(models.Model):
    """Our page for businesses (landing/, at the bare domain): the business whose shop it links to as a live sample,
    chosen in our panel ("Arizalar"). A single row (pk 1)."""
    sample = models.ForeignKey(Business, on_delete=models.SET_NULL, blank=True, null=True, related_name='+')
    updated_at = models.DateTimeField(auto_now=True)

    @classmethod
    def current(cls):
        return cls.objects.select_related('sample').get_or_create(pk=1)[0]


class Lead(models.Model):
    """An application from the form of our landing page (landing/): a business that wants its own shop. Our staff
    call it back and keep its status in our panel ("Arizalar")."""
    STATUS_NEW = 'new'
    STATUS_CONTACTED = 'contacted'
    STATUS_WON = 'won'
    STATUS_LOST = 'lost'
    STATUS_CHOICES = [(STATUS_NEW, 'Yangi'), (STATUS_CONTACTED, "Bog'lanildi"), (STATUS_WON, "Mijoz bo'ldi"),
                      (STATUS_LOST, 'Rad etildi')]
    KIND_CHOICES = [('cafe', 'Kafe yoki restoran'), ('fastfood', 'Fast food'), ('shop', "Do'kon"), ('other', 'Boshqa')]
    LANG_CHOICES = [('uz', "O'zbekcha"), ('ru', 'Русский')]

    name = models.CharField(max_length=120)
    phone = models.CharField(max_length=20, db_index=True)
    business = models.CharField(max_length=120, blank=True, default='')
    kind = models.CharField(max_length=10, choices=KIND_CHOICES, blank=True, default='')
    comment = models.TextField(max_length=1000, blank=True, default='')
    lang = models.CharField(max_length=2, choices=LANG_CHOICES, default='uz')
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_NEW)
    note = models.TextField(max_length=1000, blank=True, default='')  # our staff's, not the business's
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)
    contacted_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        ordering = ['-created_at', '-id']

    def __str__(self):
        return f'{self.name} {self.phone}'
