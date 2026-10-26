import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Navigation,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Crosshair,
  Shield,
  Wifi,
  WifiOff,
  Clock,
  Compass,
  Edit3
} from 'lucide-react';
import { formatLocationAge, getLocationFreshnessLabel } from '../services/locationService';

export default function LocationPermissionBanner({
  locationState,
  onRequestPermission,
  onManualLocationSelect = null
}) {
  const { status = 'prompt', coords = null, error = null, isRealGps = false } = locationState || {};
  const [now, setNow] = useState(Date.now());
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  // Periodic ticker to recalculate human-readable age while screen is open
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
      setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const isCached = coords && (!isRealGps || coords.is_last_known || coords.source === 'LAST_KNOWN');
  const freshness = getLocationFreshnessLabel(coords ? {
    latitude: coords.lat,
    longitude: coords.lng,
    accuracy_meters: coords.accuracy,
    measured_at: coords.measured_at || coords.timestamp,
    is_fresh: !isCached
  } : null);

  if (coords && coords.lat != null && coords.lng != null && isFinite(Number(coords.lat)) && isFinite(Number(coords.lng))) {
    return (
      <div className="bg-[#EAF5FF] border-b border-[#D0E6FC] px-4 py-2 text-xs font-sans text-[#102B4E] flex flex-wrap items-center justify-between gap-2 shadow-2xs">
        {/* Left: Freshness Status & Coordinates */}
        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
          <div className="flex items-center space-x-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${isCached ? 'bg-amber-500' : 'bg-emerald-500 animate-ping'} shrink-0`} />
            <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${freshness.badgeClass}`}>
              {freshness.label}
            </span>
          </div>

          <span className="text-[#102B4E] font-bold font-mono bg-white px-2 py-0.5 rounded-md border border-[#D0E6FC]">
            {coords.lat.toFixed(5)}°N, {coords.lng.toFixed(5)}°E
          </span>

          <span className="text-[#627D98] text-[11px] font-mono">
            (Accuracy: ±{Math.round(coords.accuracy || 15)} m)
          </span>

          {/* Age Tag */}
          {isCached && (
            <span className="inline-flex items-center space-x-1 px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded text-[11px] font-medium">
              <Clock className="w-3 h-3 text-amber-600" />
              <span>{formatLocationAge(coords.measured_at || coords.timestamp)}</span>
            </span>
          )}
        </div>

        {/* Right: State Separation (GPS vs Internet) & Action Buttons */}
        <div className="flex items-center space-x-3 text-[11px]">
          {/* Dual Network / Hardware Status */}
          <div className="hidden md:flex items-center space-x-2 border-r border-[#D0E6FC] pr-3 text-[10px] font-bold">
            <span className={`flex items-center space-x-1 ${isOnline ? 'text-emerald-700' : 'text-slate-500'}`}>
              {isOnline ? <Wifi className="w-3 h-3 text-emerald-600" /> : <WifiOff className="w-3 h-3 text-slate-400" />}
              <span>{isOnline ? 'Internet Online' : 'Air-Gapped Mesh'}</span>
            </span>
            <span className="text-slate-300">·</span>
            <span className="flex items-center space-x-1 text-[#168BFA]">
              <Crosshair className="w-3 h-3 text-[#168BFA]" />
              <span>{isRealGps ? 'GNSS Live' : 'Cached Fix'}</span>
            </span>
          </div>

          <button
            type="button"
            onClick={onRequestPermission}
            className="text-[#168BFA] hover:text-[#0f77d9] font-bold flex items-center space-x-1 hover:underline"
            title="Attempt fresh GPS satellite acquisition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Update GPS</span>
          </button>
        </div>
      </div>
    );
  }

  if (status === 'denied') {
    return (
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-start space-x-2.5 max-w-2xl">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold uppercase tracking-wide text-[11px] block">Location Access Restricted (Permission Denied)</span>
            <span className="text-amber-800 text-[11px] leading-relaxed">
              Browser GPS permission is blocked. To enable live satellite positioning: click the site settings / lock icon in your browser URL bar, set <strong>Location</strong> to <strong>"Allow"</strong>, and tap retry.
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {onManualLocationSelect && (
            <button
              type="button"
              onClick={onManualLocationSelect}
              className="px-2.5 py-1 bg-white hover:bg-amber-100 border border-amber-300 text-amber-900 font-bold rounded-lg text-xs transition"
            >
              Manual Location
            </button>
          )}
          <button
            type="button"
            onClick={onRequestPermission}
            className="px-3 py-1 bg-[#168BFA] hover:bg-[#0f77d9] text-white font-bold rounded-lg text-xs transition shadow-xs flex items-center space-x-1"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Retry GPS</span>
          </button>
        </div>
      </div>
    );
  }

  // Status is 'prompt' or 'requesting' or 'unavailable'
  return (
    <div className="bg-[#EAF5FF] border-b border-[#D0E6FC] px-4 py-2.5 text-xs text-[#102B4E] flex flex-wrap items-center justify-between gap-2 shadow-xs">
      <div className="flex items-center space-x-2.5">
        <div className="w-7 h-7 rounded-lg bg-white border border-[#B6D9FB] flex items-center justify-center text-[#168BFA] shrink-0 animate-pulse">
          <Crosshair className="w-4 h-4" />
        </div>
        <div>
          <div className="font-bold text-[#102B4E] flex items-center space-x-1.5">
            <span>Location Unavailable — Acquire Satellite Fix</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 bg-amber-100 text-amber-800 border border-amber-300 rounded">
              GPS Standby
            </span>
          </div>
          <p className="text-[11px] text-[#627D98] font-sans">
            Hardware GPS coordinates operate 100% offline without cellular data to pinpoint your location for rescuers.
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <button
          type="button"
          onClick={onRequestPermission}
          disabled={status === 'requesting'}
          className="px-3.5 py-1.5 bg-[#168BFA] hover:bg-[#0f77d9] text-white font-heading font-bold rounded-lg text-xs uppercase tracking-wide transition flex items-center space-x-1.5 shadow-sm"
        >
          <Navigation className="w-3.5 h-3.5" />
          <span>{status === 'requesting' ? 'Acquiring GPS...' : 'Enable GPS Location'}</span>
        </button>
      </div>
    </div>
  );
}
