import React, { useState } from 'react';
import {
  X,
  User,
  Phone,
  Shield,
  Radio,
  LogOut,
  Heart,
  Mic,
  Sliders,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Touchpad
} from 'lucide-react';
import { getEmergencyContact } from '../services/emergencyContactService';
import { voiceSosService, DEFAULT_VOICE_CONFIG } from '../services/voiceSosService';
import { gestureSosService, DEFAULT_GESTURE_CONFIG } from '../services/gestureSosService';

export default function ProfileModal({
  isOpen,
  onClose,
  currentUser,
  onLogout,
  onOpenEditContact
}) {
  const [activeSubTab, setActiveSubTab] = useState('profile'); // 'profile' | 'safety_triggers'
  const [voiceConfig, setVoiceConfig] = useState(() => voiceSosService.config);
  const [gestureConfig, setGestureConfig] = useState(() => gestureSosService.config);

  if (!isOpen) return null;

  const contact = getEmergencyContact(currentUser?.user_id || 'usr-citizen');

  const initials = (currentUser?.display_name || 'Anonymous User')
    .trim()
    .split(/\s+/)
    .map(n => n ? n[0] : '')
    .join('')
    .substring(0, 2)
    .toUpperCase() || 'US';

  const handleToggleVoice = (enabled) => {
    const updated = { ...voiceConfig, enabled };
    setVoiceConfig(updated);
    voiceSosService.saveConfig(updated);
  };

  const handleToggleGesture = (enabled) => {
    const updated = { ...gestureConfig, enabled };
    setGestureConfig(updated);
    gestureSosService.saveConfig(updated);
  };

  const handleToggleGestureTest = (testMode) => {
    const updated = { ...gestureConfig, testMode };
    setGestureConfig(updated);
    gestureSosService.saveConfig(updated);
  };

  const handleTapCountChange = (tapCount) => {
    const updated = { ...gestureConfig, tapCount: Number(tapCount) };
    setGestureConfig(updated);
    gestureSosService.saveConfig(updated);
  };

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-auto flex items-center justify-center p-4 bg-[#102B4E]/60 backdrop-blur-xs">
      <div className="bg-white border border-[#D0E6FC] w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 bg-[#EAF5FF] border-b border-[#D0E6FC] text-[#102B4E] flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-white border border-[#B6D9FB] flex items-center justify-center text-[#168BFA] shadow-xs">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-heading font-black text-base text-[#102B4E] uppercase tracking-wide">
                User Profile & Safety
              </h2>
              <p className="text-[11px] text-[#627D98] font-sans">
                Identity, Emergency Contact & Trigger Settings
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#627D98] hover:text-[#102B4E] p-1.5 rounded-lg hover:bg-white/80 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub-tabs: Profile vs Safety Triggers */}
        <div className="flex border-b border-[#D0E6FC] bg-[#F4FAFF] px-6 pt-2 shrink-0">
          <button
            onClick={() => setActiveSubTab('profile')}
            className={`pb-2.5 px-3 text-xs font-heading font-bold border-b-2 transition ${
              activeSubTab === 'profile'
                ? 'border-[#168BFA] text-[#168BFA]'
                : 'border-transparent text-[#627D98] hover:text-[#102B4E]'
            }`}
          >
            Identity & Contact
          </button>
          <button
            onClick={() => setActiveSubTab('safety_triggers')}
            className={`pb-2.5 px-3 text-xs font-heading font-bold border-b-2 transition flex items-center space-x-1.5 ${
              activeSubTab === 'safety_triggers'
                ? 'border-[#168BFA] text-[#168BFA]'
                : 'border-transparent text-[#627D98] hover:text-[#102B4E]'
            }`}
          >
            <span>Safety Triggers (Voice & Multi-Tap)</span>
            {(voiceConfig.enabled || gestureConfig.enabled) && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            )}
          </button>
        </div>

        {/* Content (Scrollable) */}
        <div className="p-6 space-y-4 overflow-y-auto">
          
          {activeSubTab === 'profile' ? (
            <>
              {/* Identity Card */}
              <div className="flex items-center space-x-3.5 bg-[#EAF5FF] p-4 rounded-xl border border-[#D0E6FC]">
                <div className="w-12 h-12 bg-[#168BFA] text-white rounded-xl flex items-center justify-center font-heading font-black text-lg shadow-sm">
                  {initials}
                </div>
                <div>
                  <h3 className="font-heading font-black text-base text-[#102B4E]">
                    {currentUser?.display_name || 'Anonymous User'}
                  </h3>
                  <p className="text-xs text-[#168BFA] font-mono font-bold">
                    {currentUser?.user_id || 'usr-local'}
                  </p>
                  <div className="flex items-center space-x-1.5 mt-1 text-[11px] text-[#627D98]">
                    <Shield className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700 font-bold uppercase text-[10px]">
                      {currentUser?.role || 'Citizen'} ({currentUser?.responder_status || 'CITIZEN'})
                    </span>
                  </div>
                </div>
              </div>

              {/* Emergency Contact Card */}
              <div className="bg-white border border-[#D0E6FC] rounded-xl p-4 space-y-2 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-rose-600 font-heading font-bold text-xs uppercase tracking-wide">
                    <Heart className="w-4 h-4 fill-rose-500 text-rose-500" />
                    <span>Emergency Contact</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      if (onOpenEditContact) onOpenEditContact();
                    }}
                    className="text-[11px] font-heading font-bold text-[#168BFA] hover:underline"
                  >
                    Edit Contact
                  </button>
                </div>
                <div className="flex items-center justify-between text-xs pt-1">
                  <div>
                    <div className="font-bold text-[#102B4E]">{contact.name}</div>
                    <div className="text-[11px] text-[#627D98]">{contact.relationship}</div>
                  </div>
                  <div className="text-right font-mono font-bold text-[#168BFA]">
                    {contact.country_code} {contact.phone}
                  </div>
                </div>
              </div>

              {/* Account Details list */}
              <div className="space-y-2 text-xs font-sans">
                <div className="flex justify-between py-2 border-b border-[#EAF5FF]">
                  <span className="text-[#627D98]">Account Email:</span>
                  <span className="text-[#102B4E] font-bold font-mono">{currentUser?.email || 'N/A'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-[#EAF5FF]">
                  <span className="text-[#627D98]">Username:</span>
                  <span className="text-[#102B4E] font-bold font-mono">{currentUser?.username || 'N/A'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-[#EAF5FF]">
                  <span className="text-[#627D98]">Offline Session Lease:</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold font-mono text-[10px]">
                    24-Hour Active
                  </span>
                </div>
              </div>

              {/* Security & Offline Mesh badge */}
              <div className="bg-[#EAF5FF] p-3 rounded-xl border border-[#D0E6FC] text-xs space-y-1">
                <div className="font-bold text-[#102B4E] flex items-center space-x-1.5">
                  <Radio className="w-3.5 h-3.5 text-[#168BFA]" />
                  <span>Decentralized Mesh Node Active</span>
                </div>
                <p className="text-[#627D98] text-[11px] leading-relaxed">
                  Operating with local Ed25519 cryptographic signatures and offline Web Crypto verifiers.
                </p>
              </div>

              {/* Logout Button */}
              {onLogout && (
                <button
                  type="button"
                  onClick={() => {
                    onLogout();
                    onClose();
                  }}
                  className="w-full py-2.5 bg-white border border-rose-200 hover:bg-rose-50 text-rose-600 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out of RESQMesh</span>
                </button>
              )}
            </>
          ) : (
            <>
              {/* Voice-Triggered SOS Configuration */}
              <div className="bg-white border border-[#D0E6FC] rounded-xl p-4 space-y-3 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-7 h-7 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
                      <Mic className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <h4 className="font-heading font-black text-xs text-[#102B4E] uppercase">
                        Voice-Triggered SOS
                      </h4>
                      <p className="text-[10px] text-[#627D98]">
                        Listens for emergency trigger phrases locally
                      </p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={voiceConfig.enabled}
                      onChange={(e) => handleToggleVoice(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#168BFA]"></div>
                  </label>
                </div>

                {voiceConfig.enabled && (
                  <div className="space-y-2 pt-2 border-t border-[#EAF5FF] text-xs">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-[#627D98]">Trigger Phrases Supported:</span>
                      <span className="font-mono font-bold text-[#168BFA] text-[10px]">
                        English, Hindi, Hinglish
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {voiceConfig.phrases.map((phrase, i) => (
                        <span key={i} className="px-2 py-0.5 rounded-md bg-[#EAF5FF] text-[#102B4E] text-[10px] font-mono border border-[#D0E6FC]">
                          "{phrase}"
                        </span>
                      ))}
                    </div>
                    <p className="text-[10px] text-[#627D98] leading-tight pt-1">
                      Privacy guarantee: No audio is recorded or uploaded to servers. Spoken words are matched locally on your device against trigger phrases only.
                    </p>
                  </div>
                )}
              </div>

              {/* Hidden Multi-Tap SOS Gesture Configuration */}
              <div className="bg-white border border-[#D0E6FC] rounded-xl p-4 space-y-3 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-7 h-7 rounded-lg bg-[#EAF5FF] border border-[#B6D9FB] flex items-center justify-center text-[#168BFA]">
                      <Shield className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <h4 className="font-heading font-black text-xs text-[#102B4E] uppercase">
                        Hidden Multi-Tap SOS Gesture
                      </h4>
                      <p className="text-[10px] text-[#627D98]">
                        Rapidly tap the RESQMesh logo in the navbar
                      </p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={gestureConfig.enabled}
                      onChange={(e) => handleToggleGesture(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#168BFA]"></div>
                  </label>
                </div>

                {gestureConfig.enabled && (
                  <div className="space-y-3 pt-2 border-t border-[#EAF5FF] text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[#627D98]">Taps Required in 2 Seconds:</span>
                      <select
                        value={gestureConfig.tapCount}
                        onChange={(e) => handleTapCountChange(e.target.value)}
                        className="p-1 px-2 bg-[#F4FAFF] border border-[#D0E6FC] rounded-md text-xs font-bold text-[#102B4E]"
                      >
                        <option value={1}>1 Click / Tap (Instant - Default)</option>
                        <option value={2}>2 Taps (Double Click)</option>
                        <option value={3}>3 Taps (Sensitive)</option>
                        <option value={5}>5 Taps (Hidden)</option>
                      </select>
                    </div>

                    {/* Test Mode Toggle */}
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between">
                      <div>
                        <div className="font-bold text-amber-900 text-[11px]">
                          Safe Test Mode
                        </div>
                        <div className="text-[10px] text-amber-700">
                          Verify gesture detection without sending real emergency alerts
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={gestureConfig.testMode}
                        onChange={(e) => handleToggleGestureTest(e.target.checked)}
                        className="w-4 h-4 text-[#168BFA] rounded-md focus:ring-0"
                      />
                    </div>

                    <p className="text-[10px] text-[#627D98] leading-tight">
                      Note: Browser security policies prevent gesture detection in background or suspended browser tabs. Multi-tap works while this website is open and interactive.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}

        </div>

      </div>
    </div>
  );
}
