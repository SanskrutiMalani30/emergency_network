/**
 * RESQMesh — Persistent Client-Side Offline Storage (IndexedDB)
 *
 * Provides resilient offline-first persistence surviving tab closes, browser restarts,
 * and air-gapped emergency environments:
 * 1. Outbox Queue with stable UUIDs, delivery states, and retry counts
 * 2. Cached Incidents/Emergencies, Responders, and Hazards for instant offline dashboard boot
 * 3. Audio Blob Storage for voice evidence
 */

const DB_NAME = 'resqmesh_offline_db';
const DB_VERSION = 7;

export const STORES = {
  OUTBOX: 'outbox',
  EMERGENCIES: 'cached_emergencies',
  RESPONDERS: 'cached_responders',
  HAZARDS: 'cached_hazards',
  AUDIT_LOGS: 'offline_audit_logs',
  LOCATION_HISTORY: 'location_history',
  BLE_PACKETS: 'ble_packets',
  AUTH_CREDENTIALS: 'auth_credentials',
  MAP_TILES: 'cached_map_tiles',
  MULTI_HOP_MESSAGES: 'multihop_messages',
  MULTI_HOP_ACKS: 'multihop_acks'
};

// Open or upgrade IndexedDB
function openDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      console.warn('IndexedDB not supported in this browser environment.');
      resolve(null);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORES.OUTBOX)) {
        const outboxStore = db.createObjectStore(STORES.OUTBOX, { keyPath: 'client_message_id' });
        outboxStore.createIndex('status', 'status', { unique: false });
        outboxStore.createIndex('created_at', 'created_at', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.EMERGENCIES)) {
        const emgStore = db.createObjectStore(STORES.EMERGENCIES, { keyPath: 'emergency_id' });
        emgStore.createIndex('urgency', 'urgency', { unique: false });
        emgStore.createIndex('assistance_status', 'assistance_status', { unique: false });
        emgStore.createIndex('created_at', 'created_at', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.RESPONDERS)) {
        db.createObjectStore(STORES.RESPONDERS, { keyPath: 'responder_id' });
      }
      if (!db.objectStoreNames.contains(STORES.HAZARDS)) {
        db.createObjectStore(STORES.HAZARDS, { keyPath: 'hazard_id' });
      }
      if (!db.objectStoreNames.contains(STORES.AUDIT_LOGS)) {
        db.createObjectStore(STORES.AUDIT_LOGS, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORES.LOCATION_HISTORY)) {
        const locStore = db.createObjectStore(STORES.LOCATION_HISTORY, { keyPath: 'id', autoIncrement: true });
        locStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.BLE_PACKETS)) {
        const bleStore = db.createObjectStore(STORES.BLE_PACKETS, { keyPath: 'alert_id' });
        bleStore.createIndex('urgency', 'urgency', { unique: false });
        bleStore.createIndex('status', 'status', { unique: false });
        bleStore.createIndex('created_at', 'created_at', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.AUTH_CREDENTIALS)) {
        db.createObjectStore(STORES.AUTH_CREDENTIALS, { keyPath: 'email' });
      }
      if (!db.objectStoreNames.contains(STORES.MAP_TILES)) {
        const tileStore = db.createObjectStore(STORES.MAP_TILES, { keyPath: 'key' });
        tileStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.MULTI_HOP_MESSAGES)) {
        const msgStore = db.createObjectStore(STORES.MULTI_HOP_MESSAGES, { keyPath: 'message_id' });
        msgStore.createIndex('urgency', 'urgency', { unique: false });
        msgStore.createIndex('delivery_status', 'delivery_status', { unique: false });
        msgStore.createIndex('created_at', 'created_at', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.MULTI_HOP_ACKS)) {
        const ackStore = db.createObjectStore(STORES.MULTI_HOP_ACKS, { keyPath: 'message_id' });
        ackStore.createIndex('server_received_at', 'server_received_at', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      const db = event.target.result;
      db.onversionchange = () => {
        try { db.close(); } catch (e) {}
      };
      resolve(db);
    };

    request.onblocked = () => {
      console.warn('IndexedDB upgrade blocked by another connection.');
      resolve(null);
    };

    request.onerror = (event) => {
      console.error('IndexedDB open error:', event.target.error);
      resolve(null);
    };
  });
}

