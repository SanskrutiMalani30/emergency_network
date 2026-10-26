import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  triageEmergencyLocally,
  EMERGENCY_CATEGORIES,
  URGENCY_LEVELS,
  RESOURCE_TYPES
} from '../localAiTriage';
import {
  generateLocationLink,
  buildLocationObject,
  formatLocationAge
} from '../locationService';
import {
  bluetoothTransport,
  BLE_PACKET_STATUS
} from '../bluetoothTransport';

describe('RESQMesh — Offline Emergency Alert, Location & Bluetooth Tests', () => {

  // =========================================================================
  // 1. On-Device AI Triage Tests
  // =========================================================================
  describe('On-Device AI Triage', () => {
    it('classifies critical life-threatening conditions with highest priority', () => {
      const report = "Elderly patient unconscious with chest pain and severe arterial bleeding, need ambulance immediately!";
      const result = triageEmergencyLocally(report);

      expect(result.urgency).toBe(URGENCY_LEVELS.CRITICAL);
      expect(result.category).toBe(EMERGENCY_CATEGORIES.MEDICAL);
      expect(result.help_needed).toContain(RESOURCE_TYPES.FIRST_AID);
      expect(result.help_needed).toContain(RESOURCE_TYPES.TRANSPORT);
      expect(result.reason.toLowerCase()).toContain('immediate threat to life');
      expect(result.verification_status).toBe('UNVERIFIED');
    });

    it('classifies flood rescue with boat and transport requirements', () => {
      const report = "Water rising fast, ground floor flooded, 4 family members trapped on terrace, water level 1.5m.";
      const result = triageEmergencyLocally(report);

      expect(result.urgency).toBe(URGENCY_LEVELS.CRITICAL);
      expect(result.category).toBe(EMERGENCY_CATEGORIES.FLOOD_RESCUE);
      expect(result.help_needed).toContain(RESOURCE_TYPES.BOAT);
      expect(result.reason.toLowerCase()).toContain('threat to life');
    });

    it('classifies structural collapse with search and rescue extraction', () => {
      const report = "Brick wall and ceiling slab collapsed after heavy rain, 2 workers trapped under rubble with broken limbs.";
      const result = triageEmergencyLocally(report);

      expect(result.urgency).toBe(URGENCY_LEVELS.CRITICAL);
      expect(result.category).toBe(EMERGENCY_CATEGORIES.STRUCTURAL_COLLAPSE);
      expect(result.help_needed).toContain(RESOURCE_TYPES.SEARCH_RESCUE);
      expect(result.help_needed).toContain(RESOURCE_TYPES.FIRST_AID);
    });

    it('extracts prescription medicine needs like insulin or oxygen', () => {
      const report = "Father is diabetic and urgently needs insulin, inhaler ran out for asthma child.";
      const result = triageEmergencyLocally(report);

      expect(result.category).toBe(EMERGENCY_CATEGORIES.MEDICAL);
      expect(result.help_needed).toContain(RESOURCE_TYPES.FIRST_AID);
      expect(result.help_needed).toContain(RESOURCE_TYPES.OXYGEN);
    });

    it('marks brief vague panic alerts as NEEDS_REVIEW without suppressing', () => {
      const report = "HELP NOW!!!";
      const result = triageEmergencyLocally(report);

      expect(result.verification_status).toBe('NEEDS_REVIEW');
      // Must NOT be rejected
      expect(result.urgency).toBeDefined();
      expect(result.help_needed.length).toBeGreaterThan(0);
    });

    it('safely handles empty input with moderate priority and review status', () => {
      const result = triageEmergencyLocally('');
      expect(result.urgency).toBe(URGENCY_LEVELS.MODERATE);
      expect(result.verification_status).toBe('NEEDS_REVIEW');
      expect(result.help_needed).toContain(RESOURCE_TYPES.FIRST_AID);
    });
  });

  // =========================================================================
  // 2. Location & Shareable Map Link Tests
  // =========================================================================
  describe('Location & Shareable Map Links', () => {
    it('generates exact standard map link format programmatically', () => {
      const lat = 21.1458;
      const lng = 79.0882;
      const link = generateLocationLink(lat, lng);

      expect(link).toBe('https://www.google.com/maps?q=21.145800,79.088200');
    });

    it('returns null link when coordinates are null or invalid', () => {
      expect(generateLocationLink(null, 79.0882)).toBeNull();
      expect(generateLocationLink(21.1458, null)).toBeNull();
      expect(generateLocationLink('invalid', 'coords')).toBeNull();
    });

    it('constructs CURRENT location object with 0 location_age_seconds', () => {
      const now = Date.now();
      const loc = buildLocationObject({
        latitude: 21.1458,
        longitude: 79.0882,
        accuracy_meters: 12,
        source: 'CURRENT',
        referenceTime: now
      });

      expect(loc.location_link).toBe('https://www.google.com/maps?q=21.145800,79.088200');
      expect(loc.latitude).toBe(21.1458);
      expect(loc.longitude).toBe(79.0882);
      expect(loc.location_source).toBe('CURRENT');
      expect(loc.location_age_seconds).toBe(0);
      expect(loc.accuracy_meters).toBe(12);
    });

    it('constructs LAST_KNOWN location object with accurate location_age_seconds', () => {
      const now = Date.now();
      const threeMinutesAgo = new Date(now - 180 * 1000).toISOString();

      const loc = buildLocationObject({
        latitude: 21.1458,
        longitude: 79.0882,
        accuracy_meters: 25,
        timestamp: threeMinutesAgo,
        source: 'LAST_KNOWN',
        referenceTime: now
      });

      expect(loc.location_source).toBe('LAST_KNOWN');
      expect(loc.location_age_seconds).toBe(180);
      expect(loc.location_timestamp).toBe(threeMinutesAgo);
    });

    it('formats location age cleanly for responders', () => {
      expect(formatLocationAge(20)).toBe('Location updated 20 seconds ago');
      expect(formatLocationAge(180)).toBe('Last location traced 3 minutes ago');
      expect(formatLocationAge(3600)).toBe('Last location traced 1 hour ago');
      expect(formatLocationAge(7200)).toBe('Last location traced 2 hours ago');
    });
  });

  // =========================================================================
  // 3. Compact Bluetooth Emergency Message Packet Tests
  // =========================================================================
  describe('Emergency Message Packet & Bluetooth Protocol', () => {
    it('creates canonical message packet complying with Section 5 specification', () => {
      const loc = buildLocationObject({
        latitude: 21.1458,
        longitude: 79.0882,
        accuracy_meters: 15,
        source: 'CURRENT'
      });

      const packet = bluetoothTransport.createEmergencyPacket({
        type: 'HELP',
        category: 'MEDICAL',
        urgency: 'CRITICAL',
        reason: 'Severe diabetic emergency requiring insulin',
        help_needed: ['FIRST_AID', 'TRANSPORT'],
        location: loc,
        landmark: 'Behind City Hospital Gate 3',
        deviceId: 'node-test-01'
      });

      expect(packet.protocol_version).toBe(1);
      expect(packet.alert_id).toBeDefined();
      expect(packet.type).toBe('HELP');
      expect(packet.category).toBe('MEDICAL');
      expect(packet.urgency).toBe('CRITICAL');
      expect(packet.verification_status).toBe('UNVERIFIED');
      expect(packet.help_needed).toEqual(['FIRST_AID', 'TRANSPORT']);
      expect(packet.location_link).toBe('https://www.google.com/maps?q=21.145800,79.088200');
      expect(packet.latitude).toBe(21.1458);
      expect(packet.longitude).toBe(79.0882);
      expect(packet.location_source).toBe('CURRENT');
      expect(packet.accuracy_meters).toBe(15);
      expect(packet.landmark).toBe('Behind City Hospital Gate 3');
      expect(packet.ttl).toBe(5);
      expect(packet.status).toBe(BLE_PACKET_STATUS.PENDING);
    });

    it('handles multi-hop relay by decrementing TTL and preventing duplicate forwarding', async () => {
      const loc = buildLocationObject({
        latitude: 21.1458,
        longitude: 79.0882,
        source: 'CURRENT'
      });

      const originalPacket = bluetoothTransport.createEmergencyPacket({
        type: 'HELP',
        category: 'FLOOD_RESCUE',
        urgency: 'HIGH',
        location: loc
      });

      // Clear duplicate cache
      bluetoothTransport.seenAlertIds.clear();

      let receivedRelayed = null;
      const unsub = bluetoothTransport.onPacketReceived((pkt) => {
        receivedRelayed = pkt;
      });

      // First hop broadcast: should be accepted and relayed
      await bluetoothTransport.handleIncomingBroadcast({
        type: 'MESH_PACKET',
        packet: originalPacket
      });

      expect(receivedRelayed).not.toBeNull();
      expect(receivedRelayed.ttl).toBe(originalPacket.ttl - 1);
      expect(receivedRelayed.hop_count).toBe(1);
      expect(receivedRelayed.location_timestamp).toBe(originalPacket.location_timestamp); // Preserved original location time!
      expect(receivedRelayed.forwarded_at).toBeDefined(); // Recorded relay forward time

      // Second broadcast of identical alert_id: MUST be dropped by duplicate detection
      receivedRelayed = null;
      await bluetoothTransport.handleIncomingBroadcast({
        type: 'MESH_PACKET',
        packet: originalPacket
      });

      expect(receivedRelayed).toBeNull(); // Successfully dropped!
      unsub();
    });

    it('drops packets whose TTL has reached zero', async () => {
      const packet = bluetoothTransport.createEmergencyPacket({
        type: 'HELP',
        category: 'GENERAL',
        urgency: 'LOW'
      });
      packet.ttl = 1; // Last hop

      bluetoothTransport.seenAlertIds.clear();

      let forwarded = null;
      const unsub = bluetoothTransport.onPacketReceived((p) => {
        forwarded = p;
      });

      await bluetoothTransport.handleIncomingBroadcast({
        type: 'MESH_PACKET',
        packet
      });

      // TTL 1 decrements to 0, so packet must NOT be forwarded further
      expect(forwarded).toBeNull();
      unsub();
    });
  });

});
