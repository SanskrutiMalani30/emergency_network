from fastapi import APIRouter
from ..schemas.ai import AIAssessmentRequest, AIAssessmentResponse
from ..services.ai_triage import ai_engine

router = APIRouter(prefix="/ai", tags=["AI Crisis Triage"])

@router.post("/assess", response_model=AIAssessmentResponse)
def assess_crisis_situation(req: AIAssessmentRequest):
    """
    Run explainable AI triage on a crisis description or voice transcript.
    Returns calculated urgency, severity, resource estimations, and justification.
    """
    return ai_engine.assess_incident(req)
