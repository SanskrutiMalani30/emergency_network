/**
 * RESQMesh — Stage 4: Corroboration & Multi-Witness Verification
 * Counts independent witnesses confirming the same event in spatial-temporal vicinity.
 * Enforces that only distinct Stage-1 physical radio clusters contribute independent votes,
 * preventing Sybil swarms from inflating corroboration. Applies diminishing returns (1 - 0.5^n).
 */

import type { Message, NodeView, StageResult, VerificationConfig } from '../types';
import { haversineMeters } from './location';
import { clusterSenders } from './identity';

/**
 * Evaluates Stage 4 Corroboration.
 */
export function evaluateCorroborationStage(
  msg: Message,
  view: NodeView,
  cfg: VerificationConfig['corroboration'],
  currentTime: number
): StageResult {
  if (!cfg.enabled) {
    return { score: 0.0, reason: 'Stage 4 Corroboration evaluation disabled' };
  }

  const { lat, lng } = msg.claimedLoc;
  const recent = view.recentMessages || [];

  // 1. Filter candidates within spatial vicinity (< 800m) and temporal window (< 30m)
  const candidateWitnesses = recent.filter(other => {
    if (other.id === msg.id || other.senderPubKey === msg.senderPubKey) return false;
    const timeDelta = Math.abs(currentTime - other.timestamp);
    if (timeDelta > cfg.timeWindowSeconds) return false;
    const distM = haversineMeters(lat, lng, other.claimedLoc.lat, other.claimedLoc.lng);
    return distM <= cfg.vicinityRadiusM;
  });

  if (candidateWitnesses.length === 0) {
    return {
      score: 0.0,
      reason: 'Solo uncorroborated report (no nearby independent witness signals yet logged)',
      metadata: { independentWitnessCount: 0, rawWitnessCount: 0 }
    };
  }

  // 2. Group candidate witnesses into distinct physical radio clusters (Stage 1 Sybil Defense)
  // Also cluster with the current message to ensure we don't count messages from the sender's own radio!
  const allRelated = [msg, ...candidateWitnesses];
  const clusters = clusterSenders(allRelated, 0.75);

  // Identify sender's cluster
  const senderCluster = clusters.find(c => c.senderPubKeys.includes(msg.senderPubKey));
  const senderClusterId = senderCluster ? senderCluster.id : null;

  // Independent clusters are those that do NOT belong to the sender
  const independentClusters = clusters.filter(c => c.id !== senderClusterId);
  const n = independentClusters.length;

  // 3. Diminishing returns formula: 1.0 - (diminishingBase ^ n)
  // Maps to score in [0, 1]
  const corroborationFactor = n > 0 ? 1.0 - Math.pow(cfg.diminishingBase, n) : 0.0;

  const reason = n >= 3
    ? `${n} independent physical witness clusters confirm incident in 800m radius`
    : n === 2
    ? `2 independent witness clusters corroborate incident location`
    : n === 1
    ? `1 independent witness cluster confirms incident vicinity`
    : `Multiple reports detected but traced to the same physical radio source (${candidateWitnesses.length} keys, 0 independent clusters)`;

  return {
    score: Number(corroborationFactor.toFixed(3)),
    reason,
    metadata: {
      rawWitnessCount: candidateWitnesses.length,
      independentClusterCount: n,
      clusterDetails: independentClusters.map(c => ({ id: c.id, keys: c.senderPubKeys.length }))
    }
  };
}
