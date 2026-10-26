"""
RESQMesh — Capability Normalization & Opportunity-Cost Matching Engine
Matches victims with capable, trustworthy responders while penalizing hazard exposure
and preserving scarce specialists for high-severity emergencies.
"""

from typing import List, Dict, Any, Optional
from .hazards import hazard_engine, haversine_km

# Capability synonyms & open-vocabulary normalization
CAPABILITY_SYNONYMS = {
    "watercraft_rescue": ["boat", "has a boat", "canoe", "inflatable raft", "dinghy", "swimmer", "kayak"],
    "dialysis_specialist": ["dialysis", "can do dialysis", "nephrology nurse", "renal care", "dialysis tech"],
    "refrigerated_insulin_supply": ["insulin", "cold storage", "diabetic medicine", "insulin transport"],
    "trauma_paramedic": ["paramedic", "trauma", "doctor", "surgeon", "emergency nurse", "stretcher"],
    "portable_oxygen": ["oxygen", "can carry oxygen", "oxygen cylinder", "respiratory tech"],
    "fire_suppression": ["firefighter", "extinguisher", "fire suit", "smoke gear"]
}

def normalize_capability(claim: str) -> str:
    claim_lower = claim.lower().strip()
    for standard_cap, syns in CAPABILITY_SYNONYMS.items():
        if claim_lower == standard_cap or any(s in claim_lower for s in syns):
            return standard_cap
    return claim_lower.replace(" ", "_")

class OpportunityCostMatcher:
    def __init__(self):
        # Known scarce capabilities that should not be squandered on trivial incidents
        self.scarce_capabilities = {"dialysis_specialist", "trauma_paramedic", "watercraft_rescue"}

    def rank_responders(
        self,
        emergency: Dict[str, Any],
        responders: List[Dict[str, Any]],
        all_unresolved_emergencies: Optional[List[Dict[str, Any]]] = None
    ) -> List[Dict[str, Any]]:
        """
        Ranks candidate responders with explicit, plain-language selection/rejection reasons.
        """
        req_caps = [normalize_capability(c) for c in emergency.get("required_capabilities", [])]
        emg_lat = emergency["lat"]
        emg_lng = emergency["lng"]
        emg_urgency = emergency.get("urgency", 5)
        emg_severity = emergency.get("severity", "MEDIUM")

        ranked_candidates = []

        # Count other pending critical emergencies that might need scarce skills
        pending_critical_needs = set()
        if all_unresolved_emergencies:
            for other in all_unresolved_emergencies:
                if other.get("emergency_id") != emergency.get("emergency_id") and other.get("urgency", 0) >= 8:
                    for c in other.get("required_capabilities", []):
                        pending_critical_needs.add(normalize_capability(c))

        for resp in responders:
            # 1. Capability Matching
            resp_caps = [normalize_capability(c) for c in resp.get("capabilities", [])]
            matched_caps = [c for c in req_caps if c in resp_caps or c == "general_first_aid_rescue"]
            has_required_capabilities = len(matched_caps) > 0 or "general_first_aid_rescue" in resp_caps

            # 2. Distance and Hazard Evaluation
            r_lat = resp.get("current_lat", 21.1458)
            r_lng = resp.get("current_lng", 79.0882)
            route_info = hazard_engine.evaluate_route_hazards(r_lat, r_lng, emg_lat, emg_lng)
            travel_mins = route_info["estimated_minutes"]
            is_safe_route = route_info["is_safe"]

            # 3. Base Score Calculation (0.0 to 100.0)
            score = 70.0

            # Proximity factor (closer = higher score)
            proximity_penalty = min(30.0, route_info["direct_distance_km"] * 3.5)
            score -= proximity_penalty

            # Capability match bonus
            if len(matched_caps) >= len(req_caps):
                score += 20.0
            elif has_required_capabilities:
                score += 10.0
            else:
                score -= 40.0 # Missing critical qualification

            # Trust factor
            trust_score = resp.get("trust_score", 0.5)
            score += (trust_score - 0.5) * 20.0

            # Battery health
            battery = resp.get("battery_pct", 100)
            if battery < 20:
                score -= 25.0
            elif battery < 40:
                score -= 10.0

            # Availability
            if resp.get("status") != "AVAILABLE":
                score -= 50.0

            # Hazard penalty
            if not is_safe_route:
                score -= 20.0

            # 4. OPPORTUNITY COST CHECK:
            # Avoid assigning a scarce specialist (e.g. dialysis specialist) to a low-urgency case
            # when another pending critical emergency might need them!
            is_scarce = any(c in self.scarce_capabilities for c in resp_caps)
            opportunity_cost_warning = None

            if is_scarce and emg_urgency < 7:
                overlapping_critical = [c for c in resp_caps if c in pending_critical_needs]
                if overlapping_critical:
                    score -= 35.0 # Preserve specialist!
                    opportunity_cost_warning = (
                        f"Specialist '{', '.join(overlapping_critical)}' held in reserve: "
                        "opportunity cost too high for moderate incident while critical life-support requests are pending."
                    )

            score = round(max(0.0, min(100.0, score)), 1)

            # 5. Formulate Plain-Language Explanation
            reasons = []
            if len(matched_caps) > 0:
                reasons.append(f"Possesses matching skill ({', '.join(matched_caps)})")
            if is_safe_route:
                reasons.append(f"Route is clear of flood/debris ({travel_mins} min ETA)")
            else:
                reasons.append(f"Hazard on direct path (+{travel_mins} min detour)")
            if battery < 30:
                reasons.append(f"Low battery warning ({battery}%)")
            if opportunity_cost_warning:
                reasons.append(opportunity_cost_warning)

            justification = (
                f"Ranked with score {score}/100. " + "; ".join(reasons) + "."
            )

            ranked_candidates.append({
                "responder_id": resp.get("responder_id"),
                "name": resp.get("name"),
                "capabilities": resp.get("capabilities", []),
                "score": score,
                "distance_km": route_info["direct_distance_km"],
                "estimated_minutes": travel_mins,
                "is_safe_route": is_safe_route,
                "intersecting_hazards": route_info["intersecting_hazards"],
                "battery_pct": battery,
                "trust_score": trust_score,
                "status": resp.get("status"),
                "is_suitable": score >= 40.0 and has_required_capabilities,
                "justification": justification
            })

        # Sort highest score first
        ranked_candidates.sort(key=lambda x: x["score"], reverse=True)
        return ranked_candidates

matcher = OpportunityCostMatcher()
