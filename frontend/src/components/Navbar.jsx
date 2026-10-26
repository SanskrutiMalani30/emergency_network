import React from 'react';
import {
  Shield,
  Radio,
  MapPin,
  Users,
  Inbox,
  RefreshCw,
  Activity,
  Wifi,
  WifiOff,
  User,
  AlertTriangle,
  Mic,
  ArrowLeft
} from 'lucide-react';

export default function Navbar({
  metrics,
  health,
  currentTab,
  onSelectTab,
  onRefreshAll,
  outboxCount = 0,
  onOpenOutbox,
  onOpenProfile,
  currentUser = null,
  onLogout,
  onDiscreetTap,
  isVoiceActive = false,
  gestureTestFeedback = null,
  onBackToSafePath = null
}) {
  const isPartitioned = metrics?.is_partitioned;
  const dbConnected = health?.database?.connected;

  const initials = (currentUser?.display_name || 'Amulya Yadav')
    .trim()
    .split(/\s+/)
    .map(n => n ? n[0] : '')
    .join('')
    .substring(0, 2)
    .toUpperCase() || 'AY';

  // Exactly two primary navigation tabs for Command Center:
  const tabs = [
    { id: 'operations', label: 'Operations & Map', icon: MapPin },
    { id: 'responders', label: 'Responders & Match', icon: Users },
  ];

  return (
    <header className="bg-white border-b border-[#D0E6FC] text-[#102B4E] sticky top-0 z-[1000] shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        
        {/* Main Header Bar */}
        <div className="flex items-center justify-between h-16">
          
          <div className="flex items-center space-x-3">
            {/* Return to SafePath 1-Second View */}
            {onBackToSafePath && (
              <button
                type="button"
                onClick={onBackToSafePath}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-[#1B6B57] text-white hover:bg-[#165646] active:bg-[#12483A] text-xs font-bold transition shadow-xs"
                title="Return to SafePath Home"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>SafePath</span>
              </button>
            )}

            {/* Brand & Team Logo with Click / Tap SOS Trigger */}
            <button
              type="button"
              onClick={onDiscreetTap}
              className="flex items-center space-x-3 cursor-pointer select-none active:scale-95 transition group text-left focus:outline-none"
              title="Click SafePath / RESQMesh Logo to Trigger Emergency SOS"
            >
              <div className="w-10 h-10 rounded-xl bg-[#EAF5FF] border border-[#B6D9FB] flex items-center justify-center text-[#168BFA] shadow-xs group-hover:border-[#168BFA] group-hover:bg-[#DDF0FF] transition">
                <Shield className="w-5 h-5 text-[#168BFA] group-hover:scale-110 transition-transform" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-heading font-black text-lg tracking-tight text-[#102B4E]">
                    Safe<span className="text-[#1B6B57]">Path</span>
                  </span>
                  <span className="bg-[#EAF5FF] text-[#168BFA] border border-[#B6D9FB] text-[10px] font-mono px-2 py-0.5 rounded-full font-bold">
                    MESH '26
                  </span>
                </div>
                <p className="text-[11px] text-[#627D98] font-sans hidden sm:block">
                  Human-Powered Emergency Response Network
                </p>
              </div>
            </button>
          </div>

          {/* Center Navigation Tabs (Exactly 2 Tabs) */}
          <nav className="flex items-center space-x-1.5 bg-[#EAF5FF] p-1 rounded-xl border border-[#D0E6FC]">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = currentTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onSelectTab(tab.id)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-heading font-bold transition-all flex items-center space-x-2 ${
                    isActive
                      ? 'bg-white text-[#168BFA] shadow-sm border border-[#D0E6FC]'
                      : 'text-[#627D98] hover:text-[#102B4E] hover:bg-white/60'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-[#168BFA]' : 'text-[#627D98]'}`} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Right Status Controls & Profile */}
          <div className="flex items-center space-x-2 sm:space-x-3 text-xs">
            
            {/* Mesh / Network Connection Status Pill */}
            <div className={`hidden md:flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-mono font-medium ${
              isPartitioned
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : 'bg-[#EAF5FF] border-[#D0E6FC] text-[#168BFA]'
            }`}>
              <span className={`w-2 h-2 rounded-full ${isPartitioned ? 'bg-amber-500 animate-pulse' : 'bg-[#168BFA]'}`} />
              <span>{isPartitioned ? 'PARTITIONED MESH' : 'MESH ONLINE (6 PEERS)'}</span>
            </div>

            {/* Offline Outbox Queue Pill */}
            <button
              onClick={onOpenOutbox}
              className={`px-2.5 py-1.5 rounded-lg border flex items-center space-x-1.5 text-xs font-mono font-bold transition shadow-2xs ${
                outboxCount > 0
                  ? 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                  : 'bg-[#EAF5FF] text-[#102B4E] border-[#D0E6FC] hover:bg-[#DDF0FF]'
              }`}
              title="View persistent offline outbox queue"
            >
              <Inbox className="w-3.5 h-3.5 text-[#168BFA]" />
              <span className="hidden sm:inline">OUTBOX:</span>
              <span className={outboxCount > 0 ? 'text-amber-700 font-black' : 'text-[#627D98]'}>
                {outboxCount > 0 ? `${outboxCount} PENDING` : 'SYNCED'}
              </span>
            </button>

            {/* Telemetry Refresh */}
            <button
              onClick={onRefreshAll}
              className="p-2 rounded-lg text-[#627D98] hover:text-[#168BFA] hover:bg-[#EAF5FF] transition"
              title="Refresh telemetry"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            {/* Voice SOS Listening Status Indicator */}
            {isVoiceActive && (
              <div
                className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-lg text-[10px] font-mono font-bold animate-pulse"
                title="Voice SOS Listening Active — say 'Help', 'Help me', or 'Bachao' to trigger alert"
              >
                <Mic className="w-3 h-3 text-emerald-600 animate-bounce" />
                <span>VOICE SOS ON</span>
              </div>
            )}

            {/* Gesture Safe Test Mode Alert */}
            {gestureTestFeedback && (
              <div
                className="flex items-center space-x-1.5 px-2.5 py-1 bg-amber-100 border border-amber-300 text-amber-900 rounded-lg text-[10px] font-mono font-bold animate-in fade-in"
                title="Multi-tap gesture verified in safe test mode"
              >
                <Shield className="w-3 h-3 text-amber-700" />
                <span>GESTURE OK ({gestureTestFeedback.tapCount} TAPS)</span>
              </div>
            )}

            {/* User Profile Avatar */}
            <button
              onClick={onOpenProfile}
              className="flex items-center space-x-2 p-1 pl-2 pr-2.5 rounded-lg hover:bg-[#EAF5FF] border border-transparent hover:border-[#D0E6FC] transition"
              title="View responder profile"
            >
              <div className="w-8 h-8 rounded-full bg-[#168BFA] text-white flex items-center justify-center font-heading font-black text-xs shadow-xs">
                {initials}
              </div>
              <div className="text-left hidden lg:block">
                <div className="font-heading font-bold text-xs text-[#102B4E]">
                  {currentUser?.display_name || 'Amulya Yadav'}
                </div>
                <div className="text-[10px] text-[#627D98] font-mono leading-none capitalize">
                  {currentUser?.role || 'Field Operator'}
                </div>
              </div>
            </button>

          </div>

        </div>

      </div>
    </header>
  );
}
