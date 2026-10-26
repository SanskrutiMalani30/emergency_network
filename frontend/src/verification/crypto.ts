/**
 * RESQMesh — Cryptographic Utilities
 * Deterministic Ed25519 signatures and SHA-256 message serialization via @noble/ed25519 and @noble/hashes.
 */

import * as ed from '@noble/ed25519';
import { sha512, sha256 } from '@noble/hashes/sha2.js';
import type { Message, Credential } from './types';

// Configure synchronous hashing for @noble/ed25519 v2/v3
ed.hashes.sha512 = (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m));

/** Convert Uint8Array to hex string */
export function bytesToHex(bytes: Uint8Array): string {
  return ed.etc.bytesToHex(bytes);
}

/** Convert hex string to Uint8Array */
export function hexToBytes(hex: string): Uint8Array {
  return ed.etc.hexToBytes(hex.startsWith('0x') ? hex.slice(2) : hex);
}

/** Compute SHA-256 digest as hex */
export function sha256Hex(data: string | Uint8Array): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return bytesToHex(sha256(bytes));
}

/**
 * Deterministic canonical payload string for message signing.
 * Omits the signature and nonceResponse fields.
 */
export function canonicalizeMessage(msg: Omit<Message, 'signature' | 'nonceResponse'>): Uint8Array {
  const normalized = {
    id: msg.id,
    senderPubKey: msg.senderPubKey,
    type: msg.type,
    text: msg.text,
    claimedLoc: {
      lat: Number(msg.claimedLoc.lat.toFixed(6)),
      lng: Number(msg.claimedLoc.lng.toFixed(6)),
      errM: Math.round(msg.claimedLoc.errM)
    },
    timestamp: Math.round(msg.timestamp),
    hopCount: msg.hopCount,
    hopPath: msg.hopPath || [],
    credentialSummary: msg.credential ? `${msg.credential.issuerId}:${msg.credential.skill}:${msg.credential.expiresAt}` : null
  };
  return new TextEncoder().encode(JSON.stringify(normalized));
}

/**
 * Deterministic canonical payload for credential signing.
 */
export function canonicalizeCredential(cred: Omit<Credential, 'issuerSignature'>): Uint8Array {
  const normalized = {
    holderPubKey: cred.holderPubKey,
    skill: cred.skill,
    issuerId: cred.issuerId,
    expiresAt: Math.round(cred.expiresAt)
  };
  return new TextEncoder().encode(JSON.stringify(normalized));
}

/**
 * Synchronously sign a message using an Ed25519 secret key.
 */
export function signMessage(msg: Omit<Message, 'signature' | 'nonceResponse'>, secretKeyHex: string): string {
  const payload = canonicalizeMessage(msg);
  const secretKey = hexToBytes(secretKeyHex);
  const sigBytes = ed.sign(payload, secretKey);
  return bytesToHex(sigBytes);
}

/**
 * Synchronously verify an Ed25519 message signature.
 */
export function verifyMessageSignature(msg: Message): boolean {
  try {
    if (!msg.signature || !msg.senderPubKey) return false;
    const payload = canonicalizeMessage(msg);
    const sig = hexToBytes(msg.signature);
    const pub = hexToBytes(msg.senderPubKey);
    return ed.verify(sig, payload, pub);
  } catch (e) {
    return false;
  }
}

/**
 * Synchronously sign a credential by an issuer.
 */
export function signCredential(cred: Omit<Credential, 'issuerSignature'>, issuerSecretKeyHex: string): string {
  const payload = canonicalizeCredential(cred);
  const secretKey = hexToBytes(issuerSecretKeyHex);
  const sigBytes = ed.sign(payload, secretKey);
  return bytesToHex(sigBytes);
}

/**
 * Synchronously verify a credential issuer signature.
 */
export function verifyCredentialSignature(cred: Credential, issuerPubKeyHex: string): boolean {
  try {
    if (!cred.issuerSignature || !issuerPubKeyHex) return false;
    const payload = canonicalizeCredential(cred);
    const sig = hexToBytes(cred.issuerSignature);
    const pub = hexToBytes(issuerPubKeyHex);
    return ed.verify(sig, payload, pub);
  } catch (e) {
    return false;
  }
}

/**
 * Synchronously verify a challenge-response nonce signature.
 */
export function verifyChallengeResponse(nonce: string, responseSigHex: string, expectedPubKeyHex: string): boolean {
  try {
    const payload = new TextEncoder().encode(`CHALLENGE:${nonce}`);
    const sig = hexToBytes(responseSigHex);
    const pub = hexToBytes(expectedPubKeyHex);
    return ed.verify(sig, payload, pub);
  } catch (e) {
    return false;
  }
}

/**
 * Sign a live challenge nonce response with the holder's key.
 */
export function signChallengeResponse(nonce: string, secretKeyHex: string): string {
  const payload = new TextEncoder().encode(`CHALLENGE:${nonce}`);
  const secretKey = hexToBytes(secretKeyHex);
  return bytesToHex(ed.sign(payload, secretKey));
}

/**
 * Generate a new random Ed25519 keypair.
 */
export function createKeypair(): { publicKeyHex: string; secretKeyHex: string } {
  const keys = ed.keygen();
  return {
    publicKeyHex: bytesToHex(keys.publicKey),
    secretKeyHex: bytesToHex(keys.secretKey)
  };
}

/**
 * Generate a deterministic Ed25519 keypair from a seed string or byte array.
 */
export function createKeypairFromSeed(seed: string | Uint8Array): { publicKeyHex: string; secretKeyHex: string } {
  const rawBytes = typeof seed === 'string' ? new TextEncoder().encode(seed) : seed;
  const hash = sha256(rawBytes); // 32 bytes
  const pub = ed.getPublicKey(hash);
  return {
    publicKeyHex: bytesToHex(pub),
    secretKeyHex: bytesToHex(hash)
  };
}

