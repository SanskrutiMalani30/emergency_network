import pytest
from backend.app.services.verification import intake_engine
from backend.app.services.matching import matcher, normalize_capability
from backend.app.services.hazards import hazard_engine
from backend.app.services.trust import trust_engine
from backend.app.services.mesh_sync import mesh_simulator
from backend.app.services.privacy import privacy_engine
from backend.app.services.attack_lab import attack_lab
from backend.app.db.repository import repository
from backend.app.schemas.mesh import DistressIntakeRequest, DispatchActionRequest
from backend.app.api.resqmesh import intake_distress_message, sync_outbox, get_current_location_telemetry

def test_scenario_1_emergency_to_rescue():
    # 1. Parse unstructured distress message
    req = DistressIntakeRequest(
        raw_text="Need insulin for dad, ground floor flooded, water rising quickly.",
        lat=21.1450,
        lng=79.0820
    )
    emg = repository.process_distress_intake(req)
    assert emg["emergency_id"] is not None
    assert "refrigerated_insulin_supply" in emg["required_capabilities"]
    assert "watercraft_rescue" in emg["required_capabilities"]
    assert emg["urgency"] >= 8
    assert emg["verification_status"] in ["UNVERIFIED", "PARTIALLY_VERIFIED", "VERIFIED"]

    # 2. Opportunity-cost matching
    responders = repository.get_all_responders()
    ranked = matcher.rank_responders(emg, responders)
    assert len(ranked) > 0
    best = ranked[0]
    assert best["is_suitable"] is True
    assert len(best["justification"]) > 10

    # 3. Create dispatch
    disp = repository.create_dispatch(
        emergency_id=emg["emergency_id"],
        responder_id=best["responder_id"],
        justification=best["justification"],
        estimated_minutes=best["estimated_minutes"],
        route_safe=best["is_safe_route"]
    )
    assert disp["status"] == "PROPOSED"

    # 4. Human-in-the-loop explicit acceptance
    accepted = repository.update_dispatch_action(disp["dispatch_id"], "ACCEPT")
    assert accepted["status"] == "ACCEPTED"

    # 5. Complete rescue
    completed = repository.update_dispatch_action(disp["dispatch_id"], "COMPLETE")
    assert completed["status"] == "COMPLETED"

def test_scenario_2_adversarial_attack_defenses():
    # Sybil detection: 40 fake nurse personas from single gateway
    fake_identities = [
        {"responder_id": f"sybil-{i}", "name": f"Fake Nurse {i}", "gateway_id": "malicious-gateway-x9", "capabilities": ["nurse"]}
        for i in range(40)
    ]
    sybil_result = trust_engine.detect_sybil_cluster(fake_identities)
    assert sybil_result["has_sybils"] is True
    assert sybil_result["quarantined_count"] == 40

    # GPS Spoofing detection
    from datetime import datetime, timezone
    t0 = datetime(2026, 10, 25, 12, 0, 0, tzinfo=timezone.utc)
    t1 = datetime(2026, 10, 25, 12, 0, 10, tzinfo=timezone.utc)
    gps_result = trust_engine.verify_gps_plausibility(21.1458, 79.0882, t0, 21.6500, 79.7500, t1)
    assert gps_result["plausible"] is False
    assert gps_result["speed_kmh"] > 160.0

def test_scenario_3_network_partition_and_reconciliation():
    # 1. Partition mesh into Island A and Island B
    part_event = mesh_simulator.partition_network()
    assert mesh_simulator.is_partitioned is True

    # 2. Queue offline dispatches in both islands
    mesh_simulator.queue_offline_event("island_A", "DISPATCH_ACCEPTED", {
        "emergency_id": "emg-partition-test",
        "responder_id": "resp-dr-sarah",
        "responder_name": "Dr. Sarah Rao",
        "status": "ACCEPTED"
    })
    mesh_simulator.queue_offline_event("island_B", "DISPATCH_PROPOSED", {
        "emergency_id": "emg-partition-test",
        "responder_id": "resp-boat-amit",
        "responder_name": "Amit Verma",
        "status": "PROPOSED"
    })

    # 3. Reconnect & reconcile
    reconciled = mesh_simulator.reconnect_and_reconcile()
    assert mesh_simulator.is_partitioned is False
    assert reconciled["conflicts_detected"] >= 1
    # Check that in-progress accepted rescue was preserved
    collision = reconciled["reconciled_conflicts"][0]
    assert "in-progress/accepted" in collision["resolution"].lower()

