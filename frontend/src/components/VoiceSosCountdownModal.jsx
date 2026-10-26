import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, Mic, Touchpad, X, Send, ShieldAlert, Heart } from 'lucide-react';
import { getEmergencyContact } from '../services/emergencyContactService';

export default function VoiceSosCountdownModal({
  isOpen,
  triggerData, // { source: 'VOICE' | 'GESTURE', phrase?: string, detectedText?: string, tapCount?: number }
  onCancel,
  onConfirm
}) {
  const [secondsLeft, setSecondsLeft] = useState(5);
  const timerRef = useRef(null);
  const contact = getEmergencyContact();

  useEffect(() => {
    if (!isOpen) {
      setSecondsLeft(5);
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    setSecondsLeft(5);

    // Beep tone using Web Audio API to alert user
    try {
      if (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime); // 880 Hz beep
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      }
    } catch (e) {}

    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          onConfirm(triggerData);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen, triggerData]);

  if (!isOpen) return null;

  const isVoice = triggerData?.source === 'VOICE';

  return (
    <div className="fixed inset-0 z-[10000] pointer-events-auto flex items-center justify-center p-4 bg-rose-950/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white border-2 border-rose-500 w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden flex flex-col text-center p-6 space-y-4">
        
        {/* Pulsing Alert Icon */}
        <div className="mx-auto relative">
          <div className="w-20 h-20 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 animate-pulse">
            {isVoice ? (
              <Mic className="w-10 h-10 text-rose-600" />
            ) : (
              <ShieldAlert className="w-10 h-10 text-rose-600" />
            )}
          </div>
          <span className="absolute -top-1 -right-1 px-2.5 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-mono font-bold uppercase shadow-sm">
            {triggerData?.source || 'SOS'}
          </span>
        </div>

        {/* Title & Trigger Cause */}
        <div>
          <h2 className="font-heading font-black text-xl text-rose-700 tracking-tight">
            Emergency SOS Triggered!
          </h2>
          <p className="text-xs text-[#627D98] mt-1">
            {isVoice ? (
              <>Voice phrase detected: <span className="font-mono font-bold text-rose-600">"{triggerData?.phrase || 'Help'}"</span></>
            ) : (
              <>RESQMesh Logo Clicked: <span className="font-mono font-bold text-rose-600">Emergency Beacon Triggered</span></>
            )}
          </p>
        </div>

        {/* Huge Countdown Display */}
        <div className="py-2">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-full border-4 border-rose-500 text-4xl font-heading font-black text-rose-600 shadow-inner">
            {secondsLeft}
          </div>
          <p className="text-[11px] font-sans text-[#627D98] mt-2">
            Broadcasting SOS & notifying <strong className="text-[#102B4E]">{contact?.name || 'Sanskruti'}</strong> ({contact?.country_code || '+91'} {contact?.phone || '9272104399'}) in {secondsLeft} seconds...
          </p>
        </div>

        {/* Action Controls */}
        <div className="space-y-2 pt-2">
          <button
            onClick={() => onConfirm(triggerData)}
            className="w-full py-3 bg-rose-600 hover:bg-rose-700 active:scale-98 text-white rounded-xl text-xs font-heading font-black shadow-lg shadow-rose-600/30 transition flex items-center justify-center space-x-2"
          >
            <Send className="w-4 h-4" />
            <span>Send SOS Immediately</span>
          </button>

          <button
            onClick={onCancel}
            className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 active:scale-98 text-[#102B4E] rounded-xl text-xs font-heading font-bold transition flex items-center justify-center space-x-1.5"
          >
            <X className="w-4 h-4 text-slate-500" />
            <span>Cancel SOS (False Alarm)</span>
          </button>
        </div>

        <p className="text-[10px] text-[#627D98]">
          Cancelling will discard this event. If not cancelled, emergency responders & contacts will be notified.
        </p>
      </div>
    </div>
  );
}
