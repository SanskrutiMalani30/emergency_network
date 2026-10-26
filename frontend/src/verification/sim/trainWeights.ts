/**
 * RESQMesh — Synthetic Weight Training via Logistic Regression
 * Trains fusion stage weights on synthetic ground-truth dataset using
 * Binary Cross-Entropy loss with L2 regularization and gradient descent.
 */

import { PRNG } from './prng';
import {
  generateScenario,
  generateSybilSwarm,
  generateCopyPasteDecoy,
  generateGpsSpoof,
  generateForgedCredential,
  generateStolenCredential
} from './generators';
import { evaluateIdentityStage } from '../stages/identity';
import { evaluateLocationStage } from '../stages/location';
import { evaluateContentStage } from '../stages/content';
import { evaluateCorroborationStage } from '../stages/corroboration';
import { evaluateCredentialStage } from '../stages/credentials';
import type { Message, NodeView, FusionWeights } from '../types';
import { sigmoid } from '../fuse';

export interface TrainingSample {
  features: {
    identity: number;
    location: number;
    content: number;
    corroboration: number;
    credential: number;
    attackSignals: number;
    isDistress: number;
    isCapability: number;
    isHazard: number;
  };
  label: number; // 1 = authentic, 0 = malicious/attack
  type: string;
}

/**
 * Extracts normalized stage feature vector for a claim message.
 */
export function extractFeatures(msg: Message, view: NodeView): TrainingSample['features'] {
  const idRes = evaluateIdentityStage(msg, view, { rssiSimilarityThreshold: 0.85, directContactBonus: 0.25 });
  const locRes = evaluateLocationStage(msg, view, { pathLossExponent: 2.7, referenceRssi: -40, maxFeasibleSpeedMps: 50 });
  const cntRes = evaluateContentStage(msg, view, { hazardDecayHalfLifeSeconds: 7200 });
  const corRes = evaluateCorroborationStage(msg, view, { diminishingBase: 0.5, vicinityRadiusM: 800, timeWindowSeconds: 1800 });
  const crdRes = evaluateCredentialStage(msg, view);

  // Negative signal severity
  const negScores = [idRes.score, locRes.score, cntRes.score, crdRes.score].filter(s => s < 0);
  const attackPenalty = negScores.length > 0 ? Math.min(...negScores) : 0;

  return {
    identity: idRes.score,
    location: locRes.score,
    content: cntRes.score,
    corroboration: corRes.score,
    credential: crdRes.score,
    attackSignals: attackPenalty,
    isDistress: msg.type === 'distress' ? 1 : 0,
    isCapability: msg.type === 'capability' ? 1 : 0,
    isHazard: msg.type === 'hazard' ? 1 : 0
  };
}

/**
 * Generates a diverse balanced synthetic dataset of genuine and adversarial claims.
 */
export function generateTrainingDataset(seed: number | string = 777, sampleCount: number = 240): TrainingSample[] {
  const prng = new PRNG(seed);
  const dataset: TrainingSample[] = [];

  const honestCount = Math.floor(sampleCount / 2);
  const attackCount = sampleCount - honestCount;

  // 1. Generate Honest Samples
  for (let i = 0; i < honestCount; i++) {
    const scenario = generateScenario(prng.nextInt(1000, 999999));
    const claimTypeChoice = prng.choice(['distress', 'capability', 'hazard'] as const);
    let claim: Message;
    if (claimTypeChoice === 'distress') claim = scenario.sampleClaims.realDistress;
    else if (claimTypeChoice === 'capability') claim = scenario.sampleClaims.realCapability;
    else claim = scenario.sampleClaims.realHazard;

    dataset.push({
      features: extractFeatures(claim, scenario.view),
      label: 1.0,
      type: `honest_${claimTypeChoice}`
    });
  }

  // 2. Generate Attack Samples
  const perAttack = Math.floor(attackCount / 5);
  for (let i = 0; i < perAttack; i++) {
    const sc = generateScenario(prng.nextInt(1000, 999999));

    // Sybil
    const syb = generateSybilSwarm(prng.nextInt(1000, 999999), 10);
    dataset.push({
      features: extractFeatures(syb.messages[0], sc.view),
      label: 0.0,
      type: 'attack_sybil'
    });

    // GPS Spoof
    const spoof = generateGpsSpoof(prng.nextInt(1000, 999999));
    dataset.push({
      features: extractFeatures(spoof.message, sc.view),
      label: 0.0,
      type: 'attack_gps_spoof'
    });

    // Decoy
    const decoy = generateCopyPasteDecoy(prng.nextInt(1000, 999999));
    sc.view.recentMessages = [decoy.messages[0]];
    dataset.push({
      features: extractFeatures(decoy.messages[1], sc.view),
      label: 0.0,
      type: 'attack_decoy'
    });

    // Forged Credential
    const forged = generateForgedCredential(prng.nextInt(1000, 999999));
    dataset.push({
      features: extractFeatures(forged.message, sc.view),
      label: 0.0,
      type: 'attack_forged_cred'
    });

    // Stolen Credential
    const stolen = generateStolenCredential(prng.nextInt(1000, 999999));
    dataset.push({
      features: extractFeatures(stolen.message, sc.view),
      label: 0.0,
      type: 'attack_stolen_cred'
    });
  }

  return prng.shuffle(dataset);
}

