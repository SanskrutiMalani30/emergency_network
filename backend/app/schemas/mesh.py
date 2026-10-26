from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from uuid import UUID

class DistressIntakeRequest(BaseModel):
    raw_text: str = Field(..., min_length=3, description="Unstructured natural-language distress message")
    lat: float = Field(..., ge=-90.0, le=90.0)
    lng: float = Field(..., ge=-180.0, le=180.0)
    location_accuracy_meters: float = Field(25.0, ge=1.0)
    reporter_node_id: Optional[str] = None
    evidence_attachment: Optional[str] = None
    client_message_id: Optional[str] = Field(None, description="Client-generated unique ID for outbox idempotency")
    detected_language: Optional[str] = Field("en", description="Language detected or selected (en, hi, mr, etc.)")
    audio_metadata: Optional[Dict[str, Any]] = Field(None, description="Voice recording metadata (duration, mimeType, waveform)")
    audio_evidence: Optional[str] = Field(None, description="Base64 or data URL of locally recorded audio")

class ResponderCreate(BaseModel):
    name: str
    capabilities: List[str]
    current_lat: float
    current_lng: float
    battery_pct: int = 90
    credential_id: Optional[str] = None
    has_public_key: bool = True

class DispatchActionRequest(BaseModel):
    dispatch_id: str
    action: str = Field(..., description="ACCEPT, REJECT, REPORT_UNSAFE_ROUTE, COMPLETE")
    reason: Optional[str] = None
    reporter_node_id: Optional[str] = None

class PartitionActionRequest(BaseModel):
    action: str = Field(..., description="PARTITION, RECONNECT, QUEUE_OFFLINE")
    island_id: Optional[str] = "island_A"
    event_type: Optional[str] = "DISPATCH_ACCEPTED"
    payload: Optional[Dict[str, Any]] = None

class MultiHopSOSMessage(BaseModel):
    protocol_version: int = Field(1, description="Protocol version, default 1")
    message_id: str = Field(..., description="Unique UUID/hash of the SOS message")
    type: str = Field("SOS", description="SOS, ACK, HELP_ACCEPT, CANCEL")
    origin_id: str = Field(..., description="Node ID or public key of the originator")
    created_at: str = Field(..., description="ISO-8601 creation timestamp")
    expires_at: str = Field(..., description="ISO-8601 expiry timestamp (TTL)")
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    location_accuracy_m: float = Field(15.0, ge=0.0)
    urgency: str = Field("MODERATE", description="CRITICAL, HIGH, MODERATE, LOW")
    category: str = Field("general", description="medical, flood, collapse, fire, supplies, general")
    description: str = Field(..., min_length=2, description="Distress situation description")
    hop_limit: int = Field(7, ge=1, le=15, description="Maximum hops permitted before packet is discarded")
    hops_taken: int = Field(0, ge=0, description="Hops traversed so far")
    relay_path: List[str] = Field(default_factory=list, description="Ordered array of node IDs that relayed this packet")
    payload_hash: Optional[str] = Field(None, description="SHA-256 hash of core payload for integrity verification")
    signature: Optional[str] = Field(None, description="Cryptographic Ed25519 or HMAC signature")
    delivery_status: Optional[str] = Field("SAVED_LOCALLY", description="Delivery state lifecycle badge")

class MultiHopSyncRequest(BaseModel):
    gateway_node_id: Optional[str] = Field("gateway-01", description="Identifier of the uploading gateway node")
    messages: List[MultiHopSOSMessage] = Field(..., min_length=1)

class MultiHopAck(BaseModel):
    message_id: str
    incident_id: str
    server_received_at: str
    confidence_score: float
    verification_status: str
    status: str = "SERVER_ACKNOWLEDGED"
    server_signature: str

class MultiHopSyncResponse(BaseModel):
    processed: int
    acknowledged: List[MultiHopAck]
    deduplicated: List[str]
    errors: List[Dict[str, str]]

class EmergencyContactCreate(BaseModel):
    user_id: Optional[str] = "usr-citizen"
    name: str = Field("Sanskruti", min_length=1)
    phone: str = Field("9272104399", min_length=7)
    country_code: str = Field("+91")
    relationship: Optional[str] = "Primary Contact"

class EmergencyContactResponse(BaseModel):
    contact_id: str
    user_id: str
    name: str
    phone: str
    country_code: str
    relationship: str
    created_at: str
    updated_at: str

class EmergencyNotificationRequest(BaseModel):
    sos_id: str
    trigger_source: str = Field("MANUAL", description="VOICE, GESTURE, or MANUAL")
    contact_name: str = "Sanskruti"
    contact_phone: str = "9272104399"
    country_code: str = "+91"
    lat: Optional[float] = None
    lng: Optional[float] = None
    accuracy_meters: Optional[float] = None
    location_status: str = Field("CURRENT_GPS", description="CURRENT_GPS, LAST_KNOWN, UNAVAILABLE")
    location_timestamp: Optional[str] = None
    location_age_str: Optional[str] = None
    custom_message: Optional[str] = None

class EmergencyNotificationResponse(BaseModel):
    notification_id: str
    sos_id: str
    trigger_source: str
    recipient_name: str
    recipient_phone: str
    message_text: str
    google_maps_url: Optional[str] = None
    delivery_status: str # "QUEUED_FOR_CONTACT_NOTIFICATION", "PROVIDER_ACCEPTED", "DELIVERY_CONFIRMED", "SAVED_LOCALLY"
    provider: str # "TWILIO_GATEWAY_SIMULATED", "DIRECT_CELLULAR", "BLE_RELAY"
    provider_sid: str
    created_at: str
    confirmed_at: Optional[str] = None

