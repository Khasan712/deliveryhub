#!/bin/sh
# The icons of DeliveryHub's own pages — our page for businesses (landing/), our panel (deliveryhub-ui/) and the
# businesses' admin panel (admin-ui/) — from the mark, deliveryhub-ui/src/assets/mark.svg: a favicon.ico for
# browsers that take no SVG icon (and ask for /favicon.ico on their own) and Apple's home-screen icon (180 px,
# square: iOS rounds it itself). Needs rsvg-convert (brew install librsvg) and Pillow (backend/.venv).
set -eu
cd "$(dirname "$0")/.."
python=${PYTHON:-backend/.venv/bin/python}
mark=deliveryhub-ui/src/assets/mark.svg
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

sed 's/rx="9"/rx="0"/' "$mark" > "$work/square.svg"
rsvg-convert -w 180 -h 180 "$work/square.svg" -o "$work/touch.png"
rsvg-convert -w 256 -h 256 "$mark" -o "$work/ico.png"
"$python" -c "from PIL import Image; Image.open('$work/ico.png').save('$work/favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])"

cp "$work/touch.png" landing/public/icons/apple-touch-icon.png
cp "$work/favicon.ico" landing/public/icons/favicon.ico
cp "$work/touch.png" deliveryhub-ui/src/assets/apple-touch-icon.png
cp "$work/favicon.ico" deliveryhub-ui/public/favicon.ico
if [ -d admin-ui/src/assets ]; then
  cp "$mark" admin-ui/src/assets/mark.svg
  cp "$work/touch.png" admin-ui/src/assets/apple-touch-icon.png
  cp "$work/favicon.ico" admin-ui/public/favicon.ico
fi
echo "web icons written"
