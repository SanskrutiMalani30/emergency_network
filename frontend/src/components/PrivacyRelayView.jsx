import React, { useState } from 'react';
import { Lock, EyeOff, Key, ShieldCheck, ArrowRight, UserCheck, RefreshCw } from 'lucide-react';
import { runPrivacyDemo } from '../services/api';

export default function PrivacyRelayView() {
  const [patientName, setPatientName] = useState('Ramesh Sharma (Age 64)');
  const [condition, setCondition] = useState('Severe cardiac arrhythmia & Type 1 Diabetes, needs refrigerated insulin immediately.');
  const [address, setAddress] = useState('House #14, Lane 3, Flood Zone 1');
  const [phone, setPhone] = useState('+91 94231 88910');
  
  const [demoResult, setDemoResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSimulate = async () => {
    setLoading(true);
    try {
      const res = await runPrivacyDemo({
        emergency_id: 'emg-priv-ramesh-01',
        victim_name: patientName,
        medical_condition: condition,
        private_phone: phone,
        address: address
      });
      setDemoResult(res);
    } catch (err) {
      alert(`Privacy simulation error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 bg-navy-950 font-sans space-y-6">
      
      {/* Banner */}
      <div className="bg-navy-900 border border-navy-800 rounded-sm p-6 shadow-xl">
        <div className="flex items-center space-x-2.5 mb-1">
          <Lock className="w-5 h-5 text-cyan" />
          <h2 className="font-heading font-bold text-base text-slate-100 uppercase tracking-wide">
            Privacy & Envelope Encryption Relay Simulator
          </h2>
        </div>
        <p className="text-xs text-slate-400 font-mono">
          Demonstrates hop-by-hop mesh packet forwarding without exposing sensitive medical records to intermediate peers.
        </p>
      </div>

      {/* Input Payload & Trigger */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Sensitive Payload Definition */}
        <div className="bg-navy-900 border border-navy-800 rounded-sm p-5 space-y-3 shadow-xl">
          <h3 className="font-heading font-bold text-xs uppercase text-slate-200 tracking-wider">
            Protected Health Information (PHI)
          </h3>
          <div className="space-y-2 text-xs font-mono">
            <div>
              <label className="text-[10px] text-slate-400 uppercase">Victim Identity:</label>
              <input
                type="text"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                className="w-full p-2 bg-navy-950 border border-navy-700 rounded text-slate-200"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 uppercase">Medical Diagnosis:</label>
              <textarea
                rows={2}
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="w-full p-2 bg-navy-950 border border-navy-700 rounded text-slate-200 font-sans"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 uppercase">Private Address:</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full p-2 bg-navy-950 border border-navy-700 rounded text-slate-200"
              />
            </div>
          </div>
          <button
            onClick={handleSimulate}
            disabled={loading}
            className="w-full py-2.5 bg-cyan hover:bg-cyan-400 text-navy-950 font-mono font-bold text-xs uppercase tracking-wider rounded transition"
          >
            {loading ? 'Encrypting & Forwarding...' : 'TRANSMIT ENCRYPTED PACKET'}
          </button>
        </div>

        {/* Relay Hop Perspective */}
        <div className="bg-navy-900 border border-navy-800 rounded-sm p-5 space-y-3 shadow-xl">
          <div className="flex items-center space-x-1.5 text-amber-400">
            <EyeOff className="w-4 h-4" />
            <h3 className="font-heading font-bold text-xs uppercase tracking-wider">
              Untrusted Relay Intermediary View
            </h3>
          </div>
          {demoResult ? (
            <div className="space-y-3 text-xs font-mono">
              <div className="p-3 bg-navy-950 rounded border border-navy-800 text-[11px] space-y-1">
                <span className="text-slate-400">Public Routing Header:</span>
                <div className="text-cyan">APPROX_LAT: {demoResult.envelope?.routing_header?.approx_lat}</div>
                <div className="text-cyan">APPROX_LNG: {demoResult.envelope?.routing_header?.approx_lng}</div>
                <div className="text-cyan">REQUIRED_SKILL: {demoResult.envelope?.routing_header?.required_skill}</div>
              </div>

              <div className="p-3 bg-red-950/20 border border-red-500/40 rounded text-[11px] space-y-1">
                <span className="text-red-400 font-bold">Encrypted Ciphertext Block:</span>
                <p className="text-slate-400 break-all">
                  {demoResult.relay_intermediary_view?.hidden_protected_payload}
                </p>
                <div className="text-[10px] text-emerald-400 font-semibold pt-1">
                  ✓ {demoResult.relay_intermediary_view?.security_guarantee}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-16 text-center text-slate-500 font-mono text-xs">
              Click Transmit to inspect what intermediary relay hops see.
            </div>
          )}
        </div>

        {/* Authorized Medic Perspective */}
        <div className="bg-navy-900 border border-navy-800 rounded-sm p-5 space-y-3 shadow-xl">
          <div className="flex items-center space-x-1.5 text-emerald-400">
            <ShieldCheck className="w-4 h-4" />
            <h3 className="font-heading font-bold text-xs uppercase tracking-wider">
              Authorized Dispatched Medic View
            </h3>
          </div>
          {demoResult ? (
            <div className="space-y-3 text-xs font-mono">
              <div className="p-3 bg-emerald-950/20 border border-emerald-500/40 rounded text-[11px] space-y-1.5">
                <span className="text-emerald-400 font-bold">Decrypted Medical Dossier:</span>
                <div>Patient: <strong className="text-slate-100">{demoResult.authorized_medic_view?.medical_payload?.victim_name}</strong></div>
                <div>Condition: <span className="text-slate-300 font-sans">{demoResult.authorized_medic_view?.medical_payload?.medical_condition}</span></div>
                <div>Address: <span className="text-slate-300">{demoResult.authorized_medic_view?.medical_payload?.address}</span></div>
                <div>Phone: <span className="text-slate-300">{demoResult.authorized_medic_view?.medical_payload?.private_phone}</span></div>
              </div>

              <div className="p-2.5 bg-navy-950 border border-navy-800 rounded text-[10px] text-slate-400">
                {demoResult.authorized_medic_view?.audit_note}
              </div>
            </div>
          ) : (
            <div className="py-16 text-center text-slate-500 font-mono text-xs">
              Authorized decrypt view appears upon transmission.
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
