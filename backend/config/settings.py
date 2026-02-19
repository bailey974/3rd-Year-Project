"""
Django settings for config project.
"""

from pathlib import Path
import os

import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent


# -------------------------
# Core
# -------------------------

# NEVER hardcode secrets for production
SECRET_KEY = os.environ.get("SECRET_KEY", "dev-insecure-change-me")

# Render/production detection
RENDER_EXTERNAL_HOSTNAME = os.environ.get("RENDER_EXTERNAL_HOSTNAME")
DEBUG = os.environ.get("DJANGO_DEBUG", "0") == "1"

ALLOWED_HOSTS = ["localhost", "127.0.0.1", ".onrender.com"]
if RENDER_EXTERNAL_HOSTNAME:
    ALLOWED_HOSTS.append(RENDER_EXTERNAL_HOSTNAME)

# Optional: allow comma-separated extra hosts via env
_extra_hosts = os.environ.get("ALLOWED_HOSTS", "")
if _extra_hosts.strip():
    ALLOWED_HOSTS += [h.strip() for h in _extra_hosts.split(",") if h.strip()]


# -------------------------
# Applications
# -------------------------

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",

    "rest_framework",
    "corsheaders",
    "rest_framework_simplejwt",

    "accounts",
    "rooms",
]


# -------------------------
# Middleware (FIXED ORDER + NO DUPLICATES)
# -------------------------

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    # WhiteNoise serves /static in prod without nginx
    "whitenoise.middleware.WhiteNoiseMiddleware",

    # CORS should be as high as possible (before CommonMiddleware)
    "corsheaders.middleware.CorsMiddleware",

    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]


# If you're behind a proxy (Render), this helps Django know requests are HTTPS.
# Only enable redirect in production.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
if not DEBUG:
    SECURE_SSL_REDIRECT = True


ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"


# -------------------------
# Database (SQLite local, Postgres on Render via DATABASE_URL)
# -------------------------

if os.environ.get("DATABASE_URL"):
    DATABASES = {
        "default": dj_database_url.config(
            conn_max_age=600,
            ssl_require=not DEBUG,
        )
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }


# -------------------------
# Auth / DRF
# -------------------------

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
}


# -------------------------
# i18n
# -------------------------

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True


# -------------------------
# Static files (Render-ready)
# -------------------------

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# WhiteNoise recommended storage for compression + cache-busting :contentReference[oaicite:2]{index=2}
STORAGES = {
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    }
}


# -------------------------
# CORS (Tauri + local dev)
# -------------------------

CORS_URLS_REGEX = r"^/(api|fs)/.*$"

# Regex-based allows many local ports without listing each one.
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^http://localhost(:\d+)?$",
    r"^http://127\.0\.0\.1(:\d+)?$",

    # Common Tauri origins (varies by version/platform)
    r"^tauri://localhost$",
    r"^http://tauri\.localhost(:\d+)?$",
    r"^https://tauri\.localhost(:\d+)?$",
]

# If you ever use cookie-based auth, you’ll likely need these too.
# Keeping them is harmless for JWT-only.
CSRF_TRUSTED_ORIGINS = [
    "http://localhost:1420",
    "http://tauri.localhost",
]
if RENDER_EXTERNAL_HOSTNAME:
    CSRF_TRUSTED_ORIGINS.append(f"https://{RENDER_EXTERNAL_HOSTNAME}")


# -------------------------
# App-specific config
# -------------------------

COLLAB_WS_URL = os.environ.get("COLLAB_WS_URL", "ws://127.0.0.1:1234")

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"