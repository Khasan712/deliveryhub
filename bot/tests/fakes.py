"""A fake Telegram Bot API for the tests: an aiogram session that records every request (with the payload as
it would be sent) and answers like Telegram — or fails like it when a test asks so."""
import asyncio
import json
from collections import defaultdict
from dataclasses import dataclass

from aiogram.client.session.base import BaseSession
from aiogram.client.telegram import TelegramAPIServer
from aiogram.exceptions import TelegramNetworkError
from aiogram.types import Update

from app.telegram.api import BotFactory

API_BASE = 'http://telegram.test'


@dataclass
class Call:
    token: str
    method: str
    payload: dict


@dataclass
class ApiFailure:
    """An error answer of the Bot API (e.g. 403 "Forbidden: bot was blocked by the user")."""
    code: int
    description: str
    retry_after: int | None = None


@dataclass
class NetworkFailure:
    """No answer at all (aiogram raises TelegramNetworkError)."""
    message: str = 'ClientConnectorError: Cannot connect to host api.telegram.org:443'


@dataclass
class BrokenAnswer:
    """An answer that is not the Bot API's JSON, e.g. a proxy's error page (aiogram raises ClientDecodeError)."""
    status: int = 502
    body: str = '<html><body><h1>502 Bad Gateway</h1></body></html>'


class FakeSession(BaseSession):
    def __init__(self, telegram):
        super().__init__(api=TelegramAPIServer.from_base(API_BASE))
        self.telegram = telegram

    async def make_request(self, bot, method, timeout=None):
        files = {}
        payload = {}
        for key, value in method.model_dump(warnings=False).items():
            prepared = self.prepare_value(value, bot=bot, files=files, _dumps_json=False)
            if prepared is not None:
                payload[key] = prepared
        call = Call(bot.token, method.__api_method__, payload)
        self.telegram.calls.append(call)
        for held, gate, when in self.telegram.gates:
            if held == call.method and (when is None or when(call)):
                await gate.wait()
        failure = self.telegram.failure_for(call)
        if isinstance(failure, NetworkFailure):
            raise TelegramNetworkError(method=method, message=failure.message)
        if isinstance(failure, BrokenAnswer):
            self.check_response(bot=bot, method=method, status_code=failure.status, content=failure.body)
        if isinstance(failure, ApiFailure):
            status = failure.code
            content = {'ok': False, 'error_code': failure.code, 'description': failure.description}
            if failure.retry_after:
                content['parameters'] = {'retry_after': failure.retry_after}
        else:
            status, content = 200, {'ok': True, 'result': await self.telegram.result(call)}
        response = self.check_response(bot=bot, method=method, status_code=status, content=json.dumps(content))
        return response.result

    async def stream_content(self, url, headers=None, timeout=30, chunk_size=65536, raise_for_status=True):
        path = url.split('/file/bot', 1)[1].split('/', 1)[1]
        yield self.telegram.paths[path]

    async def close(self):
        pass


