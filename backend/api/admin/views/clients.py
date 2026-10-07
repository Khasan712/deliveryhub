from django.db.models import Count, Q
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response

from apps.core.enums import OrderEnum
from apps.core.models import Client
from ..serializers import ClientSerializer, ClientUpdateSerializer, OrderSummarySerializer
from .base import StaffListView, StaffView, search_term
from .orders import orders, with_lines


def clients():
    return Client.objects.annotate(
        orders_count=Count('order', filter=~Q(order__status=OrderEnum.new.value))
    ).order_by('-created_at')


@extend_schema(summary='Customers, newest first', parameters=[OpenApiParameter('search', str)])
class ClientListView(StaffListView):
    serializer_class = ClientSerializer

    def get_queryset(self):
        queryset, search = clients(), search_term(self.request)
        if search:
            queryset = queryset.filter(
                Q(first_name__icontains=search) | Q(last_name__icontains=search) | Q(phone__icontains=search)
                | Q(tg_phone__icontains=search) | Q(tg_nick__icontains=search)
            )
        return queryset


ClientDetail = inline_serializer('ClientDetail', {
    **ClientSerializer().get_fields(),
    'location': serializers.CharField(),
    'orders': OrderSummarySerializer(many=True),
})


def client_detail(client):
    client_orders = with_lines(orders().filter(client=client))
    return {
        **ClientSerializer(client).data,
        'location': client.location or '',
        'orders': OrderSummarySerializer(client_orders, many=True).data,
    }


class ClientDetailView(StaffView):
    @extend_schema(summary='A customer with their orders', responses=ClientDetail)
    def get(self, request, pk):
        return Response(client_detail(get_object_or_404(clients(), pk=pk)))

    @extend_schema(summary='Edit a customer', request=ClientUpdateSerializer, responses=ClientDetail)
    def patch(self, request, pk):
        client = get_object_or_404(clients(), pk=pk)
        data = ClientUpdateSerializer(client, data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        data.save()
        return Response(client_detail(get_object_or_404(clients(), pk=pk)))
