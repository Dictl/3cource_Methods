import json
from django.shortcuts import get_object_or_404
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from core.models import (
    ClassifierNode, Product, EnumDefinition, EnumValue, ProductAttributeValue,
    ParameterDefinition, ProductParameterValue, ParameterNumericConstraint,
    Unit, UnitDimension
)
from django.db import connection
from django.views.decorators.csrf import csrf_exempt
from .permissions import admin_required, viewer_or_admin, viewer_allowed

from .service import (
    add_category,
    add_product,
    base_output,
    base_product_output,
    build_tree_with_levels,
    display_parent_product,
    move_category,
    reorder_category,
    search_child_nodes,
    search_delete_category,
    search_delete_product,
    search_parent_nodes,
    has_children,
    get_enum_definition_with_values,
    get_all_enums_with_values,
    reorder_enum_value,
    create_enum_definition,
    add_enum_value,
    delete_enum_value,
    delete_enum_definition,
    enum_definitions_for_class_tree,
    assign_enum_value_to_product,
    product_attribute_values_output,
    get_product_enums,
    delete_product_attribute,
    get_all_parameter_definition,
    get_class_parameters_with_inheritance,
    create_unit_dimension,
    delete_unit_dimension,
    create_unit,
    delete_unit,
    create_parameter_definition,
    delete_parameter_definition,
    update_parameter_definition,
    create_product_parameter_value,
    update_product_parameter_value,
    delete_product_parameter_value,
    find_products_with_params_and_attrs,
    filter_products_by_parameters,
    filter_products_by_parameters_without_class,
)


def _json_error(message, status=400):
    return JsonResponse({"ok": False, "error": message}, status=status)


def _parse_json(request):
    try:
        return json.loads(request.body.decode("utf-8"))
    except (TypeError, ValueError):
        raise ValueError("Некорректный JSON")


def _serialize_product(product):
    return {
        "id": product.id,
        "name": product.name,
        "sku": product.sku,
        "price": product.price,
        "supplier": product.supplier,
        "weight_gram": product.weight_gram,
        "classifier_node_id": product.classifier_node_id,
    }


def _serialize_enum_definition(ed):
    return {
        "id": ed.id,
        "classifier_node_id": ed.classifier_node_id,
        "description": ed.description,
    }

def _serialize_enum_value(ev):
    return {
        "id": ev.id,
        "enum_definition_id": ev.enum_definition_id,
        "value_str": ev.value_str,
        "value_int": ev.value_int,
        "value_real": ev.value_real,
        "sort_order": ev.sort_order,
    }

def _serialize_product_attribute_value(pav):
    return {
        "id": pav.id,
        "product_id": pav.product_id,
        "enum_value_id": pav.enum_value_id,
    }

def _serialize_unit_dimension(ud):
    return {"id": ud.id, "name": ud.name}

def _serialize_unit(u):
    return {
        "id": u.id,
        "dimension_id": u.dimension_id,
        "dimension_name": u.dimension.name if hasattr(u, 'dimension') and u.dimension else None,
        "name": u.name,
        "symbol": u.symbol,
        "to_base_factor": float(u.to_base_factor) if u.to_base_factor else None,
        "to_base_offset": float(u.to_base_offset) if u.to_base_offset else None,
    }

def _serialize_parameter_definition(pd):
    return {
        "id": pd.id,
        "classifier_node_id": pd.classifier_node_id,
        "name": pd.name,
        "unit_id": pd.unit_id,
        "value_type": pd.value_type,
        "sort_order": pd.sort_order,
    }

def _serialize_product_parameter_value(ppv):
    return {
        "id": ppv.id,
        "product_id": ppv.product_id,
        "parameter_definition_id": ppv.parameter_definition_id,
        "value_str": ppv.value_str,
        "value_int": ppv.value_int,
        "value_real": float(ppv.value_real) if ppv.value_real is not None else None,
        "value_enum_id": ppv.value_enum_id,
    }

"Построение дерева категорий (classifier_node) с учетом уровня вложенности (level для древовидного вывода)"
@require_http_methods(["GET"])
@viewer_or_admin
def api_tree(request):
    nodes = build_tree_with_levels(base_output())
    data = [
        {
            "id": n.id,
            "name": n.name,
            "parent_id": n.parent_id,
            "level": getattr(n, "level", 0),
            "unit": n.unit,
            "sort_order": n.sort_order,
        }
        for n in nodes
    ]
    return JsonResponse({"ok": True, "data": data})

"Получение продуктов для выбранной категории (и всех подкатегорий) по её id"
@require_http_methods(["GET"])
@viewer_or_admin
def api_category_products(request, category_id):
    all_categories = base_output()
    all_products = base_product_output()

    selected_category = get_object_or_404(ClassifierNode, id=category_id)
    _, products = display_parent_product(all_categories, all_products, category_id)

    return JsonResponse(
        {
            "ok": True,
            "data": {
                "category": {
                    "id": selected_category.id,
                    "name": selected_category.name,
                    "parent_id": selected_category.parent_id,
                },
                "products": [_serialize_product(p) for p in products],
            },
        }
    )

"Получение всех дочерних (потомков) для данной категории (classifier_node.id)"
@require_http_methods(["GET"])
@viewer_or_admin
def api_get_children(request, category_id):
    all_cats = base_output()
    category = get_object_or_404(ClassifierNode, id=category_id)
    descendants = search_child_nodes(all_cats, category_id)
    return JsonResponse({"ok": True, "data": {
        "category": {"id": category.id, "name": category.name, "parent_id": category.parent_id},
        "children": [{"id": c.id, "name": c.name, "parent_id": c.parent_id} for c in descendants]
    }})

