/**
 * RESQMesh — Stage 5: Cryptographic Credential & Stolen Key Defense
 * Verifies issuer signatures against preloaded authority public keys, enforces expiry,
 * checks holder-key binding, and detects stolen credentials via live challenge-response nonces.
 */

import type { Message, NodeView, StageResult, VerificationConfig } from '../types';
import { verifyCredentialSignature, verifyChallengeResponse } from '../crypto';

/**
 * Evaluates Stage 5 Credentials.
 */
export function evaluateCredentialStage(
  msg: Message,
  view: NodeView,
  cfg: VerificationConfig['credential'],
  currentTime: number,
  expectedNonce?: string
): StageResult {
  if (!cfg.enabled) {
    return { score: 0.0, reason: 'Stage 5 Credential evaluation disabled' };
  }

  // 1. Self-declared responder with no credential attachment
  if (!msg.credential) {
    return {
      score: 0.0,
      reason: 'Self-declared capability without cryptographic credential endorsement',
      metadata: { credentialStatus: 'UNATTACHED' }
    };
  }

  const cred = msg.credential;

  // 2. Issuer Authority Recognition
  const issuerPubKey = view.issuerPubKeys && view.issuerPubKeys[cred.issuerId];
  if (!issuerPubKey) {
    return {
      score: -0.75,
      reason: `Untrusted credential authority: issuer '${cred.issuerId}' not registered in local root-of-trust`,
      metadata: { issuerId: cred.issuerId, credentialStatus: 'UNKNOWN_ISSUER' }
    };
  }

  // 3. Issuer Cryptographic Signature Verification
  const isSignatureValid = verifyCredentialSignature(cred, issuerPubKey);
  if (!isSignatureValid) {
    return {
      score: -0.95,
      reason: `Forged credential: cryptographic signature failed verification against ${cred.issuerId} public key`,
      metadata: { issuerId: cred.issuerId, credentialStatus: 'FORGED_SIGNATURE' }
    };
  }

  // 4. Temporal Expiry Check
  if (cred.expiresAt < currentTime) {
    const expiredMinutesAgo = Math.round((currentTime - cred.expiresAt) / 60);
    return {
      score: -0.7,
      reason: `Expired credential: skill endorsement '${cred.skill}' expired ${expiredMinutesAgo} minutes ago`,
      metadata: { expiresAt: cred.expiresAt, credentialStatus: 'EXPIRED' }
    };
  }

  // 5. Holder Key Binding Check
  if (cred.holderPubKey !== msg.senderPubKey) {
    return {
      score: -0.95,
      reason: 'Holder mismatch: credential holder public key does not match message author',
      metadata: { credentialStatus: 'HOLDER_MISMATCH' }
    };
  }

  // 6. Stolen Credential Defense (Live Challenge-Response Nonce)
  // If an active challenge was issued to this node, verify they hold the actual secret key
  const targetNonce = expectedNonce || (view.activeChallenges && view.activeChallenges[msg.senderPubKey]?.nonce);
  if (targetNonce) {
    if (!msg.nonceResponse) {
      return {
        score: -0.85,
        reason: 'Stolen credential suspected: sender failed to provide live challenge-response signature',
        metadata: { credentialStatus: 'CHALLENGE_MISSING' }
      };
    }

    const isNonceValid = verifyChallengeResponse(targetNonce, msg.nonceResponse, cred.holderPubKey);
    if (!isNonceValid) {
      return {
        score: -0.98,
        reason: 'Stolen credential confirmed: sender failed cryptographic proof-of-possession challenge',
        metadata: { credentialStatus: 'CHALLENGE_FAILED' }
      };
    }
  }

  return {
    score: 0.95,
    reason: `Verified ${cred.skill} credential signed by authorized authority (${cred.issuerId})`,
    metadata: {
      skill: cred.skill,
      issuerId: cred.issuerId,
      expiresAt: cred.expiresAt,
      credentialStatus: 'VERIFIED'
    }
  };
}
