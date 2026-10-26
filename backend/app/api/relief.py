from fastapi import APIRouter, HTTPException, status
from typing import List
from uuid import UUID

from ..schemas.relief import (
    DepotResponse,
    StockUpdateRequest,
    DeliveryVehicle,
    AllocationRequest,
    DeliveryResponse
)
from ..db.repository import repository

router = APIRouter(prefix="/relief", tags=["Relief Operations & Supplies"])

@router.get("/depots", response_model=List[DepotResponse])
def get_depots():
    """List all humanitarian relief depots and active supply stock."""
    return repository.get_all_depots()

@router.post("/depots/stock", response_model=DepotResponse)
def update_stock(req: StockUpdateRequest):
    """Add or adjust stock for a specific depot."""
    depot = repository.update_depot_stock(req.depot_id, req.supply_type, req.quantity)
    if not depot:
        raise HTTPException(status_code=404, detail="Depot not found")
    return depot

@router.get("/vehicles", response_model=List[DeliveryVehicle])
def get_vehicles():
    """List all delivery and rescue vehicles."""
    return repository.get_available_vehicles()

@router.post("/allocate", response_model=DeliveryResponse, status_code=status.HTTP_201_CREATED)
def allocate_supplies(req: AllocationRequest):
    """
    Approve allocation from a depot to an incident, assign vehicle, and deduct inventory.
    """
    delivery = repository.allocate_delivery(
        incident_id=req.incident_id,
        depot_id=req.depot_id,
        vehicle_id=req.vehicle_id,
        food_units=req.food_units,
        water_units=req.water_units,
        shelter_units=req.shelter_units,
        medical_units=req.medical_units
    )
    if not delivery:
        raise HTTPException(status_code=400, detail="Unable to allocate delivery. Check incident, depot, or vehicle validity.")
    return delivery

@router.get("/deliveries", response_model=List[DeliveryResponse])
def list_deliveries():
    """List all delivery assignments and in-transit relief loads."""
    return repository.list_deliveries()

@router.patch("/deliveries/{delivery_id}/status", response_model=DeliveryResponse)
def update_delivery_status(delivery_id: UUID, status: str):
    """Transition delivery state (e.g., EN_ROUTE, DELIVERED)."""
    updated = repository.update_delivery_status(delivery_id, status)
    if not updated:
        raise HTTPException(status_code=404, detail="Delivery record not found")
    return updated
