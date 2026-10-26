"""
RESQMesh — Authentication API Router
Handles registration, login, session validation, logout, and offline verifier synchronization.
"""

from fastapi import APIRouter, HTTPException, Header, Response, status
from typing import Optional

from ..schemas.auth import RegisterRequest, LoginRequest, AuthResponse, UserProfile
from ..services.auth import auth_service

router = APIRouter(prefix="/auth", tags=["RESQMesh Authentication & Security"])

@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(req: RegisterRequest, response: Response):
    try:
        res = auth_service.register_user(
            email=req.email,
            username=req.username,
            password=req.password,
            display_name=req.display_name,
            role=req.role or "citizen",
            responder_status=req.responder_status or "CITIZEN",
            skills=req.skills
        )
        # Set secure HTTP-only session cookie
        response.set_cookie(
            key="resqmesh_session",
            value=res["session_token"],
            httponly=True,
            samesite="lax",
            max_age=86400 * 7
        )
        return {
            "status": "success",
            "user": res["user"],
            "session_token": res["session_token"],
            "offline_verifier_salt": res["offline_verifier_salt"],
            "offline_verifier_hash": res["offline_verifier_hash"],
            "expires_in_seconds": 86400 * 7
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/login", response_model=AuthResponse)
def login(req: LoginRequest, response: Response):
    try:
        res = auth_service.authenticate(
            identifier=req.email_or_username,
            password=req.password
        )
        response.set_cookie(
            key="resqmesh_session",
            value=res["session_token"],
            httponly=True,
            samesite="lax",
            max_age=86400 * 7
        )
        return {
            "status": "success",
            "user": res["user"],
            "session_token": res["session_token"],
            "offline_verifier_salt": res["offline_verifier_salt"],
            "offline_verifier_hash": res["offline_verifier_hash"],
            "expires_in_seconds": 86400 * 7
        }
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))

@router.get("/me", response_model=UserProfile)
def get_current_user(authorization: Optional[str] = Header(None)):
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split("Bearer ")[1].strip()

    if not token:
        raise HTTPException(status_code=401, detail="Authentication session required.")

    user = auth_service.validate_session(token)
    if not user:
        raise HTTPException(status_code=401, detail="Session expired or invalid. Please re-authenticate.")

    return user

@router.post("/logout")
def logout(response: Response, authorization: Optional[str] = Header(None)):
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split("Bearer ")[1].strip()

    if token:
        auth_service.logout_session(token)

    response.delete_cookie("resqmesh_session")

    return {"status": "success", "message": "Successfully logged out."}
