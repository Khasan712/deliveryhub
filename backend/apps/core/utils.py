import re
from datetime import datetime, time, timedelta
from decimal import Decimal

from django.utils import timezone


def parse_price(value):
    """Parse a price stored as text ("35 000", "35 000 UZS", "35000.00", "35,000") into an int."""
    if value is None:
        return 0
    if isinstance(value, (int, float, Decimal)):
        return int(round(value))

    match = re.search(r'\d[\d\s.,]*', str(value).replace('\xa0', ' '))
    if not match:
        return 0
    number = re.sub(r'\s', '', match.group()).rstrip('.,')

    # A trailing separator followed by 1-2 digits is a decimal part; any other separator groups thousands.
    decimal_part = re.search(r'[.,](\d{1,2})$', number)
    if decimal_part:
        integer_part = re.sub(r'[.,]', '', number[:decimal_part.start()])
        return int(round(float(f'{integer_part or 0}.{decimal_part.group(1)}')))
    return int(re.sub(r'[.,]', '', number) or 0)


def created_on(day, until=None):
    """Filter kwargs for rows created on a local calendar day (or from `day` through `until`). A range on the
    column itself, unlike `created_at__date`, can use the index on created_at."""
    def start(value):
        return timezone.make_aware(datetime.combine(value, time.min))
    return {'created_at__gte': start(day), 'created_at__lt': start((until or day) + timedelta(days=1))}


def parse_quantity(value, default=1):
    """Order item quantities are stored as text; bot and dashboard expect whole numbers."""
    try:
        return int(float(str(value).replace(',', '.')))
    except (TypeError, ValueError):
        return default


def format_money(amount):
    """35000 -> '35 000'"""
    return f"{int(amount):,}".replace(",", " ")


def normalize_phone(value):
    """Return a phone number as '+998XXXXXXXXX' (or '+<digits>' for other countries), or None if invalid."""
    digits = re.sub(r'\D', '', str(value or ''))
    if len(digits) == 9:
        digits = '998' + digits
    if 10 <= len(digits) <= 15:
        return '+' + digits
    return None


def extract_price(price_text):
    # Remove non-numeric characters except space and dot
    cleaned_price = re.sub(r"[^\d.]", " ", price_text)

    # Remove extra spaces and keep only numbers with optional decimal points
    match = re.search(r"[\d\s]+(?:\.\d+)?", cleaned_price)

    numeric_str = match.group().replace(" ", "")
    return float(numeric_str)


def format_price(price):
    return f"{price:,}".replace(",", " ")
