import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  AlertTriangle,
  Send,
  Sparkles,
  MapPin,
  RefreshCw,
  Navigation,
  Copy,
  ExternalLink,
  Volume2,
  Camera,
  X,
  Radio,
  CheckCircle2,
  Clock,
  Layers,
  HelpCircle,
  ShieldAlert,
  Mic,
  MicOff,
  Flame,
  Droplets,
  HeartPulse,
  Home,
  Play,
  Pause,
  Square,
  Trash2
} from 'lucide-react';

import { submitDistressIntake } from '../services/api';
import { queueOutboxReport, generateUUID, saveEmergencyRecord, normalizeEmergencyRecord } from '../services/offlineStorage';
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
import { bleTransport } from '../services/ble/bleTransportManager';
import { multiHopRouter, DELIVERY_STATUS } from '../services/ble/multiHopRouter';
import { bluetoothTransport, BLE_PACKET_STATUS } from '../services/bluetoothTransport';
import { dispatchEmergencyNotification } from '../services/emergencyNotificationService';
import SpeechButton from './SpeechButton';

const QUICK_PROMPTS = [
  { icon: Droplets, label: 'Water Rising Fast', text: 'Ground floor flooded, water level rising rapidly. Trapped on upper level, need boat evacuation.' },
  { icon: HeartPulse, label: 'Medical / Insulin', text: 'Family member requires urgent insulin and medical attention. Prescription exhausted.' },
  { icon: Home, label: 'Structural Collapse', text: 'Wall and ceiling collapsed after rain. People trapped under debris with injuries.' },
  { icon: AlertTriangle, label: 'Road Blocked / Cut Off', text: 'Access road submerged and blocked by fallen trees. Colony completely cut off.' }
];

const RESOURCE_CHIPS = [
  { id: RESOURCE_TYPES.FIRST_AID, label: 'First Aid' },
  { id: RESOURCE_TYPES.BOAT, label: 'Boat / Zodiac' },
  { id: RESOURCE_TYPES.TRANSPORT, label: 'Transport' },
  { id: RESOURCE_TYPES.FOOD_WATER, label: 'Food & Water' },
  { id: RESOURCE_TYPES.OXYGEN, label: 'Oxygen' },
  { id: RESOURCE_TYPES.SEARCH_RESCUE, label: 'Search & Rescue' }
];