"Получение родителей для заданной категории (classifier_node.id)"
@require_http_methods(["GET"])
@viewer_or_admin
def api_get_parents(request, category_id):
    all_cats = base_output()
    category = get_object_or_404(ClassifierNode, id=category_id)
    parents = search_parent_nodes(all_cats, category_id)
    return JsonResponse({"ok": True, "data": {
        "category": {"id": category.id, "name": category.name, "parent_id": category.parent_id},
        "parents": [{"id": p.id, "name": p.name, "parent_id": p.parent_id} for p in parents]
    }})

"Получение всех терминальных узлов в поддереве выбранной категории"
@require_http_methods(["GET"])
@viewer_or_admin
def api_get_terminals(request, category_id):
    all_cats = base_output()
    category = get_object_or_404(ClassifierNode, id=category_id)
    descendants = search_child_nodes(all_cats, category_id)
    descendants.append(category)
    terminal_nodes = [n for n in descendants if not has_children(all_cats, n.id)]
    return JsonResponse({"ok": True, "data": {
        "category": {"id": category.id, "name": category.name, "parent_id": category.parent_id},
        "terminal_nodes": [{"id": n.id, "name": n.name, "parent_id": n.parent_id} for n in terminal_nodes]
    }})

"Добавление новой категории (classifier_node) — имя обязательно, к терминальному узлу добавить нельзя"
@require_http_methods(["POST"])
@admin_required
def api_add_category(request):
    try:
        payload = _parse_json(request)
        name = (payload.get("name") or "").strip()
        if not name:
            return _json_error("Название категории обязательно")

        parent_id = payload.get("parent_id")
        parent_id = None if parent_id in ("", None) else int(parent_id)
        unit = payload.get("unit")

        category = add_category(name, parent_id, unit)
        return JsonResponse(
            {
                "ok": True,
                "data": {
                    "id": category.id,
                    "name": category.name,
                    "parent_id": category.parent_id,
                    "unit": category.unit,
                },
            }
        )
    except ValueError as e:
        return _json_error(str(e))

"Добавление нового продукта (product) в категорию. Нельзя добавить к нетерминальному узлу"
@require_http_methods(["POST"])
@admin_required
def api_add_product(request):
    try:
        payload = _parse_json(request)
        name = (payload.get("name") or "").strip()
        if not name:
            return _json_error("Название товара обязательно")

        category_id = payload.get("parent_id")
        if category_id in ("", None):
            return _json_error("Для товара нужно выбрать родительскую категорию")

        product = add_product(
            name=name,
            category_id=int(category_id),
            sku=(payload.get("sku") or "").strip() or None,
            price=int(payload.get("price")),
            supplier=(payload.get("supplier") or "").strip(),
            weight_gram=int(payload.get("weight_gram")),
        )
        return JsonResponse({"ok": True, "data": _serialize_product(product)})
    except (TypeError, ValueError) as e:
        return _json_error(str(e))

"Перемещение категории (classifier_node) к другому родителю. Запрещено перемещать в терминальную категорию с товарами или делать цикл"
@require_http_methods(["PUT"])
@admin_required
def api_move_category(request):
    try:
        payload = _parse_json(request)
        category_id = int(payload.get("category_id"))
        new_parent_id = payload.get("new_parent_id")
        new_parent_id = None if new_parent_id in ("", None) else int(new_parent_id)
        if Product.objects.filter(classifier_node_id=new_parent_id).exists():
            raise ValueError("Нельзя переместить категорию в терминальный узел, содержащий товары")

        move_category(category_id, new_parent_id)
        return JsonResponse({"ok": True, "message": "Категория перемещена"})
    except ValueError as e:
        return _json_error(str(e))

"Изменение порядка расстановки категорий (classifier_node) среди братьев на одном уровне"
@require_http_methods(["PUT"])
@admin_required
def api_reorder_category(request):
    try:
        payload = _parse_json(request)
        category_id = int(payload.get("category_id"))
        target_position_id = payload.get("target_position_id")
        target_position_id = None if target_position_id in ("", None) else int(target_position_id)

        reorder_category(category_id, target_position_id)
        return JsonResponse({"ok": True, "message": "Порядок обновлен"})
    except ValueError as e:
        return _json_error(str(e))

"""Получить дополнительную мета-информацию для интерфейса выбора новой родительской категории при перемещении
    Возвращает, можно ли переместить в ту или иную вершину, и причину блокировки (например, 'cycle', 'terminal')
"""
@require_http_methods(["GET"])
@viewer_or_admin
def api_nodes_move_metadata(request):
    moving_node_id = request.GET.get("node_id")
    if not moving_node_id:
        return _json_error("node_id required")

    all_base = base_output()
    all_products = base_product_output()
    moving_node_id = int(moving_node_id)

    child_ids = {child.id for child in search_child_nodes(all_base, moving_node_id)} | {moving_node_id}
    terminal_ids = {p.classifier_node_id for p in all_products}

    result = []
    for node in build_tree_with_levels(all_base):
        reason = None
        if node.id in child_ids:
            reason = "cycle"
        elif node.id in terminal_ids:
            reason = "terminal"

        result.append({
            "id": node.id,
            "name": node.name,
            "level": node.level,  # type: ignore
            "disabled": reason is not None,
            "reason": reason
        })

    return JsonResponse({"nodes": result})

