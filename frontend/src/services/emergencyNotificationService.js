/**
 * RESQMesh — Unified Direct Emergency SMS & Notification Service
 *
 * Implements direct cellular emergency SMS transmission without launching
 * messaging applications (Google Messages, WhatsApp, etc.). Operates completely
 * offline over carrier signal using native Android SmsManager where available.
 *
 * Truthful delivery statuses:
 * - SOS_SAVED_OFFLINE
 * - SMS_PERMISSION_REQUIRED
 * - SMS_QUEUED
 * - SMS_SUBMISSION_FAILED
 * - SMS_SUBMITTED_TO_CARRIER
 * - SMS_DELIVERY_CONFIRMED
 */

import { API_BASE } from './api';
import { getEmergencyContact } from './emergencyContactService';
import { formatLocationAge } from './locationService';

export const NOTIFICATION_STATUS = {
  SOS_SAVED_OFFLINE: 'SOS_SAVED_OFFLINE',
  SMS_PERMISSION_REQUIRED: 'SMS_PERMISSION_REQUIRED',
  SMS_QUEUED: 'SMS_QUEUED',
  SMS_SUBMISSION_FAILED: 'SMS_SUBMISSION_FAILED',
  SMS_SUBMITTED_TO_CARRIER: 'SMS_SUBMITTED_TO_CARRIER',
  SMS_DELIVERY_CONFIRMED: 'SMS_DELIVERY_CONFIRMED',

  // Backward-compatible aliases for existing components
  SAVED_LOCALLY: 'SOS_SAVED_OFFLINE',
  QUEUED_FOR_CONTACT_NOTIFICATION: 'SMS_QUEUED',
  PROVIDER_ACCEPTED: 'SMS_SUBMITTED_TO_CARRIER',
  DELIVERY_CONFIRMED: 'SMS_DELIVERY_CONFIRMED',
  FAILED_RETRYABLE: 'SMS_SUBMISSION_FAILED',
  FAILED_FINAL: 'SMS_SUBMISSION_FAILED'
};

const NOTIFICATIONS_STORAGE_KEY = 'resqmesh_emergency_notifications';
const listeners = new Set();

/**
 * Masks phone numbers in logs and notifications to protect user privacy.
 * E.g., "+91 9272104399" -> "+91 *****04399"
 */
export function maskPhoneNumber(phone) {
  if (!phone) return '****';
  const clean = String(phone).replace(/[\s\-\(\)]/g, '');
  if (clean.length <= 4) return '****';
  const visible = clean.slice(-4);
  const prefix = clean.startsWith('+') ? clean.slice(0, 3) + ' ' : '';
  return `${prefix}*****${visible}`;
}

/**
 * Builds the canonical emergency text matching CASCADE specification:
 * "EMERGENCY SOS: I may need immediate assistance. Location: [latitude, longitude]. Maps: [map link]. Location recorded: [timestamp]. SOS ID: [unique ID]."
 */
export function buildEmergencySosMessage({
  sosId,
  triggerSource = 'MANUAL',
  location = null,
  customNote = ''
}) {
  const triggerPrefix = triggerSource ? ` [${triggerSource.toUpperCase()}]` : '';
  let locationClause = 'Location: UNAVAILABLE.';

  if (location && location.coords && location.status !== 'UNAVAILABLE') {
    const lat = Number(location.coords.lat);
    const lng = Number(location.coords.lng);

    if (isFinite(lat) && isFinite(lng)) {
      const latStr = lat.toFixed(5);
      const lngStr = lng.toFixed(5);
      const mapsUrl = `https://maps.google.com/?q=${latStr},${lngStr}`;
      const capturedIso = location.coords.timestamp || location.coords.measured_at || new Date().toISOString();
      const accuracy = location.coords.accuracy_meters || location.coords.accuracy
        ? ` (±${Math.round(location.coords.accuracy_meters || location.coords.accuracy)}m)`
        : '';

      const isLastKnown = Boolean(
        location.coords.is_last_known ||
        location.coords.source === 'LAST_KNOWN' ||
        location.status === 'LAST_KNOWN' ||
        !location.isRealGps
      );

      if (isLastKnown) {
        const age = formatLocationAge(capturedIso) || 'previously cached';
        locationClause = `Last known location: ${latStr}, ${lngStr}${accuracy} (${age}). Maps: ${mapsUrl}. Location recorded: ${capturedIso}.`;
      } else {
        locationClause = `Location: ${latStr}, ${lngStr}${accuracy}. Maps: ${mapsUrl}. Location recorded: ${capturedIso}.`;
      }
    }
  }

  let text = `EMERGENCY SOS${triggerPrefix}: I may need immediate assistance. ${locationClause} SOS ID: ${sosId}.`;

  if (customNote && customNote.trim()) {
    text += ` Note: ${customNote.trim()}`;
  }

  return text;
}

