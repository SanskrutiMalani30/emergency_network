import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  multiHopRouter,
  computePayloadHash,
  PROTOCOL_VERSION,
  DELIVERY_STATUS
} from '../ble/multiHopRouter';

describe('RESQMesh Multi-Hop BLE Routing Protocol & Lifecycle', () => {
  beforeEach(() => {
    multiHopRouter.seenMessageIds.clear();
    multiHopRouter.localPackets.clear();
    multiHopRouter.relayedPackets.clear();
    multiHopRouter.serverAcks.clear();
    multiHopRouter.currentNodeId = 'node-test-alpha';
  });

  it('generates a protocol v1 compliant SOS packet with SHA-256 payload hash', async () => {
    const packet = await multiHopRouter.createSosMessage({
      description: 'Severe structural collapse, 2 people trapped under debris.',
      latitude: 21.1458,
      longitude: 79.0882,
      location_accuracy_m: 8.0,
      urgency: 'CRITICAL',
      category: 'collapse',
      hop_limit: 7
    });

    expect(packet.protocol_version).toBe(1);
    expect(packet.message_id).toBeDefined();
    expect(packet.origin_id).toBe('node-test-alpha');
    expect(packet.urgency).toBe('CRITICAL');
    expect(packet.category).toBe('collapse');
    expect(packet.hop_limit).toBe(7);
    expect(packet.hops_taken).toBe(0);
    expect(packet.relay_path).toEqual([]);
    expect(packet.payload_hash).toBeDefined();
    expect(packet.payload_hash.length).toBe(64);
    expect(packet.signature).toContain('node-test-alpha');
  });

  it('computes deterministic canonical hash across identical inputs', async () => {
    const dataA = {
      message_id: 'msg-fixed-1234',
      origin_id: 'node-origin-1',
      created_at: '2026-03-01T12:00:00.000Z',
      description: 'Flash flood alert',
      latitude: 21.1400,
      longitude: 79.0800,
      urgency: 'HIGH',
      category: 'flood'
    };
    const hashA = await computePayloadHash(dataA);
    const hashB = await computePayloadHash({ ...dataA });
    expect(hashA).toBe(hashB);
  });

  it('relays packets across multiple hops with hop count incrementation', async () => {
    multiHopRouter.currentNodeId = 'node-hop-beta';

    const incomingFromAlpha = {
      protocol_version: 1,
      message_id: 'sos-chain-99',
      type: 'SOS',
      origin_id: 'node-origin-alpha',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      latitude: 21.1420,
      longitude: 79.0810,
      location_accuracy_m: 10.0,
      urgency: 'CRITICAL',
      category: 'medical',
      description: 'Patient in shock, needs immediate transfusion',
      hop_limit: 5,
      hops_taken: 0,
      relay_path: []
    };

    const res = await multiHopRouter.handleIncomingPacket(incomingFromAlpha, { senderId: 'node-origin-alpha' });
    expect(res.accepted).toBe(true);
    expect(multiHopRouter.relayedPackets.has('sos-chain-99')).toBe(true);

    const stored = multiHopRouter.relayedPackets.get('sos-chain-99');
    expect(stored.delivery_status).toBe(DELIVERY_STATUS.RELAYED_TO_PEER);
  });

  it('prevents network loops if current node is already in relay_path', async () => {
    multiHopRouter.currentNodeId = 'node-hop-beta';

    const loopedPacket = {
      protocol_version: 1,
      message_id: 'sos-loop-01',
      type: 'SOS',
      origin_id: 'node-origin-gamma',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      latitude: 21.1420,
      longitude: 79.0810,
      location_accuracy_m: 10.0,
      urgency: 'HIGH',
      category: 'fire',
      description: 'Fire spreading near Sector 4 depot',
      hop_limit: 5,
      hops_taken: 2,
      relay_path: ['node-origin-gamma', 'node-hop-beta'] // Contains self!
    };

    const res = await multiHopRouter.handleIncomingPacket(loopedPacket);
    expect(res.accepted).toBe(false);
    expect(res.reason).toBe('LOOP_PREVENTED');
  });

  it('suppresses duplicate message broadcasts using bounded LRU cache', async () => {
    multiHopRouter.currentNodeId = 'node-relay-delta';

    const packet = {
      protocol_version: 1,
      message_id: 'sos-dup-01',
      type: 'SOS',
      origin_id: 'node-citizen-1',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      latitude: 21.1420,
      longitude: 79.0810,
      location_accuracy_m: 15.0,
      urgency: 'MODERATE',
      category: 'supplies',
      description: 'Elderly shelter ran out of clean water bottles',
      hop_limit: 4,
      hops_taken: 1,
      relay_path: ['node-citizen-1']
    };

    // First arrival
    const res1 = await multiHopRouter.handleIncomingPacket(packet);
    expect(res1.accepted).toBe(true);

    // Duplicate arrival
    const res2 = await multiHopRouter.handleIncomingPacket(packet);
    expect(res2.accepted).toBe(false);
    expect(res2.reason).toBe('DUPLICATE_SUPPRESSED');
  });

  it('rejects stale expired packets exceeding TTL window', async () => {
    const expiredPacket = {
      protocol_version: 1,
      message_id: 'sos-stale-01',
      type: 'SOS',
      origin_id: 'node-citizen-2',
      created_at: new Date(Date.now() - 36000000).toISOString(), // 10 hrs ago
      expires_at: new Date(Date.now() - 10000).toISOString(), // expired 10s ago
      latitude: 21.1420,
      longitude: 79.0810,
      location_accuracy_m: 20.0,
      urgency: 'LOW',
      category: 'general',
      description: 'Minor road blockage cleared',
      hop_limit: 5,
      hops_taken: 1,
      relay_path: ['node-citizen-2']
    };

    const res = await multiHopRouter.handleIncomingPacket(expiredPacket);
    expect(res.accepted).toBe(false);
    expect(res.reason).toBe('EXPIRED');
  });

  it('drops packets that exhaust hop budget (hops_taken >= hop_limit)', async () => {
    const exhaustedPacket = {
      protocol_version: 1,
      message_id: 'sos-exhausted-01',
      type: 'SOS',
      origin_id: 'node-citizen-3',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      latitude: 21.1420,
      longitude: 79.0810,
      location_accuracy_m: 10.0,
      urgency: 'HIGH',
      category: 'flood',
      description: 'High water at rail underpass',
      hop_limit: 3,
      hops_taken: 3, // Already took 3 hops, equal to limit
      relay_path: ['node-citizen-3', 'node-hop-1', 'node-hop-2']
    };

    const res = await multiHopRouter.handleIncomingPacket(exhaustedPacket);
    expect(res.accepted).toBe(false);
    expect(res.reason).toBe('HOP_LIMIT_EXHAUSTED');
  });

  it('processes server ACK and updates local SOS delivery status', async () => {
    multiHopRouter.currentNodeId = 'node-originator';

    // Create local packet
    const localPacket = await multiHopRouter.createSosMessage({
      description: 'Critical medical request from isolated quadrant',
      latitude: 21.1450,
      longitude: 79.0850,
      urgency: 'CRITICAL',
      category: 'medical'
    });

    expect(localPacket.delivery_status).toBe(DELIVERY_STATUS.QUEUED_FOR_RELAY);

    // Simulate Server ACK propagating back to originator
    const ackPacket = {
      protocol_version: 1,
      message_id: localPacket.message_id,
      type: 'ACK',
      status: 'SERVER_ACKNOWLEDGED',
      server_received_at: new Date().toISOString(),
      confidence_score: 0.94,
      verification_status: 'VERIFIED',
      server_signature: 'server_sha256_sig_valid_1234567890abcdef'
    };

    const ackRes = await multiHopRouter.handleAckPacket(ackPacket);
    expect(ackRes.accepted).toBe(true);
    expect(localPacket.delivery_status).toBe(DELIVERY_STATUS.SERVER_ACKNOWLEDGED);
    expect(localPacket.server_ack).toBeDefined();
    expect(localPacket.server_ack.server_signature).toBe('server_sha256_sig_valid_1234567890abcdef');
  });
});
