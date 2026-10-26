/**
 * RESQMesh — Fusion Engine & Public Verification API
 * Combines independent stage signals into a calibrated posterior probability P(claim is real)
 * using Log-Odds Bayesian Fusion, computes credibility uncertainty, emits top-3 reasons,
 * and renders actionable decisions (accept | challenge | reject).
 */

import type {
  Message,
  NodeView,
  VerificationConfig,
  VerificationResult,
  StageResult,
  FusionWeights
} from './types';

import defaultWeights from './weights.json';
import { evaluateGateStage } from './stages/gate';
import { evaluateIdentityStage } from './stages/identity';
import { evaluateLocationStage } from './stages/location';
import { evaluateContentStage } from './stages/content';
import { evaluateCorroborationStage } from './stages/corroboration';
import { evaluateCredentialStage } from './stages/credentials';
import { evaluateChallengeStage } from './stages/challenge';

export const DEFAULT_CONFIG: VerificationConfig = {
  weights: defaultWeights as FusionWeights,
  thresholds: {
    reject: 0.4,
    accept: 0.7
  },
  gate: {
    enabled: true,
    ttlSeconds: 3600,
    maxFutureDriftSeconds: 60,
    rateLimitCapacity: 10,
    rateLimitRefillRate: 0.2
  },
  identity: {
    enabled: true,
    rssiSimilarityThreshold: 0.85,
    directContactBonus: 0.25
  },
  location: {
    enabled: true,
    pathLossExponent: 2.7,
    referenceRssi: -40,
    maxFeasibleSpeedMps: 50
  },
  content: {
    enabled: true,
    hazardDecayHalfLifeSeconds: 7200
  },
  corroboration: {
    enabled: true,
    diminishingBase: 0.5,
    vicinityRadiusM: 800,
    timeWindowSeconds: 1800
  },
  credential: {
    enabled: true
  },
  challenge: {
    enabled: true
  }
};

/** Sigmoid activation function */
export function sigmoid(logit: number): number {
  if (logit > 16) return 1.0;
  if (logit < -16) return 0.0;
  return 1.0 / (1.0 + Math.exp(-logit));
}

/** Inverse sigmoid (logit) function */
export function logit(p: number): number {
  const clamped = Math.max(1e-6, Math.min(1 - 1e-6, p));
  return Math.log(clamped / (1 - clamped));
}

/**
 * Verifies an incoming decentralized mesh claim.
 * Pure, deterministic, framework-independent entrypoint.
 *
 * @param msg The incoming claim message
 * @param view Current node's local situational knowledge
 * @param customConfig Optional partial configuration overrides
 * @param currentTime Optional reference timestamp in seconds (defaults to msg.timestamp)
 */
