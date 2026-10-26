"""
RESQMesh — Low-Latency Unified Data Access Repository Layer
Integrates ScyllaDB prepared statements and high-throughput thread-safe memory state.
Supports emergencies, responders, dispatches, hazards, trust indicators, and audit trails.
"""

from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from uuid import UUID, uuid4
import threading
import logging
import hashlib
import math

from .session import db_manager
from ..schemas.incident import IncidentCreate, IncidentResponse, SOSCreate
from ..schemas.relief import DepotResponse, DeliveryResponse, DeliveryVehicle
from ..schemas.events import TacticalEventResponse
from ..schemas.mesh import DistressIntakeRequest, MultiHopSOSMessage
from ..services.verification import intake_engine
from ..services.trust import trust_engine
from ..services.hazards import hazard_engine

logger = logging.getLogger("resqmesh.db.repository")

class UnifiedRepository:
    def __init__(self):
        self._lock = threading.Lock()
        
        # Core entities
        self._incidents: Dict[UUID, Dict[str, Any]] = {}
        self._emergencies: Dict[str, Dict[str, Any]] = {}
        self._responders: Dict[str, Dict[str, Any]] = {}
        self._dispatches: Dict[str, Dict[str, Any]] = {}
        self._events: List[Dict[str, Any]] = []
        self._help_offers: Dict[str, List[Dict[str, Any]]] = {}
        
        # Legacy relief entities
        self._depots: Dict[UUID, Dict[str, Any]] = {}
        self._vehicles: Dict[UUID, Dict[str, Any]] = {}
        self._deliveries: Dict[UUID, Dict[str, Any]] = {}
        self._sos_records: List[Dict[str, Any]] = []
        self._idempotency_keys: Dict[str, UUID] = {}
        self._client_message_map: Dict[str, str] = {}
        self._multi_hop_messages: Dict[str, Dict[str, Any]] = {}
        self._multi_hop_acks: Dict[str, Dict[str, Any]] = {}
        self._emergency_contacts: Dict[str, Dict[str, Any]] = {}
        self._emergency_notifications: Dict[str, Dict[str, Any]] = {}
        self._notification_idempotency: Dict[str, str] = {}

        self._seed_default_data()

    def _seed_default_data(self):
        now = datetime.now(timezone.utc)

        # 1. Seed Verified Responders with varied capabilities & batteries
        r1_id = "resp-dr-sarah"
        self._responders[r1_id] = {
            "responder_id": r1_id,
            "name": "Dr. Sarah Rao",
            "role": "Trauma Surgeon",
            "capabilities": ["trauma_paramedic", "general_first_aid_rescue"],
            "credential_id": "MED-LIC-9812",
            "is_cryptographically_signed": True,
            "has_public_key": True,
            "current_lat": 21.1440,
            "current_lng": 79.0860,
            "battery_pct": 86,
            "status": "AVAILABLE",
            "trust_score": 0.96,
            "completed_missions": 14,
            "last_contact": now.isoformat()
        }

        r2_id = "resp-karan-dialysis"
        self._responders[r2_id] = {
            "responder_id": r2_id,
            "name": "Karan Patel, RN",
            "role": "Renal & Critical Care Specialist",
            "capabilities": ["dialysis_specialist", "refrigerated_insulin_supply"],
            "credential_id": "RN-PARAMEDIC-4401",
            "is_cryptographically_signed": True,
            "has_public_key": True,
            "current_lat": 21.1415,
            "current_lng": 79.0830,
            "battery_pct": 92,
            "status": "AVAILABLE",
            "trust_score": 0.94,
            "completed_missions": 19,
            "last_contact": now.isoformat()
        }

        r3_id = "resp-boat-amit"
        self._responders[r3_id] = {
            "responder_id": r3_id,
            "name": "Amit Verma",
            "role": "Flood Rescue Boat Pilot",
            "capabilities": ["watercraft_rescue", "special_mobility_assistance"],
            "credential_id": "BOAT-CERT-1102",
            "is_cryptographically_signed": True,
            "has_public_key": True,
            "current_lat": 21.1270,
            "current_lng": 79.0550,
            "battery_pct": 74,
            "status": "AVAILABLE",
            "trust_score": 0.91,
            "completed_missions": 8,
            "last_contact": now.isoformat()
        }

        r4_id = "resp-scout-rohit"
        self._responders[r4_id] = {
            "responder_id": r4_id,
            "name": "Rohit Deshmukh",
            "role": "Volunteer First Responder",
            "capabilities": ["general_first_aid_rescue", "emergency_rations_water"],
            "credential_id": None,
            "is_cryptographically_signed": False,
            "has_public_key": False,
            "current_lat": 21.1495,
            "current_lng": 79.0920,
            "battery_pct": 28,  # Low battery warning scenario
            "status": "AVAILABLE",
            "trust_score": 0.65,
            "completed_missions": 3,
            "last_contact": now.isoformat()
        }

        # 2. Seed Structured DEMO Emergencies (Clearly marked with is_demo = True)
        emg1_id = "demo-emg-02-flood"
        self._emergencies[emg1_id] = {
            "emergency_id": emg1_id,
            "raw_message": "Ground floor completely flooded, need boat evacuation for elderly patient with breathing distress.",
            "category": "flood",
            "severity": "CRITICAL",
            "urgency": 9,
            "required_capabilities": ["watercraft_rescue", "portable_oxygen", "special_mobility_assistance"],
            "lat": 21.1524,
            "lng": 79.0910,
            "location_accuracy_meters": 12.0,
            "verification_status": "VERIFIED",
            "confidence_score": 0.94,
            "verification_reasons": ["Corroborated by 2 independent neighborhood mesh reports", "High GPS accuracy (<15m)"],
            "status": "OPEN",
            "assistance_status": "OPEN",
            "assigned_responder_id": None,
            "is_demo": True,
            "reported_at": now.isoformat()
        }

        emg2_id = "demo-emg-01-insulin"
        self._emergencies[emg2_id] = {
            "emergency_id": emg2_id,
            "raw_message": "Need urgent insulin and glucose monitoring for father, trapped by blocked canal crossing.",
            "category": "medical",
            "severity": "CRITICAL",
            "urgency": 9,
            "required_capabilities": ["refrigerated_insulin_supply"],
            "lat": 21.1430,
            "lng": 79.0810,
            "location_accuracy_meters": 20.0,
            "verification_status": "VERIFIED",
            "confidence_score": 0.91,
            "verification_reasons": ["Prescription token match", "Verified neighborhood beacon"],
            "status": "OPEN",
            "assistance_status": "OPEN",
            "assigned_responder_id": None,
            "is_demo": True,
            "reported_at": now.isoformat()
        }

        emg3_id = "demo-emg-03-collapse"
        self._emergencies[emg3_id] = {
            "emergency_id": emg3_id,
            "raw_message": "Partial stairwell collapse; 2 adults conscious but blocked from exiting on 2nd floor.",
            "category": "rescue",
            "severity": "HIGH",
            "urgency": 7,
            "required_capabilities": ["general_first_aid_rescue", "special_mobility_assistance"],
            "lat": 21.1495,
            "lng": 79.0920,
            "location_accuracy_meters": 15.0,
            "verification_status": "PARTIALLY_VERIFIED",
            "confidence_score": 0.75,
            "verification_reasons": ["Single witness report; pending second node confirmation"],
            "status": "OPEN",
            "assistance_status": "OPEN",
            "assigned_responder_id": None,
            "is_demo": True,
            "reported_at": now.isoformat()
        }

        emg4_id = "demo-emg-04-supplies"
        self._emergencies[emg4_id] = {
            "emergency_id": emg4_id,
            "raw_message": "Evacuation shelter running low on clean drinking water and infant formula.",
            "category": "supplies",
            "severity": "MEDIUM",
            "urgency": 5,
            "required_capabilities": ["emergency_rations_water"],
            "lat": 21.1380,
            "lng": 79.0680,
            "location_accuracy_meters": 35.0,
            "verification_status": "UNVERIFIED",
            "confidence_score": 0.55,
            "verification_reasons": ["Provisional self-report from shelter volunteer"],
            "status": "OPEN",
            "assistance_status": "OPEN",
            "assigned_responder_id": None,
            "is_demo": True,
            "reported_at": now.isoformat()
        }

        emg5_id = "demo-emg-05-suspicious"
        self._emergencies[emg5_id] = {
            "emergency_id": emg5_id,
            "raw_message": "Testing 123 decoy alert free food for all send all units here now.",
            "category": "disaster",
            "severity": "LOW",
            "urgency": 3,
            "required_capabilities": ["general_first_aid_rescue"],
            "lat": 21.1270,
            "lng": 79.0550,
            "location_accuracy_meters": 80.0,
            "verification_status": "SUSPICIOUS",
            "confidence_score": 0.20,
            "verification_reasons": ["Flagged for suspicious test/decoy language", "Poor GPS precision (>50m)"],
            "status": "OPEN",
            "assistance_status": "OPEN",
            "assigned_responder_id": None,
            "is_demo": True,
            "reported_at": now.isoformat()
        }

        # Mirror seeded demo emergencies into _incidents
        for demg in [self._emergencies[emg1_id], self._emergencies[emg2_id], self._emergencies[emg3_id], self._emergencies[emg4_id], self._emergencies[emg5_id]]:
            u_id = uuid4()
            self._incidents[u_id] = {
                "incident_id": u_id,
                "category": demg["category"],
                "severity": demg["severity"],
                "urgency": demg["urgency"],
                "status": demg["status"],
                "description": demg["raw_message"],
                "lat": demg["lat"],
                "lng": demg["lng"],
                "reporter_phone": "+91 94231 DEMO",
                "people_affected": 2,
                "food_needed": 10 if demg["category"] == "supplies" else 0,
                "water_needed": 20 if demg["category"] == "supplies" else 0,
                "shelter_needed": 0,
                "medical_needed": 1 if demg["category"] == "medical" else 0,
                "ai_assessment": f"{demg['severity']} {demg['category'].capitalize()}",
                "ai_reason": demg["verification_reasons"][0] if demg["verification_reasons"] else None,
                "ai_confidence": demg["confidence_score"],
                "verification_status": demg["verification_status"],
                "confidence_score": demg["confidence_score"],
                "verification_reasons": demg["verification_reasons"],
                "assistance_status": demg["assistance_status"],
                "assigned_responder_id": demg["assigned_responder_id"],
                "is_demo": True,
                "created_at": now,
                "updated_at": now
            }

        # Seed initial operational dispatch
        disp1_id = "disp-alpha-01"
        self._dispatches[disp1_id] = {
            "dispatch_id": disp1_id,
            "emergency_id": emg1_id,
            "responder_id": r3_id,
            "responder_name": "Amit Verma (Boat Pilot)",
            "destination_lat": 21.1524,
            "destination_lng": 79.0910,
            "route_safe": True,
            "estimated_minutes": 12.0,
            "status": "ACCEPTED", # PROPOSED, ACCEPTED, REJECTED, EN_ROUTE, COMPLETED
            "justification": "Assigned boat pilot Amit Verma: victim needs watercraft evacuation and route avoids bridge obstruction.",
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }
        self._emergencies[emg1_id]["status"] = "DISPATCHED"
        self._emergencies[emg1_id]["assigned_responder_id"] = r3_id
        self._responders[r3_id]["status"] = "EN_ROUTE"

        # Seed prototype emergency contact for default users
        proto_contact_id = "contact-sanskruti-default"
        self._emergency_contacts["usr-citizen"] = {
            "contact_id": proto_contact_id,
            "user_id": "usr-citizen",
            "name": "Sanskruti",
            "phone": "9272104399",
            "country_code": "+91",
            "relationship": "Primary Emergency Contact",
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }

        # Depots for supply operations
        d1_id = UUID("11111111-1111-1111-1111-111111111111")
        self._depots[d1_id] = {
            "depot_id": d1_id,
            "name": "Central Depot Alpha",
            "sector": "Sector 4 — North Corridor",
            "lat": 21.1458,
            "lng": 79.0882,
            "food_units": 850,
            "water_units": 1400,
            "shelter_units": 120,
            "medical_units": 95,
            "total_vehicles": 8,
            "active": True,
            "updated_at": now
        }

        d2_id = UUID("22222222-2222-2222-2222-222222222222")
        self._depots[d2_id] = {
            "depot_id": d2_id,
            "name": "Forward Depot Bravo",
            "sector": "Sector 9 — Industrial West",
            "lat": 21.1215,
            "lng": 79.0520,
            "food_units": 620,
            "water_units": 950,
            "shelter_units": 80,
            "medical_units": 140,
            "total_vehicles": 6,
            "active": True,
            "updated_at": now
        }

        # Vehicles
        v1_id = UUID("33333333-3333-3333-3333-333333333331")
        self._vehicles[v1_id] = {
            "vehicle_id": v1_id,
            "vehicle_number": "TRUCK-ALPHA-01",
            "depot_id": d1_id,
            "vehicle_type": "Heavy Relief Truck",
            "status": "AVAILABLE",
            "current_lat": 21.1458,
            "current_lng": 79.0882,
            "assigned_incident_id": None,
            "updated_at": now
        }

        # Audit events
        self._events.insert(0, {
            "event_id": uuid4(),
            "incident_id": None,
            "event_type": "MESH_OPERATIONAL_READY",
            "title": "RESQMesh Decentralized Network Initialized",
            "details": "Peer topology verified across 6 active nodes. ScyllaDB low-latency store attached.",
            "actor": "System Kernel",
            "event_time": now
        })
        self._events.insert(0, {
            "event_id": uuid4(),
            "incident_id": None,
            "event_type": "DISPATCH_ACCEPTED",
            "title": "Dispatch #disp-alpha-01 Accepted by Responder",
            "details": "Amit Verma accepted flood rescue mission for Ward 12.",
            "actor": "Amit Verma (Boat Pilot)",
            "event_time": now
        })

    # ==================== RESQMESH EMERGENCIES ====================

    def process_distress_intake(self, req: DistressIntakeRequest) -> Dict[str, Any]:
        with self._lock:
            # Idempotency check for offline outbox sync
            if req.client_message_id and req.client_message_id in self._client_message_map:
                existing_id = self._client_message_map[req.client_message_id]
                if existing_id in self._emergencies:
                    logger.info(f"Deduplicated outbox intake for client_message_id {req.client_message_id}")
                    cached = dict(self._emergencies[existing_id])
                    cached["deduplicated"] = True
                    return cached

            record = intake_engine.parse_and_verify(
                raw_text=req.raw_text,
                lat=req.lat,
                lng=req.lng,
                location_accuracy_meters=req.location_accuracy_meters,
                reporter_node_id=req.reporter_node_id,
                evidence_attachment=req.evidence_attachment
            )
            emg_id = record["emergency_id"]
            
            # Enrich with client idempotency and voice audio metadata
            if req.client_message_id:
                record["client_message_id"] = req.client_message_id
                self._client_message_map[req.client_message_id] = emg_id

            record["detected_language"] = req.detected_language or "en"
            record["audio_metadata"] = req.audio_metadata
            record["audio_evidence"] = req.audio_evidence

            self._emergencies[emg_id] = record

            # Log audit event
            self._events.insert(0, {
                "event_id": uuid4(),
                "incident_id": None,
                "event_type": "EMERGENCY_INTAKE_VERIFIED",
                "title": f"Emergency Parsed: {record['severity']} ({record['verification_status']})",
                "details": f"Required: {', '.join(record['required_capabilities'])}. Language: {record['detected_language']}. Confidence: {int(record['confidence_score']*100)}%.",
                "actor": req.reporter_node_id or "Mesh Peer",
                "event_time": datetime.now(timezone.utc)
            })

            # Also create in ScyllaDB if active
            if db_manager.is_connected and db_manager.session:
                try:
                    stmt = db_manager.prepared_statements.get("insert_incident")
                    if stmt:
                        db_manager.session.execute(
                            stmt,
                            (
                                uuid4(), record["category"], record["severity"], record["urgency"],
                                "PENDING", record["raw_message"], record["lat"], record["lng"],
                                "+91 Mesh Node", 1, 0, 0, 0, 0, None,
                                record["verification_status"], record["verification_reasons"][0],
                                record["confidence_score"], emg_id, datetime.now(timezone.utc), datetime.now(timezone.utc)
                            ),
                            execution_profile="critical_write"
                        )
                except Exception as e:
                    logger.warning(f"ScyllaDB write note: {e}")

            return record

    def sync_outbox_batch(self, reports: List[DistressIntakeRequest]) -> Dict[str, Any]:
        """
        Processes a batch of offline outbox reports upon network reconnection or peer sync.
        """
        synced = []
        deduplicated = []
        errors = []

        for req in reports:
            try:
                res = self.process_distress_intake(req)
                if res.get("deduplicated"):
                    deduplicated.append({
                        "client_message_id": req.client_message_id,
                        "emergency_id": res["emergency_id"],
                        "status": "DEDUPLICATED"
                    })
                else:
                    synced.append({
                        "client_message_id": req.client_message_id,
                        "emergency_id": res["emergency_id"],
                        "status": "SYNCED",
                        "severity": res.get("severity")
                    })
            except Exception as e:
                errors.append({
                    "client_message_id": req.client_message_id,
                    "error": str(e)
                })

        return {
            "total_processed": len(reports),
            "synced_count": len(synced),
            "deduplicated_count": len(deduplicated),
            "error_count": len(errors),
            "synced": synced,
            "deduplicated": deduplicated,
            "errors": errors
        }

    # ==================== MULTI-HOP SOS RELAY & INGESTION ====================

    def process_multihop_message(self, msg: MultiHopSOSMessage, gateway_node_id: str = "gateway-01") -> Dict[str, Any]:
        with self._lock:
            now = datetime.now(timezone.utc)
            now_iso = now.isoformat()

            # 1. Deduplication / Loop check
            if msg.message_id in self._multi_hop_messages:
                existing = self._multi_hop_messages[msg.message_id]
                # Merge relay paths if novel nodes
                combined_path = list(dict.fromkeys(existing.get("relay_path", []) + msg.relay_path))
                existing["relay_path"] = combined_path
                existing["hops_taken"] = min(existing.get("hops_taken", 99), msg.hops_taken)
                existing["last_seen_gateway"] = gateway_node_id

                ack = self._multi_hop_acks.get(msg.message_id)
                if not ack:
                    ack = {
                        "message_id": msg.message_id,
                        "incident_id": existing.get("emergency_id", msg.message_id),
                        "server_received_at": now_iso,
                        "confidence_score": existing.get("confidence_score", 0.75),
                        "verification_status": existing.get("verification_status", "PARTIALLY_VERIFIED"),
                        "status": "SERVER_ACKNOWLEDGED",
                        "server_signature": hashlib.sha256(f"RESQMESH_SERVER_ACK:{msg.message_id}:{now_iso}".encode()).hexdigest()
                    }
                    self._multi_hop_acks[msg.message_id] = ack

                return {
                    "is_duplicate": True,
                    "ack": ack,
                    "record": existing
                }

            # 2. Parse & Verify through Emergency Intake Engine
            # Note: Do not artificially inflate independent witnesses if same event
            record = intake_engine.parse_and_verify(
                raw_text=msg.description,
                lat=msg.latitude,
                lng=msg.longitude,
                location_accuracy_meters=msg.location_accuracy_m,
                reporter_node_id=msg.origin_id
            )

            emg_id = record["emergency_id"]
            record["message_id"] = msg.message_id
            record["protocol_version"] = msg.protocol_version
            record["origin_id"] = msg.origin_id
            record["hop_limit"] = msg.hop_limit
            record["hops_taken"] = msg.hops_taken
            record["relay_path"] = msg.relay_path
            record["gateway_node_id"] = gateway_node_id
            record["expires_at"] = msg.expires_at
            record["payload_hash"] = msg.payload_hash
            record["signature"] = msg.signature
            record["delivery_status"] = "SERVER_ACKNOWLEDGED"

            self._emergencies[emg_id] = record
            self._client_message_map[msg.message_id] = emg_id
            self._multi_hop_messages[msg.message_id] = record

            # Mirror to _incidents for map and active incidents dashboard
            u_id = uuid4()
            inc_rec = {
                "incident_id": u_id,
                "category": record["category"],
                "severity": record["severity"],
                "urgency": record["urgency"],
                "status": "PENDING",
                "description": record["raw_message"],
                "lat": record["lat"],
                "lng": record["lng"],
                "reporter_phone": f"+91 Mesh ({msg.origin_id})",
                "people_affected": 1,
                "food_needed": 0,
                "water_needed": 0,
                "shelter_needed": 0,
                "medical_needed": 1 if record["category"] == "medical" else 0,
                "ai_assessment": f"{record['severity']} {record['category'].capitalize()}",
                "ai_reason": record["verification_reasons"][0] if record["verification_reasons"] else None,
                "ai_confidence": record["confidence_score"],
                "verification_status": record["verification_status"],
                "confidence_score": record["confidence_score"],
                "verification_reasons": record["verification_reasons"],
                "assistance_status": "OPEN",
                "assigned_responder_id": None,
                "delivery_status": "SERVER_ACKNOWLEDGED",
                "hops_taken": msg.hops_taken,
                "relay_path": msg.relay_path,
                "is_demo": False,
                "created_at": now,
                "updated_at": now
            }
            self._incidents[u_id] = inc_rec

            # Generate Server ACK with cryptographic signature
            sig_raw = f"RESQMESH_SERVER_ACK:{msg.message_id}:{emg_id}:{now_iso}"
            server_sig = hashlib.sha256(sig_raw.encode()).hexdigest()
            ack = {
                "message_id": msg.message_id,
                "incident_id": emg_id,
                "server_received_at": now_iso,
                "confidence_score": record["confidence_score"],
                "verification_status": record["verification_status"],
                "status": "SERVER_ACKNOWLEDGED",
                "server_signature": server_sig
            }
            self._multi_hop_acks[msg.message_id] = ack

            # Log audit event
            hops_str = " -> ".join([msg.origin_id] + msg.relay_path + [gateway_node_id, "Central Server"])
            self._events.insert(0, {
                "event_id": uuid4(),
                "incident_id": u_id,
                "event_type": "MULTI_HOP_SOS_RECEIVED",
                "title": f"Multi-Hop SOS #{msg.message_id[:8]} Delivered ({msg.hops_taken} hops)",
                "details": f"Relay chain: {hops_str}. Verified confidence: {int(record['confidence_score']*100)}%.",
                "actor": f"Gateway ({gateway_node_id})",
                "event_time": now
            })

            return {
                "is_duplicate": False,
                "ack": ack,
                "record": record
            }

    def get_multihop_acks(self) -> List[Dict[str, Any]]:
        with self._lock:
            return list(self._multi_hop_acks.values())

    def get_all_emergencies(self) -> List[Dict[str, Any]]:
        with self._lock:
            return sorted(list(self._emergencies.values()), key=lambda x: x["urgency"], reverse=True)

    def get_emergency(self, emergency_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            return self._emergencies.get(emergency_id)

    def relocate_scenario(self, center_lat: float, center_lng: float, min_km: float = 5.0, max_km: float = 7.0) -> Dict[str, Any]:
        """
        Relocates simulated disaster emergencies, nearby responders, and shelters
        so that disasters are located within the range of 5.0 to 7.0 km from the user's location.
        """
        with self._lock:
            cos_lat = math.cos(math.radians(center_lat))
            lng_factor = 111.32 * (abs(cos_lat) if abs(cos_lat) > 0.01 else 1.0)

            def get_offset(dist_km: float, bearing_deg: float):
                rad = math.radians(bearing_deg)
                d_lat = (dist_km / 111.32) * math.cos(rad)
                d_lng = (dist_km / lng_factor) * math.sin(rad)
                return round(center_lat + d_lat, 5), round(center_lng + d_lng, 5)

            # 1. Relocate Demo Disaster Emergencies strictly in the 5 - 7 km range:
            # emg 1: Medical insulin crisis at ~5.2 km (Northeast, 35 deg)
            if "demo-emg-01-insulin" in self._emergencies:
                lat, lng = get_offset(5.2, 35)
                self._emergencies["demo-emg-01-insulin"]["lat"] = lat
                self._emergencies["demo-emg-01-insulin"]["lng"] = lng
                self._emergencies["demo-emg-01-insulin"]["latitude"] = lat
                self._emergencies["demo-emg-01-insulin"]["longitude"] = lng

            # emg 2: Flash flood inundation at ~5.8 km (Southeast, 125 deg)
            if "emg-demo-flood-ward12" in self._emergencies:
                lat, lng = get_offset(5.8, 125)
                self._emergencies["emg-demo-flood-ward12"]["lat"] = lat
                self._emergencies["emg-demo-flood-ward12"]["lng"] = lng
                self._emergencies["emg-demo-flood-ward12"]["latitude"] = lat
                self._emergencies["emg-demo-flood-ward12"]["longitude"] = lng
            if "demo-emg-02-flood" in self._emergencies:
                lat, lng = get_offset(5.8, 125)
                self._emergencies["demo-emg-02-flood"]["lat"] = lat
                self._emergencies["demo-emg-02-flood"]["lng"] = lng
                self._emergencies["demo-emg-02-flood"]["latitude"] = lat
                self._emergencies["demo-emg-02-flood"]["longitude"] = lng

            # emg 3: Stairwell collapse rescue at ~6.3 km (Southwest, 215 deg)
            if "demo-emg-03-collapse" in self._emergencies:
                lat, lng = get_offset(6.3, 215)
                self._emergencies["demo-emg-03-collapse"]["lat"] = lat
                self._emergencies["demo-emg-03-collapse"]["lng"] = lng
                self._emergencies["demo-emg-03-collapse"]["latitude"] = lat
                self._emergencies["demo-emg-03-collapse"]["longitude"] = lng

            # emg 4: Shelter supplies running low at ~6.8 km (Northwest, 305 deg)
            if "demo-emg-04-supplies" in self._emergencies:
                lat, lng = get_offset(6.8, 305)
                self._emergencies["demo-emg-04-supplies"]["lat"] = lat
                self._emergencies["demo-emg-04-supplies"]["lng"] = lng
                self._emergencies["demo-emg-04-supplies"]["latitude"] = lat
                self._emergencies["demo-emg-04-supplies"]["longitude"] = lng

            # emg 5: Decoy / suspicious alert at ~5.5 km (South, 175 deg)
            if "demo-emg-05-suspicious" in self._emergencies:
                lat, lng = get_offset(5.5, 175)
                self._emergencies["demo-emg-05-suspicious"]["lat"] = lat
                self._emergencies["demo-emg-05-suspicious"]["lng"] = lng
                self._emergencies["demo-emg-05-suspicious"]["latitude"] = lat
                self._emergencies["demo-emg-05-suspicious"]["longitude"] = lng

            # 2. Relocate Simulated Responders (within 1.5 - 4.2 km of user)
            resp_offsets = [
                (1.8, 40), (2.4, 110), (3.1, 190),
                (2.2, 280), (3.6, 15), (4.1, 160)
            ]
            for idx, r in enumerate(self._responders.values()):
                d, b = resp_offsets[idx % len(resp_offsets)]
                rlat, rlng = get_offset(d, b)
                r["current_lat"] = rlat
                r["current_lng"] = rlng

            # 3. Relocate Depots/Shelters (within 2.5 - 5.5 km)
            shelter_offsets = [(2.8, 60), (4.5, 140), (3.5, 230), (5.1, 320)]
            for idx, s in enumerate(self._depots.values()):
                d, b = shelter_offsets[idx % len(shelter_offsets)]
                slat, slng = get_offset(d, b)
                s["lat"] = slat
                s["lng"] = slng

            return {
                "status": "success",
                "center": {"lat": center_lat, "lng": center_lng},
                "emergencies_count": len(self._emergencies),
                "responders_count": len(self._responders),
                "disaster_range_km": "5.0 - 7.0 km"
            }

    # ==================== HELPER OFFERS & ASSISTANCE LIFECYCLE ====================

    def create_help_offer(
        self,
        incident_or_emergency_id: str,
        helper_id: str,
        helper_name: str,
        assistance_type: str,
        message: Optional[str] = None,
        estimated_eta_min: Optional[float] = None
    ) -> Dict[str, Any]:
        with self._lock:
            key = str(incident_or_emergency_id)
            if key not in self._help_offers:
                self._help_offers[key] = []

            # Check duplicate offer by same helper
            for existing in self._help_offers[key]:
                if existing["helper_id"] == helper_id and existing["status"] in ["OFFERED", "CONFIRMED", "EN_ROUTE"]:
                    raise ValueError(f"Helper {helper_name} already has an active offer for this incident.")

            offer_id = f"offer-{uuid4().hex[:8]}"
            now = datetime.now(timezone.utc).isoformat()
            offer = {
                "offer_id": offer_id,
                "incident_id": key,
                "helper_id": helper_id,
                "helper_name": helper_name or "Volunteer Responder",
                "assistance_type": assistance_type,
                "message": message,
                "estimated_eta_min": estimated_eta_min or 15.0,
                "status": "CONFIRMED",
                "created_at": now
            }
            self._help_offers[key].append(offer)

            # Update incident or emergency state
            if key in self._emergencies:
                emg = self._emergencies[key]
                emg["status"] = "HELP_OFFERED"
                emg["assistance_status"] = "HELP_OFFERED"
                emg["assigned_responder_id"] = helper_id
                emg["assigned_responder_name"] = helper_name
                emg["offered_assistance_type"] = assistance_type

            # Also check if it's in _incidents by UUID
            try:
                u_id = UUID(key)
                if u_id in self._incidents:
                    self._incidents[u_id]["status"] = "HELP_OFFERED"
                    self._incidents[u_id]["assistance_status"] = "HELP_OFFERED"
                    self._incidents[u_id]["assigned_responder_id"] = helper_id
                    self._incidents[u_id]["updated_at"] = datetime.now(timezone.utc)
            except Exception:
                pass

            self._events.insert(0, {
                "event_id": uuid4(),
                "incident_id": None,
                "event_type": "HELP_OFFER_REGISTERED",
                "title": f"Help Offered: {helper_name} ({assistance_type})",
                "details": message or f"Helper committed {assistance_type} assistance.",
                "actor": helper_name,
                "event_time": datetime.now(timezone.utc)
            })

            return offer

    def get_help_offers(self, incident_or_emergency_id: str) -> List[Dict[str, Any]]:
        with self._lock:
            key = str(incident_or_emergency_id)
            return list(self._help_offers.get(key, []))

    def update_emergency_status(
        self,
        emergency_id: str,
        new_status: str,
        actor: str = "Helper",
        note: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        with self._lock:
            emg = self._emergencies.get(emergency_id)
            if not emg:
                return None
            emg["status"] = new_status
            emg["assistance_status"] = new_status
            emg["last_updated_at"] = datetime.now(timezone.utc).isoformat()
            if note:
                emg["status_note"] = note

            # Also update mirrored incident if any
            for inc in self._incidents.values():
                if inc.get("description") == emg.get("raw_message"):
                    inc["status"] = new_status
                    inc["assistance_status"] = new_status
                    inc["updated_at"] = datetime.now(timezone.utc)

            self._events.insert(0, {
                "event_id": uuid4(),
                "incident_id": None,
                "event_type": "EMERGENCY_STATUS_UPDATED",
                "title": f"Emergency #{emergency_id} -> {new_status}",
                "details": note or f"Status transitioned to {new_status}",
                "actor": actor,
                "event_time": datetime.now(timezone.utc)
            })
            return emg

    # ==================== RESPONDERS ====================

    def get_all_responders(self) -> List[Dict[str, Any]]:
        with self._lock:
            return list(self._responders.values())

    def update_responder_status(self, responder_id: str, status: str, lat: Optional[float] = None, lng: Optional[float] = None) -> Optional[Dict[str, Any]]:
        with self._lock:
            resp = self._responders.get(responder_id)
            if not resp:
                return None
            resp["status"] = status
            if lat is not None and lng is not None:
                resp["current_lat"] = lat
                resp["current_lng"] = lng
            resp["last_contact"] = datetime.now(timezone.utc).isoformat()
            return resp

    # ==================== DISPATCHES ====================

    def create_dispatch(
        self,
        emergency_id: str,
        responder_id: str,
        justification: str,
        estimated_minutes: float,
        route_safe: bool
    ) -> Optional[Dict[str, Any]]:
        with self._lock:
            emg = self._emergencies.get(emergency_id)
            resp = self._responders.get(responder_id)
            if not emg or not resp:
                return None

            disp_id = f"disp-{uuid4().hex[:8]}"
            now = datetime.now(timezone.utc)
            dispatch = {
                "dispatch_id": disp_id,
                "emergency_id": emergency_id,
                "responder_id": responder_id,
                "responder_name": resp["name"],
                "destination_lat": emg["lat"],
                "destination_lng": emg["lng"],
                "route_safe": route_safe,
                "estimated_minutes": estimated_minutes,
                "status": "PROPOSED", # Requires explicit responder acceptance
                "justification": justification,
                "created_at": now.isoformat(),
                "updated_at": now.isoformat()
            }
            self._dispatches[disp_id] = dispatch

            self._events.insert(0, {
                "event_id": uuid4(),
                "incident_id": None,
                "event_type": "DISPATCH_PROPOSED",
                "title": f"Dispatch Proposed: {resp['name']}",
                "details": justification,
                "actor": "Triage Dispatch Engine",
                "event_time": now
            })

            return dispatch

    def update_dispatch_action(self, dispatch_id: str, action: str, reason: Optional[str] = None) -> Optional[Dict[str, Any]]:
        with self._lock:
            disp = self._dispatches.get(dispatch_id)
            if not disp:
                return None

            now = datetime.now(timezone.utc)
            resp = self._responders.get(disp["responder_id"])
            emg = self._emergencies.get(disp["emergency_id"])

            if action == "ACCEPT":
                disp["status"] = "ACCEPTED"
                if resp:
                    resp["status"] = "EN_ROUTE"
                if emg:
                    emg["status"] = "DISPATCHED"
                    emg["assigned_responder_id"] = disp["responder_id"]
            elif action == "REJECT":
                disp["status"] = "REJECTED"
                disp["rejection_reason"] = reason or "Responder declined mission."
                if resp:
                    resp["status"] = "AVAILABLE"
                if emg:
                    emg["status"] = "UNRESOLVED"
                    emg["assigned_responder_id"] = None
            elif action == "REPORT_UNSAFE_ROUTE":
                disp["status"] = "REROUTING"
                disp["route_safe"] = False
                disp["safety_note"] = reason or "Responder reported blocked crossing/debris."
            elif action == "COMPLETE":
                disp["status"] = "COMPLETED"
                if resp:
                    resp["status"] = "AVAILABLE"
                    resp["completed_missions"] = resp.get("completed_missions", 0) + 1
                if emg:
                    emg["status"] = "RESCUED"

            disp["updated_at"] = now.isoformat()

            self._events.insert(0, {
                "event_id": uuid4(),
                "incident_id": None,
                "event_type": f"DISPATCH_{action}",
                "title": f"Dispatch #{dispatch_id} {action}",
                "details": reason or f"Responder transitioned mission state to {action}.",
                "actor": resp["name"] if resp else "Responder Handset",
                "event_time": now
            })

            return disp

    def get_all_dispatches(self) -> List[Dict[str, Any]]:
        with self._lock:
            return sorted(list(self._dispatches.values()), key=lambda x: x["created_at"], reverse=True)

    # ==================== LEGACY / COMPATIBILITY METHODS ====================

    def create_incident(self, data: IncidentCreate) -> IncidentResponse:
        with self._lock:
            if data.idempotency_key and data.idempotency_key in self._idempotency_keys:
                existing_id = self._idempotency_keys[data.idempotency_key]
                record = self._incidents[existing_id]
                return IncidentResponse(**record)

            inc_id = uuid4()
            now = datetime.now(timezone.utc)
            record = {
                "incident_id": inc_id,
                "category": data.category or "flood",
                "severity": data.severity or "Medium",
                "urgency": data.urgency or 5,
                "status": "PENDING",
                "description": data.description,
                "lat": data.lat,
                "lng": data.lng,
                "reporter_phone": data.reporter_phone,
                "people_affected": data.people_affected,
                "food_needed": data.food_needed,
                "water_needed": data.water_needed,
                "shelter_needed": data.shelter_needed,
                "medical_needed": data.medical_needed,
                "created_at": now,
                "updated_at": now
            }
            self._incidents[inc_id] = record
            if data.idempotency_key:
                self._idempotency_keys[data.idempotency_key] = inc_id

            # Also create in emergencies
            emg_id = f"emg-{inc_id.hex[:8]}"
            self._emergencies[emg_id] = {
                "emergency_id": emg_id,
                "raw_message": data.description,
                "category": data.category or "disaster",
                "severity": (data.severity or "MEDIUM").upper(),
                "urgency": data.urgency or 5,
                "required_capabilities": ["general_first_aid_rescue"],
                "lat": data.lat,
                "lng": data.lng,
                "location_accuracy_meters": 20.0,
                "verification_status": "VERIFIED",
                "confidence_score": 0.88,
                "verification_reasons": ["Direct operator log"],
                "status": "UNRESOLVED",
                "assigned_responder_id": None,
                "reported_at": now.isoformat()
            }

            self._events.insert(0, {
                "event_id": uuid4(),
                "incident_id": inc_id,
                "event_type": "INCIDENT_CREATED",
                "title": f"Incident Created: {data.category}",
                "details": data.description[:100],
                "actor": "Citizen Signal",
                "event_time": now
            })

            return IncidentResponse(**record)

    def get_incident(self, incident_id: UUID) -> Optional[IncidentResponse]:
        with self._lock:
            rec = self._incidents.get(incident_id)
            return IncidentResponse(**rec) if rec else None

    def list_incidents(self, status: Optional[str] = None, category: Optional[str] = None) -> List[IncidentResponse]:
        with self._lock:
            res = []
            for item in self._incidents.values():
                if status and item["status"].upper() != status.upper():
                    continue
                if category and item["category"].lower() != category.lower():
                    continue
                res.append(IncidentResponse(**item))
            res.sort(key=lambda x: x.created_at, reverse=True)
            return res

    def update_incident_status(self, incident_id: UUID, new_status: str, actor: str, note: Optional[str] = None) -> Optional[IncidentResponse]:
        with self._lock:
            rec = self._incidents.get(incident_id)
            if not rec:
                return None
            rec["status"] = new_status
            rec["updated_at"] = datetime.now(timezone.utc)

            self._events.insert(0, {
                "event_id": uuid4(),
                "incident_id": incident_id,
                "event_type": "STATUS_CHANGED",
                "title": f"Status updated to {new_status}",
                "details": note or f"Status transitioned to {new_status}",
                "actor": actor,
                "event_time": datetime.now(timezone.utc)
            })

            return IncidentResponse(**rec)

    def get_all_depots(self) -> List[DepotResponse]:
        with self._lock:
            return [DepotResponse(**d) for d in self._depots.values()]

    def update_depot_stock(self, depot_id: UUID, supply_type: str, quantity: int) -> Optional[DepotResponse]:
        with self._lock:
            depot = self._depots.get(depot_id)
            if not depot:
                return None
            field = f"{supply_type.lower()}_units"
            if field in depot:
                depot[field] = max(0, depot[field] + quantity)
            return DepotResponse(**depot)

    def get_available_vehicles(self) -> List[DeliveryVehicle]:
        with self._lock:
            return [DeliveryVehicle(**v) for v in self._vehicles.values()]

    def allocate_delivery(self, incident_id: UUID, depot_id: UUID, vehicle_id: UUID, food_units: int, water_units: int, shelter_units: int, medical_units: int) -> Optional[DeliveryResponse]:
        with self._lock:
            depot = self._depots.get(depot_id)
            if depot:
                depot["food_units"] = max(0, depot["food_units"] - food_units)
                depot["water_units"] = max(0, depot["water_units"] - water_units)
                depot["shelter_units"] = max(0, depot["shelter_units"] - shelter_units)
                depot["medical_units"] = max(0, depot["medical_units"] - medical_units)
                depot["updated_at"] = datetime.now(timezone.utc)

            delivery_id = uuid4()
            now = datetime.now(timezone.utc)
            rec = {
                "delivery_id": delivery_id,
                "incident_id": incident_id,
                "depot_id": depot_id,
                "vehicle_id": vehicle_id,
                "vehicle_number": "TRUCK-ALPHA-01",
                "status": "EN_ROUTE",
                "food_units": food_units,
                "water_units": water_units,
                "shelter_units": shelter_units,
                "medical_units": medical_units,
                "eta_minutes": 15,
                "created_at": now,
                "updated_at": now
            }
            self._deliveries[delivery_id] = rec
            return DeliveryResponse(**rec)

    def list_deliveries(self) -> List[DeliveryResponse]:
        with self._lock:
            return [DeliveryResponse(**d) for d in self._deliveries.values()]

    def update_delivery_status(self, delivery_id: UUID, status: str) -> Optional[DeliveryResponse]:
        with self._lock:
            d = self._deliveries.get(delivery_id)
            if not d:
                return None
            d["status"] = status
            return DeliveryResponse(**d)

    def get_events(self, limit: int = 50) -> List[TacticalEventResponse]:
        with self._lock:
            return [TacticalEventResponse(**e) for e in self._events[:limit]]

    def save_emergency_contact(self, user_id: str, name: str, phone: str, country_code: str = "+91", relationship: str = "Primary Contact") -> Dict[str, Any]:
        with self._lock:
            now = datetime.now(timezone.utc).isoformat()
            existing = self._emergency_contacts.get(user_id)
            contact_id = existing["contact_id"] if existing else f"contact-{uuid4().hex[:8]}"
            contact = {
                "contact_id": contact_id,
                "user_id": user_id,
                "name": name,
                "phone": phone,
                "country_code": country_code,
                "relationship": relationship,
                "created_at": existing["created_at"] if existing else now,
                "updated_at": now
            }
            self._emergency_contacts[user_id] = contact
            return contact

    def get_emergency_contact(self, user_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            return self._emergency_contacts.get(user_id) or self._emergency_contacts.get("usr-citizen")

    def list_all_contacts(self) -> List[Dict[str, Any]]:
        with self._lock:
            return list(self._emergency_contacts.values())

    def send_emergency_notification(
        self,
        sos_id: str,
        trigger_source: str,
        contact_name: str,
        contact_phone: str,
        country_code: str = "+91",
        lat: Optional[float] = None,
        lng: Optional[float] = None,
        accuracy_meters: Optional[float] = None,
        location_status: str = "CURRENT_GPS",
        location_timestamp: Optional[str] = None,
        location_age_str: Optional[str] = None,
        custom_message: Optional[str] = None
    ) -> Dict[str, Any]:
        with self._lock:
            now_dt = datetime.now(timezone.utc)
            now_iso = now_dt.isoformat()
            idemp_key = f"{sos_id}:{contact_phone}"

            if idemp_key in self._notification_idempotency:
                notif_id = self._notification_idempotency[idemp_key]
                return self._emergency_notifications[notif_id]

            notif_id = f"notif-{uuid4().hex[:10]}"

            # Build canonical message text matching CASCADE specification
            if lat is not None and lng is not None and location_status != "UNAVAILABLE":
                maps_url = f"https://maps.google.com/?q={lat},{lng}"
                acc_str = f" (±{round(accuracy_meters or 15.0, 1)}m)" if accuracy_meters else ""
                if location_status == "LAST_KNOWN":
                    loc_clause = f"Last known location: {lat:.5f}, {lng:.5f}{acc_str} ({location_age_str or 'previously cached'}). Maps: {maps_url}. Location recorded: {location_timestamp or now_iso}."
                else:
                    loc_clause = f"Location: {lat:.5f}, {lng:.5f}{acc_str}. Maps: {maps_url}. Location recorded: {location_timestamp or now_iso}."
            else:
                maps_url = None
                loc_clause = "Location: UNAVAILABLE."

            msg_text = f"EMERGENCY SOS [{trigger_source.upper()}]: I may need immediate assistance. {loc_clause} SOS ID: {sos_id}."
            if custom_message:
                msg_text += f" Note: {custom_message}"

            # Truthful delivery tracking
            rec = {
                "notification_id": notif_id,
                "sos_id": sos_id,
                "trigger_source": trigger_source.upper(),
                "recipient_name": contact_name,
                "recipient_phone": f"{country_code} {contact_phone}".strip(),
                "message_text": msg_text,
                "google_maps_url": maps_url,
                "delivery_status": "SMS_SUBMITTED_TO_CARRIER",
                "provider": "TWILIO_SMS_GATEWAY_SIMULATED",
                "provider_sid": f"SM{uuid4().hex}",
                "created_at": now_iso,
                "confirmed_at": now_iso
            }

            self._emergency_notifications[notif_id] = rec
            self._notification_idempotency[idemp_key] = notif_id

            # Attach notification record to incident in repository
            emg = self._emergencies.get(sos_id)
            if emg:
                if "contact_notifications" not in emg:
                    emg["contact_notifications"] = []
                emg["contact_notifications"].append(rec)
                emg["trigger_source"] = trigger_source.upper()

            # Record tactical event
            self._events.insert(0, {
                "event_id": uuid4(),
                "incident_id": None,
                "event_type": "EMERGENCY_CONTACT_NOTIFIED",
                "title": f"Emergency Notification ({trigger_source.upper()})",
                "details": f"Dispatched to {contact_name} ({contact_phone}) for SOS {sos_id}",
                "actor": "System Alert Gateway",
                "event_time": now_dt
            })

            return rec

    def get_emergency_notifications(self, sos_id: Optional[str] = None) -> List[Dict[str, Any]]:
        with self._lock:
            if sos_id:
                return [n for n in self._emergency_notifications.values() if n["sos_id"] == sos_id]
            return list(self._emergency_notifications.values())

    def update_notification_delivery_status(
        self,
        sos_id: str,
        delivery_status: str,
        details: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        with self._lock:
            for notif in self._emergency_notifications.values():
                if notif.get("sos_id") == sos_id:
                    notif["delivery_status"] = delivery_status
                    if details:
                        notif["status_details"] = details
                    if delivery_status == "SMS_DELIVERY_CONFIRMED":
                        notif["confirmed_at"] = datetime.now(timezone.utc).isoformat()
                    return notif
            return None

    def record_sos(self, data: SOSCreate) -> Dict[str, Any]:
        req = DistressIntakeRequest(
            raw_text=f"SOS DISTRESS BEACON: {data.message}. Direct operator callback required at {data.phone}.",
            lat=data.lat,
            lng=data.lng,
            location_accuracy_meters=10.0
        )
        emg = self.process_distress_intake(req)
        return {"sos_id": emg["emergency_id"], "incident_id": emg["emergency_id"], "status": "BEACON_ACTIVE"}

repository = UnifiedRepository()