"Получение информации о категории (classifier_node) и всех её потомках"
@require_http_methods(["GET"])
@viewer_or_admin
def api_category(request, category_id):
    category_id = int(category_id)
    category = get_object_or_404(ClassifierNode, id=category_id)

    # Получаем информацию о категории
    category_data = {
        "id": category.id,
        "name": category.name,
        "parent_id": category.parent_id,
        "unit": category.unit,
        "sort_order": category.sort_order,
    }

    descendants = search_child_nodes(base_output(), category_id)
    descendants_data = [
        {
            "id": d.id,
            "name": d.name,
            "parent_id": d.parent_id,
        }
        for d in descendants
    ]

    return JsonResponse({
        "ok": True,
        "data": {
            "category": category_data,
            "descendants": descendants_data
        }
    })

"Получение списка всех категорий (classifier_node)"
@require_http_methods(["GET"])
@viewer_or_admin
def api_categories(request):
    all_base = base_output()
    data = [
        {
            "id": node.id,
            "name": node.name,
            "parent_id": node.parent_id,
            "unit": node.unit,
            "sort_order": node.sort_order,
        }
        for node in all_base
    ]
    return JsonResponse({"ok": True, "data": data})

"Получение списка всех товаров (product)"
@require_http_methods(["GET"])
@viewer_or_admin
def api_products(request):
    all_products = base_product_output()
    data = [
        {
            "id": product.id,
            "name": product.name,
            "sku": product.sku,
            "price": product.price,
            "supplier": product.supplier,
            "weight_gram": product.weight_gram,
            "classifier_node_id": product.classifier_node_id,
        }
        for product in all_products
    ]
    return JsonResponse({"ok": True, "data": data})

"Получение подробной информации по отдельному товару (product) по id"
@require_http_methods(["GET"])
@viewer_or_admin
def api_product(request, product_id):
    product_id = int(product_id)
    product = get_object_or_404(Product, id=product_id)
    data = _serialize_product(product)
    return JsonResponse({"ok": True, "data": data})

"Удаление категории (classifier_node) по id (с проверкой, что в ней нет товаров и терминалов с товарами)"
@require_http_methods(["DELETE"])
@admin_required
def api_delete_category(request):
    try:
        payload = _parse_json(request)
        category_id = int(payload.get("delete_id"))
        search_delete_category(category_id)
        return JsonResponse({"ok": True})
    except (ValueError, KeyError) as e:
        return _json_error(str(e))

"Удаление товара (product) по id"
@require_http_methods(["DELETE"])
@admin_required
def api_delete_product(request):
    try:
        payload = _parse_json(request)
        product_id = int(payload.get("delete_id"))
        search_delete_product(product_id)
        return JsonResponse({"ok": True})
    except (ValueError, KeyError) as e:
        return _json_error(str(e))

########################################################################################################################
"для перечислений"
########################################################################################################################
"Получить описание перечисления (enum_definition) и все значения (enum_value) для него"
@require_http_methods(["GET"])
@viewer_or_admin
def api_enum_definition(request, enum_definition_id):
    try:
        ed, values = get_enum_definition_with_values(enum_definition_id)
        return JsonResponse({
            "ok": True,
            "data": {
                "enum_definition": _serialize_enum_definition(ed),
                "values": [_serialize_enum_value(v) for v in values],
            }
        })
    except ValueError as e:
        return _json_error(str(e))

"Получить все перечисления (enum_definition) с их значениями (enum_value)"
@require_http_methods(["GET"])
@viewer_or_admin
def api_enums_all(request):
    # возвращаем все enum_definition с их values
    result = get_all_enums_with_values()
    data = []
    for item in result:
        ed = item["enum_definition"]
        vals = item["values"]
        data.append({
            "enum_definition": _serialize_enum_definition(ed),
            "values": [_serialize_enum_value(v) for v in vals],
        })
    return JsonResponse({"ok": True, "data": data})

"Получить все перечисления (enum_definition), определённые для категории и её потомков"
@require_http_methods(["GET"])
@viewer_or_admin
def api_enums_for_class_tree(request, classifier_node_id):
    try:
        enum_defs = enum_definitions_for_class_tree(classifier_node_id)
        return JsonResponse({
            "ok": True,
            "data": [_serialize_enum_definition(ed) for ed in enum_defs]
        })
    except ValueError as e:
        return _json_error(str(e))

"Создание нового перечисления (enum_definition) для категории (classifier_node)"
@csrf_exempt
@require_http_methods(["POST"])
@admin_required
def api_create_enum_definition(request):
    try:
        payload = _parse_json(request)
        classifier_node_id = payload.get("classifier_node_id")
        description = payload.get("description")

        if classifier_node_id in (None, ""):
            return _json_error("classifier_node_id обязателен")

        ed = create_enum_definition(int(classifier_node_id), description)
        return JsonResponse({"ok": True, "data": _serialize_enum_definition(ed)})
    except (TypeError, ValueError) as e:
        return _json_error(str(e))

