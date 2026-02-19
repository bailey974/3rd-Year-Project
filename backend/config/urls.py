from django.contrib import admin
from django.urls import path, include
from .fs_views import fs_list, fs_read
from django.http import JsonResponse

def healthz(_req):
    return JsonResponse({"ok": True})

def root(_req):
    return JsonResponse({"service": "backend", "status": "running"})

urlpatterns = [
    # root
    path("", root),

    # health
    path("healthz/", healthz),

    # admin + APIs
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/rooms/", include("rooms.urls")),

    # file system endpoints
    path("fs/list/", fs_list),
    path("fs/read/", fs_read),
]