// Generate persistent UUID for offline outbox messages
export function generateUUID() {
  if (crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'msg-' + Math.random().toString(36).substring(2, 11) + '-' + Date.now();
}

/**
 * Save report to client outbox
 * Delivery States: 'LOCAL_ONLY' | 'QUEUED' | 'SENT_TO_PEER' | 'ACKNOWLEDGED' | 'FAILED'
 */
export async function queueOutboxReport(report) {
  const db = await openDatabase();
  if (!db) return null;

  const client_message_id = report.client_message_id || generateUUID();
  const entry = {
    client_message_id,
    created_at: new Date().toISOString(),
    status: report.initial_status || 'QUEUED',
    payload: {
      raw_text: report.raw_text,
      lat: report.lat,
      lng: report.lng,
      location_accuracy_meters: report.location_accuracy_meters || 20,
      reporter_node_id: report.reporter_node_id || 'peer-citizen-' + Math.floor(Math.random() * 900 + 100),
      client_message_id,
      detected_language: report.detected_language || 'en',
      audio_metadata: report.audio_metadata || null,
      audio_evidence: report.audio_evidence || null
    },
    retry_count: 0,
    last_attempt_at: null,
    error_message: null
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.OUTBOX], 'readwrite');
    const store = tx.objectStore(STORES.OUTBOX);
    const req = store.put(entry);

    req.onsuccess = () => resolve(entry);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Retrieve all reports currently in outbox
 */
export async function getOutboxReports() {
  const db = await openDatabase();
  if (!db) return [];

  return new Promise((resolve) => {
    const tx = db.transaction([STORES.OUTBOX], 'readonly');
    const store = tx.objectStore(STORES.OUTBOX);
    const req = store.getAll();

    req.onsuccess = () => {
      const reports = req.result || [];
      // Sort newest first
      reports.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      resolve(reports);
    };
    req.onerror = () => resolve([]);
  });
}

/**
 * Update outbox item status
 */
export async function updateOutboxItem(client_message_id, updates) {
  const db = await openDatabase();
  if (!db) return null;

  return new Promise((resolve) => {
    const tx = db.transaction([STORES.OUTBOX], 'readwrite');
    const store = tx.objectStore(STORES.OUTBOX);
    const req = store.get(client_message_id);

    req.onsuccess = () => {
      const item = req.result;
      if (!item) {
        resolve(null);
        return;
      }
      const updated = { ...item, ...updates, last_attempt_at: new Date().toISOString() };
      store.put(updated);
      resolve(updated);
    };
    req.onerror = () => resolve(null);
  });
}

/**
 * Remove an item from outbox (e.g. after successful acknowledgment or user cancellation)
 */
export async function deleteOutboxItem(client_message_id) {
  const db = await openDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    const tx = db.transaction([STORES.OUTBOX], 'readwrite');
    const store = tx.objectStore(STORES.OUTBOX);
    const req = store.delete(client_message_id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => resolve(false);
  });
}

/**
 * Synchronize outbox reports with backend ScyllaDB server
 */
