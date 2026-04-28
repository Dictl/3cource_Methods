from django.urls import path
from . import api_views

urlpatterns = [
    path('tree/', api_views.api_tree, name='api_tree'),
    path('categories/', api_views.api_categories, name='api_categories'),
    path('categories/add/', api_views.api_add_category, name='api_add_category'),
    path('categories/move/', api_views.api_move_category, name='api_move_category'),
    path('categories/reorder/', api_views.api_reorder_category, name='api_reorder_category'),
    path('categories/move-metadata/', api_views.api_nodes_move_metadata, name='api_nodes_move_metadata'),
    path('categories/<int:category_id>/', api_views.api_category, name='api_category'),
    path('categories/<int:category_id>/products/', api_views.api_category_products, name='api_category_products'),
    path('categories/<int:category_id>/children/', api_views.api_get_children, name='api_get_children'),
    path('categories/<int:category_id>/parents/', api_views.api_get_parents, name='api_get_parents'),
    path('categories/<int:category_id>/terminals/', api_views.api_get_terminals, name='api_get_terminals'),
    path('categories/delete/', api_views.api_delete_category, name='api_delete'),
    path('products/delete/', api_views.api_delete_product, name='api_delete'),
    path('products/', api_views.api_products, name='api_products'),
    path('products/add/', api_views.api_add_product, name='api_add_product'),
    path('products/<int:product_id>/', api_views.api_product, name='api_product'),

# enums
    path('enums/', api_views.api_enums_all, name='api_enums_all'),
    path('enums/<int:enum_definition_id>/', api_views.api_enum_definition, name='api_enum_definition'),
    path('enums/create/', api_views.api_create_enum_definition, name='api_create_enum_definition'),
    path('enums/for-class-tree/<int:classifier_node_id>/', api_views.api_enums_for_class_tree, name='api_enums_for_class_tree'),
    path('enum-values/add/', api_views.api_add_enum_value, name='api_add_enum_value'),
    path('enum-values/delete/', api_views.api_delete_enum_value, name='api_delete_enum_value'),
    path('enum-values/reorder/', api_views.api_reorder_enum_value, name='api_reorder_enum_value'),
    path('enum-definitions/delete/', api_views.api_delete_enum_definition, name='api_delete_enum_definition'),
    path('product-attributes/', api_views.api_product_attribute_values, name='api_product_attribute_values'),
    path('product-attributes/assign/', api_views.api_assign_enum_value_to_product, name='api_assign_enum_value_to_product'),
]
