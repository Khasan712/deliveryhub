"""Branches of a business (Branch). Our panel lets a business have them (Business.branches_enabled); its admin opens
them in the admin panel, and every order goes to the branch that makes it (docs/api.md, Branches).

* Head office: staff without a branch (roles admin and manager) — every order; they send orders to branches.
* Branch staff: the role `branch` — only the orders of their own branch. With branches off they act like managers.
* Dispatch: branches on and two or more active branches. A delivery order then waits for the head office, which
  sends it to a branch (the nearest one is suggested); a pickup customer chooses the branch in the shop.
  With exactly one active branch every new order gets it by itself.
"""
import math

from django.utils import timezone

from .enums import UserRole
from .models import Branch
from .services import is_coordinates

EARTH_RADIUS_KM = 6371.0


def enabled(business):
    return bool(getattr(business, 'branches_enabled', False))


def active_branches():
    return Branch.objects.filter(is_active=True).order_by('name', 'id')


def is_branch_staff(user, business):
    """Sees only the orders of their branch (User.branch)."""
    return enabled(business) and user.role == UserRole.branch.value


def scope_orders(queryset, user, business):
    """The orders `user` may see: their branch's for branch staff, all for the head office."""
    if not is_branch_staff(user, business):
        return queryset
    return queryset.filter(branch_id=user.branch_id) if user.branch_id else queryset.none()


def dispatching(business):
    """Delivery orders wait for the head office to send them to one of several branches."""
    return enabled(business) and active_branches().count() >= 2


def branch_for_new_order(business, chosen=None):
    """The branch a new order gets by itself: the one chosen (a pickup customer, a branch's own sale, the head office
    at the point of sale), or else the only active branch. None: branches off, none yet, or it waits for dispatch."""
    if not enabled(business):
        return None
    if chosen is not None:
        return chosen
    branches = list(active_branches()[:2])
    return branches[0] if len(branches) == 1 else None


def assign(order, branch, user):
    """Sends the order to `branch` (the head office; the staff bot does the same from Telegram)."""
    order.branch = branch
    order.assigned_at = timezone.now()
    order.assigned_by = user
    order.save(update_fields=['branch', 'assigned_at', 'assigned_by', 'updated_at'])


# ---------------------------------------------------------------------------
# where: the nearest branch to an order, as the crow flies
# ---------------------------------------------------------------------------

def distance_km(a, b):
    """The great-circle distance between two (lat, lng) points in km — a straight line, not the road."""
    lat1, lng1, lat2, lng2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(min(1.0, h)))


def as_point(lat, lng):
    try:
        point = float(lat), float(lng)
    except (TypeError, ValueError):
        return None
    if not (-90 <= point[0] <= 90 and -180 <= point[1] <= 180) or point == (0.0, 0.0):
        return None
    return point


def order_point(order):
    """(lat, lng) of the place an order goes to: the point picked on the map, or a shared location pin ("lat lon").
    None for a typed address only, or a pickup."""
    point = as_point(order.l_t, order.e_t) if order.l_t and order.e_t else None
    if point is None and is_coordinates(order.location):
        point = as_point(*order.location.replace(',', ' ').split()[:2])
    return point


def branch_point(branch):
    return as_point(branch.latitude, branch.longitude) if branch.latitude is not None else None


def by_distance(point, branches):
    """[(branch, km or None)], nearest first; branches without a distance (no point on either side) after them,
    by name."""
    rows = []
    for branch in branches:
        where = branch_point(branch)
        rows.append((branch, round(distance_km(point, where), 1) if point and where else None))
    rows.sort(key=lambda row: (row[1] is None, row[1] or 0, row[0].name.lower(), row[0].pk))
    return rows


def nearest(point, branches):
    """(branch, km) nearest to `point`, or None when no distance is known."""
    rows = by_distance(point, branches) if point else []
    return rows[0] if rows and rows[0][1] is not None else None
