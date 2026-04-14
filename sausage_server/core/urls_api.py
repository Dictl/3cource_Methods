from django.urls import path
from . import api_views

urlpatterns = [
    path('tree/', api_views.api_tree, name='api_tree'),
    path('category/<int:category_id>/products/', api_views.api_category_products, name='api_category_products'),
    path('search/', api_views.api_search, name='api_search'),
    path('category/add/', api_views.api_add_category, name='api_add_category'),
    path('product/add/', api_views.api_add_product, name='api_add_product'),
    path('delete/', api_views.api_delete, name='api_delete'),
    path('category/move/', api_views.api_move_category, name='api_move_category'),
    path('category/reorder/', api_views.api_reorder_category, name='api_reorder_category'),
]