export async function syncOutboxWithServer(syncApiFn) {
  const reports = await getOutboxReports();
  const pending = reports.filter(r => r.status === 'QUEUED' || r.status === 'LOCAL_ONLY' || r.status === 'FAILED');

  if (pending.length === 0) {
    return { synced: 0, pending: 0, errors: [] };
  }

  const batchPayload = pending.map(r => r.payload);

  try {
    const res = await syncApiFn(batchPayload);

    // Update outbox items based on server response
    if (res && res.synced) {
      for (const s of res.synced) {
        await updateOutboxItem(s.client_message_id, {
          status: 'ACKNOWLEDGED',
          server_emergency_id: s.emergency_id,
          error_message: null
        });
      }
    }
    if (res && res.deduplicated) {
      for (const d of res.deduplicated) {
        await updateOutboxItem(d.client_message_id, {
          status: 'ACKNOWLEDGED',
          server_emergency_id: d.emergency_id,
          error_message: 'Deduplicated by server'
        });
      }
    }
    if (res && res.errors) {
      for (const e of res.errors) {
        const item = pending.find(p => p.client_message_id === e.client_message_id);
        const retries = (item?.retry_count || 0) + 1;
        await updateOutboxItem(e.client_message_id, {
          status: retries >= 3 ? 'FAILED' : 'QUEUED',
          retry_count: retries,
          error_message: e.error
        });
      }
    }

    return {
      synced: (res?.synced_count || 0) + (res?.deduplicated_count || 0),
      pending: pending.length - ((res?.synced_count || 0) + (res?.deduplicated_count || 0)),
      errors: res?.errors || []
    };
  } catch (err) {
    // If sync failed completely (e.g. still offline)
    for (const p of pending) {
      await updateOutboxItem(p.client_message_id, {
        retry_count: (p.retry_count || 0) + 1,
        last_attempt_at: new Date().toISOString()
      });
    }
    return { synced: 0, pending: pending.length, error: err.message };
  }
}

/**
 * Cache snapshot data for instant offline dashboard reload
 */
export async function cacheEntities(storeName, items) {
  const db = await openDatabase();
  if (!db || !items || !Array.isArray(items)) return;

  const validStore = STORES[storeName.toUpperCase()] || storeName;
  const tx = db.transaction([validStore], 'readwrite');
  const store = tx.objectStore(validStore);
  store.clear();
  items.forEach(item => store.put(item));
}

/**
 * Retrieve cached entities for offline display
 */
export async function getCachedEntities(storeName) {
  const db = await openDatabase();
  if (!db) return [];

  const validStore = STORES[storeName.toUpperCase()] || storeName;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction([validStore], 'readonly');
      const store = tx.objectStore(validStore);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    } catch (e) {
      resolve([]);
    }
  });
}

/**
 * =========================================================================
 * SECTION 8 CANONICAL EMERGENCY RECORD PERSISTENCE (IndexedDB)
 * =========================================================================
 */

/**
 * Normalizes an emergency incident to strictly adhere to the Section 8 Emergency Data Model
 * while maintaining backward compatibility with legacy property names.
 */
export function normalizeEmergencyRecord(raw = {}) {
  const id = raw.id || raw.emergency_id || generateUUID();
  const nowIso = new Date().toISOString();

  const lat = raw.location?.latitude ?? raw.lat ?? null;
  const lng = raw.location?.longitude ?? raw.lng ?? null;
  const locationLink = raw.location?.location_link || raw.location_link || (
    lat !== null && lng !== null ? `https://www.google.com/maps?q=${lat},${lng}` : null
  );

  const urgencyRaw = String(raw.urgency || raw.severity || 'MODERATE').toUpperCase();
  const urgencyNorm = ['CRITICAL', 'HIGH', 'MODERATE', 'LOW'].includes(urgencyRaw)
    ? urgencyRaw
    : (raw.urgency >= 8 ? 'CRITICAL' : raw.urgency >= 6 ? 'HIGH' : 'MODERATE');

  const assistanceStatus = raw.assistance_status || raw.status || 'OPEN';

  const helpNeeded = Array.isArray(raw.help_needed)
    ? raw.help_needed
    : (Array.isArray(raw.required_capabilities) ? raw.required_capabilities : []);

  const acceptedResponders = Array.isArray(raw.accepted_responders) ? raw.accepted_responders : [];
  const assignedResponderId = raw.assigned_responder_id || (acceptedResponders[0]?.responder_id || null);

  return {
    // Section 8 Canonical Model
    id,
    reporter_id: raw.reporter_id || raw.reporter_node_id || 'peer-anonymous',
    category: (raw.category || 'GENERAL').toUpperCase(),
    description: raw.description || raw.raw_message || 'Emergency assistance requested',
    urgency: urgencyNorm,
    verification_status: raw.verification_status || 'UNVERIFIED',
    help_needed: helpNeeded,
    location: {
      latitude: lat,
      longitude: lng,
      location_link: locationLink,
      source: raw.location?.source || raw.location_source || (lat ? 'CURRENT' : 'LAST_KNOWN'),
      timestamp: raw.location?.timestamp || raw.location_timestamp || nowIso,
      age_seconds: raw.location?.age_seconds ?? raw.location_age_seconds ?? 0,
      accuracy_meters: raw.location?.accuracy_meters ?? raw.location_accuracy_meters ?? 15
    },
    created_at: raw.created_at || raw.reported_at || nowIso,
    broadcast_status: raw.broadcast_status || 'PENDING',
    matched_responders: Array.isArray(raw.matched_responders) ? raw.matched_responders : [],
    accepted_responders: acceptedResponders,
    assistance_status: assistanceStatus,
    last_updated_at: raw.last_updated_at || nowIso,

    // Legacy and UI Convenience Bindings
    emergency_id: id,
    raw_message: raw.description || raw.raw_message || 'Emergency assistance requested',
    severity: urgencyNorm,
    status: assistanceStatus,
    lat,
    lng,
    location_link: locationLink,
    location_source: raw.location?.source || raw.location_source || (lat ? 'CURRENT' : 'LAST_KNOWN'),
    location_accuracy_meters: raw.location?.accuracy_meters ?? raw.location_accuracy_meters ?? 15,
    required_capabilities: helpNeeded,
    confidence_score: raw.confidence_score ?? 0.85,
    ai_explanation: raw.ai_explanation || raw.reason || null,
    assigned_responder_id: assignedResponderId,
    landmark: raw.landmark || null,
    client_message_id: raw.client_message_id || null
  };
}

