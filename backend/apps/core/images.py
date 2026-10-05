"""Uploaded photos are kept at the size a phone shows them, not the size a camera takes them: a 5 MB upload would
cost every customer megabytes on mobile data. A product photo becomes two WebP files — FULL px for the product
sheet and THUMB px for cards and lists — and a logo one LOGO px file. Each gets a new random name, so a file at
an address never changes and browsers may cache it for good."""
import uuid
from io import BytesIO

from django.core.files.base import ContentFile
from PIL import Image, ImageOps

FULL = 1280
THUMB = 512
LOGO = 512
QUALITY = 80


def _open(upload):
    """The upload as RGB (or RGBA when it is see-through), turned the way the camera held it."""
    upload.seek(0)
    image = Image.open(upload)
    # JPEG only: decode a camera photo straight at a fraction of its size — far less memory and time.
    image.draft('RGB', (FULL, FULL))
    image = ImageOps.exif_transpose(image)
    transparent = image.mode in ('RGBA', 'LA', 'PA') or (image.mode == 'P' and 'transparency' in image.info)
    return image.convert('RGBA' if transparent else 'RGB')


def _webp(image, size, name):
    copy = image.copy()
    copy.thumbnail((size, size), Image.Resampling.LANCZOS)
    buffer = BytesIO()
    copy.save(buffer, 'WEBP', quality=QUALITY)
    return ContentFile(buffer.getvalue(), name=name)


def product_photos(upload):
    """(full, thumb) files of a product photo, named <random>.webp and <random>.thumb.webp."""
    image, stem = _open(upload), uuid.uuid4().hex
    return _webp(image, FULL, f'{stem}.webp'), _webp(image, THUMB, f'{stem}.thumb.webp')


def logo(upload):
    return _webp(_open(upload), LOGO, f'{uuid.uuid4().hex}.webp')
