import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DEFAULT_PROTOTYPE_CONTACT,
  validatePhoneNumber,
  getEmergencyContact,
  saveEmergencyContact,
  hasCompletedContactOnboarding,
  markContactOnboarded
} from '../emergencyContactService';
import {
  buildEmergencySosMessage,
  generateSmsUri,
  dispatchEmergencyNotification,
  NOTIFICATION_STATUS,
  getLocalNotifications,
  maskPhoneNumber,
  isNativeDirectSmsSupported,
  hasNativeSmsPermission,
  processNativeSmsStatusUpdate
} from '../emergencyNotificationService';
import { voiceSosService } from '../voiceSosService';
import { gestureSosService } from '../gestureSosService';

// Ensure localStorage is polyfilled for Node test environment
const mockStorage: Record<string, string> = {};
if (typeof globalThis.localStorage === 'undefined' || !globalThis.localStorage.clear) {
  (globalThis as any).localStorage = {
    getItem: (key: string) => mockStorage[key] ?? null,
    setItem: (key: string, val: string) => { mockStorage[key] = String(val); },
    removeItem: (key: string) => { delete mockStorage[key]; },
    clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }
  };
}

describe('RESQMesh Emergency Contact, Direct SMS & Safety Triggers Suite', () => {

  beforeEach(() => {
    localStorage.clear();
    delete (globalThis as any).window?.AndroidSmsBridge;
    vi.restoreAllMocks();
  });

  describe('1. Emergency Contact Management & Validation', () => {
    it('returns prototype pre-filled contact (Sanskruti / 9272104399) by default', () => {
      const contact = getEmergencyContact('usr-default');
      expect(contact.name).toBe('Sanskruti');
      expect(contact.phone).toBe('9272104399');
      expect(contact.country_code).toBe('+91');
    });

    it('validates 10-digit mobile phone numbers for India (+91)', () => {
      expect(validatePhoneNumber('9272104399', '+91')).toBeNull();
      expect(validatePhoneNumber('9876543210', '+91')).toBeNull();
      expect(validatePhoneNumber('12345', '+91')).toMatch(/10-digit/);
      expect(validatePhoneNumber('', '+91')).toMatch(/required/);
    });

    it('persists emergency contact locally and tracks onboarding completion', async () => {
      expect(hasCompletedContactOnboarding('usr-test')).toBe(false);

      await saveEmergencyContact('usr-test', {
        name: 'Sanskruti',
        phone: '9272104399',
        country_code: '+91',
        relationship: 'Sister'
      });

      expect(hasCompletedContactOnboarding('usr-test')).toBe(true);
      const saved = getEmergencyContact('usr-test');
      expect(saved.name).toBe('Sanskruti');
      expect(saved.phone).toBe('9272104399');
    });

    it('masks phone numbers in public logs and UI to protect privacy', () => {
      expect(maskPhoneNumber('+91 9272104399')).toBe('+91 *****4399');
      expect(maskPhoneNumber('9272104399')).toBe('*****4399');
      expect(maskPhoneNumber('')).toBe('****');
    });
  });

  describe('2. Canonical SOS Message Formatting Matching CASCADE Specs', () => {
    it('constructs standard emergency SOS message with fresh GPS coordinates and maps link', () => {
      const msg = buildEmergencySosMessage({
        sosId: 'sos-voice-1234',
        triggerSource: 'VOICE',
        location: {
          coords: {
            lat: 21.1458,
            lng: 79.0882,
            accuracy_meters: 10,
            timestamp: '2026-10-26T07:00:00Z',
            is_last_known: false
          },
          status: 'CURRENT_GPS',
          isRealGps: true
        },
        customNote: 'Flooding in ground floor.'
      });

      expect(msg).toContain('EMERGENCY SOS [VOICE]: I may need immediate assistance.');
      expect(msg).toContain('Location: 21.14580, 79.08820 (±10m).');
      expect(msg).toContain('Maps: https://maps.google.com/?q=21.14580,79.08820.');
      expect(msg).toContain('Location recorded: 2026-10-26T07:00:00Z.');
      expect(msg).toContain('SOS ID: sos-voice-1234.');
      expect(msg).toContain('Note: Flooding in ground floor.');
    });

    it('clearly identifies cached fix as last known location with age and timestamp', () => {
      const pastTime = new Date(Date.now() - 600000).toISOString();
      const msg = buildEmergencySosMessage({
        sosId: 'sos-cached-1234',
        triggerSource: 'MANUAL',
        location: {
          coords: {
            lat: 21.1458,
            lng: 79.0882,
            accuracy_meters: 20,
            timestamp: pastTime,
            is_last_known: true
          },
          status: 'LAST_KNOWN',
          isRealGps: false
        }
      });

      expect(msg).toContain('Last known location: 21.14580, 79.08820 (±20m)');
      expect(msg).toContain('Maps: https://maps.google.com/?q=21.14580,79.08820');
      expect(msg).toContain(`Location recorded: ${pastTime}`);
      expect(msg).toContain('SOS ID: sos-cached-1234');
    });

    it('honestly declares Location: UNAVAILABLE when coordinates are missing', () => {
      const msg = buildEmergencySosMessage({
        sosId: 'sos-gesture-5678',
        triggerSource: 'GESTURE',
        location: {
          coords: null,
          status: 'UNAVAILABLE'
        }
      });

      expect(msg).toContain('Location: UNAVAILABLE');
      expect(msg).not.toContain('maps.google.com');
      expect(msg).toContain('SOS ID: sos-gesture-5678');
    });
  });

  describe('3. Native Android Direct Cellular SMS (Zero Messaging App Popup)', () => {
    it('directly transmits SMS via native SmsManager bridge when available', async () => {
      const sendDirectSmsSpy = vi.fn().mockReturnValue(JSON.stringify({
        sos_id: 'sos-native-001',
        delivery_status: NOTIFICATION_STATUS.SMS_SUBMITTED_TO_CARRIER,
        parts_count: 1
      }));

      // Mock native Android bridge injected into window
      (globalThis as any).window = (globalThis as any).window || {};
      (globalThis as any).window.AndroidSmsBridge = {
        isDirectSmsSupported: () => true,
        hasSmsPermission: () => true,
        requestSmsPermission: vi.fn(),
        sendDirectSms: sendDirectSmsSpy
      };

      expect(isNativeDirectSmsSupported()).toBe(true);
      expect(hasNativeSmsPermission()).toBe(true);

      const result = await dispatchEmergencyNotification({
        sosId: 'sos-native-001',
        triggerSource: 'LOGO_CLICK',
        location: {
          coords: { lat: 21.1458, lng: 79.0882, accuracy_meters: 15 },
          status: 'CURRENT_GPS'
        },
        userId: 'usr-citizen'
      });

      expect(sendDirectSmsSpy).toHaveBeenCalledTimes(1);
      expect(result.delivery_status).toBe(NOTIFICATION_STATUS.SMS_SUBMITTED_TO_CARRIER);
      expect(result.provider).toBe('NATIVE_CELLULAR_SMS');
      expect(result.masked_phone).toContain('*****');
    });

    it('transitions to SMS_PERMISSION_REQUIRED if native SEND_SMS permission is not granted', async () => {
      const requestSmsPermissionSpy = vi.fn();
      (globalThis as any).window = (globalThis as any).window || {};
      (globalThis as any).window.AndroidSmsBridge = {
        isDirectSmsSupported: () => true,
        hasSmsPermission: () => false, // Permission missing
        requestSmsPermission: requestSmsPermissionSpy,
        sendDirectSms: vi.fn()
      };

      const result = await dispatchEmergencyNotification({
        sosId: 'sos-native-noperm',
        triggerSource: 'VOICE',
        location: null,
        userId: 'usr-citizen'
      });

      expect(requestSmsPermissionSpy).toHaveBeenCalled();
      expect(result.delivery_status).toBe(NOTIFICATION_STATUS.SMS_PERMISSION_REQUIRED);
    });

    it('receives carrier delivery confirmation via native status bridge', async () => {
      // Save initial record in local notifications
      await dispatchEmergencyNotification({
        sosId: 'sos-delivered-test',
        triggerSource: 'MANUAL',
        location: null,
        userId: 'usr-citizen'
      });

      // Simulate Android delivery receiver firing with Activity.RESULT_OK
      processNativeSmsStatusUpdate({
        sos_id: 'sos-delivered-test',
        delivery_status: NOTIFICATION_STATUS.SMS_DELIVERY_CONFIRMED,
        details: 'Handset delivery report confirmed.'
      });

      const updatedList = getLocalNotifications('sos-delivered-test');
      expect(updatedList.length).toBe(1);
      expect(updatedList[0].delivery_status).toBe(NOTIFICATION_STATUS.SMS_DELIVERY_CONFIRMED);
      expect(updatedList[0].confirmed_at).toBeDefined();
    });
  });

  describe('4. Web Browser Mode & Deduplication Safety', () => {
    it('truthfully queues notification offline (SMS_QUEUED) without pretending JS sent cellular SMS', async () => {
      delete (globalThis as any).window?.AndroidSmsBridge;
      expect(isNativeDirectSmsSupported()).toBe(false);

      const result = await dispatchEmergencyNotification({
        sosId: 'sos-web-queue',
        triggerSource: 'MANUAL',
        location: {
          coords: { lat: 21.14, lng: 79.08, accuracy_meters: 15 },
          status: 'CURRENT_GPS'
        },
        userId: 'usr-citizen'
      });

      expect(result.delivery_status).toBe(NOTIFICATION_STATUS.SMS_QUEUED);
      expect(result.provider).toBe('WEB_MESH_GATEWAY');
    });

    it('prevents duplicate cellular SMS dispatches for the same SOS ID and recipient', async () => {
      const res1 = await dispatchEmergencyNotification({
        sosId: 'sos-duplicate-check',
        triggerSource: 'MANUAL',
        location: null,
        userId: 'usr-citizen'
      });

      const res2 = await dispatchEmergencyNotification({
        sosId: 'sos-duplicate-check',
        triggerSource: 'MANUAL',
        location: null,
        userId: 'usr-citizen'
      });

      expect(res1.notification_id).toBe(res2.notification_id);
      expect(getLocalNotifications('sos-duplicate-check').length).toBe(1);
    });
  });

});
