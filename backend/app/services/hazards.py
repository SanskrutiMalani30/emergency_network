"""
RESQMesh — Hazard & Safe Routing Engine
Manages environmental hazards (flood zones, road blockages, structural debris)
and evaluates route safety and detours.
"""

import math
from typing import List, Dict, Any, Optional
from uuid import uuid4

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0 # Earth radius in km
    dLat = math.radians(lat2 - lat1)
    dLon = math.radians(lon2 - lon1)
    a = (math.sin(dLat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dLon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

class HazardZone:
    def __init__(self, hazard_id: str, name: str, hazard_type: str, severity: str,
                 center_lat: float, center_lng: float, radius_km: float, active: bool = True):
        self.hazard_id = hazard_id
        self.name = name
        self.hazard_type = hazard_type  # 'flood_zone', 'road_block', 'structural_collapse', 'fire'
        self.severity = severity        # 'critical', 'high', 'moderate'
        self.center_lat = center_lat
        self.center_lng = center_lng
        self.radius_km = radius_km
        self.active = active

    def to_dict(self) -> Dict[str, Any]:
        return {
            "hazard_id": self.hazard_id,
            "name": self.name,
            "hazard_type": self.hazard_type,
            "severity": self.severity,
            "center_lat": self.center_lat,
            "center_lng": self.center_lng,
            "radius_km": self.radius_km,
            "active": self.active
        }

class HazardEngine:
    def __init__(self):
        self.hazards: Dict[str, HazardZone] = {}
        self._seed_default_hazards()

    def _seed_default_hazards(self):
        h1 = HazardZone(
            hazard_id="hz-flood-ward12",
            name="Ward 12 Flash Inundation Zone",
            hazard_type="flood_zone",
            severity="critical",
            center_lat=21.1480,
            center_lng=79.0830,
            radius_km=0.75,
            active=True
        )
        h2 = HazardZone(
            hazard_id="hz-bridge-collapse",
            name="North Canal Road Bridge Blockage",
            hazard_type="road_block",
            severity="high",
            center_lat=21.1390,
            center_lng=79.0650,
            radius_km=0.40,
            active=True
        )
        self.hazards[h1.hazard_id] = h1
        self.hazards[h2.hazard_id] = h2

    def get_active_hazards(self) -> List[Dict[str, Any]]:
        return [h.to_dict() for h in self.hazards.values() if h.active]

    def add_hazard(self, name: str, hazard_type: str, severity: str, lat: float, lng: float, radius_km: float) -> Dict[str, Any]:
        hid = f"hz-{uuid4().hex[:8]}"
        zone = HazardZone(hid, name, hazard_type, severity, lat, lng, radius_km, active=True)
        self.hazards[hid] = zone
        return zone.to_dict()

    def toggle_hazard(self, hazard_id: str, active: bool) -> Optional[Dict[str, Any]]:
        if hazard_id in self.hazards:
            self.hazards[hazard_id].active = active
            return self.hazards[hazard_id].to_dict()
        return None

    def evaluate_route_hazards(self, start_lat: float, start_lng: float, end_lat: float, end_lng: float) -> Dict[str, Any]:
        """
        Samples points along the direct route line and checks for intersecting active hazards.
        """
        intersecting = []
        steps = 15
        direct_dist = haversine_km(start_lat, start_lng, end_lat, end_lng)

        for i in range(steps + 1):
            t = i / steps
            interp_lat = start_lat + (end_lat - start_lat) * t
            interp_lng = start_lng + (end_lng - start_lng) * t

            for h in self.hazards.values():
                if not h.active:
                    continue
                d = haversine_km(interp_lat, interp_lng, h.center_lat, h.center_lng)
                if d <= h.radius_km:
                    if h.to_dict() not in intersecting:
                        intersecting.append(h.to_dict())

        is_safe = len(intersecting) == 0
        risk_penalty = sum(2.0 if h["severity"] == "critical" else 1.0 for h in intersecting)
        adjusted_travel_minutes = round((direct_dist / 20.0) * 60 * (1.0 + risk_penalty * 0.8) + (5 if not is_safe else 0), 1)

        detour_recommended = not is_safe
        explanation = (
            "Route is clear of recorded environmental hazards."
            if is_safe else
            f"Route intersects {len(intersecting)} hazard zones ({', '.join(h['name'] for h in intersecting)}). Safe detour increases travel time by ~{adjusted_travel_minutes} min."
        )

        return {
            "direct_distance_km": round(direct_dist, 2),
            "estimated_minutes": adjusted_travel_minutes,
            "is_safe": is_safe,
            "intersecting_hazards": intersecting,
            "detour_recommended": detour_recommended,
            "explanation": explanation
        }

    def relocate_hazards(self, center_lat: float, center_lng: float) -> List[Dict[str, Any]]:
        """
        Relocates simulated disaster hazards relative to the user's location,
        placing them in the 4.0 - 5.5 km corridor along access routes.
        """
        rad1 = math.radians(120)
        d_lat1 = (4.5 / 111.32) * math.cos(rad1)
        cos_lat = math.cos(math.radians(center_lat))
        d_lng1 = (4.5 / (111.32 * (abs(cos_lat) if abs(cos_lat) > 0.01 else 1.0))) * math.sin(rad1)

        rad2 = math.radians(295)
        d_lat2 = (3.8 / 111.32) * math.cos(rad2)
        d_lng2 = (3.8 / (111.32 * (abs(cos_lat) if abs(cos_lat) > 0.01 else 1.0))) * math.sin(rad2)

        if "hz-flood-ward12" in self.hazards:
            self.hazards["hz-flood-ward12"].center_lat = round(center_lat + d_lat1, 5)
            self.hazards["hz-flood-ward12"].center_lng = round(center_lng + d_lng1, 5)

        if "hz-bridge-collapse" in self.hazards:
            self.hazards["hz-bridge-collapse"].center_lat = round(center_lat + d_lat2, 5)
            self.hazards["hz-bridge-collapse"].center_lng = round(center_lng + d_lng2, 5)

        return self.get_active_hazards()

hazard_engine = HazardEngine()
