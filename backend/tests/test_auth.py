"""
Tests for RESQMesh Authentication and Security Module
"""

import pytest
from fastapi import Response, HTTPException
from backend.app.schemas.auth import RegisterRequest, LoginRequest
from backend.app.api.auth import register, login, get_current_user, logout
from backend.app.services.auth import auth_service

def test_login_seeded_account():
    res = login(LoginRequest(
        email_or_username="amulya@resqmesh.net",
        password="ResqMesh2026!"
    ), response=Response())
    
    assert res["status"] == "success"
    assert res["user"]["email"] == "amulya@resqmesh.net"
    assert res["user"]["role"] == "responder"
    assert "session_token" in res
    assert "offline_verifier_salt" in res
    assert "offline_verifier_hash" in res

def test_login_invalid_credentials():
    with pytest.raises(HTTPException) as excinfo:
        login(LoginRequest(
            email_or_username="amulya@resqmesh.net",
            password="WrongPassword123!"
        ), response=Response())
    assert excinfo.value.status_code == 401
    assert "Invalid" in excinfo.value.detail

def test_register_and_authenticate_new_user():
    unique_email = "volunteer_field_medic@resqmesh.net"
    res = register(RegisterRequest(
        email=unique_email,
        username="medic_field",
        password="SecurePassword123!",
        display_name="Field Medic One",
        role="responder",
        responder_status="ACTIVE_RESPONDER",
        skills=["first_aid", "watercraft_rescue"]
    ), response=Response())
    
    assert res["status"] == "success"
    assert res["user"]["email"] == unique_email
    assert res["user"]["skills"] == ["first_aid", "watercraft_rescue"]

    # Test get_current_user with valid bearer token
    token = res["session_token"]
    user_profile = get_current_user(authorization=f"Bearer {token}")
    assert user_profile["email"] == unique_email
    assert user_profile["display_name"] == "Field Medic One"

    # Test logout
    logout_res = logout(response=Response(), authorization=f"Bearer {token}")
    assert logout_res["status"] == "success"

    # Test that token is now invalid
    with pytest.raises(HTTPException) as exc:
        get_current_user(authorization=f"Bearer {token}")
    assert exc.value.status_code == 401

def test_password_complexity():
    assert auth_service.validate_password_complexity("short") is not None
    assert auth_service.validate_password_complexity("alllowercase1!") is not None
    assert auth_service.validate_password_complexity("ALLUPPERCASE1!") is not None
    assert auth_service.validate_password_complexity("NoDigitsOrSymbols") is not None
    assert auth_service.validate_password_complexity("ValidPass123!") is None