/**
 * Persists an emergency record locally in IndexedDB without clearing existing records.
 */
export async function saveEmergencyRecord(record) {
  const db = await openDatabase();
  const normalized = normalizeEmergencyRecord(record);
  if (!db) return normalized;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORES.EMERGENCIES], 'readwrite');
      const store = tx.objectStore(STORES.EMERGENCIES);
      const req = store.put(normalized);
      req.onsuccess = () => resolve(normalized);
      req.onerror = (e) => {
        console.warn('Failed to save emergency record to IndexedDB:', e);
        resolve(normalized);
      };
    } catch (err) {
      console.warn('saveEmergencyRecord error:', err);
      resolve(normalized);
    }
  });
}

/**
 * Retrieves all stored emergencies from IndexedDB, sorted newest or critical first.
 */
export async function getStoredEmergencies() {
  const db = await openDatabase();
  if (!db) return [];

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORES.EMERGENCIES], 'readonly');
      const store = tx.objectStore(STORES.EMERGENCIES);
      const req = store.getAll();
      req.onsuccess = () => {
        const list = (req.result || []).map(normalizeEmergencyRecord);
        // Sort newest first
        list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        resolve(list);
      };
      req.onerror = () => resolve([]);
    } catch (e) {
      resolve([]);
    }
  });
}

/**
 * Retrieves a single emergency by ID.
 */
export async function getEmergencyById(id) {
  const db = await openDatabase();
  if (!db || !id) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORES.EMERGENCIES], 'readonly');
      const store = tx.objectStore(STORES.EMERGENCIES);
      const req = store.get(id);
      req.onsuccess = () => {
        resolve(req.result ? normalizeEmergencyRecord(req.result) : null);
      };
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

/**
 * Updates status or responder acceptance fields on a stored emergency.
 */
export async function updateEmergencyStatus(id, updates = {}) {
  const db = await openDatabase();
  if (!db || !id) return null;

  const existing = await getEmergencyById(id);
  if (!existing) return null;

  const merged = normalizeEmergencyRecord({
    ...existing,
    ...updates,
    last_updated_at: new Date().toISOString()
  });

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORES.EMERGENCIES], 'readwrite');
      const store = tx.objectStore(STORES.EMERGENCIES);
      const req = store.put(merged);
      req.onsuccess = () => resolve(merged);
      req.onerror = () => resolve(merged);
    } catch (e) {
      resolve(merged);
    }
  });
}

