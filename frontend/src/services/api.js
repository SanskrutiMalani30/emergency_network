/**
 * RESQMesh — Client API Service
 * Interacts with the Python FastAPI backend and ScyllaDB data layer.
 */

export const API_BASE = '/api';

export async function fetchHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`);
    return await res.json();
  } catch (err) {
    return { status: 'offline', database: { connected: false } };
  }
}

export async function fetchMyLocationTelemetry(lat = null, lng = null, accuracy = 15.0) {
  try {
    const params = new URLSearchParams();
    if (lat !== null) params.append('lat', lat);
    if (lng !== null) params.append('lng', lng);
    if (accuracy !== null) params.append('accuracy', accuracy);
    const res = await fetch(`${API_BASE}/resqmesh/my-location?${params.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    return {
      status: 'offline',
      coords: { lat: lat || 21.1420, lng: lng || 79.0800, accuracy_meters: accuracy || 15 },
      locality: 'Offline Local Sector (Browser Cache)',
      nearest_responder: null,
      nearest_hazard: null
    };
  }
}

export async function relocateScenario(lat, lng, minKm = 5.0, maxKm = 7.0) {
  try {
    const res = await fetch(`${API_BASE}/resqmesh/scenario/relocate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: Number(lat), lng: Number(lng), min_km: minKm, max_km: maxKm })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('Scenario relocation network notice:', err.message);
    return null;
  }
}

export async function fetchDashboardMetrics() {
  try {
    const res = await fetch(`${API_BASE}/resqmesh/dashboard-metrics`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('Metrics fallback:', err);
    return null;
  }
}

export async function fetchEmergencies(severity = '', verification = '', status = '') {
  try {
    const params = new URLSearchParams();
    if (severity) params.append('severity', severity);
    if (verification) params.append('verification', verification);
    if (status) params.append('status_filter', status);
    const res = await fetch(`${API_BASE}/resqmesh/emergencies?${params.toString()}`);
    return await res.json();
  } catch (err) {
    return [];
  }
}

export async function submitDistressIntake(payload) {
  const res = await fetch(`${API_BASE}/resqmesh/intake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Distress intake submission failed');
  return await res.json();
}

export async function syncOutboxBatch(batchReports) {
  const res = await fetch(`${API_BASE}/resqmesh/outbox/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(batchReports)
  });
  if (!res.ok) throw new Error('Outbox batch synchronization failed');
  return await res.json();
}

export async function fetchResponders() {
  try {
    const res = await fetch(`${API_BASE}/resqmesh/responders`);
    return await res.json();
  } catch (err) {
    return [];
  }
}

export async function matchRespondersForEmergency(emergencyId) {
  const res = await fetch(`${API_BASE}/resqmesh/match`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emergency_id: emergencyId })
  });
  if (!res.ok) throw new Error('Matching calculation failed');
  return await res.json();
}

export async function proposeDispatch(payload) {
  const res = await fetch(`${API_BASE}/resqmesh/dispatch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Dispatch proposition failed');
  return await res.json();
}

export async function fetchDispatches() {
  try {
    const res = await fetch(`${API_BASE}/resqmesh/dispatches`);
    return await res.json();
  } catch (err) {
    return [];
  }
}

export async function takeDispatchAction(dispatchId, action, reason = '') {
  const res = await fetch(`${API_BASE}/resqmesh/dispatch/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dispatch_id: dispatchId, action, reason })
  });
  if (!res.ok) throw new Error('Dispatch action update failed');
  return await res.json();
}

export async function fetchHazards() {
  try {
    const res = await fetch(`${API_BASE}/resqmesh/hazards`);
    return await res.json();
  } catch (err) {
    return [];
  }
}

export async function toggleHazard(hazardId, active) {
  const res = await fetch(`${API_BASE}/resqmesh/hazards/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hazard_id: hazardId, active })
  });
  return await res.json();
}

export async function fetchMeshStatus() {
  try {
    const res = await fetch(`${API_BASE}/resqmesh/mesh/status`);
    return await res.json();
  } catch (err) {
    return { is_partitioned: false, nodes: [], audit_log: [] };
  }
}

