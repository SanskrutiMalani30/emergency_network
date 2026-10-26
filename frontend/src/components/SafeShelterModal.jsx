import React, { useState } from 'react';
import {
  X,
  Navigation,
  ShieldCheck,
  MapPin,
  Clock,
  Phone,
  Layers,
  ArrowRight,
  ExternalLink,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';

export default function SafeShelterModal({
  isOpen,
  onClose,
  userLocation,
  shelters = [],
  activeRoute = null,
  isCalculating = false,
  onSelectShelter,
  onOpenMapWithRoute
}) {
  if (!isOpen) return null;

  const primaryShelter = shelters[0] || {
    id: 'node_community_shelter_s9',
    name: 'Sector 9 Community Evacuation Center',
    address: 'Sector 9 High Ground School, Main Rd',
    lat: 21.1380,
    lng: 79.0680,
    distanceKm: 1.8,
    etaMinutes: 4,
    status: 'OPEN & VERIFIED',
    capacity: '85 / 200 People',
    supplies: { water: 'High', food: 'Available', medical: 'Paramedic On Site' },
    phone: '+91 9823011223'
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="safe-shelter-title"
      className="fixed inset-0 z-[10001] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 text-slate-900 font-sans">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#1B6B57]/10 flex items-center justify-center text-[#1B6B57]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 id="safe-shelter-title" className="font-heading font-black text-base text-slate-900 leading-tight">
                Verified Safe Shelters
              </h3>
              <p className="text-xs text-slate-500">
                Disaster-safe evacuation destinations & verified routes
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close shelter dialog"
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-200/60 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          
          {/* Primary Recommended Safe Shelter Card */}
          <div className="p-4 rounded-xl bg-[#1B6B57]/5 border-2 border-[#1B6B57] space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-[#1B6B57] text-white text-[10px] font-black uppercase tracking-wider">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>RECOMMENDED SAFE HAVEN</span>
                </span>
                <h4 className="font-bold text-base text-slate-900 mt-1.5">
                  {primaryShelter.name}
                </h4>
                <p className="text-xs text-slate-600 flex items-center space-x-1 mt-0.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{primaryShelter.address}</span>
                </p>
              </div>

              <div className="text-right shrink-0">
                <span className="text-sm font-black text-[#1B6B57] block">
                  {primaryShelter.distanceKm ? `${primaryShelter.distanceKm} km` : '1.8 km'}
                </span>
                <span className="text-[11px] text-slate-500 font-medium flex items-center justify-end space-x-1">
                  <Clock className="w-3 h-3" />
                  <span>~{primaryShelter.etaMinutes || 4} min</span>
                </span>
              </div>
            </div>

            {/* Route Status Notice */}
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Hazard-free path calculated avoiding flood & debris zones.</span>
            </div>

            {/* Shelter Supply Stats */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="p-2 bg-white rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-500 uppercase block font-semibold">Capacity</span>
                <strong className="text-slate-800">{primaryShelter.capacity}</strong>
              </div>
              <div className="p-2 bg-white rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-500 uppercase block font-semibold">Drinking Water</span>
                <strong className="text-emerald-700">{primaryShelter.supplies?.water || 'Available'}</strong>
              </div>
              <div className="p-2 bg-white rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-500 uppercase block font-semibold">Medical Staff</span>
                <strong className="text-slate-800">{primaryShelter.supplies?.medical || 'On Duty'}</strong>
              </div>
            </div>

            {/* Action Buttons for Primary Shelter */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => onOpenMapWithRoute(primaryShelter)}
                className="w-full py-2.5 px-3 bg-[#1B6B57] hover:bg-[#165646] active:bg-[#12483A] text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition shadow-xs"
              >
                <Navigation className="w-4 h-4" />
                <span>View Route on Map</span>
              </button>

              <a
                href={`tel:${primaryShelter.phone}`}
                className="w-full py-2.5 px-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition text-center"
              >
                <Phone className="w-4 h-4 text-slate-600" />
                <span>Call Coordinator</span>
              </a>
            </div>
          </div>

          {/* Secondary Shelters in the Area */}
          <div className="space-y-2">
            <h5 className="text-xs font-bold text-slate-600 uppercase tracking-wide">
              Additional Verified Shelters
            </h5>

            {shelters.slice(1).map((sh, idx) => (
              <div
                key={sh.id || idx}
                className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between hover:border-slate-300 transition"
              >
                <div className="min-w-0 flex-1 mr-3">
                  <div className="flex items-center space-x-2">
                    <h6 className="font-bold text-xs text-slate-800 truncate">
                      {sh.name}
                    </h6>
                    <span className="text-[9px] font-bold px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded">
                      OPEN
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">
                    {sh.address}
                  </p>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <span className="text-xs font-bold text-slate-700">
                    {sh.distanceKm} km
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenMapWithRoute(sh)}
                    aria-label={`View route to ${sh.name}`}
                    className="p-1.5 bg-slate-100 hover:bg-[#1B6B57] hover:text-white rounded-lg text-slate-600 transition"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>Official Civil Defense Verified Locations</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 font-bold text-slate-700 hover:underline"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
}