"Добавление нового значения перечисления (enum_value) в выбранное перечисление (enum_definition)"
@csrf_exempt
@require_http_methods(["POST"])
@viewer_allowed
def api_add_enum_value(request):
    try:
        payload = _parse_json(request)
        enum_definition_id = payload.get("enum_definition_id")
        value_str = payload.get("value_str")
        value_int = payload.get("value_int")
        value_real = payload.get("value_real")

        if enum_definition_id in (None, ""):
            return _json_error("enum_definition_id обязателен")

        if value_int in ("", None):
            value_int = None
        else:
            value_int = int(value_int)

        if value_real in ("", None):
            value_real = None
        else:
            value_real = float(value_real)

        ev = add_enum_value(
            int(enum_definition_id),
            value_str=value_str,
            value_int=value_int,
            value_real=value_real,
        )
        return JsonResponse({"ok": True, "data": _serialize_enum_value(ev)})
    except (TypeError, ValueError) as e:
        return _json_error(str(e))

"Удалить значение перечисления (enum_value) по его id"
@csrf_exempt
@require_http_methods(["DELETE"])
@viewer_allowed
def api_delete_enum_value(request):
    try:
        payload = _parse_json(request)
        enum_value_id = payload.get("enum_value_id")
        if enum_value_id in (None, ""):
            return _json_error("enum_value_id обязателен")

        delete_enum_value(int(enum_value_id))
        return JsonResponse({"ok": True, "data": {"deleted": int(enum_value_id)}})
    except (TypeError, ValueError) as e:
        return _json_error(str(e))

"Удалить перечисление (enum_definition), если оно пустое (нет ни одного enum_value)"
@csrf_exempt
@require_http_methods(["DELETE"])
@admin_required
def api_delete_enum_definition(request):
    try:
        payload = _parse_json(request)
        enum_definition_id = payload.get("enum_definition_id")
        if enum_definition_id in (None, ""):
            return _json_error("enum_definition_id обязателен")

        delete_enum_definition(int(enum_definition_id))
        return JsonResponse({"ok": True, "data": {"deleted": int(enum_definition_id)}})
    except (TypeError, ValueError) as e:
        return _json_error(str(e))

"Изменить порядок enum_value внутри одного перечисления (enum_definition)"
@csrf_exempt
@require_http_methods(["PUT"])
@viewer_allowed
def api_reorder_enum_value(request):
    try:
        payload = _parse_json(request)
        enum_value_id = payload.get("enum_value_id")
        target_position_id = payload.get("target_position_id")

        if enum_value_id in (None, ""):
            return _json_error("enum_value_id обязателен")

        if target_position_id in ("", None):
            target_position_id = None
        else:
            target_position_id = int(target_position_id)

        reorder_enum_value(int(enum_value_id), target_position_id)
        return JsonResponse({"ok": True, "message": "Порядок enum_value обновлен"})
    except (TypeError, ValueError, EnumValue.DoesNotExist) as e:
        return _json_error(str(e))

"Назначить значение перечисления (enum_value) товару (product)"
@csrf_exempt
@require_http_methods(["POST"])
@viewer_allowed
def api_assign_enum_value_to_product(request):
    try:
        payload = _parse_json(request)
        product_id = payload.get("product_id")
        enum_value_id = payload.get("enum_value_id")

        if product_id in (None, ""):
            return _json_error("product_id обязателен")

        if enum_value_id in ("", None):
            enum_value_id = None
        else:
            enum_value_id = int(enum_value_id)

        pav = assign_enum_value_to_product(int(product_id), enum_value_id)
        return JsonResponse({"ok": True, "data": _serialize_product_attribute_value(pav)})
    except (TypeError, ValueError) as e:
        return _json_error(str(e))

"Получить все product_attribute_value (атрибуты товаров, отношение товар/значение enum)"
@require_http_methods(["GET"])
@viewer_or_admin
def api_product_attribute_values(request):
    pavs = product_attribute_values_output()
    return JsonResponse({
        "ok": True,
        "data": [_serialize_product_attribute_value(p) for p in pavs]
    })

"Получить все характеристики-атрибуты для товара (product) по его id"
@require_http_methods(["GET"])
@viewer_or_admin
def api_product_enums(request, product_id):
    try:
        product = Product.objects.get(id=product_id)
    except Product.DoesNotExist:
        return JsonResponse({"ok": False, "error": "Product not found"}, status=404)

    enums = get_product_enums(product.id)

    seen = set()
    enums_unique = []
    for item in enums:
        key = (item["enum_definition"]["id"], item["enum_value"]["id"])
        if key not in seen:
            seen.add(key)
            enums_unique.append(item)

    return JsonResponse({
        "product": {
            "id": product.id,
            "name": product.name,
        },
        "enums": enums_unique
    })

"Удалить аттрибут товара (product_attribute_value) по id"
@csrf_exempt
@require_http_methods(["DELETE"])
@viewer_allowed
def api_delete_product_attribute(request):
    try:
        payload = _parse_json(request)
        product_id = payload.get("product_id")
        if product_id in (None, ""):
            return _json_error("product_id обязателен")

        delete_product_attribute(int(product_id))
        return JsonResponse({"ok": True, "data": {"deleted": int(product_id)}})
    except (TypeError, ValueError) as e:
        return _json_error(str(e))

########################################################################################################################
"справочник"
########################################################################################################################
"Получить все определения параметров (parameter_definition)"
@require_http_methods(["GET"])
@viewer_or_admin
def api_parameters(request):
    params = get_all_parameter_definition()
    return JsonResponse({"ok": True, "data": [_serialize_parameter_definition(p) for p in params]})

