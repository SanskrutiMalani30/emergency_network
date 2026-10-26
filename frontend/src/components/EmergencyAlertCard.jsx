import React, { useState } from 'react';
import {
  AlertTriangle,
  ExternalLink,
  Copy,
  Check,
  MapPin,
  Clock,
  Radio,
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  Navigation,
  Compass,
  ArrowRight,
  Route,
  CheckCircle2
} from 'lucide-react';

import {
  generateLocationLink,
  formatLocationAge,
  copyLocationLinkToClipboard
} from '../services/locationService';
import SpeechButton from './SpeechButton';

export default function EmergencyAlertCard({
  emergency,
  onSelectForMatching,
  onFlyToMap,
  onShowRoute,
  isSelected = false
}) {
  const [copied, setCopied] = useState(false);

  if (!emergency) return null;

  const category = String(emergency.category || 'EMERGENCY').toUpperCase();
  const urgency = String(emergency.urgency_label || emergency.severity || emergency.urgency || 'MODERATE').toUpperCase();
  const rawText = String(emergency.raw_message || emergency.description || emergency.reason || 'Emergency reported');
  
  // Coordinates & Location Link
  const rawLat = emergency.lat ?? emergency.latitude;
  const rawLng = emergency.lng ?? emergency.longitude;
  const lat = rawLat != null && isFinite(Number(rawLat)) ? Number(rawLat) : null;
  const lng = rawLng != null && isFinite(Number(rawLng)) ? Number(rawLng) : null;
  const accuracy = Number(emergency.location_accuracy_meters ?? emergency.accuracy_meters ?? 15);
  const locationSource = emergency.location_source || (emergency.is_last_known ? 'LAST_KNOWN' : 'CURRENT');
  const ageSeconds = Number(emergency.location_age_seconds ?? 0);
  const locationLink = emergency.location_link || (lat != null && lng != null ? generateLocationLink(lat, lng) : null);

  // Resources
  const helpNeeded = Array.isArray(emergency.required_capabilities)
    ? emergency.required_capabilities
    : Array.isArray(emergency.help_needed)
    ? emergency.help_needed
    : [];

  // AI & Verification
  const aiReason = String(emergency.ai_explanation || emergency.reason || 'Distress triage assessed by local model.');
  const verificationStatus = String(emergency.verification_status || 'VERIFIED');
  const txStatus = String(emergency.delivery_status || emergency.status || 'OPEN');
  const isHelpOffered = emergency.assistance_status === 'HELP_OFFERED' || txStatus === 'HELP_OFFERED';
  const isDemo = !!emergency.is_demo;

  const handleCopyLink = async (e) => {
    e.stopPropagation();
    if (!locationLink) return;
    const ok = await copyLocationLinkToClipboard(locationLink);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleOpenLink = (e) => {
    e.stopPropagation();
    if (locationLink) {
      window.open(locationLink, '_blank', 'noopener,noreferrer');
    }
  };

  const isCritical = urgency === 'CRITICAL' || emergency.urgency >= 8;
  const isHigh = urgency === 'HIGH' || emergency.urgency >= 6;

  const getVerificationBadge = () => {
    switch (verificationStatus.toUpperCase()) {
      case 'VERIFIED':
        return (
          <span className="inline-flex items-center space-x-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <ShieldCheck className="w-3 h-3" />
            <span>VERIFIED</span>
          </span>
        );
      case 'PARTIALLY_VERIFIED':
        return (
          <span className="inline-flex items-center space-x-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
            <span>PARTIALLY VERIFIED</span>
          </span>
        );
      case 'SUSPICIOUS':
        return (
          <span className="inline-flex items-center space-x-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <ShieldAlert className="w-3 h-3" />
            <span>SUSPICIOUS</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center space-x-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-300">
            <span>UNVERIFIED</span>
          </span>
        );
    }
  };

  return (
    <div
      onClick={onSelectForMatching}
      className={`p-4 rounded-xl border transition-all cursor-pointer space-y-3 shadow-xs ${
        isSelected
          ? 'bg-[#EAF5FF] border-[#168BFA] ring-2 ring-[#168BFA]/20'
          : 'bg-white border-[#D0E6FC] hover:border-[#B6D9FB] hover:shadow-sm'
      }`}
    >
      {/* Header: Category & Urgency */}
      <div className="flex items-center justify-between gap-2 border-b border-[#EAF5FF] pb-2.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
            isCritical ? 'bg-rose-500 animate-ping' : isHigh ? 'bg-amber-500' : 'bg-[#168BFA]'
          }`} />
          <span className="font-heading font-black text-xs md:text-sm tracking-wide text-[#102B4E] uppercase">
            {category} EMERGENCY
          </span>
          {isDemo && (
            <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300">
              DEMO
            </span>
          )}
        </div>

        {/* Transmission & Status */}
        <div className="flex items-center space-x-1.5">
          {isHelpOffered && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase bg-emerald-100 border border-emerald-300 text-emerald-800 flex items-center space-x-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>OFFERED</span>
            </span>
          )}
          <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase border ${
            txStatus === 'ACKNOWLEDGED' || txStatus === 'RESOLVED' || txStatus === 'RESCUED'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : txStatus === 'TRANSMITTING'
              ? 'bg-blue-50 border-blue-200 text-[#168BFA] animate-pulse'
              : 'bg-slate-100 border-slate-200 text-slate-700'
          }`}>
            {txStatus}
          </span>
        </div>
      </div>

      {/* Description with Multilingual Audio Playback */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-[#102B4E] font-sans leading-relaxed line-clamp-2 flex-1">
          {rawText}
        </p>
        <SpeechButton
          text={rawText}
          identifier={emergency.id || emergency.emergency_id}
          size="sm"
        />
      </div>

      {/* Help Needed */}
      {helpNeeded.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-sans">
          <span className="text-[#627D98] font-bold">Help needed:</span>
          {helpNeeded.map((res, i) => (
            <span
              key={i}
              className="px-2 py-0.5 rounded-md bg-[#EAF5FF] text-[#168BFA] border border-[#D0E6FC] font-semibold text-[10px]"
            >
              {typeof res === 'string' ? res.replace(/_/g, ' ') : res}
            </span>
          ))}
        </div>
      )}

      {/* Location Section */}
      <div className="p-2.5 rounded-lg bg-[#F4FAFF] border border-[#D0E6FC] space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[#102B4E] font-bold">
            <MapPin className="w-3.5 h-3.5 text-[#168BFA] shrink-0" />
            <span>Location:</span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
              locationSource === 'CURRENT'
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-amber-100 text-amber-800'
            }`}>
              {locationSource === 'CURRENT' ? 'CURRENT GPS' : 'LAST KNOWN'}
            </span>
            {emergency.approx_distance_km && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#EAF5FF] text-[#168BFA] border border-[#D0E6FC]">
                ~{emergency.approx_distance_km} km away
              </span>
            )}
          </div>

          <span className="text-[10px] text-[#627D98] font-mono">
            {locationSource === 'CURRENT' ? 'Live Fix (±' + accuracy + 'm)' : formatLocationAge(ageSeconds)}
          </span>
        </div>

        {/* Shareable Link & Action Buttons */}
        {locationLink ? (
          <div className="space-y-1.5">
            <div className="text-[11px] text-[#168BFA] font-mono truncate select-all">
              {locationLink}
            </div>

            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <button
                type="button"
                onClick={handleOpenLink}
                className="py-1 px-2 rounded-lg bg-[#EAF5FF] hover:bg-[#DDF0FF] border border-[#B6D9FB] text-[#168BFA] text-xs font-bold font-sans flex items-center justify-center gap-1 transition"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open Link</span>
              </button>

              <button
                type="button"
                onClick={handleCopyLink}
                className="py-1 px-2 rounded-lg bg-white hover:bg-[#F4FAFF] border border-[#D0E6FC] text-[#102B4E] text-xs font-bold font-sans flex items-center justify-center gap-1 transition"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-[#627D98]" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>

              {onShowRoute && lat !== null && lng !== null && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onShowRoute(emergency);
                  }}
                  title="Compute and display route on map"
                  className="py-1 px-2.5 rounded-lg bg-[#168BFA] hover:bg-[#1277d6] text-white text-xs font-bold flex items-center gap-1 shadow-2xs transition"
                >
                  <Route className="w-3.5 h-3.5" />
                  <span>Route</span>
                </button>
              )}

              {onFlyToMap && lat !== null && lng !== null && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFlyToMap(lat, lng);
                  }}
                  title="Center map on this incident"
                  className="py-1 px-2 rounded-lg bg-white hover:bg-[#F4FAFF] border border-[#D0E6FC] text-[#168BFA] text-xs font-bold flex items-center gap-1"
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Center</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="text-amber-800 text-[11px] italic">
            Coordinates unavailable. Landmark: {emergency.landmark || 'Not specified'}
          </div>
        )}
      </div>

      {/* AI Assessment & Verification Status */}
      <div className="pt-1.5 border-t border-[#EAF5FF] text-xs space-y-1.5">
        <div className="flex items-start gap-1.5 text-[#627D98]">
          <Sparkles className="w-3.5 h-3.5 text-[#168BFA] shrink-0 mt-0.5" />
          <span className="text-[11px] leading-relaxed">
            <strong className="text-[#102B4E]">AI assessment:</strong> {aiReason}
          </span>
        </div>

        <div className="flex items-center justify-between text-[11px] pt-1">
          <div className="flex items-center space-x-1.5">
            <span className="text-[#627D98]">Status:</span>
            {getVerificationBadge()}
          </div>

          <span className="text-[#168BFA] font-bold text-xs flex items-center gap-1 hover:underline">
            <span>Dossier & Help</span>
            <ArrowRight className="w-3 h-3" />
          </span>
        </div>
      </div>
    </div>
  );
}
