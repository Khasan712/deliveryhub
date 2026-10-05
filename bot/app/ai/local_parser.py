"""Local order parser, used when there is no Gemini API key: good enough for clear, structured dictation.
The same rules as the backend's voice entry (apps.voice.understanding.local_understand)."""
import re
from difflib import SequenceMatcher

from app.utils import normalize_phone

MAX_QUANTITY = 99
# Only the beginning of a text is analysed: matching costs grow with its length, and an order is never that long.
MAX_TEXT = 500
# How similar a window of the text must be to a product name.
MATCH = 0.84
FORM_FIELDS = ('customer_name', 'phone', 'address', 'delivery_type', 'payment_method', 'status', 'comment')

NUMBER_WORDS = {
    'bir': 1, 'bitta': 1, 'ikki': 2, 'ikkita': 2, 'uch': 3, 'uchta': 3, "to'rt": 4, "to'rtta": 4,
    'besh': 5, 'beshta': 5, 'olti': 6, 'oltita': 6, 'yetti': 7, 'yettita': 7, 'sakkiz': 8, 'sakkizta': 8,
    "to'qqiz": 9, "to'qqizta": 9, "o'n": 10, "o'nta": 10,
    'один': 1, 'одна': 1, 'одну': 1, 'одно': 1, 'два': 2, 'две': 2, 'три': 3, 'четыре': 4, 'пять': 5,
    'шесть': 6, 'семь': 7, 'восемь': 8, 'девять': 9, 'десять': 10,
}
ADD_WORDS = {'yana', 'ещё', 'еще', 'plus'}
REMOVE_PHRASES = ('olib tashla', "o'chir", 'kerak emas', 'kerakmas', 'убери', 'удали', 'не надо', 'убрать')
SUBMIT_PHRASES = ('yarat', 'saqla', 'tasdiqla', 'rasmiylashtir', 'создай', 'сохрани', 'оформи', 'подтверди')
CLEAR_PHRASES = ('hammasini tozala', 'hammasini o\'chir', 'yangidan', 'очисти', 'сбрось')
PICKUP_PHRASES = ('olib ketadi', 'olib ketish', "o'zi oladi", 'zalda', 'самовывоз', 'заберет', 'заберёт')
DELIVERY_PHRASES = ('yetkazib', 'dostavka', 'доставк')
CASH_PHRASES = ('naqd', 'naqt', 'наличн')
CARD_PHRASES = ('karta', 'plastik', 'click', 'payme', 'карт', 'перевод')
COMPLETED_PHRASES = ('sotildi', 'berildi', 'yakunlandi', 'topshirildi', 'выдан', 'оплачен')
ON_THE_WAY_PHRASES = ("yo'lda", 'в пути')
FIELD_STOP = (
    r"(?=,|\.|;|\s+(?:telefon|tel|raqam|nomer|mijoz|ismi|manzil|izoh|naqd|naqt|karta|plastik|yetkazib|olib|"
    r"телефон|номер|клиент|имя|адрес|комментарий|наличн|карт|доставк|самовывоз)\b|$)"
)
COUNTER_WORDS = ('ta', 'dona', 'shtuk', 'штуки', 'штук', 'шт')


def _normalize(text):
    text = str(text or '').lower()
    text = re.sub(r"[ʻʼ’‘`´]", "'", text)
    return re.sub(r'\s+', ' ', text).strip()


def _tokens(text):
    return re.findall(r"[\w']+", text)


def _as_number(token):
    token = token.strip("'")
    if token in NUMBER_WORDS:
        return NUMBER_WORDS[token]
    match = re.fullmatch(r'x?(\d{1,2})(?:ta|x|шт)?', token)
    return int(match.group(1)) if match else None


def _number_before(tokens, start):
    """"ikkita chizburger", "2 ta chizburger" -> (quantity, token indexes)"""
    if start >= 1 and _as_number(tokens[start - 1]):
        return _as_number(tokens[start - 1]), {start - 1}
    if start >= 2 and tokens[start - 1] in COUNTER_WORDS and _as_number(tokens[start - 2]):
        return _as_number(tokens[start - 2]), {start - 2, start - 1}
    return None


def _number_after(tokens, end):
    """"chizburger 2 ta", "chizburger x2", "чизбургер две штуки" -> (quantity, token indexes)"""
    if end < len(tokens) and _as_number(tokens[end]):
        indexes = {end}
        if end + 1 < len(tokens) and tokens[end + 1] in COUNTER_WORDS:
            indexes.add(end + 1)
        return _as_number(tokens[end]), indexes
    return None


def _assign_quantities(tokens, matches):
    """A number between two products could belong to either one, so follow the operator's style
    ("2 ta burger" vs "burger 2 ta") and never use the same number twice."""
    before = [_number_before(tokens, start) for start, _end, *_ in matches]
    after = [_number_after(tokens, end) for _start, end, *_ in matches]
    prefer_after = sum(1 for value in after if value) > sum(1 for value in before if value)

    quantities, used = [], set()
    for index in range(len(matches)):
        options = (after[index], before[index]) if prefer_after else (before[index], after[index])
        quantity = None
        for option in options:
            if option and not option[1] & used:
                quantity = option[0]
                used |= option[1]
                break
        quantities.append(quantity)
    return quantities