export function verifyClaim(
  msg: Message,
  view: NodeView,
  customConfig?: Partial<VerificationConfig>,
  currentTime?: number
): VerificationResult {
  const cfg: VerificationConfig = {
    ...DEFAULT_CONFIG,
    ...customConfig,
    weights: {
      ...DEFAULT_CONFIG.weights,
      ...(customConfig?.weights || {})
    },
    thresholds: {
      ...DEFAULT_CONFIG.thresholds,
      ...(customConfig?.thresholds || {})
    },
    gate: { ...DEFAULT_CONFIG.gate, ...(customConfig?.gate || {}) },
    identity: { ...DEFAULT_CONFIG.identity, ...(customConfig?.identity || {}) },
    location: { ...DEFAULT_CONFIG.location, ...(customConfig?.location || {}) },
    content: { ...DEFAULT_CONFIG.content, ...(customConfig?.content || {}) },
    corroboration: { ...DEFAULT_CONFIG.corroboration, ...(customConfig?.corroboration || {}) },
    credential: { ...DEFAULT_CONFIG.credential, ...(customConfig?.credential || {}) },
    challenge: { ...DEFAULT_CONFIG.challenge, ...(customConfig?.challenge || {}) }
  };

  const now = currentTime !== undefined ? currentTime : msg.timestamp;
  const stageResults: Record<string, StageResult> = {};
  const stageContributions: Array<{ stage: string; contribution: number; reason: string }> = [];

  // ==================== STAGE 0: GATE (Battery & Signature Defense) ====================
  const gateOutput = evaluateGateStage(msg, view, cfg.gate, now);
  stageResults['stage0_gate'] = gateOutput.result;
  view.rateLimiterState = gateOutput.updatedRateLimiterState;

  if (gateOutput.result.hardReject) {
    return {
      probability: 0.0,
      uncertainty: 0.02,
      decision: 'reject',
      reasons: [gateOutput.result.reason],
      stageResults,
      posterior: -10.0
    };
  }

  // ==================== STAGE 1: IDENTITY & SYBIL DEFENSE ====================
  const identityRes = evaluateIdentityStage(msg, view, cfg.identity);
  stageResults['stage1_identity'] = identityRes;
  const c_identity = cfg.weights.w_identity * identityRes.score;
  stageContributions.push({ stage: 'Identity / Sybil', contribution: c_identity, reason: identityRes.reason });

  // ==================== STAGE 2: LOCATION & ANTI-SPOOFING ====================
  const locationRes = evaluateLocationStage(msg, view, cfg.location, now);
  stageResults['stage2_location'] = locationRes;
  const c_location = cfg.weights.w_location * locationRes.score;
  stageContributions.push({ stage: 'Location / RF Proximity', contribution: c_location, reason: locationRes.reason });

  // ==================== STAGE 3: CONTENT & DECOYS ====================
  const contentRes = evaluateContentStage(msg, view, cfg.content, now);
  stageResults['stage3_content'] = contentRes;
  const c_content = cfg.weights.w_content * contentRes.score;
  stageContributions.push({ stage: 'Content Consistency', contribution: c_content, reason: contentRes.reason });

  // ==================== STAGE 4: CORROBORATION (Multi-Witness) ====================
  const corroborationRes = evaluateCorroborationStage(msg, view, cfg.corroboration, now);
  stageResults['stage4_corroboration'] = corroborationRes;
  const c_corroboration = cfg.weights.w_corroboration * corroborationRes.score;
  stageContributions.push({ stage: 'Corroboration', contribution: c_corroboration, reason: corroborationRes.reason });

  // ==================== STAGE 5: CREDENTIALS ====================
  const credentialRes = evaluateCredentialStage(msg, view, cfg.credential, now);
  stageResults['stage5_credential'] = credentialRes;
  const c_credential = cfg.weights.w_credential * credentialRes.score;
  stageContributions.push({ stage: 'Credentials', contribution: c_credential, reason: credentialRes.reason });

  // ==================== PRIOR LOG-ODDS BY CLAIM TYPE ====================
  const prior = msg.type === 'distress'
    ? cfg.weights.bias_distress
    : msg.type === 'capability'
    ? cfg.weights.bias_capability
    : cfg.weights.bias_hazard;

  // ==================== ATTACK SIGNALS PENALTY ====================
  const severeNegativeScores = [
    identityRes.score,
    locationRes.score,
    contentRes.score,
    corroborationRes.score,
    credentialRes.score
  ].filter(s => s < -0.4);

  let attackPenalty = 0.0;
  if (severeNegativeScores.length > 0) {
    const totalNegativeMass = severeNegativeScores.reduce((acc, s) => acc + Math.abs(s), 0);
    attackPenalty = cfg.weights.w_attackSignals * totalNegativeMass;
    stageContributions.push({
      stage: 'Attack Signals Penalty',
      contribution: -attackPenalty,
      reason: `Severe adversarial penalty applied (${severeNegativeScores.length} defensive tripwires activated)`
    });
  }

  // ==================== LOG-ODDS FUSION ====================
  let rawLogit = prior + c_identity + c_location + c_content + c_corroboration + c_credential - attackPenalty;
  let p = sigmoid(rawLogit);

  // ==================== STAGE 6: INTERACTIVE CHALLENGE PROTOCOL ====================
  let challengeIssued: VerificationResult['challengeIssued'] = undefined;

  if (cfg.challenge.enabled) {
    const challengeRes = evaluateChallengeStage(p, msg, view, cfg.challenge, now);
    stageResults['stage6_challenge'] = {
      score: challengeRes.posteriorAdjustment,
      reason: challengeRes.reason
    };

    if (challengeRes.shouldChallenge && challengeRes.challenge) {
      challengeIssued = challengeRes.challenge;
    } else if (challengeRes.posteriorAdjustment !== 0.0) {
      rawLogit += challengeRes.posteriorAdjustment;
      p = sigmoid(rawLogit);
      stageContributions.push({
        stage: 'Challenge Protocol',
        contribution: challengeRes.posteriorAdjustment,
        reason: challengeRes.reason
      });
    }
  }

  // ==================== UNCERTAINTY ESTIMATION ====================
  // Uncertainty widens when few active signals are available or when probability is near 0.5
  let activeSignalCount = 0;
  if (Math.abs(identityRes.score) > 0.1) activeSignalCount++;
  if (Math.abs(locationRes.score) > 0.15) activeSignalCount++;
  if (Math.abs(contentRes.score) > 0.2) activeSignalCount++;
  if (corroborationRes.metadata?.independentClusterCount > 0) activeSignalCount++;
  if (credentialRes.metadata?.credentialStatus === 'VERIFIED') activeSignalCount++;

  const signalScarcity = (5 - activeSignalCount) * 0.06;
  const entropy = 4.0 * p * (1.0 - p); // 1.0 at p=0.5, 0 at p=0 or 1
  const uncertainty = Math.min(0.65, Math.max(0.04, 0.05 + signalScarcity + 0.15 * entropy));

  // ==================== DECISION THRESHOLDS ====================
  let decision: VerificationResult['decision'];
  if (challengeIssued) {
    decision = 'challenge';
  } else if (p >= cfg.thresholds.accept) {
    decision = 'accept';
  } else if (p < cfg.thresholds.reject) {
    decision = 'reject';
  } else {
    decision = 'challenge';
  }

  // ==================== TOP-3 PLAIN LANGUAGE REASONS ====================
  // Pick the 3 stages with the largest absolute contribution
  const sortedContributions = [...stageContributions].sort(
    (a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)
  );

  const top3Reasons = sortedContributions.slice(0, 3).map(c => c.reason);

  return {
    probability: Number(p.toFixed(4)),
    uncertainty: Number(uncertainty.toFixed(4)),
    decision,
    reasons: top3Reasons,
    stageResults,
    posterior: Number(rawLogit.toFixed(4)),
    challengeIssued
  };
}
