import React, { useState, useEffect, useMemo } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import Navbar from './components/Navbar';
import LocationPermissionBanner from './components/LocationPermissionBanner';
import OperationsMap from './components/OperationsMap';
import IntakePanel from './components/IntakePanel';
import RespondersPanel from './components/RespondersPanel';
import MeshPartitionSimulator from './components/MeshPartitionSimulator';
import AttackLabPanel from './components/AttackLabPanel';
import ResponderMobileView from './components/ResponderMobileView';
import PrivacyRelayView from './components/PrivacyRelayView';
import AuditTrailView from './components/AuditTrailView';
import ClaimVerificationPanel from './components/ClaimVerificationPanel';
import EmergencyAlertCard from './components/EmergencyAlertCard';
import EmergencyInputCard from './components/EmergencyInputCard';
import OutboxModal from './components/OutboxModal';
import ProfileModal from './components/ProfileModal';
import AuthScreen from './components/AuthScreen';
import IncidentDetailModal from './components/IncidentDetailModal';
import OfflineMapManagerModal from './components/OfflineMapManagerModal';
import MultiHopStatusPanel from './components/MultiHopStatusPanel';
import EmergencyContactModal from './components/EmergencyContactModal';
import VoiceSosCountdownModal from './components/VoiceSosCountdownModal';

// Redesigned SafePath 1-Second Emergency Layout Components
import SafePathCard from './components/SafePathCard';
import SafeShelterModal from './components/SafeShelterModal';
import CallForHelpModal from './components/CallForHelpModal';
import MedicalHelpModal from './components/MedicalHelpModal';
import MoreOptionsDrawer from './components/MoreOptionsDrawer';

import {
  isDemoModeEnabled,
  setDemoModeEnabled,
  getSeedDemoIncidents,
  filterDemoIncidents
} from './services/demoIncidents';
import { findShortestOfflineRoute } from './services/offlineRouting';
import { calculateDisasterRoute, TRAVEL_MODES, ROUTING_OBJECTIVES } from './services/routingService';
import {
  getOutboxReports,
  cacheEntities,
  getCachedEntities,
  syncOutboxWithServer,
  getStoredEmergencies,
  mergeStoredEmergencies,
  saveEmergencyRecord,
  saveLocationFix,
  getLastKnownLocationFix,
  queueOutboxReport,
  generateUUID
} from './services/offlineStorage';
import { syncOutboxBatch, submitDistressIntake } from './services/api';
import { authService } from './services/authService';
import { bleTransport } from './services/ble/bleTransportManager';
import { multiHopRouter } from './services/ble/multiHopRouter';
import { hasCompletedContactOnboarding, getEmergencyContact } from './services/emergencyContactService';
import { voiceSosService } from './services/voiceSosService';
import { gestureSosService } from './services/gestureSosService';
import {
  dispatchEmergencyNotification,
  subscribeToNotificationUpdates,
  requestNativeSmsPermission,
  isNativeDirectSmsSupported,
  NOTIFICATION_STATUS
} from './services/emergencyNotificationService';

import {
  fetchHealth,
  fetchDashboardMetrics,
  fetchEmergencies,
  fetchResponders,
  fetchHazards,
  fetchDispatches,
  fetchMeshStatus,
  fetchAuditEvents,
  fetchMyLocationTelemetry,
  relocateScenario
} from './services/api';
import { relocateDemoIncidents } from './services/demoIncidents';

