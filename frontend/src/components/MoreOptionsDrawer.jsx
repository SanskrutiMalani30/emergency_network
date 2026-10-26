import React from 'react';
import {
  X,
  Map,
  AlertTriangle,
  FileText,
  Radio,
  Users,
  ShieldAlert,
  Settings,
  Inbox,
  Activity,
  Mic,
  ChevronRight,
  Database,
  ArrowLeft
} from 'lucide-react';

export default function MoreOptionsDrawer({
  isOpen,
  onClose,
  onSelectAction,
  outboxCount = 0,
  isVoiceActive = false,
  emergenciesCount = 0,
  hazardsCount = 0,
  respondersCount = 0
}) {
  if (!isOpen) return null;

  const sections = [
    {
      title: 'Emergency Response Tools',
      items: [
        {
          id: 'operations_map',
          label: 'Tactical Map & Safe Routes',
          sub: 'Live hazard overlays, shelter routing & offline tiles',
          icon: Map,
          badge: `${hazardsCount} Hazards`,
          color: 'text-[#1B6B57] bg-[#1B6B57]/10'
        },
        {
          id: 'incident_feed',
          label: 'Active Incident Feed',
          sub: 'Verified reports, priority filters & triage',
          icon: AlertTriangle,
          badge: `${emergenciesCount} Active`,
          color: 'text-amber-600 bg-amber-50'
        },
        {
          id: 'intake_form',
          label: 'Report Incident (Detailed SOS)',
          sub: 'Voice recording, live transcription & photo',
          icon: FileText,
          badge: isVoiceActive ? 'Voice SOS On' : null,
          color: 'text-blue-600 bg-blue-50'
        },
        {
          id: 'mesh_network',
          label: 'BLE Multi-Hop Mesh Network',
          sub: 'Offline packet propagation & hop tracking',
          icon: Radio,
          badge: outboxCount > 0 ? `${outboxCount} Outbox` : 'Mesh OK',
          color: 'text-purple-600 bg-purple-50'
        }
      ]
    },
    {
      title: 'Coordination & Verification',
      items: [
        {
          id: 'responders',
          label: 'Responders & Mutual Aid',
          sub: 'Field volunteer dispatch & capacity matching',
          icon: Users,
          badge: `${respondersCount} Ready`,
          color: 'text-emerald-600 bg-emerald-50'
        },
        {
          id: 'verification_protocol',
          label: 'Claim Verification Protocol',
          sub: 'Multi-stage consensus & trust scoring engine',
          icon: ShieldAlert,
          color: 'text-indigo-600 bg-indigo-50'
        },
        {
          id: 'audit_trail',
          label: 'Tactical Audit Trail',
          sub: 'Cryptographic ledger of all emergency events',
          icon: Activity,
          color: 'text-slate-600 bg-slate-100'
        }
      ]
    },
    {
      title: 'Configuration & Settings',
      items: [
        {
          id: 'profile',
          label: 'Profile & Emergency Contacts',
          sub: 'Manage cellular SMS recipient & responder ID',
          icon: Settings,
          color: 'text-slate-700 bg-slate-100'
        },
        {
          id: 'offline_map_manager',
          label: 'Offline Map Cache Manager',
          sub: 'Download and inspect cached map tiles for zero-network use',
          icon: Database,
          color: 'text-teal-600 bg-teal-50'
        },
        {
          id: 'outbox',
          label: 'Offline Outbox Sync',
          sub: 'View stored unsent reports awaiting gateway upload',
          icon: Inbox,
          badge: `${outboxCount} Pending`,
          color: 'text-amber-700 bg-amber-50'
        }
      ]
    },
    {
      title: 'Advanced Diagnostic Simulators',
      items: [
        {
          id: 'partition',
          label: 'Mesh Partition Simulator',
          sub: 'Test network split-brain reconciliation',
          icon: Radio,
          color: 'text-cyan-700 bg-cyan-50'
        },
        {
          id: 'attack_lab',
          label: 'Red Team Attack Lab',
          sub: 'Simulate sybil, replay & spoofing attacks',
          icon: ShieldAlert,
          color: 'text-rose-700 bg-rose-50'
        },
        {
          id: 'responder_mobile',
          label: 'Field Responder Handset View',
          sub: 'Compact responder terminal interface',
          icon: Users,
          color: 'text-blue-700 bg-blue-50'
        },
        {
          id: 'privacy',
          label: 'Privacy Relay Simulator',
          sub: 'Onion routing and metadata obfuscation',
          icon: Activity,
          color: 'text-purple-700 bg-purple-50'
        }
      ]
    }
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="more-options-title"
      className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
    >
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl max-w-lg w-full max-h-[88vh] flex flex-col overflow-hidden border border-slate-200 text-slate-900 font-sans">
        
        {/* Drawer Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div>
            <h3 id="more-options-title" className="font-heading font-black text-base text-slate-900">
              More Options & Features
            </h3>
            <p className="text-xs text-slate-500">
              Complete emergency network tools & command controls
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close options"
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-200/60 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-5">
          {sections.map((sec, secIdx) => (
            <div key={secIdx} className="space-y-2">
              <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider px-1">
                {sec.title}
              </h4>

              <div className="space-y-1.5">
                {sec.items.map(item => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onClose();
                        onSelectAction(item.id);
                      }}
                      className="w-full p-2.5 sm:p-3 rounded-xl border border-slate-200/80 hover:border-[#1B6B57]/40 hover:bg-slate-50 active:bg-slate-100 flex items-center justify-between text-left transition group"
                    >
                      <div className="flex items-center space-x-3 min-w-0 mr-2">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${item.color}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <strong className="text-xs sm:text-sm text-slate-800 font-bold block leading-tight group-hover:text-[#1B6B57] transition">
                            {item.label}
                          </strong>
                          <span className="text-[11px] text-slate-500 block truncate mt-0.5">
                            {item.sub}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        {item.badge && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {item.badge}
                          </span>
                        )}
                        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-[#1B6B57] group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Drawer Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>SafePath Network Core v2.4</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 font-bold text-slate-700 hover:underline"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