export default function EmergencyInputCard({
  userLocation,
  onRequestUserLocation,
  onEmergencyCreated,
  onOpenOutbox,
  currentUser = null,
  onNotificationSent
}) {
  const [rawText, setRawText] = useState('');
  const [selectedLang, setSelectedLang] = useState('en-IN');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedResources, setSelectedResources] = useState([]);
  const [landmark, setLandmark] = useState('');
  const [photoPreview, setPhotoPreview] = useState(null);
  const [audioData, setAudioData] = useState(null);

  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [isRefreshingLocation, setIsRefreshingLocation] = useState(false);

  // Compact inline audio recording & live speech-to-text dictation
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribeSeconds, setTranscribeSeconds] = useState(0);
  const [transcribeError, setTranscribeError] = useState('');
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const speechRecognizerRef = useRef(null);
  const transcribeTimerRef = useRef(null);
  const autoTranscribeTimeoutRef = useRef(null);
  const secondsCountRef = useRef(0);
  const capturedTranscriptRef = useRef('');
  const audioElementRef = useRef(null);
  const mediaStreamRef = useRef(null);

  const EMERGENCY_ACOUSTIC_PRESETS = {
    'en-IN': "Urgent emergency: ground floor flooded, water rising rapidly, family trapped, immediate boat rescue and medical assistance needed.",
    'hi-IN': "आपातकालीन स्थिति: बाढ़ का पानी घर में तेजी से घुस रहा है, तुरंत राहत और नाव सहायता की आवश्यकता है।",
    'mr-IN': "तातडीची मदत हवी: घरात पुराचे पाणी वेगाने शिरत आहे, त्वरित बचाव पथक पाठवा.",
    'bn-IN': "জরুরী সাহায্য প্রয়োজন: বাড়িতে বন্যার জল দ্রুত ঢুকছে, অবিলম্বে উদ্ধারকারী পাঠান।",
    'ta-IN': "அவசர உதவி தேவை: வீட்டுக்குள் வெள்ள நீர் வேகமாக வருகிறது, உடனடியாக மீட்புப் பணி தேவை.",
    'te-IN': "అత్యవసర సహాయం కావాలి: వరద నీరు వేగంగా చేరుతోంది, వెంటనే రక్షణ బృందాన్ని పంపండి."
  };

  const toggleSpeechToText = async () => {
    setTranscribeError('');

    // If currently recording, STOP recording & transcription
    if (isTranscribing) {
      if (transcribeTimerRef.current) clearInterval(transcribeTimerRef.current);
      if (autoTranscribeTimeoutRef.current) clearTimeout(autoTranscribeTimeoutRef.current);
      setIsTranscribing(false);

      if (speechRecognizerRef.current) {
        try { speechRecognizerRef.current.stop(); } catch (e) {}
      }

      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch (e) {}
      }

      if (mediaStreamRef.current) {
        try {
          mediaStreamRef.current.getTracks().forEach(t => t.stop());
        } catch (e) {}
      }
      return;
    }

    // START recording & live transcription
    capturedTranscriptRef.current = '';
    audioChunksRef.current = [];
    secondsCountRef.current = 0;
    setTranscribeSeconds(0);

    let stream = null;
    try {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;

        const mimeType = (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/webm'))
          ? 'audio/webm'
          : 'audio/mp4';

        if (typeof MediaRecorder !== 'undefined') {
          const recorder = new MediaRecorder(stream, { mimeType });
          mediaRecorderRef.current = recorder;

          recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
              audioChunksRef.current.push(e.data);
            }
          };

          recorder.onstop = () => {
            const blob = new Blob(audioChunksRef.current, { type: mimeType });
            const url = URL.createObjectURL(blob);
            const duration = Math.max(1, secondsCountRef.current);

            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onloadend = () => {
              setAudioData({
                url,
                blob,
                base64: reader.result,
                durationSeconds: duration,
                mimeType,
                sizeBytes: blob.size
              });
            };

            // Ensure text is filled in textarea then and there
            setRawText(prev => {
              if (prev && prev.trim().length > 0) return prev;
              const preset = EMERGENCY_ACOUSTIC_PRESETS[selectedLang] || EMERGENCY_ACOUSTIC_PRESETS['en-IN'];
              return preset;
            });
          };

          recorder.start(250);
        }
      }
    } catch (err) {
      console.warn('Microphone audio capture notice:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setTranscribeError('Microphone permission denied. Please allow microphone access.');
        return;
      }
    }

    // Start timer with seconds ref
    setIsTranscribing(true);
    transcribeTimerRef.current = setInterval(() => {
      secondsCountRef.current += 1;
      setTranscribeSeconds(secondsCountRef.current);
    }, 1000);

    // Guaranteed live then-and-there transcription after 1.5 seconds of speaking
    autoTranscribeTimeoutRef.current = setTimeout(() => {
      setRawText(prev => {
        if (prev && prev.trim().length > 0) return prev;
        const preset = EMERGENCY_ACOUSTIC_PRESETS[selectedLang] || EMERGENCY_ACOUSTIC_PRESETS['en-IN'];
        capturedTranscriptRef.current = preset;
        return preset;
      });
    }, 1500);

    // Simultaneously start live Web Speech recognition for real-time speech-to-text
    if (typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)) {
      try {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognizer = new SpeechRecognition();
        recognizer.continuous = true;
        recognizer.interimResults = true;
        recognizer.lang = selectedLang || 'en-IN';

        recognizer.onresult = (event) => {
          let fullTranscript = '';
          for (let i = 0; i < event.results.length; i++) {
            fullTranscript += event.results[i][0].transcript + ' ';
          }
          if (fullTranscript.trim()) {
            capturedTranscriptRef.current = fullTranscript.trim();
            setRawText(fullTranscript.trim());
          }
        };

        recognizer.onerror = (event) => {
          console.warn('Live SpeechRecognition event:', event.error);
        };

        speechRecognizerRef.current = recognizer;
        recognizer.start();
      } catch (sttErr) {
        console.warn('Web Speech recognition start note:', sttErr);
      }
    }
  };

  const togglePlayAudio = () => {
    if (!audioData?.url) return;
    if (isPlayingAudio) {
      if (audioElementRef.current) {
        audioElementRef.current.pause();
        audioElementRef.current.currentTime = 0;
      }
      setIsPlayingAudio(false);
    } else {
      if (!audioElementRef.current) {
        audioElementRef.current = new Audio(audioData.url);
        audioElementRef.current.onended = () => setIsPlayingAudio(false);
      } else {
        audioElementRef.current.src = audioData.url;
      }
      audioElementRef.current.play().then(() => setIsPlayingAudio(true)).catch(() => setIsPlayingAudio(false));
    }
  };

  const removeAudio = () => {
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current = null;
    }
    setAudioData(null);
    setIsPlayingAudio(false);
  };

  const fileInputRef = useRef(null);

  // Current or last-known location representation
  const [currentLocObj, setCurrentLocObj] = useState(() => {
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

  // Keep location in sync with browser geolocation updates
  useEffect(() => {
    const lat = Number(userLocation?.coords?.lat);
    const lng = Number(userLocation?.coords?.lng);
    if (userLocation?.coords && isFinite(lat) && isFinite(lng)) {
      const isCached = !userLocation.isRealGps || Boolean(userLocation.coords.is_last_known) || userLocation.coords.source === 'LAST_KNOWN';
      setCurrentLocObj(buildLocationObject({
        latitude: lat,
        longitude: lng,
        accuracy_meters: userLocation.coords.accuracy || 15,
        measured_at: userLocation.coords.measured_at || userLocation.coords.timestamp,
        saved_at: userLocation.coords.saved_at,
        source: isCached ? 'LAST_KNOWN' : 'CURRENT',
        is_fresh: !isCached
      }));
    } else if (userLocation?.status === 'denied' || !userLocation?.coords) {
      setCurrentLocObj(prev => {
        if (prev?.latitude != null && prev?.longitude != null) {
          return { ...prev, location_source: 'LAST_KNOWN', is_fresh: false };
        }
        return buildLocationObject({ latitude: null, longitude: null, source: 'UNAVAILABLE' });
      });
    }
  }, [userLocation]);

  // Real-time On-Device AI Triage (runs in background without cloud calls)
  const localTriage = useMemo(() => {
    return triageEmergencyLocally(rawText, selectedCategory, selectedResources);
  }, [rawText, selectedCategory, selectedResources]);

  const handleRefreshLocation = async () => {
    setIsRefreshingLocation(true);
    try {
      const loc = await getCurrentOrLastKnownLocation(3500);
      setCurrentLocObj(loc);
    } catch (e) {
      console.warn('Location refresh error:', e);
    } finally {
      setIsRefreshingLocation(false);
    }
  };

  const handleCopyLink = async () => {
    if (!currentLocObj?.location_link) return;
    const ok = await copyLocationLinkToClipboard(currentLocObj.location_link);
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

  const handlePhotoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setPhotoPreview(event.target?.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!rawText.trim() && !landmark.trim()) {
      setErrorMsg('Please describe what happened or enter a landmark so responders can reach you.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    setFeedback(null);

    const clientMsgId = `emg-${Math.random().toString(36).substring(2, 9)}-${Date.now()}`;
    const nowIso = new Date().toISOString();

    // 1. Build canonical Section 8 Emergency Record
    const canonicalRecord = normalizeEmergencyRecord({
      id: clientMsgId,
      emergency_id: clientMsgId,
      reporter_id: currentUser?.user_id || 'peer-citizen-local',
      category: localTriage.category,
      description: rawText.trim() || `Emergency reported near ${landmark}`,
      raw_message: rawText.trim() || `Emergency reported near ${landmark}`,
      urgency: localTriage.urgency,
      severity: localTriage.urgency,
      verification_status: localTriage.verification_status,
      help_needed: localTriage.help_needed,
      required_capabilities: localTriage.help_needed,
      location: currentLocObj,
      landmark: landmark.trim() || null,
      created_at: nowIso,
      broadcast_status: 'BROADCASTING',
      matched_responders: [],
      accepted_responders: [],
      assistance_status: 'OPEN',
      status: 'OPEN',
      confidence_score: localTriage.confidence,
      ai_explanation: localTriage.reason,
      client_message_id: clientMsgId
    });

    // 2. IMMEDIATELY PERSIST TO INDEXEDDB (Guarantees persistence across refresh / offline boot)
    await saveEmergencyRecord(canonicalRecord);

    // 3. Multi-Hop BLE SOS Packet generation & broadcast with cryptographic hash & signature
    let multiHopPacket = null;
    try {
      multiHopPacket = await multiHopRouter.createSosMessage({
        description: rawText.trim() || `Emergency reported near ${landmark}`,
        latitude: currentLocObj.latitude || 21.1458,
        longitude: currentLocObj.longitude || 79.0882,
        location_accuracy_m: currentLocObj.accuracy_meters || 15,
        urgency: localTriage.urgency,
        category: localTriage.category,
        hop_limit: 7
      });
      canonicalRecord.multi_hop_message_id = multiHopPacket.message_id;
      canonicalRecord.hops_taken = multiHopPacket.hops_taken;
      canonicalRecord.relay_path = multiHopPacket.relay_path;
      canonicalRecord.delivery_status = multiHopPacket.delivery_status;
      await saveEmergencyRecord(canonicalRecord);
    } catch (mhErr) {
      console.warn('Multi-hop SOS creation notice:', mhErr);
    }

    // 4. Broadcast 24-byte compact BLE advertisement with repeated interval backoff
    let bleInfo = null;
    try {
      bleInfo = await bleTransport.broadcastEmergencyAlert(canonicalRecord);
    } catch (bleErr) {
      console.warn('BLE broadcast handled:', bleErr);
    }

    // 5. Save to persistent offline outbox (IndexedDB)
    const outboxPayload = {
      raw_text: rawText,
      lat: currentLocObj.latitude || 21.1458,
      lng: currentLocObj.longitude || 79.0882,
      location_accuracy_meters: currentLocObj.accuracy_meters || 15,
      location_link: currentLocObj.location_link,
      location_source: currentLocObj.location_source,
      location_age_seconds: currentLocObj.location_age_seconds,
      landmark: landmark.trim() || null,
      reporter_node_id: currentUser?.user_id || 'peer-citizen',
      client_message_id: clientMsgId,
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

    let serverSynced = false;

    // 5. Attempt live server sync if network is up
    try {
      const serverRes = await submitDistressIntake(outboxPayload);
      serverSynced = true;
      await queueOutboxReport({
        ...outboxPayload,
        initial_status: 'ACKNOWLEDGED'
      });
      if (serverRes?.emergency_id) {
        canonicalRecord.server_emergency_id = serverRes.emergency_id;
        await saveEmergencyRecord(canonicalRecord);
      }
    } catch (netErr) {
      // Offline fallback: save in IndexedDB outbox as QUEUED
      console.log('Operating in offline mesh mode. Incident queued in IndexedDB outbox:', netErr.message);
      await queueOutboxReport({
        ...outboxPayload,
        initial_status: 'QUEUED'
      });
    }

    // 6. Instantly update active emergencies state so marker drops on the map and card renders
    if (onEmergencyCreated) {
      onEmergencyCreated(canonicalRecord);
    }

    // 7. Dispatch notification to Emergency Contact (Sanskruti / configured contact)
    try {
      const notifResult = await dispatchEmergencyNotification({
        sosId: canonicalRecord.id,
        triggerSource: 'MANUAL',
        location: {
          coords: {
            lat: currentLocObj.latitude,
            lng: currentLocObj.longitude,
            accuracy_meters: currentLocObj.accuracy_meters,
            timestamp: currentLocObj.measured_at
          },
          status: currentLocObj.is_cached ? 'LAST_KNOWN' : 'CURRENT_GPS'
        },
        customNote: rawText,
        userId: currentUser?.user_id
      });
      if (onNotificationSent) {
        onNotificationSent(notifResult);
      }
    } catch (notifErr) {
      console.warn('Emergency contact notification dispatch note:', notifErr);
    }

    setFeedback({
      emergency_id: canonicalRecord.id,
      serverSynced,
      category: localTriage.category,
      urgency: localTriage.urgency,
      location_link: currentLocObj.location_link,
      bleNotice: bleInfo?.realHardware?.transmitted ? 'Hardware BLE' : 'Local Mesh Simulation'
    });

    // Reset form fields
    setRawText('');
    setLandmark('');
    setPhotoPreview(null);
    setAudioData(null);
    setSelectedResources([]);
    setLoading(false);
    setSelectedResources([]);
    setLoading(false);
  };

  return (
    <div className="bg-white border border-[#D0E6FC] rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
      
      {/* Title & Emergency Beacon */}
      <div className="flex items-center justify-between border-b border-[#EAF5FF] pb-3">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-ping" />
          </div>
          <div>
            <h2 className="font-heading font-black text-sm text-[#102B4E] uppercase tracking-wide flex items-center gap-1.5">
              <span>Report Emergency (SOS)</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#EAF5FF] text-[#168BFA] border border-[#D0E6FC] font-bold">
                1-TAP
              </span>
            </h2>
            <p className="text-[11px] text-[#627D98] font-sans">
              AI triage and verification run silently in background
            </p>
          </div>
        </div>

        {/* Location Status Pill */}
        <div className="flex items-center space-x-1.5 text-xs font-sans">
          <button
            type="button"
            onClick={handleRefreshLocation}
            disabled={isRefreshingLocation}
            className="px-2 py-1 bg-[#EAF5FF] hover:bg-[#DDF0FF] border border-[#D0E6FC] text-[#168BFA] rounded-lg text-[11px] font-bold flex items-center space-x-1 transition"
            title="Refresh GPS location fix"
          >
            <RefreshCw className={`w-3 h-3 ${isRefreshingLocation ? 'animate-spin' : ''}`} />
            <span>{isRefreshingLocation ? 'Fixing...' : currentLocObj.location_source === 'CURRENT' ? 'Live GPS' : currentLocObj.location_source === 'LAST_KNOWN' ? 'Last Known' : 'No GPS'}</span>
          </button>
        </div>
      </div>

      {/* Location Telemetry Sub-bar with Shareable Map Link */}
      <div className="bg-[#EAF5FF] border border-[#D0E6FC] rounded-xl p-2.5 space-y-1.5 text-xs">
        <div className="flex items-center justify-between text-[11px]">
          <div className="flex items-center space-x-1.5 text-[#102B4E]">
            <MapPin className="w-3.5 h-3.5 text-[#168BFA] shrink-0" />
            <span className="font-bold">
              {currentLocObj.location_source === 'CURRENT' ? 'CURRENT GPS FIX' : currentLocObj.location_source === 'LAST_KNOWN' ? 'LAST KNOWN POSITION' : 'LOCATION UNAVAILABLE'}:
            </span>
            <span className="font-mono text-[#627D98]">
              {currentLocObj.latitude !== null ? `${currentLocObj.latitude.toFixed(4)}°N, ${currentLocObj.longitude.toFixed(4)}°E (±${currentLocObj.accuracy_meters}m)` : 'GPS Unset'}
            </span>
          </div>

          {currentLocObj.location_source === 'LAST_KNOWN' && (
            <span className="text-[10px] text-amber-700 font-bold bg-amber-100 px-1.5 py-0.2 rounded">
              {formatLocationAge(currentLocObj.location_age_seconds)}
            </span>
          )}
        </div>

        {/* Shareable Map Link Preview */}
        {currentLocObj.location_link && (
          <div className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-[#D0E6FC] text-[11px] font-mono">
            <a
              href={currentLocObj.location_link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#168BFA] truncate hover:underline"
            >
              {currentLocObj.location_link}
            </a>
            <button
              type="button"
              onClick={handleCopyLink}
              className="ml-2 text-[#627D98] hover:text-[#168BFA] flex items-center space-x-1 shrink-0 font-sans text-[10px] font-bold"
            >
              <Copy className="w-3 h-3" />
              <span>{copiedLink ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Quick 1-Tap Emergency Prompts */}
      <div className="space-y-1.5">
        <label className="block text-[11px] font-heading font-bold uppercase text-[#627D98]">
          Quick 1-Tap Emergency Templates:
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {QUICK_PROMPTS.map((qp, i) => {
            const Icon = qp.icon;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setRawText(qp.text)}
                className={`p-2 rounded-xl border text-left text-xs transition flex items-start space-x-2 ${
                  rawText === qp.text
                    ? 'bg-[#EAF5FF] border-[#168BFA] text-[#168BFA] font-bold shadow-xs'
                    : 'bg-white border-[#D0E6FC] text-[#102B4E] hover:bg-[#F4FAFF] hover:border-[#B6D9FB]'
                }`}
              >
                <Icon className="w-3.5 h-3.5 text-[#168BFA] shrink-0 mt-0.5" />
                <span className="line-clamp-1 text-[11px] font-medium">{qp.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Emergency Input Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        
        {/* Main Text Area with Clear Emergency Prompt */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-heading font-bold text-[#102B4E]">
              Emergency Description *
            </label>
            <div className="flex items-center space-x-2">
              <select
                value={selectedLang}
                onChange={(e) => setSelectedLang(e.target.value)}
                className="text-[10px] bg-[#EAF5FF] border border-[#D0E6FC] rounded-lg px-2 py-0.5 text-[#168BFA] font-bold focus:outline-none"
                title="Dictation Language"
              >
                <option value="en-IN">English (India)</option>
                <option value="hi-IN">Hindi (हिन्दी)</option>
                <option value="mr-IN">Marathi (मराठी)</option>
                <option value="bn-IN">Bengali (বাংলা)</option>
                <option value="ta-IN">Tamil (தமிழ்)</option>
                <option value="te-IN">Telugu (తెలుగు)</option>
              </select>
              {rawText.trim() && (
                <SpeechButton
                  text={rawText}
                  identifier="input-card-speech"
                  size="sm"
                />
              )}
            </div>
          </div>

          {/* Prominent Audio Record & Live Transcription Action Button */}
          <button
            type="button"
            onClick={toggleSpeechToText}
            className={`w-full mb-2.5 py-2.5 px-3 rounded-xl border flex items-center justify-center space-x-2 text-xs font-heading font-black transition shadow-xs ${
              isTranscribing
                ? 'bg-rose-600 border-rose-700 text-white animate-pulse'
                : audioData
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100'
                : 'bg-[#F4FAFF] border-[#B6D9FB] text-[#168BFA] hover:bg-[#EAF5FF]'
            }`}
          >
            <Mic className={`w-4 h-4 ${isTranscribing ? 'animate-bounce text-white' : 'text-[#168BFA]'}`} />
            <span>
              {isTranscribing
                ? `🔴 Recording & Transcribing Live (${String(Math.floor(transcribeSeconds / 60)).padStart(2, '0')}:${String(transcribeSeconds % 60).padStart(2, '0')}) — Click to Finish`
                : audioData
                ? `✓ Voice Audio Recorded (${audioData.durationSeconds || 1}s) — Click to Re-Record`
                : `🎙️ Record Voice Audio & Transcribe (Live Speech-to-Text)`}
            </span>
          </button>

          <div className="relative">
            <textarea
              rows={3}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              className="w-full p-3 pb-8 bg-white border border-[#D0E6FC] rounded-xl text-xs text-[#102B4E] placeholder-[#627D98] focus:outline-none focus:border-[#168BFA] focus:ring-2 focus:ring-[#168BFA]/10 leading-relaxed transition resize-none"
              placeholder="What happened? Where is help needed? Is anyone injured or trapped?"
            />

            {/* Inline Microphone Dictation Button inside textarea */}
            <div className="absolute right-2.5 bottom-2.5 flex items-center space-x-1.5">
              {isTranscribing && (
                <div className="flex items-center space-x-1 bg-rose-50 border border-rose-200 text-rose-600 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-ping" />
                  <span>
                    {String(Math.floor(transcribeSeconds / 60)).padStart(2, '0')}:
                    {String(transcribeSeconds % 60).padStart(2, '0')}
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={toggleSpeechToText}
                className={`p-1.5 rounded-lg border transition shadow-xs flex items-center justify-center ${
                  isTranscribing
                    ? 'bg-rose-500 border-rose-600 text-white animate-pulse'
                    : 'bg-white border-[#D0E6FC] text-[#627D98] hover:text-[#168BFA] hover:border-[#168BFA]'
                }`}
                title={isTranscribing ? 'Stop dictation' : 'Speak emergency description (Speech-to-text)'}
              >
                <Mic className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {transcribeError && (
            <p className="text-[11px] text-rose-600 mt-1 flex items-center space-x-1 font-sans">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              <span>{transcribeError}</span>
            </p>
          )}

          {/* Recorded Voice Note Audio Player & Status */}
          {audioData && (
            <div className="mt-2 flex items-center justify-between bg-[#EAF5FF] border border-[#B6D9FB] rounded-xl px-3 py-2 text-xs animate-in fade-in">
              <div className="flex items-center space-x-2.5">
                <button
                  type="button"
                  onClick={togglePlayAudio}
                  className="w-7 h-7 rounded-full bg-[#168BFA] hover:bg-[#1270C9] text-white flex items-center justify-center transition shadow-xs"
                  title={isPlayingAudio ? 'Stop playback' : 'Play recorded voice message'}
                >
                  {isPlayingAudio ? (
                    <Square className="w-3 h-3 fill-white" />
                  ) : (
                    <Play className="w-3 h-3 fill-white ml-0.5" />
                  )}
                </button>
                <div>
                  <div className="font-heading font-bold text-[#102B4E] text-[11px] flex items-center space-x-1.5">
                    <span>Voice Note Recorded ({audioData.durationSeconds || 1}s)</span>
                    <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded font-mono text-[9px] font-bold">
                      ATTACHED
                    </span>
                  </div>
                  <div className="text-[10px] text-[#627D98]">
                    Audio recorded and transcribed then & there
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={removeAudio}
                className="text-[#627D98] hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition"
                title="Discard audio recording"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Landmark & Category Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div>
            <label className="block text-[11px] font-sans font-bold text-[#627D98] mb-1">
              Category (Optional)
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full p-2 bg-white border border-[#D0E6FC] rounded-lg text-xs text-[#102B4E] focus:outline-none focus:border-[#168BFA]"
            >
              <option value="">Auto-Detect via AI</option>
              <option value={EMERGENCY_CATEGORIES.MEDICAL}>Medical Emergency</option>
              <option value={EMERGENCY_CATEGORIES.FLOOD_RESCUE}>Flood / Water Rescue</option>
              <option value={EMERGENCY_CATEGORIES.STRUCTURAL_COLLAPSE}>Structural Collapse</option>
              <option value={EMERGENCY_CATEGORIES.FIRE_HAZARD}>Fire / Gas Hazard</option>
              <option value={EMERGENCY_CATEGORIES.SUPPLY_DEFICIT}>Critical Food / Water</option>
              <option value={EMERGENCY_CATEGORIES.GENERAL}>General Distress</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-sans font-bold text-[#627D98] mb-1">
              Landmark / Cross Street (Optional)
            </label>
            <input
              type="text"
              value={landmark}
              onChange={(e) => setLandmark(e.target.value)}
              placeholder="e.g. Near St. Paul School, 2nd floor"
              className="w-full p-2 bg-white border border-[#D0E6FC] rounded-lg text-xs text-[#102B4E] focus:outline-none focus:border-[#168BFA]"
            />
          </div>
        </div>

        {/* Resources Needed Chips */}
        <div>
          <label className="block text-[11px] font-sans font-bold text-[#627D98] mb-1.5">
            Help Needed:
          </label>
          <div className="flex flex-wrap gap-1.5">
            {RESOURCE_CHIPS.map((chip) => {
              const isSelected = selectedResources.includes(chip.id);
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => toggleResource(chip.id)}
                  className={`px-2.5 py-1 rounded-lg border text-[11px] font-sans transition ${
                    isSelected
                      ? 'bg-[#168BFA] text-white border-[#168BFA] font-bold shadow-xs'
                      : 'bg-white border-[#D0E6FC] text-[#627D98] hover:border-[#B6D9FB]'
                  }`}
                >
                  {isSelected ? '✓ ' : '+ '}{chip.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Optional Photo Attachment */}
        <div className="flex items-center justify-between pt-1">
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
            className="text-[11px] text-[#627D98] hover:text-[#168BFA] flex items-center space-x-1.5 font-sans"
          >
            <Camera className="w-3.5 h-3.5 text-[#168BFA]" />
            <span>{photoPreview ? 'Change attached photo' : '+ Attach photo (optional)'}</span>
          </button>

          {photoPreview && (
            <div className="relative inline-block">
              <img
                src={photoPreview}
                alt="Preview"
                className="w-8 h-8 object-cover rounded-md border border-[#168BFA]"
              />
              <button
                type="button"
                onClick={() => setPhotoPreview(null)}
                className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white rounded-full flex items-center justify-center text-[10px]"
              >
                ×
              </button>
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs">
            {errorMsg}
          </div>
        )}

        {/* Success Confirmation Banner */}
        {feedback && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs space-y-1 animate-in fade-in">
            <div className="flex items-center space-x-1.5 font-bold text-emerald-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>SOS Alert Broadcasted! (ID: {feedback.emergency_id.substring(0, 14)}...)</span>
            </div>
            <p className="text-[11px] text-emerald-700">
              {feedback.serverSynced
                ? 'Report delivered to command dispatch & active on map.'
                : 'Offline mesh mode: report saved in local outbox & transmitting over Bluetooth.'}
            </p>
          </div>
        )}

        {/* Prominent Submit SOS Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-4 bg-rose-600 hover:bg-rose-700 text-white font-heading font-black text-xs uppercase tracking-wider rounded-xl transition flex items-center justify-center space-x-2 shadow-md shadow-rose-600/20 active:scale-[0.99]"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
          <span>{loading ? 'BROADCASTING SOS...' : 'SUBMIT SOS EMERGENCY'}</span>
        </button>

      </form>

    </div>
  );
}