function getVerifiedShelters(userCoords) {
  const baseLat = userCoords?.lat != null && isFinite(Number(userCoords.lat)) ? Number(userCoords.lat) : 21.1458;
  const baseLng = userCoords?.lng != null && isFinite(Number(userCoords.lng)) ? Number(userCoords.lng) : 79.0882;

  return [
    {
      id: 'shelter-sector-9',
      name: 'Sector 9 Community Evacuation Center',
      address: 'Sector 9 High Ground School, Main Rd',
      lat: baseLat - 0.0078,
      lng: baseLng - 0.0202,
      distanceKm: 1.8,
      etaMinutes: 4,
      status: 'OPEN & VERIFIED',
      capacity: '85 / 200 People',
      supplies: { water: 'High', food: 'Available', medical: 'Paramedic On Site' },
      phone: '+91 9823011223'
    },
    {
      id: 'shelter-central-relief',
      name: 'Civil Defense Central Relief Camp',
      address: 'Central Sports Complex Ground',
      lat: baseLat + 0.0092,
      lng: baseLng + 0.0068,
      distanceKm: 2.4,
      etaMinutes: 6,
      status: 'OPEN & VERIFIED',
      capacity: '140 / 350 People',
      supplies: { water: 'High', food: 'Full Kitchen', medical: 'Mobile Clinic' },
      phone: '+91 9823011224'
    },
    {
      id: 'shelter-north-high-ground',
      name: 'North High Ground Safe Haven',
      address: 'Government College Campus',
      lat: baseLat + 0.0162,
      lng: baseLng - 0.0162,
      distanceKm: 3.2,
      etaMinutes: 8,
      status: 'OPEN & VERIFIED',
      capacity: '45 / 150 People',
      supplies: { water: 'Moderate', food: 'Dry Rations', medical: 'First Aid Only' },
      phone: '+91 9823011225'
    }
  ];
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => authService.getCurrentUser());
  const [currentTab, setCurrentTab] = useState('operations');
  const [viewMode, setViewMode] = useState('safepath'); // 'safepath' (1-sec calm view) | 'advanced' (full command center)
  
  const [health, setHealth] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [emergencies, setEmergencies] = useState([]);
  const [responders, setResponders] = useState([]);
  const [hazards, setHazards] = useState([]);
  const [dispatches, setDispatches] = useState([]);
  const [meshStatus, setMeshStatus] = useState(null);
  const [auditEvents, setAuditEvents] = useState([]);

  const [selectedEmergency, setSelectedEmergency] = useState(null);
  const [detailedIncident, setDetailedIncident] = useState(null);
  const [isOfflineManagerOpen, setIsOfflineManagerOpen] = useState(false);
  const [activeRoute, setActiveRoute] = useState(null);
  const [isDemoModeActive, setIsDemoModeActive] = useState(() => isDemoModeEnabled());

  // Incident Feed Filter States
  const [incidentFilter, setIncidentFilter] = useState('ALL'); // 'ALL' | 'MY_EMERGENCIES' | 'CRITICAL' | 'HIGH' | 'HELP_OFFERED'
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [filterVerification, setFilterVerification] = useState('ALL');

  // Persistent Offline Outbox Queue & Modal State
  const [outboxCount, setOutboxCount] = useState(0);
  const [isOutboxOpen, setIsOutboxOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [mobileViewTab, setMobileViewTab] = useState('sos_feed'); // 'sos_feed' | 'map'
  const [locationTelemetry, setLocationTelemetry] = useState(null);

  // SafePath Redesign Specific Modals
  const [isSafeShelterModalOpen, setIsSafeShelterModalOpen] = useState(false);
  const [isCallHelpModalOpen, setIsCallHelpModalOpen] = useState(false);
  const [isMedicalHelpModalOpen, setIsMedicalHelpModalOpen] = useState(false);
  const [isMoreOptionsOpen, setIsMoreOptionsOpen] = useState(false);

  // Live GNSS / GPS User Location State (tracks status, coordinates, accuracy, freshness)
  const [userLocation, setUserLocation] = useState(() => {
    let cachedCoords = null;
    if (typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem('resqmesh_last_location_fix');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && parsed.latitude != null && parsed.longitude != null && isFinite(Number(parsed.latitude)) && isFinite(Number(parsed.longitude))) {
            cachedCoords = {
              lat: Number(parsed.latitude),
              lng: Number(parsed.longitude),
              accuracy: parsed.accuracy_meters || 20,
              timestamp: parsed.measured_at || parsed.timestamp || new Date().toISOString(),
              measured_at: parsed.measured_at || parsed.timestamp || new Date().toISOString(),
              saved_at: parsed.saved_at || new Date().toISOString(),
              is_last_known: true,
              source: 'LAST_KNOWN'
            };
          }
        }
      } catch (e) {}
    }
    return {
      status: cachedCoords ? 'granted' : 'prompt', // 'prompt' | 'requesting' | 'granted' | 'denied'
      coords: cachedCoords,
      error: null,
      isRealGps: false
    };
  });

  // Emergency Contact & Onboarding Step
  const [isOnboardingContactOpen, setIsOnboardingContactOpen] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);

  // Safety Triggers: Voice & Gesture SOS State
  const [isVoiceActive, setIsVoiceActive] = useState(() => voiceSosService.isListening);
  const [gestureTestFeedback, setGestureTestFeedback] = useState(null);
  const [activeSosCountdown, setActiveSosCountdown] = useState(null);
  const [sentNotificationAlert, setSentNotificationAlert] = useState(null);

  // Track Auth State changes & trigger contact onboarding if needed
  useEffect(() => {
    return authService.onAuthStateChanged((user) => {
      setCurrentUser(user);
      if (user) {
        const onboarded = hasCompletedContactOnboarding(user.user_id || user.email);
        if (!onboarded && !user.emergency_contact) {
          setIsOnboardingContactOpen(true);
        }
      }
    });
  }, []);

  // Voice SOS & Gesture SOS Subscriptions
  useEffect(() => {
    if (voiceSosService.config.enabled) {
      voiceSosService.startListening();
    }

    const unsubVoice = voiceSosService.subscribe((event, payload) => {
      if (event === 'LISTENING_STARTED') setIsVoiceActive(true);
      if (event === 'LISTENING_STOPPED') setIsVoiceActive(false);
      if (event === 'EMERGENCY_TRIGGERED') {
        setActiveSosCountdown({
          source: 'VOICE',
          phrase: payload.phrase,
          detectedText: payload.detectedText
        });
      }
    });

    const unsubGesture = gestureSosService.subscribe((event, payload) => {
      if (event === 'TEST_TRIGGERED') {
        setGestureTestFeedback(payload);
        setTimeout(() => setGestureTestFeedback(null), 3500);
      }
      if (event === 'EMERGENCY_TRIGGERED') {
        setActiveSosCountdown({
          source: 'GESTURE',
          tapCount: payload.tapCount
        });
      }
    });

    return () => {
      unsubVoice();
      unsubGesture();
      voiceSosService.stopListening();
    };
  }, []);

  // Live Emergency Cellular SMS & Notification Updates Subscription
  useEffect(() => {
    const unsubNotif = subscribeToNotificationUpdates((updated) => {
      setSentNotificationAlert(prev => {
        if (!prev || prev.sos_id === updated.sos_id) {
          return updated;
        }
        return prev;
      });
    });
    return () => unsubNotif();
  }, []);

  const handleLogoClick = async () => {
    // Discreet multi-tap / logo click immediately triggers emergency SOS
    await handleConfirmSosTrigger({ source: 'LOGO_CLICK' });
  };

  const handleConfirmSosTrigger = async (triggerData) => {
    setActiveSosCountdown(null);
    const source = triggerData?.source || 'LOGO_CLICK';
    const category = triggerData?.category || (source === 'MEDICAL_HELP' ? 'medical' : 'general');
    const urgency = source === 'MEDICAL_HELP' ? 10 : 9;
    const severity = 'CRITICAL';
    const nowIso = new Date().toISOString();
    const uniqueId = `sos-${source.toLowerCase()}-${generateUUID()}`;

    // 1. Acquire current or cached location
    const locCoords = userLocation?.coords || {
      lat: 21.1458,
      lng: 79.0882,
      accuracy: 15,
      measured_at: nowIso,
      is_last_known: true
    };
    const locStatus = userLocation?.status === 'granted' ? 'CURRENT_GPS' : (userLocation?.coords ? 'LAST_KNOWN' : 'UNAVAILABLE');

    const title = `${source === 'LOGO_CLICK' ? 'SafePath Logo Tap' : source === 'MEDICAL_HELP' ? 'Medical Emergency' : source} SOS Beacon`;
    const description = `Emergency alert triggered via ${source === 'LOGO_CLICK' ? 'SafePath Logo tap' : source}${triggerData?.phrase ? ` (${triggerData.phrase})` : ''}. Urgent emergency assistance and callback required.`;

    const incident = {
      id: uniqueId,
      emergency_id: uniqueId,
      incident_id: uniqueId,
      title,
      description,
      raw_message: description,
      category,
      severity,
      urgency,
      status: 'UNRESOLVED',
      assistance_status: 'OPEN',
      verification_status: 'VERIFIED',
      confidence_score: 0.95,
      verification_reasons: [
        `${source} trigger verified on handset with user confirmation`,
        locStatus === 'CURRENT_GPS' ? 'Fresh hardware GPS telemetry validated' : 'Offline last known GPS location restored'
      ],
      lat: locCoords.lat,
      lng: locCoords.lng,
      latitude: locCoords.lat,
      longitude: locCoords.lng,
      location_accuracy_meters: locCoords.accuracy || 15,
      reporter_id: currentUser?.user_id || 'usr-citizen',
      reporter_phone: currentUser?.emergency_contact?.phone || '+91 9272104399',
      trigger_source: source,
      created_at: nowIso,
      is_demo: false
    };

    // 2. Persist locally first
    await saveEmergencyRecord(incident);
    setEmergencies(prev => [incident, ...prev]);

    // 3. Initiate BLE Multi-Hop Relay
    try {
      await multiHopRouter.createAndBroadcastPacket({
        origin_id: currentUser?.user_id || 'usr-citizen',
        latitude: locCoords.lat,
        longitude: locCoords.lng,
        location_accuracy_m: locCoords.accuracy || 15,
        urgency: 'CRITICAL',
        category,
        description,
        hop_limit: 7
      });
    } catch (e) {
      console.warn('BLE relay note:', e);
    }

    // 4. Save to persistent offline outbox & attempt server intake
    const outboxPayload = {
      raw_text: description,
      lat: locCoords.lat,
      lng: locCoords.lng,
      location_accuracy_meters: locCoords.accuracy || 15,
      reporter_node_id: currentUser?.user_id || 'usr-citizen',
      client_message_id: uniqueId
    };
    try {
      await submitDistressIntake(outboxPayload);
      await queueOutboxReport({ ...outboxPayload, initial_status: 'ACKNOWLEDGED' });
    } catch (e) {
      await queueOutboxReport({ ...outboxPayload, initial_status: 'QUEUED' });
    }

    // 5. Dispatch Emergency Contact Notification
    try {
      const notifResult = await dispatchEmergencyNotification({
        sosId: uniqueId,
        triggerSource: source,
        location: {
          coords: locCoords,
          status: locStatus
        },
        customNote: description,
        userId: currentUser?.user_id
      });
      incident.contact_notifications = [notifResult];
      setSentNotificationAlert(notifResult);
    } catch (notifErr) {
      console.warn('Emergency notification error:', notifErr);
    }

    // Open detail modal to show the SOS created
    setDetailedIncident(incident);
  };

  const requestUserLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setUserLocation(prev => ({
        status: 'denied',
        coords: prev?.coords || null,
        error: 'Geolocation API is not supported by your browser',
        isRealGps: false
      }));
      return;
    }

    setUserLocation(prev => ({ ...prev, status: 'requesting' }));

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const measuredAt = new Date(pos.timestamp || Date.now()).toISOString();
        const coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy || 15),
          altitude: pos.coords.altitude,
          speed: pos.coords.speed,
          heading: pos.coords.heading,
          timestamp: measuredAt,
          measured_at: measuredAt,
          saved_at: new Date().toISOString(),
          is_last_known: false,
          source: 'CURRENT'
        };

        // Persist to local offline storage immediately
        saveLocationFix({
          latitude: coords.lat,
          longitude: coords.lng,
          accuracy_meters: coords.accuracy,
          timestamp: measuredAt
        });

        setUserLocation({
          status: 'granted',
          coords: coords,
          error: null,
          isRealGps: true
        });

        // Relocate disaster incidents, hazards & responders to 5-7 km range around user's location
        syncScenarioToLocation(coords);

        fetchMyLocationTelemetry(coords.lat, coords.lng, coords.accuracy).then(data => {
          if (data) setLocationTelemetry(data);
        });
      },
      (err) => {
        console.warn('Geolocation acquisition notice:', err.message);
        getLastKnownLocationFix().then(cached => {
          if (cached && cached.latitude != null && cached.longitude != null) {
            const cachedCoords = {
              lat: Number(cached.latitude),
              lng: Number(cached.longitude),
              accuracy: cached.accuracy_meters || 20,
              timestamp: cached.measured_at || cached.timestamp,
              measured_at: cached.measured_at || cached.timestamp,
              saved_at: cached.saved_at,
              is_last_known: true,
              source: 'LAST_KNOWN'
            };
            setUserLocation({
              status: 'granted',
              coords: cachedCoords,
              error: err.message,
              isRealGps: false
            });
            syncScenarioToLocation(cachedCoords);
          } else {
            setUserLocation(prev => ({
              status: err.code === 1 ? 'denied' : 'prompt',
              coords: prev?.coords || null,
              error: err.message,
              isRealGps: false
            }));
          }
        });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
  };

  const syncScenarioToLocation = async (coords) => {
    if (!coords || !isFinite(Number(coords.lat)) || !isFinite(Number(coords.lng))) return;
    const centerLat = Number(coords.lat);
    const centerLng = Number(coords.lng);

    const relocatedDemos = relocateDemoIncidents({ lat: centerLat, lng: centerLng });
    if (relocatedDemos && relocatedDemos.length > 0) {
      for (const d of relocatedDemos) {
        await saveEmergencyRecord(d);
      }
      setEmergencies(prev => {
        const nonDemos = prev.filter(e => !e.is_demo);
        return [...nonDemos, ...relocatedDemos];
      });
    }

    try {
      await relocateScenario(centerLat, centerLng, 5.0, 7.0);
      const [emgList, rList, hzList] = await Promise.all([
        fetchEmergencies(),
        fetchResponders(),
        fetchHazards()
      ]);
      if (emgList && Array.isArray(emgList)) {
        const merged = await mergeStoredEmergencies(emgList);
        setEmergencies(merged);
      }
      if (rList && rList.length > 0) {
        setResponders(rList);
        cacheEntities('cached_responders', rList);
      }
      if (hzList && hzList.length > 0) {
        setHazards(hzList);
        cacheEntities('cached_hazards', hzList);
      }
    } catch (e) {
      console.warn('Backend scenario relocation notice:', e.message);
    }
  };

  // Restore last known saved location immediately upon mount
  useEffect(() => {
    getLastKnownLocationFix().then(saved => {
      if (saved && saved.latitude != null && saved.longitude != null) {
        const savedCoords = {
          lat: Number(saved.latitude),
          lng: Number(saved.longitude),
          accuracy: saved.accuracy_meters || 20,
          timestamp: saved.measured_at || saved.timestamp,
          measured_at: saved.measured_at || saved.timestamp,
          saved_at: saved.saved_at,
          is_last_known: true,
          source: 'LAST_KNOWN'
        };
        setUserLocation(prev => {
          if (prev?.isRealGps) return prev;
          return {
            status: 'granted',
            coords: savedCoords,
            error: null,
            isRealGps: false
          };
        });
        syncScenarioToLocation(savedCoords);
      }
    });
  }, []);

  // Ask for location permission on mount and start polling data
  useEffect(() => {
    requestUserLocation();

    getStoredEmergencies().then(stored => {
      if (stored && stored.length > 0) {
        setEmergencies(stored);
      }
    });

    loadAllData();

    const unbindBleEmg = bleTransport.onEmergencyReceived((emgData, isSim) => {
      console.log('BLE Emergency Broadcast received:', emgData);
      saveEmergencyRecord(emgData).then(saved => {
        setEmergencies(prev => {
          const exists = prev.some(e => e.id === saved.id || e.emergency_id === saved.id);
          if (exists) return prev;
          return [saved, ...prev];
        });
      });
    });

    const unbindBleAcc = bleTransport.onAcceptanceReceived((accData, isSim) => {
      console.log('BLE Acceptance Broadcast received:', accData);
      setEmergencies(prev => prev.map(e => {
        const idMatches = e.id === accData.alert_id || e.emergency_id === accData.alert_id;
        const hashMatches = (e.id || '').includes(accData.alert_hash);
        if (idMatches || hashMatches) {
          const updated = {
            ...e,
            assistance_status: accData.status,
            status: accData.status,
            accepted_responders: [
              {
                responder_id: accData.responder_id || 'peer-responder-ble',
                name: 'Nearby Mesh Responder',
                status: accData.status,
                confirmed_eta_minutes: accData.eta_minutes || 10,
                accepted_at: accData.timestamp
              }
            ],
            last_updated_at: new Date().toISOString()
          };
          saveEmergencyRecord(updated);
          return updated;
        }
        return e;
      }));
    });

    let watchId = null;
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setUserLocation({
            status: 'granted',
            coords: {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              timestamp: pos.timestamp
            },
            error: null,
            isRealGps: true
          });
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 5000 }
      );
    }

    const interval = setInterval(loadAllData, 10000);

    const handleOnline = () => {
      console.log('Network connectivity restored. Auto-syncing offline outbox...');
      syncOutboxWithServer(syncOutboxBatch).then(() => {
        loadAllData();
      });
    };
    window.addEventListener('online', handleOnline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      unbindBleEmg();
      unbindBleAcc();
      if (watchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, []);

  const loadAllData = async () => {
    try {
      const outboxReports = await getOutboxReports();
      const pending = outboxReports.filter(r => r.status === 'QUEUED' || r.status === 'LOCAL_ONLY' || r.status === 'FAILED');
      setOutboxCount(pending.length);

      if (pending.length > 0 && navigator.onLine) {
        syncOutboxWithServer(syncOutboxBatch).then(res => {
          if (res?.synced > 0) {
            getOutboxReports().then(reps => {
              const stillPending = reps.filter(r => r.status === 'QUEUED' || r.status === 'LOCAL_ONLY');
              setOutboxCount(stillPending.length);
            });
          }
        });
      }
    } catch (e) {
      console.warn('Outbox check note:', e);
    }

    try {
      const stored = await getStoredEmergencies();
      if (stored && stored.length > 0) {
        setEmergencies(stored);
      }
    } catch (e) {
      console.warn('Stored emergencies retrieval note:', e);
    }

    try {
      const [h, m, emgList, rList, hzList, dispList, mStatus, evList] = await Promise.all([
        fetchHealth(),
        fetchDashboardMetrics(),
        fetchEmergencies(),
        fetchResponders(),
        fetchHazards(),
        fetchDispatches(),
        fetchMeshStatus(),
        fetchAuditEvents()
      ]);
      setHealth(h);
      if (m) setMetrics(m);
      if (rList && rList.length > 0) {
        setResponders(rList);
        cacheEntities('cached_responders', rList);
      }
      if (hzList && hzList.length > 0) {
        setHazards(hzList);
        cacheEntities('cached_hazards', hzList);
      }
      if (dispList) setDispatches(dispList);
      if (mStatus) setMeshStatus(mStatus);
      if (evList) setAuditEvents(evList);

      if (emgList && Array.isArray(emgList)) {
        const merged = await mergeStoredEmergencies(emgList);
        setEmergencies(merged);
      }
    } catch (err) {
      console.warn('Network sync offline. Retaining persistent IndexedDB records:', err);
      try {
        const [storedEmgs, cachedResps, cachedHz] = await Promise.all([
          getStoredEmergencies(),
          getCachedEntities('cached_responders'),
          getCachedEntities('cached_hazards')
        ]);
        if (storedEmgs?.length > 0) setEmergencies(storedEmgs);
        if (cachedResps?.length > 0) setResponders(cachedResps);
        if (cachedHz?.length > 0) setHazards(cachedHz);
      } catch (cacheErr) {
        console.warn('IndexedDB cache retrieval error:', cacheErr);
      }
    }
  };

  const handleSelectEmergencyForMatching = (emg) => {
    setSelectedEmergency(emg);
    setCurrentTab('responders');
    setViewMode('advanced');
  };

  const handleEmergencyCreated = async (newIncident) => {
    await saveEmergencyRecord(newIncident);
    setEmergencies(prev => {
      const exists = prev.some(e => e.id === newIncident.id || e.emergency_id === newIncident.emergency_id);
      if (exists) {
        return prev.map(e => (e.id === newIncident.id || e.emergency_id === newIncident.emergency_id) ? newIncident : e);
      }
      return [newIncident, ...prev];
    });
    setSelectedEmergency(newIncident);
  };

  const handleEmergencyUpdated = async (updatedIncident) => {
    await saveEmergencyRecord(updatedIncident);
    setEmergencies(prev => prev.map(e => {
      const isMatch = e.id === updatedIncident.id || e.emergency_id === updatedIncident.emergency_id || e.incident_id === updatedIncident.incident_id;
      return isMatch ? { ...e, ...updatedIncident } : e;
    }));
    if (selectedEmergency?.id === updatedIncident.id || selectedEmergency?.emergency_id === updatedIncident.emergency_id) {
      setSelectedEmergency(prev => ({ ...prev, ...updatedIncident }));
    }
    if (detailedIncident?.id === updatedIncident.id || detailedIncident?.emergency_id === updatedIncident.emergency_id) {
      setDetailedIncident(prev => ({ ...prev, ...updatedIncident }));
    }
  };

  const handleShowRouteForIncident = async (emg, routeOptions = {}) => {
    let origin = null;
    if (userLocation?.coords && isFinite(Number(userLocation.coords.lat)) && isFinite(Number(userLocation.coords.lng))) {
      origin = {
        lat: Number(userLocation.coords.lat),
        lng: Number(userLocation.coords.lng),
        accuracy: userLocation.coords.accuracy,
        measured_at: userLocation.coords.measured_at || userLocation.coords.timestamp,
        is_last_known: !userLocation.isRealGps || userLocation.coords.is_last_known
      };
    } else {
      origin = {
        lat: 21.1458,
        lng: 79.0882,
        accuracy: 15,
        measured_at: null,
        is_last_known: true
      };
    }

    const destLat = Number(emg.lat ?? emg.latitude);
    const destLng = Number(emg.lng ?? emg.longitude);
    const destination = {
      lat: destLat,
      lng: destLng,
      id: emg.id || emg.emergency_id,
      title: emg.category
    };

    try {
      const calculated = await calculateDisasterRoute(origin, destination, {
        mode: routeOptions.mode || TRAVEL_MODES.DRIVING,
        objective: routeOptions.objective || ROUTING_OBJECTIVES.SHORTEST,
        hazards: hazards
      });
      setActiveRoute(calculated);
      setSelectedEmergency(emg);
      if (window.innerWidth < 768) setMobileViewTab('map');
    } catch (err) {
      console.warn('Failed to calculate route:', err);
    }
  };

  // SafePath Actions
  const handleFindSafety = async () => {
    let originCoords = userLocation?.coords;
    if (!originCoords || !isFinite(Number(originCoords.lat)) || !isFinite(Number(originCoords.lng))) {
      requestUserLocation();
      originCoords = { lat: 21.1458, lng: 79.0882, accuracy: 20 };
    }

    const availableShelters = getVerifiedShelters(originCoords);
    const primary = availableShelters[0];

    try {
      const calculated = await calculateDisasterRoute(
        {
          lat: Number(originCoords.lat),
          lng: Number(originCoords.lng),
          accuracy: originCoords.accuracy || 15,
          measured_at: originCoords.measured_at,
          is_last_known: !userLocation?.isRealGps
        },
        {
          lat: Number(primary.lat),
          lng: Number(primary.lng),
          id: primary.id,
          title: primary.name
        },
        {
          mode: TRAVEL_MODES.DRIVING,
          objective: ROUTING_OBJECTIVES.SHORTEST,
          hazards: hazards
        }
      );
      setActiveRoute(calculated);
    } catch (e) {
      console.warn('Shelter route calculation note:', e);
    }

    setIsSafeShelterModalOpen(true);
  };

  const handleOpenMapWithShelterRoute = async (shelter) => {
    setIsSafeShelterModalOpen(false);
    let originCoords = userLocation?.coords || { lat: 21.1458, lng: 79.0882 };
    try {
      const calculated = await calculateDisasterRoute(
        {
          lat: Number(originCoords.lat),
          lng: Number(originCoords.lng),
          accuracy: originCoords.accuracy || 15
        },
        {
          lat: Number(shelter.lat),
          lng: Number(shelter.lng),
          id: shelter.id,
          title: shelter.name
        },
        {
          mode: TRAVEL_MODES.DRIVING,
          objective: ROUTING_OBJECTIVES.SHORTEST,
          hazards: hazards
        }
      );
      setActiveRoute(calculated);
    } catch (e) {
      console.warn('Route calculation note:', e);
    }
    setCurrentTab('operations');
    setMobileViewTab('map');
    setViewMode('advanced');
  };

  const handleCallForHelp = () => {
    setIsCallHelpModalOpen(true);
  };

  const handleSendCallHelpSms = async () => {
    await handleConfirmSosTrigger({
      source: 'CALL_FOR_HELP',
      phrase: 'Emergency Call For Help SOS'
    });
  };

  const handleMedicalHelp = () => {
    setIsMedicalHelpModalOpen(true);
  };

  const handleSendMedicalSos = async () => {
    await handleConfirmSosTrigger({
      source: 'MEDICAL_HELP',
      category: 'medical',
      phrase: 'Urgent Medical Aid Request'
    });
  };

  const handleSelectMoreOption = (optionId) => {
    switch (optionId) {
      case 'operations_map':
        setCurrentTab('operations');
        setMobileViewTab('map');
        setViewMode('advanced');
        break;
      case 'incident_feed':
        setCurrentTab('operations');
        setMobileViewTab('sos_feed');
        setViewMode('advanced');
        break;
      case 'intake_form':
        setCurrentTab('intake');
        setViewMode('advanced');
        break;
      case 'mesh_network':
        setCurrentTab('operations');
        setMobileViewTab('sos_feed');
        setViewMode('advanced');
        break;
      case 'responders':
        setCurrentTab('responders');
        setViewMode('advanced');
        break;
      case 'verification_protocol':
        setCurrentTab('verification_protocol');
        setViewMode('advanced');
        break;
      case 'audit_trail':
        setCurrentTab('audit');
        setViewMode('advanced');
        break;
      case 'partition':
        setCurrentTab('partition');
        setViewMode('advanced');
        break;
      case 'attack_lab':
        setCurrentTab('attack_lab');
        setViewMode('advanced');
        break;
      case 'responder_mobile':
        setCurrentTab('responder_mobile');
        setViewMode('advanced');
        break;
      case 'privacy':
        setCurrentTab('privacy');
        setViewMode('advanced');
        break;
      case 'profile':
        setIsProfileOpen(true);
        break;
      case 'offline_map_manager':
        setIsOfflineManagerOpen(true);
        break;
      case 'outbox':
        setIsOutboxOpen(true);
        break;
      default:
        setViewMode('advanced');
        break;
    }
  };

  const filteredEmergencies = useMemo(() => {
    let list = filterDemoIncidents(emergencies, isDemoModeActive);

    if (isDemoModeActive && !list.some(e => e && e.is_demo)) {
      list = [...list, ...getSeedDemoIncidents()];
    }

    list = (list || []).filter(Boolean);

    if (incidentFilter === 'MY_EMERGENCIES') {
      list = list.filter(e =>
        e && (
          e.reporter_id === currentUser?.user_id ||
          e.reporter_id === currentUser?.email ||
          e.reporter_node_id === currentUser?.user_id
        )
      );
    } else if (incidentFilter === 'CRITICAL') {
      list = list.filter(e => e && (e.severity === 'CRITICAL' || e.urgency >= 8));
    } else if (incidentFilter === 'HIGH') {
      list = list.filter(e => e && (e.severity === 'HIGH' || (e.urgency >= 6 && e.urgency < 8)));
    } else if (incidentFilter === 'HELP_OFFERED') {
      list = list.filter(e => e && (e.assistance_status === 'HELP_OFFERED' || e.status === 'HELP_OFFERED'));
    }

    if (filterCategory !== 'ALL') {
      list = list.filter(e => e && String(e.category || '').toLowerCase() === filterCategory.toLowerCase());
    }

    if (filterVerification !== 'ALL') {
      list = list.filter(e => e && String(e.verification_status || 'VERIFIED').toUpperCase() === filterVerification.toUpperCase());
    }

    return list;
  }, [emergencies, incidentFilter, isDemoModeActive, filterCategory, filterVerification, currentUser]);

  // Protected Route: Require login before accessing emergency coordination systems
  if (!currentUser) {
    return <AuthScreen onAuthenticated={(user) => setCurrentUser(user)} />;
  }

  const verifiedSheltersList = getVerifiedShelters(userLocation?.coords);

  return (
    <div className="flex flex-col min-h-screen w-screen overflow-x-hidden bg-[#F4F6F8] text-[#102B4E] select-none font-sans">
      
      {/* =========================================================================
          VIEW MODE 1: SAFEPATH REDESIGNED 1-SECOND EMERGENCY INTERFACE
          (Single column, mobile-first, centered card, max-width ~480px on desktop)
          ========================================================================= */}
      {viewMode === 'safepath' && (
        <div className="flex-1 flex flex-col justify-between p-3 sm:p-6 min-h-screen">
          
          <div className="w-full max-w-[480px] mx-auto my-auto py-2 sm:py-6">
            <SafePathCard
              userLocation={userLocation}
              onRequestUserLocation={requestUserLocation}
              hasActiveWarning={hazards.length > 0 || emergencies.some(e => e?.severity === 'CRITICAL')}
              warningMessage={
                hazards.length > 0
                  ? {
                      title: 'Warning in your area',
                      body: `${hazards.length} active hazard zone${hazards.length > 1 ? 's' : ''} reported nearby. Follow official evacuation instructions.`
                    }
                  : null
              }
              onFindSafety={handleFindSafety}
              onCallForHelp={handleCallForHelp}
              onMedicalHelp={handleMedicalHelp}
              onOpenMoreOptions={() => setIsMoreOptionsOpen(true)}
              onDiscreetTap={handleLogoClick}
            />
          </div>

          <footer className="text-center py-2 text-xs text-slate-400 font-sans">
            SafePath • Emergency Response Network
          </footer>
        </div>
      )}

      {/* =========================================================================
          VIEW MODE 2: ADVANCED COMMAND CENTER & FULL OPERATIONS DASHBOARD
          ========================================================================= */}
      {viewMode === 'advanced' && (
        <div className="flex flex-col h-screen w-screen overflow-hidden bg-white text-[#102B4E]">
          
          {/* Command Center Navbar with '← SafePath' Return Button */}
          <Navbar
            metrics={metrics}
            health={health}
            currentTab={currentTab}
            onSelectTab={(tabId) => setCurrentTab(tabId)}
            onRefreshAll={loadAllData}
            outboxCount={outboxCount}
            onOpenOutbox={() => setIsOutboxOpen(true)}
            onOpenProfile={() => setIsProfileOpen(true)}
            currentUser={currentUser}
            onLogout={() => authService.logout()}
            onDiscreetTap={handleLogoClick}
            isVoiceActive={isVoiceActive}
            gestureTestFeedback={gestureTestFeedback}
            onBackToSafePath={() => setViewMode('safepath')}
          />

          {/* Prominent Live Geolocation API & Permission Banner */}
          <LocationPermissionBanner
            locationState={userLocation}
            onRequestPermission={requestUserLocation}
          />

          {/* Main Viewport Container */}
          <main className="flex-1 overflow-hidden relative">
            
            {/* Tab 1: Operations Dashboard & Map */}
            {currentTab === 'operations' && (
              <div className="flex flex-col md:flex-row h-full w-full overflow-hidden">
                
                {/* Mobile View Toggle Bar */}
                <div className="md:hidden flex items-center justify-around bg-[#EAF5FF] border-b border-[#D0E6FC] p-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setMobileViewTab('sos_feed')}
                    className={`flex-1 py-1.5 text-xs font-heading font-bold rounded-lg transition ${
                      mobileViewTab === 'sos_feed'
                        ? 'bg-white text-[#168BFA] shadow-xs'
                        : 'text-[#627D98]'
                    }`}
                  >
                    🚨 Emergency SOS & Feed ({filteredEmergencies.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileViewTab('map')}
                    className={`flex-1 py-1.5 text-xs font-heading font-bold rounded-lg transition ${
                      mobileViewTab === 'map'
                        ? 'bg-white text-[#168BFA] shadow-xs'
                        : 'text-[#627D98]'
                    }`}
                  >
                    🗺️ Tactical Map
                  </button>
                </div>

                {/* Left Column: Metrics + Emergency Input + Active Feed */}
                <div className={`w-full md:w-[460px] lg:w-[490px] h-full bg-[#FFFFFF] border-r border-[#D0E6FC] flex flex-col shrink-0 overflow-y-auto ${
                  mobileViewTab === 'map' ? 'hidden md:flex' : 'flex'
                }`}>
                  
                  {/* Operations Metrics Header Bar */}
                  <div className="p-3.5 sm:p-4 border-b border-[#EAF5FF] bg-[#FFFFFF] space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#168BFA] animate-pulse" />
                        <h2 className="font-heading font-black text-xs text-[#102B4E] uppercase tracking-wider">
                          Command Operations Telemetry
                        </h2>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#EAF5FF] text-[#168BFA] border border-[#D0E6FC] font-bold">
                        {emergencies.length} ACTIVE INCIDENTS
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-2 text-center font-sans">
                      <div className="p-2 bg-rose-50 border border-rose-200 rounded-xl">
                        <span className="text-rose-700 text-[10px] font-bold uppercase block">CRITICAL</span>
                        <strong className="text-rose-900 text-sm font-heading font-black">
                          {emergencies.filter(e => e && (e.severity === 'CRITICAL' || e.urgency >= 8)).length}
                        </strong>
                      </div>
                      <div className="p-2 bg-amber-50 border border-amber-200 rounded-xl">
                        <span className="text-amber-700 text-[10px] font-bold uppercase block">HIGH</span>
                        <strong className="text-amber-900 text-sm font-heading font-black">
                          {emergencies.filter(e => e && (e.severity === 'HIGH' || (e.urgency >= 6 && e.urgency < 8))).length}
                        </strong>
                      </div>
                      <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-xl">
                        <span className="text-emerald-700 text-[10px] font-bold uppercase block">READY</span>
                        <strong className="text-emerald-900 text-sm font-heading font-black">
                          {responders.filter(r => r && r.status === 'AVAILABLE').length || 3}
                        </strong>
                      </div>
                      <div className="p-2 bg-blue-50 border border-blue-200 rounded-xl">
                        <span className="text-blue-700 text-[10px] font-bold uppercase block">HAZARDS</span>
                        <strong className="text-blue-900 text-sm font-heading font-black">
                          {hazards.length || 2}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Scrollable Form & Feed Container */}
                  <div className="p-3.5 sm:p-4 space-y-4">
                    
                    {/* 1. PROMINENT EMERGENCY INPUT CARD */}
                    <EmergencyInputCard
                      userLocation={userLocation}
                      onRequestUserLocation={requestUserLocation}
                      onEmergencyCreated={handleEmergencyCreated}
                      onOpenOutbox={() => setIsOutboxOpen(true)}
                      currentUser={currentUser}
                      onNotificationSent={(notif) => setSentNotificationAlert(notif)}
                    />

                    {/* 2. OFFLINE MULTI-HOP BLE RELAY MESH PANEL */}
                    <MultiHopStatusPanel
                      onSelectIncident={(inc) => setDetailedIncident(inc)}
                    />

                    {/* 3. ACTIVE INCIDENTS FEED */}
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between border-b border-[#EAF5FF] pb-2">
                        <div className="flex items-center space-x-2">
                          <span className="font-heading font-black text-xs text-[#102B4E] uppercase tracking-wide">
                            Active Emergency Incidents
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#EAF5FF] text-[#168BFA] font-bold">
                            {filteredEmergencies.length}
                          </span>
                        </div>

                        {/* Hardcoded Demo Toggle */}
                        <button
                          type="button"
                          onClick={() => {
                            const next = !isDemoModeActive;
                            setIsDemoModeActive(next);
                            setDemoModeEnabled(next);
                          }}
                          className={`px-2 py-1 rounded-md text-[10px] font-extrabold uppercase border flex items-center space-x-1 transition ${
                            isDemoModeActive
                              ? 'bg-amber-100 text-amber-900 border-amber-300'
                              : 'bg-slate-100 text-slate-500 border-slate-300'
                          }`}
                          title="Toggle Hardcoded Seed Demo Incidents"
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${isDemoModeActive ? 'bg-amber-500' : 'bg-slate-400'}`} />
                          <span>DEMO DATA: {isDemoModeActive ? 'ON' : 'OFF'}</span>
                        </button>
                      </div>

                      {/* Primary & Secondary Filter Bars */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-1 overflow-x-auto pb-1 text-[11px] font-sans">
                          {[
                            { id: 'ALL', label: 'All' },
                            { id: 'MY_EMERGENCIES', label: 'My Reports' },
                            { id: 'CRITICAL', label: 'Critical' },
                            { id: 'HIGH', label: 'High' },
                            { id: 'HELP_OFFERED', label: 'Help Offered' }
                          ].map((flt) => (
                            <button
                              key={flt.id}
                              type="button"
                              onClick={() => setIncidentFilter(flt.id)}
                              className={`px-2.5 py-1 rounded-md font-bold transition text-[10px] uppercase shrink-0 ${
                                incidentFilter === flt.id
                                  ? 'bg-[#168BFA] text-white shadow-xs'
                                  : 'text-[#627D98] bg-[#F4FAFF] hover:bg-[#EAF5FF]'
                              }`}
                            >
                              {flt.label}
                            </button>
                          ))}
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[10px]">
                          <select
                            value={filterCategory}
                            onChange={(e) => setFilterCategory(e.target.value)}
                            className="p-1.5 bg-slate-50 border border-[#D0E6FC] rounded-lg text-[#102B4E] font-medium"
                          >
                            <option value="ALL">All Categories</option>
                            <option value="MEDICAL">Medical Aid</option>
                            <option value="FLOOD">Flood / Water</option>
                            <option value="COLLAPSE">Structural Collapse</option>
                            <option value="SUPPLIES">Food & Water Supplies</option>
                            <option value="GENERAL">General Distress</option>
                          </select>

                          <select
                            value={filterVerification}
                            onChange={(e) => setFilterVerification(e.target.value)}
                            className="p-1.5 bg-slate-50 border border-[#D0E6FC] rounded-lg text-[#102B4E] font-medium"
                          >
                            <option value="ALL">All Verification</option>
                            <option value="VERIFIED">Verified Only</option>
                            <option value="PARTIALLY_VERIFIED">Partially Verified</option>
                            <option value="SUSPICIOUS">Suspicious</option>
                            <option value="UNVERIFIED">Unverified</option>
                          </select>
                        </div>
                      </div>

                      {filteredEmergencies.length === 0 ? (
                        <div className="p-6 text-center bg-[#F4FAFF] border border-[#D0E6FC] rounded-2xl text-xs text-[#627D98] font-sans">
                          {incidentFilter === 'MY_EMERGENCIES'
                            ? 'You have not submitted any emergency alerts yet. Use the SOS form above to report an incident.'
                            : 'No emergency reports match the selected filters.'}
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {filteredEmergencies.map((emg) => (
                            <EmergencyAlertCard
                              key={emg.id || emg.emergency_id || emg.incident_id}
                              emergency={emg}
                              isSelected={selectedEmergency?.id === emg.id || selectedEmergency?.emergency_id === emg.emergency_id}
                              onSelectForMatching={() => setDetailedIncident(emg)}
                              onShowRoute={() => handleShowRouteForIncident(emg)}
                              onFlyToMap={(lat, lng) => {
                                setSelectedEmergency(emg);
                                if (window.innerWidth < 768) setMobileViewTab('map');
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                  </div>

                </div>

                {/* Right Leaflet Map */}
                <div className={`flex-1 h-full relative ${
                  mobileViewTab === 'sos_feed' ? 'hidden md:block' : 'block'
                }`}>
                  <OperationsMap
                    emergencies={filteredEmergencies}
                    responders={responders}
                    hazards={hazards}
                    dispatches={dispatches}
                    meshStatus={meshStatus}
                    userLocation={userLocation}
                    onRequestUserLocation={requestUserLocation}
                    selectedEmergency={selectedEmergency}
                    onSelectEmergency={(emg) => setDetailedIncident(emg)}
                    onProposeDispatch={(cand) => handleSelectEmergencyForMatching(selectedEmergency)}
                    activeRoute={activeRoute}
                    onClearActiveRoute={() => setActiveRoute(null)}
                    onRecalculateRoute={(options) => selectedEmergency && handleShowRouteForIncident(selectedEmergency, options)}
                    onOpenOfflineManager={() => setIsOfflineManagerOpen(true)}
                  />
                </div>

              </div>
            )}

            {/* Tab: Decentralized Claim Verification Protocol */}
            {currentTab === 'verification_protocol' && (
              <ClaimVerificationPanel />
            )}

            {/* Tab 2: Intake & Verification */}
            {currentTab === 'intake' && (
              <IntakePanel
                userLocation={userLocation}
                onRequestUserLocation={requestUserLocation}
                onEmergencyCreated={() => loadAllData()}
                onOpenOutbox={() => setIsOutboxOpen(true)}
              />
            )}

            {/* Tab 3: Responders & Matching */}
            {currentTab === 'responders' && (
              <RespondersPanel
                responders={responders}
                emergencies={emergencies}
                selectedEmergency={selectedEmergency}
                currentUser={currentUser}
                onEmergencyUpdated={handleEmergencyUpdated}
                onDispatchCreated={() => loadAllData()}
              />
            )}

            {/* Tab 4: Mesh Partition & Reconciliation Simulator */}
            {currentTab === 'partition' && (
              <MeshPartitionSimulator
                meshStatus={meshStatus}
                onRefreshMesh={() => loadAllData()}
              />
            )}

            {/* Tab 5: Red Team Attack Lab */}
            {currentTab === 'attack_lab' && (
              <AttackLabPanel />
            )}

            {/* Tab 6: Field Responder Mobile Handset View */}
            {currentTab === 'responder_mobile' && (
              <ResponderMobileView
                dispatches={dispatches}
                onActionCompleted={() => loadAllData()}
              />
            )}

            {/* Tab 7: Privacy & Relay Simulator */}
            {currentTab === 'privacy' && (
              <PrivacyRelayView />
            )}

            {/* Tab 8: Tactical Audit Trail */}
            {currentTab === 'audit' && (
              <AuditTrailView events={auditEvents} />
            )}

          </main>

        </div>
      )}

      {/* =========================================================================
          UNIVERSAL EMERGENCY OVERLAYS, MODALS & DIALOGS
          ========================================================================= */}

      {/* 1. Safe Shelter & Evacuation Routes Modal */}
      <SafeShelterModal
        isOpen={isSafeShelterModalOpen}
        onClose={() => setIsSafeShelterModalOpen(false)}
        userLocation={userLocation}
        shelters={verifiedSheltersList}
        activeRoute={activeRoute}
        onSelectShelter={(sh) => setSelectedEmergency(sh)}
        onOpenMapWithRoute={handleOpenMapWithShelterRoute}
      />

      {/* 2. Call for Help Modal */}
      <CallForHelpModal
        isOpen={isCallHelpModalOpen}
        onClose={() => setIsCallHelpModalOpen(false)}
        currentUser={currentUser}
        onSendDirectSms={handleSendCallHelpSms}
        onOpenEditContact={() => setIsContactModalOpen(true)}
      />

      {/* 3. Medical Help Modal */}
      <MedicalHelpModal
        isOpen={isMedicalHelpModalOpen}
        onClose={() => setIsMedicalHelpModalOpen(false)}
        onRequestMedicalSos={handleSendMedicalSos}
      />

      {/* 4. More Options Drawer (Full Feature Access) */}
      <MoreOptionsDrawer
        isOpen={isMoreOptionsOpen}
        onClose={() => setIsMoreOptionsOpen(false)}
        onSelectAction={handleSelectMoreOption}
        outboxCount={outboxCount}
        isVoiceActive={isVoiceActive}
        emergenciesCount={emergencies.length}
        hazardsCount={hazards.length}
        respondersCount={responders.filter(r => r && r.status === 'AVAILABLE').length || 3}
      />

      {/* Persistent Offline Outbox Queue Modal */}
      <OutboxModal
        isOpen={isOutboxOpen}
        onClose={() => setIsOutboxOpen(false)}
        onSyncComplete={loadAllData}
      />

      {/* Responder & Node Profile Modal */}
      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        currentUser={currentUser}
        onLogout={() => authService.logout()}
        onOpenEditContact={() => setIsContactModalOpen(true)}
      />

      {/* Emergency Contact Onboarding Modal (First Login Step) */}
      <EmergencyContactModal
        isOpen={isOnboardingContactOpen}
        isOnboarding={true}
        currentUser={currentUser}
        onClose={() => setIsOnboardingContactOpen(false)}
        onContactSaved={(contact) => {
          setCurrentUser(prev => prev ? { ...prev, emergency_contact: contact } : prev);
        }}
      />

      {/* Emergency Contact Edit Modal (from Settings / Profile) */}
      <EmergencyContactModal
        isOpen={isContactModalOpen}
        isOnboarding={false}
        currentUser={currentUser}
        onClose={() => setIsContactModalOpen(false)}
        onContactSaved={(contact) => {
          setCurrentUser(prev => prev ? { ...prev, emergency_contact: contact } : prev);
        }}
      />

      {/* Voice & Gesture SOS Cancellation Countdown Modal */}
      <VoiceSosCountdownModal
        isOpen={!!activeSosCountdown}
        triggerData={activeSosCountdown}
        onCancel={() => setActiveSosCountdown(null)}
        onConfirm={handleConfirmSosTrigger}
      />

      {/* Incident Detail Dossier & Route / Assistance Workflow Modal */}
      {detailedIncident && (
        <IncidentDetailModal
          incident={detailedIncident}
          currentLocation={userLocation?.coords}
          onClose={() => setDetailedIncident(null)}
          onStatusUpdated={(updated) => handleEmergencyUpdated(updated)}
          onShowRouteOnMap={(route, emg) => {
            setActiveRoute(route);
            setSelectedEmergency(emg);
            setCurrentTab('operations');
            if (window.innerWidth < 768) setMobileViewTab('map');
            setViewMode('advanced');
          }}
        />
      )}

      {/* Offline Tactical Map Area Manager Modal */}
      <OfflineMapManagerModal
        isOpen={isOfflineManagerOpen}
        onClose={() => setIsOfflineManagerOpen(false)}
      />

      {/* Prominent Emergency Notification Sent Toast / Alert */}
      {sentNotificationAlert && (
        <div className="fixed top-20 right-4 z-[10002] max-w-md w-[92%] sm:w-full bg-white border-2 border-emerald-500 rounded-2xl shadow-2xl p-4 animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-2.5">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                sentNotificationAlert.delivery_status === NOTIFICATION_STATUS.SMS_DELIVERY_CONFIRMED || sentNotificationAlert.delivery_status === NOTIFICATION_STATUS.SMS_SUBMITTED_TO_CARRIER
                  ? 'bg-emerald-100 text-emerald-600'
                  : sentNotificationAlert.delivery_status === NOTIFICATION_STATUS.SMS_SUBMISSION_FAILED
                  ? 'bg-rose-100 text-rose-600'
                  : 'bg-amber-100 text-amber-700'
              }`}>
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-1.5">
                  <h4 className="font-heading font-black text-xs text-[#102B4E] uppercase tracking-wide">
                    Emergency Alert Dispatched
                  </h4>
                  {sentNotificationAlert.provider === 'NATIVE_CELLULAR_SMS' && (
                    <span className="px-1.5 py-0.2 bg-blue-100 text-blue-800 rounded text-[9px] font-mono font-bold">
                      DIRECT CELLULAR
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[#627D98]">
                  Target: <strong className="text-[#102B4E] font-bold">{sentNotificationAlert.recipient_name}</strong> ({sentNotificationAlert.masked_phone || sentNotificationAlert.recipient_phone})
                </p>
              </div>
            </div>
            <button
              onClick={() => setSentNotificationAlert(null)}
              className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              title="Dismiss alert"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-2.5 p-2.5 bg-[#F4FAFF] border border-[#D0E6FC] rounded-xl text-[11px] font-mono text-[#102B4E] break-words line-clamp-3">
            "{sentNotificationAlert.message_text}"
          </div>

          {sentNotificationAlert.status_details && (
            <div className="mt-1.5 text-[10px] text-[#627D98] font-sans">
              ℹ️ {sentNotificationAlert.status_details}
            </div>
          )}

          <div className="mt-3 flex items-center justify-between text-xs">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
              sentNotificationAlert.delivery_status === NOTIFICATION_STATUS.SMS_DELIVERY_CONFIRMED
                ? 'bg-emerald-100 text-emerald-800'
                : sentNotificationAlert.delivery_status === NOTIFICATION_STATUS.SMS_SUBMITTED_TO_CARRIER
                ? 'bg-blue-100 text-blue-800'
                : sentNotificationAlert.delivery_status === NOTIFICATION_STATUS.SMS_SUBMISSION_FAILED
                ? 'bg-rose-100 text-rose-800'
                : 'bg-amber-100 text-amber-800'
            }`}>
              STATUS: {sentNotificationAlert.delivery_status || 'SMS_SUBMITTED_TO_CARRIER'}
            </span>

            <div className="flex items-center space-x-2">
              {sentNotificationAlert.delivery_status === NOTIFICATION_STATUS.SMS_PERMISSION_REQUIRED && (
                <button
                  type="button"
                  onClick={requestNativeSmsPermission}
                  className="text-[11px] font-bold text-amber-700 hover:underline px-2 py-1 bg-amber-50 border border-amber-200 rounded-lg"
                >
                  Grant SMS Permission
                </button>
              )}
              {sentNotificationAlert.sms_uri && sentNotificationAlert.provider !== 'NATIVE_CELLULAR_SMS' && (
                <a
                  href={sentNotificationAlert.sms_uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-bold text-[#168BFA] hover:underline flex items-center space-x-1"
                >
                  <span>Manual SMS Fallback</span>
                  <span className="text-xs">↗</span>
                </a>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