"Получить параметры (parameter_definition) для категории с учетом наследования от родителей"
@require_http_methods(["GET"])
@viewer_or_admin
def api_parameters_for_category(request, category_id):
    params = get_class_parameters_with_inheritance(category_id)
    return JsonResponse({"ok": True, "data": [_serialize_parameter_definition(p) for p in params]})

"Создать новый параметр (parameter_definition) для категории (classifier_node)"
@csrf_exempt
@require_http_methods(["POST"])
@admin_required
def api_create_parameter(request):
    try:
        payload = _parse_json(request)
        pd = create_parameter_definition(
            classifier_node_id=payload.get("classifier_node_id"),
            name=payload.get("name"),
            unit_id=payload.get("unit_id"),
            value_type=payload.get("value_type"),
            sort_order=payload.get("sort_order", 0),
        )
        return JsonResponse({"ok": True, "data": _serialize_parameter_definition(pd)})
    except (TypeError, ValueError) as e:
        return _json_error(str(e))

"Обновить параметр (parameter_definition) по id"
@csrf_exempt
@require_http_methods(["PUT"])
@admin_required
def api_update_parameter(request):
    try:
        payload = _parse_json(request)
        pd = update_parameter_definition(
            parameter_definition_id=payload.get("parameter_definition_id"),
            name=payload.get("name"),
            unit_id=payload.get("unit_id"),
            value_type=payload.get("value_type"),
            sort_order=payload.get("sort_order"),
        )
        return JsonResponse({"ok": True, "data": _serialize_parameter_definition(pd)})
    except (TypeError, ValueError) as e:
        return _json_error(str(e))

"Удалить параметр (parameter_definition) по id"
@csrf_exempt
@require_http_methods(["DELETE"])
@admin_required
def api_delete_parameter(request, param_def_id):
    try:
        delete_parameter_definition(param_def_id)
        return JsonResponse({"ok": True})
    except Exception as e:
        return _json_error(str(e))

"Создать измерение (unit_dimension) – нельзя дублировать имя"
@csrf_exempt
@require_http_methods(["POST"])
@admin_required
def api_create_unit_dimension(request):
    try:
        payload = _parse_json(request)
        ud = create_unit_dimension(payload.get("name"))
        return JsonResponse({"ok": True, "data": _serialize_unit_dimension(ud)})
    except (TypeError, ValueError) as e:
        return _json_error(str(e))

"Удалить измерение (unit_dimension) по id"
@csrf_exempt
@require_http_methods(["DELETE"])
@admin_required
def api_delete_unit_dimension(request, dimension_id):
    try:
        delete_unit_dimension(dimension_id)
        return JsonResponse({"ok": True})
    except Exception as e:
        return _json_error(str(e))

"Создать единицу измерения (unit)"
@csrf_exempt
@require_http_methods(["POST"])
@admin_required
def api_create_unit(request):
    try:
        payload = _parse_json(request)
        unit = create_unit(
            dimension_id=payload.get("dimension_id"),
            name=payload.get("name"),
            symbol=payload.get("symbol"),
            to_base_factor=payload.get("to_base_factor", 1),
            to_base_offset=payload.get("to_base_offset", 0),
        )
        return JsonResponse({"ok": True, "data": _serialize_unit(unit)})
    except (TypeError, ValueError) as e:
        return _json_error(str(e))

"Удалить единицу измерения (unit) по id"
@csrf_exempt
@require_http_methods(["DELETE"])
@admin_required
def api_delete_unit(request, unit_id):
    try:
        delete_unit(unit_id)
        return JsonResponse({"ok": True})
    except Exception as e:
        return _json_error(str(e))

"Создать значение параметра для товара (product_parameter_value), поддержка строковых, числовых и enum"
@csrf_exempt
@require_http_methods(["POST"])
@viewer_allowed
def api_create_product_parameter_value(request):
    try:
        payload = _parse_json(request)

        value_int = payload.get("value_int")
        value_real = payload.get("value_real")
        value_enum_id = payload.get("value_enum_id")

        if value_int in ("", None):
            value_int = None
        else:
            value_int = int(value_int)
        if value_real in ("", None):
            value_real = None
        else:
            value_real = float(value_real)
        if value_enum_id in ("", None):
            value_enum_id = None
        else:
            value_enum_id = int(value_enum_id)

        ppv = create_product_parameter_value(
            product_id=payload.get("product_id"),
            parameter_definition_id=payload.get("parameter_definition_id"),
            value_str=payload.get("value_str"),
            value_int=value_int,
            value_real=value_real,
            value_enum_id=value_enum_id,   # передаём в сервис
        )
        return JsonResponse({"ok": True, "data": _serialize_product_parameter_value(ppv)})
    except (TypeError, ValueError) as e:
        return _json_error(str(e))

"Обновить значение параметра для товара (product_parameter_value) по id"
@csrf_exempt
@require_http_methods(["PUT"])
@viewer_allowed
def api_update_product_parameter_value(request):
    try:
        payload = _parse_json(request)

        value_int = payload.get("value_int")
        value_real = payload.get("value_real")
        if value_int in ("", None):
            value_int = None
        else:
            value_int = int(value_int)
        if value_real in ("", None):
            value_real = None
        else:
            value_real = float(value_real)

        ppv = update_product_parameter_value(
            product_parameter_value_id=payload.get("product_parameter_value_id"),
            value_str=payload.get("value_str"),
            value_int=value_int,
            value_real=value_real,
        )
        return JsonResponse({"ok": True, "data": _serialize_product_parameter_value(ppv)})
    except (TypeError, ValueError) as e:
        return _json_error(str(e))

