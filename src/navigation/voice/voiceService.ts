export interface VoiceSettings {
  namePrefix: string;
  voiceURI: string;
  pitch: number;
  rate: number;
  volume: number;
  enabled: boolean;
}

const STORAGE_KEY = 'aanyaa_voice_settings_v1';

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  namePrefix: 'Aanya',
  voiceURI: '',
  pitch: 1.0,
  rate: 1.0,
  volume: 1.0,
  enabled: true,
};

export function loadVoiceSettings(): VoiceSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_VOICE_SETTINGS;
    return { ...DEFAULT_VOICE_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_VOICE_SETTINGS;
  }
}

export function saveVoiceSettings(settings: VoiceSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore quota errors
  }
}

export function getAvailableVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  return window.speechSynthesis.getVoices();
}

/**
 * Speaks a personalized voice navigation prompt starting with the user's name (e.g. Aanya).
 */
export function speakPersonalized(
  message: string,
  settings: VoiceSettings = loadVoiceSettings()
): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  if (!settings.enabled) return;

  // Cancel any ongoing utterance to avoid voice lag
  window.speechSynthesis.cancel();

  const name = settings.namePrefix.trim() || 'Aanya';
  let formattedText = message.trim();

  // Prefix with name if not already addressed
  if (!formattedText.toLowerCase().startsWith(name.toLowerCase())) {
    formattedText = `${name}, ${formattedText}`;
  }

  const utterance = new SpeechSynthesisUtterance(formattedText);
  utterance.pitch = Math.max(0.5, Math.min(2, settings.pitch));
  utterance.rate = Math.max(0.5, Math.min(2, settings.rate));
  utterance.volume = Math.max(0.1, Math.min(1, settings.volume));

  if (settings.voiceURI) {
    const voices = window.speechSynthesis.getVoices();
    const match = voices.find((v) => v.voiceURI === settings.voiceURI);
    if (match) {
      utterance.voice = match;
    }
  }

  window.speechSynthesis.speak(utterance);
}
