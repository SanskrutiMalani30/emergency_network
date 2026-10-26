import React, { useState } from 'react';
import { Zap, ShieldAlert, CheckCircle, RefreshCw, AlertOctagon, ArrowRight, ShieldCheck } from 'lucide-react';
import { runAttackScenario, resetAttackLab } from '../services/api';

const SCENARIOS = [
  { id: 1, title: '1. Sybil Attack: 40 Fake Nurse Personas', desc: 'Attacker floods registration with 40 duplicate personas from single node.' },
  { id: 2, title: '2. GPS Location Teleportation Spoof', desc: 'Node reports impossible velocity across 85km in 15 seconds.' },
  { id: 3, title: '3. Decoy Emergencies Diverting Medics', desc: 'Spam alert attempting to divert scarce trauma surgeons away from real victims.' },
  { id: 4, title: '4. Battery-Draining Message Flood (DoS)', desc: 'High-frequency broadcast flood designed to exhaust mesh relay transceivers.' },
  { id: 5, title: '5. Forged Medical Qualification Token', desc: 'Fabricated credential token claim attempting surgical triage access.' },
  { id: 6, title: '6. Dynamic Flood Hazard on Rescue Route', desc: 'Embankment breach submerging primary corridor, triggering instant detour.' },
  { id: 7, title: '7. Partition Dual-Dispatch Collision', desc: 'Two severed network islands dispatching independently to the same victim.' },
  { id: 8, title: '8. Specialist Scarcity & Opportunity Cost', desc: 'Preserves scarce dialysis nurse from trivial ankle sprain request.' },
  { id: 9, title: '9. Heartbeat Loss During Active Transit', desc: 'Responder drops into radio dead zone, alerting command for backup.' },
  { id: 10, title: '10. Open-Vocabulary Capability Normalization', desc: 'Parses unseen phrase "has inflatable dinghy and can do dialysis".' }
];

