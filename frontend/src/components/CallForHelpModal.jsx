import React from 'react';
import {
  X,
  Phone,
  MessageSquare,
  Shield,
  UserCheck,
  ExternalLink,
  Settings
} from 'lucide-react';

export default function CallForHelpModal({
  isOpen,
  onClose,
  currentUser,
  onSendDirectSms,
  onOpenEditContact
}) {
  if (!isOpen) return null;

  const contactName = currentUser?.emergency_contact?.name || 'Sanskruti (Primary Contact)';
  const contactPhone = currentUser?.emergency_contact?.phone || '+91 9272104399';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="call-help-title"
      className="fixed inset-0 z-[10001] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-200 text-slate-900 font-sans">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Phone className="w-4 h-4" />
            </div>
            <h3 id="call-help-title" className="font-heading font-black text-base text-slate-900">
              Call for Help
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
          
          {/* Emergency Contact Card */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">
                  Saved Emergency Contact
                </span>
                <strong className="text-sm text-slate-900 block mt-0.5">
                  {contactName}
                </strong>
                <span className="text-xs text-slate-600 font-mono">
                  {contactPhone}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenEditContact();
                }}
                className="text-[11px] font-bold text-[#1B6B57] hover:underline flex items-center space-x-1"
                title="Edit emergency contact"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
            </div>

            {/* Direct Cellular Call Button */}
            <a
              href={`tel:${contactPhone.replace(/\s+/g, '')}`}
              className="w-full py-3 px-4 bg-[#1B6B57] hover:bg-[#165646] active:bg-[#12483A] text-white rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center space-x-2 transition shadow-xs"
            >
              <Phone className="w-4 h-4" />
              <span>Call Contact Now</span>
            </a>

            {/* Direct Emergency SMS Button */}
            <button
              type="button"
              onClick={() => {
                onClose();
                onSendDirectSms();
              }}
              className="w-full py-2.5 px-4 bg-white border border-slate-300 hover:bg-slate-50 active:bg-slate-100 text-slate-800 rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition"
            >
              <MessageSquare className="w-4 h-4 text-slate-600" />
              <span>Send Silent SOS & GPS SMS</span>
            </button>
          </div>

          {/* National Helplines */}
          <div className="space-y-2 pt-1">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide block">
              Official Helplines (Toll-Free)
            </span>
            <div className="grid grid-cols-2 gap-2">
              <a
                href="tel:112"
                className="p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-center block transition"
              >
                <strong className="text-xs text-slate-900 block">112</strong>
                <span className="text-[10px] text-slate-500">All Emergencies</span>
              </a>
              <a
                href="tel:108"
                className="p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-center block transition"
              >
                <strong className="text-xs text-slate-900 block">108</strong>
                <span className="text-[10px] text-slate-500">Disaster Medical</span>
              </a>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
