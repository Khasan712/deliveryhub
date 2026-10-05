"""DeliveryHub backend: the API of the platform (our panel), of every business's admin panel and of every
business's shop. Settings come from the environment (see ../.env.example)."""
import os
from pathlib import Path

import dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
dotenv.load_dotenv(BASE_DIR.parent / '.env')


def env(name, default=''):
    return os.getenv(name, default)


def env_bool(name, default=False):
    return env(name, str(default)).lower() in ('1', 'true', 'yes')


def env_list(name, default=''):
    return [value.strip() for value in env(name, default).split(',') if value.strip()]


SECRET_KEY = env('SECRET_KEY')
DEBUG = env_bool('DEBUG')
ALLOWED_HOSTS = ['*']  # every request is matched to a business by its host (apps.platform.middleware)

# ---------------------------------------------------------------------------
# Applications. django-tenants: SHARED_APPS live in the public schema (the platform), TENANT_APPS in the
# schema of every business. apps.core is in both: its public user table holds our platform staff.
# ---------------------------------------------------------------------------
SHARED_APPS = [
    'django_tenants',
    'apps.platform',
    'django.contrib.contenttypes',
    'django.contrib.auth',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.admin',
    'django.contrib.staticfiles',
    'rest_framework',
    'drf_spectacular',
    'apps.core',
    'apps.voice',
]
TENANT_APPS = [
    'django.contrib.contenttypes',
    'django.contrib.auth',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.admin',
    'apps.core',
    'apps.telegram',
]
INSTALLED_APPS = SHARED_APPS + [app for app in TENANT_APPS if app not in SHARED_APPS]

TENANT_MODEL = 'hub.Business'
TENANT_DOMAIN_MODEL = 'hub.Domain'
DATABASE_ROUTERS = ('django_tenants.routers.TenantSyncRouter',)
# `SET search_path` only when the schema changes (once per request), not before every query: half the round
# trips to the database. Safe here: requests run in autocommit and a full rollback makes django-tenants set it
# again.
TENANT_LIMIT_SET_CALLS = True

MIDDLEWARE = [
    'apps.platform.middleware.BusinessMiddleware',
    'django.middleware.security.SecurityMiddleware',
    # An unchanged answer is a 304 without a body (ETag): menus and order lists cost nothing on mobile data.
    'django.middleware.http.ConditionalGetMiddleware',
    'apps.platform.middleware.RevalidateApiMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

# Which API a host gets: <slug>.<domain> → shop, <slug>-admin.<domain> → admin panel, our domain → platform.
ROOT_URLCONF = 'config.urls.admin'
SHOP_URLCONF = 'config.urls.shop'
PUBLIC_SCHEMA_URLCONF = 'config.urls.platform'

TEMPLATES = [{
    'BACKEND': 'django.template.backends.django.DjangoTemplates',
    'DIRS': [],
    'APP_DIRS': True,
    'OPTIONS': {'context_processors': [
        'django.template.context_processors.request',
        'django.contrib.auth.context_processors.auth',
        'django.contrib.messages.context_processors.messages',
    ]},
}]

WSGI_APPLICATION = 'config.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django_tenants.postgresql_backend',
        'NAME': env('POSTGRES_DB', 'deliveryhub'),
        'USER': env('POSTGRES_USER', 'deliveryhub'),
        'PASSWORD': env('POSTGRES_PASSWORD'),
        'HOST': env('POSTGRES_HOST', 'db'),
        'PORT': env('POSTGRES_PORT', '5432'),
        'CONN_MAX_AGE': 60,
        'CONN_HEALTH_CHECKS': True,
    }
}

AUTH_USER_MODEL = 'app.User'
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
]

LANGUAGE_CODE = 'ru'
TIME_ZONE = 'Asia/Tashkent'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
MEDIA_URL = '/media/'
MEDIA_ROOT = Path(env('MEDIA_ROOT', str(BASE_DIR / 'media')))
# Development: Django serves /media/ itself (in production the web container does).
SERVE_MEDIA = env_bool('SERVE_MEDIA', DEBUG)
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
DATA_UPLOAD_MAX_MEMORY_SIZE = 1024 * 1024 * 20