"Удалить значение параметра для товара (product_parameter_value) по id"
@csrf_exempt
@require_http_methods(["DELETE"])
@viewer_allowed
def api_delete_product_parameter_value(request, ppv_id):
    try:
        delete_product_parameter_value(ppv_id)
        return JsonResponse({"ok": True})
    except Exception as e:
        return _json_error(str(e))

"Получить все товары по категории с выводом всех их параметров и атрибутов"
@require_http_methods(["GET"])
@viewer_or_admin
def api_products_with_params(request, category_id):   # параметр category_id, не classifier_node_id
    result = find_products_with_params_and_attrs(category_id)
    data = [{"product": _serialize_product(item["product"]),
             "parameters": item["parameters"],
             "attributes": item["attributes"]} for item in result]
    return JsonResponse({"ok": True, "data": data})

"""Фильтрация товаров по значениям параметров C УЧЁТОМ категории (category_id).
    filters = [{"parameter_definition_id": 10, "value_int": 1}, ...]
    Поддержка фильтров с min/max через operator (gte/lte) при необходимости.
"""
@csrf_exempt
@require_http_methods(["POST"])
@viewer_or_admin
def api_filter_products_by_params(request, category_id):
    try:
        payload = _parse_json(request)
        filters = payload.get("filters", [])

        # Преобразуем фильтры с min/max в пару условий
        expanded_filters = []
        for f in filters:
            if "min" in f or "max" in f:
                use_real = False
                if "value_real" in f and f["value_real"] is not None:
                    use_real = True
                elif f.get("value_type") == "real":
                    use_real = True

                value_key = "value_real" if use_real else "value_int"

                # Создаём отдельные условия для нижней и верхней границы
                if "min" in f:
                    expanded_filters.append({
                        "parameter_definition_id": f["parameter_definition_id"],
                        "operator": "gte",
                        value_key: f["min"],
                    })
                if "max" in f:
                    expanded_filters.append({
                        "parameter_definition_id": f["parameter_definition_id"],
                        "operator": "lte",
                        value_key: f["max"],
                    })
            else:
                # Обычный фильтр с operator
                expanded_filters.append(f)

        products = filter_products_by_parameters(category_id, expanded_filters)
        return JsonResponse({"ok": True, "data": [_serialize_product(p) for p in products]})
    except (TypeError, ValueError) as e:
        return _json_error(str(e))

"Фильтрация товаров по значениям параметров без учета категории (аналогична фильтрации с category, но по всем товарам сразу)"
@csrf_exempt
@require_http_methods(["POST"])
@viewer_or_admin
def api_filter_products_by_params_no_class(request):
    try:
        payload = _parse_json(request)
        filters = payload.get("filters", [])

        expanded_filters = []
        for f in filters:
            if "min" in f or "max" in f:
                use_real = False
                if "value_real" in f and f["value_real"] is not None:
                    use_real = True
                elif f.get("value_type") == "real":
                    use_real = True

                value_key = "value_real" if use_real else "value_int"

                if "min" in f:
                    expanded_filters.append({
                        "parameter_definition_id": f["parameter_definition_id"],
                        "operator": "gte",
                        value_key: f["min"],
                    })
                if "max" in f:
                    expanded_filters.append({
                        "parameter_definition_id": f["parameter_definition_id"],
                        "operator": "lte",
                        value_key: f["max"],
                    })
            else:
                expanded_filters.append(f)

        products = filter_products_by_parameters_without_class(expanded_filters)
        return JsonResponse({"ok": True, "data": [_serialize_product(p) for p in products]})
    except (TypeError, ValueError) as e:
        return _json_error(str(e))

# ========== ОГРАНИЧЕНИЯ ДЛЯ ЧИСЛОВЫХ ПАРАМЕТРОВ ==========

"Получить ограничение (min/max) для числового параметра (parameter_definition_id)"
@require_http_methods(["GET"])
@csrf_exempt
@viewer_or_admin
def api_get_parameter_constraint(request, param_def_id):
    try:
        pd = ParameterDefinition.objects.get(id=param_def_id)
        if pd.value_type not in ('int', 'real'):
            return _json_error("Ограничения только для числовых параметров")
    except ParameterDefinition.DoesNotExist:
        return _json_error("Параметр не найден", 404)

    try:
        c = ParameterNumericConstraint.objects.get(parameter_definition_id=param_def_id)
        return JsonResponse({"ok": True, "data": {"min_value": float(c.min_value), "max_value": float(c.max_value)}})
    except ParameterNumericConstraint.DoesNotExist:
        return JsonResponse({"ok": True, "data": None})

