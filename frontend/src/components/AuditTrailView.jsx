import React, { useState } from 'react';
import { Cpu, Search, Filter, Clock, ShieldAlert, CheckCircle, Radio } from 'lucide-react';

export default function AuditTrailView({ events = [] }) {
  const [filterType, setFilterType] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = events.filter((ev) => {
    if (filterType !== 'ALL' && !ev.event_type?.toUpperCase().includes(filterType.toUpperCase())) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        ev.title?.toLowerCase().includes(q) ||
        ev.details?.toLowerCase().includes(q) ||
        ev.actor?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 bg-navy-950 font-sans space-y-4">
      
      <div className="bg-navy-900 border border-navy-800 rounded-sm p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Cpu className="w-5 h-5 text-cyan" />
            <div>
              <h2 className="font-heading font-bold text-base text-slate-100 uppercase tracking-wide">
                Tactical Audit Trail & Telemetry Replay
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Immutable, auditable log of emergency states, dispatches & mesh reconciliations
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-cyan bg-cyan/10 border border-cyan/30 px-2 py-0.5 rounded">
            {filtered.length} EVENTS RECORDED
          </span>
        </div>

        {/* Filters & Search */}
        <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search audit trail by actor, event, or incident..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-navy-950 border border-navy-700 rounded text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan"
            />
          </div>

          <div className="flex items-center space-x-1 font-mono text-[11px] overflow-x-auto w-full sm:w-auto">
            {['ALL', 'INTAKE', 'DISPATCH', 'STATUS', 'MESH', 'SECURITY'].map(t => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-2.5 py-1 rounded uppercase transition border ${
                  filterType === t
                    ? 'bg-cyan text-navy-950 border-cyan font-bold'
                    : 'bg-navy-950 text-slate-400 border-navy-700 hover:text-slate-200'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Events List */}
      <div className="space-y-2.5 font-mono text-xs">
        {filtered.map((ev, i) => (
          <div
            key={ev.event_id || i}
            className="p-3.5 bg-navy-900 border border-navy-800 rounded-sm hover:border-navy-700 transition flex flex-col sm:flex-row sm:items-center justify-between gap-2"
          >
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 rounded text-[10px] bg-navy-950 border border-cyan/40 text-cyan font-bold uppercase">
                  {ev.event_type}
                </span>
                <span className="text-slate-100 font-bold">{ev.title}</span>
              </div>
              <p className="text-slate-400 font-sans text-xs leading-relaxed">
                {ev.details}
              </p>
              <div className="text-[10px] text-slate-500">
                Actor: <span className="text-slate-300">{ev.actor}</span>
              </div>
            </div>

            <div className="text-right text-[11px] text-slate-500 shrink-0">
              {ev.event_time ? new Date(ev.event_time).toLocaleTimeString() : 'Recent'}
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
