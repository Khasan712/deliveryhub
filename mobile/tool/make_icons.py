"""Draws the app's mark (DeliveryHub's bag on its way, white on the carrot-orange gradient) at every size the Android
and iOS projects need, from `tool/mark.svg`: `python3 mobile/tool/make_icons.py mobile` (Pillow — e.g.
backend/.venv/bin/python — and rsvg-convert from librsvg: `brew install librsvg`)."""
import io
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(sys.argv[1])
MARK = Path(__file__).with_name('mark.svg')
TOP, BOTTOM = (255, 138, 31), (228, 80, 10)  # #FF8A1F → #E4500A, corner to corner (as on the web)


def gradient(size):
    image = Image.new('RGB', (size, size))
    pixels = image.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            pixels[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(TOP, BOTTOM))
    return image


def mark(size, scale=1.0):
    """The white mark on a transparent square; `scale` shrinks it inside the square (adaptive icon safe zone)."""
    inner = round(size * scale)
    png = subprocess.run(['rsvg-convert', '-w', str(inner), '-h', str(inner), str(MARK)],
                         check=True, capture_output=True).stdout
    layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    layer.alpha_composite(Image.open(io.BytesIO(png)).convert('RGBA'), ((size - inner) // 2, (size - inner) // 2))
    return layer


def icon(size):
    base = gradient(size).convert('RGBA')
    base.alpha_composite(mark(size))
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

# Android: legacy icons per density, and an adaptive icon (gradient background + the mark in the safe zone).
res = ROOT / 'android/app/src/main/res'
for density, pixels in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
    save(master.resize((pixels, pixels), Image.Resampling.LANCZOS), res / f'mipmap-{density}/ic_launcher.png')
for density, pixels in {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}.items():
    save(mark(pixels, scale=0.64), res / f'mipmap-{density}/ic_launcher_foreground.png')

# Launch screens: the mark in orange on the neutral background (the shop's own colours come right after).
launch = ROOT / 'ios/Runner/Assets.xcassets/LaunchImage.imageset'
for name, pixels in {'LaunchImage.png': 120, 'LaunchImage@2x.png': 240, 'LaunchImage@3x.png': 360}.items():
    glyph = gradient(pixels).convert('RGBA')
    glyph.putalpha(mark(pixels).getchannel('A'))
    save(glyph, launch / name)
for density, pixels in {'mdpi': 120, 'hdpi': 180, 'xhdpi': 240, 'xxhdpi': 360, 'xxxhdpi': 480}.items():
    glyph = gradient(pixels).convert('RGBA')
    glyph.putalpha(mark(pixels).getchannel('A'))
    save(glyph, res / f'drawable-{density}/launch_mark.png')
print('icons written')
