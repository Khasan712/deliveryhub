"""Draws the app's mark (a white shopping bag on the DeliveryHub indigo → violet gradient) at every size the Android
and iOS projects need: `python3 mobile/tool/make_icons.py mobile` (Pillow needed — e.g. backend/.venv/bin/python)."""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(sys.argv[1])
TOP, BOTTOM = (91, 91, 214), (124, 58, 237)  # #5B5BD6 → #7C3AED
SS = 4  # supersampling for smooth edges


def gradient(size):
    image = Image.new('RGB', (size, size))
    pixels = image.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            pixels[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(TOP, BOTTOM))
    return image


def bag(size, scale=1.0, color=(255, 255, 255, 255), mouth=None):
    """The bag glyph on a transparent square; `scale` shrinks it inside the square (adaptive icon safe zone)."""
    big = size * SS
    layer = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    unit = big * scale
    offset = (big - unit) / 2

    def box(x0, y0, x1, y1):
        return [offset + x0 * unit, offset + y0 * unit, offset + x1 * unit, offset + y1 * unit]

    stroke = round(0.055 * unit)
    # Handle: the top half of an ellipse.
    draw.arc(box(0.36, 0.20, 0.64, 0.52), start=180, end=360, fill=color, width=stroke)
    # Body.
    draw.rounded_rectangle(box(0.25, 0.36, 0.75, 0.82), radius=round(0.075 * unit), fill=color)
    # A smile on the bag, in the background colour.
    if mouth:
        draw.arc(box(0.39, 0.47, 0.61, 0.67), start=20, end=160, fill=mouth, width=round(0.045 * unit))
    return layer.resize((size, size), Image.Resampling.LANCZOS)


def icon(size):
    base = gradient(size).convert('RGBA')
    base.alpha_composite(bag(size, mouth=(110, 76, 226, 255)))
    return base.convert('RGB')


def save(image, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, optimize=True)


master = icon(1024)
# iOS: every size listed in the icon set (no transparency, iOS rounds the corners itself).
icons = ROOT / 'ios/Runner/Assets.xcassets/AppIcon.appiconset'
for entry in json.loads((icons / 'Contents.json').read_text())['images']:
    points = float(entry['size'].split('x')[0])
    pixels = round(points * int(entry['scale'][0]))
    save(master.resize((pixels, pixels), Image.Resampling.LANCZOS), icons / entry['filename'])

# Android: legacy icons per density, and an adaptive icon (gradient background + bag foreground in the safe zone).
res = ROOT / 'android/app/src/main/res'
for density, pixels in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
    save(master.resize((pixels, pixels), Image.Resampling.LANCZOS), res / f'mipmap-{density}/ic_launcher.png')
for density, pixels in {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}.items():
    save(bag(pixels, scale=0.62, mouth=(110, 76, 226, 255)), res / f'mipmap-{density}/ic_launcher_foreground.png')

# Launch screens: the bag in indigo on the neutral background (the shop's own colours come right after).
launch = ROOT / 'ios/Runner/Assets.xcassets/LaunchImage.imageset'
for name, pixels in {'LaunchImage.png': 120, 'LaunchImage@2x.png': 240, 'LaunchImage@3x.png': 360}.items():
    glyph = gradient(pixels).convert('RGBA')
    glyph.putalpha(bag(pixels, color=(255, 255, 255, 255)).getchannel('A'))
    save(glyph, launch / name)
for density, pixels in {'mdpi': 120, 'hdpi': 180, 'xhdpi': 240, 'xxhdpi': 360, 'xxxhdpi': 480}.items():
    glyph = gradient(pixels).convert('RGBA')
    glyph.putalpha(bag(pixels, color=(255, 255, 255, 255)).getchannel('A'))
    save(glyph, res / f'drawable-{density}/launch_mark.png')
print('icons written')
