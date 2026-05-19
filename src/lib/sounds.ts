// Catalogue sonore rétro années 50 généré via Web Audio API
// (pas de fichiers à charger : tout synthétisé en temps réel).

import { getSettings, saveSettings } from '../stores/db';

type SoundKey =
  | 'adopt' | 'reject' | 'skip' | 'back'
  | 'favorite' | 'modalOpen' | 'modalClose'
  | 'toastSuccess' | 'toastInfo' | 'toastWarning'
  | 'llmStart' | 'llmDone' | 'llmFail'
  | 'saveCombo' | 'saveIdea' | 'saveConstraint'
  | 'hover' | 'modeChange' | 'boot'
  | 'quizzEnd' | 'milestone' | 'demolish';

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let enabled = true;
let masterVolume = 0.4;
let initialized = false;

async function ensureInit() {
  if (initialized) return;
  initialized = true;
  const s = await getSettings();
  if (s) {
    if (typeof s.soundsEnabled === 'boolean') enabled = s.soundsEnabled;
    if (typeof s.masterVolume === 'number') masterVolume = s.masterVolume;
  }
}

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    type Win = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };
    const AudioCtx = window.AudioContext ?? (window as Win).webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
    masterGain = ctx.createGain();
    masterGain.gain.value = masterVolume;
    masterGain.connect(ctx.destination);
  }
  return ctx;
}

export async function setSoundsEnabled(v: boolean): Promise<void> {
  enabled = v;
  await saveSettings({ soundsEnabled: v });
}

export async function setMasterVolume(v: number): Promise<void> {
  masterVolume = Math.max(0, Math.min(1, v));
  if (masterGain) masterGain.gain.value = masterVolume;
  await saveSettings({ masterVolume });
}

export function getSoundsEnabled(): boolean { return enabled; }
export function getMasterVolume(): number { return masterVolume; }

interface ToneSpec {
  freq: number;
  duration: number;
  type?: OscillatorType;
  freq2?: number;
  delay?: number;
  gain?: number;
}

function playTone({ freq, duration, type = 'sine', freq2, delay = 0, gain = 0.5 }: ToneSpec) {
  const c = getCtx();
  if (!c || !masterGain) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freq2 !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq2), t0 + duration);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  osc.connect(g).connect(masterGain);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

function playSequence(tones: ToneSpec[]) {
  tones.forEach(t => playTone(t));
}

const SOUNDS: Record<SoundKey, () => void> = {
  // Swipe verdicts — three distinct fan-fares
  adopt:  () => playSequence([
    { freq: 523, freq2: 784, duration: 0.10, type: 'triangle', gain: 0.35 },
    { freq: 784, duration: 0.12, type: 'sine', delay: 0.08, gain: 0.25 },
  ]),
  reject: () => playSequence([
    { freq: 220, freq2: 110, duration: 0.18, type: 'sawtooth', gain: 0.25 },
  ]),
  skip:   () => playSequence([
    { freq: 392, duration: 0.06, type: 'square', gain: 0.18 },
    { freq: 587, duration: 0.06, type: 'square', delay: 0.05, gain: 0.18 },
  ]),
  back:   () => playSequence([
    { freq: 660, freq2: 440, duration: 0.10, type: 'triangle', gain: 0.20 },
  ]),

  favorite: () => playSequence([
    { freq: 880, duration: 0.06, type: 'sine', gain: 0.30 },
    { freq: 1100, duration: 0.06, type: 'sine', delay: 0.05, gain: 0.25 },
    { freq: 1320, duration: 0.10, type: 'sine', delay: 0.10, gain: 0.20 },
  ]),

  modalOpen:  () => playTone({ freq: 440, freq2: 880, duration: 0.12, type: 'triangle', gain: 0.18 }),
  modalClose: () => playTone({ freq: 880, freq2: 440, duration: 0.10, type: 'triangle', gain: 0.18 }),

  toastSuccess: () => playSequence([
    { freq: 660, duration: 0.07, type: 'sine', gain: 0.25 },
    { freq: 990, duration: 0.10, type: 'sine', delay: 0.06, gain: 0.20 },
  ]),
  toastInfo:    () => playTone({ freq: 587, duration: 0.10, type: 'sine', gain: 0.18 }),
  toastWarning: () => playSequence([
    { freq: 440, duration: 0.08, type: 'square', gain: 0.22 },
    { freq: 440, duration: 0.08, type: 'square', delay: 0.10, gain: 0.22 },
  ]),

  llmStart: () => playTone({ freq: 200, freq2: 600, duration: 0.30, type: 'sawtooth', gain: 0.12 }),
  llmDone:  () => playSequence([
    { freq: 523, duration: 0.08, type: 'triangle', gain: 0.25 },
    { freq: 659, duration: 0.08, type: 'triangle', delay: 0.07, gain: 0.25 },
    { freq: 784, duration: 0.12, type: 'triangle', delay: 0.14, gain: 0.30 },
  ]),
  llmFail:  () => playTone({ freq: 110, duration: 0.30, type: 'sawtooth', gain: 0.25 }),

  saveCombo:      () => playTone({ freq: 587, freq2: 880, duration: 0.10, type: 'triangle', gain: 0.22 }),
  saveIdea:       () => playSequence([
    { freq: 880, duration: 0.06, type: 'sine', gain: 0.22 },
    { freq: 1175, duration: 0.10, type: 'sine', delay: 0.05, gain: 0.20 },
  ]),
  saveConstraint: () => playTone({ freq: 1047, duration: 0.08, type: 'sine', gain: 0.22 }),

  hover:      () => playTone({ freq: 1568, duration: 0.02, type: 'sine', gain: 0.05 }),
  modeChange: () => playTone({ freq: 660, freq2: 880, duration: 0.08, type: 'triangle', gain: 0.18 }),
  boot:       () => playSequence([
    { freq: 220, duration: 0.10, type: 'square', gain: 0.20 },
    { freq: 440, duration: 0.10, type: 'square', delay: 0.08, gain: 0.20 },
    { freq: 880, duration: 0.18, type: 'triangle', delay: 0.16, gain: 0.25 },
  ]),
  quizzEnd:   () => playSequence([
    { freq: 523, duration: 0.10, type: 'triangle', gain: 0.25 },
    { freq: 659, duration: 0.10, type: 'triangle', delay: 0.08, gain: 0.25 },
    { freq: 784, duration: 0.10, type: 'triangle', delay: 0.16, gain: 0.25 },
    { freq: 1047, duration: 0.20, type: 'triangle', delay: 0.24, gain: 0.30 },
  ]),
  milestone:  () => playSequence([
    { freq: 784, duration: 0.06, type: 'sine', gain: 0.20 },
    { freq: 988, duration: 0.06, type: 'sine', delay: 0.05, gain: 0.20 },
    { freq: 1175, duration: 0.12, type: 'sine', delay: 0.10, gain: 0.25 },
  ]),
  demolish:   () => playSequence([
    { freq: 880, freq2: 55, duration: 0.40, type: 'sawtooth', gain: 0.30 },
  ]),
};

export function playSound(key: SoundKey): void {
  ensureInit().then(() => {
    if (!enabled) return;
    SOUNDS[key]?.();
  });
}
