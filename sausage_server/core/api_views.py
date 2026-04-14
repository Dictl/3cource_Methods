import json
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt

from .service import base_output, build_tree_with_levels, move_category


@require_http_methods(["GET"])
def api_tree(request):
    nodes = build_tree_with_levels(base_output())
    data = [
        {
            "id": n.id,
            "name": n.name,
            "parent_id": n.parent_id,
            "level": getattr(n, "level", 0),
        }
        for n in nodes
    ]
    return JsonResponse({"ok": True, "data": data})


@csrf_exempt
@require_http_methods(["POST"])
def api_move_category(request):
    try:
        payload = json.loads(request.body.decode("utf-8"))
        category_id = int(payload.get("category_id"))
        new_parent_id = payload.get("new_parent_id")
        new_parent_id = None if new_parent_id in ("", None) else int(new_parent_id)

        move_category(category_id, new_parent_id)  # проверка на цикл
        return JsonResponse({"ok": True, "message": "Категория перемещена"})
    except ValueError as e:
        return JsonResponse({"ok": False, "error": str(e)}, status=400)
    except Exception:
        return JsonResponse({"ok": False, "error": "Некорректный JSON или данные"}, status=400)