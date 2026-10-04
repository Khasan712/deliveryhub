"""Settings of the test suite (pytest.ini). The database comes from POSTGRES_* (default: the throwaway
PostgreSQL on localhost:55433 described in README.md); nothing reaches Telegram, Gemini, an SMS provider or a
map server."""
import os
import tempfile

for name, value in {'SECRET_KEY': 'test-secret-key', 'POSTGRES_HOST': 'localhost', 'POSTGRES_PORT': '55433',
                    'POSTGRES_PASSWORD': 'test', 'POSTGRES_USER': 'deliveryhub', 'POSTGRES_DB': 'deliveryhub'}.items():
    os.environ.setdefault(name, value)

from .settings import *  # noqa: E402,F401,F403

DEBUG = False
SERVE_MEDIA = True
PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']
CACHES = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
                      'KEY_FUNCTION': 'django_tenants.cache.make_key'}}
MEDIA_ROOT = Path(tempfile.mkdtemp(prefix='deliveryhub-test-media-'))  # noqa: F405
STATIC_ROOT = Path(tempfile.mkdtemp(prefix='deliveryhub-test-static-'))  # noqa: F405
PLATFORM_DOMAIN = 'example.uz'
PLATFORM_HUB_SUBDOMAIN = 'deliveryhub'
PLATFORM_BOT_TOKEN = ''
TELEGRAM_API_URL = 'http://telegram.invalid'
GEOCODER_URL = 'http://geocoder.invalid'
TUNNELS_FILE = None
SMS_BACKEND = 'console'
SHOP_OTP_DEBUG = False
GEMINI_API_KEY = ''
SESSION_COOKIE_SAMESITE = CSRF_COOKIE_SAMESITE = 'Lax'
SESSION_COOKIE_SECURE = CSRF_COOKIE_SECURE = False
LOGGING = {'version': 1, 'disable_existing_loggers': False}
