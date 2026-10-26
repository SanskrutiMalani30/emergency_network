import { describe, it, expect } from 'vitest';
import { verifyClaim } from '../fuse';
import {
  generateScenario,
  generateSybilSwarm,
  generateCopyPasteDecoy,
  generateGpsSpoof,
  generateForgedCredential,
  generateStolenCredential,
  generateFloodSpam
} from '../sim/generators';
import { clusterSenders, effectiveWitnessCount } from '../stages/identity';
import { runEvaluation, calculateBrierScore } from '../eval/evaluate';
import { signMessage, createKeypairFromSeed } from '../crypto';
import type { Message } from '../types';

describe('RESQMesh — Claim Verification Module Tests', () => {

  // =========================================================================
  // Property 1: Forged credential rejected; stolen credential fails challenge
  // =========================================================================
  it('Property 1: Forged credential is rejected and stolen credential fails holder binding/challenge', () => {
    const scenario = generateScenario(1001);
    const now = scenario.sampleClaims.realCapability.timestamp + 5;

    // Test Forged Credential
    const forged = generateForgedCredential(1001, now);
    const forgedResult = verifyClaim(forged.message, scenario.view, {}, now);

    expect(forgedResult.stageResults['stage5_credential'].score).toBeLessThanOrEqual(-0.8);
    expect(forgedResult.probability).toBeLessThan(0.4);
    expect(forgedResult.decision).toBe('reject');
    expect(forgedResult.reasons.some(r => r.toLowerCase().includes('credential') || r.toLowerCase().includes('signature'))).toBe(true);

    // Test Stolen Credential
    const stolen = generateStolenCredential(1001, now);
    const stolenResult = verifyClaim(stolen.message, scenario.view, {}, now);

    expect(stolenResult.stageResults['stage5_credential'].score).toBeLessThanOrEqual(-0.9);
    expect(stolenResult.probability).toBeLessThan(0.4);
    expect(stolenResult.decision).toBe('reject');
    expect(stolenResult.reasons.some(r => r.toLowerCase().includes('stolen') || r.toLowerCase().includes('holder mismatch'))).toBe(true);
  });

  // =========================================================================
  // Property 2: 40-key Sybil swarm from one radio counts as ~1 witness
  // =========================================================================
  it('Property 2: 40-key Sybil swarm from single radio clusters into ~1 effective witness', () => {
    const sybil = generateSybilSwarm(2002, 40);
    const msgs = sybil.messages;

    // Direct stage 1 clustering function
    const clusters = clusterSenders(msgs, 0.85);

    // All 40 keys should be grouped into 1 single cluster because of identical RSSI & hop path
    expect(clusters.length).toBe(1);
    expect(clusters[0].senderPubKeys.length).toBe(40);

    const effWitnesses = effectiveWitnessCount(msgs, 0.85);
    expect(effWitnesses).toBe(1);

    // In verification pipeline, corroboration using these 40 messages should treat them as 1 cluster
    const scenario = generateScenario(2002);
    const viewWithSybils = { ...scenario.view, recentMessages: msgs };
    const res = verifyClaim(msgs[0], viewWithSybils, {}, msgs[0].timestamp + 2);

    expect(res.stageResults['stage1_identity'].metadata?.clusterCount).toBe(1);
  });

  // =========================================================================
  // Property 3: GPS drift within errM is NOT penalized; teleporting IS
  // =========================================================================
  it('Property 3: GPS drift within errM has zero penalty; teleporting is heavily penalized', () => {
    const scenario = generateScenario(3003);
    const baseNow = scenario.sampleClaims.realDistress.timestamp;
    const honestVictim = scenario.keys.victim;

    // Previous sighting: (18.5204 + 0.0015, 73.8567 + 0.0018)
    // 1. Legitimate Drift within errM = 30m (approx 0.00015 deg lat ~ 16.6m)
    const driftClaimRaw: Omit<Message, 'signature'> = {
      ...scenario.sampleClaims.realDistress,
      id: 'drift_test_01',
      claimedLoc: {
        lat: 18.5204 + 0.0015 + 0.00012, // ~13 meters offset
        lng: 73.8567 + 0.0018 + 0.00010,
        errM: 40
      },
      timestamp: baseNow
    };
    const driftClaim: Message = {
      ...driftClaimRaw,
      signature: signMessage(driftClaimRaw, honestVictim.secretKeyHex)
    };

    const driftRes = verifyClaim(driftClaim, scenario.view, {}, baseNow);
    expect(driftRes.stageResults['stage2_location'].score).toBeGreaterThanOrEqual(0.0);

    // 2. Teleporting 18 km away in 60 seconds (requires 300 m/s ~ 1080 km/h)
    const teleportRaw: Omit<Message, 'signature'> = {
      ...scenario.sampleClaims.realDistress,
      id: 'teleport_test_02',
      claimedLoc: {
        lat: 18.6800, // ~18 km away
        lng: 73.9900,
        errM: 10
      },
      timestamp: baseNow // same timestamp as sighting 180s ago!
    };
    const teleportClaim: Message = {
      ...teleportRaw,
      signature: signMessage(teleportRaw, honestVictim.secretKeyHex)
    };

    const teleportRes = verifyClaim(teleportClaim, scenario.view, {}, baseNow);
    expect(teleportRes.stageResults['stage2_location'].score).toBeLessThanOrEqual(-0.6);
    expect(teleportRes.probability).toBeLessThan(0.4);
  });

  // =========================================================================
  // Property 4: Copy-paste decoys flagged
  // =========================================================================
  it('Property 4: Copy-paste decoy messages across disparate locations are flagged', () => {
    const scenario = generateScenario(4004);
    const decoy = generateCopyPasteDecoy(4004);
    const [msg1, msg2] = decoy.messages;

    // View knows about msg1 already
    const viewWithPriorMsg = {
      ...scenario.view,
      recentMessages: [msg1]
    };

    const decoyRes = verifyClaim(msg2, viewWithPriorMsg, {}, msg2.timestamp + 5);

    expect(decoyRes.stageResults['stage3_content'].score).toBeLessThanOrEqual(-0.6);
    expect(decoyRes.stageResults['stage3_content'].metadata?.isDecoyCopyPaste).toBe(true);
    expect(decoyRes.reasons.some(r => r.toLowerCase().includes('decoy') || r.toLowerCase().includes('duplicate'))).toBe(true);
  });

  // =========================================================================
  // Property 5: Rate limiter drops floods before Stage 1+ runs
  // =========================================================================
  it('Property 5: Rate limiter drops flood spam at Stage 0 gate before costly stages run', () => {
    const scenario = generateScenario(5005);
    const flood = generateFloodSpam(5005, 15);
    const view = { ...scenario.view, rateLimiterState: {} };
    const now = flood.messages[0].timestamp;

    // First 10 messages should pass Stage 0 rate limit bucket (capacity 10)
    for (let i = 0; i < 10; i++) {
      const res = verifyClaim(flood.messages[i], view, {}, now);
      expect(res.stageResults['stage0_gate'].hardReject).toBeFalsy();
    }

    // 11th message without delay must trigger hardReject rate limiting
    const droppedRes = verifyClaim(flood.messages[10], view, {}, now);
    expect(droppedRes.stageResults['stage0_gate'].hardReject).toBe(true);
    expect(droppedRes.decision).toBe('reject');
    expect(droppedRes.probability).toBe(0.0);
    // Stage 1+ must not have run
    expect(droppedRes.stageResults['stage1_identity']).toBeUndefined();
    expect(droppedRes.stageResults['stage2_location']).toBeUndefined();
  });

  // =========================================================================
  // Property 6: Borderline claim triggers challenge; low claim does not
  // =========================================================================
  it('Property 6: Borderline claim triggers challenge; low claim (< 0.4) is rejected immediately without challenge', () => {
    const scenario = generateScenario(6006);
    const baseNow = scenario.sampleClaims.realDistress.timestamp + 10;

    // 1. Clearly malicious / low claim (e.g. spoof + bad text)
    const spoof = generateGpsSpoof(6006, baseNow - 5);
    const lowRes = verifyClaim(spoof.message, scenario.view, {}, baseNow);

    expect(lowRes.probability).toBeLessThan(0.4);
    expect(lowRes.decision).toBe('reject');
    // Battery preservation: never challenge a claim < 0.4
    expect(lowRes.challengeIssued).toBeUndefined();

    // 2. Borderline claim: stranger node (no prior trust), moderate RSSI, moderate distance
    const strangerKeys = createKeypairFromSeed('stranger_node_borderline');
    const borderlineRaw: Omit<Message, 'signature'> = {
      id: 'borderline_msg_01',
      senderPubKey: strangerKeys.publicKeyHex,
      type: 'distress',
      text: 'Water on access lane, need team to check passage.',
      claimedLoc: {
        lat: 18.5204 + 0.015,
        lng: 73.8567 + 0.015,
        errM: 50
      },
      timestamp: baseNow - 10,
      hopCount: 2,
      hopPath: ['peer_delta', 'peer_relay_distant'],
      rssiByNeighbor: {} // unobserved direct hops / edge of network
    };
    const borderlineMsg: Message = {
      ...borderlineRaw,
      signature: signMessage(borderlineRaw, strangerKeys.secretKeyHex)
    };

    // Clean view without prior trust for stranger
    const borderlineRes = verifyClaim(borderlineMsg, scenario.view, {}, baseNow);
    expect(borderlineRes.probability).toBeGreaterThanOrEqual(0.38);
    expect(borderlineRes.probability).toBeLessThan(0.70);
    expect(borderlineRes.decision).toBe('challenge');
    expect(borderlineRes.challengeIssued).toBeDefined();
    expect(borderlineRes.challengeIssued?.nonce).toBeDefined();
  });

  // =========================================================================
  // Property 7: Determinism: same seed => identical results
  // =========================================================================
  it('Property 7: Complete determinism: identical seed produces identical results', () => {
    const seed = 'reproducible_cascade_2026';
    const sc1 = generateScenario(seed);
    const sc2 = generateScenario(seed);

    const now = sc1.sampleClaims.realDistress.timestamp + 15;
    const res1 = verifyClaim(sc1.sampleClaims.realDistress, sc1.view, {}, now);
    const res2 = verifyClaim(sc2.sampleClaims.realDistress, sc2.view, {}, now);

    expect(res1.probability).toBe(res2.probability);
    expect(res1.uncertainty).toBe(res2.uncertainty);
    expect(res1.decision).toBe(res2.decision);
    expect(res1.reasons).toEqual(res2.reasons);
    expect(res1.posterior).toBe(res2.posterior);

    // Deep compare stage results
    for (const stageKey of Object.keys(res1.stageResults)) {
      expect(res1.stageResults[stageKey].score).toBe(res2.stageResults[stageKey].score);
      expect(res1.stageResults[stageKey].reason).toBe(res2.stageResults[stageKey].reason);
    }
  });

  // =========================================================================
  // Property 8: Calibration: Brier score on simulated data < 0.15
  // =========================================================================
  it('Property 8: Protocol output is well-calibrated with Brier score < 0.15', () => {
    const evalReport = runEvaluation(4242);
    expect(evalReport.brierScore).toBeLessThan(0.15);
    expect(evalReport.totalSamples).toBeGreaterThan(30);

    // Check false accept rate is very low on adversarial inputs
    expect(evalReport.attackMetrics.falseAcceptRate).toBeLessThan(0.10);

    // Check reliability bins are properly partitioned
    expect(evalReport.reliabilityDiagram.length).toBe(10);
  });
});
