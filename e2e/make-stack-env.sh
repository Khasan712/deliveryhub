#!/bin/bash
# Settings of the throwaway stack the end-to-end tests run against (make e2e): its own project, ports, database
# and random secrets — and no Telegram tokens or map server, so it can never touch real bots, data or services.
set -euo pipefail
rand() { openssl rand -hex 16; }
cat <<ENV
STACK_NAME=deliveryhub_e2e
ENV_FILE=e2e/.stack.env
WEB_PORT=${E2E_PORT:-8200}
WEB_BIND=127.0.0.1
DB_PORT=${E2E_DB_PORT:-5441}
SECRET_KEY=$(rand)
DEBUG=False
POSTGRES_DB=deliveryhub
POSTGRES_USER=deliveryhub
POSTGRES_PASSWORD=$(rand)
PLATFORM_DOMAIN=deliveryhub.test
PLATFORM_HUB_SUBDOMAIN=deliveryhub
PLATFORM_BOT_TOKEN=
PLATFORM_ADMIN_PHONE=+998900000777
PLATFORM_ADMIN_PASSWORD=$(rand)
SMS_BACKEND=console
SHOP_OTP_DEBUG=True
GEMINI_API_KEY=
GEOCODER_URL=
ENV
