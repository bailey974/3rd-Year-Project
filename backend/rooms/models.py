import random
import string
import uuid
from django.conf import settings
from django.db import models
from django.utils import timezone

JOIN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
JOIN_LEN = 8

def generate_join_code():
    return "".join(random.choice(JOIN_ALPHABET) for _ in range(JOIN_LEN))

class Room(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=80)
    join_code = models.CharField(max_length=JOIN_LEN, unique=True, db_index=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="rooms_created"
    )
    created_at = models.DateTimeField(default=timezone.now)
    max_users = models.PositiveIntegerField(default=10)

    def save(self, *args, **kwargs):
        if not self.join_code:
            while True:
                code = generate_join_code()
                if not Room.objects.filter(join_code=code).exists():
                    self.join_code = code
                    break
        super().save(*args, **kwargs)

class RoomMember(models.Model):
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="room_memberships")
    joined_at = models.DateTimeField(default=timezone.now)

    class Meta:
        unique_together = [("room", "user")]
