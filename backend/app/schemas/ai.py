from pydantic import BaseModel, Field
from typing import Optional, List, Dict

class AIAssessmentRequest(BaseModel):
    category: Optional[str] = None
    description: str = Field(..., min_length=2, description="Situation description or transcript")
    people_affected: Optional[int] = 1
    has_image: bool = False
    image_data_url: Optional[str] = None

class AIAssessmentResponse(BaseModel):
    suggested_category: str
    severity: str  # Critical, High, Medium, Low
    urgency_score: int  # 1 to 10
    confidence: float
    recommended_food: int
    recommended_water: int
    recommended_shelter: int
    recommended_medical: int
    recommended_vehicles: List[str]
    ai_reason: str
    model_version: str = "Rakshak-Triage-v2.4-HeuristicNLP"
    is_mock_simulation: bool = False
