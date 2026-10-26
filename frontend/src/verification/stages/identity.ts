/**
 * RESQMesh — Stage 1: Identity & Sybil Defense
 * Clusters senders that appear to originate from the same physical radio source using
 * RSSI vector correlation, neighbor overlaps, first-seen timestamps, and hop-paths.
 * Enforces that each physical radio cluster contributes at most ONE vote.
 */

import type { Message, NodeView, StageResult, VerificationConfig } from '../types';

export interface RadioCluster {
  id: string;
  senderPubKeys: string[];
  messages: Message[];
  primaryRssiVector: Record<string, number>;
}

/**
 * Computes Jaccard similarity between two sets of neighbor IDs.
 */
function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1.0;
  if (a.length === 0 || b.length === 0) return 0.0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = new Set([...a, ...b]).size;
  return intersection / union;
}

/**
 * Computes similarity between two RSSI vectors across common observer neighbors.
 * Returns value in [0, 1].
 */
export function computeRssiSimilarity(
  rssiA: Record<string, number>,
  rssiB: Record<string, number>
): number {
  const neighborsA = Object.keys(rssiA);
  const neighborsB = Object.keys(rssiB);
  const common = neighborsA.filter(n => neighborsB.includes(n));

  if (common.length === 0) {
    // If both have empty neighbor observations, they are inconclusive
    return neighborsA.length === 0 && neighborsB.length === 0 ? 0.5 : 0.0;
  }

  // Mean absolute RSSI difference across common neighbors
  let totalDiff = 0;
  for (const n of common) {
    totalDiff += Math.abs(rssiA[n] - rssiB[n]);
  }
  const meanDiff = totalDiff / common.length;

  // An average difference of <= 3 dBm indicates virtually identical radio positioning
  // A difference >= 25 dBm indicates completely different locations
  const sim = Math.max(0, 1.0 - meanDiff / 25.0);
  const neighborOverlap = jaccardSimilarity(neighborsA, neighborsB);

  return 0.7 * sim + 0.3 * neighborOverlap;
}

/**
 * Computes overall radio source similarity between two messages.
 */
export function computeRadioSimilarity(a: Message, b: Message): number {
  // If identical sender pubkey, they are trivially the same
  if (a.senderPubKey === b.senderPubKey) return 1.0;

  // 1. RSSI vector similarity
  const rssiSim = computeRssiSimilarity(a.rssiByNeighbor, b.rssiByNeighbor);

  // 2. Neighbor set overlap
  const neighborSim = jaccardSimilarity(
    Object.keys(a.rssiByNeighbor),
    Object.keys(b.rssiByNeighbor)
  );

  // 3. Hop path similarity (did they exit via the identical first hop relay?)
  let hopSim = 0.0;
  if (a.hopPath && b.hopPath && a.hopPath.length > 0 && b.hopPath.length > 0) {
    if (a.hopPath[0] === b.hopPath[0]) {
      hopSim = 1.0;
    }
  }

  // 4. Time burst correlation (within 45 seconds)
  const timeDiff = Math.abs(a.timestamp - b.timestamp);
  const timeSim = timeDiff <= 45 ? 1.0 : Math.max(0, 1.0 - timeDiff / 300);

  // Composite similarity score
  return 0.45 * rssiSim + 0.25 * neighborSim + 0.15 * hopSim + 0.15 * timeSim;
}

/**
 * Groups messages into distinct physical radio clusters using connected-components clustering.
 * Exported for Sybil inspection.
 */
export function clusterSenders(
  messages: Message[],
  threshold = 0.75
): RadioCluster[] {
  if (messages.length === 0) return [];

  const n = messages.length;
  const parent = Array.from({ length: n }, (_, i) => i);

  function find(i: number): number {
    if (parent[i] === i) return i;
    parent[i] = find(parent[i]);
    return parent[i];
  }

  function union(i: number, j: number) {
    const rootI = find(i);
    const rootJ = find(j);
    if (rootI !== rootJ) {
      parent[rootI] = rootJ;
    }
  }

  // Pairwise comparison
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sim = computeRadioSimilarity(messages[i], messages[j]);
      if (sim >= threshold) {
        union(i, j);
      }
    }
  }

  // Group by cluster root
  const clusterMap: Record<number, Message[]> = {};
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!clusterMap[root]) clusterMap[root] = [];
    clusterMap[root].push(messages[i]);
  }

  return Object.entries(clusterMap).map(([rootId, clusterMsgs]) => {
    const uniqueKeys = Array.from(new Set(clusterMsgs.map(m => m.senderPubKey)));
    return {
      id: `cluster-${rootId}`,
      senderPubKeys: uniqueKeys,
      messages: clusterMsgs,
      primaryRssiVector: clusterMsgs[0].rssiByNeighbor
    };
  });
}

/**
 * Calculates effective witness count across candidate messages by counting
 * distinct physical radio clusters rather than raw cryptographic keys.
 * Exported public utility.
 */
export function effectiveWitnessCount(
  messages: Message[],
  threshold = 0.75
): number {
  return clusterSenders(messages, threshold).length;
}

/**
 * Evaluates Stage 1 Identity & Sybil Defense for an incoming message.
 */
export function evaluateIdentityStage(
  msg: Message,
  view: NodeView,
  cfg: VerificationConfig['identity']
): StageResult {
  if (!cfg.enabled) {
    return { score: 0.0, reason: 'Stage 1 Identity evaluation disabled' };
  }

  const isDirectContact = view.directContacts && view.directContacts.includes(msg.senderPubKey);
  const trustHistory = (view.trustHistory && view.trustHistory[msg.senderPubKey] !== undefined)
    ? view.trustHistory[msg.senderPubKey]
    : 0.5;

  // Check if sender is currently part of an active multi-key burst in recent sightings
  if (view.recentMessages && view.recentMessages.length > 0) {
    const recentOtherSenders = view.recentMessages.filter(
      m => m.senderPubKey !== msg.senderPubKey && Math.abs(m.timestamp - msg.timestamp) < 60
    );

    if (recentOtherSenders.length > 0) {
      const clusterWithNew = clusterSenders([msg, ...recentOtherSenders], cfg.rssiSimilarityThreshold);
      const myCluster = clusterWithNew.find(c => c.senderPubKeys.includes(msg.senderPubKey));

      if (myCluster && myCluster.senderPubKeys.length >= 3) {
        return {
          score: -0.85,
          reason: `Sybil swarm detected: sender shares identical radio RF signature with ${myCluster.senderPubKeys.length - 1} distinct keys`,
          metadata: { clusterKeys: myCluster.senderPubKeys.length, clusterCount: clusterWithNew.length }
        };
      }
    }
  }

  if (isDirectContact) {
    const bonus = Math.min(1.0, 0.4 + cfg.directContactBonus);
    return {
      score: bonus,
      reason: 'Vouched sender: verified via direct physical radio handshake log'
    };
  }

  if (trustHistory > 0.6) {
    return {
      score: (trustHistory - 0.5) * 1.6,
      reason: `Sender has positive network trust history (${Math.round(trustHistory * 100)}%)`
    };
  } else if (trustHistory < 0.4) {
    return {
      score: -0.6,
      reason: `Sender flagged with negative historical trust (${Math.round(trustHistory * 100)}%)`
    };
  }

  return {
    score: 0.05,
    reason: 'Unvouched key; neutral identity score assigned'
  };
}
