"""Branches of a business (app_branch) and our panel's switch for them (hub_business.branches_enabled) — the rules
of the backend (apps.core.branches):

* head office: staff without a branch (roles admin and manager) — every order; they send orders to branches;
* branch staff: the role `branch` — only the orders of their own branch; with branches off they act like managers;
* dispatch: branches on and two or more active branches — an order without a branch waits for the head office,
  which sends it to one (the nearest is suggested). With exactly one active branch every new order gets it.

Distances are straight lines between two points (haversine on a 6371 km sphere), in km rounded to 0.1."""
import math
from dataclasses import dataclass

from sqlalchemy import select

from .db.models import Branch, Business, User
from .orders import ORDERED
from .utils import is_coordinates

EARTH_RADIUS_KM = 6371.0


@dataclass(frozen=True)
class BranchInfo:
    id: int
    name: str
    point: tuple[float, float] | None = None
    is_active: bool = True


@dataclass(frozen=True)
class Setup:
    """A business's branches as one update or background round sees them (load_setup)."""
    enabled: bool = False
    branches: tuple[BranchInfo, ...] = ()  # every branch (inactive ones too), by name

    @property
    def active(self):
        return tuple(branch for branch in self.branches if branch.is_active)

    @property
    def dispatch(self):
        """Orders without a branch wait for the head office to send them to one of several branches."""
        return self.enabled and len(self.active) >= 2

    @property
    def only(self):
        """The branch every new order gets by itself: the only active one (None in dispatch mode)."""
        active = self.active
        return active[0] if self.enabled and len(active) == 1 else None

    def name(self, branch_id):
        return next((branch.name for branch in self.branches if branch.id == branch_id), f'#{branch_id}')

    def waits(self, order):
        """The order waits for the head office to send it to a branch (nothing else is done with it before)."""
        return self.dispatch and order.branch_id is None and order.status == ORDERED


OFF = Setup()


async def load_setup(session, business_id) -> Setup:
    """Read for every update and every round — never kept: our panel's switch takes effect at once."""
    enabled = await session.scalar(select(Business.branches_enabled).where(Business.id == business_id))
    if not enabled:
        return OFF
    rows = await session.execute(
        select(Branch.id, Branch.name, Branch.latitude, Branch.longitude, Branch.is_active)
        .order_by(Branch.name, Branch.id)
    )
    return Setup(True, tuple(BranchInfo(row.id, row.name, as_point(row.latitude, row.longitude), row.is_active)
                             for row in rows))


@dataclass(frozen=True)
class Viewer:
    """The staff member a card is shown to and whose buttons are checked: the head office (everything), or — with
    branches on — the staff of one branch (only that branch's orders)."""
    branch_staff: bool = False
    branch_id: int | None = None

    @classmethod
    def of(cls, setup, role, branch_id):
        branch_staff = setup.enabled and role == User.ROLE_BRANCH
        return cls(branch_staff, branch_id if branch_staff else None)

    def may_act(self, order):
        """Sees the order and may press its buttons."""
        return not self.branch_staff or (order.branch_id is not None and order.branch_id == self.branch_id)


HEAD_OFFICE = Viewer()


# ---------------------------------------------------------------------------
# where: the nearest branch to an order, as the crow flies
# ---------------------------------------------------------------------------

def as_point(latitude, longitude):
    try:
        point = float(latitude), float(longitude)
    except (TypeError, ValueError):
        return None
    if not (-90 <= point[0] <= 90 and -180 <= point[1] <= 180) or point == (0.0, 0.0):
        return None
    return point


def order_point(order):
    """(lat, lng) of the place an order goes to: the point picked on the map (l_t / e_t) or a shared location pin
    ("lat lon"). None for a typed address only, or a pickup."""
    point = as_point(order.l_t, order.e_t) if order.l_t and order.e_t else None
    if point is None and is_coordinates(order.location):
        point = as_point(*order.location.replace(',', ' ').split()[:2])
    return point


def distance_km(a, b):
    """The great-circle distance between two (lat, lng) points in km — a straight line, not the road."""
    lat1, lng1, lat2, lng2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(min(1.0, h)))


def by_distance(point, branches):
    """[(branch, km or None)], nearest first; branches without a distance (no point on either side) after them, by
    name."""
    rows = [(branch, round(distance_km(point, branch.point), 1) if point and branch.point else None)
            for branch in branches]
    rows.sort(key=lambda row: (row[1] is None, row[1] or 0, row[0].name.lower(), row[0].id))
    return rows
