import React, { useState } from 'react';
import { X, Zap, RefreshCw, Flame, Waves, HeartPulse, Building2, Check } from 'lucide-react';
import { spawnSimulationScenario, resetSimulation } from '../services/api';

export default function GodModeModal({ isOpen, onClose, onRefreshData }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  if (!isOpen) return null;

  const handleSpawn = async (scenario) => {
    setLoading(true);
    setMessage('');
    try {
      const res = await spawnSimulationScenario(scenario);
      setMessage(`Successfully spawned: ${scenario.toUpperCase()} crisis scenario.`);
      if (onRefreshData) onRefreshData();
    } catch (err) {
      setMessage(`Spawn error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setLoading(true);
    setMessage('');
    try {
      await resetSimulation();
      setMessage('Tactical simulation reset to operational baseline.');
      if (onRefreshData) onRefreshData();
    } catch (err) {
      setMessage(`Reset error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-auto flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white border border-tactical-border w-full max-w-lg rounded-sm shadow-2xl overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="px-6 py-4 bg-[#553a34] text-white flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Zap className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="font-heading font-bold text-base uppercase tracking-wider">
                GOD MODE · Tactical Simulator
              </h2>
              <p className="text-[11px] text-espresso-200 font-mono">
                System stress testing & entity spawner
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-espresso-300 hover:text-white p-1 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          
          {message && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-sm flex items-center space-x-2 font-mono">
              <Check className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{message}</span>
            </div>
          )}

          <div>
            <h4 className="font-heading font-bold text-xs uppercase text-espresso-700 mb-2 tracking-wide">
              Spawn Crisis Scenario on Map
            </h4>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => handleSpawn('flood')}
                disabled={loading}
                className="p-3 bg-parchment hover:bg-white border border-tactical-border hover:border-blue-400 rounded-sm text-left transition flex items-center space-x-3"
              >
                <Waves className="w-5 h-5 text-blue-600 shrink-0" />
                <div>
                  <div className="font-bold text-xs text-espresso uppercase">Flash Flood</div>
                  <div className="text-[10px] text-espresso-500 font-mono">22 affected · Ward 12</div>
                </div>
              </button>

              <button
                onClick={() => handleSpawn('fire')}
                disabled={loading}
                className="p-3 bg-parchment hover:bg-white border border-tactical-border hover:border-orange-400 rounded-sm text-left transition flex items-center space-x-3"
              >
                <Flame className="w-5 h-5 text-orange-600 shrink-0" />
                <div>
                  <div className="font-bold text-xs text-espresso uppercase">Industrial Fire</div>
                  <div className="text-[10px] text-espresso-500 font-mono">12 affected · Sector 9</div>
                </div>
              </button>

              <button
                onClick={() => handleSpawn('medical')}
                disabled={loading}
                className="p-3 bg-parchment hover:bg-white border border-tactical-border hover:border-red-400 rounded-sm text-left transition flex items-center space-x-3"
              >
                <HeartPulse className="w-5 h-5 text-red-600 shrink-0" />
                <div>
                  <div className="font-bold text-xs text-espresso uppercase">Mass Medical</div>
                  <div className="text-[10px] text-espresso-500 font-mono">15 affected · Transit Camp</div>
                </div>
              </button>

              <button
                onClick={() => handleSpawn('earthquake')}
                disabled={loading}
                className="p-3 bg-parchment hover:bg-white border border-tactical-border hover:border-amber-400 rounded-sm text-left transition flex items-center space-x-3"
              >
                <Building2 className="w-5 h-5 text-amber-600 shrink-0" />
                <div>
                  <div className="font-bold text-xs text-espresso uppercase">Quake Collapse</div>
                  <div className="text-[10px] text-espresso-500 font-mono">6 trapped · Heavy gear</div>
                </div>
              </button>
            </div>
          </div>

          <div className="border-t border-tactical-border pt-4">
            <h4 className="font-heading font-bold text-xs uppercase text-espresso-700 mb-2 tracking-wide">
              Reset System Data
            </h4>
            <p className="text-xs text-espresso-600 mb-3 font-sans">
              Restores initial seed depots, clean vehicles, and baseline incidents for reproducible demonstrations.
            </p>
            <button
              onClick={handleReset}
              disabled={loading}
              className="px-4 py-2 bg-espresso-100 hover:bg-espresso-200 text-espresso font-mono text-xs uppercase rounded-sm border border-tactical-border transition flex items-center space-x-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Reset to Operational Baseline</span>
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
