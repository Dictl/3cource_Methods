from django.http import JsonResponse
from functools import wraps


def admin_required(view_func):
    """Decorator to check if user is admin"""
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse(
                {"ok": False, "error": "Authentication required"},
                status=401
            )

        # Check if user has admin role
        if not request.user.groups.filter(name='Admins').exists():
            return JsonResponse({"ok": False, "error": "Admin privileges required"}, status=403)

        return view_func(request, *args, **kwargs)

    return wrapper


def viewer_or_admin(view_func):
    """Decorator to check if user is authenticated (viewer or admin)"""
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse(
                {"ok": False, "error": "Authentication required"},
                status=401
            )

        return view_func(request, *args, **kwargs)

    return wrapper


def viewer_allowed(view_func):
    """Decorator to allow viewers and admins (viewers can perform content editing without changing structure)"""
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse(
                {"ok": False, "error": "Authentication required"},
                status=401
            )

        # Check if user has viewer or admin role
        if not request.user.groups.filter(name__in=['Viewers', 'Admins']).exists():
            return JsonResponse({"ok": False, "error": "Viewer privileges required"}, status=403)

        return view_func(request, *args, **kwargs)

    return wrapper
