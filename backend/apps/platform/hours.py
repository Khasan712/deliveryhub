"""Working hours of a business (Business.working_hours): one shift a day, Monday first, in the platform's time zone.

    [{"open": "09:00", "close": "22:00"}, ..., None]   — seven days; None is a day off.

A shift whose close is not after its open runs past midnight ("18:00"–"02:00" closes at 02:00 the next day);
"00:00"–"24:00" is the whole day. No hours at all (None) means the shop takes orders at any time. The shop
(client-ui, lib/hours.ts) works the status out the same way to show it live; the backend enforces it."""
import re
from datetime import timedelta

from django.utils import timezone

DAYS = 7
TIME = re.compile(r'^(?:[01]\d|2[0-3]):[0-5]\d$')
# How far the status looks: the longest closed stretch has to fit (a week off and a day around it).
HORIZON_DAYS = 8


def _minutes(value):
    hours, minutes = value.split(':')
    return int(hours) * 60 + int(minutes)


def validate(week):
    """The week as the API takes it, checked and normalised; raises ValueError for anything else."""
    if week is None:
        return None
    if not isinstance(week, list) or len(week) != DAYS:
        raise ValueError('seven days')
    result = []
    for day in week:
        if day is None:
            result.append(None)
            continue
        if not isinstance(day, dict) or set(day) != {'open', 'close'}:
            raise ValueError('a shift is {"open", "close"}')
        start, end = day['open'], day['close']
        if not (isinstance(start, str) and TIME.match(start)):
            raise ValueError('open is HH:MM')
        if not (isinstance(end, str) and (TIME.match(end) or end == '24:00')):
            raise ValueError('close is HH:MM or 24:00')
        if start == end:
            raise ValueError('an empty shift (the whole day is 00:00–24:00)')
        result.append({'open': start, 'close': end})
    return result


def _shifts(week, midnight):
    """(start, end) of the shifts that begin from the day before `midnight` to HORIZON_DAYS after it."""
    shifts = []
    for offset in range(-1, HORIZON_DAYS):
        day = midnight + timedelta(days=offset)
        shift = week[day.weekday()]
        if not shift:
            continue
        start, end = _minutes(shift['open']), _minutes(shift['close'])
        if end <= start:
            end += 24 * 60
        shifts.append((day + timedelta(minutes=start), day + timedelta(minutes=end)))
    return shifts


def status(week, now=None):
    """{"open": bool, "opens_at": iso | None, "closes_at": iso | None} at `now` (default: this moment).
    Back-to-back shifts (Monday 18:00–24:00, Tuesday 00:00–02:00) count as one; a shop open around the clock
    has no closes_at, one closed every day no opens_at."""
    if week is None:
        return {'open': True, 'opens_at': None, 'closes_at': None}
    now = timezone.localtime(now or timezone.now())
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    shifts = _shifts(week, midnight)
    horizon = midnight + timedelta(days=HORIZON_DAYS - 1)

    for start, end in shifts:
        if start <= now < end:
            closes = end
            while closes < horizon:
                follow = next((later for begin, later in shifts if begin <= closes < later and later > closes), None)
                if follow is None:
                    break
                closes = follow
            return {'open': True, 'opens_at': None, 'closes_at': closes.isoformat() if closes < horizon else None}

    upcoming = [start for start, end in shifts if start > now]
    return {'open': False, 'opens_at': min(upcoming).isoformat() if upcoming else None, 'closes_at': None}


def is_open(week, now=None):
    return status(week, now)['open']
