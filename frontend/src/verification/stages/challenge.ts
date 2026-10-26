/**
 * RESQMesh — Stage 6: Interactive Challenge Protocol
 * Operates strictly on borderline claims in the uncertainty band [0.4, 0.7].
 * Emits interactive cryptographic nonces or high-trust neighbor proximity confirmation
 * requests to resolve ambiguity without wasting node battery on low-scoring attackers (< 0.4).
 */

import type { Message, NodeView, VerificationConfig } from '../types';
import { verifyChallengeResponse } from '../crypto';

export interface IssuedChallenge {
  nonce: string;
  targetPubKey: string;
  proximityVerifierNodeId?: string;
  expiresAt: number;
  prompt: string;
}

export interface ChallengeOutput {
  shouldChallenge: boolean;
  challenge?: IssuedChallenge;
  posteriorAdjustment: number; // log-odds adjustment to add to fusion
  reason: string;
}

/**
 * Pure pseudo-random nonce generator using message attributes and time.
 */
function generateDeterministicNonce(msgId: string, senderKey: string, time: number): string {
  let hash = 0x811c9dc5;
  const str = `${msgId}:${senderKey}:${time}`;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return `nonce-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Evaluates Stage 6 Challenge Protocol.
 */
export function evaluateChallengeStage(
  currentProbability: number,
  msg: Message,
  view: NodeView,
  cfg: VerificationConfig['challenge'],
  currentTime: number
): ChallengeOutput {
  if (!cfg.enabled) {
    return {
      shouldChallenge: false,
      posteriorAdjustment: 0.0,
      reason: 'Stage 6 Challenge protocol disabled'
    };
  }

  // Battery Conservation Rule: Never challenge below 0.4
  if (currentProbability < 0.4) {
    return {
      shouldChallenge: false,
      posteriorAdjustment: 0.0,
      reason: 'Probability below 0.4; challenge omitted to conserve battery against evident attacks'
    };
  }

  // High confidence rule: Accept directly if >= 0.7
  if (currentProbability >= 0.7) {
    return {
      shouldChallenge: false,
      posteriorAdjustment: 0.0,
      reason: 'Confidence meets acceptance threshold (>= 0.70); direct verification granted'
    };
  }

  // Borderline Band [0.4, 0.7]: Check if response was provided
  const activeChallenge = view.activeChallenges && view.activeChallenges[msg.senderPubKey];

  if (activeChallenge && msg.nonceResponse) {
    const isSuccess = verifyChallengeResponse(activeChallenge.nonce, msg.nonceResponse, msg.senderPubKey);
    if (isSuccess) {
      return {
        shouldChallenge: false,
        posteriorAdjustment: 1.1, // shifts borderline logit upwards (~ +25% probability)
        reason: 'Borderline claim resolved: sender verified possession of private key via challenge response'
      };
    } else {
      return {
        shouldChallenge: false,
        posteriorAdjustment: -1.5,
        reason: 'Borderline challenge failed: invalid cryptographic proof-of-possession signature'
      };
    }
  }

  // Find a nearby high-trust node to assist in proximity verification
  let bestProximityNeighbor: string | undefined = undefined;
  if (view.knownNeighbors && view.trustHistory) {
    let highestTrust = 0.7;
    for (const [nId, _loc] of Object.entries(view.knownNeighbors)) {
      const trust = view.trustHistory[nId] || 0.5;
      if (trust > highestTrust) {
        highestTrust = trust;
        bestProximityNeighbor = nId;
      }
    }
  }

  const nonce = generateDeterministicNonce(msg.id, msg.senderPubKey, currentTime);
  const challenge: IssuedChallenge = {
    nonce,
    targetPubKey: msg.senderPubKey,
    proximityVerifierNodeId: bestProximityNeighbor,
    expiresAt: currentTime + 120, // 2-minute challenge window
    prompt: bestProximityNeighbor
      ? `Borderline claim (${Math.round(currentProbability * 100)}%). Requesting RF proximity handshake from trusted peer '${bestProximityNeighbor.slice(0, 8)}'.`
      : `Borderline claim (${Math.round(currentProbability * 100)}%). Requesting cryptographic nonce signature challenge.`
  };

  return {
    shouldChallenge: true,
    challenge,
    posteriorAdjustment: 0.0,
    reason: `Borderline probability (${Math.round(currentProbability * 100)}%): challenge issued to resolve uncertainty`
  };
}
