from django.conf import settings
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Room, RoomMember
from .serializers import RoomSerializer, CreateRoomSerializer, JoinRoomSerializer


def collab_ws_url():
    return getattr(settings, "COLLAB_WS_URL", "ws://127.0.0.1:1234")


class RoomViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def list(self, request):
        rooms = Room.objects.filter(memberships__user=request.user).order_by("-created_at")
        return Response(
            {
                "ws_url": collab_ws_url(),
                "rooms": RoomSerializer(rooms, many=True).data,
            }
        )

    def create(self, request):
        s = CreateRoomSerializer(data=request.data)
        s.is_valid(raise_exception=True)

        room = Room.objects.create(
            name=s.validated_data["name"],
            created_by=request.user,
            max_users=10,
        )
        RoomMember.objects.get_or_create(room=room, user=request.user)

        payload = RoomSerializer(room).data
        payload["ws_url"] = collab_ws_url()
        payload["doc_name"] = f"room:{room.id}"
        return Response(payload, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"], url_path="join")
    def join(self, request):
        s = JoinRoomSerializer(data=request.data)
        s.is_valid(raise_exception=True)

        code = s.validated_data["join_code"].strip().upper()
        try:
            room = Room.objects.get(join_code=code)
        except Room.DoesNotExist:
            return Response({"detail": "invalid-code"}, status=status.HTTP_404_NOT_FOUND)

        RoomMember.objects.get_or_create(room=room, user=request.user)

        payload = RoomSerializer(room).data
        payload["ws_url"] = collab_ws_url()
        payload["doc_name"] = f"room:{room.id}"
        return Response(payload, status=status.HTTP_200_OK)
