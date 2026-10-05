"""Token encryption shared with the backend, money / phone rules, Bot API helpers."""
import base64
import hashlib
import logging

import pytest
from aiogram.exceptions import TelegramNetworkError, TelegramRetryAfter
from cryptography.fernet import Fernet, InvalidToken

from app import crypto
from app.__main__ import RedactingFormatter
from app.telegram import api
from app.utils import format_money, normalize_phone, parse_price, parse_quantity
from .conftest import SECRET_KEY
from .fakes import ApiFailure, NetworkFailure


def backend_fernet():
    """apps.platform.crypto of the backend."""
    digest = hashlib.sha256(f'hub.bot-tokens:{SECRET_KEY}'.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def test_tokens_are_shared_with_the_backend():
    secret = '123456:ABC-DEF'
    stored = crypto.encrypt(secret)
    assert 'ABC' not in stored
    assert backend_fernet().decrypt(stored.encode()).decode() == secret
    assert crypto.decrypt(backend_fernet().encrypt(secret.encode()).decode()) == secret


def test_another_secret_key_cannot_read_the_tokens(test_settings):
    stored = crypto.encrypt('123456:ABC-DEF')
    test_settings.secret_key = 'changed'
    with pytest.raises(InvalidToken):
        crypto.decrypt(stored)


def test_money_and_phones():
    assert [parse_price(value) for value in ('35 000', '35 000 UZS', '35000.00', '35,000', None, 'free', 12.6)] == [
        35000, 35000, 35000, 35000, 0, 0, 13]
    assert [parse_quantity(value) for value in ('2', '1.0', '2,5', None, 'x')] == [2, 1, 2, 1, 1]
    assert format_money(1234567) == '1 234 567'
    assert [normalize_phone(value) for value in ('90 123 45 67', '+998 (90) 123-45-67', '123')] == [
        '+998901234567', '+998901234567', None]


def test_tokens_never_reach_the_logs():
    record = logging.LogRecord('bots', logging.WARNING, __file__, 1, 'failed: %s', (
        'https://api.telegram.org/bot123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw/getMe',), None)
    assert RedactingFormatter('%(message)s').format(record) == 'failed: https://api.telegram.org/bot<token>/getMe'


async def test_edits_ignore_not_modified_and_answers_never_fail(telegram):
    bot = telegram.bot('2002:TEST-TOKEN-staff-bot-0000000000000')
    telegram.fail('editMessageText', ApiFailure(400, 'Bad Request: message is not modified'))
    await api.edit(bot, 1, 2, 'same')
    telegram.fail('answerCallbackQuery', ApiFailure(400, 'Bad Request: query is too old'))
    await api.answer(bot, 'cb', 'late')
    telegram.fail('deleteMessage', ApiFailure(400, "Bad Request: message can't be deleted"))
    await api.delete(bot, 1, 3)
    assert telegram.methods()[-2:] == ['deleteMessage', 'editMessageReplyMarkup']  # old messages lose the buttons
    telegram.fail('sendMessage', NetworkFailure())
    with pytest.raises(TelegramNetworkError):
        await api.send(bot, 1, 'x')


async def test_flood_control_waits_in_handlers_but_not_in_background_rounds(telegram):
    bot = telegram.bot('2002:TEST-TOKEN-staff-bot-0000000000000')
    flood = ApiFailure(429, 'Too Many Requests: retry after 1', retry_after=1)
    telegram.fail('sendMessage', flood, times=1)
    await api.send(bot, 1, 'x')  # waits a second and repeats
    assert len(telegram.payloads('sendMessage')) == 2

    telegram.fail('sendMessage', flood, times=1)
    with api.no_flood_wait(), pytest.raises(TelegramRetryAfter):
        await api.send(bot, 1, 'x')
    assert len(telegram.payloads('sendMessage')) == 3
