"""
RESQMesh — Authentication Schemas
"""

from pydantic import BaseModel, Field
from typing import List, Optional

class RegisterRequest(BaseModel):
    email: str = Field(..., min_length=3)
    username: str = Field(..., min_length=3)
    password: str = Field(..., min_length=8)
    display_name: Optional[str] = None
    role: Optional[str] = "citizen" # "citizen" | "responder" | "coordinator"
    responder_status: Optional[str] = "CITIZEN" # "CITIZEN" | "ACTIVE_RESPONDER"
    skills: Optional[List[str]] = []

class LoginRequest(BaseModel):
    email_or_username: str = Field(...)
    password: str = Field(..., min_length=1)

class UserProfile(BaseModel):
    user_id: str
    email: str
    username: str
    display_name: str
    role: str
    responder_status: str
    skills: List[str]
    created_at: str

class AuthResponse(BaseModel):
    status: str = "success"
    user: UserProfile
    session_token: str
    offline_verifier_salt: str
    offline_verifier_hash: str
    expires_in_seconds: int = 86400
