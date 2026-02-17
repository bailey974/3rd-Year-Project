from django.contrib import admin
from django.urls import path, include
from .fs_views import fs_list, fs_read

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("fs/list", fs_list),
    path("fs/read", fs_read),
]
