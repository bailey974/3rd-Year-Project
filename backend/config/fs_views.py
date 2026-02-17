from pathlib import Path
from django.http import JsonResponse, HttpResponseBadRequest, HttpResponseForbidden
from django.views.decorators.http import require_GET
from django.conf import settings

# Allow browsing files under the project root (one level above backend/)
FILE_ROOT = Path(settings.BASE_DIR).resolve().parent


def _safe_path(p: str | None) -> Path:
    if not p:
        target = FILE_ROOT
    else:
        candidate = Path(p)
        target = (
            candidate if candidate.is_absolute() else (FILE_ROOT / candidate)
        ).resolve()

    # Prevent escaping FILE_ROOT
    if target != FILE_ROOT and FILE_ROOT not in target.parents:
        raise PermissionError("Path outside allowed root")

    return target


@require_GET
def fs_list(request):
    p = request.GET.get("path", "")
    try:
        target = _safe_path(p)
    except PermissionError:
        return HttpResponseForbidden("Forbidden path")

    if not target.exists():
        return HttpResponseBadRequest("Path does not exist")
    if not target.is_dir():
        return HttpResponseBadRequest("Path is not a directory")

    entries = []
    for child in target.iterdir():
        entries.append(
            {
                "name": child.name,
                "path": str(child),
                "type": "dir" if child.is_dir() else "file",
            }
        )

    return JsonResponse({"path": str(target), "entries": entries})


@require_GET
def fs_read(request):
    p = request.GET.get("path", "")
    if not p:
        return HttpResponseBadRequest("Missing path")

    try:
        target = _safe_path(p)
    except PermissionError:
        return HttpResponseForbidden("Forbidden path")

    if not target.exists() or not target.is_file():
        return HttpResponseBadRequest("Not a file")

    # Basic safety: don’t read huge files
    if target.stat().st_size > 2_000_000:
        return HttpResponseBadRequest("File too large")

    content = target.read_text(encoding="utf-8", errors="replace")
    return JsonResponse({"path": str(target), "content": content})
