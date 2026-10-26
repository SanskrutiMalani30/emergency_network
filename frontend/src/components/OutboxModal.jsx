import React, { useState, useEffect } from 'react';
import { X, Send, RefreshCw, Trash2, CheckCircle2, Clock, AlertTriangle, Radio, Volume2, ShieldCheck } from 'lucide-react';
import { getOutboxReports, updateOutboxItem, deleteOutboxItem, syncOutboxWithServer } from '../services/offlineStorage';
import { syncOutboxBatch } from '../services/api';

export default function OutboxModal({ isOpen, onClose, onSyncComplete }) {
  const [reports, setReports] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  useEffect(() => {
    if (isOpen) {
      loadReports();
    }
  }, [isOpen]);

  const loadReports = async () => {
    const list = await getOutboxReports();
    setReports(list);
  };

  if (!isOpen) return null;

  const handleSyncAll = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await syncOutboxWithServer(syncOutboxBatch);
      setSyncResult(res);
      await loadReports();
      if (onSyncComplete) onSyncComplete();
    } catch (err) {
      setSyncResult({ error: err.message });
    } finally {
      setSyncing(false);
    }
  };

  const handleClearAcknowledged = async () => {
    const acked = reports.filter(r => r.status === 'ACKNOWLEDGED');
    for (const a of acked) {
      await deleteOutboxItem(a.client_message_id);
    }
    await loadReports();
    if (onSyncComplete) onSyncComplete();
  };

  const handleDeleteItem = async (client_message_id) => {
    await deleteOutboxItem(client_message_id);
    await loadReports();
    if (onSyncComplete) onSyncComplete();
  };

  const handleRetryItem = async (client_message_id) => {
    await updateOutboxItem(client_message_id, { status: 'QUEUED', retry_count: 0 });
    await loadReports();
    handleSyncAll();
  };

  const queuedCount = reports.filter(r => r.status === 'QUEUED' || r.status === 'LOCAL_ONLY').length;
  const ackCount = reports.filter(r => r.status === 'ACKNOWLEDGED').length;
  const failedCount = reports.filter(r => r.status === 'FAILED').length;

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-navy-900 border border-navy-700 rounded-sm w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-4 bg-navy-950 border-b border-navy-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <Radio className="w-5 h-5 text-cyan animate-pulse" />
            <div>
              <h3 className="font-heading font-bold text-sm text-slate-100 uppercase tracking-wider flex items-center space-x-2">
                <span>Persistent Offline Outbox Queue</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan/15 text-cyan border border-cyan/40">
                  IndexedDB
                </span>
              </h3>
              <p className="text-[11px] font-mono text-slate-400">
                Survives tab close, browser reboot & air-gapped disconnections
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 p-1 rounded hover:bg-navy-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Metrics Bar */}
        <div className="px-4 py-3 bg-navy-950/50 border-b border-navy-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-4 text-xs font-mono">
            <div>
              <span className="text-slate-400">TOTAL: </span>
              <strong className="text-slate-200">{reports.length}</strong>
            </div>
            <div>
              <span className="text-amber-400">QUEUED: </span>
              <strong className="text-amber-300">{queuedCount}</strong>
            </div>
            <div>
              <span className="text-emerald-400">ACKNOWLEDGED: </span>
              <strong className="text-emerald-300">{ackCount}</strong>
            </div>
            {failedCount > 0 && (
              <div>
                <span className="text-emergency-red">FAILED: </span>
                <strong className="text-emergency-red">{failedCount}</strong>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {ackCount > 0 && (
              <button
                type="button"
                onClick={handleClearAcknowledged}
                className="px-2.5 py-1 text-slate-400 hover:text-slate-200 text-[11px] font-mono border border-navy-700 hover:bg-navy-800 rounded transition"
              >
                Clear Acknowledged
              </button>
            )}

            <button
              type="button"
              onClick={handleSyncAll}
              disabled={syncing || queuedCount === 0}
              className="px-3 py-1 bg-cyan/20 hover:bg-cyan/30 disabled:opacity-40 border border-cyan/50 text-cyan rounded text-xs font-mono font-bold flex items-center space-x-1.5 transition shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              <span>{syncing ? 'SYNCING...' : 'SYNC OUTBOX NOW'}</span>
            </button>
          </div>
        </div>

        {/* Sync notification message */}
        {syncResult && (
          <div className={`p-2.5 mx-4 mt-3 rounded text-xs font-mono flex items-center space-x-2 ${
            syncResult.error
              ? 'bg-emergency-red/20 text-emergency-red border border-emergency-red/40'
              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
          }`}>
            {syncResult.error ? (
              <>
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Sync note: {syncResult.error}</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Sync complete: {syncResult.synced} reports delivered/acknowledged by server.</span>
              </>
            )}
          </div>
        )}

        {/* Reports List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {reports.length === 0 ? (
            <div className="text-center py-12 text-slate-500 font-mono text-xs">
              <CheckCircle2 className="w-8 h-8 text-emerald-500/40 mx-auto mb-2" />
              <p>Outbox is empty.</p>
              <p className="text-[11px] text-slate-600 mt-1">All distress reports are fully synchronized with the network.</p>
            </div>
          ) : (
            reports.map((r) => {
              const isAck = r.status === 'ACKNOWLEDGED';
              const isFailed = r.status === 'FAILED';
              const isQueued = r.status === 'QUEUED' || r.status === 'LOCAL_ONLY';

              return (
                <div
                  key={r.client_message_id}
                  className={`p-3.5 rounded border transition space-y-2 text-xs font-mono ${
                    isAck
                      ? 'bg-navy-950/40 border-emerald-500/30 text-slate-300'
                      : isFailed
                      ? 'bg-emergency-red/10 border-emergency-red/40 text-slate-200'
                      : 'bg-navy-950 border-amber-500/40 text-slate-100'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center space-x-2">
                      {/* Delivery Status Badge */}
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        isAck
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : isFailed
                          ? 'bg-emergency-red/20 text-emergency-red border border-emergency-red/50'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/50 animate-pulse'
                      }`}>
                        {r.status}
                      </span>

                      <span className="text-slate-400 text-[10px]">
                        ID: {r.client_message_id.substring(0, 18)}...
                      </span>
                    </div>

                    <div className="flex items-center space-x-2 text-[10px] text-slate-400">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(r.created_at).toLocaleTimeString()}</span>
                      {r.payload?.detected_language && (
                        <span className="px-1.5 py-0.2 bg-navy-800 text-cyan rounded text-[9px] uppercase">
                          {r.payload.detected_language}
                        </span>
                      )}
                      {r.payload?.audio_evidence && (
                        <span className="px-1.5 py-0.2 bg-cyan/15 text-cyan rounded text-[9px] flex items-center space-x-1">
                          <Volume2 className="w-2.5 h-2.5" />
                          <span>AUDIO</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Message body */}
                  <p className="font-sans text-slate-200 text-sm bg-navy-900/60 p-2 rounded border border-navy-800">
                    "{r.payload?.raw_text}"
                  </p>

                  {/* Geolocation & Shareable Map Link */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 bg-navy-900/40 p-2 rounded border border-navy-800/80">
                    <div>
                      <span>
                        Coords: {r.payload?.lat?.toFixed(5)}°N, {r.payload?.lng?.toFixed(5)}°E
                      </span>
                      {r.payload?.location_source && (
                        <span className="ml-2 px-1.5 py-0.2 rounded text-[10px] bg-navy-800 text-cyan font-bold">
                          {r.payload.location_source}
                        </span>
                      )}
                      {r.payload?.location_link && (
                        <a
                          href={r.payload.location_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-cyan underline text-[10px] mt-0.5"
                        >
                          {r.payload.location_link}
                        </a>
                      )}
                    </div>

                    <div className="flex items-center space-x-2">
                      {isFailed && (
                        <button
                          type="button"
                          onClick={() => handleRetryItem(r.client_message_id)}
                          className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded text-[10px] hover:bg-amber-500/30"
                        >
                          RETRY
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDeleteItem(r.client_message_id)}
                        className="text-slate-500 hover:text-emergency-red p-1 rounded"
                        title="Delete from local outbox"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Server acknowledgment confirmation */}
                  {r.server_emergency_id && (
                    <div className="text-[10px] text-emerald-400 flex items-center space-x-1">
                      <ShieldCheck className="w-3 h-3" />
                      <span>Registered on ScyllaDB cluster as: {r.server_emergency_id}</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-navy-950 border-t border-navy-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-navy-800 hover:bg-navy-700 text-slate-200 rounded text-xs font-mono transition"
          >
            CLOSE
          </button>
        </div>

      </div>
    </div>
  );
}
