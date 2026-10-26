import React, { useState, useEffect } from 'react';
import { Shield, User, Phone, CheckCircle2, AlertCircle, X, Heart, Smartphone } from 'lucide-react';
import {
  DEFAULT_PROTOTYPE_CONTACT,
  validatePhoneNumber,
  saveEmergencyContact,
  markContactOnboarded
} from '../services/emergencyContactService';
import { isNativeDirectSmsSupported } from '../services/emergencyNotificationService';

export default function EmergencyContactModal({
  isOpen,
  onClose,
  currentUser,
  isOnboarding = false,
  onContactSaved
}) {
  const [name, setName] = useState(DEFAULT_PROTOTYPE_CONTACT.name);
  const [phone, setPhone] = useState(DEFAULT_PROTOTYPE_CONTACT.phone);
  const [countryCode, setCountryCode] = useState(DEFAULT_PROTOTYPE_CONTACT.country_code);
  const [relationship, setRelationship] = useState(DEFAULT_PROTOTYPE_CONTACT.relationship);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (currentUser?.emergency_contact) {
      setName(currentUser.emergency_contact.name || DEFAULT_PROTOTYPE_CONTACT.name);
      setPhone(currentUser.emergency_contact.phone || DEFAULT_PROTOTYPE_CONTACT.phone);
      setCountryCode(currentUser.emergency_contact.country_code || DEFAULT_PROTOTYPE_CONTACT.country_code);
      setRelationship(currentUser.emergency_contact.relationship || DEFAULT_PROTOTYPE_CONTACT.relationship);
    }
  }, [currentUser, isOpen]);

  if (!isOpen) return null;

  const handleSave = async (e) => {
    e?.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const validation = validatePhoneNumber(phone, countryCode);
    if (validation) {
      setErrorMsg(validation);
      return;
    }

    setIsSaving(true);
    try {
      const saved = await saveEmergencyContact(currentUser?.user_id || 'usr-citizen', {
        name,
        phone,
        country_code: countryCode,
        relationship
      });
      setSuccessMsg('Emergency contact saved successfully!');
      if (onContactSaved) onContactSaved(saved);
      setTimeout(() => {
        setIsSaving(false);
        onClose();
      }, 700);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to save emergency contact');
      setIsSaving(false);
    }
  };

  const handleSkip = () => {
    markContactOnboarded(currentUser?.user_id || 'usr-citizen', true);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-auto flex items-center justify-center p-4 bg-[#102B4E]/70 backdrop-blur-xs">
      <div className="bg-white border border-[#D0E6FC] w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 bg-[#EAF5FF] border-b border-[#D0E6FC] text-[#102B4E] flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-white border border-[#B6D9FB] flex items-center justify-center text-rose-500 shadow-xs">
              <Heart className="w-5 h-5 fill-rose-500 text-rose-500" />
            </div>
            <div>
              <h2 className="font-heading font-black text-base text-[#102B4E] tracking-tight">
                {isOnboarding ? 'Emergency Contact Setup' : 'Manage Emergency Contact'}
              </h2>
              <p className="text-[11px] text-[#627D98] font-sans">
                {isOnboarding ? 'Step 1 of 1: Who should we alert in danger?' : 'Trusted recipient for Voice & Gesture SOS'}
              </p>
            </div>
          </div>
          {!isOnboarding && (
            <button
              onClick={onClose}
              className="text-[#627D98] hover:text-[#102B4E] p-1.5 rounded-lg hover:bg-white/80 transition"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Informative Banner */}
        <div className="px-6 pt-4 pb-2">
          <div className="p-3 bg-[#F4FAFF] border border-[#D0E6FC] rounded-xl text-xs text-[#102B4E] flex items-start space-x-2.5">
            <Shield className="w-4 h-4 text-[#168BFA] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-[11px] leading-relaxed text-[#627D98]">
                When an SOS is triggered via voice phrase, multi-tap gesture, or beacon button, RESQMesh automatically transmits your location, accuracy, and timestamp directly to this contact.
              </p>
              <div className="flex items-center space-x-1.5 pt-1">
                <Smartphone className="w-3.5 h-3.5 text-[#168BFA]" />
                <span className="text-[10px] font-bold text-[#168BFA]">
                  {isNativeDirectSmsSupported()
                    ? '✓ Direct Cellular SMS: Enabled (Dispatches without opening messaging app)'
                    : '🌐 Browser Mode: Queued for multi-hop mesh relay to cellular nodes'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-6 pt-2 space-y-3.5">
          {errorMsg && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Name Field */}
          <div>
            <label className="block text-[11px] font-sans font-bold text-[#102B4E] uppercase tracking-wider mb-1">
              Contact Full Name
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sanskruti"
                className="w-full pl-9 pr-3 py-2 bg-white border border-[#D0E6FC] rounded-xl text-xs text-[#102B4E] focus:outline-none focus:border-[#168BFA] focus:ring-2 focus:ring-[#168BFA]/10 font-bold"
              />
              <User className="w-4 h-4 text-[#627D98] absolute left-3 top-2.5" />
            </div>
          </div>

          {/* Phone Field with Country Code */}
          <div>
            <label className="block text-[11px] font-sans font-bold text-[#102B4E] uppercase tracking-wider mb-1">
              Mobile Phone Number
            </label>
            <div className="grid grid-cols-4 gap-2">
              <div className="col-span-1">
                <input
                  type="text"
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="w-full text-center py-2 bg-[#F4FAFF] border border-[#D0E6FC] rounded-xl text-xs font-mono font-bold text-[#102B4E] focus:outline-none focus:border-[#168BFA]"
                />
              </div>
              <div className="col-span-3 relative">
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="9272104399"
                  className="w-full pl-9 pr-3 py-2 bg-white border border-[#D0E6FC] rounded-xl text-xs text-[#102B4E] focus:outline-none focus:border-[#168BFA] focus:ring-2 focus:ring-[#168BFA]/10 font-mono font-bold"
                />
                <Phone className="w-4 h-4 text-[#627D98] absolute left-3 top-2.5" />
              </div>
            </div>
            <p className="text-[10px] text-[#627D98] mt-1">
              Default prefilled for quick setup. Valid 10-digit number for SMS dispatch.
            </p>
          </div>

          {/* Relationship */}
          <div>
            <label className="block text-[11px] font-sans font-bold text-[#102B4E] uppercase tracking-wider mb-1">
              Relationship / Tag (Optional)
            </label>
            <input
              type="text"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              placeholder="e.g. Primary Emergency Contact, Family"
              className="w-full px-3 py-2 bg-white border border-[#D0E6FC] rounded-xl text-xs text-[#102B4E] focus:outline-none focus:border-[#168BFA]"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-between space-x-3">
            {isOnboarding ? (
              <button
                type="button"
                onClick={handleSkip}
                className="px-4 py-2 text-xs font-heading font-bold text-[#627D98] hover:text-[#102B4E] transition"
              >
                Skip for now
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-heading font-bold text-[#627D98] hover:text-[#102B4E] transition"
              >
                Cancel
              </button>
            )}

            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 bg-[#168BFA] hover:bg-[#1270C9] text-white rounded-xl text-xs font-heading font-black shadow-md hover:shadow-lg transition flex items-center space-x-2 disabled:opacity-50"
            >
              {isSaving ? (
                <span>Saving...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isOnboarding ? 'Save & Continue' : 'Update Contact'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