/**
 * Merges remote emergencies into the local IndexedDB store without erasing locally-created,
 * un-synced reports.
 */
export async function mergeStoredEmergencies(remoteList = []) {
  const db = await openDatabase();
  if (!db) return remoteList.map(normalizeEmergencyRecord);

  const localList = await getStoredEmergencies();
  const localMap = new Map();
  localList.forEach(e => {
    localMap.set(e.id, e);
    if (e.client_message_id) localMap.set(e.client_message_id, e);
  });

  const mergedMap = new Map(localMap);

  for (const remote of remoteList) {
    const normRemote = normalizeEmergencyRecord(remote);
    const existing = mergedMap.get(normRemote.id) || (normRemote.client_message_id ? mergedMap.get(normRemote.client_message_id) : null);

    if (existing) {
      // Retain local client_message_id and merge server updates (e.g. verified status, server assigned responders)
      const merged = normalizeEmergencyRecord({
        ...existing,
        ...normRemote,
        // Preserve local broadcast status if already broadcasting
        broadcast_status: existing.broadcast_status || normRemote.broadcast_status,
        last_updated_at: new Date().toISOString()
      });
      mergedMap.set(merged.id, merged);
    } else {
      mergedMap.set(normRemote.id, normRemote);
    }
  }

  const result = Array.from(mergedMap.values());
  result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Save merged set back to IndexedDB
  try {
    const tx = db.transaction([STORES.EMERGENCIES], 'readwrite');
    const store = tx.objectStore(STORES.EMERGENCIES);
    result.forEach(item => store.put(item));
  } catch (err) {
    console.warn('Failed to bulk-write merged emergencies:', err);
  }

  return result;
}

/**
 * =========================================================================
 * OFFLINE AUTHENTICATION CREDENTIAL STORE (Web Crypto Non-Reversible Verifiers)
 * =========================================================================
 */

export const DEFAULT_SEED_CREDENTIALS = [
  {
    email: 'amulya@resqmesh.net',
    username: 'amulya',
    display_name: 'Amulya Yadav (CERT)',
    user_id: 'usr-amulya-yadav',
    role: 'responder',
    responder_status: 'ACTIVE_RESPONDER',
    skills: ['amateur_radio_hf', 'cert_disaster_coordinator', 'first_aid', 'mesh_operator'],
    verifier_salt: '5cffb47ab87ca021d598395b1267c226',
    verifier_hash: '89f96f3393cd5310044f84f10105846895223d99cb217d7f4c551df0232fc2de',
    verifier_iterations: 100000
  },
  {
    email: 'radhika@resqmesh.net',
    username: 'dr_radhika',
    display_name: 'Dr. Radhika Sharma',
    user_id: 'usr-radhika-sharma',
    role: 'responder',
    responder_status: 'ACTIVE_RESPONDER',
    skills: ['trauma_triage', 'advanced_cardiac_life_support', 'emergency_medicine', 'telemedicine'],
    verifier_salt: 'ceb7eb74a248d485264150871c408161',
    verifier_hash: 'c15246ca36bd3aecc2de0b09a6ac0ada01c77a06729ac347de0265fe2c47cd1e',
    verifier_iterations: 100000
  },
  {
    email: 'citizen@resqmesh.net',
    username: 'priya',
    display_name: 'Priya Sharma (Citizen)',
    user_id: 'usr-priya-citizen',
    role: 'citizen',
    responder_status: 'CITIZEN',
    skills: ['cpr_certified', 'local_guide'],
    verifier_salt: '58f4e01b80ad6c7cefbf49729073e137',
    verifier_hash: 'f296d0bcc6e9f561f8efb16304737acc22ee433825d502970dc78b6e00239333',
    verifier_iterations: 100000
  }
];

