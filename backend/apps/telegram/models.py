from django.conf import settings
from django.db import models
from django.db.models import Q
from django.db.models.functions import Now
from django.utils import timezone


class StaffLink(models.Model):
    """A staff member's Telegram account connected to their dashboard user."""
    telegram_id = models.BigIntegerField(unique=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='telegram_links')
    first_name = models.CharField(max_length=150, blank=True)
    username = models.CharField(max_length=100, blank=True)
    lang = models.CharField(max_length=2, default='uz')
    notify_orders = models.BooleanField(default=True)
    # Set when Telegram refuses delivery (the bot was blocked); cleared when the person writes again.
    blocked_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(blank=True, null=True)

    def __str__(self):
        return f'{self.telegram_id} → {self.user}'

    @property
    def display_name(self):
        return self.first_name or (f'@{self.username}' if self.username else str(self.telegram_id))


class StaffInvite(models.Model):
    """One-time link t.me/<bot>?start=inv_<token> that connects a Telegram account to `user`.
    Only a hash of the token is stored."""
    token_hash = models.CharField(max_length=64, unique=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='telegram_invites')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, blank=True, null=True, related_name='+'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(blank=True, null=True)

    def __str__(self):
        return f'{self.user} ({self.created_at:%Y-%m-%d %H:%M})'


class Draft(models.Model):
    """The order being dictated in a staff chat (one at a time)."""
    staff = models.OneToOneField(StaffLink, on_delete=models.CASCADE, related_name='draft')
    # Same form as the dashboard voice entry (dashboard.voice.clean_state).
    state = models.JSONField(default=dict)
    transcript = models.TextField(blank=True)
    unmatched = models.JSONField(default=list)
    # The card with the ✅ / ❌ buttons.
    message_id = models.BigIntegerField(blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)


class OrderTicket(models.Model):
    """Bot bookkeeping for an order: staff were told about it, who accepted it and who changed it last."""
    order = models.OneToOneField('app.Order', on_delete=models.CASCADE, related_name='bot_ticket')
    # The order status the cards in the chats currently show.
    status_seen = models.CharField(max_length=20)
    accepted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, blank=True, null=True, related_name='+'
    )
    accepted_at = models.DateTimeField(blank=True, null=True)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, blank=True, null=True, related_name='+'
    )
    changed_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    def __str__(self):
        return f'#{self.order_id}'


class OrderCard(models.Model):
    """A message about an order in a staff chat; every copy is updated when the order changes."""
    ticket = models.ForeignKey(OrderTicket, on_delete=models.CASCADE, related_name='cards')
    chat_id = models.BigIntegerField()
    message_id = models.BigIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['chat_id', 'message_id'], name='adminbot_card_message')]


class Outbox(models.Model):
    """A message to a customer, sent by the bot service from the business's customers' bot. The backend
    writes a row when an order is placed or its status changes; the bot service sends it and sets sent_at."""
    KIND_ORDER_CREATED = 'order_created'
    KIND_ORDER_STATUS = 'order_status'
    KIND_CHOICES = ((KIND_ORDER_CREATED, 'Order placed'), (KIND_ORDER_STATUS, 'Order status changed'))

    # Database defaults too: the bot service (SQLAlchemy) also writes rows.
    kind = models.CharField(max_length=30, choices=KIND_CHOICES)
    order = models.ForeignKey('app.Order', on_delete=models.CASCADE, related_name='+')
    # For order_status: accepted, on_the_way, completed or rejected.
    event = models.CharField(max_length=30, blank=True, default='', db_default='')
    created_at = models.DateTimeField(default=timezone.now, db_default=Now())
    sent_at = models.DateTimeField(blank=True, null=True)
    attempts = models.PositiveSmallIntegerField(default=0, db_default=0)
    error = models.CharField(max_length=200, blank=True, default='', db_default='')

    class Meta:
        # What the bot service polls every few seconds (bot/app/outbox.py): only the rows still to send, however
        # long the history of sent and given-up ones grows. MAX_ATTEMPTS there is 5.
        indexes = [models.Index(fields=['id'], condition=Q(sent_at__isnull=True, attempts__lt=5),
                                name='adminbot_outbox_due')]

    def __str__(self):
        return f'{self.kind} #{self.order_id}'
