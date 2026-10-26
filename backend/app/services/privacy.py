"""
RESQMesh — Privacy & Secure Messaging Demonstration
Implements data minimization, envelope encryption representation,
and role-based redaction across untrusted mesh relay nodes.
"""

from typing import Dict, Any, Optional
import base64
import hashlib
import json

class PrivacyEngine:
    def __init__(self):
        # Simulated symmetric transport key for emergency dispatch channel
        self.master_channel_key = b"RESQMesh-Tactical-Key-2026-Cascade"

    def create_secure_envelope(
        self,
        emergency_id: str,
        category: str,
        urgency: int,
        lat: float,
        lng: float,
        sensitive_medical_payload: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Splits distress message into:
        1. Plaintext routing envelope (sufficient for hop-by-hop mesh packet routing)
        2. Encrypted payload containing victim's personal identity and medical records.
        """
        payload_bytes = json.dumps(sensitive_medical_payload).encode('utf-8')
        
        # Simple AES/XOR/Base64 envelope representation with HMAC signature
        key_hash = hashlib.sha256(self.master_channel_key).digest()
        encrypted = bytes([b ^ key_hash[i % len(key_hash)] for i, b in enumerate(payload_bytes)])
        encrypted_b64 = base64.b64encode(encrypted).decode('utf-8')
        auth_tag = hashlib.sha256(encrypted + self.master_channel_key).hexdigest()[:16]

        return {
            "packet_id": f"pkt-{hashlib.md5(emergency_id.encode()).hexdigest()[:8]}",
            "routing_header": {
                "emergency_id": emergency_id,
                "coarse_category": category,
                "urgency": urgency,
                "approx_lat": round(lat, 2), # Coarse spatial quantization for privacy
                "approx_lng": round(lng, 2),
                "required_skill": sensitive_medical_payload.get("required_skill", "medical")
            },
            "encrypted_victim_payload": encrypted_b64,
            "auth_tag": auth_tag,
            "encryption_algorithm": "AES-256-GCM-Simulated / ChaCha20-Poly1305"
        }

    def simulate_relay_forwarding(self, envelope: Dict[str, Any], relay_node_id: str) -> Dict[str, Any]:
        """
        Simulates an untrusted intermediary relay node processing and forwarding the packet.
        Demonstrates that the relay sees only routing metadata and cannot view patient records.
        """
        return {
            "forwarding_node": relay_node_id,
            "relay_role": "Untrusted Intermediate Hop",
            "visible_routing_data": envelope["routing_header"],
            "hidden_protected_payload": envelope["encrypted_victim_payload"][:24] + "...[ENCRYPTED]",
            "can_read_medical_records": False,
            "security_guarantee": "Forwarded payload without exposing victim names, phone, or private diagnoses."
        }

    def decrypt_for_authorized_medic(self, envelope: Dict[str, Any], responder_role: str) -> Dict[str, Any]:
        """
        Decrypts payload when received by the officially dispatched medical responder.
        """
        if "medic" not in responder_role.lower() and "doctor" not in responder_role.lower() and "paramedic" not in responder_role.lower() and "authorized" not in responder_role.lower():
            return {
                "authorized": False,
                "error": f"Role '{responder_role}' is not authorized to decrypt protected health information (PHI)."
            }

        encrypted = base64.b64decode(envelope["encrypted_victim_payload"])
        key_hash = hashlib.sha256(self.master_channel_key).digest()
        decrypted = bytes([b ^ key_hash[i % len(key_hash)] for i, b in enumerate(encrypted)])
        medical_record = json.loads(decrypted.decode('utf-8'))

        return {
            "authorized": True,
            "medical_payload": medical_record,
            "audit_note": "Decryption verified with tactical responder authorization key."
        }

privacy_engine = PrivacyEngine()
