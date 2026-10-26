import React, { useState, useEffect } from 'react';
import { 
  X, Map, Download, CheckCircle2, Trash2, HardDrive, 
  Layers, AlertCircle, RefreshCw, Radio, Globe
} from 'lucide-react';
import { 
  DEFAULT_TACTICAL_BOUNDS, 
  downloadTacticalAreaTiles, 
  getCachedTileStats, 
  clearCachedTiles 
} from '../services/offlineMapService';

export default function OfflineMapManagerModal({ isOpen, onClose }) {
  const [stats, setStats] = useState({ count: 0, totalBytes: 0 });
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0, percent: 0, currentZoom: 13, status: '' });
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadStats();
    }
  }, [isOpen]);

  const loadStats = async () => {
    try {
      const s = await getCachedTileStats();
      setStats(s);
    } catch (e) {
      console.warn('Failed to load tile stats:', e);
    }
  };

  const handleStartDownload = async () => {
    setIsDownloading(true);
    setDownloadSuccess(false);
    setProgress({ completed: 0, total: 0, percent: 0, currentZoom: 13, status: 'starting' });

    try {
      await downloadTacticalAreaTiles({
        bounds: DEFAULT_TACTICAL_BOUNDS,
        minZoom: 13,
        maxZoom: 15
      }, (p) => {
        setProgress(p);
      });

      setDownloadSuccess(true);
      await loadStats();
    } catch (err) {
      console.error('Download offline map tiles error:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleClear = async () => {
    if (!window.confirm('Clear all offline cached map tiles? You will need an internet connection to re-download them.')) {
      return;
    }
    setClearing(true);
    try {
      await clearCachedTiles();
      await loadStats();
      setDownloadSuccess(false);
    } catch (e) {
      console.error('Failed to clear tiles:', e);
    } finally {
      setClearing(false);
    }
  };

  if (!isOpen) return null;

  const formatSize = (bytes) => {
    if (!bytes) return '0 KB';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-auto flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white border border-[#D0E6FC] w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="px-5 py-4 bg-[#EAF5FF] border-b border-[#D0E6FC] flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-[#168BFA] text-white rounded-xl shadow-xs">
              <Map className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-[#102B4E]">
                Offline Map Area Manager
              </h3>
              <p className="text-xs text-slate-500">
                Pre-cache disaster sector tiles for 100% offline navigation
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          
          {/* Storage Cache Summary Card */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs font-bold text-slate-700">
                <HardDrive className="w-4 h-4 text-[#168BFA]" />
                <span>IndexedDB Map Tile Cache</span>
              </div>
              <button
                onClick={loadStats}
                className="text-slate-500 hover:text-[#168BFA] p-1 rounded transition"
                title="Refresh stats"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white p-3 rounded-lg border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Cached Tiles</span>
                <div className="text-xl font-extrabold text-[#102B4E] mt-0.5">
                  {stats.count} <span className="text-xs font-normal text-slate-500">tiles</span>
                </div>
              </div>
              <div className="bg-white p-3 rounded-lg border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Storage Used</span>
                <div className="text-xl font-extrabold text-[#102B4E] mt-0.5">
                  {formatSize(stats.totalBytes)}
                </div>
              </div>
            </div>

            {stats.count > 0 ? (
              <div className="flex items-center space-x-1.5 text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Offline map ready. Tiles will load instantly without cellular or internet.</span>
              </div>
            ) : (
              <div className="flex items-center space-x-1.5 text-xs text-amber-700 bg-amber-50 px-2.5 py-1.5 rounded-lg border border-amber-200">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>No tiles pre-cached yet. Download sector below before going into field.</span>
              </div>
            )}
          </div>

          {/* Sector Details */}
          <div className="bg-[#EAF5FF] border border-[#D0E6FC] p-4 rounded-xl text-xs space-y-1.5 text-slate-700">
            <div className="font-bold text-[#102B4E] flex items-center space-x-1.5">
              <Layers className="w-4 h-4 text-[#168BFA]" />
              <span>Target Sector: {DEFAULT_TACTICAL_BOUNDS.name}</span>
            </div>
            <div className="text-slate-600">
              Center: {DEFAULT_TACTICAL_BOUNDS.center[0]}°N, {DEFAULT_TACTICAL_BOUNDS.center[1]}°E
            </div>
            <div className="text-slate-600">
              Zoom Levels: 13, 14, 15 (Street level, neighborhood & transit corridors)
            </div>
          </div>

          {/* Download Progress Bar */}
          {isDownloading && (
            <div className="space-y-2 p-3 bg-white border border-[#D0E6FC] rounded-xl">
              <div className="flex justify-between text-xs font-bold text-[#102B4E]">
                <span>Downloading Tactical Tiles (Zoom {progress.currentZoom})...</span>
                <span>{progress.percent}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                <div 
                  className="bg-[#168BFA] h-2.5 rounded-full transition-all duration-200"
                  style={{ width: `${progress.percent}%` }}
                ></div>
              </div>
              <div className="text-[11px] text-slate-500 flex justify-between">
                <span>{progress.completed} of {progress.total} tiles</span>
                <span>Saving to browser storage</span>
              </div>
            </div>
          )}

          {downloadSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Tactical area successfully cached! Fully functional in offline mode.</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
            <button
              onClick={handleStartDownload}
              disabled={isDownloading}
              className="flex-1 py-2.5 px-4 bg-[#168BFA] hover:bg-[#1277d6] text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              {isDownloading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Downloading Sector...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Download Sector (Zoom 13-15)</span>
                </>
              )}
            </button>

            {stats.count > 0 && (
              <button
                onClick={handleClear}
                disabled={clearing || isDownloading}
                className="py-2.5 px-4 bg-white hover:bg-rose-50 border border-rose-200 text-rose-600 font-semibold text-xs rounded-xl transition flex items-center justify-center space-x-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Clear Cache</span>
              </button>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-between items-center text-xs text-slate-500">
          <span>Works 100% offline via IndexedDB</span>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg font-medium transition"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
}
