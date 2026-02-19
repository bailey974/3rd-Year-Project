from rest_framework import serializers
from .models import Room

class RoomSerializer(serializers.ModelSerializer):
    class Meta:
        model = Room
        fields = ["id", "name", "join_code", "max_users", "created_at"]

class CreateRoomSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=80)

class JoinRoomSerializer(serializers.Serializer):
    join_code = serializers.CharField(max_length=32)