export async function saveAuthCredential(credential) {
  try {
    const db = await openDatabase();
    if (!db || !credential?.email) return null;

    if (!db.objectStoreNames.contains(STORES.AUTH_CREDENTIALS)) {
      return null;
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORES.AUTH_CREDENTIALS], 'readwrite');
        const store = tx.objectStore(STORES.AUTH_CREDENTIALS);
        const req = store.put({
          email: credential.email.toLowerCase().trim(),
          username: credential.username || credential.email,
          display_name: credential.display_name || credential.username,
          user_id: credential.user_id,
          role: credential.role || 'citizen',
          responder_status: credential.responder_status || 'CITIZEN',
          skills: credential.skills || [],
          // Salted PBKDF2 verifier hash (non-reversible)
          verifier_hash: credential.verifier_hash,
          verifier_salt: credential.verifier_salt,
          verifier_iterations: credential.verifier_iterations || 100000,
          registered_at: credential.registered_at || new Date().toISOString(),
          last_login_at: new Date().toISOString(),
          offline_lease_expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        });
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  } catch (err) {
    return null;
  }
}

export async function getAuthCredential(identifier) {
  const clean = (identifier || '').toLowerCase().trim();
  if (!clean) return null;

  try {
    const db = await openDatabase();
    if (db && db.objectStoreNames.contains(STORES.AUTH_CREDENTIALS)) {
      const cred = await new Promise((resolve) => {
        try {
          const tx = db.transaction([STORES.AUTH_CREDENTIALS], 'readonly');
          const store = tx.objectStore(STORES.AUTH_CREDENTIALS);
          const req = store.getAll();
          req.onsuccess = () => {
            const all = req.result || [];
            const match = all.find(c => c.email === clean || (c.username && c.username.toLowerCase() === clean));
            resolve(match || null);
          };
          req.onerror = () => resolve(null);
        } catch (e) {
          resolve(null);
        }
      });
      if (cred) return cred;
    }
  } catch (e) {}

  // Fallback to pre-seeded credentials for immediate offline readiness
  const seedMatch = DEFAULT_SEED_CREDENTIALS.find(
    c => c.email === clean || c.username.toLowerCase() === clean
  );

  if (seedMatch) {
    const credWithLease = {
      ...seedMatch,
      registered_at: new Date().toISOString(),
      last_login_at: new Date().toISOString(),
      offline_lease_expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };
    // Cache into IndexedDB for persistence
    saveAuthCredential(credWithLease).catch(() => {});
    return credWithLease;
  }

  return null;
}

export async function getAllAuthCredentials() {
  const db = await openDatabase();
  if (!db) return [];

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORES.AUTH_CREDENTIALS], 'readonly');
      const store = tx.objectStore(STORES.AUTH_CREDENTIALS);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    } catch (e) {
      resolve([]);
    }
  });
}

/**
 * =========================================================================
 * LOCATION HISTORY (Persistent Local GPS Fixes)
 * =========================================================================
 */

/**
 * Saves a successful GPS fix to IndexedDB location history and localStorage cache.
 */
export async function saveLocationFix(input = {}) {
  const latitude = input.latitude ?? input.lat;
  const longitude = input.longitude ?? input.lng;
  const accuracy_meters = input.accuracy_meters ?? input.accuracy;
  const measuredAt = input.measured_at || input.timestamp || new Date().toISOString();
  const savedAt = new Date().toISOString();

  const fix = {
    latitude: Number(latitude),
    longitude: Number(longitude),
    lat: Number(latitude),
    lng: Number(longitude),
    accuracy_meters: Math.round(accuracy_meters || 15),
    accuracy: Math.round(accuracy_meters || 15),
    timestamp: measuredAt,
    measured_at: measuredAt,
    saved_at: savedAt,
    is_fresh: true
  };

  // Immediate synchronous fallback storage
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem('resqmesh_last_location_fix', JSON.stringify(fix));
    } catch (e) {}
  }

  const db = await openDatabase();
  if (!db) return fix;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORES.LOCATION_HISTORY], 'readwrite');
      const store = tx.objectStore(STORES.LOCATION_HISTORY);
      const req = store.add(fix);
      req.onsuccess = () => resolve(fix);
      req.onerror = () => resolve(fix);
    } catch (e) {
      resolve(fix);
    }
  });
}

/**
 * Retrieves the most recent confirmed GPS fix from local IndexedDB storage or localStorage fallback.
 */
