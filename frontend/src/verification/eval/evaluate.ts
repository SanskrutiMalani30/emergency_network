/**
 * RESQMesh — Verification Protocol Evaluation & Ablation Engine
 * Calculates Brier calibration scores, reliability diagram bins,
 * attack defense rates (FAR/FRR), and stage ablation impact.
 */

import { PRNG } from '../sim/prng';
import {
  generateScenario,
  generateSybilSwarm,
  generateCopyPasteDecoy,
  generateGpsSpoof,
  generateForgedCredential,
  generateStolenCredential,
  generateFloodSpam
} from '../sim/generators';
import { verifyClaim } from '../fuse';
import type { Message, NodeView, VerificationConfig, VerificationResult } from '../types';

export interface EvalPrediction {
  id: string;
  probability: number;
  uncertainty: number;
  decision: 'accept' | 'challenge' | 'reject';
  label: number; // 1 = real, 0 = attack/fake
  category: string;
  result: VerificationResult;
}

export interface ReliabilityBin {
  binIndex: number;
  binStart: number;
  binEnd: number;
  binCenter: number;
  sampleCount: number;
  meanPredicted: number;
  empiricalAccuracy: number;
  calibrationError: number;
}

export interface AttackDefenseMetrics {
  totalAttacks: number;
  rejectedCount: number;
  challengedCount: number;
  falseAcceptCount: number;
  falseAcceptRate: number; // FAR
  breakdown: Record<string, { total: number; rejected: number; challenged: number; accepted: number }>;
}

export interface HonestMetrics {
  totalHonest: number;
  acceptedCount: number;
  challengedCount: number;
  falseRejectCount: number;
  falseRejectRate: number; // FRR
}

export interface AblationEntry {
  stageName: string;
  brierScore: number;
  far: number;
  frr: number;
  deltaBrier: number; // degradation compared to baseline
}

export interface EvaluationReport {
  brierScore: number;
  totalSamples: number;
  reliabilityDiagram: ReliabilityBin[];
  attackMetrics: AttackDefenseMetrics;
  honestMetrics: HonestMetrics;
  ablations: AblationEntry[];
}

/**
 * Calculates Brier Score = (1/N) * sum((p_i - y_i)^2)
 * Brier score <= 0.15 indicates well-calibrated probabilistic output.
 */
export function calculateBrierScore(predictions: Array<{ probability: number; label: number }>): number {
  if (predictions.length === 0) return 0;
  let sumSq = 0;
  for (const p of predictions) {
    const diff = p.probability - p.label;
    sumSq += diff * diff;
  }
  return Number((sumSq / predictions.length).toFixed(4));
}

/**
 * Builds 10-bin Reliability Diagram data for calibration curves.
 */
export function buildReliabilityDiagram(
  predictions: Array<{ probability: number; label: number }>,
  binCount: number = 10
): ReliabilityBin[] {
  const bins: ReliabilityBin[] = [];
  const binWidth = 1.0 / binCount;

  for (let i = 0; i < binCount; i++) {
    const binStart = Number((i * binWidth).toFixed(2));
    const binEnd = Number(((i + 1) * binWidth).toFixed(2));
    const binCenter = Number(((binStart + binEnd) / 2).toFixed(2));

    const inBin = predictions.filter(p => {
      if (i === binCount - 1) {
        return p.probability >= binStart && p.probability <= 1.0;
      }
      return p.probability >= binStart && p.probability < binEnd;
    });

    const count = inBin.length;
    const meanPred = count > 0 ? inBin.reduce((acc, cur) => acc + cur.probability, 0) / count : binCenter;
    const empAcc = count > 0 ? inBin.reduce((acc, cur) => acc + cur.label, 0) / count : 0;
    const calErr = count > 0 ? Math.abs(meanPred - empAcc) : 0;

    bins.push({
      binIndex: i,
      binStart,
      binEnd,
      binCenter,
      sampleCount: count,
      meanPredicted: Number(meanPred.toFixed(4)),
      empiricalAccuracy: Number(empAcc.toFixed(4)),
      calibrationError: Number(calErr.toFixed(4))
    });
  }

  return bins;
}

/**
 * Runs evaluation across authentic scenarios and diverse attack vectors.
 */
