from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from uuid import UUID

class DepotResponse(BaseModel):
    depot_id: UUID
    name: str
    sector: str
    lat: float
    lng: float
    food_units: int
    water_units: int
    shelter_units: int
    medical_units: int
    total_vehicles: int
    active: bool
    updated_at: datetime

class StockUpdateRequest(BaseModel):
    depot_id: UUID
    supply_type: str = Field(..., description="food, water, shelter, medical")
    quantity: int = Field(..., description="Quantity to add (or subtract if negative)")

class DeliveryVehicle(BaseModel):
    vehicle_id: UUID
    vehicle_number: str
    depot_id: UUID
    vehicle_type: str = "Relief Truck"
    status: str = "AVAILABLE"  # AVAILABLE, EN_ROUTE, DELIVERED, RETURNING
    current_lat: float
    current_lng: float
    assigned_incident_id: Optional[UUID] = None
    updated_at: datetime

class AllocationRequest(BaseModel):
    incident_id: UUID
    depot_id: UUID
    vehicle_id: UUID
    food_units: int = 0
    water_units: int = 0
    shelter_units: int = 0
    medical_units: int = 0

class DeliveryResponse(BaseModel):
    delivery_id: UUID
    incident_id: UUID
    depot_id: UUID
    vehicle_id: UUID
    vehicle_number: str
    status: str  # ASSIGNED, EN_ROUTE, DELIVERED
    food_units: int
    water_units: int
    shelter_units: int
    medical_units: int
    eta_minutes: int
    created_at: datetime
    updated_at: datetime