"Создать ограничение (min/max) для числового параметра (parameter_definition_id)"
@require_http_methods(["POST"])
@csrf_exempt
@admin_required
def api_create_parameter_constraint(request):
    """
    Создать ограничение для параметра.
    Ожидает JSON:
    {
        "parameter_definition_id": 123,
        "min_value": 10.5,
        "max_value": 100.0
    }
    """
    try:
        payload = _parse_json(request)
        param_def_id = payload.get("parameter_definition_id")
        min_val = payload.get("min_value")
        max_val = payload.get("max_value")

        if not param_def_id:
            return _json_error("parameter_definition_id обязателен")
        if min_val is None or max_val is None:
            return _json_error("Необходимы min_value и max_value")

        # Проверка существования параметра и его типа
        try:
            pd = ParameterDefinition.objects.get(id=param_def_id)
            if pd.value_type not in ('int', 'real'):
                return _json_error("Ограничения можно задавать только для числовых параметров")
        except ParameterDefinition.DoesNotExist:
            return _json_error("Параметр не найден", 404)

        min_val = float(min_val)
        max_val = float(max_val)
        if min_val > max_val:
            return _json_error("min_value не может быть больше max_value")

        # Проверяем, нет ли уже ограничения (чтобы случайно не перезаписать)
        if ParameterNumericConstraint.objects.filter(parameter_definition_id=param_def_id).exists():
            return _json_error("Ограничение уже существует. Используйте обновление.")

        c = ParameterNumericConstraint.objects.create(
            parameter_definition_id=param_def_id,
            min_value=min_val,
            max_value=max_val
        )
        return JsonResponse({
            "ok": True,
            "data": {
                "min_value": float(c.min_value),
                "max_value": float(c.max_value)
            }
        })
    except Exception as e:
        return _json_error(str(e))

"Обновить существующее ограничение (min/max) для числового параметра (parameter_definition_id)"
@require_http_methods(["POST"])
@csrf_exempt
@admin_required
def api_update_parameter_constraint(request):
    """
    Обновить существующее ограничение для параметра.
    Ожидает JSON:
    {
        "parameter_definition_id": 123,
        "min_value": 10.5,
        "max_value": 100.0
    }
    """
    try:
        payload = _parse_json(request)
        param_def_id = payload.get("parameter_definition_id")
        min_val = payload.get("min_value")
        max_val = payload.get("max_value")

        if not param_def_id:
            return _json_error("parameter_definition_id обязателен")
        if min_val is None or max_val is None:
            return _json_error("Необходимы min_value и max_value")

        min_val = float(min_val)
        max_val = float(max_val)
        if min_val > max_val:
            return _json_error("min_value не может быть больше max_value")

        c = ParameterNumericConstraint.objects.get(parameter_definition_id=param_def_id)
        c.min_value = min_val
        c.max_value = max_val
        c.save()

        return JsonResponse({
            "ok": True,
            "data": {
                "min_value": float(c.min_value),
                "max_value": float(c.max_value)
            }
        })
    except ParameterNumericConstraint.DoesNotExist:
        return _json_error("Ограничение не найдено", 404)
    except Exception as e:
        return _json_error(str(e))

"Удалить ограничение (min/max) для числового параметра (parameter_definition_id)"
@require_http_methods(["DELETE"])
@csrf_exempt
@admin_required
def api_delete_parameter_constraint(request, param_def_id):
    try:
        c = ParameterNumericConstraint.objects.get(parameter_definition_id=param_def_id)
        c.delete()
        return JsonResponse({"ok": True, "message": "Ограничение удалено"})
    except ParameterNumericConstraint.DoesNotExist:
        return JsonResponse({"ok": True, "message": "Ограничение не существовало"})

# ========== ЧТЕНИЕ ЗНАЧЕНИЙ ПАРАМЕТРОВ ПРОДУКТОВ ==========

"Получить все значения параметров (product_parameter_value) для товара по его id"
@require_http_methods(["GET"])
@viewer_or_admin
def api_product_parameter_values(request, product_id):
    """Возвращает все значения параметров для данного продукта."""
    ppvs = ProductParameterValue.objects.filter(product_id=product_id).select_related('parameter_definition')
    data = [_serialize_product_parameter_value(p) for p in ppvs]
    return JsonResponse({"ok": True, "data": data})

"Получить значение одного параметра для товара (product), по product_id и param_def_id"
@require_http_methods(["GET"])
@viewer_or_admin
def api_get_parameter_value(request, product_id, param_def_id):
    """Возвращает значение конкретного параметра для продукта (или null)."""
    try:
        ppv = ProductParameterValue.objects.get(product_id=product_id, parameter_definition_id=param_def_id)
        return JsonResponse({"ok": True, "data": _serialize_product_parameter_value(ppv)})
    except ProductParameterValue.DoesNotExist:
        return JsonResponse({"ok": True, "data": None})

# ========== АГРЕГАТЫ ПАРАМЕТРОВ ==========

"Получить агрегаты по параметрам из mv_parameter_aggregates (среднее, мин, макс и т.д.), фильтрация по категории через ?category_id="
@require_http_methods(["GET"])
@viewer_or_admin
def api_parameter_aggregates(request):
    """
    Возвращает агрегаты из материализованного представления mv_parameter_aggregates.
    Можно фильтровать по category_id (classifier_node_id) через параметр ?category_id=...
    """
    category_id = request.GET.get("category_id")
    try:
        with connection.cursor() as cursor:
            sql = """
                SELECT
                    classifier_node_id,
                    parameter_definition_id,
                    param_name,
                    value_type,
                    total_products,
                    filled_count,
                    avg_numeric,
                    min_numeric,
                    max_numeric,
                    sum_numeric
                FROM mv_parameter_aggregates
            """
            params = []
            if category_id:
                sql += " WHERE classifier_node_id = %s"
                params.append(int(category_id))
            sql += " ORDER BY classifier_node_id, param_name"
            cursor.execute(sql, params)
            rows = cursor.fetchall()
        data = [
            {
                "category_id": r[0],
                "parameter_definition_id": r[1],
                "param_name": r[2],
                "value_type": r[3],
                "total_products": r[4],
                "filled_count": r[5],
                "avg_numeric": float(r[6]) if r[6] is not None else None,
                "min_numeric": float(r[7]) if r[7] is not None else None,
                "max_numeric": float(r[8]) if r[8] is not None else None,
                "sum_numeric": float(r[9]) if r[9] is not None else None,
            }
            for r in rows
        ]
        return JsonResponse({"ok": True, "data": data})
    except Exception as e:
        return _json_error(str(e))

