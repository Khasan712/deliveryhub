"""The icon of a shop for the browser tab and the phone's home screen (GET /api/v1/icon on its host): its logo, or —
without one — a bag on its brand colour, the way the shop itself shows a business without a logo. Drawn on the
server, so it is right from the first load: browsers (Safari above all) keep the icon a page names in its HTML and
ignore one the page swaps in later."""
import colorsys
from io import BytesIO

from PIL import Image, ImageChops, ImageDraw, ImageOps

TAB = 64  # the browser tab, rounded like the shop's default icon
TOUCH = 180  # the home screen (iOS rounds it itself, so it is square)
DEFAULT_BRAND = '#FF5A1F'  # a business without a brand colour: the shop's own default (client-ui lib/color.ts)
SS = 4  # supersampling for smooth edges


def _rgb(value):
    text = (value or '').strip().lstrip('#')
    try:
        if len(text) == 6:
            return tuple(int(text[i:i + 2], 16) for i in (0, 2, 4))
    except ValueError:
        pass
    return _rgb(DEFAULT_BRAND)


def _luminance(rgb):
    def channel(c):
        c /= 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (channel(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def _partner(rgb):
    """The second colour of the brand gradient, as the shop works it out (client-ui lib/color.ts)."""
    hue, lightness, saturation = colorsys.rgb_to_hls(*(c / 255 for c in rgb))
    hue = (hue - 28 / 360) % 1
    saturation = min(1.0, saturation * 1.05)
    lightness = min(0.62, max(0.42, lightness + 0.02))
    return tuple(round(c * 255) for c in colorsys.hls_to_rgb(hue, lightness, saturation))


def _ink(rgb):
    """White on the brand unless the brand is light (yellow, lime…): then near-black."""
    return (255, 255, 255) if 1.05 / (_luminance(rgb) + 0.05) >= 2.4 else (22, 22, 26)


def _gradient(size, top, bottom):
    image = Image.new('RGB', (size, size))
    pixels = image.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            pixels[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(top, bottom))
    return image


def _bag(size, brand):
    """The shop's bag (client-ui public icon: a 64 × 64 drawing) in the brand's ink on the brand gradient."""
    rgb = _rgb(brand)
    big = size * SS
    image = _gradient(big, rgb, _partner(rgb))
    draw = ImageDraw.Draw(image)
    unit = big / 64
    ink = _ink(rgb)
    width = round(4 * unit)

    def at(x, y):
        return x * unit, y * unit

    body = [at(20, 26), at(44, 26), at(41.5, 48), at(40.4, 50.0), at(38.5, 50.6), at(25.5, 50.6), at(23.6, 50.0),
            at(22.5, 48)]
    draw.line(body + [body[0]], fill=ink, width=width, joint='curve')
    for x, y in body:  # round joins all the way round, as the drawing's stroke-linejoin
        draw.ellipse([x - width / 2, y - width / 2, x + width / 2, y + width / 2], fill=ink)
    draw.line([at(26, 26), at(26, 23)], fill=ink, width=width)
    draw.line([at(38, 26), at(38, 23)], fill=ink, width=width)
    # The handle's top: a radius-6 half circle around (32, 23); Pillow strokes inside the box, so the box is 6 + 2.
    draw.arc([*at(24, 15), *at(40, 31)], start=180, end=360, fill=ink, width=width)
    return image.resize((size, size), Image.Resampling.LANCZOS).convert('RGBA')


def _logo(file, size):
    """The logo as the shop shows it: covering the square (object-fit: cover), see-through parts on white."""
    with file.open('rb') as handle:
        image = Image.open(handle)
        image.load()
    image = ImageOps.fit(ImageOps.exif_transpose(image).convert('RGBA'), (size, size), Image.Resampling.LANCZOS)
    square = Image.new('RGBA', (size, size), (255, 255, 255, 255))
    square.alpha_composite(image)
    return square


def _rounded(image):
    size = image.size[0]
    mask = Image.new('L', (size * SS, size * SS), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size * SS - 1, size * SS - 1], radius=size * SS * 18 // 64, fill=255)
    mask = mask.resize((size, size), Image.Resampling.LANCZOS)
    image = image.copy()
    image.putalpha(ImageChops.multiply(image.getchannel('A'), mask))
    return image


def shop_icon(business, touch=False):
    """PNG bytes: TAB px with rounded corners, or TOUCH px square for the home screen."""
    size = TOUCH if touch else TAB
    image = None
    if business.logo:
        try:
            image = _logo(business.logo, size)
        except (OSError, ValueError):  # the file is gone or broken: the bag below
            image = None
    if image is None:
        image = _bag(size, business.brand_color)
    if not touch:
        image = _rounded(image)
    buffer = BytesIO()
    image.save(buffer, 'PNG', optimize=True)
    return buffer.getvalue()
