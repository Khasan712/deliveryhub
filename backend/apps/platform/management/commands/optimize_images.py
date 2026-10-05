import logging

from django.core.management.base import BaseCommand
from django_tenants.utils import tenant_context
from PIL import Image, UnidentifiedImageError

from apps.core import images
from apps.core.models import Product
from apps.platform.overview import businesses

logger = logging.getLogger('platform')


class Command(BaseCommand):
    help = ('Shrinks photos uploaded before uploads were optimised (apps.core.images): every product photo gets '
            'its small copy and a full image of at most 1280 px, every logo becomes a 512 px WebP. Safe to run '
            'again: finished ones are skipped. The original files stay where they are.')

    def handle(self, *args, **options):
        counts = {'optimised': 0, 'skipped': 0}
        for business in businesses():
            if business.logo and self.logo_is_big(business.logo):
                counts[self.optimise_logo(business)] += 1
            with tenant_context(business):
                for product in Product.objects.exclude(img='').filter(thumb='').only('id', 'img', 'thumb'):
                    counts[self.optimise_product(product)] += 1
        self.stdout.write(self.style.SUCCESS('{optimised} images optimised, {skipped} skipped'.format(**counts)))

    @staticmethod
    def logo_is_big(field):
        try:
            with field.open('rb') as file, Image.open(file) as image:
                return image.format != 'WEBP' or max(image.size) > images.LOGO
        except (OSError, UnidentifiedImageError):
            return False  # missing or broken: nothing to shrink

    def optimise_logo(self, business):
        try:
            with business.logo.open('rb') as file:
                business.logo = images.logo(file)
        except (OSError, UnidentifiedImageError) as exc:
            logger.warning('Logo of %s not optimised: %s', business.slug, exc)
            return 'skipped'
        business.save(update_fields=['logo'])
        return 'optimised'

    def optimise_product(self, product):
        try:
            with product.img.open('rb') as file:
                product.img, product.thumb = images.product_photos(file)
        except (OSError, UnidentifiedImageError) as exc:  # an old row whose file is gone
            logger.warning('Product %s image not optimised: %s', product.pk, exc)
            return 'skipped'
        product.save(update_fields=['img', 'thumb'])
        return 'optimised'
