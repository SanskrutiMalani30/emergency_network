import React, { useState, useEffect } from 'react';
import {
  UserCheck, Shield, Battery, Navigation, Award, CheckCircle2,
  AlertTriangle, ArrowRight, Clock, Radio, RefreshCw, Send,
  MapPin, ExternalLink, Check, AlertCircle, PhoneCall
} from 'lucide-react';
import { getMatchForEmergency } from '../services/matchingService';
import { updateEmergencyStatus } from '../services/offlineStorage';
import { bleTransport } from '../services/ble/bleTransportManager';
import { proposeDispatch } from '../services/api';

const URGENCY_STYLES = {
  CRITICAL: 'bg-rose-50 text-rose-700 border-rose-200',
  HIGH: 'bg-amber-50 text-amber-700 border-amber-200',
  MODERATE: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  LOW: 'bg-blue-50 text-[#168BFA] border-[#D0E6FC]'
};

const STATUS_STYLES = {
  OPEN: 'bg-slate-100 text-[#102B4E] border-slate-200',
  BROADCASTING: 'bg-sky-50 text-[#168BFA] border-sky-200 animate-pulse',
  MATCHED: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  ACCEPTED: 'bg-emerald-50 text-emerald-700 border-emerald-300 font-bold',
  'EN ROUTE': 'bg-blue-50 text-[#168BFA] border-[#168BFA] font-bold',
  'HELP PROVIDED': 'bg-emerald-100 text-emerald-800 border-emerald-400 font-bold',
  CLOSED: 'bg-slate-200 text-slate-700 border-slate-300'
};

