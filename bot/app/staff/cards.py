"""Message texts and keyboards of the staff bot: draft card, order card, today's orders, today's stats.
Pure rendering: the data comes loaded (orders.OrderView, TicketView)."""
from collections import Counter
from dataclasses import dataclass
from datetime import datetime
from html import escape

from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, KeyboardButton, ReplyKeyboardMarkup

from app.orders import DELIVERY, DELIVERY_TYPES, ON_THE_WAY, ORDERED, PICKUP, REJECTED, SOURCE_ADMIN, SOURCES
from app.utils import format_money, is_coordinates, localdate, localtime, parse_price, parse_quantity
from .texts import t

TODAY_LIST_LIMIT = 30
TODAY_BUTTONS_LIMIT = 12
ACTIVE_STATUSES = (ORDERED, ON_THE_WAY)
STAGE_EMOJI = {'new': '🟡', 'accepted': '👨‍🍳', 'on_the_way': '🚚', 'completed': '✅', 'rejected': '❌'}


@dataclass
class Person:
    """An admin-panel user as the cards name them."""
    first_name: str | None
    phone_number: str


@dataclass
class TicketView:
    """adminbot_orderticket with the people it mentions."""
    id: int
    order_id: int
    status_seen: str
    accepted_at: datetime | None = None
    accepted_by: Person | None = None
    changed_at: datetime | None = None
    changed_by: Person | None = None


def money(amount, lang):
    return f'{format_money(amount)} {t(lang, "currency")}'


def product_name(product, lang):
    if not product:
        return '—'
    return (product.name_ru if lang == 'ru' else product.name_uz) or product.name_uz


def button(text, data):
    return InlineKeyboardButton(text=text, callback_data=data)


def inline(rows):
    return InlineKeyboardMarkup(inline_keyboard=rows)


def main_keyboard(lang):
    return ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text=t(lang, 'btn_today')), KeyboardButton(text=t(lang, 'btn_stats'))]],
        resize_keyboard=True,
        is_persistent=True,
        input_field_placeholder=t(lang, 'placeholder'),
    )


def language_keyboard():
    return inline([[button("🇺🇿 O'zbekcha", 'lang:uz'), button('🇷🇺 Русский', 'lang:ru')]])


def _details(lang, name, phone, address, delivery_type, payment_method, comment, map_href=None):
    lines = []
    who = ' · '.join(filter(None, [f'👤 {escape(name)}' if name else '', f'📞 {escape(phone)}' if phone else '']))
    if who:
        lines.append(who)
    place = f'📍 {escape(address)}' if address else ''
    if map_href:
        link = f'<a href="{map_href}">{t(lang, "on_map")}</a>'
        place = f'{place} ({link})' if place else f'📍 {link}'
    if place:
        lines.append(place)
    how = ' · '.join(filter(None, [
        t(lang, delivery_type) if delivery_type in DELIVERY_TYPES else '',
        t(lang, payment_method) if payment_method in ('cash', 'card') else '',
    ]))
    if how:
        lines.append(how)
    if comment:
        lines.append(f'💬 {escape(comment)}')
    return lines


# ---------------------------------------------------------------------------
# draft
# ---------------------------------------------------------------------------

def draft_delivery_type(state):
    """Same default as the admin panel: an address means delivery, otherwise the customer picks it up."""
    if state.get('delivery_type') in DELIVERY_TYPES:
        return state['delivery_type']
    return DELIVERY if state.get('address') else PICKUP