def test_scenario_4_safe_routing_and_hazard_avoidance():
    # Route through Ward 12 flood zone
    hazard_engine.toggle_hazard("hz-flood-ward12", True)
    route = hazard_engine.evaluate_route_hazards(21.1450, 79.0800, 21.1524, 79.0910)
    assert len(route["intersecting_hazards"]) > 0
    assert route["detour_recommended"] is True
    assert "Safe detour" in route["explanation"]

def test_scenario_5_specialist_scarcity_and_opportunity_cost():
    critical_case = {
        "emergency_id": "emg-crit-dialysis",
        "required_capabilities": ["dialysis_specialist"],
        "urgency": 9,
        "lat": 21.1450,
        "lng": 79.0850
    }
    minor_case = {
        "emergency_id": "emg-minor-cut",
        "required_capabilities": ["general_first_aid_rescue"],
        "urgency": 2,
        "lat": 21.1440,
        "lng": 79.0840
    }
    dialysis_medic = {
        "responder_id": "resp-dialysis-only",
        "name": "Karan Patel, RN",
        "capabilities": ["dialysis_specialist", "general_first_aid_rescue"],
        "current_lat": 21.1442,
        "current_lng": 79.0842,
        "battery_pct": 90,
        "status": "AVAILABLE",
        "trust_score": 0.95
    }
    standard_volunteer = {
        "responder_id": "resp-volunteer-basic",
        "name": "Local Volunteer",
        "capabilities": ["general_first_aid_rescue"],
        "current_lat": 21.1443,
        "current_lng": 79.0843,
        "battery_pct": 90,
        "status": "AVAILABLE",
        "trust_score": 0.80
    }

    # Match for minor case while critical case is pending
    ranked = matcher.rank_responders(minor_case, [dialysis_medic, standard_volunteer], [critical_case])
    # The standard volunteer should be preferred over squandering the dialysis specialist!
    assert ranked[0]["responder_id"] == "resp-volunteer-basic"
    # Dialysis specialist should have opportunity cost warning in justification
    dialysis_entry = next(r for r in ranked if r["responder_id"] == "resp-dialysis-only")
    assert "opportunity cost" in dialysis_entry["justification"].lower()

def test_scenario_6_battery_aware_routing():
    res = trust_engine.check_rate_limits("node-flood-spammer", limit_per_minute=5)
    for _ in range(6):
        res = trust_engine.check_rate_limits("node-flood-spammer", limit_per_minute=5)
    assert res["rate_limited"] is True
    assert "battery protection" in res["reason"].lower()

def test_scenario_7_privacy_and_secure_relay():
    envelope = privacy_engine.create_secure_envelope(
        emergency_id="emg-priv-01",
        category="medical",
        urgency=9,
        lat=21.1430,
        lng=79.0810,
        sensitive_medical_payload={
            "patient_name": "Deepak Verma",
            "condition": "Severe internal hemorrhage and cardiac stent",
            "phone": "+91 99887 76655"
        }
    )
    assert "encrypted_victim_payload" in envelope
    # Untrusted relay check
    relay_view = privacy_engine.simulate_relay_forwarding(envelope, "node-untrusted-relay")
    assert relay_view["can_read_medical_records"] is False
    assert "[ENCRYPTED]" in relay_view["hidden_protected_payload"]

    # Unauthorized viewer check
    unauth = privacy_engine.decrypt_for_authorized_medic(envelope, responder_role="General Volunteer")
    assert unauth["authorized"] is False

    # Authorized medic decryption check
    auth = privacy_engine.decrypt_for_authorized_medic(envelope, responder_role="Certified Paramedic / Doctor")
    assert auth["authorized"] is True
    assert auth["medical_payload"]["patient_name"] == "Deepak Verma"

def test_all_10_attack_lab_scenarios():
    for sid in range(1, 11):
        res = attack_lab.run_scenario(sid)
        assert res["scenario_id"] == sid
        assert "title" in res
        assert "detection_and_mitigation" in res


