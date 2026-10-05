"""Order understanding: the local parser and the (mocked) Gemini pipeline — transcription, hedged parsing."""
import asyncio
import json
import threading
from types import SimpleNamespace

import pytest

from app.ai import understanding
from app.ai.local_parser import MAX_TEXT, local_understand
from app.ai.understanding import VoiceError, clean_state, sanitize, understand

CATALOG = [
    {'id': 1, 'uz': 'Chizburger', 'ru': 'Чизбургер', 'price': 35000, 'unit': 'dona'},
    {'id': 2, 'uz': 'Kola', 'ru': 'Кола', 'price': 12000, 'unit': 'dona'},
    {'id': 3, 'uz': 'Lavash', 'ru': 'Лаваш', 'price': 30000, 'unit': 'dona'},
]


def parse(text, state=None):
    return sanitize(local_understand(CATALOG, clean_state(state or {}), text), CATALOG)


def test_local_parser_reads_a_whole_order():
    result = parse('Ikkita chizburger, bitta kola. Mijoz Aziz, 90 123 45 67, manzil Chilonzor 9, naqd')
    assert result['items'] == [{'product_id': 1, 'quantity': 2}, {'product_id': 2, 'quantity': 1}]
    assert (result['customer_name'], result['phone'], result['address'], result['delivery_type'],
            result['payment_method'], result['submit']) == ('Aziz', '+998901234567', 'Chilonzor 9', 'delivery', 'cash',
                                                            False)


def test_local_parser_changes_the_current_draft():
    draft = {'items': [{'product_id': 1, 'quantity': 2}, {'product_id': 2, 'quantity': 1}], 'customer_name': 'Aziz'}
    assert parse('kolani olib tashla', draft)['items'] == [{'product_id': 1, 'quantity': 2}]
    assert parse('yana bitta kola', draft)['items'] == [{'product_id': 1, 'quantity': 2}, {'product_id': 2, 'quantity': 2}]
    assert parse('kolani olib tashla', draft)['customer_name'] == 'Aziz'
    cleared = parse('hammasini tozala', draft)
    assert (cleared['items'], cleared['customer_name']) == ([], '')


def test_local_parser_in_russian():
    result = parse('два чизбургера, самовывоз, карта, подтверди')
    assert result['items'] == [{'product_id': 1, 'quantity': 2}]
    assert (result['delivery_type'], result['payment_method'], result['submit']) == ('pickup', 'card', True)
    assert parse('lavash x3 izoh: piyozsiz')['comment'] == 'piyozsiz'


def test_model_output_is_never_trusted():
    result = sanitize({
        'items': [{'product_id': 1, 'quantity': 500}, {'product_id': 99, 'quantity': 1}, {'product_id': 'x'},
                  {'product_id': 2, 'quantity': -1}, {'product_id': 3, 'quantity': 0}],
        'delivery_type': 'teleport', 'payment_method': 'card', 'phone': '90 123 45 67', 'unmatched': ['', 'pizza'],
        'submit': 1, 'transcript': ' ok ',
    }, CATALOG)
    assert result['items'] == [{'product_id': 1, 'quantity': 99}, {'product_id': 3, 'quantity': 1}]  # 0 means 1
    assert (result['delivery_type'], result['payment_method'], result['phone']) == ('', 'card', '+998901234567')
    assert (result['unmatched'], result['submit'], result['transcript']) == (['pizza'], True, 'ok')


async def test_without_a_key_text_goes_to_the_local_parser_and_voice_is_refused():
    result, engine = await understand(CATALOG, {}, text='2 ta chizburger')
    assert (engine, result['items']) == ('local', [{'product_id': 1, 'quantity': 2}])
    with pytest.raises(VoiceError) as raised:
        await understand(CATALOG, {}, audio=b'OggS', mime_type='audio/ogg')
    assert raised.value.code == 'not_configured'


async def test_the_local_parser_runs_off_the_event_loop(monkeypatch):
    threads = []

    def parser(catalog, state, text):
        threads.append(threading.current_thread())
        return local_understand(catalog, state, text)

    monkeypatch.setattr(understanding, 'local_understand', parser)
    result, _ = await understand(CATALOG, {}, text='bitta kola')
    assert result['items'] == [{'product_id': 2, 'quantity': 1}]
    assert threads and threads[0] is not threading.main_thread()


def test_the_local_parser_reads_the_beginning_of_a_long_text():
    text = 'ikkita chizburger, ' + 'piyozsiz bo‘lsin ' * 40 + 'bitta kola'
    result = parse(text)
    assert len(text) > MAX_TEXT and result['items'] == [{'product_id': 1, 'quantity': 2}]  # the kola is too far
    assert result['transcript'] == text


# ---------------------------------------------------------------------------
# Gemini (mocked client)
# ---------------------------------------------------------------------------

def answer(**fields):
    result = {'transcript': '', 'customer_name': '', 'phone': '', 'address': '', 'delivery_type': '',
              'payment_method': '', 'status': '', 'comment': '', 'items': [], 'unmatched': [], 'submit': False,
              'reply': ''}
    result.update(fields)
    return SimpleNamespace(text=json.dumps(result))


def transcription(text):
    part = SimpleNamespace(audio_transcription=SimpleNamespace(text=text), text=None)
    return SimpleNamespace(candidates=[SimpleNamespace(content=SimpleNamespace(parts=[part]))])