# Cache keys and uploaded files are kept apart per business (media/<schema>/...). Redis (REDIS_URL) shares
# rate limits and cached lookups between all workers; without it every process has its own memory cache.
CACHES = {
    'default': {
        'BACKEND': ('django.core.cache.backends.redis.RedisCache' if env('REDIS_URL')
                    else 'django.core.cache.backends.locmem.LocMemCache'),
        'LOCATION': env('REDIS_URL'),
        'KEY_FUNCTION': 'django_tenants.cache.make_key',
        'KEY_PREFIX': 'deliveryhub',
    }
}
STORAGES = {
    'default': {'BACKEND': 'django_tenants.files.storage.TenantFileSystemStorage'},
    'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedStaticFilesStorage'},
}
MULTITENANT_RELATIVE_MEDIA_ROOT = '%s'

# ---------------------------------------------------------------------------
# Security. The web container (Caddy) terminates TLS and sets X-Forwarded-Proto.
# ---------------------------------------------------------------------------
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
# COOKIE_SAMESITE=None (HTTPS only) lets the admin Mini App keep its session inside Telegram Web's iframe.
SESSION_COOKIE_SAMESITE = CSRF_COOKIE_SAMESITE = env('COOKIE_SAMESITE', 'Lax')
SESSION_COOKIE_SECURE = CSRF_COOKIE_SECURE = env_bool('COOKIE_SECURE', SESSION_COOKIE_SAMESITE == 'None')
CSRF_TRUSTED_ORIGINS = env_list('CSRF_TRUSTED_ORIGINS')

# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': ['rest_framework.authentication.SessionAuthentication'],
    'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.IsAuthenticated'],
    'DEFAULT_RENDERER_CLASSES': ['rest_framework.renderers.JSONRenderer'],
    'DEFAULT_PARSER_CLASSES': [
        'rest_framework.parsers.JSONParser',
        'rest_framework.parsers.MultiPartParser',
        'rest_framework.parsers.FormParser',
    ],
    'DEFAULT_PAGINATION_CLASS': 'api.common.pagination.Pagination',
    'EXCEPTION_HANDLER': 'api.common.errors.exception_handler',
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
}
SPECTACULAR_SETTINGS = {
    'TITLE': 'DeliveryHub API',
    'DESCRIPTION': 'See docs/api.md for the conventions (errors, pagination, authentication).',
    'VERSION': 'v1',
    'SERVE_INCLUDE_SCHEMA': False,
    'SERVE_PERMISSIONS': ['rest_framework.permissions.AllowAny'],
    'SCHEMA_PATH_PREFIX': '/api/v1',
    'COMPONENT_SPLIT_REQUEST': True,
}

# ---------------------------------------------------------------------------
# Platform: every business gets <slug>.<PLATFORM_DOMAIN> (shop, Mini App) and <slug>-admin.<PLATFORM_DOMAIN>
# (admin panel); our panel is <PLATFORM_HUB_SUBDOMAIN>.<PLATFORM_DOMAIN>. Locally the same names work
# under .localhost (macOS resolves *.localhost to 127.0.0.1).
# ---------------------------------------------------------------------------
PLATFORM_DOMAIN = env('PLATFORM_DOMAIN', 'portex.uz')
PLATFORM_LOCAL_DOMAIN = 'localhost'
PLATFORM_HUB_SUBDOMAIN = env('PLATFORM_HUB_SUBDOMAIN', 'deliveryhub')
# Subdomains of PLATFORM_DOMAIN that other projects use (the domain is shared): no business may take them.
PLATFORM_RESERVED_SUBDOMAINS = env_list('PLATFORM_RESERVED_SUBDOMAINS')
# Our platform bot: creates the bots of businesses (Telegram Managed Bots). Read here for its username.
PLATFORM_BOT_TOKEN = env('PLATFORM_BOT_TOKEN')
TELEGRAM_API_URL = env('TELEGRAM_API_URL', 'https://api.telegram.org')
# Businesses are opened at runtime: every https subdomain of the platform is trusted for CSRF.
CSRF_TRUSTED_ORIGINS += [f'https://*.{PLATFORM_DOMAIN}']
# Optional: a file listing the subdomains to expose (one per line) for a tunnel supervisor (portex on a Mac).
TUNNELS_FILE = Path(env('TUNNELS_FILE')) if env('TUNNELS_FILE') else None

