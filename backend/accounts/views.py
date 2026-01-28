from django.contrib.auth import authenticate, get_user_model
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()


def tokens_for_user(user):
    refresh = RefreshToken.for_user(user)
    return {
        "access": str(refresh.access_token),
        "refresh": str(refresh),
        "user": {"id": user.id, "email": user.email, "username": user.username},
    }


@api_view(["POST"])
@permission_classes([AllowAny])
def register_view(request):
    email = (request.data.get("email") or "").strip().lower()
    password = request.data.get("password") or ""

    if not email or not password:
        return Response(
            {"message": "Email and password required."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if len(password) < 8:
        return Response(
            {"message": "Password must be at least 8 characters."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if User.objects.filter(email=email).exists():
        return Response(
            {"message": "Email already in use."}, status=status.HTTP_400_BAD_REQUEST
        )

    # Default Django User requires username; set it to email
    user = User.objects.create_user(username=email, email=email, password=password)

    return Response(tokens_for_user(user), status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request):
    email = (request.data.get("email") or "").strip().lower()
    password = request.data.get("password") or ""

    # We stored username=email at registration, so authenticate via username=email
    user = authenticate(request, username=email, password=password)
    if not user:
        return Response(
            {"message": "Invalid credentials."}, status=status.HTTP_401_UNAUTHORIZED
        )

    return Response(tokens_for_user(user), status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me_view(request):
    u = request.user
    return Response({"id": u.id, "email": u.email, "username": u.username})