export default function AttackLabPanel() {
  const [activeScenarioId, setActiveScenarioId] = useState(1);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [resetMessage, setResetMessage] = useState('');

  const handleRunScenario = async (id) => {
    setActiveScenarioId(id);
    setLoading(true);
    setResetMessage('');
    try {
      const res = await runAttackScenario(id);
      setResult(res);
    } catch (err) {
      alert(`Attack simulation error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setLoading(true);
    try {
      await resetAttackLab();
      setResetMessage('Security test harness and quarantine tables reset to operational baseline.');
      setResult(null);
    } catch (err) {
      alert(`Reset error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full overflow-y-auto p-4 sm:p-6 bg-navy-950 font-sans">
      
      {/* Left Column: 10 Scenarios Selector */}
      <div className="lg:col-span-5 bg-navy-900 border border-navy-800 rounded-sm p-5 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-navy-800 pb-3">
          <div className="flex items-center space-x-2">
            <Zap className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="font-heading font-bold text-base text-slate-100 uppercase tracking-wide">
                Red Team Attack Lab
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                10 Benchmark Adversarial Simulations for Judges
              </p>
            </div>
          </div>
          <button
            onClick={handleReset}
            disabled={loading}
            className="px-2.5 py-1 text-[11px] font-mono bg-navy-950 hover:bg-navy-800 border border-navy-700 text-slate-300 rounded flex items-center space-x-1"
            title="Reset security state"
          >
            <RefreshCw className="w-3 h-3 text-cyan" />
            <span>Reset</span>
          </button>
        </div>

        {resetMessage && (
          <div className="p-2.5 bg-emerald-950 border border-emerald-500 text-emerald-300 text-xs font-mono rounded">
            ✓ {resetMessage}
          </div>
        )}

        <div className="space-y-2 overflow-y-auto max-h-[580px] pr-1">
          {SCENARIOS.map((sc) => {
            const isSelected = activeScenarioId === sc.id;
            return (
              <button
                key={sc.id}
                onClick={() => handleRunScenario(sc.id)}
                disabled={loading}
                className={`w-full text-left p-3 rounded-sm border transition text-xs font-mono ${
                  isSelected
                    ? 'bg-amber-950/40 border-amber-500/80 text-amber-200 ring-1 ring-amber-500/50'
                    : 'bg-navy-950 border-navy-800 text-slate-300 hover:border-navy-700 hover:bg-navy-900'
                }`}
              >
                <div className="font-bold flex items-center justify-between">
                  <span>{sc.title}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                </div>
                <p className="text-[11px] text-slate-400 mt-1 font-sans leading-snug">
                  {sc.desc}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right Column: Scenario Telemetry & Defense Outcome */}
      <div className="lg:col-span-7 bg-navy-900 border border-navy-800 rounded-sm p-6 space-y-4 shadow-xl">
        <div className="flex items-center space-x-2 border-b border-navy-800 pb-3">
          <ShieldAlert className="w-5 h-5 text-cyan" />
          <div>
            <h2 className="font-heading font-bold text-base text-slate-100 uppercase tracking-wide">
              Adversarial Observation & Mitigation Inspector
            </h2>
            <p className="text-xs text-slate-400 font-mono">
              Real-time defense telemetry, heuristic filters & remaining limits
            </p>
          </div>
        </div>

        {result ? (
          <div className="space-y-4 text-xs font-mono">
            {/* Scenario Title Banner */}
            <div className="p-3.5 bg-navy-950 border border-navy-800 rounded">
              <span className="text-[10px] text-slate-500 uppercase">ACTIVE BENCHMARK:</span>
              <div className="text-sm font-bold text-amber-300 font-heading uppercase mt-0.5">
                {result.title}
              </div>
            </div>

            {/* Attack Injected */}
            <div className="p-3.5 bg-red-950/20 border border-red-500/40 rounded space-y-1">
              <span className="text-[10px] text-red-400 uppercase font-bold flex items-center space-x-1">
                <AlertOctagon className="w-3.5 h-3.5" />
                <span>Attack / Failure Injected</span>
              </span>
              <p className="text-slate-200 font-sans text-xs leading-relaxed">
                {result.attack_injected}
              </p>
            </div>

            {/* Observations & Detection */}
            <div className="p-3.5 bg-cyan/5 border border-cyan/40 rounded space-y-1">
              <span className="text-[10px] text-cyan uppercase font-bold flex items-center space-x-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>System Observations & Detection Action</span>
              </span>
              <p className="text-slate-200 font-sans text-xs leading-relaxed">
                {result.detection_and_mitigation}
              </p>
              <div className="text-[11px] text-slate-400 pt-1 border-t border-cyan/20">
                Telemetry: {result.system_observations}
              </div>
            </div>

            {/* Effect on Dispatches */}
            <div className="p-3.5 bg-emerald-950/20 border border-emerald-500/40 rounded space-y-1">
              <span className="text-[10px] text-emerald-400 uppercase font-bold">
                Effect on Dispatch Decisions
              </span>
              <p className="text-slate-200 font-sans text-xs leading-relaxed">
                {result.effect_on_dispatches}
              </p>
            </div>

            {/* Remaining Limitations (Honest engineering criteria) */}
            <div className="p-3 bg-navy-950 border border-navy-800 rounded space-y-1 text-slate-400">
              <span className="text-[10px] text-slate-500 uppercase font-bold">
                Remaining Limitations (Honest Operational Scope)
              </span>
              <p className="text-[11px] leading-relaxed">
                {result.remaining_limitations}
              </p>
            </div>
          </div>
        ) : (
          <div className="py-24 text-center text-slate-500 font-mono text-xs">
            Select any of the 10 adversarial scenarios on the left to inspect attack telemetry, heuristic defenses, and mitigation outcomes.
          </div>
        )}
      </div>

    </div>
  );
}