def _similarity(matcher, window):
    """The matcher's ratio() for `window` against its name — or 0 when even the cheap upper bounds of ratio() stay
    below MATCH, as they do for most windows (so the result is the same, only faster)."""
    matcher.set_seq1(window)
    if matcher.real_quick_ratio() < MATCH or matcher.quick_ratio() < MATCH:
        return 0
    return matcher.ratio()


def _find_products(text, catalog):
    tokens = _tokens(text)
    candidates = []
    for product in catalog:
        for name in {_normalize(product['uz']), _normalize(product['ru'])}:
            name_tokens = _tokens(name)
            if not name_tokens:
                continue
            matcher = SequenceMatcher(None, '', name)  # the name is indexed once, the windows come as seq1
            for size in {len(name_tokens), len(name_tokens) + 1}:
                for start in range(0, max(len(tokens) - size + 1, 0)):
                    window = ' '.join(tokens[start:start + size])
                    # Allow Uzbek plural/case endings: "chizburgerlar", "chizburgerni"
                    window_stem = re.sub(r"(lar|ni|ga|dan|ы|и|а|ов)$", '', window)
                    score = max(_similarity(matcher, window), _similarity(matcher, window_stem))
                    if score >= MATCH:
                        candidates.append((score, start, start + size, product['id']))

    matches, used = [], set()
    for score, start, end, product_id in sorted(candidates, key=lambda c: (-c[0], c[1])):
        span = set(range(start, end))
        if span & used or any(match[3] == product_id for match in matches):
            continue
        used |= span
        matches.append((start, end, score, product_id))
    return tokens, sorted(matches)


def _match_phrase(text, phrases):
    return any(phrase in text for phrase in phrases)


def local_understand(catalog, state, text):
    """Plain Python that may take a while for a long text and a big catalog: run it in a thread (asyncio.to_thread),
    not on the event loop. Only the first MAX_TEXT characters are analysed; the transcript keeps the whole text."""
    transcript = str(text or '').strip()
    raw = transcript[:MAX_TEXT]
    norm = _normalize(raw)
    result = {field: state.get(field, '') or '' for field in FORM_FIELDS}
    items = {int(item['product_id']): int(item['quantity']) for item in state.get('items', [])}

    if _match_phrase(norm, CLEAR_PHRASES):
        return {**{field: '' for field in FORM_FIELDS}, 'items': [], 'unmatched': [], 'submit': False,
                'transcript': transcript, 'reply': ''}

    tokens, matches = _find_products(norm, catalog)
    for (start, end, _score, product_id), quantity in zip(matches, _assign_quantities(tokens, matches)):
        context = ' '.join(tokens[max(start - 3, 0):min(end + 3, len(tokens))])
        if _match_phrase(context, REMOVE_PHRASES):
            items.pop(product_id, None)
            continue
        adding = any(word in tokens[max(start - 3, 0):start] for word in ADD_WORDS)
        items[product_id] = min((items.get(product_id, 0) if adding else 0) + (quantity or 1), MAX_QUANTITY)

    phone_match = re.search(r'(\+?\d[\d\s\-()]{7,}\d)', raw)
    if phone_match:
        phone = normalize_phone(phone_match.group(1))
        if phone:
            result['phone'] = phone

    name_match = re.search(
        r"(?:mijoz(?:ning)?(?:\s+ismi)?|ismi|клиент(?:а)?|имя|для)\s*[:\-]?\s*([A-Za-zА-Яа-яЁё'ʻ’]{2,})", raw, re.I
    ) or re.search(r"\b([A-Za-z'ʻ’]{2,})\s+(?:akaga|opaga|akaning|opaning)\b", raw, re.I)
    if name_match:
        result['customer_name'] = name_match.group(1).strip("'").capitalize()

    address_match = re.search(r'(?:manzil(?:i)?|адрес)\s*[:\-]?\s*(.+?)' + FIELD_STOP, raw, re.I)
    if address_match and address_match.group(1).strip():
        result['address'] = address_match.group(1).strip(' ,.')
        result['delivery_type'] = 'delivery'

    comment_match = re.search(r'(?:izoh|комментарий|примечание)\s*[:\-]?\s*(.+?)' + FIELD_STOP, raw, re.I)
    if comment_match and comment_match.group(1).strip():
        result['comment'] = comment_match.group(1).strip(' ,.')

    if _match_phrase(norm, PICKUP_PHRASES):
        result['delivery_type'] = 'pickup'
    elif _match_phrase(norm, DELIVERY_PHRASES):
        result['delivery_type'] = 'delivery'
    if _match_phrase(norm, CASH_PHRASES):
        result['payment_method'] = 'cash'
    elif _match_phrase(norm, CARD_PHRASES):
        result['payment_method'] = 'card'
    if _match_phrase(norm, COMPLETED_PHRASES):
        result['status'] = 'completed'
    elif _match_phrase(norm, ON_THE_WAY_PHRASES):
        result['status'] = 'on_the_way'

    return {
        **result,
        'items': [{'product_id': product_id, 'quantity': quantity} for product_id, quantity in items.items()],
        'unmatched': [],
        'submit': _match_phrase(norm, SUBMIT_PHRASES),
        'transcript': transcript,
        'reply': '',
    }
