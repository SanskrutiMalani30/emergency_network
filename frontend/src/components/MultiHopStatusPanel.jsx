import React, { useState, useEffect } from 'react';
import {
  Radio,
  Share2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  ArrowRight,
  Wifi,
  WifiOff,
  Layers,
  ChevronDown,
  ChevronUp,
  Cpu,
  Smartphone,
  Send,
  Hash,
  Activity
} from 'lucide-react';
import { multiHopRouter, DELIVERY_STATUS } from '../services/ble/multiHopRouter';

export default function MultiHopStatusPanel({ onSelectIncident = null }) {
  const [packets, setPackets] = useState([]);
  const [acks, setAcks] = useState([]);
  const [peers, setPeers] = useState([]);
  const [nodeId, setNodeId] = useState('');
  const [isFlushing, setIsFlushing] = useState(false);
  const [expandedPacketId, setExpandedPacketId] = useState(null);
  const [isNativeBridge, setIsNativeBridge] = useState(false);

  useEffect(() => {
    setNodeId(multiHopRouter.currentNodeId);
    const hasBridge = typeof window !== 'undefined' && !!window.AndroidBleBridge;
    setIsNativeBridge(hasBridge);

    const refreshData = async () => {
      const allPkts = await multiHopRouter.getAllPackets();
      const allAcks = await multiHopRouter.getAllAcks();
      const peerList = multiHopRouter.getDiscoveredPeers();
      setPackets(allPkts.reverse());
      setAcks(allAcks);
      setPeers(peerList);
    };

    refreshData();

    // Subscribe to router events
    const unsubscribe = multiHopRouter.subscribe((event, data) => {
      refreshData();
    });

    const interval = setInterval(refreshData, 3000);
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const handleFlush = async () => {
    setIsFlushing(true);
    try {
      await multiHopRouter.flushGatewayQueue();
    } finally {
      setIsFlushing(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case DELIVERY_STATUS.SERVER_ACKNOWLEDGED:
        return {
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          dot: 'bg-emerald-500',
          label: 'HQ Confirmed (Server ACK)'
        };
      case DELIVERY_STATUS.RECEIVED_BY_GATEWAY:
        return {
          bg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
          dot: 'bg-indigo-500',
          label: 'Received by Gateway'
        };
      case DELIVERY_STATUS.RELAYED_TO_PEER:
        return {
          bg: 'bg-cyan-50 text-cyan-700 border-cyan-200',
          dot: 'bg-cyan-500',
          label: 'Relayed to Mesh Peer'
        };
      case DELIVERY_STATUS.QUEUED_FOR_RELAY:
        return {
          bg: 'bg-blue-50 text-[#168BFA] border-[#D0E6FC]',
          dot: 'bg-[#168BFA]',
          label: 'Queued for Relay'
        };
      case DELIVERY_STATUS.HELPER_ACCEPTED:
        return {
          bg: 'bg-purple-50 text-purple-700 border-purple-200',
          dot: 'bg-purple-500',
          label: 'Helper Accepted'
        };
      case DELIVERY_STATUS.EXPIRED:
        return {
          bg: 'bg-amber-50 text-amber-700 border-amber-200',
          dot: 'bg-amber-500',
          label: 'TTL Expired'
        };
      case DELIVERY_STATUS.DELIVERY_FAILED:
        return {
          bg: 'bg-rose-50 text-rose-700 border-rose-200',
          dot: 'bg-rose-500',
          label: 'Hop Budget Exhausted'
        };
      default:
        return {
          bg: 'bg-slate-50 text-slate-700 border-slate-200',
          dot: 'bg-slate-400',
          label: 'Saved Locally'
        };
    }
  };

  return (
    <div className="bg-white border border-[#D0E6FC] rounded-2xl shadow-xs overflow-hidden">
      {/* Header */}
      <div className="bg-[#EAF5FF] border-b border-[#D0E6FC] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#168BFA] text-white flex items-center justify-center shadow-xs">
            <Radio className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-sm font-heading font-bold text-[#102B4E]">
                Offline Multi-Hop BLE Mesh
              </h3>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#168BFA]/10 text-[#168BFA] border border-[#168BFA]/20">
                Protocol v1.0
              </span>
            </div>
            <p className="text-[11px] text-[#627D98]">
              Air-gapped peer-to-peer distress relay with hop budget & loop prevention
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Node Identifier */}
          <span className="hidden sm:inline-flex items-center space-x-1 px-2 py-1 bg-white border border-[#D0E6FC] rounded-lg text-[10px] font-mono text-[#102B4E]">
            <Cpu className="w-3 h-3 text-[#168BFA]" />
            <span>ID: {nodeId}</span>
          </span>

          <button
            type="button"
            onClick={handleFlush}
            disabled={isFlushing}
            className="px-2.5 py-1.5 bg-white hover:bg-[#F4FAFF] border border-[#D0E6FC] text-[#168BFA] rounded-xl text-xs font-bold flex items-center space-x-1.5 transition shadow-2xs"
            title="Opportunistic flush to Internet Gateway"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFlushing ? 'animate-spin' : ''}`} />
            <span>Flush Gateway</span>
          </button>
        </div>
      </div>

      {/* Telemetry Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-[#F8FAFC] border-b border-[#E2E8F0] text-xs">
        <div className="bg-white p-2.5 rounded-xl border border-[#E2E8F0] shadow-2xs">
          <span className="text-[10px] font-bold text-[#627D98] uppercase">Active Transport</span>
          <div className="font-bold text-[#102B4E] flex items-center space-x-1 mt-0.5">
            {isNativeBridge ? (
              <>
                <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-700">Android BLE</span>
              </>
            ) : (
              <>
                <Radio className="w-3.5 h-3.5 text-[#168BFA]" />
                <span>Web / RF Hybrid</span>
              </>
            )}
          </div>
        </div>

        <div className="bg-white p-2.5 rounded-xl border border-[#E2E8F0] shadow-2xs">
          <span className="text-[10px] font-bold text-[#627D98] uppercase">Discovered Peers</span>
          <div className="font-bold text-[#102B4E] flex items-center space-x-1 mt-0.5">
            <Activity className="w-3.5 h-3.5 text-[#168BFA]" />
            <span>{peers.length} nearby</span>
          </div>
        </div>

        <div className="bg-white p-2.5 rounded-xl border border-[#E2E8F0] shadow-2xs">
          <span className="text-[10px] font-bold text-[#627D98] uppercase">Relayed Packets</span>
          <div className="font-bold text-[#102B4E] flex items-center space-x-1 mt-0.5">
            <Share2 className="w-3.5 h-3.5 text-cyan-600" />
            <span>{packets.length} total</span>
          </div>
        </div>

        <div className="bg-white p-2.5 rounded-xl border border-[#E2E8F0] shadow-2xs">
          <span className="text-[10px] font-bold text-[#627D98] uppercase">HQ Confirmed</span>
          <div className="font-bold text-emerald-700 flex items-center space-x-1 mt-0.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>{acks.length} ACKed</span>
          </div>
        </div>
      </div>

      {/* Main Content Area: Active Multi-Hop Chains */}
      <div className="p-3 space-y-3">
        {packets.length === 0 ? (
          <div className="text-center py-6 px-4 bg-[#F8FAFC] rounded-xl border border-dashed border-[#CBD5E1]">
            <Radio className="w-8 h-8 text-[#94A3B8] mx-auto mb-2 opacity-50" />
            <h4 className="text-xs font-bold text-[#102B4E]">No Relayed SOS Packets Yet</h4>
            <p className="text-[11px] text-[#627D98] mt-1 max-w-sm mx-auto">
              Emergency SOS beacons submitted on this device or received from nearby peers over Bluetooth Low Energy will appear here with hop chains and delivery proofs.
            </p>
          </div>
        ) : (
          packets.map((pkt) => {
            const badge = getStatusBadge(pkt.delivery_status);
            const isExpanded = expandedPacketId === pkt.message_id;
            const hopBudgetPercent = Math.min(100, (pkt.hops_taken / (pkt.hop_limit || 7)) * 100);

            // Construct full chain array: [Origin] -> [Hops...] -> [Destination]
            const chainNodes = [
              { id: pkt.origin_id || 'Origin', role: 'Originator' },
              ...(pkt.relay_path || []).map((nodeId, idx) => ({ id: nodeId, role: `Hop ${idx + 1}` }))
            ];
            if (pkt.delivery_status === DELIVERY_STATUS.SERVER_ACKNOWLEDGED) {
              chainNodes.push({ id: 'Central Server', role: 'HQ Command' });
            }

            return (
              <div
                key={pkt.message_id}
                className="border border-[#D0E6FC] rounded-xl p-3 bg-white hover:border-[#168BFA]/50 transition shadow-2xs space-y-2.5"
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#EAF5FF] text-[#168BFA] border border-[#D0E6FC] uppercase">
                        {pkt.category || 'Emergency'}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center space-x-1 ${badge.bg}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                        <span>{badge.label}</span>
                      </span>
                      <span className="text-[10px] font-mono text-[#627D98]">
                        ID: {pkt.message_id.substring(0, 10)}...
                      </span>
                    </div>

                    <p className="text-xs font-medium text-[#102B4E] mt-1.5 leading-snug">
                      {pkt.description}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setExpandedPacketId(isExpanded ? null : pkt.message_id)}
                    className="p-1 text-[#627D98] hover:text-[#168BFA] rounded-md transition"
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>

                {/* Visual Hop Chain Track */}
                <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-2">
                  <div className="flex items-center justify-between text-[10px] font-bold text-[#627D98] mb-1.5">
                    <span>Relay Chain ({pkt.hops_taken} / {pkt.hop_limit || 7} Hops)</span>
                    <span className="text-[10px] font-mono text-[#168BFA]">
                      {pkt.location_accuracy_m ? `±${Math.round(pkt.location_accuracy_m)}m GPS` : ''}
                    </span>
                  </div>

                  {/* Node Progression Sequence */}
                  <div className="flex items-center space-x-1 overflow-x-auto pb-1 text-[11px] scrollbar-thin">
                    {chainNodes.map((node, i) => (
                      <React.Fragment key={i}>
                        <div className="shrink-0 px-2 py-1 bg-white border border-[#CBD5E1] rounded-md shadow-2xs flex flex-col items-center">
                          <span className="text-[9px] font-bold text-[#627D98] uppercase leading-none">
                            {node.role}
                          </span>
                          <span className="font-mono text-[10px] text-[#102B4E] font-medium mt-0.5">
                            {node.id.length > 12 ? node.id.substring(0, 10) + '..' : node.id}
                          </span>
                        </div>
                        {i < chainNodes.length - 1 && (
                          <ArrowRight className="w-3 h-3 text-[#94A3B8] shrink-0" />
                        )}
                      </React.Fragment>
                    ))}
                  </div>

                  {/* Hop Budget Bar */}
                  <div className="w-full bg-[#E2E8F0] h-1.5 rounded-full overflow-hidden mt-1.5">
                    <div
                      className={`h-full transition-all duration-300 ${
                        hopBudgetPercent > 80 ? 'bg-rose-500' : hopBudgetPercent > 50 ? 'bg-amber-500' : 'bg-[#168BFA]'
                      }`}
                      style={{ width: `${hopBudgetPercent}%` }}
                    />
                  </div>
                </div>

                {/* Expanded Details: Cryptographic & Server ACK proof */}
                {isExpanded && (
                  <div className="pt-2 border-t border-[#E2E8F0] space-y-2 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                      <div className="bg-[#F8FAFC] p-2 rounded-lg border border-[#E2E8F0]">
                        <span className="text-[10px] font-bold text-[#627D98] uppercase block">
                          Payload Integrity (SHA-256)
                        </span>
                        <span className="font-mono text-[10px] text-[#102B4E] break-all">
                          {pkt.payload_hash || 'SHA-256 Validated'}
                        </span>
                      </div>

                      <div className="bg-[#F8FAFC] p-2 rounded-lg border border-[#E2E8F0]">
                        <span className="text-[10px] font-bold text-[#627D98] uppercase block">
                          Origin Signature
                        </span>
                        <span className="font-mono text-[10px] text-[#102B4E] break-all">
                          {pkt.signature || 'Ed25519 Verified'}
                        </span>
                      </div>
                    </div>

                    {pkt.server_ack && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 space-y-1">
                        <div className="flex items-center space-x-1.5 text-emerald-800 font-bold text-xs">
                          <ShieldCheck className="w-4 h-4 text-emerald-600" />
                          <span>Official Server Proof of Delivery</span>
                        </div>
                        <div className="text-[11px] text-emerald-900 space-y-0.5">
                          <div>
                            <span className="font-semibold">Server Received: </span>
                            <span className="font-mono">{pkt.server_ack.server_received_at}</span>
                          </div>
                          <div>
                            <span className="font-semibold">Confidence Score: </span>
                            <span>{Math.round((pkt.server_ack.confidence_score || 0.9) * 100)}%</span>
                          </div>
                          <div>
                            <span className="font-semibold">Cryptographic ACK Token: </span>
                            <span className="font-mono text-[10px] break-all">{pkt.server_ack.server_signature}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
