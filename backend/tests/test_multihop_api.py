import pytest
from datetime import datetime, timezone, timedelta
from backend.app.schemas.mesh import MultiHopSOSMessage, MultiHopSyncRequest
from backend.app.api.resqmesh import sync_multihop_messages, get_multihop_acks, submit_single_multihop_message
from backend.app.db.repository import repository

def test_multihop_sync_and_ack():
    now = datetime.now(timezone.utc)
    expires = now + timedelta(hours=4)
    msg_id = f"test-multihop-{now.timestamp()}"

    msg = MultiHopSOSMessage(
        protocol_version=1,
        message_id=msg_id,
        type="SOS",
        origin_id="origin-node-phoneA",
        created_at=now.isoformat(),
        expires_at=expires.isoformat(),
        latitude=21.1458,
        longitude=79.0882,
        location_accuracy_m=12.5,
        urgency="CRITICAL",
        category="medical",
        description="Patient collapsed with breathing difficulty and chest pain. Needs oxygen cylinder immediately.",
        hop_limit=7,
        hops_taken=2,
        relay_path=["relay-peer-B", "relay-peer-C"],
        payload_hash="a1b2c3d4e5f67890",
        signature="test_ed25519_sig_xyz",
        delivery_status="RELAYED_TO_PEER"
    )

    req = MultiHopSyncRequest(
        gateway_node_id="field-gateway-01",
        messages=[msg]
    )

    data = sync_multihop_messages(req)

    assert data.processed == 1
    assert len(data.acknowledged) == 1
    ack = data.acknowledged[0]
    assert ack.message_id == msg_id
    assert ack.status == "SERVER_ACKNOWLEDGED"
    assert ack.confidence_score >= 0.5
    assert len(ack.server_signature) == 64

    # Verify ACK is retrievable from get_multihop_acks()
    acks = get_multihop_acks()
    assert any(a.message_id == msg_id for a in acks)

def test_multihop_deduplication_and_no_witness_inflation():
    now = datetime.now(timezone.utc)
    expires = now + timedelta(hours=3)
    msg_id = f"test-dedup-{now.timestamp()}"

    msg1 = MultiHopSOSMessage(
        protocol_version=1,
        message_id=msg_id,
        type="SOS",
        origin_id="origin-citizen-42",
        created_at=now.isoformat(),
        expires_at=expires.isoformat(),
        latitude=21.1410,
        longitude=79.0820,
        location_accuracy_m=10.0,
        urgency="HIGH",
        category="flood",
        description="Water rising rapidly on ground floor, 3 people trapped including elderly person.",
        hop_limit=5,
        hops_taken=1,
        relay_path=["node-volunteer-1"],
        payload_hash="hash_sample_123",
        signature="sig_sample_123",
        delivery_status="RELAYED_TO_PEER"
    )

    # First upload from Gateway A
    res1 = sync_multihop_messages(MultiHopSyncRequest(
        gateway_node_id="gateway-A",
        messages=[msg1]
    ))
    assert res1.processed == 1
    assert len(res1.acknowledged) == 1
    assert len(res1.deduplicated) == 0

    # Second upload from Gateway B (packet took another route with novel relay nodes)
    msg2 = MultiHopSOSMessage(
        protocol_version=1,
        message_id=msg_id,
        type="SOS",
        origin_id="origin-citizen-42",
        created_at=now.isoformat(),
        expires_at=expires.isoformat(),
        latitude=21.1410,
        longitude=79.0820,
        location_accuracy_m=10.0,
        urgency="HIGH",
        category="flood",
        description="Water rising rapidly on ground floor, 3 people trapped including elderly person.",
        hop_limit=5,
        hops_taken=2,
        relay_path=["node-volunteer-2", "node-volunteer-3"],
        payload_hash="hash_sample_123",
        signature="sig_sample_123",
        delivery_status="RELAYED_TO_PEER"
    )

    res2 = sync_multihop_messages(MultiHopSyncRequest(
        gateway_node_id="gateway-B",
        messages=[msg2]
    ))
    assert res2.processed == 1
    assert msg_id in res2.deduplicated
    assert len(res2.acknowledged) == 1

    # Verify that the emergency record exists once in repository
    all_emergencies = repository.get_all_emergencies()
    matching = [e for e in all_emergencies if e.get("message_id") == msg_id]
    assert len(matching) == 1
    # Check that relay path merged novel nodes
    merged_path = matching[0].get("relay_path", [])
    assert "node-volunteer-1" in merged_path
    assert "node-volunteer-2" in merged_path
