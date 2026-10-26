import React, { useState } from 'react';
import { Network, Split, Unlink, Link2, AlertTriangle, CheckCircle, RefreshCw, Layers, ArrowRight } from 'lucide-react';
import { partitionNetwork, reconnectNetwork } from '../services/api';

export default function MeshPartitionSimulator({ meshStatus, onRefreshMesh }) {
  const [loading, setLoading] = useState(false);
  const [reconcileResult, setReconcileResult] = useState(null);
  const [offlineMessage, setOfflineMessage] = useState('');

  const isPartitioned = meshStatus?.is_partitioned;
  const nodes = meshStatus?.nodes || [];
  const auditLog = meshStatus?.audit_log || [];

  const islandANodes = nodes.filter(n => n.island_id === 'island_A');
  const islandBNodes = nodes.filter(n => n.island_id === 'island_B');

  const handlePartition = async () => {
    setLoading(true);
    setReconcileResult(null);
    try {
      await partitionNetwork();
      if (onRefreshMesh) onRefreshMesh();
    } catch (err) {
      alert(`Partition error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleReconnect = async () => {
    setLoading(true);
    try {
      const res = await reconnectNetwork();
      setReconcileResult(res);
      if (onRefreshMesh) onRefreshMesh();
    } catch (err) {
      alert(`Reconnect error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 bg-navy-950 font-sans space-y-6">
      
      {/* Top Banner & Partition Controls */}
      <div className="bg-navy-900 border border-navy-800 rounded-sm p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5 mb-1">
            <Network className="w-5 h-5 text-cyan" />
            <h2 className="font-heading font-bold text-base text-slate-100 uppercase tracking-wide">
              Offline Mesh & Network Partition Simulator
            </h2>
          </div>
          <p className="text-xs text-slate-400 font-mono">
            Simulate disconnected islands, offline local queuing, and deterministic CRDT synchronization.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {!isPartitioned ? (
            <button
              onClick={handlePartition}
              disabled={loading}
              className="px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-sm transition flex items-center space-x-2 shadow-lg shadow-amber-600/20"
            >
              <Unlink className="w-4 h-4" />
              <span>{loading ? 'Severing...' : 'SEVER BRIDGE (PARTITION NETWORK)'}</span>
            </button>
          ) : (
            <button
              onClick={handleReconnect}
              disabled={loading}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-sm transition flex items-center space-x-2 shadow-lg shadow-emerald-600/20"
            >
              <Link2 className="w-4 h-4" />
              <span>{loading ? 'Reconciling...' : 'RECONNECT & RECONCILE (CRDT MERGE)'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Visual Topological Diagram of the Two Islands */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Island A (North Ward) */}
        <div className={`p-5 rounded-sm border transition shadow-xl ${
          isPartitioned
            ? 'bg-navy-900/90 border-cyan/40 ring-1 ring-cyan/30'
            : 'bg-navy-900/60 border-navy-800'
        }`}>
          <div className="flex items-center justify-between border-b border-navy-800 pb-2.5 mb-4">
            <div>
              <span className="text-xs font-mono font-bold text-cyan uppercase tracking-wider">
                Island A · North Ward Cluster
              </span>
              <p className="text-[11px] text-slate-400 font-mono">Gateway: Alpha Relay Node</p>
            </div>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
              isPartitioned ? 'bg-amber-950 text-amber-300 border border-amber-600/40' : 'bg-emerald-950 text-emerald-400'
            }`}>
              {isPartitioned ? 'ISOLATED' : 'BRIDGED'}
            </span>
          </div>

          <div className="space-y-3 font-mono text-xs">
            {islandANodes.map((node) => (
              <div key={node.node_id} className="p-3 bg-navy-950 border border-navy-800 rounded flex items-center justify-between">
                <div>
                  <div className="text-slate-200 font-bold">{node.name}</div>
                  <div className="text-[10px] text-slate-500">{node.node_id}</div>
                </div>
                <div className="text-right">
                  <span className="text-slate-400 text-[10px]">Queue: {node.queue_len} msgs</span>
                  <div className="text-cyan font-bold text-[11px]">Bat: {node.battery_pct}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Island B (Industrial Sector) */}
        <div className={`p-5 rounded-sm border transition shadow-xl ${
          isPartitioned
            ? 'bg-navy-900/90 border-amber-500/40 ring-1 ring-amber-500/30'
            : 'bg-navy-900/60 border-navy-800'
        }`}>
          <div className="flex items-center justify-between border-b border-navy-800 pb-2.5 mb-4">
            <div>
              <span className="text-xs font-mono font-bold text-amber-400 uppercase tracking-wider">
                Island B · Industrial Sector Cluster
              </span>
              <p className="text-[11px] text-slate-400 font-mono">Gateway: Bravo Industrial Relay</p>
            </div>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
              isPartitioned ? 'bg-amber-950 text-amber-300 border border-amber-600/40' : 'bg-emerald-950 text-emerald-400'
            }`}>
              {isPartitioned ? 'ISOLATED' : 'BRIDGED'}
            </span>
          </div>

          <div className="space-y-3 font-mono text-xs">
            {islandBNodes.map((node) => (
              <div key={node.node_id} className="p-3 bg-navy-950 border border-navy-800 rounded flex items-center justify-between">
                <div>
                  <div className="text-slate-200 font-bold">{node.name}</div>
                  <div className="text-[10px] text-slate-500">{node.node_id}</div>
                </div>
                <div className="text-right">
                  <span className="text-slate-400 text-[10px]">Queue: {node.queue_len} msgs</span>
                  <div className="text-amber-400 font-bold text-[11px]">Bat: {node.battery_pct}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Reconciliation Engine Output Card */}
      {reconcileResult && (
        <div className="bg-navy-900 border border-cyan/40 rounded-sm p-6 space-y-4 shadow-xl">
          <div className="flex items-center space-x-2 border-b border-navy-800 pb-3">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="font-heading font-bold text-sm text-slate-100 uppercase tracking-wide">
                Reconnection & Deterministic Reconciliation Outcome
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                Merged {reconcileResult.merged_events_count} offline events · Resolved {reconcileResult.conflicts_detected} conflicts idempotently
              </p>
            </div>
          </div>

          <div className="p-3.5 bg-navy-950 border border-navy-800 rounded text-xs font-mono text-slate-300 leading-relaxed">
            {reconcileResult.description}
          </div>

          {reconcileResult.reconciled_conflicts?.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-mono text-cyan uppercase font-bold block">
                Conflict Resolutions & Assignment Audit:
              </span>
              {reconcileResult.reconciled_conflicts.map((c, i) => (
                <div key={i} className="p-3 bg-navy-950 border border-navy-800 rounded text-xs font-mono space-y-1">
                  <div className="text-amber-400 font-bold uppercase">{c.conflict_type}</div>
                  <p className="text-slate-300">{c.resolution}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Auditable Partition & Sync History */}
      <div className="bg-navy-900 border border-navy-800 rounded-sm p-6 space-y-3 shadow-xl">
        <h3 className="font-heading font-bold text-sm text-slate-100 uppercase tracking-wide">
          Sync Event Audit History ({auditLog.length})
        </h3>
        <div className="space-y-2 max-h-60 overflow-y-auto font-mono text-xs">
          {auditLog.map((ev, i) => (
            <div key={i} className="p-2.5 bg-navy-950 border border-navy-800 rounded flex items-center justify-between">
              <div>
                <span className="text-cyan font-bold mr-2">[{ev.type}]</span>
                <span className="text-slate-300">{ev.description}</span>
              </div>
              <span className="text-[10px] text-slate-500 whitespace-nowrap ml-4">
                {ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : ''}
              </span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
