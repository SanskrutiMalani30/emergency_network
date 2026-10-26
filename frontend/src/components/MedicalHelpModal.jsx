import React from 'react';
import {
  X,
  HeartPulse,
  Phone,
  Radio,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';

export default function MedicalHelpModal({
  isOpen,
  onClose,
  onRequestMedicalSos
}) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="med-help-title"
      className="fixed inset-0 z-[10001] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-200 text-slate-900 font-sans">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-rose-50/50">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
              <HeartPulse className="w-4 h-4" />
            </div>
            <h3 id="med-help-title" className="font-heading font-black text-base text-slate-900">
              Medical Help
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-4">
          
          <p className="text-xs text-slate-600 leading-relaxed">
            Need urgent medical attention, first aid, or an ambulance? Triggering medical help will notify nearby responders and your emergency contact with your coordinates.
          </p>

          {/* 1-Tap Medical SOS Button */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onRequestMedicalSos();
            }}
            className="w-full py-3.5 px-4 bg-rose-700 hover:bg-rose-800 active:bg-rose-900 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center space-x-2 transition shadow-xs"
          >
            <Radio className="w-4 h-4 animate-pulse" />
            <span>Request Urgent Medical Aid (1-Tap SOS)</span>
          </button>

          {/* Call Ambulance Directly */}
          <a
            href="tel:108"
            className="w-full py-3 px-4 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-200 text-slate-900 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center space-x-2 transition text-center block"
          >
            <Phone className="w-4 h-4 text-rose-600" />
            <span>Call Ambulance Directly (108)</span>
          </a>

          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900">
            <strong>Emergency Tip:</strong> If safe, keep airway clear and do not move severely injured victims unless immediate hazard exists.
          </div>

        </div>

      </div>
    </div>
  );
}
