"""Bot API helpers shared by every bot: HTML messages without link previews, edits that ignore "message is not
modified", callback answers and button removals that never fail the caller, voice downloads, error
classification, flood control, and the factory of Bot objects (one HTTP session for all of them)."""
import asyncio
import logging
import re
from contextlib import contextmanager
from contextvars import ContextVar

import aiohttp
from aiogram import Bot
from aiogram.client.session.aiohttp import AiohttpSession
from aiogram.client.session.middlewares.base import BaseRequestMiddleware
from aiogram.client.telegram import TelegramAPIServer
from aiogram.exceptions import (
    ClientDecodeError, TelegramAPIError, TelegramBadRequest, TelegramForbiddenError, TelegramNetworkError,
    TelegramRetryAfter, TelegramServerError, TelegramUnauthorizedError,
)
from aiogram.types import InlineKeyboardMarkup, LinkPreviewOptions, ReplyParameters

from app.config import settings

logger = logging.getLogger('bots')

PARSE_MODE = 'HTML'
REQUEST_TIMEOUT = 20
MAX_RETRY_AFTER = 30
# How long a bot's background rounds pause after Telegram did not answer or failed (flood control names its own).
BACKOFF_SECONDS = 10
TOKEN_RE = re.compile(r'\d{3,}:[A-Za-z0-9_-]{20,}')
# What a Bot API call may raise: Telegram's error answer, no answer at all, or an answer that is not the Bot API's
# JSON (e.g. the HTML error page of a proxy — aiogram's ClientDecodeError is not a TelegramAPIError).
ERRORS = (TelegramAPIError, ClientDecodeError)


class DownloadError(Exception):
    """A voice message could not be fetched: missing, too large or a network problem."""


class Backoff(Exception):
    """Telegram is unreachable, failing or asked to slow down. A background round (staff cards, customer messages)
    stops at once and the bot is left alone for `delay` seconds — instead of every remaining message waiting for
    its own timeout or flood wait."""

    def __init__(self, error):
        super().__init__(describe(error))
        self.delay = error.retry_after if isinstance(error, TelegramRetryAfter) else BACKOFF_SECONDS


def hide_tokens(text):
    """Request errors may contain URLs, and Bot API URLs contain the token."""
    return TOKEN_RE.sub('<token>', str(text))


def describe(exc):
    """A short description of an error, safe for logs and the database."""
    if isinstance(exc, ClientDecodeError):  # its str() carries the whole answer (an HTML page)
        return f'{exc.message}: {type(exc.original).__name__}'
    return hide_tokens(exc.message if isinstance(exc, TelegramAPIError) else exc)


def is_blocked(exc):
    """The person blocked the bot (or deleted the account): nothing can be delivered to them."""
    return isinstance(exc, TelegramForbiddenError)


def is_network(exc):
    """No answer from the Bot API (as opposed to an answer with an error code)."""
    return isinstance(exc, TelegramNetworkError)


def is_retryable(exc):
    """Trouble on Telegram's side — no answer, 5xx, an unreadable answer, flood control — or a bot token that does
    not work (401): the request may work later, and the rest of a round would fail the same way (unlike "blocked",
    "chat not found", "message is not modified")."""
    return isinstance(exc, (TelegramNetworkError, TelegramServerError, TelegramRetryAfter, ClientDecodeError,
                            TelegramUnauthorizedError))


def is_not_modified(exc):
    return isinstance(exc, TelegramBadRequest) and 'message is not modified' in exc.message


def no_buttons():
    return InlineKeyboardMarkup(inline_keyboard=[])


async def send(bot: Bot, chat_id, text, markup=None, reply_to=None):
    return await bot.send_message(
        chat_id=chat_id, text=text, parse_mode=PARSE_MODE,
        link_preview_options=LinkPreviewOptions(is_disabled=True), reply_markup=markup,
        reply_parameters=ReplyParameters(message_id=reply_to, allow_sending_without_reply=True) if reply_to else None,
    )


async def edit(bot: Bot, chat_id, message_id, text, markup=None):
    """Replaces the text and the buttons (no buttons when `markup` is None)."""
    try:
        await bot.edit_message_text(
            text=text, chat_id=chat_id, message_id=message_id, parse_mode=PARSE_MODE,
            link_preview_options=LinkPreviewOptions(is_disabled=True), reply_markup=markup or no_buttons(),
        )
    except TelegramBadRequest as exc:
        if not is_not_modified(exc):
            raise


async def clear_buttons(bot: Bot, chat_id, message_id):
    try:
        await bot.edit_message_reply_markup(chat_id=chat_id, message_id=message_id, reply_markup=no_buttons())
    except ERRORS:
        pass


async def delete(bot: Bot, chat_id, message_id):
    """Messages older than 48 hours cannot be deleted: their buttons are removed instead."""
    try:
        await bot.delete_message(chat_id=chat_id, message_id=message_id)
    except ERRORS:
        await clear_buttons(bot, chat_id, message_id)


async def answer(bot: Bot, callback_id, text=None, alert=False):
    try:
        await bot.answer_callback_query(callback_query_id=callback_id, text=text or '', show_alert=alert)
    except ERRORS:
        pass  # the query may be older than 15 minutes


async def download(bot: Bot, file_id, max_bytes) -> bytes:
    try:
        info = await bot.get_file(file_id)
    except ERRORS as exc:
        raise DownloadError(describe(exc)) from None
    if not info.file_path or (info.file_size or 0) > max_bytes:
        raise DownloadError('file is missing or too large')
    try:
        content = await bot.download_file(info.file_path, timeout=30)
    except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
        raise DownloadError(hide_tokens(exc)) from None
    data = content.read()
    if len(data) > max_bytes:
        raise DownloadError('file is too large')
    return data


_flood_wait = ContextVar('flood_wait', default=True)


@contextmanager
def no_flood_wait():
    """Inside: flood control raises TelegramRetryAfter at once. Background rounds hold row locks and serve many
    chats — they stop (Backoff) and come back later instead of sleeping."""
    token = _flood_wait.set(False)
    try:
        yield
    finally:
        _flood_wait.reset(token)


class RetryAfterMiddleware(BaseRequestMiddleware):
    """Flood control: when Telegram asks to wait a little, wait once and repeat the request (not in no_flood_wait)."""

    async def __call__(self, make_request, bot, method):
        try:
            return await make_request(bot, method)
        except TelegramRetryAfter as exc:
            if exc.retry_after > MAX_RETRY_AFTER or not _flood_wait.get():
                raise
            await asyncio.sleep(exc.retry_after)
            return await make_request(bot, method)


class BotFactory:
    """Makes Bot objects for tokens. They share one HTTP session (TELEGRAM_API_URL), which is closed once,
    by `close()` — never through a single bot."""

    def __init__(self, session=None):
        if session is None:
            # No connection limit: every polled bot keeps a long poll open.
            session = AiohttpSession(api=TelegramAPIServer.from_base(settings.telegram_api_url), limit=0,
                                     timeout=REQUEST_TIMEOUT)
        session.middleware(RetryAfterMiddleware())
        self.session = session

    def make(self, token) -> Bot:
        return Bot(token=token, session=self.session)

    async def close(self):
        await self.session.close()
