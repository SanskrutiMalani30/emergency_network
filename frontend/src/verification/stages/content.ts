/**
 * RESQMesh — Stage 3: Content & Decoy Analysis
 * Evaluates semantic consistency with time-decayed hazard maps, flags copy-paste
 * decoy floods across distinct senders, and penalizes vague ungrounded panic messages.
 */

import type { Message, NodeView, StageResult, VerificationConfig, HazardEntry } from '../types';
import { haversineMeters } from './location';

const VAGUE_PANIC_PATTERNS = [
  /^(help\s*)+$/i,
  /^(emergency\s*)+$/i,
  /^(save\s*us\s*)+$/i,
  /^(die|dead|kill|all\s*die)\b/i,
  /^urgent\s*help\s*now!*$/i
];

const SPECIFIC_TACTICAL_TERMS = [
  /\b(insulin|diabetic|glucose|dialysis|oxygen|asthma|inhaler)\b/i,
  /\b(trapped|rubble|collapse|broken|fracture|bleeding|wound|stretcher)\b/i,
  /\b(water rising|submerged|boat|canoe|river|swimming|drowning)\b/i,
  /\b(elderly|infant|baby|children|pregnant|wheelchair|bedridden)\b/i,
  /\b(ration|drinking water|food|starving|dehydration)\b/i,
  /\b(bridge|floor|roof|ward|sector|street|crossroad|building)\b/i
];

/**
 * Normalizes text for similarity comparison.
 */
function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Evaluates Stage 3 Content.
 */
export function evaluateContentStage(
  msg: Message,
  view: NodeView,
  cfg: VerificationConfig['content'],
  currentTime: number
): StageResult {
  if (!cfg.enabled) {
    return { score: 0.0, reason: 'Stage 3 Content evaluation disabled' };
  }

  const rawText = msg.text.trim();
  const normalized = normalizeText(rawText);

  // 1. Copy-Paste Decoy Signature Detection across "different" senders
  if (view.recentMessages && view.recentMessages.length > 0) {
    let duplicateCount = 0;
    for (const prior of view.recentMessages) {
      if (prior.senderPubKey !== msg.senderPubKey && Math.abs(currentTime - prior.timestamp) < 3600) {
        const priorNorm = normalizeText(prior.text);
        if (priorNorm === normalized && normalized.length > 15) {
          duplicateCount++;
        }
      }
    }

    if (duplicateCount >= 1) {
      return {
        score: -0.9,
        reason: `Copy-paste decoy attack detected: identical text replicated across multiple distinct sender keys`,
        metadata: { duplicateCount, isDecoyCopyPaste: true }
      };
    }
  }

  // 2. Vague Extreme Urgency without Specifics Check
  const isVaguePanic = VAGUE_PANIC_PATTERNS.some(pat => pat.test(rawText));
  const hasSpecificTerms = SPECIFIC_TACTICAL_TERMS.some(pat => pat.test(rawText));

  if (isVaguePanic && !hasSpecificTerms) {
    return {
      score: -0.5,
      reason: 'Vague extreme panic alert lacking actionable details or physical specifics'
    };
  }

  // 3. Consistency with Active Environmental Hazard Map (Time-Decayed)
  let hazardScore = 0.0;
  let matchingHazard: HazardEntry | null = null;

  if (view.hazardMap && view.hazardMap.length > 0) {
    for (const hazard of view.hazardMap) {
      const distM = haversineMeters(msg.claimedLoc.lat, msg.claimedLoc.lng, hazard.lat, hazard.lng);
      if (distM <= hazard.radiusM + 500) {
        // Half-life time decay formula
        const ageSeconds = Math.max(0, currentTime - hazard.timestamp);
        const decay = Math.pow(0.5, ageSeconds / cfg.hazardDecayHalfLifeSeconds);
        const effectiveWeight = hazard.confidence * decay;

        if (effectiveWeight > 0.25) {
          hazardScore = Math.max(hazardScore, effectiveWeight);
          matchingHazard = hazard;
        }
      }
    }
  }

  if (matchingHazard && hazardScore > 0.4) {
    return {
      score: 0.85,
      reason: `Corroborated by active environmental hazard map: confirmed ${matchingHazard.type} within zone (${Math.round(hazardScore * 100)}% temporal confidence)`,
      metadata: { hazardId: matchingHazard.id, hazardScore }
    };
  }

  if (hasSpecificTerms) {
    return {
      score: 0.55,
      reason: 'Contains specific actionable clinical, physical, or logistical crisis descriptors'
    };
  }

  return {
    score: 0.1,
    reason: 'Generic crisis report; plausible text structure'
  };
}
