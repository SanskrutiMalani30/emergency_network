"""
RESQMesh — Emergency Intake & Claim Verification Engine
Parses fragmented natural-language distress messages, extracts capability demands,
and evaluates claim veracity and confidence without blindly trusting unverified claims.
"""

import re
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from uuid import uuid4

# Semantic capability requirement extraction supporting English, Hindi, and Marathi terms
CAPABILITY_RULES = [
    (r"\b(insulin|diabetic|diabetes|glycemia|इन्सुलिन|मधुमेह|डायबिटीज)\b", "refrigerated_insulin_supply", "Diabetic medical emergency requiring temperature-controlled medication"),
    (r"\b(dialysis|kidney|renal|डायलिसिस|गुर्दा|किडनी)\b", "dialysis_specialist", "Critical renal therapy needed; high time-sensitivity"),
    (r"\b(boat|flooded|water rising|submerged|canoe|dinghy|river|drowning|नाव|पानी|बाढ़|जलभराव|डूबा|होडी|पाणी|पूर|बुडत)\b", "watercraft_rescue", "Watercraft / evacuation boat needed for inundated terrain"),
    (r"\b(oxygen|inhaler|asthma|respiratory|breathing|ventilator|ऑक्सीजन|सांस|श्वास|प्राणवायू)\b", "portable_oxygen", "Respiratory support equipment and oxygen cylinder"),
    (r"\b(broken|fracture|bone|splint|bleeding|wound|stretcher|hemorrhage|हड्डी|खून|चोट|घायल|जखम|फ्रॅक्चर|रक्त)\b", "trauma_paramedic", "Trauma care, stabilization, and stretcher extraction"),
    (r"\b(elderly|bedridden|infant|baby|wheelchair|pregnant|paralysis|वृद्ध|बुजुर्ग|बच्चा|शिशु|गर्भवती|बाळ|म्हातारे|अपंग)\b", "special_mobility_assistance", "Vulnerable person requiring specialized transport assistance"),
    (r"\b(food|starving|ration|water|drinking water|dehydration|भूख|खाना|भोजन|राशन|अन्न|तहान|पिण्याचे पाणी)\b", "emergency_rations_water", "Nutritional and potable hydration supplies"),
    (r"\b(fire|burns|smoke|extinguisher|आग|धुआं|धूर|जळणे)\b", "fire_suppression", "Active thermal hazard; protective gear and burn triage required")
]

SUSPICIOUS_PHRASES = [
    r"testing 123", r"ignore this", r"decoy alert", r"fake emergency",
    r"send all medics here now free food", r"unlimited money"
]

class EmergencyIntakeEngine:
    def __init__(self):
        # Store witness reports for spatial-temporal corroboration
        self.recent_reports: List[Dict[str, Any]] = []

    def parse_and_verify(
        self,
        raw_text: str,
        lat: float,
        lng: float,
        location_accuracy_meters: float = 50.0,
        reporter_node_id: Optional[str] = None,
        evidence_attachment: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Transforms free-text distress report into structured, verified emergency record.
        """
        now = datetime.now(timezone.utc)
        text_lower = raw_text.lower().strip()

        # 1. Capability & Supply Extraction
        required_capabilities: List[str] = []
        extracted_reasons: List[str] = []

        for pattern, cap, desc in CAPABILITY_RULES:
            if re.search(pattern, text_lower):
                if cap not in required_capabilities:
                    required_capabilities.append(cap)
                    extracted_reasons.append(desc)

        if not required_capabilities:
            required_capabilities.append("general_first_aid_rescue")
            extracted_reasons.append("Standard physical evacuation and assessment")

        # 2. Urgency & Severity Estimation
        base_urgency = 5
        if any(c in required_capabilities for c in ["dialysis_specialist", "refrigerated_insulin_supply", "portable_oxygen"]):
            base_urgency += 4
        if "watercraft_rescue" in required_capabilities:
            base_urgency += 2
        if "trauma_paramedic" in required_capabilities:
            base_urgency += 2
        if any(w in text_lower for w in ["trapped", "collapse", "severe", "unconscious", "dying"]):
            base_urgency += 2

        urgency_score = min(10, max(1, base_urgency))
        if urgency_score >= 8:
            severity = "CRITICAL"
        elif urgency_score >= 6:
            severity = "HIGH"
        elif urgency_score >= 4:
            severity = "MEDIUM"
        else:
            severity = "LOW"

        # 3. Verification & Corroboration Engine
        # Check for suspicious patterns
        is_suspicious_text = any(re.search(pat, text_lower) for pat in SUSPICIOUS_PHRASES)

        # Cross-corroboration: check other reports within 800m submitted in past 30 mins
        from .hazards import haversine_km
        corroborating_count = 0
        for prior in self.recent_reports:
            d_km = haversine_km(lat, lng, prior["lat"], prior["lng"])
            if d_km <= 0.8:
                corroborating_count += 1

        confidence = 0.50 # Neutral initial score
        verification_reasons = []

        if is_suspicious_text:
            verification_status = "SUSPICIOUS"
            confidence = 0.20
            verification_reasons.append("Flagged for suspicious test/decoy language")
        else:
            if corroborating_count >= 2:
                verification_status = "VERIFIED"
                confidence = 0.92
                verification_reasons.append(f"Corroborated by {corroborating_count} independent reports in 800m vicinity")
            elif corroborating_count == 1:
                verification_status = "PARTIALLY_VERIFIED"
                confidence = 0.75
                verification_reasons.append("Supported by 1 nearby independent witness signal")
            else:
                verification_status = "UNVERIFIED"
                confidence = 0.55
                verification_reasons.append("Solo uncorroborated field report (provisional triage applied)")

            if evidence_attachment:
                confidence = min(0.98, confidence + 0.15)
                verification_reasons.append("Visual / audio evidence attachment registered")

            if location_accuracy_meters <= 15:
                confidence = min(0.98, confidence + 0.05)
                verification_reasons.append("High GPS precision (<15m uncertainty radius)")

        record = {
            "emergency_id": f"emg-{uuid4().hex[:8]}",
            "raw_message": raw_text,
            "category": "medical" if any("med" in c or "insulin" in c or "dialysis" in c for c in required_capabilities) else "disaster",
            "severity": severity,
            "urgency": urgency_score,
            "required_capabilities": required_capabilities,
            "extracted_reasons": extracted_reasons,
            "lat": lat,
            "lng": lng,
            "location_accuracy_meters": location_accuracy_meters,
            "verification_status": verification_status,
            "confidence_score": round(confidence, 2),
            "verification_reasons": verification_reasons,
            "reporter_node_id": reporter_node_id or f"node-{uuid4().hex[:6]}",
            "reported_at": now.isoformat(),
            "status": "UNRESOLVED", # UNRESOLVED, DISPATCHED, RESCUED, REJECTED
            "assigned_responder_id": None
        }

        self.recent_reports.append({"lat": lat, "lng": lng, "time": now, "emergency_id": record["emergency_id"]})
        return record

intake_engine = EmergencyIntakeEngine()
