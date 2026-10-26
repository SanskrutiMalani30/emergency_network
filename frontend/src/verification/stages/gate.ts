/**
 * RESQMesh — Stage 0: Gate & Battery Defense
 * Verifies Ed25519 signature, message schema, timestamp sanity, and enforces
 * a per-peer token-bucket rate limiter to prevent radio/battery exhaustion attacks.
 */

import type { Message, NodeView, StageResult, VerificationConfig, TokenBucket } from '../types';
import { verifyMessageSignature } from '../crypto';

export interface GateOutput {
  result: StageResult;
  updatedRateLimiterState: Record<string, TokenBucket>;
}

/**
 * Pure evaluation of Stage 0 Gate.
 * Does not read globals or system clock; operates purely on inputs.
 */
export function evaluateGateStage(
  msg: Message,
  view: NodeView,
  cfg: VerificationConfig['gate'],
  currentTime: number
): GateOutput {
  const rateLimitState = { ...view.rateLimiterState };

  if (!cfg.enabled) {
    return {
      result: { score: 0.0, reason: 'Stage 0 Gate disabled by configuration' },
      updatedRateLimiterState: rateLimitState
    };
  }

  // 1. Per-peer Token-Bucket Rate Limiter (Battery Exhaustion Defense)
  const peerKey = (msg.hopPath && msg.hopPath.length > 0) ? msg.hopPath[0] : msg.senderPubKey;
  const existingBucket = rateLimitState[peerKey] || {
    tokens: cfg.rateLimitCapacity,
    lastRefillTime: currentTime
  };

  const elapsed = Math.max(0, currentTime - existingBucket.lastRefillTime);
  const refilledTokens = Math.min(
    cfg.rateLimitCapacity,
    existingBucket.tokens + elapsed * cfg.rateLimitRefillRate
  );

  if (refilledTokens < 1.0) {
    return {
      result: {
        score: -1.0,
        hardReject: true,
        reason: `Rate limit exceeded for peer ${peerKey.slice(0, 8)}... (battery protection threshold triggered)`
      },
      updatedRateLimiterState: {
        ...rateLimitState,
        [peerKey]: { tokens: refilledTokens, lastRefillTime: currentTime }
      }
    };
  }

  // Consume 1 token for this message
  rateLimitState[peerKey] = {
    tokens: refilledTokens - 1.0,
    lastRefillTime: currentTime
  };

  // 2. Schema Validation
  if (!msg.id || typeof msg.id !== 'string') {
    return {
      result: { score: -1.0, hardReject: true, reason: 'Message rejected: missing or invalid message ID' },
      updatedRateLimiterState: rateLimitState
    };
  }

  if (!msg.senderPubKey || typeof msg.senderPubKey !== 'string' || msg.senderPubKey.length < 32) {
    return {
      result: { score: -1.0, hardReject: true, reason: 'Message rejected: invalid sender public key format' },
      updatedRateLimiterState: rateLimitState
    };
  }

  if (!msg.claimedLoc || typeof msg.claimedLoc.lat !== 'number' || typeof msg.claimedLoc.lng !== 'number') {
    return {
      result: { score: -1.0, hardReject: true, reason: 'Message rejected: missing geographic coordinates' },
      updatedRateLimiterState: rateLimitState
    };
  }

  const { lat, lng, errM } = msg.claimedLoc;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180 || (typeof errM === 'number' && errM < 0)) {
    return {
      result: { score: -1.0, hardReject: true, reason: 'Message rejected: coordinates outside valid terrestrial WGS84 bounds' },
      updatedRateLimiterState: rateLimitState
    };
  }

  if (typeof msg.text !== 'string' || msg.text.trim().length === 0) {
    return {
      result: { score: -1.0, hardReject: true, reason: 'Message rejected: empty text payload' },
      updatedRateLimiterState: rateLimitState
    };
  }

  if (typeof msg.hopCount !== 'number' || msg.hopCount < 0) {
    return {
      result: { score: -1.0, hardReject: true, reason: 'Message rejected: invalid hop count' },
      updatedRateLimiterState: rateLimitState
    };
  }

  // 3. Timestamp Sanity Check
  if (msg.timestamp > currentTime + cfg.maxFutureDriftSeconds) {
    return {
      result: {
        score: -1.0,
        hardReject: true,
        reason: `Message rejected: timestamp is ${Math.round(msg.timestamp - currentTime)}s in the future (clock skew anomaly)`
      },
      updatedRateLimiterState: rateLimitState
    };
  }

  if (msg.timestamp < currentTime - cfg.ttlSeconds) {
    return {
      result: {
        score: -1.0,
        hardReject: true,
        reason: `Message rejected: timestamp expired beyond protocol TTL (${Math.round((currentTime - msg.timestamp) / 60)}m old)`
      },
      updatedRateLimiterState: rateLimitState
    };
  }

  // 4. Cryptographic Ed25519 Signature Verification
  const isSigValid = verifyMessageSignature(msg);
  if (!isSigValid) {
    return {
      result: {
        score: -1.0,
        hardReject: true,
        reason: 'Message rejected: invalid Ed25519 signature (tampered payload or forged key)'
      },
      updatedRateLimiterState: rateLimitState
    };
  }

  return {
    result: {
      score: 0.1,
      hardReject: false,
      reason: 'Signature valid, schema conformant, rate limits satisfied'
    },
    updatedRateLimiterState: rateLimitState
  };
}
