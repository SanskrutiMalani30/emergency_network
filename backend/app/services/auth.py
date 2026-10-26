"""
RESQMesh — Authentication & Identity Security Service
Provides salted PBKDF2 password hashing, device credential verification tokens,
session management, and offline authentication verifier sync.
"""

import hashlib
import secrets
import re
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone, timedelta

class AuthService:
    def __init__(self):
        # In-memory store of registered users (persisted in session / repository)
        self._users: Dict[str, Dict[str, Any]] = {}
        # Active sessions: session_token -> { user_id, expires_at }
        self._sessions: Dict[str, Dict[str, Any]] = {}

        self._seed_default_users()

    def _hash_password(self, password: str, salt: Optional[str] = None) -> tuple[str, str]:
        """
        Derives PBKDF2-HMAC-SHA256 hash using 100,000 iterations.
        Returns (salt, hash_hex).
        """
        if not salt:
            salt = secrets.token_hex(16)
        key = hashlib.pbkdf2_hmac(
            'sha256',
            password.encode('utf-8'),
            salt.encode('utf-8'),
            100000
        )
        return salt, key.hex()

    def _verify_password(self, password: str, salt: str, expected_hash: str) -> bool:
        _, test_hash = self._hash_password(password, salt)
        return secrets.compare_digest(test_hash, expected_hash)

    def _seed_default_users(self):
        """Seed initial verified responders and citizen accounts for CASCADE '26"""
        seed_accounts = [
            {
                "user_id": "usr-amulya-yadav",
                "email": "amulya@resqmesh.net",
                "username": "amulya",
                "display_name": "Amulya Yadav (CERT)",
                "password": "ResqMesh2026!",
                "role": "responder",
                "responder_status": "ACTIVE_RESPONDER",
                "skills": ["amateur_radio_hf", "cert_disaster_coordinator", "first_aid", "mesh_operator"]
            },
            {
                "user_id": "usr-radhika-sharma",
                "email": "radhika@resqmesh.net",
                "username": "dr_radhika",
                "display_name": "Dr. Radhika Sharma",
                "password": "DoctorAid2026!",
                "role": "responder",
                "responder_status": "ACTIVE_RESPONDER",
                "skills": ["trauma_triage", "advanced_cardiac_life_support", "emergency_medicine", "telemedicine"]
            },
            {
                "user_id": "usr-priya-citizen",
                "email": "citizen@resqmesh.net",
                "username": "priya",
                "display_name": "Priya Sharma (Citizen)",
                "password": "CitizenHelp2026!",
                "role": "citizen",
                "responder_status": "CITIZEN",
                "skills": ["cpr_certified", "local_guide"]
            }
        ]

        for acc in seed_accounts:
            seed_salt = hashlib.sha256(f"resqmesh_salt_{acc['email']}".encode()).hexdigest()[:32]
            salt, hash_hex = self._hash_password(acc["password"], salt=seed_salt)
            self._users[acc["email"].lower()] = {
                "user_id": acc["user_id"],
                "email": acc["email"].lower(),
                "username": acc["username"].lower(),
                "display_name": acc["display_name"],
                "salt": salt,
                "password_hash": hash_hex,
                "role": acc["role"],
                "responder_status": acc["responder_status"],
                "skills": acc["skills"],
                "created_at": datetime.now(timezone.utc).isoformat()
            }

    def validate_password_complexity(self, password: str) -> Optional[str]:
        """
        Enforces secure password criteria:
        - At least 8 characters
        - Contains uppercase and lowercase letters
        - Contains at least one digit or symbol
        """
        if len(password) < 8:
            return "Password must be at least 8 characters long."
        if not re.search(r'[A-Z]', password):
            return "Password must contain at least one uppercase letter."
        if not re.search(r'[a-z]', password):
            return "Password must contain at least one lowercase letter."
        if not re.search(r'[0-9!@#$%^&*()_+\-=\[\]{};\':",.<>/?]', password):
            return "Password must contain at least one number or special symbol."
        return None

    def register_user(
        self,
        email: str,
        username: str,
        password: str,
        display_name: Optional[str] = None,
        role: str = "citizen",
        responder_status: str = "CITIZEN",
        skills: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        email_clean = email.lower().strip()
        user_clean = username.lower().strip()

        if email_clean in self._users:
            raise ValueError("An account with this email address already exists.")

        for u in self._users.values():
            if u["username"] == user_clean:
                raise ValueError("This username is already taken. Please choose another.")

        complexity_err = self.validate_password_complexity(password)
        if complexity_err:
            raise ValueError(complexity_err)

        salt, hash_hex = self._hash_password(password)
        user_id = f"usr-{secrets.token_hex(6)}"
        created_at = datetime.now(timezone.utc).isoformat()

        user_record = {
            "user_id": user_id,
            "email": email_clean,
            "username": user_clean,
            "display_name": display_name or username,
            "salt": salt,
            "password_hash": hash_hex,
            "role": role,
            "responder_status": responder_status,
            "skills": skills or [],
            "created_at": created_at
        }
        self._users[email_clean] = user_record

        session_token = self._create_session(user_id)

        return {
            "user": {
                "user_id": user_id,
                "email": email_clean,
                "username": user_clean,
                "display_name": user_record["display_name"],
                "role": role,
                "responder_status": responder_status,
                "skills": user_record["skills"],
                "created_at": created_at
            },
            "session_token": session_token,
            "offline_verifier_salt": salt,
            "offline_verifier_hash": hash_hex
        }

    def authenticate(self, identifier: str, password: str) -> Dict[str, Any]:
        clean_id = identifier.lower().strip()

        # Find by email or username
        user = self._users.get(clean_id)
        if not user:
            for u in self._users.values():
                if u["username"] == clean_id:
                    user = u
                    break

        if not user:
            raise ValueError("Invalid username/email or password.")

        if not self._verify_password(password, user["salt"], user["password_hash"]):
            raise ValueError("Invalid username/email or password.")

        session_token = self._create_session(user["user_id"])

        return {
            "user": {
                "user_id": user["user_id"],
                "email": user["email"],
                "username": user["username"],
                "display_name": user["display_name"],
                "role": user["role"],
                "responder_status": user["responder_status"],
                "skills": user["skills"],
                "created_at": user["created_at"]
            },
            "session_token": session_token,
            "offline_verifier_salt": user["salt"],
            "offline_verifier_hash": user["password_hash"]
        }

    def _create_session(self, user_id: str) -> str:
        token = f"sess_{secrets.token_urlsafe(32)}"
        self._sessions[token] = {
            "user_id": user_id,
            "expires_at": datetime.now(timezone.utc) + timedelta(days=7)
        }
        return token

    def validate_session(self, token: str) -> Optional[Dict[str, Any]]:
        sess = self._sessions.get(token)
        if not sess:
            return None
        if datetime.now(timezone.utc) > sess["expires_at"]:
            del self._sessions[token]
            return None

        # Return user profile
        for u in self._users.values():
            if u["user_id"] == sess["user_id"]:
                return {
                    "user_id": u["user_id"],
                    "email": u["email"],
                    "username": u["username"],
                    "display_name": u["display_name"],
                    "role": u["role"],
                    "responder_status": u["responder_status"],
                    "skills": u["skills"],
                    "created_at": u["created_at"]
                }
        return None

    def logout_session(self, token: str) -> bool:
        if token in self._sessions:
            del self._sessions[token]
            return True
        return False

auth_service = AuthService()