export async function getLastKnownLocationFix() {
  const db = await openDatabase();
  if (!db) {
    if (typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem('resqmesh_last_location_fix');
        if (stored) return JSON.parse(stored);
      } catch (e) {}
    }
    return null;
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORES.LOCATION_HISTORY], 'readonly');
      const store = tx.objectStore(STORES.LOCATION_HISTORY);
      const req = store.getAll();
      req.onsuccess = () => {
        const fixes = req.result || [];
        if (fixes.length === 0) {
          if (typeof localStorage !== 'undefined') {
            try {
              const stored = localStorage.getItem('resqmesh_last_location_fix');
              if (stored) {
                resolve(JSON.parse(stored));
                return;
              }
            } catch (e) {}
          }
          resolve(null);
          return;
        }
        // Sort newest first
        fixes.sort((a, b) => new Date(b.measured_at || b.timestamp).getTime() - new Date(a.measured_at || a.timestamp).getTime());
        const latest = fixes[0];
        latest.is_fresh = false;
        resolve(latest);
      };
      req.onerror = () => {
        if (typeof localStorage !== 'undefined') {
          try {
            const stored = localStorage.getItem('resqmesh_last_location_fix');
            if (stored) return resolve(JSON.parse(stored));
          } catch (e) {}
        }
        resolve(null);
      };
    } catch (e) {
      if (typeof localStorage !== 'undefined') {
        try {
          const stored = localStorage.getItem('resqmesh_last_location_fix');
          if (stored) return resolve(JSON.parse(stored));
        } catch (err) {}
      }
      resolve(null);
    }
  });
}

/**
 * =========================================================================
 * BLE EMERGENCY PACKETS & RETRY QUEUE
 * =========================================================================
 */

/**
 * Saves or updates a Bluetooth Emergency Alert Packet in IndexedDB.
 */
export async function saveBlePacket(packet) {
  const db = await openDatabase();
  if (!db) return packet;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORES.BLE_PACKETS], 'readwrite');
      const store = tx.objectStore(STORES.BLE_PACKETS);
      store.put(packet);
      tx.oncomplete = () => resolve(packet);
      tx.onerror = () => resolve(packet);
    } catch (e) {
      resolve(packet);
    }
  });
}

/**
 * Retrieves all stored BLE Emergency Alert Packets from IndexedDB.
 */
export async function getBlePackets() {
  const db = await openDatabase();
  if (!db) return [];

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORES.BLE_PACKETS], 'readonly');
      const store = tx.objectStore(STORES.BLE_PACKETS);
      const req = store.getAll();
      req.onsuccess = () => {
        const packets = req.result || [];
        packets.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        resolve(packets);
      };
      req.onerror = () => resolve([]);
    } catch (e) {
      resolve([]);
    }
  });
}

/**
 * Updates status of a stored BLE packet (e.g. 'PENDING', 'TRANSMITTING', 'ACKNOWLEDGED', 'FAILED').
 */
export async function updateBlePacketStatus(alert_id, status, error = null) {
  const db = await openDatabase();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORES.BLE_PACKETS], 'readwrite');
      const store = tx.objectStore(STORES.BLE_PACKETS);
      const req = store.get(alert_id);
      req.onsuccess = () => {
        const item = req.result;
        if (!item) {
          resolve(null);
          return;
        }
        item.status = status;
        item.last_updated_at = new Date().toISOString();
        if (error) item.error = error;
        store.put(item);
        resolve(item);
      };
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

/**
 * Saves a map tile blob to IndexedDB
 * @param {string} key - Unique tile key e.g. "osm:14/11795/7289"
 * @param {Blob} blob - Raster tile image blob
 * @param {string} contentType - Mime type e.g. "image/png"
 */
export async function saveCachedTile(key, blob, contentType = 'image/png') {
  const db = await openDatabase();
  if (!db) return false;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORES.MAP_TILES], 'readwrite');
      const store = tx.objectStore(STORES.MAP_TILES);
      store.put({
        key,
        blob,
        contentType,
        size: blob ? blob.size : 0,
        timestamp: Date.now()
      });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });
}