/**
 * Trains logistic regression model via gradient descent to fit FusionWeights.
 */
export function trainWeights(
  seed: number | string = 1234,
  opts: {
    samples?: number;
    epochs?: number;
    learningRate?: number;
    l2Lambda?: number;
  } = {}
): { weights: FusionWeights; lossHistory: number[]; finalAccuracy: number } {
  const epochs = opts.epochs ?? 120;
  const lr = opts.learningRate ?? 0.08;
  const l2 = opts.l2Lambda ?? 0.001;
  const samples = generateTrainingDataset(seed, opts.samples ?? 200);

  // Weight vector: [w_id, w_loc, w_cnt, w_cor, w_crd, w_atk, b_dist, b_cap, b_haz]
  let w = [1.2, 1.4, 0.9, 1.1, 1.3, 1.6, 0.0, -0.1, 0.0];
  const lossHistory: number[] = [];

  for (let epoch = 0; epoch < epochs; epoch++) {
    let totalLoss = 0;
    const grads = new Array(w.length).fill(0);

    for (const sample of samples) {
      const f = sample.features;
      const x = [
        f.identity,
        f.location,
        f.content,
        f.corroboration,
        f.credential,
        f.attackSignals,
        f.isDistress,
        f.isCapability,
        f.isHazard
      ];

      // Forward dot product
      let z = 0;
      for (let j = 0; j < w.length; j++) {
        z += w[j] * x[j];
      }

      const yHat = sigmoid(z);
      const y = sample.label;

      // Cross entropy loss
      const loss = -(y * Math.log(Math.max(1e-7, yHat)) + (1 - y) * Math.log(Math.max(1e-7, 1 - yHat)));
      totalLoss += loss;

      // Gradient
      const err = yHat - y;
      for (let j = 0; j < w.length; j++) {
        grads[j] += err * x[j];
      }
    }

    const n = samples.length;
    totalLoss /= n;
    lossHistory.push(totalLoss);

    // Update weights with L2 regularization
    for (let j = 0; j < w.length; j++) {
      const reg = j < 6 ? l2 * w[j] : 0; // Don't regularize biases as heavily
      w[j] -= lr * (grads[j] / n + reg);
    }
  }

  // Calculate final accuracy
  let correct = 0;
  for (const s of samples) {
    const f = s.features;
    const x = [
      f.identity,
      f.location,
      f.content,
      f.corroboration,
      f.credential,
      f.attackSignals,
      f.isDistress,
      f.isCapability,
      f.isHazard
    ];
    let z = 0;
    for (let j = 0; j < w.length; j++) z += w[j] * x[j];
    const pred = sigmoid(z) >= 0.5 ? 1 : 0;
    if (pred === s.label) correct++;
  }

  const finalAccuracy = correct / samples.length;

  const weights: FusionWeights = {
    w_identity: Number(Math.max(0.5, w[0]).toFixed(3)),
    w_location: Number(Math.max(0.5, w[1]).toFixed(3)),
    w_content: Number(Math.max(0.3, w[2]).toFixed(3)),
    w_corroboration: Number(Math.max(0.4, w[3]).toFixed(3)),
    w_credential: Number(Math.max(0.5, w[4]).toFixed(3)),
    w_attackSignals: Number(Math.max(1.0, w[5]).toFixed(3)),
    bias_distress: Number(w[6].toFixed(3)),
    bias_capability: Number(w[7].toFixed(3)),
    bias_hazard: Number(w[8].toFixed(3))
  };

  return { weights, lossHistory, finalAccuracy };
}