class FakeGemini:
    """client.aio.models.generate_content: `models` maps a model name to an async callable."""

    def __init__(self, **models):
        self.models = models
        self.calls = []
        self.cancelled = []
        self.aio = SimpleNamespace(models=self)

    async def generate_content(self, *, model, contents, config):
        self.calls.append(SimpleNamespace(model=model, contents=contents, config=config))
        try:
            return await self.models[model](contents, config)
        except asyncio.CancelledError:
            self.cancelled.append(model)
            raise


@pytest.fixture
def gemini(monkeypatch, test_settings):
    test_settings.gemini_api_key = 'test-key'
    test_settings.gemini_parse_model = 'main'
    test_settings.gemini_parse_fallback_models = ['backup']
    test_settings.gemini_transcribe_model = 'ears'
    test_settings.gemini_parse_hedge_seconds = 0.05

    def install(**models):
        fake = FakeGemini(**models)
        monkeypatch.setattr(understanding, 'get_client', lambda: fake)
        return fake

    return install


def returns(response, delay=0):
    async def model(contents, config):
        await asyncio.sleep(delay)
        return response
    return model


def raises(error):
    async def model(contents, config):
        raise error
    return model


async def test_text_is_parsed_with_the_json_schema(gemini):
    fake = gemini(main=returns(answer(items=[{'product_id': 2, 'quantity': 3}, {'product_id': 77, 'quantity': 1}],
                                      customer_name='Aziz', submit=True)))
    result, engine = await understand(CATALOG, {'items': [{'product_id': 1, 'quantity': 1}]}, text='uchta kola',
                                      lang='ru')
    assert engine == 'gemini'
    assert (result['items'], result['customer_name'], result['submit'], result['transcript']) == (
        [{'product_id': 2, 'quantity': 3}], 'Aziz', True, 'uchta kola')
    [call] = fake.calls
    prompt = call.contents[0]
    assert '2 | Kola | Кола | 12000 | dona' in prompt and 'REPLY LANGUAGE: Russian' in prompt
    assert '"product_id": 1' in prompt and 'UTTERANCE:\n"uchta kola"' in prompt
    assert call.config.response_json_schema == understanding.ORDER_SCHEMA
    assert call.config.response_mime_type == 'application/json'


async def test_a_slow_model_is_hedged_by_the_next_one(gemini):
    fake = gemini(main=returns(answer(customer_name='Slow'), delay=5), backup=returns(answer(customer_name='Fast')))
    result, _ = await understand(CATALOG, {}, text='kola')
    assert result['customer_name'] == 'Fast'
    assert [call.model for call in fake.calls] == ['main', 'backup']
    await asyncio.sleep(0)
    assert fake.cancelled == ['main']  # the slow request is not left running


async def test_a_busy_model_falls_back_at_once(gemini):
    fake = gemini(main=raises(RuntimeError('503 UNAVAILABLE: high demand')), backup=returns(answer(comment='ok')))
    result, _ = await understand(CATALOG, {}, text='kola')
    assert result['comment'] == 'ok'
    assert [call.model for call in fake.calls] == ['main', 'backup']


async def test_a_hard_error_is_not_retried_and_all_failures_are_reported(gemini):
    fake = gemini(main=raises(RuntimeError('400 API key not valid')), backup=returns(answer()))
    with pytest.raises(VoiceError) as raised:
        await understand(CATALOG, {}, text='kola')
    assert raised.value.code == 'ai_failed' and [call.model for call in fake.calls] == ['main']

    gemini(main=raises(RuntimeError('429 RESOURCE_EXHAUSTED')), backup=returns(SimpleNamespace(text='not json')))
    with pytest.raises(VoiceError) as raised:
        await understand(CATALOG, {}, text='kola')
    assert raised.value.code == 'ai_failed'


async def test_voice_is_transcribed_then_parsed(gemini):
    async def ears(contents, config):
        assert contents[0].inline_data.mime_type == 'audio/ogg'
        assert config.audio_transcription_config.custom_vocabulary[:2] == ['Chizburger', 'Чизбургер']
        return transcription('ikkita chizburger')

    fake = gemini(ears=ears, main=returns(answer(items=[{'product_id': 1, 'quantity': 2}])))
    result, engine = await understand(CATALOG, {}, audio=b'OggS', mime_type='audio/ogg; codecs=opus')
    assert (engine, result['transcript'], result['items']) == ('gemini', 'ikkita chizburger',
                                                               [{'product_id': 1, 'quantity': 2}])
    assert [call.model for call in fake.calls] == ['ears', 'main']
    assert 'UTTERANCE:\n"ikkita chizburger"' in fake.calls[1].contents[0]


async def test_failed_transcription_falls_back_to_one_multimodal_call(gemini):
    fake = gemini(ears=raises(RuntimeError('model not found')),
                  main=returns(answer(transcript='bitta kola', items=[{'product_id': 2, 'quantity': 1}])))
    result, _ = await understand(CATALOG, {}, audio=b'OggS', mime_type='audio/ogg')
    assert (result['transcript'], result['items']) == ('bitta kola', [{'product_id': 2, 'quantity': 1}])
    parse_call = fake.calls[1]
    assert 'AUDIO attached' in parse_call.contents[0] and parse_call.contents[1].inline_data.data == b'OggS'


async def test_an_empty_transcript(gemini):
    gemini(ears=returns(transcription('  ')))
    with pytest.raises(VoiceError) as raised:
        await understand(CATALOG, {}, audio=b'OggS', mime_type='audio/ogg')
    assert raised.value.code == 'empty_transcript'
