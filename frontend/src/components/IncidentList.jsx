import React, { useState } from 'react';
import { AlertTriangle, Clock, MapPin, Users, Plus, Filter, Search, ArrowRight } from 'lucide-react';

export default function IncidentList({
  incidents = [],
  selectedIncident,
  onSelectIncident,
  onOpenReport
}) {
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const categories = ['ALL', 'flood', 'medical', 'fire', 'structural', 'supplies'];
  const statuses = ['ALL', 'PENDING', 'VERIFIED', 'DISPATCHED', 'RESOLVED'];

  const filtered = incidents.filter((inc) => {
    if (filterCategory !== 'ALL' && inc.category.toLowerCase() !== filterCategory.toLowerCase()) {
      return false;
    }
    if (filterStatus !== 'ALL' && inc.status.toUpperCase() !== filterStatus.toUpperCase()) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        inc.description.toLowerCase().includes(q) ||
        inc.category.toLowerCase().includes(q) ||
        inc.severity.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getSeverityBadge = (severity) => {
    switch (severity?.toLowerCase()) {
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'high':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-300';
    }
  };

  const getStatusBadge = (status) => {
    switch (status?.toUpperCase()) {
      case 'PENDING':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'VERIFIED':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'DISPATCHED':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'RESOLVED':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <div className="flex flex-col h-full bg-parchment border-r border-tactical-border overflow-hidden">
      
      {/* Top Header & Search Bar */}
      <div className="p-4 border-b border-tactical-border bg-white shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-heading font-bold text-lg text-espresso uppercase tracking-tight">
              Live Archive
            </h2>
            <p className="text-xs text-espresso-500 font-mono">
              Real-time Tactical Event Stream ({filtered.length} active)
            </p>
          </div>
          <button
            onClick={onOpenReport}
            className="bg-[#553a34] hover:bg-[#422d29] text-white text-xs font-semibold px-3 py-2 rounded-sm shadow flex items-center space-x-1.5 transition uppercase tracking-wider"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Deploy Signal</span>
          </button>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-espresso-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search incident details, keyword, tag..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-parchment rounded-sm border border-tactical-border focus:outline-none focus:border-espresso text-espresso placeholder-espresso-400"
          />
        </div>

        {/* Category Filter Chips */}
        <div className="flex items-center space-x-1 overflow-x-auto pb-1 text-[11px]">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-2.5 py-1 rounded-sm uppercase font-mono tracking-wider whitespace-nowrap transition border ${
                filterCategory === cat
                  ? 'bg-espresso text-white border-espresso'
                  : 'bg-white text-espresso-600 border-tactical-border hover:bg-parchment'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Incident Cards Scrollable Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {filtered.length === 0 ? (
          <div className="text-center py-12 px-4">
            <AlertTriangle className="w-8 h-8 text-espresso-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-espresso-700">No incidents in view</p>
            <p className="text-xs text-espresso-500 mt-1">Pan or zoom out to discover, or submit a new signal.</p>
          </div>
        ) : (
          filtered.map((inc) => {
            const isSelected = selectedIncident?.incident_id === inc.incident_id;

            return (
              <div
                key={inc.incident_id}
                onClick={() => onSelectIncident(inc)}
                className={`tactical-card p-3 rounded-sm cursor-pointer border ${
                  isSelected
                    ? 'border-espresso bg-espresso-50/40 shadow-sm ring-1 ring-espresso'
                    : 'border-tactical-border bg-white hover:border-espresso-400'
                }`}
              >
                {/* Status and Category row */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center space-x-1.5">
                    <span className="font-mono font-bold text-xs uppercase text-espresso">
                      {inc.category}
                    </span>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${getStatusBadge(inc.status)}`}>
                      {inc.status}
                    </span>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${getSeverityBadge(inc.severity)}`}>
                    {inc.severity.toUpperCase()}
                  </span>
                </div>

                {/* Description Snippet */}
                <p className="text-xs text-espresso-800 line-clamp-2 mb-2 leading-relaxed font-sans">
                  {inc.description}
                </p>

                {/* Telemetry Footer */}
                <div className="flex items-center justify-between text-[11px] text-espresso-500 pt-2 border-t border-tactical-border/60 font-mono">
                  <div className="flex items-center space-x-1">
                    <Users className="w-3.5 h-3.5 text-espresso-400" />
                    <span>{inc.people_affected} affected</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <MapPin className="w-3.5 h-3.5 text-espresso-400" />
                    <span>{inc.lat.toFixed(3)}, {inc.lng.toFixed(3)}</span>
                  </div>
                  <div className="text-rust font-semibold flex items-center space-x-0.5">
                    <span>TRACK</span>
                    <ArrowRight className="w-3 h-3" />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

    </div>
  );
}