"Обновить агрегаты (REFRESH MATERIALIZED VIEW mv_parameter_aggregates)"
@require_http_methods(["POST"])
@csrf_exempt
@admin_required
def api_refresh_aggregates(request):
    """Обновляет материализованное представление агрегатов."""
    try:
        with connection.cursor() as cursor:
            cursor.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY mv_parameter_aggregates")
        return JsonResponse({"ok": True, "message": "Агрегаты обновлены"})
    except Exception as e:
        return _json_error(str(e))

"Получить список всех размерностей измерения (unit_dimension)"
@require_http_methods(["GET"])
@viewer_or_admin
def api_unit_dimensions(request):
    """Список всех размерностей."""
    dimensions = UnitDimension.objects.all().order_by('name')
    data = [_serialize_unit_dimension(d) for d in dimensions]
    return JsonResponse({"ok": True, "data": data})

"Получить одну размерность (unit_dimension) по id"
@require_http_methods(["GET"])
@viewer_or_admin
def api_unit_dimension_detail(request, dimension_id):
    """Получить одну размерность по id."""
    try:
        dim = UnitDimension.objects.get(id=dimension_id)
        return JsonResponse({"ok": True, "data": _serialize_unit_dimension(dim)})
    except UnitDimension.DoesNotExist:
        return _json_error("Размерность не найдена", 404)

"Обновить название размерности (unit_dimension)"
@csrf_exempt
@require_http_methods(["PUT"])
@admin_required
def api_update_unit_dimension(request):
    """Обновить название размерности."""
    try:
        payload = _parse_json(request)
        dim_id = payload.get("unit_dimension_id")
        new_name = payload.get("name", "").strip()
        if not dim_id or not new_name:
            return _json_error("unit_dimension_id и name обязательны")
        dim = UnitDimension.objects.get(id=dim_id)
        dim.name = new_name
        dim.save()
        return JsonResponse({"ok": True, "data": _serialize_unit_dimension(dim)})
    except UnitDimension.DoesNotExist:
        return _json_error("Размерность не найдена", 404)
    except Exception as e:
        return _json_error(str(e))

"Получить список всех единиц измерения (unit), вместе с размерностью"
@require_http_methods(["GET"])
@viewer_or_admin
def api_units(request):
    """Список всех единиц измерения (с присоединённой размерностью)."""
    units = Unit.objects.select_related('dimension').all().order_by('dimension__name', 'name')
    data = [_serialize_unit(u) for u in units]
    return JsonResponse({"ok": True, "data": data})

"Получить одну единицу измерения (unit) по id"
@require_http_methods(["GET"])
@viewer_or_admin
def api_unit_detail(request, unit_id):
    """Получить одну единицу по id."""
    try:
        unit = Unit.objects.select_related('dimension').get(id=unit_id)
        return JsonResponse({"ok": True, "data": _serialize_unit(unit)})
    except Unit.DoesNotExist:
        return _json_error("Единица не найдена", 404)

"Получить все единицы измерения (unit), принадлежащие указанной размерности (dimension_id)"
@require_http_methods(["GET"])
@viewer_or_admin
def api_units_by_dimension(request, dimension_id):
    """Список единиц, принадлежащих указанной размерности."""
    units = Unit.objects.filter(dimension_id=dimension_id).select_related('dimension').order_by('name')
    data = [_serialize_unit(u) for u in units]
    return JsonResponse({"ok": True, "data": data})

"Обновить поля (имя, символ, коэффициенты, размерность) для единицы измерения (unit)"
@csrf_exempt
@require_http_methods(["PUT"])
@admin_required
def api_update_unit(request):
    """Обновить поля единицы измерения."""
    try:
        payload = _parse_json(request)
        unit_id = payload.get("unit_id")
        if not unit_id:
            return _json_error("unit_id обязателен")
        unit = Unit.objects.get(id=unit_id)
        if "name" in payload:
            unit.name = payload["name"].strip()
        if "symbol" in payload:
            unit.symbol = payload["symbol"].strip()
        if "to_base_factor" in payload:
            unit.to_base_factor = payload["to_base_factor"]
        if "to_base_offset" in payload:
            unit.to_base_offset = payload["to_base_offset"]
        if "dimension_id" in payload:
            unit.dimension_id = payload["dimension_id"]
        unit.save()
        return JsonResponse({"ok": True, "data": _serialize_unit(unit)})
    except Unit.DoesNotExist:
        return _json_error("Единица не найдена", 404)
    except Exception as e:
        return _json_error(str(e))

# ========== HELPER ==========
"Получить все допустимые типы значений параметров (для фронта)"
@require_http_methods(["GET"])
def api_parameter_value_types(request):
    """Возвращает список допустимых типов значений параметров."""
    types = [{'value': 'str', 'label': 'Строка'},
             {'value': 'int', 'label': 'Целое число'},
             {'value': 'real', 'label': 'Вещественное число'},
             {'value': 'enum', 'label': 'Перечисление'}]
    return JsonResponse({"ok": True, "data": types})

