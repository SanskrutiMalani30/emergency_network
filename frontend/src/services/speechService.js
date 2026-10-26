/**
 * RESQMesh — Multilingual Text-to-Speech (TTS) Service
 *
 * Provides air-gapped speech synthesis for emergency descriptions:
 * 1. Multilingual voice resolution for English, Hindi (Devanagari), and Hinglish (Romanized Hindi).
 * 2. Automatic offline voice inspection (voice.localService) with honest fallback reporting.
 * 3. Native Android TTS companion bridge support (via window.AndroidBleBridge.speakText).
 * 4. Zero promotional or explanatory copy inside the description text.
 * 5. Single playback singleton preventing overlapping speech playback across cards.
 */

class SpeechService {
  constructor() {
    this.synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
    this.voices = [];
    this.currentUtterance = null;
    this.isPlaying = false;
    this.currentPlayingId = null;
    this.listeners = new Set();

    if (this.synth) {
      this._loadVoices();
      if (typeof window !== 'undefined' && window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = () => this._loadVoices();
      }
    }
  }

  _loadVoices() {
    if (!this.synth) return;
    try {
      this.voices = this.synth.getVoices() || [];
    } catch (e) {
      this.voices = [];
    }
  }

  isSupported() {
    return Boolean(this.synth || (typeof window !== 'undefined' && window.AndroidBleBridge?.speakText));
  }

  /**
   * Detects optimal language code from text content:
   * - Devanagari script: 'hi-IN'
   * - Hinglish keywords: 'hi-IN' or 'en-IN'
   * - English / default: 'en-IN' (or 'en-US')
   */
  detectLanguage(text = '') {
    if (!text) return 'en-IN';

    // 1. Check for Devanagari script
    const hasDevanagari = /[\u0900-\u097F]/.test(text);
    if (hasDevanagari) return 'hi-IN';

    // 2. Check common romanized Hindi / Hinglish distress terms
    const hinglishTerms = /\b(madad|bachao|paani|pani|chot|ghayal|dawa|khana|ghar|rasta|doob|baarish|tute|aasra|sahayata|jaldi)\b/i;
    if (hinglishTerms.test(text)) {
      return 'hi-IN';
    }

    return 'en-IN';
  }

  /**
   * Finds the best voice matching language and checks local (offline) availability
   */
  findBestVoice(langCode) {
    if (this.voices.length === 0) this._loadVoices();
    if (this.voices.length === 0) return null;

    const baseLang = langCode.split('-')[0].toLowerCase();

    // 1. Exact match with local (offline) voice preference
    const exactLocal = this.voices.find(v => v.lang.toLowerCase() === langCode.toLowerCase() && v.localService);
    if (exactLocal) return exactLocal;

    // 2. Base language with local (offline) voice preference
    const baseLocal = this.voices.find(v => v.lang.toLowerCase().startsWith(baseLang) && v.localService);
    if (baseLocal) return baseLocal;

    // 3. Exact match (any service)
    const exactAny = this.voices.find(v => v.lang.toLowerCase() === langCode.toLowerCase());
    if (exactAny) return exactAny;

    // 4. Base language (any service)
    const baseAny = this.voices.find(v => v.lang.toLowerCase().startsWith(baseLang));
    if (baseAny) return baseAny;

    // 5. English Indian / General fallback
    const enFallback = this.voices.find(v => v.lang.toLowerCase().startsWith('en'));
    return enFallback || this.voices[0] || null;
  }

  /**
   * Speaks the provided emergency text.
   * Clicking again while playing the same item toggles playback OFF.
   */
  speakText(text, identifier = null, requestedLang = null) {
    if (!this.isSupported()) {
      console.warn('Speech synthesis is not supported on this platform.');
      return { success: false, reason: 'NOT_SUPPORTED' };
    }

    // Toggle off if currently playing the same description
    if (this.isPlaying && this.currentPlayingId === identifier) {
      this.stop();
      return { success: true, action: 'STOPPED' };
    }

    // Stop any currently ongoing speech first
    this.stop();

    if (!text || !text.trim()) {
      return { success: false, reason: 'EMPTY_TEXT' };
    }

    const cleanText = text.trim();
    const lang = requestedLang || this.detectLanguage(cleanText);

    // Native Android Companion Bridge check
    if (typeof window !== 'undefined' && window.AndroidBleBridge && typeof window.AndroidBleBridge.speakText === 'function') {
      try {
        window.AndroidBleBridge.speakText(cleanText, lang);
        this.isPlaying = true;
        this.currentPlayingId = identifier;
        this._notify();
        return { success: true, via: 'ANDROID_TTS', lang };
      } catch (e) {
        console.warn('Android native TTS bridge notice:', e);
      }
    }

    if (!this.synth) {
      return { success: false, reason: 'NO_SYNTH' };
    }

    try {
      const utterance = new SpeechSynthesisUtterance(cleanText);
      const voice = this.findBestVoice(lang);

      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      } else {
        utterance.lang = lang;
      }

      utterance.rate = 0.95; // Slightly slower for clear emergency comprehension
      utterance.pitch = 1.0;

      utterance.onstart = () => {
        this.isPlaying = true;
        this.currentPlayingId = identifier;
        this._notify();
      };

      utterance.onend = () => {
        this.isPlaying = false;
        this.currentPlayingId = null;
        this.currentUtterance = null;
        this._notify();
      };

      utterance.onerror = (e) => {
        console.warn('Speech synthesis error:', e);
        this.isPlaying = false;
        this.currentPlayingId = null;
        this.currentUtterance = null;
        this._notify();
      };

      this.currentUtterance = utterance;
      this.synth.cancel(); // Clear any pending speech queue
      this.synth.speak(utterance);

      return {
        success: true,
        action: 'PLAYING',
        lang,
        isOfflineVoice: voice ? Boolean(voice.localService) : false
      };
    } catch (err) {
      console.warn('Failed to start speech synthesis:', err);
      this.isPlaying = false;
      this.currentPlayingId = null;
      this._notify();
      return { success: false, reason: err.message };
    }
  }

  stop() {
    if (this.synth) {
      try {
        this.synth.cancel();
      } catch (e) {}
    }

    if (typeof window !== 'undefined' && window.AndroidBleBridge?.stopSpeech) {
      try {
        window.AndroidBleBridge.stopSpeech();
      } catch (e) {}
    }

    this.isPlaying = false;
    this.currentPlayingId = null;
    this.currentUtterance = null;
    this._notify();
  }

  isItemPlaying(identifier) {
    return this.isPlaying && this.currentPlayingId === identifier;
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  _notify() {
    this.listeners.forEach(cb => {
      try { cb({ isPlaying: this.isPlaying, currentPlayingId: this.currentPlayingId }); } catch (e) {}
    });
  }
}

export const speechService = new SpeechService();

export function detectLanguage(text = '') {
  return speechService.detectLanguage(text);
}

export function hasSpeechSynthesisSupport() {
  return speechService.isSupported();
}

export function stopEmergencySpeech() {
  speechService.stop();
}

export function speakEmergencyDescription(text, options = {}) {
  return speechService.speak(text, options);
}
