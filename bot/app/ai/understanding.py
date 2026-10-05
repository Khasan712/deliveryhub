"""Voice / text order understanding for the staff bot — the async twin of the backend's voice entry
(apps.voice.understanding), on Google Gemini:

  1. A voice message is transcribed (`GEMINI_TRANSCRIBE_MODEL`, product names passed as custom vocabulary).
  2. The transcript + the current draft + the product catalog go to a Flash model with a JSON schema, which
     returns the complete updated order form (items matched to catalog ids). The request is hedged: if the
     main model is slow or busy, the next model is asked in parallel and the first good answer wins.

Without GEMINI_API_KEY the local rule-based parser (local_parser) handles text.
"""
import asyncio
import json
import logging

from app.config import settings
from app.utils import normalize_phone, parse_price
from .local_parser import FORM_FIELDS, MAX_QUANTITY, local_understand

logger = logging.getLogger('voice')

LANGUAGE_CODES = ['uz-UZ', 'ru-RU']
CHOICES = {
    'delivery_type': ('delivery', 'pickup'),
    'payment_method': ('cash', 'card'),
    'status': ('ordered', 'on_the_way', 'completed'),
}


class VoiceError(Exception):
    def __init__(self, code, message=''):
        super().__init__(message or code)
        self.code = code


def is_configured():
    return bool(settings.gemini_api_key)


def build_catalog(products):
    """`products`: (Product, unit name) pairs."""
    return [
        {
            'id': product.id,
            'uz': product.name_uz,
            'ru': product.name_ru or product.name_uz,
            'price': parse_price(product.price),
            'unit': unit or '',
        }
        for product, unit in products
    ]


def vocabulary(catalog, limit):
    """Product names bias speech recognition towards the words the operator actually uses."""
    terms = []
    for product in catalog:
        for name in (product['uz'], product['ru']):
            if name and name not in terms:
                terms.append(name)
    return terms[:limit]


# ---------------------------------------------------------------------------
# Gemini
# ---------------------------------------------------------------------------

_clients = {}


def get_client():
    from google import genai

    key = settings.gemini_api_key
    if key not in _clients:
        _clients[key] = genai.Client(api_key=key)
    return _clients[key]


def normalize_mime(mime_type):
    mime_type = (mime_type or 'audio/webm').split(';')[0].strip().lower()
    return {'audio/x-m4a': 'audio/m4a', 'audio/mp4': 'audio/m4a', 'audio/x-wav': 'audio/wav',
            'audio/mpeg': 'audio/mp3'}.get(mime_type, mime_type)


async def transcribe(audio, mime_type, catalog):
    from google.genai import types

    try:
        response = await get_client().aio.models.generate_content(
            model=settings.gemini_transcribe_model,
            contents=[types.Part.from_bytes(data=audio, mime_type=normalize_mime(mime_type))],
            config=types.GenerateContentConfig(
                audio_transcription_config=types.AudioTranscriptionConfig(
                    language_codes=LANGUAGE_CODES,
                    custom_vocabulary=vocabulary(catalog, 1000),
                    mode='SMART',
                ),
                automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
                http_options=types.HttpOptions(timeout=30 * 1000),
            ),
        )
    except Exception as exc:
        logger.warning('Gemini transcription failed: %s', exc)
        raise VoiceError('transcription_failed', str(exc)) from None

    # Transcribe models return the transcript in `audio_transcription` parts, not in plain text parts.
    texts = []
    for candidate in response.candidates or []:
        for part in (candidate.content.parts if candidate.content else None) or []:
            if part.audio_transcription and part.audio_transcription.text:
                texts.append(part.audio_transcription.text)
            elif part.text:
                texts.append(part.text)
    return ' '.join(texts).strip()


