import React, { useState, useMemo, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  AlertTriangle,
  Radio,
  Cpu,
  Layers,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Play,
  RotateCcw,
  Sparkles,
  BarChart3,
  Sliders,
  Terminal,
  Zap,
  Lock,
  Compass,
  FileCheck2,
  Wifi,
  ChevronRight,
  ChevronDown
} from 'lucide-react';

import { verifyClaim, DEFAULT_CONFIG } from '../verification/fuse';
import {
  generateScenario,
  generateSybilSwarm,
  generateCopyPasteDecoy,
  generateGpsSpoof,
  generateForgedCredential,
  generateStolenCredential,
  generateFloodSpam
} from '../verification/sim/generators';
import { runEvaluation } from '../verification/eval/evaluate';
import { signChallengeResponse, signMessage } from '../verification/crypto';
import defaultWeights from '../verification/weights.json';

export default function ClaimVerificationPanel() {
  const [selectedScenarioSeed, setSelectedScenarioSeed] = useState(42);
  const [scenario, setScenario] = useState(() => generateScenario(42));
  
  // Current active message and node view
  const [activeMessage, setActiveMessage] = useState(() => scenario.sampleClaims.realDistress);
  const [nodeView, setNodeView] = useState(() => scenario.view);
  const [activePreset, setActivePreset] = useState('real_distress');
  const [activeAttackNotice, setActiveAttackNotice] = useState(null);

  // Live challenge state
  const [liveNonceResponse, setLiveNonceResponse] = useState(null);

  // Evaluation & Benchmark state
  const [evalReport, setEvalReport] = useState(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [expandedStage, setExpandedStage] = useState(null);

  // Regenerate scenario if seed changes
  useEffect(() => {
    const sc = generateScenario(selectedScenarioSeed);
    setScenario(sc);
    setNodeView(sc.view);
    setActiveMessage(sc.sampleClaims.realDistress);
    setActivePreset('real_distress');
    setActiveAttackNotice(null);
    setLiveNonceResponse(null);
  }, [selectedScenarioSeed]);

  // Load Presets
  const loadPreset = (presetKey) => {
    setActivePreset(presetKey);
    setLiveNonceResponse(null);

    if (presetKey === 'real_distress') {
      setActiveMessage(scenario.sampleClaims.realDistress);
      setNodeView(scenario.view);
      setActiveAttackNotice({
        title: 'Honest Distress Claim',
        desc: 'Legitimate flood victim with valid signature, realistic RSSI from 2 neighbors, and battery telemetry.'
      });
    } else if (presetKey === 'real_capability') {
      setActiveMessage(scenario.sampleClaims.realCapability);
      setNodeView(scenario.view);
      setActiveAttackNotice({
        title: 'Honest Responder Capability',
        desc: 'Legitimate swift-water rescue team with cryptographically verified NDRF credential.'
      });
    } else if (presetKey === 'real_hazard') {
      setActiveMessage(scenario.sampleClaims.realHazard);
      setNodeView(scenario.view);
      setActiveAttackNotice({
        title: 'Honest Hazard Warning',
        desc: 'Valid warning of canal culvert breach, consistent with nearby geographic flood risk.'
      });
    } else if (presetKey === 'attack_sybil') {
      const sybil = generateSybilSwarm(selectedScenarioSeed, 40);
      const sybilView = { ...scenario.view, recentMessages: sybil.messages.slice(1) };
      setActiveMessage(sybil.messages[0]);
      setNodeView(sybilView);
      setActiveAttackNotice({
        title: 'Attack Injected: Sybil Swarm (40 Keys)',
        desc: '40 distinct Ed25519 keypairs broadcasting simultaneously from 1 radio footprint (identical neighbor RSSI vectors).'
      });
    } else if (presetKey === 'attack_gps_spoof') {
      const spoof = generateGpsSpoof(selectedScenarioSeed);
      setActiveMessage(spoof.message);
      setNodeView(scenario.view);
      setActiveAttackNotice({
        title: 'Attack Injected: GPS Spoofing / Teleportation',
        desc: 'Sender claims coordinates 16 km away, but 1-hop neighbor RSSI model indicates packet originated within 50 meters.'
      });
    } else if (presetKey === 'attack_decoy') {
      const decoy = generateCopyPasteDecoy(selectedScenarioSeed);
      const decoyView = { ...scenario.view, recentMessages: [decoy.messages[0]] };
      setActiveMessage(decoy.messages[1]);
      setNodeView(decoyView);
      setActiveAttackNotice({
        title: 'Attack Injected: Copy-Paste Decoy Flood',
        desc: 'Word-for-word identical panic text replicated across multiple distinct sender keys at conflicting distant coordinates.'
      });
    } else if (presetKey === 'attack_forged_cred') {
      const forged = generateForgedCredential(selectedScenarioSeed);
      setActiveMessage(forged.message);
      setNodeView(scenario.view);
      setActiveAttackNotice({
        title: 'Attack Injected: Forged Credential',
        desc: 'Adversary claiming NDRF incident commander status using an unauthorized or rogue signing key.'
      });
    } else if (presetKey === 'attack_stolen_cred') {
      const stolen = generateStolenCredential(selectedScenarioSeed);
      setActiveMessage(stolen.message);
      setNodeView(scenario.view);
      setActiveAttackNotice({
        title: 'Attack Injected: Stolen Credential',
        desc: 'Adversary replaying a genuine responder credential, but the message sender key does not match the credential holder.'
      });
    } else if (presetKey === 'attack_flood_spam') {
      const flood = generateFloodSpam(selectedScenarioSeed, 15);
      const floodView = { ...scenario.view, rateLimiterState: {} };
      // Drain bucket with first 10 messages
      for (let i = 0; i < 10; i++) {
        verifyClaim(flood.messages[i], floodView);
      }
      setActiveMessage(flood.messages[10]);
      setNodeView(floodView);
      setActiveAttackNotice({
        title: 'Attack Injected: Battery-Drain Flood Spam',
        desc: 'Burst of 15 rapid-fire packets in less than 1 second from single peer to deplete responder device battery.'
      });
    }
  };

  // Prepare message with nonce response if solved
  const effectiveMessage = useMemo(() => {
    if (!liveNonceResponse) return activeMessage;
    return {
      ...activeMessage,
      nonceResponse: liveNonceResponse
    };
  }, [activeMessage, liveNonceResponse]);

  // Compute verification result purely on-device
  const verificationResult = useMemo(() => {
    try {
      const now = activeMessage.timestamp + 5;
      return verifyClaim(effectiveMessage, nodeView, {}, now);
    } catch (err) {
      console.error('Verification error:', err);
      return null;
    }
  }, [effectiveMessage, nodeView]);

  // Handle solving live challenge
  const handleSolveChallenge = () => {
    if (!verificationResult?.challengeIssued) return;
    const { nonce } = verificationResult.challengeIssued;
    // Sign with legitimate responder or victim key
    const secretKey = scenario.keys.responder.secretKeyHex;
    const responseSig = signChallengeResponse(nonce, secretKey);
    setLiveNonceResponse(responseSig);
  };

  // Run Benchmark Evaluation
  const handleRunEvaluation = () => {
    setIsEvaluating(true);
    setTimeout(() => {
      const report = runEvaluation(selectedScenarioSeed);
      setEvalReport(report);
      setIsEvaluating(false);
    }, 100);
  };

  const prob = verificationResult?.probability ?? 0;
  const uncertainty = verificationResult?.uncertainty ?? 0;
  const decision = verificationResult?.decision ?? 'reject';

  return (
    <div className="flex flex-col h-full w-full overflow-y-auto bg-navy-950 text-slate-100 p-4 md:p-6 space-y-6">
      
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-navy-800 gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-cyan/10 border border-cyan/40 flex items-center justify-center text-cyan shadow-lg shadow-cyan/10">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-heading font-black tracking-wide text-slate-100 flex items-center gap-2">
                Decentralized Claim Verification Engine
                <span className="text-xs px-2 py-0.5 rounded font-mono font-bold bg-cyan/15 text-cyan border border-cyan/40">
                  PURE ON-DEVICE TS
                </span>
              </h1>
              <p className="text-xs md:text-sm text-slate-400 font-sans">
                Bayesian log-odds fusion with Ed25519 signatures, RF path-loss physical trilateration, Sybil clustering & interactive challenges. Zero backend network calls.
              </p>
            </div>
          </div>
        </div>

        {/* Global Controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-navy-900 border border-navy-800 rounded px-3 py-1.5 text-xs font-mono">
            <span className="text-slate-400">PRNG Seed:</span>
            <input
              type="number"
              value={selectedScenarioSeed}
              onChange={(e) => setSelectedScenarioSeed(Number(e.target.value) || 1)}
              className="w-16 bg-navy-950 border border-navy-700 rounded px-1.5 py-0.5 text-center text-cyan font-bold outline-none"
            />
            <button
              onClick={() => setSelectedScenarioSeed(prev => prev + 1)}
              title="New Seed"
              className="text-slate-400 hover:text-cyan transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={handleRunEvaluation}
            disabled={isEvaluating}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded bg-cyan/20 hover:bg-cyan/30 border border-cyan/50 text-cyan text-xs font-mono font-bold transition-all shadow-sm"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            {isEvaluating ? 'Running Benchmark...' : 'Run Protocol Benchmark'}
          </button>
        </div>
      </div>

      {/* Attack Notice Banner */}
      {activeAttackNotice && (
        <div className={`p-3.5 rounded-lg border flex items-start gap-3 ${
          activePreset.startsWith('attack_')
            ? 'bg-rose-950/40 border-rose-500/50 text-rose-200'
            : 'bg-cyan-950/30 border-cyan-500/40 text-cyan-200'
        }`}>
          {activePreset.startsWith('attack_') ? (
            <Zap className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          ) : (
            <Sparkles className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 text-xs">
            <div className="font-bold uppercase tracking-wider font-mono text-[11px]">
              {activeAttackNotice.title}
            </div>
            <div className="mt-0.5 text-slate-300">
              {activeAttackNotice.desc}
            </div>
          </div>
        </div>
      )}

      {/* Main Grid: Left Control & Presets, Center Result & Top-3, Right Stage Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Column 1: Presets & Attack Lab Injections (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          
          {/* Authentic Claim Presets */}
          <div className="bg-navy-900 border border-navy-800 rounded-xl p-4 shadow-xl space-y-3">
            <h2 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Authentic Mesh Scenarios
            </h2>
            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={() => loadPreset('real_distress')}
                className={`text-left p-2.5 rounded-lg border text-xs transition-all ${
                  activePreset === 'real_distress'
                    ? 'bg-cyan/15 border-cyan text-white shadow-md shadow-cyan/10'
                    : 'bg-navy-950/70 border-navy-800 text-slate-300 hover:border-slate-600'
                }`}
              >
                <div className="font-bold flex items-center justify-between">
                  <span>Victim Distress Report</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-950 border border-emerald-500/40 text-emerald-300">
                    REAL
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                  Water entering apartment, 3 trapped on terrace.
                </div>
              </button>

              <button
                onClick={() => loadPreset('real_capability')}
                className={`text-left p-2.5 rounded-lg border text-xs transition-all ${
                  activePreset === 'real_capability'
                    ? 'bg-cyan/15 border-cyan text-white shadow-md shadow-cyan/10'
                    : 'bg-navy-950/70 border-navy-800 text-slate-300 hover:border-slate-600'
                }`}
              >
                <div className="font-bold flex items-center justify-between">
                  <span>Certified Responder Capability</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-950 border border-emerald-500/40 text-emerald-300">
                    VALID CRED
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                  NDRF Swift Water Rescue Lead with Zodiac boat.
                </div>
              </button>

              <button
                onClick={() => loadPreset('real_hazard')}
                className={`text-left p-2.5 rounded-lg border text-xs transition-all ${
                  activePreset === 'real_hazard'
                    ? 'bg-cyan/15 border-cyan text-white shadow-md shadow-cyan/10'
                    : 'bg-navy-950/70 border-navy-800 text-slate-300 hover:border-slate-600'
                }`}
              >
                <div className="font-bold flex items-center justify-between">
                  <span>Environmental Hazard Warning</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-950 border border-emerald-500/40 text-emerald-300">
                    MATCHED
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                  Canal culvert overflow, water depth 1.2m.
                </div>
              </button>
            </div>
          </div>

          {/* Adversarial Attack Generators */}
          <div className="bg-navy-900 border border-navy-800 rounded-xl p-4 shadow-xl space-y-3">
            <h2 className="text-xs font-mono uppercase tracking-wider text-rose-400 font-bold flex items-center gap-2">
              <Zap className="w-4 h-4 text-rose-400" />
              Adversarial Attack Injections
            </h2>
            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={() => loadPreset('attack_sybil')}
                className={`text-left p-2.5 rounded-lg border text-xs transition-all ${
                  activePreset === 'attack_sybil'
                    ? 'bg-rose-950/50 border-rose-500 text-white shadow-md shadow-rose-900/30'
                    : 'bg-navy-950/70 border-navy-800 text-slate-300 hover:border-rose-900/50'
                }`}
              >
                <div className="font-bold text-rose-300 flex items-center justify-between">
                  <span>Sybil Swarm (40 Keys)</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-rose-950 border border-rose-500/50 text-rose-300">
                    STAGE 1 TRIP
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                  Single transmitter, 40 keys clustered to ~1 vote.
                </div>
              </button>

              <button
                onClick={() => loadPreset('attack_gps_spoof')}
                className={`text-left p-2.5 rounded-lg border text-xs transition-all ${
                  activePreset === 'attack_gps_spoof'
                    ? 'bg-rose-950/50 border-rose-500 text-white shadow-md shadow-rose-900/30'
                    : 'bg-navy-950/70 border-navy-800 text-slate-300 hover:border-rose-900/50'
                }`}
              >
                <div className="font-bold text-rose-300 flex items-center justify-between">
                  <span>GPS Spoofing / Teleportation</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-rose-950 border border-rose-500/50 text-rose-300">
                    STAGE 2 TRIP
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                  Claims 16 km away, but RF RSSI proves 50m.
                </div>
              </button>

              <button
                onClick={() => loadPreset('attack_decoy')}
                className={`text-left p-2.5 rounded-lg border text-xs transition-all ${
                  activePreset === 'attack_decoy'
                    ? 'bg-rose-950/50 border-rose-500 text-white shadow-md shadow-rose-900/30'
                    : 'bg-navy-950/70 border-navy-800 text-slate-300 hover:border-rose-900/50'
                }`}
              >
                <div className="font-bold text-rose-300 flex items-center justify-between">
                  <span>Copy-Paste Decoy Floods</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-rose-950 border border-rose-500/50 text-rose-300">
                    STAGE 3 TRIP
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                  Replicated verbatim text across distinct coords.
                </div>
              </button>

              <button
                onClick={() => loadPreset('attack_forged_cred')}
                className={`text-left p-2.5 rounded-lg border text-xs transition-all ${
                  activePreset === 'attack_forged_cred'
                    ? 'bg-rose-950/50 border-rose-500 text-white shadow-md shadow-rose-900/30'
                    : 'bg-navy-950/70 border-navy-800 text-slate-300 hover:border-rose-900/50'
                }`}
              >
                <div className="font-bold text-rose-300 flex items-center justify-between">
                  <span>Forged NDRF Credential</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-rose-950 border border-rose-500/50 text-rose-300">
                    STAGE 5 TRIP
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                  Invalid Ed25519 issuer authority signature.
                </div>
              </button>

              <button
                onClick={() => loadPreset('attack_stolen_cred')}
                className={`text-left p-2.5 rounded-lg border text-xs transition-all ${
                  activePreset === 'attack_stolen_cred'
                    ? 'bg-rose-950/50 border-rose-500 text-white shadow-md shadow-rose-900/30'
                    : 'bg-navy-950/70 border-navy-800 text-slate-300 hover:border-rose-900/50'
                }`}
              >
                <div className="font-bold text-rose-300 flex items-center justify-between">
                  <span>Stolen Credential Replay</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-rose-950 border border-rose-500/50 text-rose-300">
                    HOLDER MISMATCH
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                  Valid credential sent by different unauthorized key.
                </div>
              </button>

              <button
                onClick={() => loadPreset('attack_flood_spam')}
                className={`text-left p-2.5 rounded-lg border text-xs transition-all ${
                  activePreset === 'attack_flood_spam'
                    ? 'bg-rose-950/50 border-rose-500 text-white shadow-md shadow-rose-900/30'
                    : 'bg-navy-950/70 border-navy-800 text-slate-300 hover:border-rose-900/50'
                }`}
              >
                <div className="font-bold text-rose-300 flex items-center justify-between">
                  <span>Battery-Drain Flood Spam</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-rose-950 border border-rose-500/50 text-rose-300">
                    STAGE 0 TRIP
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                  Token bucket capacity exhausted at Gate stage.
                </div>
              </button>
            </div>
          </div>

          {/* Active Claim Details Mini-Inspector */}
          <div className="bg-navy-900 border border-navy-800 rounded-xl p-4 shadow-xl space-y-2 text-xs font-mono">
            <div className="text-slate-400 font-bold uppercase tracking-wider text-[11px] flex items-center justify-between">
              <span>Claim Packet Raw Metadata</span>
              <span className="text-cyan">{activeMessage.id}</span>
            </div>
            <div className="bg-navy-950 p-2.5 rounded border border-navy-800/80 space-y-1 text-slate-300 overflow-x-auto text-[11px]">
              <div><span className="text-slate-500">Sender:</span> {activeMessage.senderPubKey.slice(0, 16)}...</div>
              <div><span className="text-slate-500">Type:</span> <span className="uppercase font-bold text-cyan">{activeMessage.type}</span></div>
              <div><span className="text-slate-500">Coords:</span> {activeMessage.claimedLoc.lat.toFixed(4)}, {activeMessage.claimedLoc.lng.toFixed(4)} (±{activeMessage.claimedLoc.errM}m)</div>
              <div><span className="text-slate-500">Hops:</span> {activeMessage.hopCount} [{activeMessage.hopPath?.join(' → ') || 'direct'}]</div>
              <div><span className="text-slate-500">RSSI Observers:</span> {JSON.stringify(activeMessage.rssiByNeighbor)}</div>
              {activeMessage.batteryPct !== undefined && (
                <div><span className="text-slate-500">Battery:</span> {activeMessage.batteryPct}%</div>
              )}
            </div>
          </div>

        </div>

        {/* Column 2: Posterior Probability & Decision (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          
          {/* Main Fusion Probability Gauge Card */}
          <div className="bg-navy-900 border border-navy-800 rounded-xl p-5 shadow-2xl space-y-4 text-center">
            
            <div className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold">
              Calibrated Posterior Probability
            </div>

            {/* Gauge Display */}
            <div className="py-2 flex flex-col items-center justify-center">
              <div className="relative w-44 h-44 flex items-center justify-center">
                {/* SVG Radial Meter */}
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke="#1e293b"
                    strokeWidth="9"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke={
                      decision === 'accept'
                        ? '#10b981'
                        : decision === 'challenge'
                        ? '#f59e0b'
                        : '#f43f5e'
                    }
                    strokeWidth="9"
                    strokeDasharray={2 * Math.PI * 40}
                    strokeDashoffset={2 * Math.PI * 40 * (1 - prob)}
                    strokeLinecap="round"
                    className="transition-all duration-700 ease-out"
                  />
                </svg>

                {/* Inner Percentage Readout */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-4xl font-heading font-black tracking-tight text-white">
                    {Math.round(prob * 100)}%
                  </span>
                  <span className="text-[11px] font-mono text-slate-400 mt-0.5">
                    P(claim is real)
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">
                    ±{Math.round(uncertainty * 100)}% credible width
                  </span>
                </div>
              </div>

              {/* Decision Pill Badge */}
              <div className="mt-4">
                {decision === 'accept' && (
                  <div className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-emerald-950/80 border border-emerald-500 text-emerald-300 font-mono text-xs font-black tracking-widest shadow-lg shadow-emerald-900/30">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    DECISION: ACCEPT CLAIM
                  </div>
                )}
                {decision === 'challenge' && (
                  <div className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-amber-950/80 border border-amber-500 text-amber-300 font-mono text-xs font-black tracking-widest shadow-lg shadow-amber-900/30">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    DECISION: CHALLENGE / VERIFY
                  </div>
                )}
                {decision === 'reject' && (
                  <div className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-rose-950/80 border border-rose-500 text-rose-300 font-mono text-xs font-black tracking-widest shadow-lg shadow-rose-900/30">
                    <ShieldX className="w-4 h-4 text-rose-400" />
                    DECISION: REJECT CLAIM
                  </div>
                )}
              </div>
            </div>

            {/* Threshold Legend Bar */}
            <div className="text-[11px] font-mono text-slate-400 pt-2 border-t border-navy-800 flex justify-between px-1">
              <span className="text-rose-400">Reject (&lt; 0.40)</span>
              <span className="text-amber-400">Challenge (0.40 - 0.70)</span>
              <span className="text-emerald-400">Accept (&ge; 0.70)</span>
            </div>
          </div>

          {/* Interactive Live Nonce Challenge Box */}
          {verificationResult?.challengeIssued && (
            <div className="bg-amber-950/30 border border-amber-500/50 rounded-xl p-4 shadow-xl space-y-3">
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-amber-300 uppercase tracking-wide">
                <Lock className="w-4 h-4 text-amber-400" />
                Live Cryptographic Challenge Issued
              </div>
              <p className="text-xs text-slate-300">
                Borderline uncertainty detected. Node protocol challenged peer with non-repayable nonce:
              </p>
              <div className="bg-navy-950 p-2 rounded border border-amber-500/30 font-mono text-[11px] text-amber-200 break-all">
                {verificationResult.challengeIssued.nonce}
              </div>

              {!liveNonceResponse ? (
                <button
                  onClick={handleSolveChallenge}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded bg-amber-500 hover:bg-amber-400 text-navy-950 font-bold text-xs font-mono transition-all shadow-md"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Sign Live Challenge with Authorized Key
                </button>
              ) : (
                <div className="p-2 rounded bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs font-mono flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  Challenge Verified! Signature valid.
                </div>
              )}
            </div>
          )}

          {/* Top 3 Plain Language Explanations */}
          <div className="bg-navy-900 border border-navy-800 rounded-xl p-4 shadow-xl space-y-3">
            <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold flex items-center gap-2">
              <Terminal className="w-4 h-4 text-cyan" />
              Top 3 Decisive Rationales
            </h3>
            <div className="space-y-2">
              {verificationResult?.reasons?.map((reason, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-lg bg-navy-950 border border-navy-800/80 text-xs text-slate-200 flex items-start gap-2.5"
                >
                  <span className="w-5 h-5 rounded-full bg-cyan/15 text-cyan border border-cyan/40 font-mono text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <span className="leading-relaxed">{reason}</span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Column 3: Per-Stage Detailed Breakdown (4 cols) */}
        <div className="lg:col-span-4 space-y-3">
          
          <div className="bg-navy-900 border border-navy-800 rounded-xl p-4 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan" />
                Pipeline Stage Breakdown
              </h2>
              <span className="text-[10px] font-mono text-slate-500">
                Cheapest First Execution
              </span>
            </div>

            {/* Stages Accordion List */}
            <div className="space-y-2 text-xs">
              
              {/* Stage 0: Gate */}
              {renderStageCard(
                '0',
                'Gate & Battery Defense',
                verificationResult?.stageResults?.['stage0_gate'],
                expandedStage === 0,
                () => setExpandedStage(expandedStage === 0 ? null : 0),
                'Schema, Ed25519 signature validity, timestamp drift, and per-peer token bucket rate limiter.'
              )}

              {/* Stage 1: Identity */}
              {renderStageCard(
                '1',
                'Identity & Sybil Defense',
                verificationResult?.stageResults?.['stage1_identity'],
                expandedStage === 1,
                () => setExpandedStage(expandedStage === 1 ? null : 1),
                'Disjoint-set clustering of radio RSSI vectors and hop paths to collapse 40 keys into 1 vote.'
              )}

              {/* Stage 2: Location */}
              {renderStageCard(
                '2',
                'Location & RF Anti-Spoofing',
                verificationResult?.stageResults?.['stage2_location'],
                expandedStage === 2,
                () => setExpandedStage(expandedStage === 2 ? null : 2),
                'Log-distance path-loss model, kinematic velocity boundary check, and GPS drift error allowance.'
              )}

              {/* Stage 3: Content */}
              {renderStageCard(
                '3',
                'Content & Decoy Detection',
                verificationResult?.stageResults?.['stage3_content'],
                expandedStage === 3,
                () => setExpandedStage(expandedStage === 3 ? null : 3),
                'Active time-decayed hazard maps, identical verbatim duplicate detection, and vague panic filtering.'
              )}

              {/* Stage 4: Corroboration */}
              {renderStageCard(
                '4',
                'Multi-Witness Corroboration',
                verificationResult?.stageResults?.['stage4_corroboration'],
                expandedStage === 4,
                () => setExpandedStage(expandedStage === 4 ? null : 4),
                'Diminishing return aggregation (1 - 0.5^n) utilizing only distinct Stage-1 physical radio clusters.'
              )}

              {/* Stage 5: Credentials */}
              {renderStageCard(
                '5',
                'Cryptographic Credentials',
                verificationResult?.stageResults?.['stage5_credential'],
                expandedStage === 5,
                () => setExpandedStage(expandedStage === 5 ? null : 5),
                'Authorized issuer registry, credential expiry timestamp, and holder pubkey cryptographic binding.'
              )}

              {/* Stage 6: Challenge */}
              {renderStageCard(
                '6',
                'Interactive Challenge Band',
                verificationResult?.stageResults?.['stage6_challenge'],
                expandedStage === 6,
                () => setExpandedStage(expandedStage === 6 ? null : 6),
                'Selective nonce challenges strictly triggered for uncertain borderline cases [0.4, 0.7].'
              )}

            </div>
          </div>

          {/* Fusion Weights Quick View */}
          <div className="bg-navy-900 border border-navy-800 rounded-xl p-4 shadow-xl space-y-2 text-xs font-mono">
            <div className="text-slate-400 font-bold uppercase tracking-wider text-[11px] flex items-center justify-between">
              <span>Learned Fusion Weights</span>
              <span className="text-cyan">Logistic Regression</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300">
              <div className="bg-navy-950 p-1.5 rounded border border-navy-800/80">
                <span className="text-slate-500">w_identity:</span> <span className="font-bold text-white">{defaultWeights.w_identity}</span>
              </div>
              <div className="bg-navy-950 p-1.5 rounded border border-navy-800/80">
                <span className="text-slate-500">w_location:</span> <span className="font-bold text-white">{defaultWeights.w_location}</span>
              </div>
              <div className="bg-navy-950 p-1.5 rounded border border-navy-800/80">
                <span className="text-slate-500">w_content:</span> <span className="font-bold text-white">{defaultWeights.w_content}</span>
              </div>
              <div className="bg-navy-950 p-1.5 rounded border border-navy-800/80">
                <span className="text-slate-500">w_corrob:</span> <span className="font-bold text-white">{defaultWeights.w_corroboration}</span>
              </div>
              <div className="bg-navy-950 p-1.5 rounded border border-navy-800/80">
                <span className="text-slate-500">w_cred:</span> <span className="font-bold text-white">{defaultWeights.w_credential}</span>
              </div>
              <div className="bg-navy-950 p-1.5 rounded border border-navy-800/80">
                <span className="text-slate-500">w_attack:</span> <span className="font-bold text-rose-400">{defaultWeights.w_attackSignals}</span>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* Protocol Calibration & Reliability Diagram Modal / Section */}
      {evalReport && (
        <div className="bg-navy-900 border border-navy-800 rounded-xl p-5 shadow-2xl space-y-5 animate-in fade-in duration-300">
          
          <div className="flex flex-col md:flex-row md:items-center justify-between pb-3 border-b border-navy-800 gap-2">
            <div>
              <h2 className="text-base font-heading font-black tracking-wide text-slate-100 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-cyan" />
                Empirical Calibration & Stage Ablation Report
              </h2>
              <p className="text-xs text-slate-400 font-sans">
                Evaluated against {evalReport.totalSamples} synthetic benchmark claims across authentic and adversarial scenarios.
              </p>
            </div>
            <button
              onClick={() => setEvalReport(null)}
              className="text-xs font-mono text-slate-400 hover:text-white px-2 py-1 rounded bg-navy-950 border border-navy-800"
            >
              Close Report
            </button>
          </div>

          {/* Key Metric Tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono">
            <div className="bg-navy-950 p-3 rounded-lg border border-navy-800">
              <div className="text-[11px] text-slate-400 uppercase">Brier Calibration Score</div>
              <div className="text-xl font-bold text-emerald-400 mt-0.5">
                {evalReport.brierScore}
              </div>
              <div className="text-[10px] text-emerald-500">Target &lt; 0.15 (Calibrated)</div>
            </div>

            <div className="bg-navy-950 p-3 rounded-lg border border-navy-800">
              <div className="text-[11px] text-slate-400 uppercase">False Accept Rate (FAR)</div>
              <div className="text-xl font-bold text-cyan mt-0.5">
                {(evalReport.attackMetrics.falseAcceptRate * 100).toFixed(1)}%
              </div>
              <div className="text-[10px] text-slate-500">{evalReport.attackMetrics.falseAcceptCount} of {evalReport.attackMetrics.totalAttacks} attacks</div>
            </div>

            <div className="bg-navy-950 p-3 rounded-lg border border-navy-800">
              <div className="text-[11px] text-slate-400 uppercase">False Reject Rate (FRR)</div>
              <div className="text-xl font-bold text-cyan mt-0.5">
                {(evalReport.honestMetrics.falseRejectRate * 100).toFixed(1)}%
              </div>
              <div className="text-[10px] text-slate-500">{evalReport.honestMetrics.falseRejectCount} of {evalReport.honestMetrics.totalHonest} real claims</div>
            </div>

            <div className="bg-navy-950 p-3 rounded-lg border border-navy-800">
              <div className="text-[11px] text-slate-400 uppercase">Attack Interception</div>
              <div className="text-xl font-bold text-emerald-400 mt-0.5">
                {Math.round(((evalReport.attackMetrics.rejectedCount + evalReport.attackMetrics.challengedCount) / evalReport.attackMetrics.totalAttacks) * 100)}%
              </div>
              <div className="text-[10px] text-emerald-500">Stopped or Challenged</div>
            </div>
          </div>

          {/* Reliability Diagram & Ablations Table */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            
            {/* 10-Bin Reliability Curve */}
            <div className="lg:col-span-6 bg-navy-950 p-4 rounded-lg border border-navy-800 space-y-3">
              <div className="text-xs font-mono font-bold uppercase text-slate-300">
                10-Bin Reliability Diagram (Calibration Curve)
              </div>
              
              {/* Visual Bars for the 10 Bins */}
              <div className="space-y-1.5 text-[11px] font-mono">
                {evalReport.reliabilityDiagram.map((bin) => (
                  <div key={bin.binIndex} className="flex items-center gap-2">
                    <span className="w-16 text-slate-500 text-[10px]">
                      {bin.binStart.toFixed(1)}-{bin.binEnd.toFixed(1)}:
                    </span>
                    <div className="flex-1 bg-navy-900 rounded-full h-3 overflow-hidden relative border border-navy-800">
                      {/* Ideal diagonal marker */}
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-slate-600 z-10"
                        style={{ left: `${bin.binCenter * 100}%` }}
                      />
                      {/* Empirical Accuracy bar */}
                      <div
                        className="h-full bg-cyan transition-all"
                        style={{ width: `${bin.empiricalAccuracy * 100}%` }}
                      />
                    </div>
                    <span className="w-12 text-right text-slate-300 text-[10px]">
                      {(bin.empiricalAccuracy * 100).toFixed(0)}% (n={bin.sampleCount})
                    </span>
                  </div>
                ))}
              </div>
              <div className="text-[10px] font-mono text-slate-500 pt-1 border-t border-navy-900">
                Grey tick = ideal calibration center; cyan bar = actual observed empirical frequency.
              </div>
            </div>

            {/* Stage Ablation Impact Table */}
            <div className="lg:col-span-6 bg-navy-950 p-4 rounded-lg border border-navy-800 space-y-3 overflow-x-auto">
              <div className="text-xs font-mono font-bold uppercase text-slate-300">
                Stage Ablation Study (Degradation on Metric)
              </div>
              
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="border-b border-navy-800 text-[10px] text-slate-500">
                    <th className="pb-1.5">Ablated Condition</th>
                    <th className="pb-1.5 text-right">Brier Score</th>
                    <th className="pb-1.5 text-right">FAR</th>
                    <th className="pb-1.5 text-right">&Delta; Brier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-900 text-[11px]">
                  {evalReport.ablations.map((ab, idx) => (
                    <tr key={idx} className={idx === 0 ? 'text-cyan font-bold' : 'text-slate-300'}>
                      <td className="py-1.5">{ab.stageName}</td>
                      <td className="py-1.5 text-right">{ab.brierScore.toFixed(3)}</td>
                      <td className="py-1.5 text-right">{(ab.far * 100).toFixed(1)}%</td>
                      <td className={`py-1.5 text-right ${ab.deltaBrier > 0.05 ? 'text-rose-400 font-bold' : 'text-slate-400'}`}>
                        {ab.deltaBrier > 0 ? `+${ab.deltaBrier.toFixed(3)}` : '0.000'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-[10px] font-mono text-slate-500 pt-1 border-t border-navy-900">
                Removing Stage 1 or Stage 5 immediately increases False Accept Rate.
              </div>
            </div>

          </div>

        </div>
      )}

    </div>
  );
}

/**
 * Helper to render individual stage cards
 */
function renderStageCard(
  stageNum,
  title,
  stageResult,
  isExpanded,
  onToggle,
  description
) {
  if (!stageResult) {
    return (
      <div className="p-2.5 rounded-lg bg-navy-950/60 border border-navy-800/60 flex items-center justify-between text-slate-500 font-mono">
        <span className="font-bold">Stage {stageNum}: {title}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-navy-900 text-slate-500">SKIPPED</span>
      </div>
    );
  }

  const score = stageResult.score;
  const isPositive = score > 0.1;
  const isNegative = score < -0.1;
  const isHardReject = stageResult.hardReject;

  return (
    <div className={`rounded-lg border transition-all overflow-hidden ${
      isHardReject
        ? 'bg-rose-950/40 border-rose-500/60'
        : isNegative
        ? 'bg-rose-950/20 border-rose-500/30'
        : isPositive
        ? 'bg-navy-950 border-emerald-500/30'
        : 'bg-navy-950 border-navy-800'
    }`}>
      <button
        onClick={onToggle}
        className="w-full p-2.5 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isHardReject ? (
            <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : isNegative ? (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : isPositive ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <HelpCircle className="w-4 h-4 text-slate-400 shrink-0" />
          )}
          <span className="font-mono font-bold text-slate-200">
            Stage {stageNum}: {title}
          </span>
        </div>

        <div className="flex items-center gap-2 font-mono">
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
            isHardReject
              ? 'bg-rose-900 text-rose-200'
              : score > 0
              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
              : score < 0
              ? 'bg-rose-950 text-rose-300 border border-rose-800'
              : 'bg-slate-900 text-slate-400 border border-slate-800'
          }`}>
            {score > 0 ? `+${score.toFixed(2)}` : score.toFixed(2)}
          </span>
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 pt-1 border-t border-navy-800/60 space-y-2 text-slate-300 bg-navy-950/80">
          <div className="text-[11px] text-slate-400 italic font-sans">
            {description}
          </div>
          <div className="p-2 rounded bg-navy-900 border border-navy-800 text-[11px] font-mono text-cyan-200">
            {stageResult.reason}
          </div>
          {stageResult.metadata && Object.keys(stageResult.metadata).length > 0 && (
            <div className="text-[10px] font-mono text-slate-400 bg-navy-950 p-1.5 rounded border border-navy-800/80 overflow-x-auto">
              <span className="text-slate-500">Metadata: </span>
              {JSON.stringify(stageResult.metadata)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
