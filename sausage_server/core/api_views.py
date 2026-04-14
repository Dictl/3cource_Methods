import json
from django.shortcuts import get_object_or_404
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from .models import ClassifierNode
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


@require_http_methods(["GET"])
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


@require_http_methods(["GET"])
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


@require_http_methods(["GET"])
def api_search(request):
    search_type = request.GET.get("search_type")
    search_category_id = request.GET.get("search_category_id")

    if not search_category_id:
        return _json_error("Не передан search_category_id")

    try:
        search_category_id = int(search_category_id)
    except ValueError:
        return _json_error("search_category_id должен быть числом")

    all_cats = base_output()
    all_prods = base_product_output()
    category = get_object_or_404(ClassifierNode, id=search_category_id)

    response_data = {
        "category": {
            "id": category.id,
            "name": category.name,
            "parent_id": category.parent_id,
        },
        "search_type": search_type,
        "descendants": [],
        "parents": [],
        "terminal_products": [],
    }

    if search_type == "descendants":
        descendants = search_child_nodes(all_cats, search_category_id)
        response_data["descendants"] = [
            {"id": c.id, "name": c.name, "parent_id": c.parent_id} for c in descendants
        ]
    elif search_type == "parents":
        parents = search_parent_nodes(all_cats, search_category_id)
        response_data["parents"] = [
            {"id": c.id, "name": c.name, "parent_id": c.parent_id} for c in parents
        ]
    elif search_type == "terminals":
        descendants = search_child_nodes(all_cats, search_category_id)
        descendants.append(category)
        category_ids = {c.id for c in descendants}
        terminal_products = [p for p in all_prods if p.classifier_node_id in category_ids]
        response_data["terminal_products"] = [_serialize_product(p) for p in terminal_products]
    else:
        return _json_error("Некорректный search_type")

    return JsonResponse({"ok": True, "data": response_data})


@require_http_methods(["POST"])
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


@require_http_methods(["POST"])
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


@require_http_methods(["POST"])
def api_delete(request):
    try:
        payload = _parse_json(request)
        delete_type = payload.get("delete_type")
        delete_id = int(payload.get("delete_id"))

        if delete_type == "category":
            search_delete_category(delete_id)
        elif delete_type == "product":
            search_delete_product(delete_id)
        else:
            return _json_error("Некорректный delete_type")

        return JsonResponse({"ok": True})
    except ValueError as e:
        return _json_error(str(e))


@require_http_methods(["POST"])
def api_move_category(request):
    try:
        payload = _parse_json(request)
        category_id = int(payload.get("category_id"))
        new_parent_id = payload.get("new_parent_id")
        new_parent_id = None if new_parent_id in ("", None) else int(new_parent_id)

        move_category(category_id, new_parent_id)
        return JsonResponse({"ok": True, "message": "Категория перемещена"})
    except ValueError as e:
        return _json_error(str(e))


@require_http_methods(["POST"])
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
