import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  AlertTriangle,
  Send,
  Sparkles,
  CheckCircle2,
  ShieldAlert,
  MapPin,
  Radio,
  Compass,
  Navigation,
  Database,
  CloudOff,
  Volume2,
  Copy,
  ExternalLink,
  Camera,
  Image as ImageIcon,
  X,
  Bluetooth,
  RefreshCw,
  Clock,
  Layers,
  HelpCircle,
  FileCheck2
} from 'lucide-react';

import { submitDistressIntake } from '../services/api';
import { queueOutboxReport, generateUUID } from '../services/offlineStorage';
import {
  generateLocationLink,
  buildLocationObject,
  getCurrentOrLastKnownLocation,
  formatLocationAge,
  copyLocationLinkToClipboard
} from '../services/locationService';
import {
  triageEmergencyLocally,
  EMERGENCY_CATEGORIES,
  URGENCY_LEVELS,
  RESOURCE_TYPES
} from '../services/localAiTriage';
import {
  bluetoothTransport,
  BLE_PACKET_STATUS
} from '../services/bluetoothTransport';
import AudioVoiceReport from './AudioVoiceReport';

const SAMPLES = [
  { lang: 'en', label: 'EN: Insulin & Flood', text: "Need insulin for dad, ground floor flooded, water rising quickly." },
  { lang: 'hi', label: 'HI: बाढ़ व नाव (Hindi)', text: "बाढ़ का पानी घर में तेजी से घुस रहा है, तुरंत नाव और चिकित्सा सहायता भेजो।" },
  { lang: 'mr', label: 'MR: पुर व औषध (Marathi)', text: "घरात पुराचे पाणी वेगाने शिरत आहे, वृद्ध व्यक्तीला तातडीने इन्सुलिन औषध हवे." },
  { lang: 'en', label: 'EN: Structural Collapse', text: "Building wall collapsed after rain; 2 people trapped with broken limbs, road blocked by rubble." },
  { lang: 'en', label: 'EN: High Urgency Medical', text: "Elderly person unconscious with chest pain and difficulty breathing, need ambulance immediately." }
];

const AVAILABLE_RESOURCES = [
  { id: RESOURCE_TYPES.FIRST_AID, label: 'Medical Aid / First Aid' },
  { id: RESOURCE_TYPES.BOAT, label: 'Rescue Boat / Zodiac' },
  { id: RESOURCE_TYPES.TRANSPORT, label: 'Evacuation Transport' },
  { id: RESOURCE_TYPES.FOOD_WATER, label: 'Food & Drinking Water' },
  { id: RESOURCE_TYPES.OXYGEN, label: 'Oxygen / Respirator' },
  { id: RESOURCE_TYPES.SEARCH_RESCUE, label: 'Search & Extraction' },
  { id: RESOURCE_TYPES.STRETCHER, label: 'Stretcher / Immobilizer' }
];

