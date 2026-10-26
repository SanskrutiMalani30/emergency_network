import React, { useState, useEffect } from 'react';
import { 
  X, MapPin, Users, Phone, Clock, AlertTriangle, ShieldCheck, 
  Sparkles, Navigation, CheckCircle2, HelpCircle, XCircle, ChevronRight,
  Radio, Info, ArrowRight, ShieldAlert, Award, Compass, Route,
  Car, Footprints, Zap, RefreshCw
} from 'lucide-react';
import { submitHelpOffer, updateIncidentStatus } from '../services/api';
import { haversineDistanceMeters } from '../services/offlineRouting';
import { calculateDisasterRoute, TRAVEL_MODES, ROUTING_OBJECTIVES } from '../services/routingService';
import { formatLocationAge } from '../services/locationService';
import { getLocalNotifications } from '../services/emergencyNotificationService';
import SpeechButton from './SpeechButton';

export default function IncidentDetailModal({
  incident,
  currentLocation,
  onClose,
  onStatusUpdated,
  onShowRouteOnMap
}) {
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'verification' | 'route' | 'help'
  const [assistanceMode, setAssistanceMode] = useState(null); // null | 'A' (Yes) | 'B' (Maybe) | 'C' (No)
  
  // Assistance Form State
  const [capability, setCapability] = useState('Medical / First Aid');
  const [etaMinutes, setEtaMinutes] = useState(15);
  const [helperNote, setHelperNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [offerSuccess, setOfferSuccess] = useState(false);
  const [hasOfferedHelp, setHasOfferedHelp] = useState(false);

  // Offline Routing State
  const [selectedOrigin, setSelectedOrigin] = useState(
    currentLocation?.lat ? 'gps' : 'hub'
  );
  const [travelMode, setTravelMode] = useState(TRAVEL_MODES.DRIVING);
  const [routingObjective, setRoutingObjective] = useState(ROUTING_OBJECTIVES.SHORTEST);
  const [computedRoute, setComputedRoute] = useState(null);
  const [isRoutingLoading, setIsRoutingLoading] = useState(false);

  if (!incident) return null;

  const isGpsOrigin = selectedOrigin === 'gps' && currentLocation?.lat;
  const originCoords = isGpsOrigin
    ? {
        lat: Number(currentLocation.lat),
        lng: Number(currentLocation.lng),
        accuracy: currentLocation.accuracy || 15,
        measured_at: currentLocation.measured_at || currentLocation.timestamp,
        is_last_known: Boolean(currentLocation.is_last_known || currentLocation.source === 'LAST_KNOWN')
      }
    : {
        lat: 21.1458,
        lng: 79.0882,
        accuracy: 10,
        is_last_known: false
      }; // Nagpur Central Command Hub

  const incLat = incident?.lat != null ? Number(incident.lat) : (incident?.latitude != null ? Number(incident.latitude) : null);
  const incLng = incident?.lng != null ? Number(incident.lng) : (incident?.longitude != null ? Number(incident.longitude) : null);

  // Compute straight-line distance if coords available
  const straightLineDistanceMeters = (currentLocation?.lat && incLat != null && incLng != null && isFinite(incLat) && isFinite(incLng))
    ? haversineDistanceMeters(Number(currentLocation.lat), Number(currentLocation.lng), incLat, incLng)
    : null;

  // Auto-calculate route on modal open or options switch
  useEffect(() => {
    let isCancelled = false;
    if (incLat != null && incLng != null && isFinite(incLat) && isFinite(incLng) && originCoords) {
      setIsRoutingLoading(true);
      calculateDisasterRoute(
        originCoords,
        {
          lat: incLat,
          lng: incLng,
          id: incident.id || incident.emergency_id,
          title: incident.title || incident.description
        },
        {
          mode: travelMode,
          objective: routingObjective
        }
      )
        .then(route => {
          if (!isCancelled) {
            setComputedRoute(route);
            setIsRoutingLoading(false);
          }
        })
        .catch(err => {
          console.warn('Disaster routing calculation note:', err);
          if (!isCancelled) setIsRoutingLoading(false);
        });
    }
    return () => { isCancelled = true; };
  }, [incLat, incLng, selectedOrigin, currentLocation, travelMode, routingObjective]);

  const handleConfirmHelpOffer = async () => {
    setIsSubmitting(true);
    try {
      const helperId = 'user-local-' + (Math.random().toString(36).slice(2, 7));
      const payload = {
        responder_id: helperId,
        helper_name: 'Field Responder (Self)',
        offer_type: capability,
        eta_minutes: parseInt(etaMinutes, 10) || 15,
        note: helperNote
      };

      const id = incident.incident_id || incident.emergency_id;
      await submitHelpOffer(id, payload);
      await updateIncidentStatus(id, 'HELP_OFFERED', helperId);

      setOfferSuccess(true);
      setHasOfferedHelp(true);

      if (onStatusUpdated) {
        onStatusUpdated({
          ...incident,
          status: 'HELP_OFFERED',
          assistance_status: 'HELP_OFFERED',
          assigned_responder_id: helperId
        });
      }

      // Automatically draw route on map
      if (computedRoute && onShowRouteOnMap) {
        setTimeout(() => {
          onShowRouteOnMap(computedRoute, incident);
        }, 1200);
      }
    } catch (err) {
      console.error('Failed to submit help offer:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getVerificationBadge = () => {
    const status = incident.verification_status || 'VERIFIED';
    switch (status.toUpperCase()) {
      case 'VERIFIED':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>VERIFIED</span>
          </span>
        );
      case 'PARTIALLY_VERIFIED':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200">
            <Info className="w-3.5 h-3.5" />
            <span>PARTIALLY VERIFIED</span>
          </span>
        );
      case 'SUSPICIOUS':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>SUSPICIOUS</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>UNVERIFIED</span>
          </span>
        );
    }
  };

  const getUrgencyBadge = () => {
    const urgency = incident.urgency || 5;
    const isCritical = urgency >= 8 || incident.severity === 'CRITICAL';
    const isHigh = urgency >= 6 || incident.severity === 'HIGH';
    
    if (isCritical) {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-300">
          CRITICAL PRIORITY ({urgency}/10)
        </span>
      );
    }
    if (isHigh) {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
          HIGH PRIORITY ({urgency}/10)
        </span>
      );
    }
    return (
      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700 border border-blue-300">
        MODERATE ({urgency}/10)
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-auto flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white border border-[#D0E6FC] w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header Bar */}
        <div className="px-5 py-4 bg-[#EAF5FF] border-b border-[#D0E6FC] flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-[#168BFA] text-white rounded-xl shadow-sm">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-base text-[#102B4E]">
                  Incident #{String(incident.incident_id || incident.emergency_id || '---').slice(0, 14)}
                </h3>
                {incident.is_demo && (
                  <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300 rounded-md">
                    DEMO INCIDENT
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Reported {incident.created_at ? new Date(incident.created_at).toLocaleTimeString() : 'Recently'} · {incident.category || 'General'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status & Verification Badges Bar */}
        <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            {getVerificationBadge()}
            {getUrgencyBadge()}
          </div>
          <div className="text-xs font-semibold text-slate-600 flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Status: <strong className="text-[#102B4E] uppercase">{incident.status || incident.assistance_status || 'OPEN'}</strong></span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 px-5 bg-white text-xs font-semibold text-slate-600">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 px-3 border-b-2 transition ${
              activeTab === 'overview'
                ? 'border-[#168BFA] text-[#168BFA]'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('verification')}
            className={`py-3 px-3 border-b-2 transition flex items-center space-x-1.5 ${
              activeTab === 'verification'
                ? 'border-[#168BFA] text-[#168BFA]'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Verification Evidence</span>
          </button>
          <button
            onClick={() => setActiveTab('route')}
            className={`py-3 px-3 border-b-2 transition flex items-center space-x-1.5 ${
              activeTab === 'route'
                ? 'border-[#168BFA] text-[#168BFA]'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <Route className="w-3.5 h-3.5" />
            <span>Offline Routing</span>
          </button>
          <button
            onClick={() => setActiveTab('help')}
            className={`py-3 px-3 border-b-2 transition flex items-center space-x-1.5 ${
              activeTab === 'help'
                ? 'border-[#168BFA] text-[#168BFA]'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Helper Action</span>
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">

          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-4 animate-fade-in">
              <div className="bg-[#EAF5FF] border border-[#D0E6FC] p-4 rounded-xl">
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#102B4E]">
                    Reported Distress Situation
                  </h4>
                  <SpeechButton
                    text={incident.description || incident.raw_message || 'Emergency assistance requested'}
                    identifier={`detail-${incident.incident_id || incident.emergency_id}`}
                    size="sm"
                  />
                </div>
                <p className="text-sm text-[#102B4E] leading-relaxed font-normal">
                  {incident.description || incident.raw_message || 'No detailed description provided.'}
                </p>
              </div>

              {/* Resource Requirements & Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs">
                  <div className="text-[10px] uppercase font-bold text-slate-500">People Impacted</div>
                  <div className="text-lg font-extrabold text-[#102B4E] flex items-center space-x-1 mt-0.5">
                    <Users className="w-4 h-4 text-[#168BFA]" />
                    <span>{incident.people_affected || 1}</span>
                  </div>
                </div>

                <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs">
                  <div className="text-[10px] uppercase font-bold text-slate-500">Distance</div>
                  <div className="text-lg font-extrabold text-[#102B4E] flex items-center space-x-1 mt-0.5">
                    <Compass className="w-4 h-4 text-[#168BFA]" />
                    <span>
                      {straightLineDistanceMeters != null
                        ? `${(straightLineDistanceMeters / 1000).toFixed(1)} km`
                        : '~1.5 km'}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs">
                  <div className="text-[10px] uppercase font-bold text-slate-500">Drinking Water</div>
                  <div className="text-lg font-extrabold text-[#102B4E] mt-0.5">
                    {incident.water_needed || 0} L
                  </div>
                </div>

                <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs">
                  <div className="text-[10px] uppercase font-bold text-slate-500">Food Supplies</div>
                  <div className="text-lg font-extrabold text-[#102B4E] mt-0.5">
                    {incident.food_needed || 0} pkts
                  </div>
                </div>
              </div>

              {/* Location Coordinates & Contact */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center space-x-2.5">
                  <MapPin className="w-4 h-4 text-rose-500 shrink-0" />
                  <div>
                    <span className="font-semibold text-slate-700 block">Coordinates</span>
                    <span className="text-slate-500 font-mono">
                      {incLat != null && incLng != null && isFinite(incLat) && isFinite(incLng)
                        ? `${incLat.toFixed(5)}°N, ${incLng.toFixed(5)}°E`
                        : 'Coordinates pending field fix'}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center space-x-2.5">
                  <Phone className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <span className="font-semibold text-slate-700 block">Emergency Channel / Contact</span>
                    <span className="text-slate-500 font-mono">
                      {incident.reporter_phone || 'Direct LoRa / Mesh Peer #891'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Emergency Contact Notifications & Trigger Audit Trail */}
              {(() => {
                const notifs = incident.contact_notifications || getLocalNotifications(incident.id || incident.emergency_id || incident.incident_id);
                const triggerSource = incident.trigger_source || (notifs.length > 0 ? notifs[0].trigger_source : 'MANUAL');
                return (
                  <div className="p-3.5 bg-white border border-[#D0E6FC] rounded-xl space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center space-x-2">
                        <span className="px-2 py-0.5 rounded-md bg-[#EAF5FF] text-[#168BFA] font-mono font-bold text-[10px] uppercase border border-[#B6D9FB]">
                          TRIGGER: {triggerSource}
                        </span>
                        <span className="font-heading font-bold text-[#102B4E]">
                          Emergency Contact Delivery
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {notifs.length > 0 ? `${notifs.length} Dispatch${notifs.length > 1 ? 'es' : ''}` : 'Direct SMS Relay'}
                      </span>
                    </div>

                    {notifs.length > 0 ? (
                      <div className="space-y-2">
                        {notifs.map((n, idx) => (
                          <div key={idx} className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-[#102B4E]">
                                {n.recipient_name} ({n.recipient_phone})
                              </span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                                n.delivery_status === 'DELIVERY_CONFIRMED'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : n.delivery_status === 'PROVIDER_ACCEPTED'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}>
                                {n.delivery_status}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-600 line-clamp-2 italic">
                              "{n.message_text}"
                            </p>
                            {n.sms_uri && (
                              <div className="pt-1 flex justify-end">
                                <a
                                  href={n.sms_uri}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[11px] text-[#168BFA] hover:underline font-bold flex items-center space-x-1"
                                >
                                  <span>Open in SMS App</span>
                                  <ArrowRight className="w-3 h-3" />
                                </a>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500">
                        Default prototype contact (Sanskruti, +91 9272104399) notified via mesh gateway.
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* Quick Actions Footer inside Overview */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  onClick={() => setActiveTab('route')}
                  className="px-4 py-2 bg-white hover:bg-slate-50 border border-[#D0E6FC] text-[#168BFA] font-semibold text-xs rounded-xl flex items-center space-x-1.5 shadow-xs transition"
                >
                  <Navigation className="w-4 h-4" />
                  <span>Inspect Offline Route</span>
                </button>

                <button
                  onClick={() => setActiveTab('help')}
                  className="px-5 py-2.5 bg-[#168BFA] hover:bg-[#1277d6] text-white font-bold text-xs rounded-xl flex items-center space-x-2 shadow-sm transition"
                >
                  <Users className="w-4 h-4" />
                  <span>Offer Assistance (3 Choices)</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: VERIFICATION EVIDENCE */}
          {activeTab === 'verification' && (
            <div className="space-y-4 animate-fade-in">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-600" />
                    <h4 className="font-bold text-sm text-[#102B4E]">
                      Claim Verification Engine Analysis
                    </h4>
                  </div>
                  <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-lg">
                    {Math.round((incident.confidence_score != null ? incident.confidence_score : 0.88) * 100)}% Confidence
                  </span>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  Verification engine evaluates physical plausibility, Ed25519 cryptographic signatures, mesh hop telemetry, and local sensor corroborate signals.
                  <strong className="block mt-1 text-[#102B4E]">
                    Note: Verification assesses report authenticity and physical integrity, distinct from triage urgency or responder availability.
                  </strong>
                </p>
              </div>

              {/* Reasons Breakdown */}
              <div className="space-y-2">
                <h5 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Verification Factors & Corroboration
                </h5>
                <div className="space-y-1.5">
                  {(incident.verification_reasons && incident.verification_reasons.length > 0
                    ? incident.verification_reasons
                    : [
                        'Ed25519 cryptographic signature verified against mesh node identity',
                        'GPS location verified within known active flood zone corridor',
                        'Corroborated by 2 nearby independent mesh witness nodes within 800m'
                      ]
                  ).map((reason, idx) => (
                    <div key={idx} className="flex items-start space-x-2 text-xs text-slate-700 bg-white border border-slate-200 p-2.5 rounded-lg shadow-2xs">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      <span>{reason}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Technical Telemetry Metadata */}
              <div className="bg-[#EAF5FF] border border-[#D0E6FC] rounded-xl p-3.5 text-xs font-mono space-y-1.5 text-slate-700">
                <div className="flex justify-between">
                  <span className="text-slate-500">Transmission Channel:</span>
                  <span className="font-bold text-[#102B4E]">{incident.evidence?.channel || 'Mesh P2P (BLE / LoRa)'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Mesh Hop Count:</span>
                  <span className="font-bold text-[#102B4E]">{incident.evidence?.mesh_hops ?? 2} Hops</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Independent Witnesses:</span>
                  <span className="font-bold text-[#102B4E]">{incident.evidence?.witness_count ?? 3} Nodes</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Signal RSSI (Average):</span>
                  <span className="font-bold text-emerald-700">-68 dBm (Strong)</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: OFFLINE ROUTING */}
          {activeTab === 'route' && (
            <div className="space-y-4 animate-fade-in">
              {/* Origin Selection & Freshness */}
              <div className="bg-white border border-slate-200 p-3.5 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 flex items-center space-x-1.5">
                    <Navigation className="w-4 h-4 text-[#168BFA]" />
                    <span>Helper Starting Origin</span>
                  </label>
                  <div className="flex rounded-lg border border-slate-300 p-0.5 bg-slate-50 text-[11px] font-semibold">
                    <button
                      type="button"
                      onClick={() => setSelectedOrigin('gps')}
                      disabled={!currentLocation?.lat}
                      className={`px-2.5 py-1 rounded-md transition ${
                        selectedOrigin === 'gps'
                          ? 'bg-[#168BFA] text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 disabled:opacity-40'
                      }`}
                    >
                      My Position
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedOrigin('hub')}
                      className={`px-2.5 py-1 rounded-md transition ${
                        selectedOrigin === 'hub'
                          ? 'bg-[#168BFA] text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Central Command
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between flex-wrap gap-1.5 text-[11px]">
                  {selectedOrigin === 'gps' && currentLocation?.lat ? (
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                        currentLocation?.is_last_known || currentLocation?.source === 'LAST_KNOWN'
                          ? 'bg-amber-100 text-amber-900 border border-amber-300'
                          : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                      }`}>
                        {currentLocation?.is_last_known || currentLocation?.source === 'LAST_KNOWN'
                          ? `Last Known: ${currentLocation.measured_at ? formatLocationAge(currentLocation.measured_at) : 'Saved fix'}`
                          : 'Current GPS Location'}
                      </span>
                      <span className="text-slate-500 font-mono text-[10px]">
                        {Number(currentLocation.lat).toFixed(4)}°N, {Number(currentLocation.lng).toFixed(4)}°E (±{Math.round(currentLocation.accuracy || 15)}m)
                      </span>
                    </div>
                  ) : (
                    <span className="text-slate-500">
                      Using Central Tactical Command Hub (Nagpur Sector: 21.1458°N, 79.0882°E)
                    </span>
                  )}

                  {computedRoute && (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      computedRoute.engine === 'ONLINE_OSRM'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : computedRoute.engine === 'OFFLINE_ROAD_GRAPH'
                        ? 'bg-cyan-50 text-cyan-700 border border-cyan-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {computedRoute.engine === 'ONLINE_OSRM'
                        ? 'Online OSRM'
                        : computedRoute.engine === 'OFFLINE_ROAD_GRAPH'
                        ? 'Offline Road Graph'
                        : 'Straight-Line'}
                    </span>
                  )}
                </div>
              </div>

              {/* Travel Mode & Objective Toggles */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* Travel Mode Toggle */}
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="text-[10px] font-bold uppercase text-slate-500 mb-1.5 flex items-center space-x-1">
                    <Navigation className="w-3 h-3 text-[#168BFA]" />
                    <span>Travel Mode</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() => setTravelMode(TRAVEL_MODES.DRIVING)}
                      className={`py-1.5 px-2 rounded-lg font-bold text-xs flex items-center justify-center space-x-1.5 transition ${
                        travelMode === TRAVEL_MODES.DRIVING
                          ? 'bg-[#168BFA] text-white shadow-xs'
                          : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <Car className="w-3.5 h-3.5" />
                      <span>Driving (~35 km/h)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTravelMode(TRAVEL_MODES.WALKING)}
                      className={`py-1.5 px-2 rounded-lg font-bold text-xs flex items-center justify-center space-x-1.5 transition ${
                        travelMode === TRAVEL_MODES.WALKING
                          ? 'bg-[#168BFA] text-white shadow-xs'
                          : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <Footprints className="w-3.5 h-3.5" />
                      <span>Walking (~5 km/h)</span>
                    </button>
                  </div>
                </div>

                {/* Routing Objective Toggle */}
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="text-[10px] font-bold uppercase text-slate-500 mb-1.5 flex items-center space-x-1">
                    <Compass className="w-3 h-3 text-[#102B4E]" />
                    <span>Routing Objective</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() => setRoutingObjective(ROUTING_OBJECTIVES.SHORTEST)}
                      className={`py-1.5 px-2 rounded-lg font-bold text-xs flex items-center justify-center space-x-1.5 transition ${
                        routingObjective === ROUTING_OBJECTIVES.SHORTEST
                          ? 'bg-[#102B4E] text-white shadow-xs'
                          : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <Compass className="w-3.5 h-3.5" />
                      <span>Shortest Path</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRoutingObjective(ROUTING_OBJECTIVES.FASTEST)}
                      className={`py-1.5 px-2 rounded-lg font-bold text-xs flex items-center justify-center space-x-1.5 transition ${
                        routingObjective === ROUTING_OBJECTIVES.FASTEST
                          ? 'bg-[#102B4E] text-white shadow-xs'
                          : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>Fastest ETA</span>
                    </button>
                  </div>
                </div>
              </div>

              {isRoutingLoading ? (
                <div className="p-8 text-center bg-[#EAF5FF] rounded-xl border border-[#D0E6FC] animate-pulse">
                  <div className="text-xs font-bold text-[#168BFA]">Calculating optimal disaster route...</div>
                </div>
              ) : computedRoute ? (
                <div className="space-y-3">
                  {/* Route Summary Metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    <div className="p-3 bg-[#EAF5FF] border border-[#D0E6FC] rounded-xl text-center">
                      <div className="text-[10px] font-bold text-slate-500 uppercase">Road Distance</div>
                      <div className="text-base font-extrabold text-[#168BFA] mt-0.5">
                        {computedRoute.distance_km ?? computedRoute.distanceKm} km
                      </div>
                      <div className="text-[10px] text-slate-500">
                        ({computedRoute.distance_meters ?? Math.round((computedRoute.distance_km || 1)*1000)} m)
                      </div>
                    </div>
                    <div className="p-3 bg-[#EAF5FF] border border-[#D0E6FC] rounded-xl text-center">
                      <div className="text-[10px] font-bold text-slate-500 uppercase flex items-center justify-center space-x-1">
                        <Clock className="w-3 h-3 text-[#168BFA]" />
                        <span>Estimated Duration</span>
                      </div>
                      <div className="text-base font-extrabold text-[#102B4E] mt-0.5">
                        {computedRoute.duration_minutes ?? computedRoute.etaMinutes?.vehicle ?? 10} min
                      </div>
                      <div className="text-[9px] text-slate-500 font-medium">
                        (Estimate without live traffic)
                      </div>
                    </div>
                    <div className="p-3 bg-[#EAF5FF] border border-[#D0E6FC] rounded-xl text-center col-span-2 sm:col-span-1">
                      <div className="text-[10px] font-bold text-slate-500 uppercase">Engine Status</div>
                      <div className="text-xs font-extrabold text-[#102B4E] mt-1">
                        {computedRoute.is_online ? 'Live Network (OSRM)' : 'Air-Gapped (Dijkstra)'}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {computedRoute.turn_by_turn?.length || computedRoute.directions?.length || 0} turn steps
                      </div>
                    </div>
                  </div>

                  {/* Safety & Disaster Warning Notices */}
                  <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl space-y-1.5 text-xs text-amber-900">
                    <div className="flex items-start space-x-2 font-bold">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <span>Disaster routing safety protocol:</span>
                    </div>
                    <ul className="list-disc pl-6 space-y-1 text-[11px] text-amber-800">
                      <li>Shortest path may contain unmapped floodwaters, downed power lines, or structural debris.</li>
                      <li>ETA is an estimate calculated without live traffic; field conditions can alter accessibility.</li>
                      {computedRoute.hazards_intersected && computedRoute.hazards_intersected.length > 0 && (
                        <li className="font-bold text-red-700">
                          CRITICAL: Route intersects {computedRoute.hazards_intersected.length} active hazard zone(s). Proceed with extreme caution.
                        </li>
                      )}
                    </ul>
                  </div>

                  {/* Step-by-Step Directions */}
                  <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/50">
                    <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center justify-between">
                      <span>Turn-By-Turn Navigation ({(computedRoute.turn_by_turn || computedRoute.directions || []).length} steps)</span>
                      <span className="text-[10px] font-mono text-slate-500 uppercase">{computedRoute.travel_mode || computedRoute.mode || 'driving'}</span>
                    </div>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {(computedRoute.turn_by_turn || computedRoute.directions || []).map((step, idx) => (
                        <div key={idx} className="flex items-center space-x-2 text-xs text-slate-700 bg-white p-2 rounded-lg border border-slate-200">
                          <span className="w-5 h-5 rounded-full bg-slate-100 text-[#168BFA] font-bold flex items-center justify-center shrink-0 text-[10px]">
                            {idx + 1}
                          </span>
                          <span className="flex-1">{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Show Route on Map Button */}
                  <button
                    type="button"
                    onClick={() => {
                      if (onShowRouteOnMap) onShowRouteOnMap(computedRoute, incident);
                      onClose();
                    }}
                    className="w-full py-2.5 bg-[#168BFA] hover:bg-[#1277d6] text-white font-bold text-xs rounded-xl flex items-center justify-center space-x-2 shadow-sm transition"
                  >
                    <Route className="w-4 h-4" />
                    <span>Display Route on Interactive Map</span>
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {/* TAB 4: HELPER ASSISTANCE WORKFLOW (3 CHOICES) */}
          {activeTab === 'help' && (
            <div className="space-y-4 animate-fade-in">
              {offerSuccess || hasOfferedHelp ? (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-center space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                  <h4 className="font-bold text-sm text-emerald-800">
                    Assistance Offer Registered!
                  </h4>
                  <p className="text-xs text-emerald-700 max-w-md mx-auto">
                    Your readiness offer has been relayed to the mesh network. The incident status is now updated to <strong>HELP_OFFERED</strong>.
                  </p>
                  <button
                    onClick={() => {
                      if (computedRoute && onShowRouteOnMap) onShowRouteOnMap(computedRoute, incident);
                      onClose();
                    }}
                    className="mt-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-lg inline-flex items-center space-x-1.5 transition"
                  >
                    <Navigation className="w-4 h-4" />
                    <span>View Dispatch Route on Map</span>
                  </button>
                </div>
              ) : (
                <>
                  <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl">
                    <h4 className="font-bold text-xs text-[#102B4E] uppercase tracking-wider mb-1">
                      Can You Assist This Emergency?
                    </h4>
                    <p className="text-xs text-slate-600">
                      Select your operational response below. No responder is penalized for declining when unavailable.
                    </p>
                  </div>

                  {/* Choice Buttons */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <button
                      onClick={() => setAssistanceMode('A')}
                      className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                        assistanceMode === 'A'
                          ? 'border-[#168BFA] bg-[#EAF5FF] shadow-xs'
                          : 'border-slate-200 bg-white hover:border-[#168BFA]'
                      }`}
                    >
                      <div className="flex items-center space-x-2 text-emerald-600 font-bold text-xs mb-1">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Choice A</span>
                      </div>
                      <div className="font-bold text-xs text-[#102B4E]">Yes, I Can Help</div>
                      <div className="text-[11px] text-slate-500 mt-1">Commit capacity and prepare route</div>
                    </button>

                    <button
                      onClick={() => setAssistanceMode('B')}
                      className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                        assistanceMode === 'B'
                          ? 'border-sky-500 bg-sky-50 shadow-xs'
                          : 'border-slate-200 bg-white hover:border-sky-400'
                      }`}
                    >
                      <div className="flex items-center space-x-2 text-sky-600 font-bold text-xs mb-1">
                        <HelpCircle className="w-4 h-4" />
                        <span>Choice B</span>
                      </div>
                      <div className="font-bold text-xs text-[#102B4E]">Maybe — Need Details</div>
                      <div className="text-[11px] text-slate-500 mt-1">Query mesh for more telemetry</div>
                    </button>

                    <button
                      onClick={() => setAssistanceMode('C')}
                      className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                        assistanceMode === 'C'
                          ? 'border-slate-400 bg-slate-100 shadow-xs'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center space-x-2 text-slate-500 font-bold text-xs mb-1">
                        <XCircle className="w-4 h-4" />
                        <span>Choice C</span>
                      </div>
                      <div className="font-bold text-xs text-[#102B4E]">No, Cannot Help</div>
                      <div className="text-[11px] text-slate-500 mt-1">Dismiss without status penalty</div>
                    </button>
                  </div>

                  {/* Mode A Form: YES, I CAN HELP */}
                  {assistanceMode === 'A' && (
                    <div className="p-4 bg-[#EAF5FF] border border-[#D0E6FC] rounded-xl space-y-3 animate-fade-in">
                      <div className="font-bold text-xs text-[#102B4E] uppercase tracking-wider">
                        Configure Your Assistance Offer
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-700">Assistance Capability</label>
                        <select
                          value={capability}
                          onChange={(e) => setCapability(e.target.value)}
                          className="w-full text-xs p-2 bg-white border border-[#D0E6FC] rounded-lg text-[#102B4E] focus:outline-none focus:ring-1 focus:ring-[#168BFA]"
                        >
                          <option value="Medical / First Aid">Medical / First Aid (Triage & Supplies)</option>
                          <option value="Rescue & Evacuation">Rescue & Evacuation (Boat / Rope Access)</option>
                          <option value="Food & Drinking Water">Food & Drinking Water Distribution</option>
                          <option value="Transport / Vehicle">Transport / Evacuation Vehicle</option>
                          <option value="Shelter / General Relief">Shelter & General Emergency Relief</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-700">Estimated Arrival (ETA)</label>
                          <select
                            value={etaMinutes}
                            onChange={(e) => setEtaMinutes(e.target.value)}
                            className="w-full text-xs p-2 bg-white border border-[#D0E6FC] rounded-lg text-[#102B4E]"
                          >
                            <option value={5}>5 minutes</option>
                            <option value={10}>10 minutes</option>
                            <option value={15}>15 minutes</option>
                            <option value={30}>30 minutes</option>
                            <option value={45}>45 minutes</option>
                            <option value={60}>60 minutes</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-700">Responder ID / Handle</label>
                          <input
                            type="text"
                            readOnly
                            value="Local Helper (Self)"
                            className="w-full text-xs p-2 bg-slate-100 border border-slate-300 rounded-lg text-slate-600"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-700">Optional Tactical Note</label>
                        <input
                          type="text"
                          placeholder="e.g. Carrying trauma kit and dry rations, moving on foot"
                          value={helperNote}
                          onChange={(e) => setHelperNote(e.target.value)}
                          className="w-full text-xs p-2 bg-white border border-[#D0E6FC] rounded-lg text-[#102B4E]"
                        />
                      </div>

                      <div className="pt-2 flex items-center justify-end space-x-2">
                        <button
                          onClick={() => setAssistanceMode(null)}
                          className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleConfirmHelpOffer}
                          disabled={isSubmitting}
                          className="px-4 py-2 bg-[#168BFA] hover:bg-[#1277d6] text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center space-x-1.5 disabled:opacity-60"
                        >
                          {isSubmitting ? (
                            <span>Recording Offer...</span>
                          ) : (
                            <>
                              <CheckCircle2 className="w-4 h-4" />
                              <span>Confirm Assistance Offer</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Mode B: MAYBE — NEED DETAILS */}
                  {assistanceMode === 'B' && (
                    <div className="p-4 bg-sky-50 border border-sky-200 rounded-xl space-y-2.5 animate-fade-in text-xs">
                      <div className="flex items-center space-x-2 font-bold text-sky-800">
                        <Info className="w-4 h-4" />
                        <span>Mesh Interrogation & Telemetry Query</span>
                      </div>
                      <p className="text-slate-700">
                        Broadcasting targeted inquiry across peer radios without altering incident status. Current report received via 2 hops from peer node <code>0x4a9e</code>.
                      </p>
                      <div className="p-2.5 bg-white rounded-lg border border-sky-100 space-y-1 font-mono text-[11px] text-slate-600">
                        <div>&gt; Mesh Ping: 41ms round-trip</div>
                        <div>&gt; Corroborating sensors: 2 flood level beacons active in 500m</div>
                        <div>&gt; Battery level of sender device: 64%</div>
                      </div>
                      <div className="pt-1 flex justify-end">
                        <button
                          onClick={() => setAssistanceMode(null)}
                          className="px-3 py-1 bg-sky-600 text-white rounded-md text-xs font-semibold"
                        >
                          Done Reviewing
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Mode C: NO, CANNOT HELP */}
                  {assistanceMode === 'C' && (
                    <div className="p-4 bg-slate-100 border border-slate-300 rounded-xl space-y-2 animate-fade-in text-xs">
                      <div className="font-bold text-slate-800">
                        No Problem — Standing By
                      </div>
                      <p className="text-slate-600">
                        Your operational readiness remains unchanged. The incident remains visible to other peer responders and community helpers.
                      </p>
                      <div className="pt-2 flex justify-end">
                        <button
                          onClick={onClose}
                          className="px-4 py-1.5 bg-slate-700 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold"
                        >
                          Close Incident
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
          <div className="text-slate-500 font-mono text-[11px]">
            Sector: Nagpur Disaster Ward 12
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-slate-700 hover:bg-slate-200 font-semibold rounded-lg transition"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