/**
 * Checks if running inside the native Android wrapper with direct cellular SMS capabilities.
 */
export function isNativeDirectSmsSupported() {
  return typeof window !== 'undefined' &&
    Boolean(
      window.AndroidSmsBridge &&
      typeof window.AndroidSmsBridge.isDirectSmsSupported === 'function' &&
      window.AndroidSmsBridge.isDirectSmsSupported()
    );
}

/**
 * Checks whether Android SEND_SMS permission is currently granted.
 */
export function hasNativeSmsPermission() {
  return typeof window !== 'undefined' &&
    Boolean(
      window.AndroidSmsBridge &&
      typeof window.AndroidSmsBridge.hasSmsPermission === 'function' &&
      window.AndroidSmsBridge.hasSmsPermission()
    );
}

/**
 * Requests native Android SEND_SMS runtime permission.
 */
export function requestNativeSmsPermission() {
  if (
    typeof window !== 'undefined' &&
    window.AndroidSmsBridge &&
    typeof window.AndroidSmsBridge.requestSmsPermission === 'function'
  ) {
    window.AndroidSmsBridge.requestSmsPermission();
  }
}

/**
 * Generates an SMS URI as a backup option for web browsers.
 */
export function generateSmsUri(phone, body) {
  const cleaned = (phone || '').replace(/[\s\-\(\)]/g, '');
  const encoded = encodeURIComponent(body);
  return `sms:${cleaned}?body=${encoded}`;
}

/**
 * Global bridge callback registered for Android SmsManager events.
 */
export function processNativeSmsStatusUpdate(payload) {
  try {
    const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
    if (data && data.sos_id) {
      handleNativeStatusUpdate(data);
    }
  } catch (err) {
    console.warn('Error handling native SMS status update:', err);
  }
}

if (typeof window !== 'undefined') {
  window.onNativeSmsStatusUpdate = processNativeSmsStatusUpdate;
}
if (typeof globalThis !== 'undefined') {
  globalThis.onNativeSmsStatusUpdate = processNativeSmsStatusUpdate;
}

function handleNativeStatusUpdate(data) {
  const { sos_id, delivery_status, details, timestamp } = data;
  const list = getLocalNotifications();
  const index = list.findIndex(n => n.sos_id === sos_id);
  if (index >= 0) {
    const updated = {
      ...list[index],
      delivery_status,
      status_details: details || list[index].status_details,
      updated_at: timestamp || new Date().toISOString()
    };
    if (delivery_status === NOTIFICATION_STATUS.SMS_DELIVERY_CONFIRMED) {
      updated.confirmed_at = timestamp || new Date().toISOString();
    }
    list[index] = updated;
    saveNotificationsList(list);
    notifySubscribers(updated);
  }
}

/**
 * Dispatches an emergency alert notification to the user's emergency contact.
 *
 * 1. Validates recipient phone number format.
 * 2. Deduplicates against identical (sos_id, contact_phone).
 * 3. Saves locally first (SOS_SAVED_OFFLINE).
 * 4. If on native Android: executes silent direct cellular SMS via SmsManager (zero app popup).
 * 5. If on web browser: queues locally (SMS_QUEUED) and syncs via gateway if online.
 */