export function runEvaluationDataset(
  seed: number | string = 999,
  configOverrides?: Partial<VerificationConfig>,
  caseMultiplier: number = 5
): EvalPrediction[] {
  const prng = new PRNG(seed);
  const predictions: EvalPrediction[] = [];

  for (let i = 0; i < caseMultiplier; i++) {
    const sc = generateScenario(prng.nextInt(1000, 999999));
    const now = sc.sampleClaims.realDistress.timestamp + 10;

    // 1. Honest distress
    const resDistress = verifyClaim(sc.sampleClaims.realDistress, sc.view, configOverrides, now);
    predictions.push({
      id: sc.sampleClaims.realDistress.id,
      probability: resDistress.probability,
      uncertainty: resDistress.uncertainty,
      decision: resDistress.decision,
      label: 1.0,
      category: 'honest_distress',
      result: resDistress
    });

    // 2. Honest capability
    const resCap = verifyClaim(sc.sampleClaims.realCapability, sc.view, configOverrides, now);
    predictions.push({
      id: sc.sampleClaims.realCapability.id,
      probability: resCap.probability,
      uncertainty: resCap.uncertainty,
      decision: resCap.decision,
      label: 1.0,
      category: 'honest_capability',
      result: resCap
    });

    // 3. Honest hazard
    const resHaz = verifyClaim(sc.sampleClaims.realHazard, sc.view, configOverrides, now);
    predictions.push({
      id: sc.sampleClaims.realHazard.id,
      probability: resHaz.probability,
      uncertainty: resHaz.uncertainty,
      decision: resHaz.decision,
      label: 1.0,
      category: 'honest_hazard',
      result: resHaz
    });

    // 4. Attack: Sybil Swarm
    const sybil = generateSybilSwarm(prng.nextInt(1000, 999999), 10, now - 5);
    const sybilView = { ...sc.view, recentMessages: sybil.messages.slice(1) };
    const sybilMsg = sybil.messages[0];
    const resSybil = verifyClaim(sybilMsg, sybilView, configOverrides, now);
    predictions.push({
      id: sybilMsg.id,
      probability: resSybil.probability,
      uncertainty: resSybil.uncertainty,
      decision: resSybil.decision,
      label: 0.0,
      category: 'attack_sybil',
      result: resSybil
    });

    // 5. Attack: GPS Spoofing
    const spoof = generateGpsSpoof(prng.nextInt(1000, 999999), now - 5);
    const resSpoof = verifyClaim(spoof.message, sc.view, configOverrides, now);
    predictions.push({
      id: spoof.message.id,
      probability: resSpoof.probability,
      uncertainty: resSpoof.uncertainty,
      decision: resSpoof.decision,
      label: 0.0,
      category: 'attack_gps_spoof',
      result: resSpoof
    });

    // 6. Attack: Copy-Paste Decoy
    const decoy = generateCopyPasteDecoy(prng.nextInt(1000, 999999), now - 5);
    const decoyView = { ...sc.view, recentMessages: [decoy.messages[0]] };
    const resDecoy = verifyClaim(decoy.messages[1], decoyView, configOverrides, now);
    predictions.push({
      id: decoy.messages[1].id,
      probability: resDecoy.probability,
      uncertainty: resDecoy.uncertainty,
      decision: resDecoy.decision,
      label: 0.0,
      category: 'attack_copy_paste',
      result: resDecoy
    });

    // 7. Attack: Forged Credential
    const forged = generateForgedCredential(prng.nextInt(1000, 999999), now - 5);
    const resForged = verifyClaim(forged.message, sc.view, configOverrides, now);
    predictions.push({
      id: forged.message.id,
      probability: resForged.probability,
      uncertainty: resForged.uncertainty,
      decision: resForged.decision,
      label: 0.0,
      category: 'attack_forged_cred',
      result: resForged
    });

    // 8. Attack: Stolen Credential
    const stolen = generateStolenCredential(prng.nextInt(1000, 999999), now - 5);
    const resStolen = verifyClaim(stolen.message, sc.view, configOverrides, now);
    predictions.push({
      id: stolen.message.id,
      probability: resStolen.probability,
      uncertainty: resStolen.uncertainty,
      decision: resStolen.decision,
      label: 0.0,
      category: 'attack_stolen_cred',
      result: resStolen
    });

    // 9. Attack: Flood Spam
    const flood = generateFloodSpam(prng.nextInt(1000, 999999), 15, now);
    const floodView = { ...sc.view, rateLimiterState: {} };
    // Process first 10 to drain bucket, then 11th should be hard rejected
    for (let k = 0; k < 11; k++) {
      const resFlood = verifyClaim(flood.messages[k], floodView, configOverrides, now);
      if (k === 10) {
        predictions.push({
          id: flood.messages[k].id,
          probability: resFlood.probability,
          uncertainty: resFlood.uncertainty,
          decision: resFlood.decision,
          label: 0.0,
          category: 'attack_flood_spam',
          result: resFlood
        });
      }
    }
  }

  return predictions;
}

