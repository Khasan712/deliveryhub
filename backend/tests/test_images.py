"""Uploaded photos are stored small (apps/core/images.py): WebP, the full image up to 1280 px, a 512 px copy for
cards and lists, logos 512 px."""
import io

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django_tenants.utils import get_public_schema_name, schema_context
from PIL import Image

from apps.core.models import Product, User
from apps.platform.models import Business
from .helpers import make_catalog, png
from .test_platform_api import PlatformTestCase

EXIF_ORIENTATION = 0x0112


def camera_photo(width=3000, height=2000, rotated=False, name='IMG_0001.jpg'):
    """A JPEG the way a phone takes it; `rotated`: stored sideways with the turn written in EXIF."""
    image = Image.new('RGB', (width, height), (200, 120, 40))
    exif = Image.Exif()
    if rotated:
        exif[EXIF_ORIENTATION] = 6  # turn 90° clockwise to show it
    buffer = io.BytesIO()
    image.save(buffer, 'JPEG', quality=95, exif=exif)
    return SimpleUploadedFile(name, buffer.getvalue(), content_type='image/jpeg')


def stored(url):
    """The image behind a /media/<business>/… address of this test business."""
    name = url.split('/media/test_business/', 1)[1]
    with default_storage.open(name) as file:
        image = Image.open(file)
        image.load()
    return image


class ProductPhotoTests(PlatformTestCase):
    def setUp(self):
        super().setUp()
        self.client.force_login(User.objects.create_user(phone_number='+998900000001', role='admin',
                                                         password='pass-12345'))

    def upload(self, photo):
        response = self.client.post('/api/v1/products', {'name_uz': 'Osh', 'name_ru': 'Плов', 'price': '45000',
                                                         'image': photo}, format='multipart')
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()

    def test_a_camera_photo_is_stored_small_and_upright(self):
        data = self.upload(camera_photo(rotated=True))
        self.assertRegex(data['image'], r'^/media/test_business/products/[0-9a-f]{32}\.webp$')
        self.assertRegex(data['thumb'], r'^/media/test_business/products/[0-9a-f]{32}\.thumb\.webp$')
        full, thumb = stored(data['image']), stored(data['thumb'])
        self.assertEqual((full.format, full.size), ('WEBP', (853, 1280)))  # 3000×2000 sideways → portrait
        self.assertEqual((thumb.format, thumb.size), ('WEBP', (341, 512)))

        shop = next(p for p in self.shop.get('/api/v1/shop').json()['products'] if p['id'] == data['id'])
        self.assertEqual((shop['image'], shop['thumb']), (data['image'], data['thumb']))

    def test_small_and_see_through_images_stay_as_they_are(self):
        buffer = io.BytesIO()
        Image.new('RGBA', (300, 200), (0, 0, 0, 0)).save(buffer, 'PNG')
        data = self.upload(SimpleUploadedFile('cola.png', buffer.getvalue(), content_type='image/png'))
        full = stored(data['image'])
        self.assertEqual((full.size, full.mode), ((300, 200), 'RGBA'))

    def test_without_a_small_copy_the_full_image_is_the_thumb(self):
        _, _, burger, _ = make_catalog()
        Product.objects.filter(pk=burger.pk).update(img=default_storage.save('products/old.png', png()))
        product = next(p for p in self.shop.get('/api/v1/shop').json()['products'] if p['id'] == burger.id)
        self.assertEqual(product['thumb'], product['image'])
        self.assertTrue(product['image'].endswith('/products/old.png'))

    def test_photos_uploaded_before_are_optimised_by_a_command(self):
        _, _, burger, cola = make_catalog()
        old = default_storage.save('products/big.jpg', ContentFile(camera_photo(2400, 1600).read()))
        Product.objects.filter(pk=burger.pk).update(img=old)
        Product.objects.filter(pk=cola.pk).update(img='products/gone.jpg')  # an old row whose file is gone
        with schema_context(get_public_schema_name()):
            Business.objects.filter(pk=self.tenant.pk).update(logo='')

        out = io.StringIO()
        call_command('optimize_images', stdout=out)
        self.assertIn('1 images optimised, 1 skipped', out.getvalue())
        burger.refresh_from_db()
        self.assertTrue(burger.img.name.endswith('.webp') and burger.thumb.name.endswith('.thumb.webp'))
        self.assertTrue(default_storage.exists(old))  # the original is kept
        call_command('optimize_images', stdout=out)  # again: nothing left to do
        self.assertIn('0 images optimised, 1 skipped', out.getvalue())


class LogoTests(PlatformTestCase):
    def test_a_logo_is_a_small_webp(self):
        self.sign_in()
        big = io.BytesIO()
        Image.new('RGBA', (1500, 1500), (255, 0, 0, 255)).save(big, 'PNG')
        response = self.hub.patch('/api/v1/businesses/test-shop',
                                  {'logo': SimpleUploadedFile('logo.png', big.getvalue(), content_type='image/png')},
                                  format='multipart')
        logo = response.json()['logo']
        self.assertRegex(logo, r'^/media/public/logos/[0-9a-f]{32}\.webp$')
        with schema_context(get_public_schema_name()):
            business = Business.objects.get(pk=self.tenant.pk)
            with business.logo.open('rb') as file, Image.open(file) as image:
                self.assertEqual((image.format, image.size), ('WEBP', (512, 512)))
