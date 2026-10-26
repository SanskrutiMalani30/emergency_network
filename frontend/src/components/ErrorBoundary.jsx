import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Tactical Dashboard Caught Runtime Exception:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleResetState = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full flex items-center justify-center p-4 bg-[#F4FAFF] text-[#102B4E]">
          <div className="bg-white border border-[#D0E6FC] rounded-2xl p-6 max-w-lg w-full shadow-xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-[#102B4E]">
                Tactical Interface Recovery
              </h2>
              <p className="text-xs text-[#627D98] leading-relaxed">
                A non-critical rendering anomaly was caught and isolated to prevent app termination. Your offline data and distress reports remain safely stored in IndexedDB.
              </p>
            </div>

            {this.state.error && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-left text-xs font-mono text-slate-700 max-h-36 overflow-y-auto">
                <span className="font-bold text-rose-600">Error:</span> {this.state.error.toString()}
              </div>
            )}

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={this.handleResetState}
                className="flex-1 py-2 px-3 bg-[#EAF5FF] hover:bg-[#DDF0FF] text-[#168BFA] font-bold text-xs rounded-xl border border-[#B6D9FB] transition"
              >
                Attempt In-Place Recovery
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 py-2 px-3 bg-[#168BFA] hover:bg-[#1277d6] text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center space-x-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reload Dashboard</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
