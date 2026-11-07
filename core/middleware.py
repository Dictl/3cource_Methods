from django.conf import settings
from django.contrib.auth import logout
from django.http import JsonResponse
from django.shortcuts import redirect


class ServerSessionMiddleware:
    """Требует повторный вход после каждого нового запуска Django."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path.startswith('/api/') and not request.user.is_authenticated:
            return JsonResponse(
                {'ok': False, 'error': 'Требуется авторизация'},
                status=401,
            )
        if request.user.is_authenticated:
            session_run_id = request.session.get('_server_run_id')
            if session_run_id != settings.SERVER_RUN_ID:
                logout(request)
                if request.path.startswith('/api/'):
                    return JsonResponse(
                        {'ok': False, 'error': 'Требуется повторная авторизация'},
                        status=401,
                    )
                return redirect('/login/?next=' + request.get_full_path())
        return self.get_response(request)


class StaffApiWriteMiddleware:
    """Клиенты могут просматривать данные, изменять их может только администратор."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if (
            request.path.startswith('/api/')
            and request.method not in ('GET', 'HEAD', 'OPTIONS')
            and not request.user.is_staff
        ):
            return JsonResponse(
                {'ok': False, 'error': 'Требуются права администратора'},
                status=403,
            )
        return self.get_response(request)
