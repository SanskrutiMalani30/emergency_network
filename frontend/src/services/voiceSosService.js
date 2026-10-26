/**
 * RESQMesh — Voice-Triggered SOS Recognition Service
 *
 * Implements privacy-respecting continuous trigger phrase detection using browser Web Speech API.
 * Trigger phrases in English ("help", "help me"), Hindi ("bachao", "madad karo"), and Hinglish ("emergency", "madad").
 * Transcripts are processed locally in real-time and immediately discarded.
 */

const STORAGE_KEY = 'resqmesh_voice_sos_config';

const getStorage = () => (typeof window !== 'undefined' ? window.localStorage : (typeof globalThis !== 'undefined' ? globalThis.localStorage : null));

export const DEFAULT_VOICE_CONFIG = {
  enabled: false,
  phrases: ['help', 'help me', 'bachao', 'madad karo', 'madad', 'emergency', 'save me'],
  cancellationSeconds: 5,
  language: 'en-IN' // Recognizes Indian English / Hinglish / Hindi
};

class VoiceSosService {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.listeners = new Set();
    this.lastTriggerTime = 0;
    this.debounceMs = 10000; // 10s cooldown between triggers
    this.config = this._loadConfig();
    this.errorState = null;
  }

  _loadConfig() {
    try {
      const storage = getStorage();
      if (storage) {
        const stored = storage.getItem(STORAGE_KEY);
        if (stored) {
          return { ...DEFAULT_VOICE_CONFIG, ...JSON.parse(stored) };
        }
      }
    } catch (e) {
      console.warn('Error reading voice SOS config:', e);
    }
    return { ...DEFAULT_VOICE_CONFIG };
  }

  saveConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    try {
      const storage = getStorage();
      if (storage) {
        storage.setItem(STORAGE_KEY, JSON.stringify(this.config));
      }
    } catch (e) {
      console.warn('Error saving voice SOS config:', e);
    }

    if (this.config.enabled) {
      this.startListening();
    } else {
      this.stopListening();
    }
    this._notifyListeners('CONFIG_CHANGED', this.config);
  }

  isSupported() {
    if (typeof window === 'undefined') return false;
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  startListening() {
    if (!this.isSupported()) {
      this.errorState = 'Speech recognition not supported in this browser.';
      this._notifyListeners('ERROR', { error: this.errorState });
      return false;
    }

    if (this.isListening) return true;

    try {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = this.config.language || 'en-IN';

      this.recognition.onstart = () => {
        this.isListening = true;
        this.errorState = null;
        this._notifyListeners('LISTENING_STARTED');
      };

      this.recognition.onresult = (event) => {
        this._handleSpeechResult(event);
      };

      this.recognition.onerror = (event) => {
        if (event.error === 'not-allowed') {
          this.errorState = 'Microphone permission denied. Please allow microphone access.';
        } else if (event.error !== 'no-speech') {
          this.errorState = `Speech recognition notice: ${event.error}`;
        }
        this._notifyListeners('ERROR', { error: this.errorState });
      };

      this.recognition.onend = () => {
        this.isListening = false;
        // Auto-restart if still enabled
        if (this.config.enabled && !this.errorState) {
          try {
            this.recognition.start();
          } catch (e) {}
        } else {
          this._notifyListeners('LISTENING_STOPPED');
        }
      };

      this.recognition.start();
      return true;
    } catch (err) {
      this.errorState = err.message || 'Failed to start speech recognition.';
      this._notifyListeners('ERROR', { error: this.errorState });
      return false;
    }
  }

  stopListening() {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {}
      this.recognition = null;
    }
    this.isListening = false;
    this._notifyListeners('LISTENING_STOPPED');
  }

  _handleSpeechResult(event) {
    const now = Date.now();
    if (now - this.lastTriggerTime < this.debounceMs) {
      return; // Debounce window active
    }

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0]?.transcript?.trim().toLowerCase();
      if (!transcript) continue;

      const matchedPhrase = this.matchEmergencyPhrase(transcript);
      if (matchedPhrase) {
        this.lastTriggerTime = now;
        this._notifyListeners('EMERGENCY_TRIGGERED', {
          source: 'VOICE',
          phrase: matchedPhrase,
          detectedText: transcript,
          timestamp: new Date().toISOString()
        });
        break;
      }
    }
  }

  matchEmergencyPhrase(text) {
    if (!text) return null;
    const cleanText = text.toLowerCase();
    // Sort longer/more specific phrases first so "help me" matches before "help"
    const phrases = [...(this.config.phrases || DEFAULT_VOICE_CONFIG.phrases)].sort((a, b) => b.length - a.length);

    for (const phrase of phrases) {
      const cleanPhrase = phrase.toLowerCase().trim();
      const regex = new RegExp(`(^|\\s|[,.!?])${cleanPhrase}(\\s|$|[,.!?])`, 'i');
      if (regex.test(cleanText) || cleanText.includes(cleanPhrase)) {
        return cleanPhrase;
      }
    }
    return null;
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

export const voiceSosService = new VoiceSosService();