export default function IntakePanel({ userLocation, onRequestUserLocation, onEmergencyCreated, onOpenOutbox }) {
  // Form State
  const [rawText, setRawText] = useState(SAMPLES[0].text);
  const [selectedLang, setSelectedLang] = useState('en-IN');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedResources, setSelectedResources] = useState([]);
  const [landmark, setLandmark] = useState('');
  const [photoPreview, setPhotoPreview] = useState(null);
  const [audioData, setAudioData] = useState(null);

  // Location State
  const [locationObj, setLocationObj] = useState(() => {
    const lat = Number(userLocation?.coords?.lat);
    const lng = Number(userLocation?.coords?.lng);
    if (userLocation?.coords && isFinite(lat) && isFinite(lng)) {
      const isCached = !userLocation.isRealGps || Boolean(userLocation.coords.is_last_known) || userLocation.coords.source === 'LAST_KNOWN';
      return buildLocationObject({
        latitude: lat,
        longitude: lng,
        accuracy_meters: userLocation.coords.accuracy || 15,
        measured_at: userLocation.coords.measured_at || userLocation.coords.timestamp,
        saved_at: userLocation.coords.saved_at,
        source: isCached ? 'LAST_KNOWN' : 'CURRENT',
        is_fresh: !isCached
      });
    }
    return buildLocationObject({
      latitude: null,
      longitude: null,
      accuracy_meters: null,
      source: 'UNAVAILABLE'
    });
  });

  const [isRefreshingLocation, setIsRefreshingLocation] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Submission & Bluetooth State
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [offlineQueued, setOfflineQueued] = useState(null);
  const [bleTransmitted, setBleTransmitted] = useState(null);
  const [bleStatus, setBleStatus] = useState({ isConnected: false, message: 'Ready' });
  const [errorMsg, setErrorMsg] = useState('');

  const fileInputRef = useRef(null);

  // Sync with userLocation prop when GPS permission is granted or updated
  useEffect(() => {
    const lat = Number(userLocation?.coords?.lat);
    const lng = Number(userLocation?.coords?.lng);
    if (userLocation?.coords && isFinite(lat) && isFinite(lng)) {
      const isCached = !userLocation.isRealGps || Boolean(userLocation.coords.is_last_known) || userLocation.coords.source === 'LAST_KNOWN';
      setLocationObj(buildLocationObject({
        latitude: lat,
        longitude: lng,
        accuracy_meters: userLocation.coords.accuracy || 15,
        measured_at: userLocation.coords.measured_at || userLocation.coords.timestamp,
        saved_at: userLocation.coords.saved_at,
        source: isCached ? 'LAST_KNOWN' : 'CURRENT',
        is_fresh: !isCached
      }));
    } else if (userLocation?.status === 'denied' || !userLocation?.coords) {
      setLocationObj(prev => {
        if (prev?.latitude != null && prev?.longitude != null) {
          return { ...prev, location_source: 'LAST_KNOWN', is_fresh: false };
        }
        return buildLocationObject({ latitude: null, longitude: null, source: 'UNAVAILABLE' });
      });
    }
  }, [userLocation]);

  // Listen to Bluetooth status updates
  useEffect(() => {
    const unsub = bluetoothTransport.onStatusChange((statusInfo) => {
      setBleStatus({
        isConnected: statusInfo.isHardwareConnected,
        message: statusInfo.message
      });
    });

    const unsubAck = bluetoothTransport.onAckReceived((ackInfo) => {
      setBleTransmitted(prev => {
        if (prev && prev.alert_id === ackInfo.alert_id) {
          return { ...prev, status: BLE_PACKET_STATUS.ACKNOWLEDGED, ack_by: ackInfo.ack_by };
        }
        return prev;
      });
    });

    return () => {
      unsub();
      unsubAck();
    };
  }, []);

  // Real-time On-Device AI Triage (Pure Client-Side, No Network)
  const localTriage = useMemo(() => {
    return triageEmergencyLocally(rawText, selectedCategory, selectedResources);
  }, [rawText, selectedCategory, selectedResources]);

  // Request fresh location or fallback to last-known
  const handleRefreshLocation = async () => {
    setIsRefreshingLocation(true);
    try {
      const loc = await getCurrentOrLastKnownLocation(3500);
      setLocationObj(loc);
    } catch (e) {
      console.warn('Location refresh error:', e);
    } finally {
      setIsRefreshingLocation(false);
    }
  };

  const handleCopyLink = async () => {
    if (!locationObj?.location_link) return;
    const ok = await copyLocationLinkToClipboard(locationObj.location_link);
    if (ok) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const toggleResource = (resId) => {
    setSelectedResources(prev => {
      if (prev.includes(resId)) return prev.filter(r => r !== resId);
      return [...prev, resId];
    });
  };

  // Photo handling
  const handlePhotoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setPhotoPreview(event.target?.result);
    };
    reader.readAsDataURL(file);
  };

  // Connect Web Bluetooth Gateway / Peer
  const handleConnectBluetooth = async () => {
    try {
      await bluetoothTransport.connectHardwareDevice();
    } catch (err) {
      console.warn('Bluetooth connection cancelled or unavailable:', err.message);
    }
  };

  // Handle Form Submit
  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!rawText.trim() && !landmark.trim()) {
      setErrorMsg('Please provide an emergency description or landmark.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    setOfflineQueued(null);
    setBleTransmitted(null);

    // 1. Build canonical Emergency Message Packet matching Section 5 schema
    const blePacket = bluetoothTransport.createEmergencyPacket({
      type: 'HELP',
      category: localTriage.category,
      urgency: localTriage.urgency,
      reason: localTriage.reason,
      help_needed: localTriage.help_needed,
      location: locationObj,
      landmark: landmark.trim() || null
    });

    // 2. Transmit via Bluetooth transport (Hardware BLE and/or local Mesh Broadcast)
    try {
      const txResult = await bluetoothTransport.broadcastEmergencyPacket(blePacket);
      setBleTransmitted({
        ...blePacket,
        status: txResult.status
      });
    } catch (bleErr) {
      console.warn('BLE broadcast exception:', bleErr);
    }

    // 3. Save to persistent offline outbox (IndexedDB)
    const outboxPayload = {
      raw_text: rawText,
      lat: locationObj.latitude || 21.1458,
      lng: locationObj.longitude || 79.0882,
      location_accuracy_meters: locationObj.accuracy_meters || 15,
      location_link: locationObj.location_link,
      location_source: locationObj.location_source,
      location_age_seconds: locationObj.location_age_seconds,
      landmark: landmark.trim() || null,
      reporter_node_id: blePacket.device_id,
      client_message_id: blePacket.alert_id,
      detected_language: selectedLang.split('-')[0],
      triage: localTriage,
      photo: photoPreview,
      audio_metadata: audioData ? {
        durationSeconds: audioData.durationSeconds,
        mimeType: audioData.mimeType,
        sizeBytes: audioData.sizeBytes
      } : null,
      audio_evidence: audioData?.base64 || null
    };

    // 4. Also attempt server sync if network happens to be online
    try {
      const res = await submitDistressIntake(outboxPayload);
      setResult(res);

      await queueOutboxReport({
        ...outboxPayload,
        initial_status: 'ACKNOWLEDGED'
      });

      if (onEmergencyCreated) onEmergencyCreated(res);
    } catch (netErr) {
      // Offline fallback: Queue in IndexedDB
      console.log('Running in offline-first mode. Report safely queued locally:', netErr.message);
      const queued = await queueOutboxReport({
        ...outboxPayload,
        initial_status: 'QUEUED'
      });
      setOfflineQueued(queued);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full overflow-y-auto p-4 sm:p-6 bg-navy-950">
      
      {/* Column 1: Emergency Report Form (7 cols) */}
      <div className="lg:col-span-7 bg-navy-900 border border-navy-800 rounded-xl p-5 sm:p-6 space-y-5 shadow-xl">
        
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-navy-800 pb-3 gap-2">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded bg-cyan/15 border border-cyan/40 flex items-center justify-center text-cyan shadow-sm">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-heading font-bold text-base text-slate-100 uppercase tracking-wide">
                Emergency Distress Reporting
              </h1>
              <p className="text-xs text-slate-400 font-mono">
                Decentralized • On-Device AI Triage • Location Links • Offline BLE Mesh
              </p>
            </div>
          </div>

          {/* Bluetooth Gateway Pairing Trigger */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleConnectBluetooth}
              className={`px-2.5 py-1.5 rounded text-[11px] font-mono font-bold flex items-center gap-1.5 border transition ${
                bleStatus.isConnected
                  ? 'bg-emerald-950 border-emerald-500 text-emerald-300'
                  : 'bg-navy-950 border-navy-700 text-slate-300 hover:border-cyan hover:text-cyan'
              }`}
              title="Pair with hardware Bluetooth gateway or relay node"
            >
              <Bluetooth className="w-3.5 h-3.5 text-cyan" />
              <span>{bleStatus.isConnected ? 'BLE GATEWAY CONNECTED' : 'PAIR BLE GATEWAY'}</span>
            </button>
          </div>
        </div>

        {/* Location Status & Shareable Map Link Card */}
        <div className="bg-navy-950 border border-navy-800 rounded-lg p-3.5 space-y-2.5">
          <div className="flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-cyan" />
              <span className="font-bold text-slate-200">LOCATION TELEMETRY:</span>
              {locationObj.location_source === 'CURRENT' && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 border border-emerald-500/50 text-emerald-300 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  CURRENT GPS FIX
                </span>
              )}
              {locationObj.location_source === 'LAST_KNOWN' && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950 border border-amber-500/50 text-amber-300 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-amber-400" />
                  LAST KNOWN ({formatLocationAge(locationObj.location_age_seconds)})
                </span>
              )}
              {!locationObj.location_source && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-950 border border-rose-500/50 text-rose-300">
                  NO GPS FIX
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={handleRefreshLocation}
              disabled={isRefreshingLocation}
              className="text-cyan hover:text-cyan-300 text-[11px] font-bold flex items-center gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${isRefreshingLocation ? 'animate-spin' : ''}`} />
              <span>{isRefreshingLocation ? 'Fixing...' : 'REFRESH GPS'}</span>
            </button>
          </div>

          {/* Generated Shareable Map Link Box */}
          {locationObj.location_link ? (
            <div className="p-2.5 rounded bg-navy-900 border border-cyan/30 flex items-center justify-between gap-2 text-xs font-mono">
              <div className="flex items-center gap-2 truncate text-cyan-200">
                <ExternalLink className="w-3.5 h-3.5 text-cyan shrink-0" />
                <span className="truncate">{locationObj.location_link}</span>
              </div>
              <button
                type="button"
                onClick={handleCopyLink}
                className="px-2 py-1 rounded bg-cyan/20 hover:bg-cyan/30 border border-cyan/40 text-cyan text-[10px] font-bold shrink-0 flex items-center gap-1 transition"
              >
                <Copy className="w-3 h-3" />
                <span>{copiedLink ? 'COPIED!' : 'COPY MAP LINK'}</span>
              </button>
            </div>
          ) : (
            <div className="text-[11px] text-amber-400 font-mono italic">
              GPS unavailable. Please enter a landmark below so responders can find you.
            </div>
          )}

          {/* Diagnostic Raw Coordinates & Accuracy Footer */}
          {locationObj.latitude !== null && (
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-1">
              <span>Coordinates: {locationObj.latitude.toFixed(5)}°N, {locationObj.longitude.toFixed(5)}°E</span>
              <span>Accuracy: ±{locationObj.accuracy_meters}m</span>
            </div>
          )}
        </div>

        {/* Multilingual Audio Voice Note Recorder Component */}
        <AudioVoiceReport
          selectedLang={selectedLang}
          onLangChange={(code) => setSelectedLang(code)}
          onTranscriptReady={(transcript) => setRawText(transcript)}
          onAudioBlobReady={(info) => setAudioData(info)}
        />

        {/* Quick Emergency Test Cases */}
        <div>
          <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1.5">
            Quick Emergency Test Cases (Multilingual):
          </label>
          <div className="flex flex-wrap gap-1.5 text-xs">
            {SAMPLES.map((s, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setRawText(s.text);
                  if (s.lang === 'hi') setSelectedLang('hi-IN');
                  else if (s.lang === 'mr') setSelectedLang('mr-IN');
                  else setSelectedLang('en-IN');
                }}
                className={`px-2.5 py-1.5 rounded-sm text-left border transition text-[11px] font-sans ${
                  rawText === s.text
                    ? 'border-cyan bg-cyan/15 text-cyan font-medium'
                    : 'border-navy-800 bg-navy-950 text-slate-300 hover:border-navy-700'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Main Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Emergency Description */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-mono uppercase text-slate-300 font-bold">
                Emergency Description *
              </label>
              {audioData && (
                <span className="text-[10px] font-mono text-cyan flex items-center gap-1">
                  <Volume2 className="w-3 h-3" />
                  <span>Voice Note Attached ({Math.round(audioData.sizeBytes / 1024)} KB)</span>
                </span>
              )}
            </div>
            <textarea
              rows={3}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              className="w-full p-3 bg-navy-950 border border-navy-700 rounded-sm text-xs text-slate-100 font-sans focus:outline-none focus:border-cyan leading-relaxed"
              placeholder="Describe what happened, who is affected, and immediate hazards..."
            />
          </div>

          {/* Category & Landmark Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
                Emergency Category (If Known)
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full p-2 bg-navy-950 border border-navy-700 rounded text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan"
              >
                <option value="">Auto-Detect via On-Device AI</option>
                <option value={EMERGENCY_CATEGORIES.MEDICAL}>Medical Emergency</option>
                <option value={EMERGENCY_CATEGORIES.FLOOD_RESCUE}>Flood / Water Rescue</option>
                <option value={EMERGENCY_CATEGORIES.STRUCTURAL_COLLAPSE}>Structural Collapse / Rubble</option>
                <option value={EMERGENCY_CATEGORIES.FIRE_HAZARD}>Fire / Gas Hazard</option>
                <option value={EMERGENCY_CATEGORIES.SUPPLY_DEFICIT}>Critical Food / Water Deficit</option>
                <option value={EMERGENCY_CATEGORIES.GENERAL}>General Distress</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
                Landmark / Local Description (Optional)
              </label>
              <input
                type="text"
                value={landmark}
                onChange={(e) => setLandmark(e.target.value)}
                placeholder="e.g. Near St. Mary Church, 2nd cross road"
                className="w-full p-2 bg-navy-950 border border-navy-700 rounded text-xs text-slate-200 font-sans focus:outline-none focus:border-cyan"
              />
            </div>
          </div>

          {/* Help Required Multi-Select Chips */}
          <div>
            <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1.5">
              Specific Help Required (Select All That Apply):
            </label>
            <div className="flex flex-wrap gap-1.5 text-xs font-mono">
              {AVAILABLE_RESOURCES.map((res) => {
                const isSelected = selectedResources.includes(res.id);
                return (
                  <button
                    key={res.id}
                    type="button"
                    onClick={() => toggleResource(res.id)}
                    className={`px-2.5 py-1 rounded border text-[11px] transition ${
                      isSelected
                        ? 'bg-cyan/20 border-cyan text-white font-bold'
                        : 'bg-navy-950 border-navy-800 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    {isSelected ? '✓ ' : '+ '}{res.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Photograph Upload (Optional) */}
          <div className="border border-dashed border-navy-700 rounded-lg p-3 bg-navy-950/60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
                <Camera className="w-4 h-4 text-cyan" />
                <span>Attach Incident Photograph (Optional)</span>
              </div>
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                onChange={handlePhotoSelect}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-2.5 py-1 rounded bg-navy-900 hover:bg-navy-800 border border-navy-700 text-slate-300 text-xs font-mono"
              >
                {photoPreview ? 'Change Photo' : 'Upload / Snap Photo'}
              </button>
            </div>

            {photoPreview && (
              <div className="relative mt-2 inline-block">
                <img
                  src={photoPreview}
                  alt="Emergency preview"
                  className="w-24 h-24 object-cover rounded border border-cyan/40 shadow-md"
                />
                <button
                  type="button"
                  onClick={() => setPhotoPreview(null)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rose-600 text-white rounded-full flex items-center justify-center text-xs"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-950/60 border border-rose-500 text-rose-200 text-xs rounded font-mono">
              {errorMsg}
            </div>
          )}

          {/* Offline Outbox Notification */}
          {offlineQueued && (
            <div className="p-3 bg-amber-950/40 border border-amber-500/50 text-amber-200 text-xs rounded font-mono space-y-1">
              <div className="flex items-center gap-2 font-bold text-amber-300">
                <CloudOff className="w-4 h-4 text-amber-400" />
                <span>STORED SAFELY IN OFFLINE OUTBOX (INDEXEDDB)</span>
              </div>
              <p className="text-[11px] text-slate-300">
                Alert ID: <span className="text-amber-300 font-bold">{offlineQueued.client_message_id}</span>. Cached locally and ready for automatic sync upon peer reconnect.
              </p>
              {onOpenOutbox && (
                <button
                  type="button"
                  onClick={onOpenOutbox}
                  className="text-cyan underline text-[11px] font-bold hover:text-cyan-300 block"
                >
                  View Offline Outbox Queue →
                </button>
              )}
            </div>
          )}

          {/* BLE Broadcast Status Notification */}
          {bleTransmitted && (
            <div className="p-3 bg-cyan-950/40 border border-cyan-500/50 text-cyan-200 text-xs rounded font-mono space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-cyan">
                  <Radio className="w-4 h-4 text-cyan animate-pulse" />
                  <span>BLUETOOTH MESH PACKET BROADCASTED</span>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  bleTransmitted.status === BLE_PACKET_STATUS.ACKNOWLEDGED
                    ? 'bg-emerald-950 border border-emerald-500 text-emerald-300'
                    : 'bg-cyan-950 border border-cyan-500 text-cyan'
                }`}>
                  {bleTransmitted.status}
                </span>
              </div>
              <p className="text-[11px] text-slate-300">
                Packet transmitted across local Bluetooth mesh channels. TTL: {bleTransmitted.ttl} hops.
                {bleTransmitted.ack_by && (
                  <span className="text-emerald-300 block mt-0.5">
                    ✓ Acknowledged by nearby responder node: {bleTransmitted.ack_by}
                  </span>
                )}
              </p>
            </div>
          )}

          {/* Submit Action Buttons */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-cyan hover:bg-cyan-400 text-navy-950 font-mono font-black text-xs uppercase tracking-wider rounded transition flex items-center justify-center space-x-2 shadow-lg shadow-cyan/20"
            >
              <Send className="w-4 h-4" />
              <span>{loading ? 'ANALYZING & TRANSMITTING...' : 'SUBMIT EMERGENCY ALERT (OFFLINE-CAPABLE)'}</span>
            </button>
          </div>

        </form>

      </div>

      {/* Column 2: On-Device AI Triage & Compact Message Packet (5 cols) */}
      <div className="lg:col-span-5 space-y-5">
        
        {/* On-Device AI Triage Card */}
        <div className="bg-navy-900 border border-navy-800 rounded-xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-navy-800 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-cyan" />
              <h2 className="font-heading font-bold text-base text-slate-100 uppercase tracking-wide">
                On-Device AI Triage
              </h2>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan/15 text-cyan border border-cyan/40 font-bold">
              100% LOCAL / OFFLINE
            </span>
          </div>

          {/* Urgency & Category Banner */}
          <div className="grid grid-cols-2 gap-3 font-mono text-xs">
            <div className="bg-navy-950 p-3 rounded-lg border border-navy-800 space-y-1">
              <span className="text-[10px] text-slate-400 uppercase">CLASSIFIED URGENCY</span>
              <div className="flex items-center gap-1.5">
                <span className={`px-2.5 py-0.5 rounded font-black text-xs ${
                  localTriage.urgency === URGENCY_LEVELS.CRITICAL
                    ? 'bg-rose-950 text-rose-300 border border-rose-500'
                    : localTriage.urgency === URGENCY_LEVELS.HIGH
                    ? 'bg-amber-950 text-amber-300 border border-amber-500'
                    : localTriage.urgency === URGENCY_LEVELS.MODERATE
                    ? 'bg-cyan-950 text-cyan border border-cyan/40'
                    : 'bg-slate-900 text-slate-300 border border-slate-700'
                }`}>
                  {localTriage.urgency}
                </span>
              </div>
            </div>

            <div className="bg-navy-950 p-3 rounded-lg border border-navy-800 space-y-1">
              <span className="text-[10px] text-slate-400 uppercase">INCIDENT CATEGORY</span>
              <div className="font-bold text-slate-200 text-xs truncate">
                {localTriage.category.replace(/_/g, ' ')}
              </div>
            </div>
          </div>

          {/* AI Explanation */}
          <div className="p-3 bg-navy-950 border border-navy-800 rounded-lg text-xs space-y-1">
            <div className="text-[10px] font-mono text-slate-400 uppercase font-bold">
              AI Urgency Explanation:
            </div>
            <p className="text-slate-200 leading-relaxed font-sans">
              {localTriage.reason}
            </p>
          </div>

          {/* Identified Resources */}
          <div>
            <div className="text-[11px] font-mono text-slate-400 uppercase mb-1.5 font-bold">
              Identified Resources Required:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {localTriage.help_needed.map((res) => (
                <span
                  key={res}
                  className="px-2 py-0.5 bg-cyan/15 text-cyan border border-cyan/40 rounded text-xs font-mono font-bold"
                >
                  {res.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </div>

          {/* Verification Status Pill */}
          <div className="p-2.5 bg-navy-950 rounded border border-navy-800 flex items-center justify-between text-xs font-mono">
            <span className="text-slate-400">INITIAL VERIFICATION STATUS:</span>
            <span className="px-2 py-0.5 rounded font-bold bg-amber-950/80 border border-amber-500/50 text-amber-300 text-[11px]">
              {localTriage.verification_status}
            </span>
          </div>

          <p className="text-[10px] text-slate-500 font-sans italic">
            * Note: AI triage provides priority guidance and never suppresses alerts. All reports are broadcasted to responders regardless of confidence.
          </p>
        </div>

        {/* Compact Emergency Packet JSON Inspector (Section 5 Schema) */}
        <div className="bg-navy-900 border border-navy-800 rounded-xl p-4 shadow-xl space-y-2 text-xs font-mono">
          <div className="flex items-center justify-between border-b border-navy-800 pb-2">
            <div className="flex items-center gap-1.5 text-slate-300 font-bold uppercase text-[11px]">
              <Layers className="w-4 h-4 text-cyan" />
              <span>Compact Bluetooth Packet Inspector</span>
            </div>
            <span className="text-[10px] text-cyan font-bold">PROTOCOL V1</span>
          </div>

          <pre className="p-3 bg-navy-950 rounded border border-navy-800/80 text-cyan-200 overflow-x-auto text-[11px] max-h-56 leading-relaxed">
{JSON.stringify({
  protocol_version: 1,
  alert_id: bleTransmitted?.alert_id || 'alert-preview-01',
  type: 'HELP',
  category: localTriage.category,
  urgency: localTriage.urgency,
  verification_status: localTriage.verification_status,
  reason: localTriage.reason,
  help_needed: localTriage.help_needed,
  location_link: locationObj.location_link,
  latitude: locationObj.latitude,
  longitude: locationObj.longitude,
  location_source: locationObj.location_source,
  location_timestamp: locationObj.location_timestamp,
  location_age_seconds: locationObj.location_age_seconds,
  accuracy_meters: locationObj.accuracy_meters,
  landmark: landmark.trim() || null,
  created_at: new Date().toISOString(),
  device_id: 'citizen-node-7b9c',
  sequence_number: 1,
  ttl: 5
}, null, 2)}
          </pre>
        </div>

      </div>

    </div>
  );
}