def test_multilingual_distress_intake():
    """Requirement C: Multilingual NLP capability extraction (Hindi and Marathi)."""
    # 1. Hindi distress report
    req_hi = DistressIntakeRequest(
        raw_text="बाढ़ का पानी घर में घुस गया है, तुरंत नाव और चिकित्सा सहायता भेजो",
        lat=21.1450,
        lng=79.0880,
        location_accuracy_meters=15.0,
        reporter_node_id="citizen-hi-01",
        detected_language="hi"
    )
    data_hi = intake_distress_message(req_hi)
    assert "watercraft_rescue" in data_hi["required_capabilities"]
    assert data_hi["detected_language"] == "hi"

    # 2. Marathi distress report
    req_mr = DistressIntakeRequest(
        raw_text="घरात पुराचे पाणी शिरले आहे, वृद्ध व्यक्तीला इन्सुलिन हवे तातडीने",
        lat=21.1470,
        lng=79.0850,
        location_accuracy_meters=10.0,
        reporter_node_id="citizen-mr-02",
        detected_language="mr"
    )
    data_mr = intake_distress_message(req_mr)
    assert "refrigerated_insulin_supply" in data_mr["required_capabilities"]
    assert "special_mobility_assistance" in data_mr["required_capabilities"]


def test_offline_outbox_batch_sync_and_idempotency():
    """Requirement B: Offline outbox sync and client_message_id idempotency."""
    client_id_1 = "offline-msg-uuid-999-alpha"
    client_id_2 = "offline-msg-uuid-999-beta"

    batch = [
        DistressIntakeRequest(
            raw_text="Ground floor submerged, elderly neighbor trapped",
            lat=21.1410,
            lng=79.0820,
            location_accuracy_meters=12.0,
            client_message_id=client_id_1,
            detected_language="en"
        ),
        DistressIntakeRequest(
            raw_text="Wall collapse with broken limb injuries",
            lat=21.1430,
            lng=79.0840,
            location_accuracy_meters=8.0,
            client_message_id=client_id_2,
            detected_language="en"
        )
    ]

    # Initial sync
    sync_data = sync_outbox(batch)
    assert sync_data["total_processed"] == 2
    assert sync_data["synced_count"] == 2
    assert sync_data["deduplicated_count"] == 0

    # Repeat sync (simulating network retry from mobile peer)
    retry_data = sync_outbox(batch)
    assert retry_data["total_processed"] == 2
    assert retry_data["synced_count"] == 0
    assert retry_data["deduplicated_count"] == 2


def test_current_location_telemetry_api():
    """Requirement A: Verification of the current user location API and situational context."""
    # 1. Test with user's live GPS fix
    res = get_current_location_telemetry(lat=21.1440, lng=79.0860, accuracy=10.0)
    assert res["status"] == "success"
    assert res["is_live_fix"] is True
    assert res["coords"]["lat"] == 21.1440
    assert res["coords"]["lng"] == 79.0860
    assert res["coords"]["accuracy_meters"] == 10.0
    assert "Ward 12" in res["locality"]
    assert res["nearest_responder"] is not None
    assert res["nearest_responder"]["distance_km"] <= 1.0

    # 2. Test fallback baseline when GPS permission is pending or denied
    fallback = get_current_location_telemetry(lat=None, lng=None, accuracy=15.0)
    assert fallback["status"] == "success"
    assert fallback["is_live_fix"] is False
    assert fallback["coords"]["lat"] == 21.1420
    assert fallback["coords"]["lng"] == 79.0800


def test_disaster_scenario_relocation_in_5_to_7_km_range():
    """Verify that simulated disaster emergencies relocate strictly within 5.0 to 7.0 km of the user location."""
    from backend.app.services.hazards import haversine_km
    user_lat, user_lng = 18.5204, 73.8567

    res = repository.relocate_scenario(user_lat, user_lng, min_km=5.0, max_km=7.0)
    assert res["status"] == "success"

    emgs = repository.get_all_emergencies()
    demo_emgs = [e for e in emgs if e.get("is_demo")]
    assert len(demo_emgs) >= 4

    for emg in demo_emgs:
        dist_km = haversine_km(user_lat, user_lng, emg["lat"], emg["lng"])
        assert 4.9 <= dist_km <= 7.1, f"Emergency {emg['emergency_id']} at {dist_km} km is outside 5-7 km range!"


