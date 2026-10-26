/**
 * RESQMesh — Compact Binary BLE Advertisement Packet Codec
 *
 * Implements a 24-byte compact binary encoding designed specifically for
 * connectionless Bluetooth Low Energy (BLE) advertisements.
 *
 * Payload Budget (fits within standard 31-byte legacy BLE advertisement limit):
 * - Total length: 24 bytes (leaving 7 bytes for BLE AD Flags & Service Data UUID header)
 *
 * Byte Layout:
 * [0]     : Protocol Version (4 bits) | Message Type (4 bits)
 * [1]     : Urgency (2 bits) | Category (4 bits) | Hop TTL (2 bits)
 * [2..9]  : Short Alert Identifier (8 bytes, 64-bit BigEndian integer)
 * [10..13]: Fixed-Point Latitude (4 bytes, Int32: degrees * 1e6, range -90° to +90°)
 * [14..17]: Fixed-Point Longitude (4 bytes, Int32: degrees * 1e6, range -180° to +180°)
 * [18]    : Freshness Flag (Bit 7: 0=CURRENT, 1=LAST_KNOWN) | Accuracy (Bits 0..6: 0-127m)
 * [19..20]: Timestamp (2 bytes, Uint16: minutes since 2026-01-01 epoch)
 * [21..23]: Integrity Checksum (3 bytes, truncated SHA-256 / CRC-24)
 */

export const BLE_MSG_TYPES = {
  DISTRESS_SOS: 0x1,
  ACCEPTANCE: 0x2,
  EN_ROUTE: 0x3,
  HELP_PROVIDED: 0x4,
  CLOSED: 0x5
};

export const BLE_URGENCY_CODES = {
  LOW: 0,
  MODERATE: 1,
  HIGH: 2,
  CRITICAL: 3
};

export const BLE_CATEGORY_CODES = {
  GENERAL: 0,
  MEDICAL: 1,
  FLOOD: 2,
  COLLAPSE: 3,
  FIRE: 4,
  SUPPLIES: 5
};

const EPOCH_ANCHOR_MS = new Date('2026-01-01T00:00:00Z').getTime();

/**
 * Computes simple 24-bit CRC / truncated hash over payload bytes.
 */
function computeChecksum24(bytes, length) {
  let crc = 0x555555;
  for (let i = 0; i < length; i++) {
    crc ^= (bytes[i] << 16);
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x800000) ? ((crc << 1) ^ 0x00065B) : (crc << 1);
      crc &= 0xFFFFFF;
    }
  }
  return crc;
}

/**
 * Encodes an emergency alert into a compact 24-byte BLE advertisement payload.
 */
