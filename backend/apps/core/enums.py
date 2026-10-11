from enum import Enum


class UserRole(Enum):
    admin = 'admin'
    manager = 'manager'
    # Staff of one branch (User.branch): only that branch's orders, while the business has branches on.
    branch = 'branch'

    @classmethod
    def choices(cls):
        return (
            (key.value, key.name)
            for key in cls
        )


class LanguageEnum(Enum):
    uz = 'uz'
    ru = 'ru'

    @classmethod
    def choices(cls):
        return (
            (key.value, key.name)
            for key in cls
        )


class OrderEnum(Enum):
    ordered = 'ordered'
    on_the_way = 'on_the_way'
    completed = 'completed'
    rejected = 'rejected'
    new = 'new'

    @classmethod
    def choices(cls):
        return (
            (key.value, key.name)
            for key in cls
        )


class OrderSourceEnum(Enum):
    """Where the order came from."""
    bot = 'bot'          # Telegram bot chat flow
    web = 'web'          # website (browser)
    miniapp = 'miniapp'  # Telegram Mini App
    admin = 'admin'      # created by staff in the dashboard "Sales" section

    @classmethod
    def choices(cls):
        return (
            (key.value, key.name)
            for key in cls
        )


class DeliveryTypeEnum(Enum):
    delivery = 'delivery'
    pickup = 'pickup'

    @classmethod
    def choices(cls):
        return (
            (key.value, key.name)
            for key in cls
        )


class PaymentMethodEnum(Enum):
    cash = 'cash'
    card = 'card'

    @classmethod
    def choices(cls):
        return (
            (key.value, key.name)
            for key in cls
        )


class LoginTokenStatusEnum(Enum):
    pending = 'pending'
    confirmed = 'confirmed'
    used = 'used'

    @classmethod
    def choices(cls):
        return (
            (key.value, key.name)
            for key in cls
        )
