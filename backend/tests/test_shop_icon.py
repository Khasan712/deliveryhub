"""A shop's icon for the browser tab and the home screen (docs/api.md, "Shop API" → GET /api/v1/icon): its logo, or a
bag on its brand colour."""
import io

from django.core.files.uploadedfile import SimpleUploadedFile
from django_tenants.utils import get_public_schema_name, schema_context
from PIL import Image

from apps.core import images
from apps.platform.models import Business
from apps.platform.testing import BusinessTestCase


def picture(response):
    image = Image.open(io.BytesIO(response.content))
    image.load()
    return image.convert('RGBA')


def near(pixel, rgb, tolerance=40):
    return sum(abs(a - b) for a, b in zip(pixel[:3], rgb)) <= tolerance


def upload(color, size=(120, 80)):
    buffer = io.BytesIO()
    Image.new('RGB', size, color).save(buffer, 'PNG')
    return SimpleUploadedFile('logo.png', buffer.getvalue(), content_type='image/png')


class ShopIconTests(BusinessTestCase):
    def update(self, **fields):
        with schema_context(get_public_schema_name()):
            business = Business.objects.get(pk=self.tenant.pk)
            for name, value in fields.items():
                setattr(business, name, value)
            business.save()

    def icon(self, path='/api/v1/icon'):
        response = self.shop.get(path)
        self.assertEqual((response.status_code, response['Content-Type']), (200, 'image/png'))
        return picture(response)

    def test_without_a_logo_a_bag_on_the_brand_colour(self):
        self.update(brand_color='#1e5aa8', logo='')
        image = self.icon()
        self.assertEqual(image.size, (64, 64))
        self.assertEqual(image.getpixel((0, 0))[3], 0)  # a rounded corner
        self.assertTrue(near(image.getpixel((9, 9)), (0x1e, 0x5a, 0xa8)), image.getpixel((9, 9)))
        self.assertTrue(near(image.getpixel((32, 50)), (255, 255, 255)), image.getpixel((32, 50)))  # the bag, white

    def test_a_light_brand_gets_a_dark_bag_and_no_colour_the_shop_default(self):
        self.update(brand_color='#fde047', logo='')
        self.assertTrue(near(self.icon().getpixel((32, 50)), (22, 22, 26), 60))
        self.update(brand_color='', logo='')
        self.assertTrue(near(self.icon().getpixel((9, 9)), (0xff, 0x5a, 0x1f)))

    def test_the_logo_covers_the_icon(self):
        self.update(brand_color='#1e5aa8', logo=images.logo(upload((200, 30, 30))))
        tab = self.icon()
        self.assertTrue(near(tab.getpixel((32, 32)), (200, 30, 30)), tab.getpixel((32, 32)))
        self.assertEqual(tab.getpixel((0, 0))[3], 0)
        touch = self.icon('/api/v1/icon/touch')  # the home screen: square, iOS rounds it itself
        self.assertEqual(touch.size, (180, 180))
        self.assertTrue(near(touch.getpixel((0, 0)), (200, 30, 30)), touch.getpixel((0, 0)))
        self.assertEqual(touch.getpixel((0, 0))[3], 255)

    def test_a_new_colour_shows_at_once_on_the_server(self):
        self.update(brand_color='#1e5aa8', logo='')
        before = self.shop.get('/api/v1/icon').content
        self.update(brand_color='#16a34a')
        self.assertNotEqual(self.shop.get('/api/v1/icon').content, before)
        self.assertIn('max-age=300', self.shop.get('/api/v1/icon')['Cache-Control'])