export function encodeBleEmergencyAdv(alert) {
  const buf = new Uint8Array(24);
  const view = new DataView(buf.buffer);

  // Byte 0: Version (1) | Message Type
  const version = 1;
  const msgType = alert.type === 'ACCEPTANCE' ? BLE_MSG_TYPES.ACCEPTANCE : BLE_MSG_TYPES.DISTRESS_SOS;
  buf[0] = ((version & 0x0F) << 4) | (msgType & 0x0F);

  // Byte 1: Urgency (2b) | Category (4b) | TTL (2b)
  const urgencyCode = BLE_URGENCY_CODES[alert.urgency] ?? BLE_URGENCY_CODES.MODERATE;
  const categoryCode = BLE_CATEGORY_CODES[alert.category] ?? BLE_CATEGORY_CODES.GENERAL;
  const ttl = Math.min(3, Math.max(0, alert.ttl ?? 3));
  buf[1] = ((urgencyCode & 0x03) << 6) | ((categoryCode & 0x0F) << 2) | (ttl & 0x03);

  // Bytes 2..9: Short Alert ID (64-bit integer derived from UUID or hash)
  const idStr = alert.alert_id || alert.id || 'emg-0000';
  let hashVal = 0n;
  for (let i = 0; i < idStr.length; i++) {
    hashVal = (hashVal * 31n + BigInt(idStr.charCodeAt(i))) & 0xFFFFFFFFFFFFFFFFn;
  }
  view.setBigUint64(2, hashVal, false); // BigEndian

  // Bytes 10..13: Latitude (fixed-point * 1e6)
  const lat = alert.location?.latitude ?? alert.latitude ?? alert.lat ?? 0;
  const latFixed = Math.round(lat * 1000000);
  view.setInt32(10, latFixed, false);

  // Bytes 14..17: Longitude (fixed-point * 1e6)
  const lng = alert.location?.longitude ?? alert.longitude ?? alert.lng ?? 0;
  const lngFixed = Math.round(lng * 1000000);
  view.setInt32(14, lngFixed, false);

  // Byte 18: Freshness Flag (Bit 7: 1 if LAST_KNOWN) | Accuracy (Bits 0..6: 0-127m)
  const isLastKnown = (alert.location?.source || alert.location_source) === 'LAST_KNOWN';
  const accuracy = Math.min(127, Math.round(alert.location?.accuracy_meters ?? alert.accuracy_meters ?? 15));
  buf[18] = (isLastKnown ? 0x80 : 0x00) | (accuracy & 0x7F);

  // Bytes 19..20: Timestamp (minutes since epoch anchor)
  const alertTimeMs = alert.created_at ? new Date(alert.created_at).getTime() : Date.now();
  const minutesSinceAnchor = Math.max(0, Math.min(65535, Math.floor((alertTimeMs - EPOCH_ANCHOR_MS) / (60 * 1000))));
  view.setUint16(19, minutesSinceAnchor, false);

  // Bytes 21..23: Integrity Checksum (24-bit CRC)
  const checksum = computeChecksum24(buf, 21);
  buf[21] = (checksum >> 16) & 0xFF;
  buf[22] = (checksum >> 8) & 0xFF;
  buf[23] = checksum & 0xFF;

  return buf;
}

/**
 * Decodes a 24-byte binary BLE advertisement payload into an emergency object.
 */
export function decodeBleEmergencyAdv(buf) {
  if (!buf || buf.length < 24) {
    throw new Error(`Invalid BLE advertisement length: expected 24 bytes, received ${buf?.length || 0}`);
  }

  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // Verify Checksum
  const expectedChecksum = ((bytes[21] << 16) | (bytes[22] << 8) | bytes[23]) >>> 0;
  const actualChecksum = computeChecksum24(bytes, 21);
  const isValidChecksum = expectedChecksum === actualChecksum;

  // Byte 0
  const version = (bytes[0] >> 4) & 0x0F;
  const msgTypeCode = bytes[0] & 0x0F;

  // Byte 1
  const urgencyCode = (bytes[1] >> 6) & 0x03;
  const categoryCode = (bytes[1] >> 2) & 0x0F;
  const ttl = bytes[1] & 0x03;

  // Reverse mapping
  const urgencyKeys = Object.keys(BLE_URGENCY_CODES);
  const urgency = urgencyKeys.find(k => BLE_URGENCY_CODES[k] === urgencyCode) || 'MODERATE';

  const categoryKeys = Object.keys(BLE_CATEGORY_CODES);
  const category = categoryKeys.find(k => BLE_CATEGORY_CODES[k] === categoryCode) || 'GENERAL';

  // Bytes 2..9: Short Alert ID
  const shortIdNum = view.getBigUint64(2, false);
  const alert_id = `ble-${shortIdNum.toString(16).padStart(16, '0')}`;

  // Bytes 10..13: Lat
  const lat = view.getInt32(10, false) / 1000000;

  // Bytes 14..17: Lng
  const lng = view.getInt32(14, false) / 1000000;

  // Byte 18: Freshness & Accuracy
  const isLastKnown = (bytes[18] & 0x80) !== 0;
  const accuracy = bytes[18] & 0x7F;

  // Bytes 19..20: Timestamp
  const minutesSinceAnchor = view.getUint16(19, false);
  const timestampIso = new Date(EPOCH_ANCHOR_MS + minutesSinceAnchor * 60 * 1000).toISOString();

  const msgType = Object.keys(BLE_MSG_TYPES).find(k => BLE_MSG_TYPES[k] === msgTypeCode) || 'DISTRESS_SOS';

  return {
    protocol_version: version,
    alert_id,
    id: alert_id,
    type: msgType,
    urgency,
    category,
    ttl,
    location: {
      latitude: lat,
      longitude: lng,
      location_link: `https://www.google.com/maps?q=${lat},${lng}`,
      source: isLastKnown ? 'LAST_KNOWN' : 'CURRENT',
      timestamp: timestampIso,
      accuracy_meters: accuracy
    },
    created_at: timestampIso,
    is_valid_checksum: isValidChecksum,
    raw_bytes_len: 24
  };
}

