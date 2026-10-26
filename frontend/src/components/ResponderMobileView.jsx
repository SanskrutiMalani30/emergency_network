import React, { useState } from 'react';
import { Smartphone, Check, X, AlertTriangle, Navigation, MapPin, Shield, CheckCircle2 } from 'lucide-react';
import { takeDispatchAction } from '../services/api';

export default function ResponderMobileView({ dispatches = [], onActionCompleted }) {
  const [selectedDispatchId, setSelectedDispatchId] = useState(dispatches[0]?.dispatch_id || '');
  const [loading, setLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

  const activeDispatch = dispatches.find(d => d.dispatch_id === selectedDispatchId) || dispatches[0];

  const handleAction = async (action, reason = '') => {
    if (!activeDispatch) return;
    setLoading(true);
    try {
      await takeDispatchAction(activeDispatch.dispatch_id, action, reason);
      setShowRejectInput(false);
      if (onActionCompleted) onActionCompleted();
    } catch (err) {
      alert(`Action error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 bg-navy-950 flex flex-col items-center justify-center font-sans">
      
      {/* Mobile Handset Mock Frame */}
      <div className="w-full max-w-sm bg-navy-900 border-2 border-cyan/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-100">
        
        {/* Handset Top Notch Bar */}
        <div className="bg-navy-950 px-4 py-2 flex items-center justify-between text-[11px] font-mono text-slate-400 border-b border-navy-800">
          <div className="flex items-center space-x-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>PEER MESH HOP: 2</span>
          </div>
          <span className="text-cyan font-bold">BATTERY: 86%</span>
        </div>

        {/* Handset Content Area */}
        <div className="p-5 space-y-4">
          
          <div className="text-center pb-2 border-b border-navy-800">
            <span className="text-[10px] font-mono text-cyan uppercase tracking-widest font-bold">
              INCOMING RESCUE ASSIGNMENT
            </span>
            <h3 className="font-heading font-bold text-base text-slate-100 mt-0.5">
              Mission #{activeDispatch ? activeDispatch.dispatch_id.slice(0, 10) : 'NO_PENDING'}
            </h3>
          </div>

          {activeDispatch ? (
            <div className="space-y-3.5 text-xs font-mono">
              
              {/* Mission Urgency & Status */}
              <div className="flex items-center justify-between p-2.5 bg-navy-950 rounded border border-navy-800">
                <span className="text-slate-400">ASSIGNED TO:</span>
                <span className="text-cyan font-bold">{activeDispatch.responder_name}</span>
              </div>

              {/* One-Line Plain Language Selection Justification */}
              <div className="p-3 bg-cyan/10 border border-cyan/30 rounded text-slate-200 text-xs font-sans leading-relaxed">
                <strong className="text-cyan block font-mono text-[10px] uppercase mb-1">Why you were selected:</strong>
                {activeDispatch.justification}
              </div>

              {/* Destination & Journey Details */}
              <div className="space-y-1.5 p-3 bg-navy-950 rounded border border-navy-800 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-400">DESTINATION:</span>
                  <span className="text-slate-200">{activeDispatch.destination_lat?.toFixed(4)}°N, {activeDispatch.destination_lng?.toFixed(4)}°E</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">ESTIMATED TRAVEL:</span>
                  <span className="text-cyan font-bold">~{activeDispatch.estimated_minutes} min</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">ROUTE SAFETY:</span>
                  <span className={activeDispatch.route_safe ? 'text-emerald-400' : 'text-amber-400'}>
                    {activeDispatch.route_safe ? 'CLEAR OF HAZARDS' : 'HAZARD ON PATH'}
                  </span>
                </div>
              </div>

              {/* Status Indicator */}
              <div className="text-center py-1">
                <span className={`px-3 py-1 rounded text-[11px] font-bold uppercase tracking-wider ${
                  activeDispatch.status === 'ACCEPTED' ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/50' :
                  activeDispatch.status === 'COMPLETED' ? 'bg-teal-950 text-teal-300' :
                  'bg-amber-950 text-amber-300 border border-amber-500/50'
                }`}>
                  MISSION STATUS: {activeDispatch.status}
                </span>
              </div>

              {/* Rejection input box if triggered */}
              {showRejectInput && (
                <div className="space-y-2 p-2 bg-red-950/30 border border-red-500/40 rounded">
                  <input
                    type="text"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Reason (e.g. equipment broken, detained)..."
                    className="w-full p-2 bg-navy-950 border border-navy-700 text-slate-200 text-xs rounded"
                  />
                  <div className="flex justify-end space-x-2">
                    <button
                      onClick={() => setShowRejectInput(false)}
                      className="px-2 py-1 text-[10px] text-slate-400"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleAction('REJECT', rejectReason)}
                      className="px-2 py-1 bg-red-600 text-white text-[10px] rounded font-bold"
                    >
                      Confirm Reject
                    </button>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              {activeDispatch.status === 'PROPOSED' && (
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <button
                    onClick={() => handleAction('ACCEPT')}
                    disabled={loading}
                    className="py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded flex items-center justify-center space-x-1 uppercase text-[11px] shadow-lg shadow-emerald-600/30"
                  >
                    <Check className="w-4 h-4" />
                    <span>ACCEPT MISSION</span>
                  </button>
                  <button
                    onClick={() => setShowRejectInput(true)}
                    disabled={loading}
                    className="py-2.5 bg-navy-950 border border-red-500/50 hover:bg-red-950/40 text-red-300 font-bold rounded flex items-center justify-center space-x-1 uppercase text-[11px]"
                  >
                    <X className="w-4 h-4" />
                    <span>DECLINE</span>
                  </button>
                </div>
              )}

              {activeDispatch.status === 'ACCEPTED' && (
                <div className="space-y-2 pt-2">
                  <button
                    onClick={() => handleAction('REPORT_UNSAFE_ROUTE', 'Reported impassable road bridge')}
                    disabled={loading}
                    className="w-full py-2 bg-amber-950/50 border border-amber-500/50 hover:bg-amber-900 text-amber-200 font-bold rounded flex items-center justify-center space-x-1 uppercase text-[10px]"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>REPORT UNSAFE ROUTE</span>
                  </button>
                  <button
                    onClick={() => handleAction('COMPLETE')}
                    disabled={loading}
                    className="w-full py-2.5 bg-cyan hover:bg-cyan-400 text-navy-950 font-bold rounded flex items-center justify-center space-x-1 uppercase text-[11px] shadow-lg shadow-cyan/20"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>CONFIRM RESCUE COMPLETE</span>
                  </button>
                </div>
              )}

              <div className="text-[9px] text-slate-500 text-center pt-2 border-t border-navy-800">
                PROTOTYPE NOTICE: Never assumes official 911 integration without verified API gateway.
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-slate-500 font-mono text-xs">
              No active rescue assignments dispatched to your handset node.
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
