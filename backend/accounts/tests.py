from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

User = get_user_model()


class AuthFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_register_login_and_me_flow(self):
        register_res = self.client.post(
            "/api/auth/register/",
            {"email": "person@example.com", "password": "MyStrongPass123!"},
            format="json",
        )
        self.assertEqual(register_res.status_code, status.HTTP_201_CREATED)
        self.assertIn("access", register_res.data)
        self.assertEqual(register_res.data["user"]["email"], "person@example.com")

        login_res = self.client.post(
            "/api/auth/login/",
            {"email": "PERSON@example.com", "password": "MyStrongPass123!"},
            format="json",
        )
        self.assertEqual(login_res.status_code, status.HTTP_200_OK)
        self.assertIn("access", login_res.data)

        token = login_res.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        me_res = self.client.get("/api/auth/me/")
        self.assertEqual(me_res.status_code, status.HTTP_200_OK)
        self.assertEqual(me_res.data["email"], "person@example.com")

    def test_register_rejects_duplicate_email_case_insensitive(self):
        User.objects.create_user(
            username="duplicate@example.com",
            email="duplicate@example.com",
            password="MyStrongPass123!",
        )
        res = self.client.post(
            "/api/auth/register/",
            {"email": "DUPLICATE@example.com", "password": "MyStrongPass123!"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", res.data)

    def test_login_with_invalid_credentials(self):
        User.objects.create_user(
            username="user@example.com",
            email="user@example.com",
            password="CorrectPass123!",
        )
        res = self.client.post(
            "/api/auth/login/",
            {"email": "user@example.com", "password": "wrongpass"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(res.data["message"], "Invalid credentials.")

    def test_login_supports_legacy_usernames(self):
        User.objects.create_user(
            username="legacy-user",
            email="legacy@example.com",
            password="LegacyPass123!",
        )
        res = self.client.post(
            "/api/auth/login/",
            {"email": "LEGACY@example.com", "password": "LegacyPass123!"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("access", res.data)