SYSTEM_PROMPT = """You are the order-entry assistant of a small food delivery business in Uzbekistan.
A staff member (the operator) dictates or types an order in Uzbek (Latin or Cyrillic script), Russian, or a mix of both.
You receive the product CATALOG, the CURRENT order form and the operator's new UTTERANCE (text or an audio recording).
Return the COMPLETE updated order form as JSON.

Rules:
- Start from the CURRENT form and change only what the utterance asks for; keep every other value as it is.
- items: match spoken product names to the CATALOG by meaning, spelling variants, Uzbek or Russian names, singular or plural. Use only catalog ids.
  * A plain mention sets the quantity ("ikkita chizburger" -> 2). "yana" / "ещё" / "qo'sh" adds to the existing quantity.
  * Remove an item on "olib tashla", "o'chir", "kerak emas", "убери", "удали", "не надо".
  * Default quantity is 1. Number words: bir/bitta=1, ikki/ikkita=2, uch/uchta=3, to'rt/to'rtta=4, besh/beshta=5, olti=6, yetti=7, sakkiz=8, to'qqiz=9, o'n=10; один/одна=1, два/две=2, три=3, четыре=4, пять=5.
  * Never invent products. If a product is not in the catalog or it is unclear which one is meant, put the spoken words into "unmatched".
- customer_name: the customer's name if said ("mijoz Aziz", "ismi Aziz", "Aziz akaga", "клиент Азиз", "для Азиза"). Uzbek names in Latin script, capitalized.
- phone: the customer's phone number exactly as said. Convert number words to digits group by group — Uzbek: nol 0, bir 1, ikki 2, uch 3, to'rt 4, besh 5, olti 6, yetti 7, sakkiz 8, to'qqiz 9, o'n 10, yigirma 20, o'ttiz 30, qirq 40, ellik 50, oltmish 60, yetmish 70, sakson 80, to'qson 90, yuz 100 (so "to'qson yetti, yetti yuz o'n bir, nol ikki, sakson sakkiz" is 97 711 02 88); Russian likewise. Format Uzbek numbers as +998 followed by the 9 spoken digits. Never reuse digits that were not said; leave empty if unclear.
- address: the delivery address as said (district, street, house, landmark), Uzbek in Latin script.
- delivery_type: "pickup" for o'zi olib ketadi / olib ketish / zalda / самовывоз / заберёт сам; "delivery" for yetkazib berish / dostavka / доставка or when an address is given.
- payment_method: "cash" for naqd / naqt / наличные; "card" for karta / plastik / click / payme / перевод / карта.
- status: "completed" if the order is already handed over or paid (sotildi, berildi, yakunlandi, выдан, оплачен); "on_the_way" for yo'lda / в пути; "ordered" for a new order that still has to be delivered.
- comment: extra wishes such as "piyozsiz", "achchiq bo'lsin", "без лука", a delivery time.
- Use an empty string for text fields that are unknown.
- If the operator asks to clear everything ("hammasini tozala", "yangidan", "очисти всё"), return an empty form.
- submit: true only if the operator explicitly asks to create / save / confirm the order now (yarat, saqla, tasdiqla, rasmiylashtir, "tayyor, yubor", создай, сохрани, оформи, подтверди).
- reply: one short friendly sentence in the REPLY LANGUAGE about what was understood or changed.
- transcript: when AUDIO is attached, the verbatim transcription of what was said; otherwise repeat the utterance text."""

ORDER_SCHEMA = {
    'type': 'object',
    'properties': {
        'transcript': {'type': 'string'},
        'customer_name': {'type': 'string'},
        'phone': {'type': 'string'},
        'address': {'type': 'string'},
        'delivery_type': {'type': 'string', 'enum': ['', 'delivery', 'pickup']},
        'payment_method': {'type': 'string', 'enum': ['', 'cash', 'card']},
        'status': {'type': 'string', 'enum': ['', 'ordered', 'on_the_way', 'completed']},
        'comment': {'type': 'string'},
        'items': {
            'type': 'array',
            'items': {
                'type': 'object',
                'properties': {
                    'product_id': {'type': 'integer'},
                    'quantity': {'type': 'integer', 'minimum': 1},
                },
                'required': ['product_id', 'quantity'],
            },
        },
        'unmatched': {'type': 'array', 'items': {'type': 'string'}},
        'submit': {'type': 'boolean'},
        'reply': {'type': 'string'},
    },
    'required': [
        'transcript', 'customer_name', 'phone', 'address', 'delivery_type', 'payment_method',
        'status', 'comment', 'items', 'unmatched', 'submit', 'reply',
    ],
}

REPLY_LANGUAGES = {'uz': 'Uzbek (Latin script)', 'ru': 'Russian'}


def _prompt(catalog, state, utterance, lang='uz'):
    catalog_lines = '\n'.join(
        f"{item['id']} | {item['uz']} | {item['ru']} | {item['price']} | {item['unit']}" for item in catalog
    )
    return (
        f'CATALOG (id | uzbek name | russian name | price UZS | unit):\n{catalog_lines}\n\n'
        f'CURRENT FORM:\n{json.dumps(state, ensure_ascii=False)}\n\n'
        f'REPLY LANGUAGE: {REPLY_LANGUAGES.get(lang, REPLY_LANGUAGES["uz"])}\n\n'
        f'UTTERANCE:\n{utterance}'
    )


def is_transient(exc):
    """Overloaded / rate-limited / timed-out calls are worth retrying on another model."""
    if isinstance(exc, (TimeoutError, asyncio.TimeoutError)):
        return True
    message = str(exc).lower()
    return any(marker in message for marker in ('503', 'unavailable', 'overloaded', 'high demand', '429',
                                                 'resource_exhausted', '500', 'internal', 'deadline', 'timed out',
                                                 'timeout'))


def parse_models():
    models = [settings.gemini_parse_model, *settings.gemini_parse_fallback_models]
    return list(dict.fromkeys(model for model in models if model))


async def _generate_json(model, contents, config):
    response = await get_client().aio.models.generate_content(model=model, contents=contents, config=config)
    return json.loads(response.text)