/**
 * Encodes a compact Responder Acceptance / En-Route Status update into 24 bytes.
 */
export function encodeBleAcceptanceAdv({ alert_id, responder_id, status = 'ACCEPTED', eta_minutes = 15 }) {
  const buf = new Uint8Array(24);
  const view = new DataView(buf.buffer);

  // Byte 0: Version 1 | Message Type (ACCEPTANCE = 2, EN_ROUTE = 3)
  const msgType = status === 'EN ROUTE' ? BLE_MSG_TYPES.EN_ROUTE : BLE_MSG_TYPES.ACCEPTANCE;
  buf[0] = 0x10 | (msgType & 0x0F);

  // Byte 1: ETA in minutes (clamped to 255)
  buf[1] = Math.min(255, Math.max(0, Math.round(eta_minutes)));

  // Bytes 2..9: Target Alert ID (64-bit int)
  let alertHash = 0n;
  for (let i = 0; i < (alert_id || '').length; i++) {
    alertHash = (alertHash * 31n + BigInt(alert_id.charCodeAt(i))) & 0xFFFFFFFFFFFFFFFFn;
  }
  view.setBigUint64(2, alertHash, false);

  // Bytes 10..17: Responder ID (64-bit hash)
  let respHash = 0n;
  for (let i = 0; i < (responder_id || '').length; i++) {
    respHash = (respHash * 31n + BigInt(responder_id.charCodeAt(i))) & 0xFFFFFFFFFFFFFFFFn;
  }
  view.setBigUint64(10, respHash, false);

  // Bytes 18..20: Timestamp
  const nowMs = Date.now();
  const minutesSinceAnchor = Math.max(0, Math.min(65535, Math.floor((nowMs - EPOCH_ANCHOR_MS) / (60 * 1000))));
  view.setUint16(18, minutesSinceAnchor, false);

  // Byte 20: Status code
  buf[20] = status === 'EN ROUTE' ? 2 : 1;

  // Bytes 21..23: Checksum
  const checksum = computeChecksum24(buf, 21);
  buf[21] = (checksum >> 16) & 0xFF;
  buf[22] = (checksum >> 8) & 0xFF;
  buf[23] = checksum & 0xFF;

  return buf;
}

/**
 * Decodes a 24-byte BLE Acceptance packet.
 */
export function decodeBleAcceptanceAdv(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const msgTypeCode = bytes[0] & 0x0F;
  const etaMinutes = bytes[1];
  const alertHash = view.getBigUint64(2, false);
  const respHash = view.getBigUint64(10, false);
  const minutesSinceAnchor = view.getUint16(18, false);
  const statusCode = bytes[20];

  const status = statusCode === 2 ? 'EN ROUTE' : 'ACCEPTED';
  const timestampIso = new Date(EPOCH_ANCHOR_MS + minutesSinceAnchor * 60 * 1000).toISOString();

  return {
    type: msgTypeCode === BLE_MSG_TYPES.EN_ROUTE ? 'EN_ROUTE' : 'ACCEPTANCE',
    alert_hash: alertHash.toString(16),
    responder_hash: respHash.toString(16),
    status,
    eta_minutes: etaMinutes,
    timestamp: timestampIso
  };
}
