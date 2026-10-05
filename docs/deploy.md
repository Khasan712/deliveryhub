# Deploy — `sizlarbilan.uz`, umumiy server

DeliveryHub bitta serverda boshqa loyihalar (portex, norva, …) bilan birga turadi. `sizlarbilan.uz` — umumiy domen:
DeliveryHub undan cheksiz subdomen ochadi (har biznesga ikkitadan), boshqa loyihalar ham o'z subdomenlarini oladi.

```
Internet ─► server :443 ─► EDGE (TLS: *.sizlarbilan.uz) ─┬─► norva.sizlarbilan.uz …  → boshqa loyihalar
                                                          └─► qolgan hamma subdomenlar → 127.0.0.1:8100
                                                                (DeliveryHub web: host bo'yicha UI'lar, /api → backend)
```

| Manzil | Nima |
|---|---|
| `deliveryhub.sizlarbilan.uz` | bizning platforma panelimiz |
| `<slug>.sizlarbilan.uz` | biznes do'koni + mijozlar Mini App'i |
| `<slug>-admin.sizlarbilan.uz` | biznes admin paneli + xodimlar Mini App'i |
| `sizlarbilan.uz` | bizneslar uchun sahifamiz (`landing/`; ruscha `/ru`) — `www.` edge'da shu yerga yo'naltiriladi |

DeliveryHub o'zi sertifikat bilan shug'ullanmaydi: web konteyner faqat `127.0.0.1:8100` da oddiy HTTP beradi
(`WEB_BIND`), TLS'ni serverdagi bitta umumiy edge yopadi va `Host` ni o'zgartirmay uzatadi.

## 1. DNS

| Yozuv | Qiymat |
|---|---|
| `A sizlarbilan.uz` | server IP |
| `A *.sizlarbilan.uz` | server IP — hamma bizneslar va keyingi loyihalar uchun bitta yozuv |

Cloudflare tavsiya etiladi (portex.uz ham shunda): wildcard sertifikat uchun DNS-01 API tokeni
(`Zone · DNS · Edit`) beradi. Boshqa loyiha olgan subdomenni `.env` dagi `PLATFORM_RESERVED_SUBDOMAINS` ga yozing —
biznes u nomni ololmaydi.

## 2. Edge (serverda bitta, hamma loyihalar uchun)

Wildcard sertifikat `*.sizlarbilan.uz` + `sizlarbilan.uz` (Let's Encrypt, DNS-01) — har yangi biznes uchun alohida
sertifikat kerak emas, Let's Encrypt limitlariga urilmaydi. Masalan, Cloudflare DNS moduli bilan qurilgan Caddy
(`xcaddy build --with github.com/caddy-dns/cloudflare`):

```caddyfile
{
	email admin@sizlarbilan.uz
}

sizlarbilan.uz, *.sizlarbilan.uz {
	tls {
		dns cloudflare {env.CLOUDFLARE_API_TOKEN}
	}

	# sizlarbilan.uz o'zi — DeliveryHub'ning sahifasi (pastdagi umumiy blok uzatadi); www. — unga
	@www host www.sizlarbilan.uz
	handle @www {
		redir https://sizlarbilan.uz{uri} permanent
	}

	# boshqa loyihalar — aniq subdomenlar (PLATFORM_RESERVED_SUBDOMAINS ga ham yoziladi)
	# @norva host norva.sizlarbilan.uz
	# handle @norva {
	# 	reverse_proxy 127.0.0.1:9000
	# }

	# qolgan hamma subdomenlar — DeliveryHub
	handle {
		reverse_proxy 127.0.0.1:8100
	}
}
```

`reverse_proxy` `Host` ni saqlaydi va `X-Forwarded-Proto: https` qo'yadi — backend so'rov HTTPS ekanini biladi.

**Serverda qanday qilingan (2026-10-03):** edge — `infra` reposi (`~/Desktop/My/Projects/infra/edge`, serverda
`~/infra/edge`): bitta Caddy hostning tarmog'ida 80/443 ni egallaydi va `portex.uz` ni ham, `sizlarbilan.uz` ni ham
oladi. portex gateway uning orqasida (portex repo'dagi `compose.edge.yml`, `127.0.0.1:8080`) — SNI router ham,
Cloudflare proxy ham kerak bo'lmadi. Cloudflare proxy (to'q sariq bulut) ishlatilmaydi: O'zbekistondan so'rov
Varshava (WAW) orqali aylanadi. Har loyiha o'z kirishini faqat `127.0.0.1` dagi portda ochadi: DeliveryHub `8100`,
3d-chess `8090`, portex `8080`.

## 3. Server

```bash
# Docker Engine + compose plugin o'rnatilgan; firewall: 22, 80, 443 (8100 ochilmaydi)
# /var/www root'niki, deploy foydalanuvchisi u yerda papka ocholmaydi — shuning uchun uy papkasida
git clone https://github.com/Khasan712/deliveryhub.git ~/deliveryhub
cd ~/deliveryhub
```

`.env` — Mac'dagi `.env` ning nusxasi (`scp`, git'ga hech qachon kirmaydi), farqlari:

```ini
SECRET_KEY=…                      # AYNAN ESKISI: bot tokenlari u bilan shifrlangan
PLATFORM_DOMAIN=sizlarbilan.uz
PLATFORM_HUB_SUBDOMAIN=deliveryhub
PLATFORM_RESERVED_SUBDOMAINS=     # boshqa loyihalarning subdomenlari, vergul bilan
COOKIE_SECURE=True                # faqat HTTPS
SHOP_OTP_DEBUG=False
WEB_BIND=127.0.0.1
# GUNICORN_CMD_ARGS=--workers 2 --threads 4   # kichik serverda
```

Ishga tushirish: `docker compose up -d --build` — backend migratsiyalarni qo'llaydi, platformani va `.env` dagi
admin akkauntini yaratadi. Tekshirish: `curl -s http://127.0.0.1:8100/healthz` → `{"status": "ok"}`.

## 4. Ma'lumotlarni Mac'dan ko'chirish

Bitta botni bir vaqtda faqat bitta servis o'qiy oladi — Mac'dagi bot to'xtamasa, serverdagisi 409 oladi.

```bash
# Mac'da: yozuvlarni to'xtatib, zaxira
docker compose stop bot backend
make backup                                   # → backups/<stamp>/{db.dump,media.tar.gz}
scp -r backups/<stamp> deploy@189.74.98.186:deliveryhub/backups/

# serverda
RESTORE_YES=yes scripts/restore.sh backups/<stamp>
```

Tiklangach, backend har biznesga `<slug>.sizlarbilan.uz` / `<slug>-admin.sizlarbilan.uz` domenlarini o'zi qo'shadi
(`ensure_platform`), bot servisi esa botlarning Mini App tugmalarini yangi domenga o'zi sozlaydi. Keyin Mac'da:
`~/jarvis/scripts/deliveryhub-tunnel.sh stop` va `docker compose down`.

Tekshirish: `https://deliveryhub.sizlarbilan.uz` (login), `https://food.sizlarbilan.uz` (do'kon),
`https://food-admin.sizlarbilan.uz`; Telegram'da botlarning menyu tugmasi yangi manzilni ochadi;
`docker compose logs bot --tail 20` — har bot uchun `polling @…`.

## 5. Kundalik ishlar

| Ish | Buyruq |
|---|---|
| Yangilash | `git pull && docker compose up -d --build` (migratsiyalar o'zi qo'llanadi) |
| Eski rasmlarni kichraytirish (bir marta, rasm optimallashtirish kelgan deploy'dan keyin; qayta ishlatsa bo'ladi) | `docker compose exec backend python manage.py optimize_images` |
| Holat / log | `docker compose ps`, `docker compose logs -f backend bot` |
| Zaxira (cron, har kuni 03:30 — o'rnatilgan) | `30 3 * * * cd /home/deploy/deliveryhub && BACKUP_DIR=/home/deploy/backups/deliveryhub BACKUP_KEEP=14 scripts/backup.sh >> /home/deploy/backups/deliveryhub.log 2>&1` |
| Zaxiradan tiklash | `scripts/restore.sh /home/deploy/backups/deliveryhub/<stamp>` |
| Orqaga qaytish (kod) | `git checkout <oldingi commit> && docker compose up -d --build` |
| Test bizneslarini o'chirish | `docker compose exec backend python manage.py delete_business --prefix e2e- --yes` |

Zaxiralarni boshqa joyga ham nusxalang (masalan, boshqa server yoki bulut) — server bilan birga yo'qolmasin.

## Muhim

* `SECRET_KEY` o'zgarsa, barcha botlarni qayta ulash kerak bo'ladi (tokenlar o'qilmaydi).
* Telegram Mini App faqat HTTPS manzilni ochadi.
* Saytda telefon orqali kirish uchun SMS provayder kerak (`SMS_BACKEND=eskiz` yoki `telegram_gateway`); hozir
  `console` — kodlar faqat backend log'ida, mijozlar Telegram orqali kiradi.