export async function partitionNetwork() {
  const res = await fetch(`${API_BASE}/resqmesh/mesh/partition`, { method: 'POST' });
  return await res.json();
}

export async function reconnectNetwork() {
  const res = await fetch(`${API_BASE}/resqmesh/mesh/reconnect`, { method: 'POST' });
  return await res.json();
}

export async function runAttackScenario(scenarioId) {
  const res = await fetch(`${API_BASE}/resqmesh/attack-lab/scenario/${scenarioId}`, { method: 'POST' });
  return await res.json();
}

export async function resetAttackLab() {
  const res = await fetch(`${API_BASE}/resqmesh/attack-lab/reset`, { method: 'POST' });
  return await res.json();
}

export async function runPrivacyDemo(payload) {
  const res = await fetch(`${API_BASE}/resqmesh/privacy/demo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return await res.json();
}

export async function fetchAuditEvents() {
  try {
    const res = await fetch(`${API_BASE}/resqmesh/audit-events`);
    return await res.json();
  } catch (err) {
    return [];
  }
}

export async function submitDirectSOS(sosPayload) {
  try {
    const res = await fetch(`${API_BASE}/sos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sosPayload)
    });
    if (!res.ok) throw new Error(`SOS Beacon submission failed: HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    throw err;
  }
}

export async function submitHelpOffer(incidentId, offerData) {
  try {
    const res = await fetch(`${API_BASE}/incidents/${incidentId}/help-offers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(offerData)
    });
    if (res.ok) return await res.json();
  } catch (e) {
    // Try alternate resqmesh endpoint
  }

  try {
    const res2 = await fetch(`${API_BASE}/resqmesh/emergencies/${incidentId}/help-offers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(offerData)
    });
    if (res2.ok) return await res2.json();
  } catch (e2) {}

  // If offline or both endpoints unreachable, simulate successful local offer
  return {
    offer_id: `offer-${Date.now()}`,
    incident_id: incidentId,
    status: 'ACCEPTED_LOCALLY',
    created_at: new Date().toISOString(),
    ...offerData
  };
}

export async function fetchIncidentHelpOffers(incidentId) {
  try {
    const res = await fetch(`${API_BASE}/incidents/${incidentId}/help-offers`);
    if (res.ok) return await res.json();
  } catch (e) {}

  try {
    const res2 = await fetch(`${API_BASE}/resqmesh/emergencies/${incidentId}/help-offers`);
    if (res2.ok) return await res2.json();
  } catch (e2) {}

  return [];
}

export async function updateIncidentStatus(incidentId, status, assignedResponderId = null) {
  try {
    const res = await fetch(`${API_BASE}/incidents/${incidentId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, assigned_responder_id: assignedResponderId })
    });
    if (res.ok) return await res.json();
  } catch (e) {}

  try {
    const res2 = await fetch(`${API_BASE}/resqmesh/emergencies/${incidentId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, assigned_responder_id: assignedResponderId })
    });
    if (res2.ok) return await res2.json();
  } catch (e2) {}

  return { status, emergency_id: incidentId };
}

// ==================== MULTI-HOP BLE RELAY & GATEWAY SYNC ====================

export async function syncMultiHopBatch(messages, gatewayNodeId = 'browser-gateway') {
  const res = await fetch(`${API_BASE}/resqmesh/multi-hop/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gateway_node_id: gatewayNodeId,
      messages
    })
  });
  if (!res.ok) throw new Error(`Multi-hop sync failed: HTTP ${res.status}`);
  return await res.json();
}

export async function submitSingleMultiHop(message, gatewayId = 'browser-gateway') {
  const res = await fetch(`${API_BASE}/resqmesh/multi-hop/single?gateway_id=${encodeURIComponent(gatewayId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message)
  });
  if (!res.ok) throw new Error(`Single multi-hop submission failed: HTTP ${res.status}`);
  return await res.json();
}

export async function fetchMultiHopAcks() {
  try {
    const res = await fetch(`${API_BASE}/resqmesh/multi-hop/acks`);
    if (res.ok) return await res.json();
  } catch (e) {
    console.warn('Could not fetch server ACKs:', e);
  }
  return [];
}


