"""
Rakshak AI — Crisis Triage and Priority Assessment Engine
Module: app.services.ai_triage

Description:
This module provides automated, explainable crisis assessment and supply estimation
based on reported incident descriptions, casualty counts, and situational tags.

Inputs:
- description: Text details of the emergency (or speech-to-text transcript)
- people_affected: Integer count of individuals needing aid
- category: Optional user-suggested emergency category
- has_image: Boolean indicating if visual media was attached

Outputs:
- suggested_category: 'flood', 'fire', 'medical', 'structural', 'earthquake', 'supplies', 'other'
- severity: 'Critical', 'High', 'Medium', 'Low'
- urgency_score: Integer 1-10
- confidence: Float 0.0 - 1.0
- recommended_food, recommended_water, recommended_shelter, recommended_medical
- recommended_vehicles: List of vehicle types
- ai_reason: Transparent explanation of the automated score

Limitations:
- Uses heuristic multi-factor NLP classification when LLM API keys are not supplied.
- Not a replacement for official emergency dispatcher judgement.
"""

import re
from typing import Dict, Any, List
from ..schemas.ai import AIAssessmentRequest, AIAssessmentResponse

# Keyword lexicons with severity weights
CRITICAL_KEYWORDS = {
    "trapped": 3.5, "collapse": 3.5, "bleeding": 3.0, "unconscious": 3.5,
    "drowning": 3.5, "infant": 2.5, "baby": 2.5, "severe": 2.0, "explosion": 3.5,
    "suffocation": 3.5, "critical": 3.0, "fire": 2.5, "casualty": 3.5, "stroke": 3.0,
    "cardiac": 3.5, "oxygen": 2.5, "crushed": 3.5, "gas leak": 3.0
}

HIGH_KEYWORDS = {
    "flood": 2.0, "stranded": 2.0, "injury": 2.0, "smoke": 2.0, "broken": 1.5,
    "water rising": 2.5, "urgent": 2.0, "elderly": 1.5, "pregnant": 2.0,
    "food running out": 2.0, "no water": 2.0, "hypothermia": 2.5, "burns": 2.0
}

CATEGORY_KEYWORDS = {
    "flood": ["flood", "water", "submerged", "drowning", "river", "boat", "overflow", "monsoon"],
    "fire": ["fire", "smoke", "flames", "burn", "wildfire", "blaze", "gas", "explosion"],
    "medical": ["injury", "bleeding", "cardiac", "stroke", "unconscious", "wound", "medicine", "doctor", "ambulance", "oxygen"],
    "structural": ["collapse", "building", "rubble", "cracked", "bridge", "trapped under", "debris"],
    "earthquake": ["tremor", "quake", "aftershock", "seismic", "shaking"],
    "supplies": ["food", "water", "ration", "shelter", "blanket", "starving", "thirst", "dry food"]
}

class AITriageEngine:
    def __init__(self, model_version: str = "Rakshak-Triage-v2.4-HeuristicNLP"):
        self.model_version = model_version

    def assess_incident(self, req: AIAssessmentRequest) -> AIAssessmentResponse:
        text = req.description.lower()
        people = max(1, req.people_affected or 1)
        
        # 1. Determine Category
        matched_category = req.category if req.category and req.category != "other" else None
        if not matched_category:
            cat_scores = {cat: 0 for cat in CATEGORY_KEYWORDS}
            for cat, keywords in CATEGORY_KEYWORDS.items():
                for kw in keywords:
                    if kw in text:
                        cat_scores[cat] += 1
            best_cat = max(cat_scores.items(), key=lambda x: x[1])
            matched_category = best_cat[0] if best_cat[1] > 0 else "supplies"

        # 2. Score urgency based on weighted signals
        raw_urgency_score = 3.0  # Baseline
        reasons: List[str] = []
        
        # Check critical keywords
        crit_found = [kw for kw in CRITICAL_KEYWORDS if re.search(rf"\b{kw}\b", text)]
        for kw in crit_found:
            raw_urgency_score += CRITICAL_KEYWORDS[kw]
            reasons.append(f"Detected high-hazard indicator '{kw}'")

        # Check high urgency keywords
        high_found = [kw for kw in HIGH_KEYWORDS if re.search(rf"\b{kw}\b", text)]
        for kw in high_found:
            raw_urgency_score += HIGH_KEYWORDS[kw]
            reasons.append(f"Identified vulnerable condition '{kw}'")

        # Scale by casualty count
        if people > 50:
            raw_urgency_score += 3.0
            reasons.append(f"Mass casualty scale ({people} individuals affected)")
        elif people > 10:
            raw_urgency_score += 1.8
            reasons.append(f"Multi-person emergency ({people} individuals)")
        elif people > 1:
            raw_urgency_score += 0.8

        # Image presence bonus
        if req.has_image or req.image_data_url:
            raw_urgency_score += 0.5
            reasons.append("Visual evidence provided with report")

        # Clamp score between 1 and 10
        urgency_score = min(10, max(1, int(round(raw_urgency_score))))

        # Classify Severity
        if urgency_score >= 8:
            severity = "Critical"
        elif urgency_score >= 6:
            severity = "High"
        elif urgency_score >= 4:
            severity = "Medium"
        else:
            severity = "Low"

        # 3. Supply & Resource Recommendations
        # Standards: 2-3 food rations per person, 4-5 liters of water per person, shelter tarps, first aid kits
        recommended_food = people * 2
        recommended_water = people * 4
        recommended_shelter = max(1, (people + 3) // 4)  # 1 shelter kit per 4 people
        recommended_medical = max(1, (people + 9) // 10) # 1 kit per 10 people

        if matched_category == "medical":
            recommended_medical = max(3, people)
        elif matched_category == "supplies":
            recommended_food = people * 3
            recommended_water = people * 5

        # Vehicles
        recommended_vehicles = []
        if severity == "Critical" or matched_category == "medical":
            recommended_vehicles.append("Emergency Ambulance")
        if people > 15 or recommended_food > 30:
            recommended_vehicles.append("Heavy Relief Truck")
        else:
            recommended_vehicles.append("Rapid Cargo Van")
        if matched_category in ["flood", "structural"]:
            recommended_vehicles.append("Reconnaissance Drone")

        # AI Reason Formulation
        if not reasons:
            reasons.append("Standard citizen report; baseline priority applied pending field review")
        
        reason_summary = (
            f"Assigned {severity} priority (Urgency {urgency_score}/10) for {matched_category.upper()}. "
            + "; ".join(reasons) + "."
        )

        confidence = round(min(0.96, 0.65 + (len(crit_found) * 0.08) + (len(high_found) * 0.04)), 2)

        return AIAssessmentResponse(
            suggested_category=matched_category,
            severity=severity,
            urgency_score=urgency_score,
            confidence=confidence,
            recommended_food=recommended_food,
            recommended_water=recommended_water,
            recommended_shelter=recommended_shelter,
            recommended_medical=recommended_medical,
            recommended_vehicles=recommended_vehicles,
            ai_reason=reason_summary,
            model_version=self.model_version,
            is_mock_simulation=False
        )

ai_engine = AITriageEngine()