export async function dispatchEmergencyNotification({
  sosId,
  triggerSource = 'MANUAL',
  location = null,
  contact = null,
  customNote = '',
  userId = 'usr-citizen'
}) {
  const targetContact = contact || getEmergencyContact(userId);
  const rawPhone = targetContact.phone || '';
  const cleanDigits = rawPhone.replace(/\D/g, '');

  if (cleanDigits.length < 7) {
    const failedRecord = {
      notification_id: `notif-err-${Date.now()}`,
      sos_id: sosId,
      trigger_source: triggerSource.toUpperCase(),
      recipient_name: targetContact.name || 'Emergency Contact',
      recipient_phone: rawPhone,
      message_text: 'Invalid recipient contact phone number',
      delivery_status: NOTIFICATION_STATUS.SMS_SUBMISSION_FAILED,
      error: 'Invalid recipient phone number format',
      created_at: new Date().toISOString()
    };
    saveNotificationLocally(failedRecord);
    return failedRecord;
  }

  const fullPhone = `${targetContact.country_code || '+91'} ${targetContact.phone}`.trim();
  const idempKey = `${sosId}:${cleanDigits}`;

  // Check for duplicate in-flight dispatch
  const existingList = getLocalNotifications();
  const existing = existingList.find(n => n.idemp_key === idempKey);
  if (existing) {
    console.log(`Duplicate SMS dispatch prevented for SOS ${sosId} -> ${maskPhoneNumber(fullPhone)}`);
    return existing;
  }

  const messageText = buildEmergencySosMessage({
    sosId,
    triggerSource,
    location,
    customNote
  });

  const nowIso = new Date().toISOString();
  const notifId = `notif-${Math.random().toString(36).substring(2, 9)}-${Date.now()}`;

  const lat = location?.coords?.lat ?? null;
  const lng = location?.coords?.lng ?? null;
  const mapsUrl = (lat !== null && lng !== null && location?.status !== 'UNAVAILABLE' && isFinite(Number(lat)) && isFinite(Number(lng)))
    ? `https://maps.google.com/?q=${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`
    : null;

  const initialRecord = {
    notification_id: notifId,
    sos_id: sosId,
    idemp_key: idempKey,
    trigger_source: triggerSource.toUpperCase(),
    recipient_name: targetContact.name,
    recipient_phone: fullPhone,
    masked_phone: maskPhoneNumber(fullPhone),
    message_text: messageText,
    google_maps_url: mapsUrl,
    delivery_status: NOTIFICATION_STATUS.SOS_SAVED_OFFLINE,
    provider: isNativeDirectSmsSupported() ? 'NATIVE_CELLULAR_SMS' : 'WEB_MESH_GATEWAY',
    provider_sid: null,
    created_at: nowIso,
    sms_uri: generateSmsUri(targetContact.phone, messageText)
  };

  // 1. Persist locally first (guarantees offline safety)
  saveNotificationLocally(initialRecord);

  // 2. Direct Cellular SMS via Native Android SmsManager
  if (isNativeDirectSmsSupported()) {
    if (!hasNativeSmsPermission()) {
      initialRecord.delivery_status = NOTIFICATION_STATUS.SMS_PERMISSION_REQUIRED;
      initialRecord.status_details = 'Android SEND_SMS permission required for direct cellular dispatch.';
      saveNotificationLocally(initialRecord);
      requestNativeSmsPermission();
      notifySubscribers(initialRecord);
      return initialRecord;
    }

    try {
      const bridgeResRaw = window.AndroidSmsBridge.sendDirectSms(
        sosId,
        fullPhone,
        messageText
      );
      const bridgeRes = typeof bridgeResRaw === 'string' ? JSON.parse(bridgeResRaw) : bridgeResRaw;

      initialRecord.delivery_status = bridgeRes.delivery_status || NOTIFICATION_STATUS.SMS_QUEUED;
      initialRecord.provider = 'NATIVE_CELLULAR_SMS';
      initialRecord.parts_count = bridgeRes.parts_count || 1;
      initialRecord.status_details = 'Submitted directly to native cellular radio hardware without opening any app.';

      saveNotificationLocally(initialRecord);
      notifySubscribers(initialRecord);
      return initialRecord;
    } catch (nativeErr) {
      console.warn('Native SMS bridge invocation failure:', nativeErr);
      initialRecord.delivery_status = NOTIFICATION_STATUS.SMS_SUBMISSION_FAILED;
      initialRecord.error = nativeErr.message;
      saveNotificationLocally(initialRecord);
      notifySubscribers(initialRecord);
      return initialRecord;
    }
  }

  // 3. Web Platform / Gateway Path
  // When running in a web browser without the native Android container:
  // Do not pretend JavaScript silently sent carrier SMS. Truthfully mark SMS_QUEUED.
  initialRecord.delivery_status = NOTIFICATION_STATUS.SMS_QUEUED;
  initialRecord.status_details = 'Queued in offline outbox for BLE multi-hop relay to cellular gateway node.';
  saveNotificationLocally(initialRecord);

  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const res = await fetch(`${API_BASE}/resqmesh/notifications/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sos_id: sosId,
          trigger_source: triggerSource.toUpperCase(),
          contact_name: targetContact.name,
          contact_phone: targetContact.phone,
          country_code: targetContact.country_code || '+91',
          lat: lat,
          lng: lng,
          accuracy_meters: location?.coords?.accuracy_meters || null,
          location_status: location?.status || 'CURRENT_GPS',
          location_timestamp: location?.coords?.timestamp || nowIso,
          location_age_str: location?.coords?.timestamp ? formatLocationAge(location.coords.timestamp) : 'fresh',
          custom_message: customNote || null
        })
      });

      if (res.ok) {
        const serverData = await res.json();
        const updatedRecord = {
          ...initialRecord,
          ...serverData,
          delivery_status: serverData.delivery_status === 'PROVIDER_ACCEPTED'
            ? NOTIFICATION_STATUS.SMS_SUBMITTED_TO_CARRIER
            : (serverData.delivery_status || NOTIFICATION_STATUS.SMS_SUBMITTED_TO_CARRIER)
        };
        saveNotificationLocally(updatedRecord);
        notifySubscribers(updatedRecord);
        return updatedRecord;
      } else {
        initialRecord.delivery_status = NOTIFICATION_STATUS.SMS_SUBMISSION_FAILED;
        saveNotificationLocally(initialRecord);
      }
    } catch (err) {
      console.log('Network unreachable for gateway sync; notification safely queued offline:', err.message);
    }
  }

  notifySubscribers(initialRecord);
  return initialRecord;
}

const getStorage = () => {
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) return globalThis.localStorage;
  return null;
};

function saveNotificationLocally(record) {
  try {
    const list = getLocalNotifications();
    const idx = list.findIndex(n => n.sos_id === record.sos_id && n.recipient_phone === record.recipient_phone);
    if (idx >= 0) {
      list[idx] = record;
    } else {
      list.unshift(record);
    }
    saveNotificationsList(list);
  } catch (e) {
    console.warn('Error persisting notification locally:', e);
  }
}

function saveNotificationsList(list) {
  try {
    const storage = getStorage();
    if (!storage) return;
    storage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(list.slice(0, 50)));
  } catch (e) {}
}

export function getLocalNotifications(sosId = null) {
  try {
    const storage = getStorage();
    if (!storage) return [];
    const raw = storage.getItem(NOTIFICATIONS_STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (sosId) {
      return list.filter(n => n.sos_id === sosId);
    }
    return list;
  } catch (e) {
    return [];
  }
}

export function subscribeToNotificationUpdates(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function notifySubscribers(record) {
  listeners.forEach(fn => {
    try { fn(record); } catch (e) {}
  });
}