def draft_card(draft, products, lang):
    """`draft` — adminbot_draft row, `products` — {id: Product} of its items."""
    state = draft.state or {}
    items = state.get('items') or []

    lines = [t(lang, 'draft_title'), '']
    total = 0
    frozen = []
    for item in items:
        product = products.get(item['product_id'])
        if not product:
            continue
        amount = parse_price(product.price) * item['quantity']
        total += amount
        name = escape(product_name(product, lang))
        if product.is_frozen:
            frozen.append(name)
        mark = ' ❄️' if product.is_frozen else ''
        lines.append(f'• {name}{mark} × {item["quantity"]} — {format_money(amount)}')
    if not total:
        lines.append(t(lang, 'draft_no_items'))
    if frozen:
        # Staff may still sell a frozen product: they only need to know it is off the shop's menu.
        lines.append(t(lang, 'draft_frozen', items=', '.join(frozen)))
    if draft.unmatched:
        lines.append(t(lang, 'unmatched', items=escape(', '.join(draft.unmatched))))

    delivery_type = draft_delivery_type(state)
    details = _details(
        lang, state.get('customer_name'), state.get('phone'),
        state.get('address') if delivery_type == DELIVERY else '',
        delivery_type, state.get('payment_method'), state.get('comment'),
    )
    lines += [''] + details
    if total:
        lines += ['', f'💰 <b>{t(lang, "total")}: {money(total, lang)}</b>']
    if draft.transcript:
        lines += ['', f'🗣 <i>«{escape(draft.transcript[:300])}»</i>']
    lines.append(t(lang, 'draft_hint'))

    buttons = [button(t(lang, 'btn_discard'), 'draft:discard')]
    if total:
        buttons.insert(0, button(t(lang, 'btn_confirm'), 'draft:confirm'))
    return '\n'.join(lines), inline([buttons])


# ---------------------------------------------------------------------------
# order
# ---------------------------------------------------------------------------

def order_delivery_type(order):
    if order.delivery_type:
        return order.delivery_type
    return DELIVERY if order.location else PICKUP


def stage(order, ticket):
    """new → accepted → on_the_way → completed, or rejected. "Accepted" lives only in the ticket."""
    if order.status == ORDERED:
        return 'accepted' if ticket and ticket.accepted_at else 'new'
    return order.status


def map_link(order):
    latitude, longitude = order.l_t, order.e_t
    if not (latitude and longitude) and is_coordinates(order.location):
        latitude, longitude = order.location.replace(',', ' ').split()[:2]
    if latitude and longitude:
        return escape(f'https://maps.google.com/?q={latitude},{longitude}')
    return None


def source_name(source, lang):
    return t(lang, f'source_{source}') if source in SOURCES else escape(str(source or ''))


def source_label(order, lang):
    if order.source == SOURCE_ADMIN and order.created_by and order.created_by.first_name:
        return escape(order.created_by.first_name)
    return source_name(order.source, lang)


def short_time(value):
    value = localtime(value)
    return value.strftime('%H:%M') if value.date() == localdate() else value.strftime('%d.%m %H:%M')


def status_line(order, ticket, lang):
    current = stage(order, ticket)
    if current == 'new':
        return t(lang, 'status_new')
    if current == 'accepted':
        line, person, at = t(lang, 'status_accepted'), ticket.accepted_by, ticket.accepted_at
    else:
        key = f'status_{current}'
        if current == 'completed' and order_delivery_type(order) == PICKUP:
            key = 'status_completed_pickup'
        line = t(lang, key) if current in STAGE_EMOJI else escape(current)
        person, at = (ticket.changed_by, ticket.changed_at) if ticket else (None, None)
    details = ' '.join(filter(None, [
        escape(person.first_name or person.phone_number) if person else '',
        localtime(at).strftime('%H:%M') if at else '',
    ]))
    return f'{line} · {details}' if details else line


def order_card(order, ticket, lang, confirm_reject=False):
    """`order` — orders.OrderView, `ticket` — TicketView or None."""
    title = t(lang, 'order_new_title' if stage(order, ticket) == 'new' else 'order_title', id=order.id)
    lines = [title, ' · '.join(filter(None, [source_label(order, lang), short_time(order.created_at)])), '']
    total = 0
    for line in order.lines:
        amount = line.total
        total += amount
        name = escape(product_name(line.product, lang))
        lines.append(f'• {name} × {parse_quantity(line.quantity)} — {format_money(amount)}')

    address = order.location if order.location and not is_coordinates(order.location) else ''
    details = _details(
        lang, order.display_name, order.phone, address, order_delivery_type(order), order.payment_method,
        order.comment, map_link(order),
    )
    if details:
        lines += [''] + details
    lines += ['', f'💰 <b>{t(lang, "total")}: {money(total, lang)}</b>', status_line(order, ticket, lang)]
    return '\n'.join(lines), order_keyboard(order, ticket, lang, confirm_reject)


