from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from uuid import UUID, uuid4

class IncidentCreate(BaseModel):
    category: str = Field(..., description="Crisis category: flood, fire, medical, structural, earthquake, supplies, other")
    severity: Optional[str] = Field("Medium", description="Low, Medium, High, Critical")
    urgency: Optional[int] = Field(5, ge=1, le=10)
    description: str = Field(..., min_length=3, description="Incident situation details")
    lat: float = Field(..., ge=-90.0, le=90.0)
    lng: float = Field(..., ge=-180.0, le=180.0)
    reporter_phone: Optional[str] = "+91 98765 43210"
    people_affected: int = Field(1, ge=0)
    food_needed: int = Field(0, ge=0)
    water_needed: int = Field(0, ge=0)
    shelter_needed: int = Field(0, ge=0)
    medical_needed: int = Field(0, ge=0)
    image_url: Optional[str] = None
    ai_assessment: Optional[str] = None
    ai_reason: Optional[str] = None
    ai_confidence: Optional[float] = None
    idempotency_key: Optional[str] = None

class IncidentStatusUpdate(BaseModel):
    status: str = Field(..., description="PENDING, VERIFIED, DISPATCHED, RESOLVED")
    actor: Optional[str] = "Admin / Tactical Command"
    note: Optional[str] = None

class IncidentResponse(BaseModel):
    incident_id: UUID
    category: str
    severity: str
    urgency: int
    status: str
    description: str
    lat: float
    lng: float
    reporter_phone: Optional[str] = None
    people_affected: int = 1
    food_needed: int = 0
    water_needed: int = 0
    shelter_needed: int = 0
    medical_needed: int = 0
    image_url: Optional[str] = None
    ai_assessment: Optional[str] = None
    ai_reason: Optional[str] = None
    ai_confidence: Optional[float] = None
    verification_status: Optional[str] = "UNVERIFIED"
    confidence_score: Optional[float] = 0.5
    verification_reasons: Optional[List[str]] = []
    assistance_status: Optional[str] = "OPEN"
    assigned_responder_id: Optional[str] = None
    is_demo: Optional[bool] = False
    created_at: datetime
    updated_at: datetime

class HelpOfferCreate(BaseModel):
    helper_id: str = Field(..., description="Unique ID of the assisting user or responder")
    helper_name: Optional[str] = "Volunteer Responder"
    assistance_type: str = Field(..., description="medical, rescue, supplies, transport, other")
    message: Optional[str] = None
    estimated_eta_min: Optional[float] = None

class HelpOfferResponse(BaseModel):
    offer_id: str
    incident_id: str
    helper_id: str
    helper_name: str
    assistance_type: str
    message: Optional[str] = None
    estimated_eta_min: Optional[float] = None
    status: str = "OFFERED"  # OFFERED, CONFIRMED, EN_ROUTE, COMPLETED, CANCELLED
    created_at: str

class SOSCreate(BaseModel):
    lat: float
    lng: float
    phone: Optional[str] = "+91 XXXXX XXXXX"
    message: Optional[str] = "Emergency SOS signal deployed"
    urgency: Optional[str] = "CRITICAL"
    battery_level: Optional[int] = 85
    evidence: Optional[str] = None
