from django.urls import path
from . import api_views

####################### классификатор (categories) ###########################
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
    path('categories/delete/', api_views.api_delete_category, name='api_delete_category'),
    path('products/delete/', api_views.api_delete_product, name='api_delete_product'),
    path('products/', api_views.api_products, name='api_products'),
    path('products/add/', api_views.api_add_product, name='api_add_product'),
    path('products/<int:product_id>/', api_views.api_product, name='api_product'),

###################################### enums ##########################################
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
    path("product/<int:product_id>/enums/", api_views.api_product_enums, name="api_product_enums"),
    path("product-attributes/delete", api_views.api_delete_product_attribute, name="api_delete_product_attribute"),

######################## параметры (parameters) ##################################
    # Управление определениями параметров
    path('parameters/', api_views.api_parameters, name='api_parameters'),
    path('parameters/for-category/<int:category_id>/', api_views.api_parameters_for_category, name='api_parameters_for_category'),   # было parameters/class/..., переименовал для единообразия
    path('parameters/create/', api_views.api_create_parameter, name='api_create_parameter'),
    path('parameters/update/', api_views.api_update_parameter, name='api_update_parameter'),
    path('parameters/delete/', api_views.api_delete_parameter, name='api_delete_parameter'),

    # Ограничения для числовых параметров (новые)
    path('parameter-constraint/get/', api_views.api_get_parameter_constraint, name='api_get_parameter_constraint'),
    path('parameter-constraint/create/', api_views.api_create_parameter_constraint, name='api_create_parameter_constraint'),
    path('parameter-constraint/update/', api_views.api_update_parameter_constraint, name='api_update_parameter_constraint'),
    path('parameters/<int:param_def_id>/constraint/delete/', api_views.api_delete_parameter_constraint,name='api_delete_parameter_constraint'),

    # Единицы измерения (Яна)
    path('unit-dimensions/create/', api_views.api_create_unit_dimension, name='api_create_unit_dimension'),
    path('unit-dimensions/delete/', api_views.api_delete_unit_dimension, name='api_delete_unit_dimension'),
    path('units/create/', api_views.api_create_unit, name='api_create_unit'),
    path('units/delete/', api_views.api_delete_unit, name='api_delete_unit'),

    # Значения параметров для продуктов (Яна)
    path('product-parameters/create/', api_views.api_create_product_parameter_value, name='api_create_product_parameter_value'),
    path('product-parameters/update/', api_views.api_update_product_parameter_value, name='api_update_product_parameter_value'),
    path('product-parameters/delete/', api_views.api_delete_product_parameter_value, name='api_delete_product_parameter_value'),

    # Дополнительные GET-эндпоинты для чтения значений (Валера)
    path('products/<int:product_id>/parameter-values/', api_views.api_product_parameter_values, name='api_product_parameter_values'),
    path('products/<int:product_id>/parameter-values/<int:param_def_id>/', api_views.api_get_parameter_value, name='api_get_parameter_value'),

    # Поиск и фильтрация продуктов (Яна)
    path('products/for-category/<int:category_id>/with-params/', api_views.api_products_with_params, name='api_products_with_params'),
    path('products/for-category/<int:category_id>/filter/', api_views.api_filter_products_by_params, name='api_filter_products_by_params'),

    # Агрегаты параметров (Валера)
    path('aggregates/parameter-aggregates/', api_views.api_parameter_aggregates, name='api_parameter_aggregates'),
    path('aggregates/refresh/', api_views.api_refresh_aggregates, name='api_refresh_aggregates'),
]
