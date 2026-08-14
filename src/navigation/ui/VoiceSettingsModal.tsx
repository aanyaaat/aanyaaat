import React, { useState, useEffect } from 'react';
import { Volume2, X, Play, Sliders, User, Sparkles, Check } from 'lucide-react';
import {
  type VoiceSettings,
  loadVoiceSettings,
  saveVoiceSettings,
  speakPersonalized,
} from '@/navigation/voice/voiceService';

interface VoiceSettingsModalProps {
  onClose: () => void;
  onUpdate?: (settings: VoiceSettings) => void;
}

export function VoiceSettingsModal({ onClose, onUpdate }: VoiceSettingsModalProps) {
  const [settings, setSettings] = useState<VoiceSettings>(loadVoiceSettings);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    const updateVoices = () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const available = window.speechSynthesis.getVoices();
        setVoices(available);
      }
    };

    updateVoices();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }
  }, []);

  const handleSave = () => {
    saveVoiceSettings(settings);
    onUpdate?.(settings);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 400);
  };

  const handleTestVoice = () => {
    setIsPlayingPreview(true);
    const name = settings.namePrefix.trim() || 'Aanya';
    speakPersonalized(`starting navigation. In 200 meters, turn right. Have a wonderful and safe drive!`, settings);
    setTimeout(() => setIsPlayingPreview(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md rounded-3xl border border-line bg-surface p-6 shadow-2xl animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-line">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent-500 text-white shadow-md">
              <Volume2 size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-ink flex items-center gap-2">
                Voice & Speech Model
                <Sparkles size={16} className="text-amber-500" />
              </h2>
              <p className="text-xs text-ink-muted">Personalize navigation voice for Aanya</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-surface-subtle hover:text-ink transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="mt-5 space-y-5">
          {/* Name Prefix Field */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted mb-1.5 flex items-center gap-1.5">
              <User size={13} />
              Personalized Name Prefix
            </label>
            <input
              type="text"
              value={settings.namePrefix}
              onChange={(e) => setSettings({ ...settings, namePrefix: e.target.value })}
              placeholder="e.g. Aanya"
              className="w-full rounded-xl border border-line bg-surface-subtle px-3.5 py-2.5 text-sm font-semibold text-ink focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
            />
            <p className="mt-1 text-[11px] text-ink-faint">
              Navigation guidance will start by saying: <span className="font-bold text-accent-600">"{settings.namePrefix || 'Aanya'}, in 200m..."</span>
            </p>
          </div>

          {/* Voice Model Selector */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted mb-1.5 flex items-center gap-1.5">
              <Sliders size={13} />
              Voice Model / Speaker
            </label>
            <select
              value={settings.voiceURI}
              onChange={(e) => setSettings({ ...settings, voiceURI: e.target.value })}
              className="w-full rounded-xl border border-line bg-surface-subtle px-3.5 py-2.5 text-sm font-medium text-ink focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
            >
              <option value="">Default System Voice</option>
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </div>

          {/* Sliders: Pitch & Speed */}
          <div className="grid grid-cols-2 gap-4">
            {/* Speed / Rate */}
            <div>
              <div className="flex justify-between text-xs font-semibold text-ink-muted mb-1">
                <span>Speed / Rate</span>
                <span>{settings.rate.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.6"
                max="1.5"
                step="0.1"
                value={settings.rate}
                onChange={(e) => setSettings({ ...settings, rate: parseFloat(e.target.value) })}
                className="w-full accent-accent-500"
              />
            </div>

            {/* Pitch */}
            <div>
              <div className="flex justify-between text-xs font-semibold text-ink-muted mb-1">
                <span>Pitch / Tone</span>
                <span>{settings.pitch.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="1.5"
                step="0.1"
                value={settings.pitch}
                onChange={(e) => setSettings({ ...settings, pitch: parseFloat(e.target.value) })}
                className="w-full accent-accent-500"
              />
            </div>
          </div>

          {/* Test Voice Button */}
          <button
            type="button"
            onClick={handleTestVoice}
            disabled={isPlayingPreview}
            className="w-full flex items-center justify-center gap-2 rounded-2xl border border-accent-200 bg-accent-50/70 py-2.5 text-xs font-bold text-accent-700 hover:bg-accent-100 transition-all active:scale-98"
          >
            <Play size={14} fill="currentColor" />
            <span>{isPlayingPreview ? 'Speaking Preview…' : 'Test Voice Guidance'}</span>
          </button>
        </div>

        {/* Footer Actions */}
        <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-line">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-xs font-semibold text-ink-muted hover:bg-surface-subtle hover:text-ink transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-1.5 rounded-xl bg-accent-500 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-accent-600 active:scale-95 transition-all"
          >
            {savedSuccess ? <Check size={14} /> : null}
            <span>{savedSuccess ? 'Saved!' : 'Save Preferences'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