class FakeTelegram:
    def __init__(self):
        self.calls = []
        self.next_message_id = 100
        self.paths = {}  # file path -> bytes
        self.files = {}  # file_id -> file path
        self.me = {}  # token -> getMe result
        self.managed_tokens = {}  # managed bot id -> token
        self.updates = defaultdict(list)  # token -> pending updates (dicts)
        self.failures = []  # (method, failure, predicate, remaining)
        self.gates = []  # (method, asyncio.Event, predicate): matching requests wait for the event
        self.session = FakeSession(self)
        self.factory = BotFactory(session=self.session)

    def bot(self, token):
        return self.factory.make(token)

    # --- set up ------------------------------------------------------------

    def add_file(self, file_id, data):
        path = f'voice/{file_id}.oga'
        self.files[file_id] = path
        self.paths[path] = data

    def fail(self, method, failure, when=None, times=None):
        """Makes `method` fail (for calls matching `when(call)`, `times` times or always)."""
        self.failures.append([method, failure, when, times])

    def heal(self, method=None):
        self.failures = [rule for rule in self.failures if method is not None and rule[0] != method]

    def hold(self, method, when=None):
        """Matching `method` calls hang (a slow Telegram) until the returned event is set."""
        gate = asyncio.Event()
        self.gates.append((method, gate, when))
        return gate

    def failure_for(self, call):
        for rule in self.failures:
            method, failure, when, times = rule
            if method == call.method and (when is None or when(call)) and (times is None or times > 0):
                if times is not None:
                    rule[3] -= 1
                return failure
        return None

    async def result(self, call):
        payload = call.payload
        if call.method == 'sendMessage':
            self.next_message_id += 1
            return {'message_id': self.next_message_id, 'date': 1700000000,
                    'chat': {'id': int(payload['chat_id']), 'type': 'private'}, 'text': payload.get('text', '')}
        if call.method == 'getMe':
            bot_id = int(call.token.split(':')[0])
            return self.me.get(call.token) or {'id': bot_id, 'is_bot': True, 'first_name': f'Bot {bot_id}',
                                               'username': f'bot{bot_id}'}
        if call.method == 'getManagedBotToken':
            return self.managed_tokens[payload['user_id']]
        if call.method == 'getFile':
            path = self.files[payload['file_id']]
            return {'file_id': payload['file_id'], 'file_unique_id': payload['file_id'],
                    'file_size': len(self.paths[path]), 'file_path': path}
        if call.method == 'getUpdates':
            return await self.get_updates(call.token, payload)
        return True

    async def get_updates(self, token, payload):
        offset = payload.get('offset')
        queue = self.updates[token]
        if offset is not None:
            queue[:] = [update for update in queue if update['update_id'] >= offset]  # confirmed
        found = queue[:payload.get('limit', 100)]
        if not found and payload.get('timeout'):
            await asyncio.sleep(0.02)  # a (very) short long poll
        return list(found)

    # --- inspection ----------------------------------------------------------

    def payloads(self, method, chat_id=None, token=None):
        return [call.payload for call in self.calls if call.method == method
                and (chat_id is None or str(call.payload.get('chat_id')) == str(chat_id))
                and (token is None or call.token == token)]

    def last(self, method, chat_id=None, token=None):
        found = self.payloads(method, chat_id, token)
        return found[-1] if found else None

    def methods(self, token=None):
        return [call.method for call in self.calls if token is None or call.token == token]

    @staticmethod
    def buttons(payload):
        markup = payload.get('reply_markup') or {}
        return [button.get('callback_data') for row in markup.get('inline_keyboard', []) for button in row]


# ---------------------------------------------------------------------------
# updates
# ---------------------------------------------------------------------------

def user(user_id, first_name='Ali', username='ali', language_code='uz', last_name=None):
    data = {'id': user_id, 'is_bot': False, 'first_name': first_name, 'language_code': language_code}
    if username:
        data['username'] = username
    if last_name:
        data['last_name'] = last_name
    return data


def message(sender_id, text=None, message_id=1, language_code='uz', chat_type='private', sender=None, **extra):
    data = {
        'message_id': message_id, 'date': 1700000000,
        'from': sender or user(sender_id, language_code=language_code),
        'chat': {'id': sender_id, 'type': chat_type},
        **extra,
    }
    if text is not None:
        data['text'] = text
    return Update.model_validate({'update_id': message_id, 'message': data})


def voice(sender_id, message_id, file_id, duration=4, mime_type='audio/ogg', language_code='uz'):
    return message(sender_id, message_id=message_id, language_code=language_code, voice={
        'file_id': file_id, 'file_unique_id': file_id, 'duration': duration, 'mime_type': mime_type,
    })


def callback(sender_id, data, message_id, language_code='uz'):
    return Update.model_validate({'update_id': 1000 + message_id, 'callback_query': {
        'id': f'cb-{message_id}', 'data': data, 'chat_instance': 'chat',
        'from': user(sender_id, language_code=language_code),
        'message': {'message_id': message_id, 'date': 1700000000, 'chat': {'id': sender_id, 'type': 'private'}},
    }})


def managed(owner_id, bot_id, username, language_code='uz', first_name='Aziz'):
    return Update.model_validate({'update_id': bot_id, 'managed_bot': {
        'user': user(owner_id, first_name=first_name, username='aziz', language_code=language_code),
        'bot': {'id': bot_id, 'is_bot': True, 'first_name': username, 'username': username},
    }})


def raw_message(update_id, sender_id, text, language_code='uz'):
    """An update as getUpdates returns it (JSON)."""
    return {'update_id': update_id, 'message': {
        'message_id': update_id, 'date': 1700000000, 'from': user(sender_id, language_code=language_code),
        'chat': {'id': sender_id, 'type': 'private'}, 'text': text,
    }}