export default function RespondersPanel({
  responders = [],
  emergencies = [],
  selectedEmergency = null,
  currentUser = null,
  onEmergencyUpdated,
  onDispatchCreated
}) {
  const [selectedEmergencyId, setSelectedEmergencyId] = useState(
    selectedEmergency?.id || selectedEmergency?.emergency_id || emergencies[0]?.id || emergencies[0]?.emergency_id || ''
  );
  const [matchResult, setMatchResult] = useState(null);
  const [matching, setMatching] = useState(false);
  const [rebroadcasting, setRebroadcasting] = useState(false);
  const [actionMsg, setActionMsg] = useState('');

  // Sync selected emergency from parent or initial prop
  useEffect(() => {
    if (selectedEmergency) {
      const id = selectedEmergency.id || selectedEmergency.emergency_id;
      setSelectedEmergencyId(id);
    } else if (emergencies.length > 0 && !selectedEmergencyId) {
      setSelectedEmergencyId(emergencies[0].id || emergencies[0].emergency_id);
    }
  }, [selectedEmergency, emergencies, selectedEmergencyId]);

  // Current active emergency record
  const activeEmg = emergencies.find(
    e => (e.id === selectedEmergencyId) || (e.emergency_id === selectedEmergencyId)
  ) || emergencies[0] || null;

  // Auto-run local matching when target emergency changes
  useEffect(() => {
    if (activeEmg && responders.length > 0) {
      handleCalculateMatches(activeEmg);
    }
  }, [selectedEmergencyId]);

  const handleCalculateMatches = async (targetEmergency = activeEmg) => {
    if (!targetEmergency) return;
    setMatching(true);
    setActionMsg('');
    try {
      const res = await getMatchForEmergency(targetEmergency, responders);
      setMatchResult(res);
    } catch (err) {
      console.warn('Matching calculation error:', err);
    } finally {
      setMatching(false);
    }
  };

  // Rebroadcast emergency packet via BLE
  const handleRebroadcast = async () => {
    if (!activeEmg) return;
    setRebroadcasting(true);
    setActionMsg('');
    try {
      const res = await bleTransport.broadcastEmergencyAlert(activeEmg);
      setActionMsg(`BLE advertisement rebroadcast complete (${res.binaryPayloadBytes} bytes via ${res.simulation ? 'Simulation Mesh' : 'Hardware'}).`);
    } catch (err) {
      setActionMsg(`Rebroadcast notice: ${err.message}`);
    } finally {
      setRebroadcasting(false);
    }
  };

  // Responder Acceptance Flow
  const handleAcceptEmergency = async (candidate = null) => {
    if (!activeEmg) return;
    setActionMsg('');

    const responderId = candidate?.responder_id || currentUser?.user_id || 'resp-amulya-cert';
    const responderName = candidate?.name || currentUser?.display_name || 'Amulya Yadav (CERT)';
    const eta = candidate?.estimated_minutes || 12;

    const acceptedRecord = {
      responder_id: responderId,
      name: responderName,
      skills: candidate?.skills || currentUser?.skills || ['First Aid', 'Amateur Radio'],
      accepted_at: new Date().toISOString(),
      status: 'ACCEPTED',
      confirmed_eta_minutes: eta
    };

    const updates = {
      assistance_status: 'ACCEPTED',
      status: 'ACCEPTED',
      accepted_responders: [acceptedRecord],
      assigned_responder_id: responderId,
      last_updated_at: new Date().toISOString()
    };

    // 1. Update IndexedDB local record
    const updated = await updateEmergencyStatus(activeEmg.id || activeEmg.emergency_id, updates);

    // 2. Transmit BLE return path acceptance packet
    await bleTransport.broadcastAcceptance({
      alert_id: activeEmg.id || activeEmg.emergency_id,
      responder_id: responderId,
      responder_name: responderName,
      status: 'ACCEPTED',
      eta_minutes: eta
    });

    // 3. Propose to backend if online
    if (navigator.onLine) {
      try {
        await proposeDispatch({
          emergency_id: activeEmg.id || activeEmg.emergency_id,
          responder_id: responderId,
          justification: candidate?.justification || 'Direct responder acceptance via RESQMesh handset',
          estimated_minutes: eta,
          route_safe: true
        });
      } catch (e) {
        console.log('Online dispatch notice:', e.message);
      }
    }

    setActionMsg(`✓ Accepted mission. Confirmed ETA ~${eta} min communicated over mesh.`);
    if (onEmergencyUpdated) onEmergencyUpdated(updated);
    if (onDispatchCreated) onDispatchCreated();
  };

  // Status transition to EN ROUTE
  const handleReportEnRoute = async () => {
    if (!activeEmg) return;
    const updates = {
      assistance_status: 'EN ROUTE',
      status: 'EN ROUTE',
      last_updated_at: new Date().toISOString()
    };

    const updated = await updateEmergencyStatus(activeEmg.id || activeEmg.emergency_id, updates);

    await bleTransport.broadcastAcceptance({
      alert_id: activeEmg.id || activeEmg.emergency_id,
      responder_id: activeEmg.assigned_responder_id || 'resp-node',
      status: 'EN ROUTE',
      eta_minutes: 8
    });

    setActionMsg('✓ Status updated: EN ROUTE. Travelling to target location.');
    if (onEmergencyUpdated) onEmergencyUpdated(updated);
  };

  // Assistance Completed
  const handleMarkHelpProvided = async () => {
    if (!activeEmg) return;
    const updates = {
      assistance_status: 'HELP PROVIDED',
      status: 'HELP PROVIDED',
      last_updated_at: new Date().toISOString()
    };
    const updated = await updateEmergencyStatus(activeEmg.id || activeEmg.emergency_id, updates);
    setActionMsg('✓ Help reported provided. Awaiting victim acknowledgment.');
    if (onEmergencyUpdated) onEmergencyUpdated(updated);
  };

  // Acknowledge / Close
  const handleAcknowledgeResolution = async () => {
    if (!activeEmg) return;
    const updates = {
      assistance_status: 'CLOSED',
      status: 'CLOSED',
      last_updated_at: new Date().toISOString()
    };
    const updated = await updateEmergencyStatus(activeEmg.id || activeEmg.emergency_id, updates);
    setActionMsg('✓ Emergency acknowledged and closed.');
    if (onEmergencyUpdated) onEmergencyUpdated(updated);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full p-4 sm:p-6 bg-[#FFFFFF] font-sans">
      
      {/* ========================================================
          LEFT COLUMN: ACTIVE EMERGENCY INCIDENTS QUEUE (5 cols)
         ======================================================== */}
      <div className="lg:col-span-5 space-y-4">
        
        {/* Header */}
        <div className="bg-[#EAF5FF] border border-[#D0E6FC] rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#168BFA] text-white flex items-center justify-center font-bold text-sm">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-heading font-black text-sm text-[#102B4E] uppercase tracking-wide">
                Active Emergency Queue
              </h2>
              <p className="text-[11px] text-[#627D98]">
                Prioritized by severity & opportunity cost
              </p>
            </div>
          </div>
          <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-white border border-[#D0E6FC] text-[#168BFA] font-bold">
            {emergencies.length} CASES
          </span>
        </div>

        {/* Emergency List */}
        <div className="space-y-3 overflow-y-auto max-h-[640px] pr-1">
          {emergencies.length === 0 ? (
            <div className="p-8 text-center bg-[#F4FAFF] border border-dashed border-[#D0E6FC] rounded-2xl text-xs text-[#627D98]">
              No active emergencies recorded. Submit an SOS alert from the Operations tab to initiate responder coordination.
            </div>
          ) : (
            emergencies.map((emg) => {
              const id = emg.id || emg.emergency_id;
              const isSelected = id === selectedEmergencyId;
              const urgency = emg.urgency || emg.severity || 'MODERATE';
              const status = emg.assistance_status || emg.status || 'OPEN';
              const isFresh = (emg.location?.source || emg.location_source) === 'CURRENT';
              const accepted = emg.accepted_responders && emg.accepted_responders.length > 0;

              return (
                <div
                  key={id}
                  onClick={() => setSelectedEmergencyId(id)}
                  className={`p-4 rounded-2xl border transition cursor-pointer text-left space-y-2.5 ${
                    isSelected
                      ? 'bg-[#EAF5FF] border-[#168BFA] ring-2 ring-[#168BFA]/10 shadow-xs'
                      : 'bg-white border-[#D0E6FC] hover:border-[#B6D9FB] hover:bg-[#F4FAFF]'
                  }`}
                >
                  {/* Top Bar: Urgency, Category, Status */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${URGENCY_STYLES[urgency] || URGENCY_STYLES.MODERATE}`}>
                        {urgency}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white border border-[#D0E6FC] text-[#102B4E] uppercase">
                        {emg.category || 'GENERAL'}
                      </span>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLES[status] || STATUS_STYLES.OPEN}`}>
                      {status}
                    </span>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-[#102B4E] font-medium line-clamp-2 leading-relaxed">
                    {emg.description || emg.raw_message}
                  </p>

                  {/* Location & Freshness Badge */}
                  <div className="flex items-center justify-between text-[11px] text-[#627D98] pt-1 border-t border-[#D0E6FC]/60">
                    <div className="flex items-center space-x-1">
                      <MapPin className="w-3.5 h-3.5 text-[#168BFA] shrink-0" />
                      <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${isFresh ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                        {isFresh ? 'CURRENT GPS' : 'LAST KNOWN'}
                      </span>
                    </div>

                    {emg.location_link && (
                      <a
                        href={emg.location_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-[#168BFA] hover:underline flex items-center space-x-0.5 text-[10px] font-bold"
                      >
                        <span>Open Maps</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>

                  {/* Accepted Responders Notice */}
                  {accepted && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2 text-[11px] text-emerald-800 flex items-center space-x-1.5 font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>{emg.accepted_responders[0]?.name || 'Responder'} accepted</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ========================================================
          RIGHT COLUMN: TARGET MATCHING & DISPATCH CONTROLS (7 cols)
         ======================================================== */}
      <div className="lg:col-span-7 space-y-4">
        
        {activeEmg ? (
          <div className="bg-white border border-[#D0E6FC] rounded-2xl p-5 shadow-xs space-y-5">
            
            {/* Target Emergency Details Card */}
            <div className="space-y-3 border-b border-[#EAF5FF] pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono font-bold text-[#627D98]">
                    CASE ID: {activeEmg.id || activeEmg.emergency_id}
                  </span>
                  <h3 className="text-base font-heading font-black text-[#102B4E]">
                    {activeEmg.category || 'General Emergency'}
                  </h3>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${STATUS_STYLES[activeEmg.assistance_status || activeEmg.status] || STATUS_STYLES.OPEN}`}>
                  {activeEmg.assistance_status || activeEmg.status || 'OPEN'}
                </span>
              </div>

              <p className="text-xs text-[#102B4E] leading-relaxed bg-[#F4FAFF] p-3 rounded-xl border border-[#D0E6FC]">
                {activeEmg.description || activeEmg.raw_message}
              </p>

              {/* Requested Help Chips */}
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-[11px] font-bold text-[#627D98]">Required Aid:</span>
                {(activeEmg.help_needed || activeEmg.required_capabilities || []).map((h, i) => (
                  <span key={i} className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#EAF5FF] text-[#168BFA] border border-[#D0E6FC]">
                    {h}
                  </span>
                ))}
              </div>
            </div>

            {/* ========================================================
                SECTION 6: "SHOW WHETHER SOMEONE IS COMING TO HELP"
               ======================================================== */}
            <div className="space-y-2.5">
              <label className="block text-xs font-heading font-black uppercase text-[#102B4E] tracking-wide">
                Live Assistance & Dispatch Status:
              </label>

              {/* CASE A: When no responder has accepted */}
              {(!activeEmg.accepted_responders || activeEmg.accepted_responders.length === 0) && (
                <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl space-y-3">
                  <div className="flex items-start space-x-2.5">
                    <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-bold text-amber-900">
                        No responder has accepted this emergency yet.
                      </div>
                      <div className="text-[11px] text-amber-700 leading-relaxed pt-0.5">
                        Alert is currently broadcasting via BLE and peer mesh. Waiting for nearby responders to acknowledge.
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-amber-200/60">
                    <div className="flex items-center space-x-1.5 text-[11px] font-bold text-amber-800">
                      <Radio className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                      <span>Broadcast State: {activeEmg.broadcast_status || 'BROADCASTING'}</span>
                    </div>

                    <button
                      type="button"
                      onClick={handleRebroadcast}
                      disabled={rebroadcasting}
                      className="px-3 py-1.5 bg-white border border-amber-300 hover:bg-amber-100/50 text-amber-900 rounded-lg text-xs font-bold transition flex items-center space-x-1"
                    >
                      <RefreshCw className={`w-3 h-3 ${rebroadcasting ? 'animate-spin' : ''}`} />
                      <span>{rebroadcasting ? 'Broadcasting...' : 'Rebroadcast Alert'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* CASE B: When a responder has accepted */}
              {activeEmg.accepted_responders && activeEmg.accepted_responders.length > 0 && (
                <div className="space-y-2.5">
                  {activeEmg.accepted_responders.map((resp, i) => (
                    <div key={i} className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-2.5">
                          <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-sm">
                            <UserCheck className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                              <span>{resp.name}</span>
                              <span className="text-[10px] font-mono px-2 py-0.2 rounded-full bg-white border border-emerald-300 text-emerald-700">
                                {activeEmg.assistance_status || 'ACCEPTED'}
                              </span>
                            </div>
                            <div className="text-[11px] text-emerald-700">
                              Skills: {(resp.skills || ['CERT', 'First Aid']).join(', ')}
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] text-emerald-700 font-mono">
                            {new Date(resp.accepted_at || activeEmg.last_updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs text-emerald-900 font-bold pt-2 border-t border-emerald-200/60">
                        <div className="flex items-center space-x-1.5">
                          <Clock className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Confirmed ETA: ~{resp.confirmed_eta_minutes || 12} mins</span>
                        </div>

                        {/* Responder status step buttons */}
                        <div className="flex items-center space-x-1.5">
                          {activeEmg.assistance_status !== 'EN ROUTE' && activeEmg.assistance_status !== 'HELP PROVIDED' && activeEmg.assistance_status !== 'CLOSED' && (
                            <button
                              type="button"
                              onClick={handleReportEnRoute}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold transition"
                            >
                              Report En Route
                            </button>
                          )}

                          {activeEmg.assistance_status === 'EN ROUTE' && (
                            <button
                              type="button"
                              onClick={handleMarkHelpProvided}
                              className="px-2.5 py-1 bg-[#168BFA] hover:bg-[#0f77d9] text-white rounded-lg text-[11px] font-bold transition"
                            >
                              Mark Help Provided
                            </button>
                          )}

                          {activeEmg.assistance_status === 'HELP PROVIDED' && (
                            <button
                              type="button"
                              onClick={handleAcknowledgeResolution}
                              className="px-2.5 py-1 bg-emerald-700 text-white rounded-lg text-[11px] font-bold transition flex items-center space-x-1"
                            >
                              <Check className="w-3 h-3" />
                              <span>Acknowledge Resolution</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Action Feedback */}
            {actionMsg && (
              <div className="p-3 bg-[#EAF5FF] border border-[#D0E6FC] rounded-xl text-xs text-[#168BFA] font-bold">
                {actionMsg}
              </div>
            )}

            {/* ========================================================
                OPPORTUNITY-COST MATCHING CANDIDATES
               ======================================================== */}
            <div className="space-y-3 pt-2 border-t border-[#EAF5FF]">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-heading font-black text-xs text-[#102B4E] uppercase tracking-wide">
                    Suitable Volunteer Responders
                  </h4>
                  <p className="text-[11px] text-[#627D98]">
                    Ranked by capability fit, proximity & battery
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleCalculateMatches(activeEmg)}
                  disabled={matching}
                  className="px-3 py-1.5 bg-[#EAF5FF] hover:bg-[#DDF0FF] text-[#168BFA] border border-[#D0E6FC] rounded-xl text-xs font-bold transition flex items-center space-x-1"
                >
                  <RefreshCw className={`w-3 h-3 ${matching ? 'animate-spin' : ''}`} />
                  <span>{matching ? 'Calculating...' : 'Recalculate Matches'}</span>
                </button>
              </div>

              {matchResult && matchResult.ranked_candidates ? (
                <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                  {matchResult.ranked_candidates.map((cand, idx) => (
                    <div
                      key={cand.responder_id}
                      className={`p-3.5 rounded-xl border transition space-y-2 ${
                        idx === 0 && cand.is_suitable
                          ? 'bg-[#EAF5FF]/60 border-[#168BFA] shadow-xs'
                          : 'bg-white border-[#D0E6FC]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-bold text-[#627D98]">#{idx + 1}</span>
                          <span className="font-heading font-bold text-xs text-[#102B4E]">{cand.name}</span>
                          {idx === 0 && cand.is_suitable && (
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-[#168BFA] text-white uppercase">
                              Optimal
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-bold text-[#168BFA]">{cand.score}</span>
                          <span className="text-[10px] text-[#627D98]">/100</span>
                        </div>
                      </div>

                      <p className="text-[11px] text-[#627D98] leading-relaxed">
                        {cand.justification}
                      </p>

                      <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-[#D0E6FC]/60 text-[#627D98]">
                        <div className="flex items-center space-x-2">
                          <Clock className="w-3 h-3 text-[#168BFA]" />
                          <span>ETA ~{cand.estimated_minutes}m ({cand.distance_km} km)</span>
                        </div>

                        {cand.is_suitable && (!activeEmg.accepted_responders || activeEmg.accepted_responders.length === 0) && (
                          <button
                            type="button"
                            onClick={() => handleAcceptEmergency(cand)}
                            className="px-3 py-1 bg-[#168BFA] hover:bg-[#0f77d9] text-white rounded-lg text-[10px] font-bold transition flex items-center space-x-1"
                          >
                            <span>Dispatch / Accept</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 text-center text-xs text-[#627D98]">
                  Loading suitability calculations...
                </div>
              )}
            </div>

          </div>
        ) : (
          <div className="p-12 text-center bg-[#F4FAFF] border border-dashed border-[#D0E6FC] rounded-2xl text-xs text-[#627D98]">
            Select an incident on the left to evaluate matching candidates and view responder dispatch states.
          </div>
        )}

      </div>

    </div>
  );
}