def order_keyboard(order, ticket, lang, confirm_reject=False):
    def order_button(key, action):
        return button(t(lang, key), f'order:{order.id}:{action}')

    current = stage(order, ticket)
    if current not in ('new', 'accepted', 'on_the_way'):
        return inline([])
    if confirm_reject:
        return inline([[order_button('btn_reject_yes', 'reject'), order_button('btn_back', 'back')]])
    if current == 'new':
        return inline([[order_button('btn_accept', 'accept'), order_button('btn_reject', 'ask_reject')]])

    if order_delivery_type(order) == PICKUP:
        progress = [order_button('btn_handed_over', 'done')]
    elif current == 'accepted':
        progress = [order_button('btn_on_the_way', 'on_the_way'), order_button('btn_delivered', 'done')]
    else:
        progress = [order_button('btn_delivered', 'done')]
    return inline([progress, [order_button('btn_cancel_order', 'ask_reject')]])


# ---------------------------------------------------------------------------
# today: `orders` — today's orders (not carts), newest first; `tickets` — {order id: TicketView}
# ---------------------------------------------------------------------------

def today_list(orders, tickets, lang):
    refresh = [button(t(lang, 'btn_refresh'), 'today')]
    if not orders:
        return t(lang, 'today_empty'), inline([refresh])

    valid = [order for order in orders if order.status != REJECTED]
    total = sum(order.total for order in valid)
    lines = [t(lang, 'today_title', count=len(valid), total=money(total, lang)), '']
    for order in orders[:TODAY_LIST_LIMIT]:
        lines.append(' · '.join(filter(None, [
            f'{STAGE_EMOJI.get(stage(order, tickets.get(order.id)), "•")} #{order.id}',
            localtime(order.created_at).strftime('%H:%M'),
            escape(order.display_name or order.phone or '') or source_label(order, lang),
            format_money(order.total),
        ])))
    if len(orders) > TODAY_LIST_LIMIT:
        lines.append(t(lang, 'today_more', count=len(orders) - TODAY_LIST_LIMIT))

    # Buttons open the orders that still need something done, oldest first.
    active = [order for order in reversed(orders) if order.status in ACTIVE_STATUSES][:TODAY_BUTTONS_LIMIT]
    buttons = [
        button(f'{STAGE_EMOJI[stage(order, tickets.get(order.id))]} #{order.id}', f'order:{order.id}:open')
        for order in active
    ]
    rows = [buttons[index:index + 4] for index in range(0, len(buttons), 4)] + [refresh]
    return '\n'.join(lines), inline(rows)


def today_stats(orders, tickets, lang):
    title = t(lang, 'stats_title', date=localdate().strftime('%d.%m.%Y'))
    if not orders:
        return f'{title}\n\n{t(lang, "stats_empty")}'

    valid = [order for order in orders if order.status != REJECTED]
    rejected = len(orders) - len(valid)
    revenue = sum(order.total for order in valid)
    lines = [title, '', t(lang, 'stats_orders', count=len(valid))
             + (t(lang, 'stats_rejected', count=rejected) if rejected else '')]
    lines.append(t(lang, 'stats_revenue', amount=money(revenue, lang)))
    if valid:
        lines.append(t(lang, 'stats_average', amount=money(revenue // len(valid), lang)))
        sources = Counter(order.source for order in valid)
        lines.append(t(lang, 'stats_sources', sources=', '.join(
            f'{source_name(source, lang)} {count}' for source, count in sources.most_common())))

    stages = Counter(stage(order, tickets.get(order.id)) for order in orders)
    active = ', '.join(t(lang, f'stats_{name}', count=stages[name])
                       for name in ('new', 'accepted', 'on_the_way') if stages[name])
    lines.append(t(lang, 'stats_active', active=active or t(lang, 'stats_all_done')))

    sold, products = Counter(), {}
    for line in sorted((line for order in valid for line in order.lines), key=lambda line: line.item.id):
        if line.product:
            sold[line.product.id] += parse_quantity(line.quantity)
            products[line.product.id] = line.product
    if sold:
        top = ', '.join(f'{escape(product_name(products[product_id], lang))} — {count}'
                        for product_id, count in sold.most_common(5))
        lines += ['', t(lang, 'stats_top', items=top)]
    return '\n'.join(lines)