/**
 * Runs full protocol evaluation including reliability diagrams, FAR/FRR, and stage ablations.
 */
export function runEvaluation(
  seed: number | string = 1001,
  configOverrides?: Partial<VerificationConfig>
): EvaluationReport {
  const basePredictions = runEvaluationDataset(seed, configOverrides, 6);
  const brierScore = calculateBrierScore(basePredictions);
  const reliabilityDiagram = buildReliabilityDiagram(basePredictions);

  // Attack Metrics
  const attackSamples = basePredictions.filter(p => p.label === 0);
  const attackBreakdown: AttackDefenseMetrics['breakdown'] = {};
  let falseAcceptCount = 0;
  let attackRejected = 0;
  let attackChallenged = 0;

  for (const a of attackSamples) {
    if (!attackBreakdown[a.category]) {
      attackBreakdown[a.category] = { total: 0, rejected: 0, challenged: 0, accepted: 0 };
    }
    const b = attackBreakdown[a.category];
    b.total++;
    if (a.decision === 'reject') {
      b.rejected++;
      attackRejected++;
    } else if (a.decision === 'challenge') {
      b.challenged++;
      attackChallenged++;
    } else {
      b.accepted++;
      falseAcceptCount++;
    }
  }

  const far = attackSamples.length > 0 ? Number((falseAcceptCount / attackSamples.length).toFixed(4)) : 0;
  const attackMetrics: AttackDefenseMetrics = {
    totalAttacks: attackSamples.length,
    rejectedCount: attackRejected,
    challengedCount: attackChallenged,
    falseAcceptCount,
    falseAcceptRate: far,
    breakdown: attackBreakdown
  };

  // Honest Metrics
  const honestSamples = basePredictions.filter(p => p.label === 1);
  let honestAccepted = 0;
  let honestChallenged = 0;
  let falseRejectCount = 0;

  for (const h of honestSamples) {
    if (h.decision === 'accept') honestAccepted++;
    else if (h.decision === 'challenge') honestChallenged++;
    else falseRejectCount++;
  }

  const frr = honestSamples.length > 0 ? Number((falseRejectCount / honestSamples.length).toFixed(4)) : 0;
  const honestMetrics: HonestMetrics = {
    totalHonest: honestSamples.length,
    acceptedCount: honestAccepted,
    challengedCount: honestChallenged,
    falseRejectCount,
    falseRejectRate: frr
  };

  // Stage Ablations: test disabling each stage one-by-one
  const stagesToAblate = [
    { name: 'Baseline (All Active)', override: {} },
    { name: 'Ablate Gate (Stage 0)', override: { gate: { enabled: false } as any } },
    { name: 'Ablate Identity / Sybil (Stage 1)', override: { identity: { enabled: false } as any, weights: { w_identity: 0 } as any } },
    { name: 'Ablate Location / Path-Loss (Stage 2)', override: { location: { enabled: false } as any, weights: { w_location: 0 } as any } },
    { name: 'Ablate Content / Decoys (Stage 3)', override: { content: { enabled: false } as any, weights: { w_content: 0 } as any } },
    { name: 'Ablate Corroboration (Stage 4)', override: { corroboration: { enabled: false } as any, weights: { w_corroboration: 0 } as any } },
    { name: 'Ablate Credentials (Stage 5)', override: { credential: { enabled: false } as any, weights: { w_credential: 0 } as any } }
  ];

  const ablations: AblationEntry[] = [];
  for (const ab of stagesToAblate) {
    const mergedConfig: Partial<VerificationConfig> = {
      ...configOverrides,
      ...ab.override
    };
    const abPredictions = runEvaluationDataset(seed, mergedConfig, 4);
    const abBrier = calculateBrierScore(abPredictions);
    const abAttacks = abPredictions.filter(p => p.label === 0);
    const abHonest = abPredictions.filter(p => p.label === 1);

    const abFar = abAttacks.length > 0 ? abAttacks.filter(p => p.decision === 'accept').length / abAttacks.length : 0;
    const abFrr = abHonest.length > 0 ? abHonest.filter(p => p.decision === 'reject').length / abHonest.length : 0;

    ablations.push({
      stageName: ab.name,
      brierScore: abBrier,
      far: Number(abFar.toFixed(4)),
      frr: Number(abFrr.toFixed(4)),
      deltaBrier: Number((abBrier - brierScore).toFixed(4))
    });
  }

  return {
    brierScore,
    totalSamples: basePredictions.length,
    reliabilityDiagram,
    attackMetrics,
    honestMetrics,
    ablations
  };
}
