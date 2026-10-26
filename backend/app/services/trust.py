"""
RESQMesh — Trust, Reputation & Adversarial Defense Module
Evaluates responder reputation, claim authenticity, GPS plausibility,
Sybil clusters, and malicious replay attacks.
"""

from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import re
import hashlib

class TrustEngine:
    def __init__(self):
        self.seen_message_hashes: Dict[str, datetime] = {}
        self.node_rate_limits: Dict[str, List[datetime]] = {}
        self.quarantined_identities: Dict[str, Dict[str, Any]] = {}
        self.known_verified_credentials = {
            "MED-LIC-9812": {"holder": "Dr. Sarah Rao", "role": "Trauma Surgeon", "status": "VERIFIED"},
            "RN-PARAMEDIC-4401": {"holder": "Karan Patel", "role": "Critical Care Paramedic", "status": "VERIFIED"},
            "BOAT-CERT-1102": {"holder": "Amit Verma", "role": "Flood Rescue Boat Pilot", "status": "VERIFIED"}
        }

    def verify_message_freshness(self, message_id: str, payload_str: str, timestamp_iso: str) -> Dict[str, Any]:
        """
        Guards against replay attacks, stale message floods, and duplicates.
        """
        payload_hash = hashlib.sha256(payload_str.encode()).hexdigest()
        now = datetime.now(timezone.utc)

        # 1. Duplicate hash detection
        if payload_hash in self.seen_message_hashes:
            first_seen = self.seen_message_hashes[payload_hash]
            return {
                "is_valid": False,
                "reason": "Duplicate / Replay attack detected. Exact payload already processed.",
                "hash": payload_hash,
                "first_seen": first_seen.isoformat(),
                "action": "DROP_SILENTLY"
            }

        # 2. Stale message check (> 12 hours old without causal reason)
        try:
            msg_dt = datetime.fromisoformat(timestamp_iso.replace("Z", "+00:00"))
            age_seconds = (now - msg_dt).total_seconds()
            if age_seconds > 43200: # 12 hours
                return {
                    "is_valid": False,
                    "reason": f"Message is stale ({round(age_seconds / 3600, 1)} hrs old). Stale replay rejected.",
                    "hash": payload_hash,
                    "action": "QUARANTINE"
                }
        except Exception:
            pass

        self.seen_message_hashes[payload_hash] = now
        return {"is_valid": True, "reason": "Freshness verified", "hash": payload_hash}

    def check_rate_limits(self, node_id: str, limit_per_minute: int = 15) -> Dict[str, Any]:
        """
        Detects battery-draining message floods and spam attacks from malicious nodes.
        """
        now = datetime.now(timezone.utc)
        history = self.node_rate_limits.setdefault(node_id, [])
        # Prune older than 60s
        history = [t for t in history if (now - t).total_seconds() <= 60]
        self.node_rate_limits[node_id] = history

        if len(history) >= limit_per_minute:
            return {
                "rate_limited": True,
                "reason": f"Node {node_id} exceeded rate limit ({len(history)} msgs/min). Battery protection threshold triggered.",
                "count": len(history)
            }
        
        history.append(now)
        return {"rate_limited": False, "count": len(history)}

    def detect_sybil_cluster(self, identities: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Detects Sybil attacks where an attacker generates multiple fake personas
        (e.g., 40 fake nurse identities) originating from a single mesh gateway or IP.
        """
        origin_counts: Dict[str, List[str]] = {}
        for ident in identities:
            origin = ident.get("gateway_id") or ident.get("origin_ip") or "mesh-unknown"
            origin_counts.setdefault(origin, []).append(ident.get("responder_id", "anon"))

        flagged_origins = {}
        for origin, ids in origin_counts.items():
            if len(ids) >= 4 and origin != "official-emergency-HQ":
                flagged_origins[origin] = {
                    "count": len(ids),
                    "identities": ids,
                    "threat": "High-confidence Sybil cluster detected: abnormal identity birth burst from single relay."
                }
                for r_id in ids:
                    self.quarantined_identities[r_id] = {
                        "quarantined_at": datetime.now(timezone.utc).isoformat(),
                        "reason": f"Part of Sybil cluster from {origin}"
                    }

        return {
            "has_sybils": len(flagged_origins) > 0,
            "flagged_origins": flagged_origins,
            "quarantined_count": sum(len(v["identities"]) for v in flagged_origins.values())
        }

    def verify_gps_plausibility(self, prev_lat: float, prev_lng: float, prev_time: datetime,
                                curr_lat: float, curr_lng: float, curr_time: datetime) -> Dict[str, Any]:
        """
        Detects GPS coordinate spoofing and teleportation anomalies.
        """
        from .hazards import haversine_km
        dist_km = haversine_km(prev_lat, prev_lng, curr_lat, curr_lng)
        dt_seconds = max(1.0, (curr_time - prev_time).total_seconds())
        speed_kmh = (dist_km / dt_seconds) * 3600

        # Speeds above 160 km/h in urban disaster terrain indicate coordinate spoofing
        if speed_kmh > 160.0:
            return {
                "plausible": False,
                "speed_kmh": round(speed_kmh, 1),
                "dist_km": round(dist_km, 2),
                "reason": f"Kinematically impossible movement ({round(speed_kmh, 1)} km/h). Probable GPS spoofing or signal injection.",
                "trust_penalty": -0.6
            }

        return {
            "plausible": True,
            "speed_kmh": round(speed_kmh, 1),
            "dist_km": round(dist_km, 2),
            "reason": "Movement kinematics within normal operational bounds."
        }

    def evaluate_responder_trust(self, responder: Dict[str, Any]) -> Dict[str, Any]:
        """
        Produces an explainable trust score (0.0 to 1.0) with contributing factors.
        """
        r_id = responder.get("responder_id", "")
        if r_id in self.quarantined_identities:
            return {
                "trust_score": 0.05,
                "trust_level": "QUARANTINED",
                "explanation": f"Quarantined: {self.quarantined_identities[r_id]['reason']}",
                "is_quarantined": True
            }

        score = 0.50 # Baseline neutral trust for unverified volunteer
        factors = []

        # 1. Identity proof / cryptographic signing
        if responder.get("has_public_key") or responder.get("is_cryptographically_signed"):
            score += 0.20
            factors.append("Possesses registered cryptographic node keypair")
        else:
            factors.append("Unsigned peer identity (subject to corroboration)")

        # 2. Medical or Specialized Credential Verification
        cred_id = responder.get("credential_id")
        if cred_id and cred_id in self.known_verified_credentials:
            score += 0.25
            info = self.known_verified_credentials[cred_id]
            factors.append(f"Verified qualification: {info['role']} (Auth: {cred_id})")
        elif cred_id:
            score -= 0.20
            factors.append(f"Unverifiable or forged credential token '{cred_id}'")

        # 3. Successful missions history
        completed = responder.get("completed_missions", 0)
        if completed > 0:
            boost = min(0.15, completed * 0.03)
            score += boost
            factors.append(f"Field-proven track record ({completed} completed rescues)")

        # 4. Location stability
        if responder.get("gps_spoofing_detected"):
            score -= 0.40
            factors.append("GPS anomaly flag active on node telemetry")

        trust_score = round(max(0.05, min(0.99, score)), 2)

        if trust_score >= 0.80:
            level = "HIGHLY_TRUSTED"
        elif trust_score >= 0.50:
            level = "PROVISIONAL_TRUST"
        elif trust_score >= 0.25:
            level = "SUSPICIOUS"
        else:
            level = "UNTRUSTED"

        return {
            "trust_score": trust_score,
            "trust_level": level,
            "factors": factors,
            "explanation": f"{level} ({int(trust_score*100)}%): " + "; ".join(factors) + ".",
            "is_quarantined": False
        }

trust_engine = TrustEngine()