async def understand_with_gemini(catalog, state, text=None, audio=None, mime_type=None, lang='uz'):
    """Hedged request: if the main model is slow or busy, the next model is asked in parallel and the first
    good answer wins (the API is sometimes overloaded for tens of seconds)."""
    from google.genai import types

    utterance = json.dumps(text, ensure_ascii=False) if text else '(AUDIO attached — transcribe it first)'
    contents = [_prompt(catalog, state, utterance, lang)]
    if audio:
        contents.append(types.Part.from_bytes(data=audio, mime_type=normalize_mime(mime_type)))
    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_PROMPT,
        response_mime_type='application/json',
        response_json_schema=ORDER_SCHEMA,
        temperature=0.1,
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        http_options=types.HttpOptions(timeout=(40 if audio else 20) * 1000),
    )

    loop = asyncio.get_running_loop()
    models = parse_models()
    pending, errors = {}, []
    launched = 0
    deadline = loop.time() + (45 if audio else 25)

    def launch_next():
        nonlocal launched
        if launched < len(models):
            task = asyncio.ensure_future(_generate_json(models[launched], contents, config))
            pending[task] = models[launched]
            launched += 1
            return True
        return False

    try:
        launch_next()
        while pending:
            hedge = launched < len(models)
            timeout = settings.gemini_parse_hedge_seconds if hedge else max(deadline - loop.time(), 0.1)
            done, _ = await asyncio.wait(pending, timeout=timeout, return_when=asyncio.FIRST_COMPLETED)
            if not done:
                if hedge:
                    logger.info('Gemini %s is slow, asking %s in parallel', models[launched - 1], models[launched])
                    launch_next()
                    continue
                errors.append(TimeoutError('no model answered in time'))
                break
            for task in done:
                model = pending.pop(task)
                try:
                    return task.result()
                except Exception as exc:
                    logger.warning('Gemini order parsing failed on %s: %s', model, exc)
                    errors.append(exc)
                    if not (is_transient(exc) or isinstance(exc, ValueError)):
                        raise VoiceError('ai_failed', str(exc)) from None  # e.g. invalid key — other models will not help
                    if not pending:
                        launch_next()
        raise VoiceError('ai_failed', str(errors[-1]) if errors else 'no answer')
    finally:
        for task in pending:  # the slower models are not needed any more
            if not task.done():
                task.cancel()
            elif not task.cancelled():
                task.exception()  # finished as well: its result or error is simply dropped


# ---------------------------------------------------------------------------
# public API
# ---------------------------------------------------------------------------

def clean_state(state):
    state = state if isinstance(state, dict) else {}
    items = []
    for item in state.get('items') or []:
        try:
            items.append({'product_id': int(item['product_id']), 'quantity': max(1, int(item['quantity']))})
        except (KeyError, TypeError, ValueError):
            continue
    return {**{field: str(state.get(field) or '')[:300] for field in FORM_FIELDS}, 'items': items}


def sanitize(result, catalog):
    """Never trust model output: keep known product ids, clamp quantities, validate choices."""
    known_ids = {item['id'] for item in catalog}
    items = {}
    for item in result.get('items') or []:
        try:
            product_id, quantity = int(item.get('product_id')), int(item.get('quantity') or 1)
        except (TypeError, ValueError, AttributeError):
            continue
        if product_id in known_ids and quantity > 0:
            items[product_id] = min(items.get(product_id, 0) + quantity, MAX_QUANTITY)

    clean = {field: str(result.get(field) or '').strip()[:300] for field in FORM_FIELDS}
    for field, allowed in CHOICES.items():
        if clean[field] not in allowed:
            clean[field] = ''
    if clean['phone']:
        clean['phone'] = normalize_phone(clean['phone']) or clean['phone']
    return {
        **clean,
        'items': [{'product_id': product_id, 'quantity': quantity} for product_id, quantity in items.items()],
        'unmatched': [str(value)[:100] for value in (result.get('unmatched') or []) if str(value).strip()][:10],
        'submit': bool(result.get('submit')),
        'reply': str(result.get('reply') or '').strip()[:300],
        'transcript': str(result.get('transcript') or '').strip()[:2000],
    }


async def understand(catalog, state, text=None, audio=None, mime_type=None, lang='uz'):
    """Returns (result, engine). Raises VoiceError. With audio, the recording is transcribed first; if the
    transcription fails, one multimodal call transcribes and extracts at once."""
    state = clean_state(state)
    text = (text or '').strip()

    if not is_configured():
        if not text:
            raise VoiceError('not_configured')
        # Up to seconds of plain Python: in a thread, so that the other bots and chats are not held up.
        result = await asyncio.to_thread(local_understand, catalog, state, text)
        return sanitize(result, catalog), 'local'

    if audio and not text:
        try:
            text = await transcribe(audio, mime_type, catalog)
        except VoiceError:
            result = await understand_with_gemini(catalog, state, audio=audio, mime_type=mime_type, lang=lang)
            return sanitize(result, catalog), 'gemini'
        if not text:
            raise VoiceError('empty_transcript')

    result = await understand_with_gemini(catalog, state, text=text, lang=lang)
    result['transcript'] = text
    return sanitize(result, catalog), 'gemini'
