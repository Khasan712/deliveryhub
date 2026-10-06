import base64

from django.core.cache import cache
from django.http import Http404, HttpResponse
from django.views import View

from apps.core.models import Product
from apps.platform.icons import shop_icon


class ProductImageView(View):
    """GET /api/v1/products/<id>/image — images of old products that only exist as base64 in the database."""

    def get(self, request, pk):
        product = Product.objects.filter(pk=pk).only('img_64').first()
        if not product or not product.img_64:
            raise Http404
        try:
            data = base64.b64decode(product.img_64)
        except ValueError:
            raise Http404
        if data[:4] == b'\x89PNG':
            content_type = 'image/png'
        elif data[8:12] == b'WEBP':
            content_type = 'image/webp'
        else:
            content_type = 'image/jpeg'
        response = HttpResponse(data, content_type=content_type)
        response['Cache-Control'] = 'public, max-age=86400'
        return response


class ShopIconView(View):
    """GET /api/v1/icon — the shop's icon for the browser tab (64 px, rounded), /icon/touch for the home screen
    (180 px, square): its logo, or a bag on its brand colour (apps/platform/icons.py). Browsers keep it a few
    minutes, so a new logo or colour shows soon after it is saved."""
    touch = False

    def get(self, request):
        business = request.tenant
        key = f'shop-icon:{business.pk}:{int(self.touch)}:{business.logo.name}:{business.brand_color}'
        data = cache.get(key)
        if data is None:
            data = shop_icon(business, touch=self.touch)
            cache.set(key, data, 60 * 60 * 24)
        response = HttpResponse(data, content_type='image/png')
        response['Cache-Control'] = 'public, max-age=300'
        return response
