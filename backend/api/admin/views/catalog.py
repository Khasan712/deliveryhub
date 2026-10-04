from django.db.models import Count, Q
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response

from apps.core.models import Category, Descriptions, Product
from ..serializers import CategorySerializer, ProductSerializer, ProductWriteSerializer, UnitSerializer
from .base import StaffListView, StaffView, search_term


def products():
    return Product.objects.select_related('category', 'measure').order_by('-created_at', '-id')


@extend_schema(parameters=[OpenApiParameter('search', str), OpenApiParameter('category', int),
                           OpenApiParameter('frozen', bool, description='true: only frozen, false: only on sale')])
class ProductListView(StaffListView):
    serializer_class = ProductSerializer

    def get_queryset(self):
        queryset, search = products(), search_term(self.request)
        if search:
            queryset = queryset.filter(Q(name_uz__icontains=search) | Q(name_ru__icontains=search))
        category = self.request.query_params.get('category', '')
        if category.isdigit():
            queryset = queryset.filter(category_id=int(category))
        frozen = self.request.query_params.get('frozen', '')
        if frozen in ('true', 'false'):
            queryset = queryset.filter(is_frozen=frozen == 'true')
        return queryset

    @extend_schema(summary='Add a product', request=ProductWriteSerializer, responses={201: ProductSerializer})
    def post(self, request):
        data = ProductWriteSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        product = data.save_to(Product())
        return Response(ProductSerializer(products().get(pk=product.pk)).data, status=201)


class ProductDetailView(StaffView):
    @extend_schema(responses=ProductSerializer)
    def get(self, request, pk):
        return Response(ProductSerializer(get_object_or_404(products(), pk=pk)).data)

    @extend_schema(summary='Edit a product', request=ProductWriteSerializer, responses=ProductSerializer)
    def patch(self, request, pk):
        product = get_object_or_404(products(), pk=pk)
        data = ProductWriteSerializer(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        data.save_to(product)
        return Response(ProductSerializer(products().get(pk=pk)).data)

    @extend_schema(responses={204: None})
    def delete(self, request, pk):
        get_object_or_404(Product, pk=pk).delete()
        return Response(status=204)


def categories():
    return Category.objects.annotate(products_count=Count('product')).order_by('name_uz', 'id')


class CategoryListView(StaffView):
    @extend_schema(summary='All categories (not paginated)', parameters=[OpenApiParameter('search', str)],
                   responses=CategorySerializer(many=True))
    def get(self, request):
        queryset, search = categories(), search_term(request)
        if search:
            queryset = queryset.filter(Q(name_uz__icontains=search) | Q(name_ru__icontains=search))
        return Response(CategorySerializer(queryset, many=True).data)

    @extend_schema(request=CategorySerializer, responses={201: CategorySerializer})
    def post(self, request):
        data = CategorySerializer(data=request.data)
        data.is_valid(raise_exception=True)
        category = data.save()
        return Response(CategorySerializer(categories().get(pk=category.pk)).data, status=201)


class CategoryDetailView(StaffView):
    @extend_schema(responses=CategorySerializer)
    def get(self, request, pk):
        return Response(CategorySerializer(get_object_or_404(categories(), pk=pk)).data)

    @extend_schema(request=CategorySerializer, responses=CategorySerializer)
    def patch(self, request, pk):
        data = CategorySerializer(get_object_or_404(Category, pk=pk), data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        data.save()
        return Response(CategorySerializer(categories().get(pk=pk)).data)

    @extend_schema(summary='Delete a category (its products stay, without a category)', responses={204: None})
    def delete(self, request, pk):
        get_object_or_404(Category, pk=pk).delete()
        return Response(status=204)


class UnitListView(StaffView):
    @extend_schema(summary='Units of measure', responses=UnitSerializer(many=True))
    def get(self, request):
        return Response(UnitSerializer(Descriptions.objects.order_by('id'), many=True).data)

    @extend_schema(request=UnitSerializer, responses={201: UnitSerializer})
    def post(self, request):
        data = UnitSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        data.save()
        return Response(data.data, status=201)
