"""Staff bot messages (uz / ru)."""

LANGUAGES = ('uz', 'ru')

TEXTS = {
    'uz': {
        # keyboard
        'btn_today': '📋 Bugungi buyurtmalar',
        'btn_stats': '📊 Bugun',
        'btn_panel': '📊 Panel',
        'placeholder': '🎤 Buyurtmani ovoz bilan ayting…',
        # linking
        'not_linked': (
            "👋 Assalomu alaykum! Bu bot biznes xodimlari uchun.\n\n"
            "Ulanish uchun admin paneldagi <b>«Telegram bot»</b> bo'limidan taklif havolasini oling va oching."
        ),
        'not_linked_short': 'Siz botga ulanmagansiz',
        'invite_invalid': "❌ Havola eskirgan yoki allaqachon ishlatilgan.\nAdmin paneldan yangi havola oling.",
        'linked': '✅ <b>{name}</b>, siz «{shop}» jamoasiga ulandingiz!',
        'welcome': (
            "🎤 <b>Buyurtma kiritish</b> — mikrofonni bosib turib ayting, masalan:\n"
            "<i>«Ikkita chizburger, bitta kola. Mijoz Aziz, 90 123 45 67, Chilonzor 9»</i>\n\n"
            "🧾 Men kartani ko'rsataman — tekshiring va <b>✅ Tasdiqlash</b>ni bosing.\n"
            "✏️ Xato bo'lsa, yana ayting: <i>«kolani olib tashla»</i>.\n"
            "⌨️ Matn bilan yozsangiz ham bo'ladi.\n\n"
            "🔔 Mijozlarning yangi buyurtmalari ham shu yerga keladi."
        ),
        'hint': '🎤 Buyurtmani ovozli xabar qilib yuboring yoki matn bilan yozing.',
        # voice / draft
        'listening': '🎧 Tinglayapman…',
        'thinking': '⏳ Tushunayapman…',
        'voice_not_configured': (
            "🎤 Ovozli kiritish hali sozlanmagan. Buyurtmani matn bilan yozing: <i>«2 ta chizburger, 1 kola»</i>."
        ),
        'voice_too_long': '⏱ Ovozli xabar juda uzun. 2 daqiqagacha qilib yuboring.',
        'voice_failed': '😕 Ovozni tushunolmadim. Iltimos, qaytadan aniqroq ayting.',
        'ai_failed': "⚠️ AI hozir javob bermayapti. Birozdan so'ng qayta urinib ko'ring.",
        'nothing_found': (
            "🤔 Buyurtmani topa olmadim.\n🗣 <i>«{heard}»</i>\n\n"
            "Mahsulot nomi va sonini ayting: <i>«2 ta chizburger»</i>."
        ),
        'draft_title': '📝 <b>Yangi buyurtma</b> · qoralama',
        'draft_no_items': "🛒 Mahsulotlar hali yo'q — ovoz bilan ayting.",
        'draft_frozen': "⚠️ Muzlatilgan: {items} — mijozlar hozir buyurtma qila olmaydi, siz baribir sotishingiz mumkin.",
        'unmatched': '❓ Topilmadi: {items}',
        'draft_hint': '✏️ Tuzatish uchun yana ovoz yuboring',
        'btn_confirm': '✅ Tasdiqlash',
        'btn_discard': '❌ Bekor qilish',
        'draft_discarded': '❌ Qoralama bekor qilindi.',
        'draft_empty': "Avval mahsulot qo'shing",
        'card_outdated': 'Bu karta eskirgan',
        'created_toast': '✅ #{id} yaratildi',
        # order card
        'order_new_title': '🔔 <b>Yangi buyurtma #{id}</b>',
        'order_title': '🧾 <b>Buyurtma #{id}</b>',
        'total': 'Jami',
        'currency': 'so‘m',
        'delivery': '🚚 Yetkazib berish',
        'pickup': '🏃 Olib ketish',
        'cash': '💵 Naqd',
        'card': '💳 Karta',
        'on_map': "xaritada ko'rish",
        'source_bot': 'Telegram bot',
        'source_web': 'Sayt',
        'source_miniapp': 'Mini App',
        'source_admin': 'Xodim',
        'status_new': '🟡 Yangi — javob kutilmoqda',
        'status_accepted': '👨‍🍳 Qabul qilindi',
        'status_on_the_way': "🚚 Yo'lda",
        'status_completed': '✅ Yetkazildi',
        'status_completed_pickup': '✅ Topshirildi',
        'status_rejected': '❌ Bekor qilindi',
        'btn_accept': '✅ Qabul qilish',
        'btn_reject': '❌ Rad etish',
        'btn_on_the_way': "🚚 Yo'lga chiqdi",
        'btn_delivered': '✅ Yetkazildi',
        'btn_handed_over': '✅ Topshirildi',
        'btn_cancel_order': '❌ Bekor qilish',
        'btn_reject_yes': '⚠️ Ha, bekor qilinsin',
        'btn_back': '↩️ Orqaga',
        'confirm_reject': 'Bekor qilishni tasdiqlang',
        'saved': 'Saqlandi',
        'already_changed': "Holat allaqachon o'zgargan",
        'order_not_found': 'Buyurtma topilmadi',
        # today / stats
        'today_title': '📋 <b>Bugungi buyurtmalar</b> · {count} ta · {total}',
        'today_empty': "📋 Bugun hali buyurtma yo'q.",
        'today_more': '… yana {count} ta',
        'btn_refresh': '🔄 Yangilash',
        'stats_title': '📊 <b>Bugun</b> · {date}',
        'stats_empty': "📊 Bugun hali buyurtma yo'q.",
        'stats_orders': '🧾 Buyurtmalar: <b>{count}</b>',
        'stats_rejected': ' (bekor: {count})',
        'stats_revenue': '💰 Tushum: <b>{amount}</b>',
        'stats_average': "🧮 O'rtacha chek: {amount}",
        'stats_sources': '📥 Manbalar: {sources}',
        'stats_active': '⏳ Hozir: {active}',
        'stats_new': '🟡 {count} yangi',
        'stats_accepted': '👨‍🍳 {count} tayyorlanmoqda',
        'stats_on_the_way': "🚚 {count} yo'lda",
        'stats_all_done': 'hammasi bajarilgan 👌',
        'stats_top': "🏆 Ko'p sotilgan: {items}",
        # language / commands
        'lang_choose': '🌐 Tilni tanlang / Выберите язык',
        'lang_saved': "✅ Til: O'zbekcha",
        'cmd_start': 'Boshlash va yordam',
        'cmd_today': 'Bugungi buyurtmalar',
        'cmd_stats': 'Bugungi natijalar',
        'cmd_lang': 'Til / Язык',
        'bot_description': (
            "Biznes xodimlari uchun: buyurtmalarni ovoz bilan kiriting va mijozlarning yangi buyurtmalarini "
            "qabul qiling. Ulanish — admin paneldagi taklif havolasi orqali."
        ),
        'bot_short_description': 'Xodimlar uchun: ovozli buyurtma va yangi buyurtmalar',
    },
    'ru': {
        'btn_today': '📋 Заказы сегодня',
        'btn_stats': '📊 Итоги дня',
        'btn_panel': '📊 Панель',
        'placeholder': '🎤 Продиктуйте заказ голосом…',
        'not_linked': (
            "👋 Здравствуйте! Этот бот — для сотрудников бизнеса.\n\n"
            "Чтобы подключиться, откройте ссылку-приглашение из раздела <b>«Telegram бот»</b> в админ-панели."
        ),
        'not_linked_short': 'Вы не подключены к боту',
        'invite_invalid': '❌ Ссылка устарела или уже использована.\nПолучите новую в админ-панели.',
        'linked': '✅ <b>{name}</b>, вы подключены к команде «{shop}»!',
        'welcome': (
            "🎤 <b>Как ввести заказ</b> — зажмите микрофон и скажите, например:\n"
            "<i>«Два чизбургера, одна кола. Клиент Азиз, 90 123 45 67, Чиланзар 9»</i>\n\n"
            "🧾 Я покажу карточку — проверьте и нажмите <b>✅ Подтвердить</b>.\n"
            "✏️ Если что-то не так, скажите ещё раз: <i>«убери колу»</i>.\n"
            "⌨️ Можно и текстом.\n\n"
            "🔔 Новые заказы клиентов тоже приходят сюда."
        ),
        'hint': '🎤 Отправьте заказ голосовым сообщением или текстом.',
        'listening': '🎧 Слушаю…',
        'thinking': '⏳ Разбираю…',
        'voice_not_configured': (
            '🎤 Голосовой ввод ещё не настроен. Напишите заказ текстом: <i>«2 чизбургера, 1 кола»</i>.'
        ),
        'voice_too_long': '⏱ Сообщение слишком длинное. Отправьте до 2 минут.',
        'voice_failed': '😕 Не удалось разобрать голос. Повторите, пожалуйста, чётче.',
        'ai_failed': '⚠️ ИИ сейчас не отвечает. Попробуйте чуть позже.',
        'nothing_found': (
            '🤔 Не нашёл заказ.\n🗣 <i>«{heard}»</i>\n\n'
            'Назовите товар и количество: <i>«2 чизбургера»</i>.'
        ),
        'draft_title': '📝 <b>Новый заказ</b> · черновик',
        'draft_no_items': '🛒 Товаров пока нет — продиктуйте их.',
        'draft_frozen': '⚠️ На стопе: {items} — клиенты сейчас не могут заказать, но вы можете продать.',
        'unmatched': '❓ Не найдено: {items}',
        'draft_hint': '✏️ Чтобы исправить, отправьте голос ещё раз',
        'btn_confirm': '✅ Подтвердить',
        'btn_discard': '❌ Отменить',
        'draft_discarded': '❌ Черновик отменён.',
        'draft_empty': 'Сначала добавьте товары',
        'card_outdated': 'Эта карточка устарела',
        'created_toast': '✅ Заказ #{id} создан',
        'order_new_title': '🔔 <b>Новый заказ #{id}</b>',
        'order_title': '🧾 <b>Заказ #{id}</b>',
        'total': 'Итого',
        'currency': 'сум',
        'delivery': '🚚 Доставка',
        'pickup': '🏃 Самовывоз',
        'cash': '💵 Наличные',
        'card': '💳 Карта',
        'on_map': 'на карте',
        'source_bot': 'Telegram бот',
        'source_web': 'Сайт',
        'source_miniapp': 'Mini App',
        'source_admin': 'Сотрудник',
        'status_new': '🟡 Новый — ждёт ответа',
        'status_accepted': '👨‍🍳 Принят',
        'status_on_the_way': '🚚 В пути',
        'status_completed': '✅ Доставлен',
        'status_completed_pickup': '✅ Выдан',
        'status_rejected': '❌ Отменён',
        'btn_accept': '✅ Принять',
        'btn_reject': '❌ Отклонить',
        'btn_on_the_way': '🚚 В пути',
        'btn_delivered': '✅ Доставлен',
        'btn_handed_over': '✅ Выдан',
        'btn_cancel_order': '❌ Отменить',
        'btn_reject_yes': '⚠️ Да, отменить',
        'btn_back': '↩️ Назад',
        'confirm_reject': 'Подтвердите отмену',
        'saved': 'Сохранено',
        'already_changed': 'Статус уже изменён',
        'order_not_found': 'Заказ не найден',
        'today_title': '📋 <b>Заказы сегодня</b> · {count} · {total}',
        'today_empty': '📋 Сегодня заказов пока нет.',
        'today_more': '… и ещё {count}',
        'btn_refresh': '🔄 Обновить',
        'stats_title': '📊 <b>Сегодня</b> · {date}',
        'stats_empty': '📊 Сегодня заказов пока нет.',
        'stats_orders': '🧾 Заказов: <b>{count}</b>',
        'stats_rejected': ' (отменено: {count})',
        'stats_revenue': '💰 Выручка: <b>{amount}</b>',
        'stats_average': '🧮 Средний чек: {amount}',
        'stats_sources': '📥 Источники: {sources}',
        'stats_active': '⏳ Сейчас: {active}',
        'stats_new': '🟡 {count} новых',
        'stats_accepted': '👨‍🍳 {count} готовится',
        'stats_on_the_way': '🚚 {count} в пути',
        'stats_all_done': 'всё выполнено 👌',
        'stats_top': '🏆 Топ продаж: {items}',
        'lang_choose': '🌐 Tilni tanlang / Выберите язык',
        'lang_saved': '✅ Язык: русский',
        'cmd_start': 'Начало и помощь',
        'cmd_today': 'Заказы сегодня',
        'cmd_stats': 'Итоги дня',
        'cmd_lang': 'Язык / Til',
        'bot_description': (
            'Для сотрудников бизнеса: вводите заказы голосом и принимайте новые заказы клиентов. '
            'Подключение — по ссылке-приглашению из админ-панели.'
        ),
        'bot_short_description': 'Для сотрудников: голосовые заказы и новые заказы',
    },
}


def t(lang, key, **kwargs):
    text = TEXTS.get(lang, TEXTS['uz']).get(key) or TEXTS['uz'][key]
    return text.format(**kwargs) if kwargs else text


def variants(key):
    """The same text in every language (keyboard buttons are matched by their label)."""
    return {TEXTS[lang][key] for lang in LANGUAGES}


def language_of(telegram_user):
    """'ru' for Russian-speaking Telegram users, otherwise 'uz'."""
    code = getattr(telegram_user, 'language_code', None) or ''
    return 'ru' if code.startswith('ru') else 'uz'
