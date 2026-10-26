import { describe, it, expect } from 'vitest';
import {
  encodeBleEmergencyAdv,
  decodeBleEmergencyAdv,
  encodeBleAcceptanceAdv,
  decodeBleAcceptanceAdv,
  BLE_MSG_TYPES,
  BLE_URGENCY_CODES,
  BLE_CATEGORY_CODES
} from '../ble/blePacketCodec';
import { matchRespondersLocally, haversineKm, normalizeCapability } from '../matchingService';
import { validatePasswordStrength } from '../authService';
import { normalizeEmergencyRecord } from '../offlineStorage';

describe('RESQMesh BLE Binary Advertisement Codec (24-byte Budget)', () => {
  it('encodes an emergency alert into exactly 24 bytes', () => {
    const alert = {
      alert_id: 'emg-flood-77',
      category: 'FLOOD',
      urgency: 'CRITICAL',
      location: {
        latitude: 21.145823,
        longitude: 79.088214,
        source: 'CURRENT',
        accuracy_meters: 12
      },
      ttl: 3,
      created_at: new Date('2026-03-15T10:30:00Z').toISOString()
    };

    const bytes = encodeBleEmergencyAdv(alert);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(24);
  });

  it('correctly decodes the 24-byte payload and verifies checksum', () => {
    const original = {
      alert_id: 'emg-medical-99',
      category: 'MEDICAL',
      urgency: 'HIGH',
      location: {
        latitude: 21.1524,
        longitude: 79.0910,
        source: 'LAST_KNOWN',
        accuracy_meters: 25
      },
      ttl: 2,
      created_at: new Date('2026-05-01T12:00:00Z').toISOString()
    };

    const encoded = encodeBleEmergencyAdv(original);
    const decoded = decodeBleEmergencyAdv(encoded);

    expect(decoded.is_valid_checksum).toBe(true);
    expect(decoded.category).toBe('MEDICAL');
    expect(decoded.urgency).toBe('HIGH');
    expect(decoded.ttl).toBe(2);
    expect(decoded.location.source).toBe('LAST_KNOWN');
    expect(decoded.location.accuracy_meters).toBe(25);
    expect(Math.abs(decoded.location.latitude - 21.1524)).toBeLessThan(0.0001);
    expect(Math.abs(decoded.location.longitude - 79.0910)).toBeLessThan(0.0001);
    expect(decoded.location.location_link).toContain('https://www.google.com/maps?q=');
  });

  it('encodes and decodes responder acceptance return path packets', () => {
    const acceptance = {
      alert_id: 'emg-flood-77',
      responder_id: 'resp-amulya-cert',
      status: 'ACCEPTED',
      eta_minutes: 14
    };

    const encoded = encodeBleAcceptanceAdv(acceptance);
    expect(encoded.length).toBe(24);

    const decoded = decodeBleAcceptanceAdv(encoded);
    expect(decoded.status).toBe('ACCEPTED');
    expect(decoded.eta_minutes).toBe(14);
  });

  it('encodes and decodes EN ROUTE status packet', () => {
    const enRoute = {
      alert_id: 'emg-flood-77',
      responder_id: 'resp-amulya-cert',
      status: 'EN ROUTE',
      eta_minutes: 8
    };

    const encoded = encodeBleAcceptanceAdv(enRoute);
    const decoded = decodeBleAcceptanceAdv(encoded);
    expect(decoded.status).toBe('EN ROUTE');
    expect(decoded.eta_minutes).toBe(8);
  });
});

describe('Opportunity-Cost Aware Local Matching Engine', () => {
  const responders = [
    {
      responder_id: 'resp-dr-radhika',
      name: 'Dr. Radhika Sharma',
      role: 'Trauma Physician',
      capabilities: ['trauma_paramedic', 'advanced_cardiac_life_support'],
      status: 'AVAILABLE',
      current_lat: 21.1460,
      current_lng: 79.0880,
      battery_pct: 95,
      trust_score: 0.95
    },
    {
      responder_id: 'resp-amit-boat',
      name: 'Amit Verma',
      role: 'Boat Pilot',
      capabilities: ['watercraft_rescue'],
      status: 'AVAILABLE',
      current_lat: 21.1470,
      current_lng: 79.0890,
      battery_pct: 88,
      trust_score: 0.90
    },
    {
      responder_id: 'resp-general-cert',
      name: 'Priya Volunteer',
      role: 'General CERT',
      capabilities: ['general_first_aid_rescue'],
      status: 'AVAILABLE',
      current_lat: 21.1450,
      current_lng: 79.0870,
      battery_pct: 80,
      trust_score: 0.85
    }
  ];

  it('matches watercraft rescue to boat pilot for flood emergency', () => {
    const floodEmg = {
      id: 'emg-flood',
      urgency: 'CRITICAL',
      help_needed: ['watercraft_rescue'],
      lat: 21.1490,
      lng: 79.0910
    };

    const result = matchRespondersLocally(floodEmg, responders);
    expect(result.ranked_candidates.length).toBe(3);
    const topCandidate = result.ranked_candidates[0];
    expect(topCandidate.name).toBe('Amit Verma');
    expect(topCandidate.is_suitable).toBe(true);
    expect(topCandidate.score).toBeGreaterThan(70);
  });

  it('preserves trauma doctor when emergency is only general supply deficit', () => {
    const supplyEmg = {
      id: 'emg-water-supply',
      urgency: 'LOW',
      help_needed: ['clean_drinking_water'],
      lat: 21.1450,
      lng: 79.0870
    };

    const result = matchRespondersLocally(supplyEmg, responders);
    const doctor = result.ranked_candidates.find(c => c.name === 'Dr. Radhika Sharma');
    expect(doctor.justification).toContain('Preserved specialist');
  });

  it('calculates Haversine distance reliably', () => {
    const dist = haversineKm(21.1458, 79.0882, 21.1524, 79.0910);
    expect(dist).toBeGreaterThan(0.5);
    expect(dist).toBeLessThan(3.0);
  });
});

describe('Authentication & Password Policy', () => {
  it('enforces password complexity rules', () => {
    expect(validatePasswordStrength('short')).toContain('at least 8 characters');
    expect(validatePasswordStrength('alllowercase123!')).toContain('uppercase');
    expect(validatePasswordStrength('ALLUPPERCASE123!')).toContain('lowercase');
    expect(validatePasswordStrength('NoSpecialOrDigits')).toContain('number or special character');
    expect(validatePasswordStrength('ValidPassword2026!')).toBeNull();
  });
});

describe('Section 8 Canonical Emergency Record Normalization', () => {
  it('normalizes legacy and raw objects to Section 8 canonical schema', () => {
    const raw = {
      emergency_id: 'emg-1234',
      raw_message: 'House flooded, grandmother needs medication',
      severity: 'CRITICAL',
      lat: 21.1500,
      lng: 79.0900,
      required_capabilities: ['watercraft_rescue', 'first_aid']
    };

    const norm = normalizeEmergencyRecord(raw);
    expect(norm.id).toBe('emg-1234');
    expect(norm.emergency_id).toBe('emg-1234');
    expect(norm.description).toBe('House flooded, grandmother needs medication');
    expect(norm.urgency).toBe('CRITICAL');
    expect(norm.help_needed).toEqual(['watercraft_rescue', 'first_aid']);
    expect(norm.location.latitude).toBe(21.1500);
    expect(norm.location.longitude).toBe(79.0900);
    expect(norm.location.location_link).toBe('https://www.google.com/maps?q=21.15,79.09');
    expect(norm.assistance_status).toBe('OPEN');
    expect(norm.broadcast_status).toBe('PENDING');
  });
});
