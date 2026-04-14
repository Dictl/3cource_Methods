import json
from django.shortcuts import get_object_or_404
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from core.models import ClassifierNode, Product

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
    has_children,
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
def api_get_children(request, category_id):
    all_cats = base_output()
    category = get_object_or_404(ClassifierNode, id=category_id)
    descendants = search_child_nodes(all_cats, category_id)
    return JsonResponse({"ok": True, "data": {
        "category": {"id": category.id, "name": category.name, "parent_id": category.parent_id},
        "children": [{"id": c.id, "name": c.name, "parent_id": c.parent_id} for c in descendants]
    }})


@require_http_methods(["GET"])
def api_get_parents(request, category_id):
    all_cats = base_output()
    category = get_object_or_404(ClassifierNode, id=category_id)
    parents = search_parent_nodes(all_cats, category_id)
    return JsonResponse({"ok": True, "data": {
        "category": {"id": category.id, "name": category.name, "parent_id": category.parent_id},
        "parents": [{"id": p.id, "name": p.name, "parent_id": p.parent_id} for p in parents]
    }})


@require_http_methods(["GET"])
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

@require_http_methods(["GET"])
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

@require_http_methods(["GET"])
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

@require_http_methods(["GET"])
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

@require_http_methods(["GET"])
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

@require_http_methods(["GET"])
def api_product(request, product_id):
    product_id = int(product_id)
    product = get_object_or_404(Product, id=product_id)
    data = _serialize_product(product)
    return JsonResponse({"ok": True, "data": data})

@require_http_methods(["DELETE"])
def api_delete_category(request):
    try:
        payload = _parse_json(request)
        category_id = int(payload.get("delete_id"))
        search_delete_category(category_id)
        return JsonResponse({"ok": True})
    except (ValueError, KeyError) as e:
        return _json_error(str(e))


@require_http_methods(["DELETE"])
def api_delete_product(request):
    try:
        payload = _parse_json(request)
        product_id = int(payload.get("delete_id"))
        search_delete_product(product_id)
        return JsonResponse({"ok": True})
    except (ValueError, KeyError) as e:
        return _json_error(str(e))