# ---------------------------------------------------------------------------
# Mobile app (mobile/): an installed app older than MOBILE_MIN_VERSION asks to be updated from the store —
# only for changes of the app itself; the shop inside it is always the one on the server.
# ---------------------------------------------------------------------------
MOBILE_MIN_VERSION = env('MOBILE_MIN_VERSION', '1.0.0')
MOBILE_ANDROID_URL = env('MOBILE_ANDROID_URL')
MOBILE_IOS_URL = env('MOBILE_IOS_URL')

# ---------------------------------------------------------------------------
# Maps: addresses ⇄ points for the shops' checkout and our panel (apps/platform/geocoding.py) — a Nominatim
# server (OpenStreetMap data). The public one asks for a User-Agent naming the application. An empty
# GEOCODER_URL switches it off: the map still works, the address is typed.
# ---------------------------------------------------------------------------
GEOCODER_URL = env('GEOCODER_URL', 'https://nominatim.openstreetmap.org')
GEOCODER_COUNTRIES = env('GEOCODER_COUNTRIES', 'uz')
GEOCODER_USER_AGENT = env('GEOCODER_USER_AGENT',
                          f'DeliveryHub/1.0 (+https://{PLATFORM_HUB_SUBDOMAIN}.{PLATFORM_DOMAIN})')

# ---------------------------------------------------------------------------
# Shops: phone sign-in codes. SMS_BACKEND: console | eskiz | telegram_gateway
# ---------------------------------------------------------------------------
SMS_BACKEND = env('SMS_BACKEND', 'console')
ESKIZ_EMAIL = env('ESKIZ_EMAIL')
ESKIZ_PASSWORD = env('ESKIZ_PASSWORD')
ESKIZ_FROM = env('ESKIZ_FROM', '4546')
ESKIZ_MESSAGE = env('ESKIZ_MESSAGE', '{shop}: tasdiqlash kodi {code}')
TELEGRAM_GATEWAY_TOKEN = env('TELEGRAM_GATEWAY_TOKEN')
# Local development only: returns the sign-in code in the API response. Never enable in production.
SHOP_OTP_DEBUG = env_bool('SHOP_OTP_DEBUG')

# ---------------------------------------------------------------------------
# Voice / AI order entry — Google Gemini API
# ---------------------------------------------------------------------------
GEMINI_API_KEY = env('GEMINI_API_KEY')
GEMINI_PARSE_MODEL = env('GEMINI_PARSE_MODEL', 'gemini-3.5-flash-lite')
# If the main model has not answered after this many seconds, the next model is asked in parallel.
GEMINI_PARSE_HEDGE_SECONDS = float(env('GEMINI_PARSE_HEDGE_SECONDS', '4'))
GEMINI_PARSE_FALLBACK_MODELS = env_list('GEMINI_PARSE_FALLBACK_MODELS', 'gemini-3.1-flash-lite,gemini-3.5-flash')
GEMINI_TRANSCRIBE_MODEL = env('GEMINI_TRANSCRIBE_MODEL', 'gemini-3.5-transcribe')
GEMINI_LIVE_MODEL = env('GEMINI_LIVE_MODEL', 'gemini-3.5-transcribe-live')
GEMINI_LIVE_ENABLED = env_bool('GEMINI_LIVE_ENABLED', True)

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {'plain': {'format': '%(asctime)s %(levelname)s %(name)s: %(message)s'}},
    'handlers': {'console': {'class': 'logging.StreamHandler', 'formatter': 'plain'}},
    'loggers': {
        'django.request': {'handlers': ['console'], 'level': 'ERROR'},
        **{name: {'handlers': ['console'], 'level': 'INFO'} for name in ('api', 'platform', 'voice')},
    },
}
