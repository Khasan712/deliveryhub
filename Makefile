# Everyday commands. Each part also works on its own — see its README.
.PHONY: up down logs ps test test-backend test-bot test-ui test-mobile e2e schema test-db backup restore

up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f --tail=100

ps:
	docker compose ps

test: test-backend test-bot test-ui

# The database of every business + uploaded files → backups/<stamp>/ (scripts/backup.sh).
backup:
	scripts/backup.sh

# make restore FROM=backups/<stamp> — replaces everything in this stack.
restore:
	scripts/restore.sh $(FROM)

# A throwaway PostgreSQL for the backend tests (config/test_settings.py → localhost:55433).
test-db:
	@docker inspect dh-backend-test-db >/dev/null 2>&1 || docker run --rm -d --name dh-backend-test-db \
		-e POSTGRES_USER=deliveryhub -e POSTGRES_PASSWORD=test -e POSTGRES_DB=deliveryhub -p 55433:5432 postgres:16
	@until docker exec dh-backend-test-db pg_isready -U deliveryhub >/dev/null 2>&1; do sleep 1; done

test-backend: test-db
	cd backend && .venv/bin/pytest -q && .venv/bin/flake8 api apps config tests scripts manage.py

test-bot:
	cd bot && $(MAKE) test

test-ui:
	cd client-ui && npm test && npm run lint && npm run build
	cd admin-ui && npm test && npm run lint && npm run build
	cd deliveryhub-ui && npm test && npm run lint && npm run build

# The mobile app (Flutter SDK needed): static checks and the tests of the shell.
test-mobile:
	cd mobile && flutter analyze && flutter test

# End-to-end tests in a throwaway stack of their own (port 8200, own database, no bot tokens): built, tested,
# then removed with its data. Never touches the stack of this machine or production.
E2E_STACK = docker compose -p deliveryhub-e2e -f docker-compose.yml --env-file e2e/.stack.env
E2E_SERVICES = db redis backend client-ui admin-ui deliveryhub-ui web

e2e:
	e2e/make-stack-env.sh > e2e/.stack.env
	$(E2E_STACK) up -d --build --wait $(E2E_SERVICES)
	cd e2e && npm ci --no-audit --no-fund --silent && npx playwright test; status=$$?; \
		cd .. && $(E2E_STACK) down -v --remove-orphans; rm -f e2e/.stack.env; exit $$status

# OpenAPI files of the three APIs (docs/openapi/*.yaml) from the backend code.
schema:
	cd backend && for api in shop admin platform; do \
		DJANGO_SETTINGS_MODULE=config.test_settings .venv/bin/python manage.py spectacular \
			--urlconf config.urls.$$api --validate --file ../docs/openapi/$$api.yaml; \
	done