/**
 * Retrieves a cached map tile blob by key
 * @param {string} key
 * @returns {Promise<Blob|null>}
 */
export async function getCachedTile(key) {
  const db = await openDatabase();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORES.MAP_TILES], 'readonly');
      const store = tx.objectStore(STORES.MAP_TILES);
      const req = store.get(key);
      req.onsuccess = () => {
        if (req.result && req.result.blob) {
          resolve(req.result.blob);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

/**
 * Gets count and total estimated size of cached map tiles
 * @returns {Promise<{ count: number, totalBytes: number }>}
 */
export async function getCachedTileStats() {
  const db = await openDatabase();
  if (!db) return { count: 0, totalBytes: 0 };

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORES.MAP_TILES], 'readonly');
      const store = tx.objectStore(STORES.MAP_TILES);
      const req = store.getAll();
      req.onsuccess = () => {
        const tiles = req.result || [];
        let totalBytes = 0;
        for (const t of tiles) {
          totalBytes += (t.size || (t.blob && t.blob.size) || 0);
        }
        resolve({ count: tiles.length, totalBytes });
      };
      req.onerror = () => resolve({ count: 0, totalBytes: 0 });
    } catch (e) {
      resolve({ count: 0, totalBytes: 0 });
    }
  });
}

/**
 * Clears all cached map tiles from IndexedDB
 */
export async function clearCachedTiles() {
  const db = await openDatabase();
  if (!db) return false;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORES.MAP_TILES], 'readwrite');
      const store = tx.objectStore(STORES.MAP_TILES);
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });
}

// ==================== MULTI-HOP SOS PACKET STORAGE ====================

/**
 * Saves or updates a multi-hop SOS packet in IndexedDB
 */
export async function saveMultiHopMessage(msg) {
  const db = await openDatabase();
  if (!db) return msg;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORES.MULTI_HOP_MESSAGES], 'readwrite');
      const store = tx.objectStore(STORES.MULTI_HOP_MESSAGES);
      store.put(msg);
      tx.oncomplete = () => resolve(msg);
      tx.onerror = () => resolve(msg);
    } catch (e) {
      resolve(msg);
    }
  });
}

/**
 * Retrieves all saved multi-hop SOS packets from IndexedDB
 */
export async function getMultiHopMessages() {
  const db = await openDatabase();
  if (!db) return [];

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORES.MULTI_HOP_MESSAGES], 'readonly');
      const store = tx.objectStore(STORES.MULTI_HOP_MESSAGES);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    } catch (e) {
      resolve([]);
    }
  });
}

/**
 * Updates the delivery status of a multi-hop SOS packet
 */
export async function updateMultiHopStatus(messageId, deliveryStatus, extra = {}) {
  const db = await openDatabase();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORES.MULTI_HOP_MESSAGES], 'readwrite');
      const store = tx.objectStore(STORES.MULTI_HOP_MESSAGES);
      const req = store.get(messageId);
      req.onsuccess = () => {
        const item = req.result;
        if (!item) {
          resolve(null);
          return;
        }
        item.delivery_status = deliveryStatus;
        item.last_updated_at = new Date().toISOString();
        Object.assign(item, extra);
        store.put(item);
        resolve(item);
      };
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

/**
 * Stores a server ACK in IndexedDB
 */
export async function saveMultiHopAck(ack) {
  const db = await openDatabase();
  if (!db) return ack;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORES.MULTI_HOP_ACKS], 'readwrite');
      const store = tx.objectStore(STORES.MULTI_HOP_ACKS);
      store.put(ack);
      tx.oncomplete = () => resolve(ack);
      tx.onerror = () => resolve(ack);
    } catch (e) {
      resolve(ack);
    }
  });
}

/**
 * Retrieves all stored multi-hop server ACKs
 */
export async function getMultiHopAcks() {
  const db = await openDatabase();
  if (!db) return [];

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORES.MULTI_HOP_ACKS], 'readonly');
      const store = tx.objectStore(STORES.MULTI_HOP_ACKS);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    } catch (e) {
      resolve([]);
    }
  });
}



