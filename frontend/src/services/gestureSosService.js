/**
 * RESQMesh — Hidden Multi-Tap SOS Gesture Service
 *
 * Detects discreet multi-taps (default: 5 taps in 2 seconds) on designated interactive UI elements.
 * Features safe "Test Mode" to verify gesture execution without sending actual emergency alerts.
 */

const STORAGE_KEY = 'resqmesh_gesture_sos_config';

const getStorage = () => (typeof window !== 'undefined' ? window.localStorage : (typeof globalThis !== 'undefined' ? globalThis.localStorage : null));

export const DEFAULT_GESTURE_CONFIG = {
  enabled: true,
  tapCount: 1, // Clicking/tapping the logo triggers the emergency SOS workflow!
  timeWindowMs: 2000,
  testMode: false
};

class GestureSosService {
  constructor() {
    this.taps = [];
    this.lastTriggerTime = 0;
    this.debounceMs = 5000;
    this.listeners = new Set();
    this.config = this._loadConfig();
  }

  _loadConfig() {
    try {
      const storage = getStorage();
      if (storage) {
        const stored = storage.getItem(STORAGE_KEY);
        if (stored) {
          return { ...DEFAULT_GESTURE_CONFIG, ...JSON.parse(stored) };
        }
      }
    } catch (e) {
      console.warn('Error reading gesture SOS config:', e);
    }
    return { ...DEFAULT_GESTURE_CONFIG };
  }

  saveConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    try {
      const storage = getStorage();
      if (storage) {
        storage.setItem(STORAGE_KEY, JSON.stringify(this.config));
      }
    } catch (e) {
      console.warn('Error saving gesture config:', e);
    }
    this._notifyListeners('CONFIG_CHANGED', this.config);
  }

  recordTap() {
    if (!this.config.enabled) return;

    const now = Date.now();
    if (now - this.lastTriggerTime < this.debounceMs) {
      return; // In debounce cooldown
    }

    // Prune taps older than time window
    const windowStart = now - (this.config.timeWindowMs || DEFAULT_GESTURE_CONFIG.timeWindowMs);
    this.taps = this.taps.filter(t => t >= windowStart);
    this.taps.push(now);

    const requiredTaps = this.config.tapCount || DEFAULT_GESTURE_CONFIG.tapCount;
    if (this.taps.length >= requiredTaps) {
      const durationMs = this.taps[this.taps.length - 1] - this.taps[0];
      this.taps = []; // Reset tap buffer
      this.lastTriggerTime = now;

      if (this.config.testMode) {
        this._notifyListeners('TEST_TRIGGERED', {
          source: 'GESTURE_TEST',
          tapCount: requiredTaps,
          durationMs,
          timestamp: new Date().toISOString()
        });
      } else {
        this._notifyListeners('EMERGENCY_TRIGGERED', {
          source: 'GESTURE',
          tapCount: requiredTaps,
          durationMs,
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _notifyListeners(event, payload) {
    this.listeners.forEach(fn => {
      try { fn(event, payload); } catch (e) {}
    });
  }
}

export const gestureSosService = new GestureSosService();
