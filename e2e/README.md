# DeliveryHub end-to-end tests

Playwright tests of the whole platform: our panel opens a business (and our landing page links to it once the panel
picks it as the sample shop), its owner fills the catalog, a customer orders in the shop, the owner completes the
order and the customer sees it; our panel suspends, activates and finally deletes the business.

```bash
make e2e    # from the repository root
```

`make e2e` starts a **throwaway stack of its own** (`docker compose -p deliveryhub-e2e`, port 8200, its own
database, random secrets in `e2e/.stack.env`, `SHOP_OTP_DEBUG=True` so the shop shows the sign-in code, no Telegram
tokens and no bot service), runs the tests, then removes the stack with its data. It never touches the stack of
this machine or production.

* `E2E_PORT` / `E2E_DB_PORT` — other ports for the throwaway stack (default 8200 / 5441).
* Against another running stack: `E2E_PORT=… E2E_PLATFORM_PHONE=… E2E_PLATFORM_PASSWORD=… npx playwright test`
  (a local development stack only — the tests open and delete businesses).
* Failures keep a screenshot and a trace in `results/` (`npx playwright show-trace results/…/trace.zip`).
