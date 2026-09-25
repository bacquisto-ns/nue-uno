import { create } from 'zustand';

/**
 * Sound design (motion spec §7), synthesized with Web Audio instead of a sample sprite: 0 KB to
 * download, nothing to license, and it can't fail to load on office Wi-Fi. Every sound is a few
 * oscillators or a filtered noise burst shaped by an envelope.
 *
 * Off by default (PRD A6). The speaker toggle is per device (a phone and the TV want different
 * answers), remembered in localStorage and seeded from the profile's `settings.sound`.
 */
export type SoundName =
  | 'shuffle' | 'deal-tick' | 'flip' | 'card-snap' | 'draw' | 'tick' | 'tick-soft' | 'stamp'
  | 'stamp-soft' | 'whoosh-color' | 'whoosh-reverse' | 'slam' | 'uno-shout' | 'siren-short'
  | 'final-lap-horn' | 'win-sting' | 'rank-up' | 'pop' | 'thud'
  // TV set
  | 'crowd-ooh' | 'cheer' | 'drumroll' | 'fanfare' | 'reveal';

const KEY = 'nue-uno.sound';

function readStored(): boolean | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === null ? null : v === 'on';
  } catch {
    return null;
  }
}

interface SoundState {
  /** null = the user hasn't touched the toggle on this device; fall back to the profile. */
  on: boolean | null;
  volume: number;
  setOn: (on: boolean) => void;
}

export const useSoundStore = create<SoundState>((set) => ({
  on: readStored(),
  volume: 0.8,
  setOn: (on) => {
    try {
      localStorage.setItem(KEY, on ? 'on' : 'off');
    } catch {
      /* private mode: the choice lasts for this tab only */
    }
    if (on) unlock();
    set({ on });
  },
}));

let profileDefault = false;
/** The profile's saved preference, used until this device's toggle is touched. */
export function setSoundDefault(on: boolean) {
  profileDefault = on;
}
export function soundEnabled(): boolean {
  return useSoundStore.getState().on ?? profileDefault;
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

/** Create/resume the AudioContext. Browsers only allow this inside a user gesture. */
export function unlock(): void {
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.connect(ctx.destination);
      // Deterministic white noise (no Math.random in app code): a small LCG is plenty.
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      let s = 0x2f6b1a3;
      for (let i = 0; i < d.length; i++) {
        s = (s * 1664525 + 1013904223) >>> 0;
        d[i] = s / 0x80000000 - 1;
      }
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null; // no Web Audio (very old browser): stay silent
  }
}

// Resume on the first tap anywhere once sound is on (iOS suspends until a gesture).
if (typeof window !== 'undefined') {
  const first = () => {
    if (soundEnabled()) unlock();
  };
  window.addEventListener('pointerdown', first, { passive: true });
  window.addEventListener('keydown', first);
}

type Wave = OscillatorType;

function tone(at: number, freq: number, dur: number, opts: { type?: Wave; gain?: number; to?: number; attack?: number } = {}) {
  const c = ctx!;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = opts.type ?? 'sine';
  o.frequency.setValueAtTime(freq, at);
  if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, at + dur);
  const peak = opts.gain ?? 0.3;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + (opts.attack ?? 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(master!);
  o.start(at);
  o.stop(at + dur + 0.02);
}

function noise(at: number, dur: number, opts: { freq?: number; to?: number; q?: number; gain?: number; type?: BiquadFilterType; attack?: number } = {}) {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = opts.type ?? 'bandpass';
  f.frequency.setValueAtTime(opts.freq ?? 2000, at);
  if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, at + dur);
  f.Q.value = opts.q ?? 1;
  const g = c.createGain();
  const peak = opts.gain ?? 0.3;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + (opts.attack ?? 0.004));
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f).connect(g).connect(master!);
  src.start(at, (at * 7.3) % 0.9);
  src.stop(at + dur + 0.02);
}

/** Everyday sounds sit ~6 dB under the signature ones (spec §7 mix: −18 vs −12 LUFS). */
const RECIPES: Record<SoundName, (t: number) => void> = {
  'card-snap': (t) => { noise(t, 0.06, { freq: 3200, q: 0.8, gain: 0.35 }); tone(t, 180, 0.05, { gain: 0.12 }); },
  'deal-tick': (t) => noise(t, 0.03, { freq: 4200, q: 1.5, gain: 0.18 }),
  flip: (t) => noise(t, 0.08, { freq: 1800, to: 5200, q: 1.2, gain: 0.2 }),
  draw: (t) => noise(t, 0.12, { freq: 1200, to: 2600, q: 0.7, gain: 0.18, attack: 0.02 }),
  shuffle: (t) => { for (let i = 0; i < 9; i++) noise(t + i * 0.045, 0.05, { freq: 2600 + (i % 3) * 500, q: 1, gain: 0.14 }); },
  tick: (t) => tone(t, 1400, 0.035, { type: 'triangle', gain: 0.12 }),
  'tick-soft': (t) => tone(t, 880, 0.05, { type: 'sine', gain: 0.08 }),
  pop: (t) => tone(t, 520, 0.09, { to: 980, gain: 0.12 }),
  thud: (t) => { tone(t, 110, 0.14, { to: 60, gain: 0.35 }); noise(t, 0.05, { freq: 400, type: 'lowpass', gain: 0.2 }); },
  stamp: (t) => { tone(t, 140, 0.18, { to: 55, gain: 0.5 }); noise(t, 0.08, { freq: 900, q: 0.6, gain: 0.35 }); },
  'stamp-soft': (t) => { tone(t, 160, 0.12, { to: 80, gain: 0.25 }); noise(t, 0.05, { freq: 1100, gain: 0.15 }); },
  'whoosh-color': (t) => noise(t, 0.4, { freq: 500, to: 4500, q: 2, gain: 0.25, attack: 0.12 }),
  'whoosh-reverse': (t) => noise(t, 0.4, { freq: 4500, to: 500, q: 2, gain: 0.25, attack: 0.12 }),
  slam: (t) => {
    tone(t, 90, 0.5, { to: 38, gain: 0.7 });
    noise(t, 0.25, { freq: 700, type: 'lowpass', gain: 0.6 });
    noise(t + 0.02, 0.5, { freq: 3000, to: 800, q: 0.5, gain: 0.2 });
  },
  'uno-shout': (t) => [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.06, f, 0.35, { type: 'square', gain: 0.1 })),
  'siren-short': (t) => { tone(t, 700, 0.2, { type: 'sawtooth', to: 1100, gain: 0.12 }); tone(t + 0.2, 1100, 0.2, { type: 'sawtooth', to: 700, gain: 0.12 }); },
  'final-lap-horn': (t) => { tone(t, 220, 0.9, { type: 'sawtooth', gain: 0.14, attack: 0.05 }); tone(t, 330, 0.9, { type: 'sawtooth', gain: 0.1, attack: 0.05 }); },
  'win-sting': (t) => {
    [392, 523, 659].forEach((f, i) => tone(t + i * 0.1, f, 0.18, { type: 'triangle', gain: 0.25 }));
    [523, 659, 784, 1047].forEach((f) => tone(t + 0.32, f, 0.9, { type: 'triangle', gain: 0.16, attack: 0.02 }));
  },
  'rank-up': (t) => [659, 880, 1175].forEach((f, i) => tone(t + i * 0.07, f, 0.16, { type: 'triangle', gain: 0.18 })),
  'crowd-ooh': (t) => {
    // Many detuned voices bending down read as a crowd "ooooh".
    for (let i = 0; i < 6; i++) tone(t, 280 + i * 23, 1.1, { type: 'sawtooth', to: 190 + i * 17, gain: 0.03, attack: 0.25 });
    noise(t, 1.1, { freq: 600, q: 3, gain: 0.08, attack: 0.3 });
  },
  cheer: (t) => {
    noise(t, 2.2, { freq: 1800, q: 0.4, gain: 0.3, attack: 0.3 });
    for (let i = 0; i < 16; i++) noise(t + 0.1 + i * 0.11, 0.04, { freq: 2400 + (i % 5) * 300, q: 2, gain: 0.25 }); // claps
  },
  drumroll: (t) => { for (let i = 0; i < 40; i++) noise(t + i * 0.045, 0.05, { freq: 250 + (i % 2) * 40, q: 1.2, gain: 0.1 + i * 0.006 }); },
  reveal: (t) => { tone(t, 90, 0.4, { to: 45, gain: 0.6 }); noise(t, 0.15, { freq: 5000, q: 0.4, gain: 0.25 }); tone(t, 1047, 0.6, { type: 'triangle', gain: 0.12 }); },
  fanfare: (t) => {
    const notes = [523, 523, 523, 698, 880, 784, 1047];
    const at = [0, 0.14, 0.28, 0.42, 0.7, 0.98, 1.15];
    notes.forEach((f, i) => tone(t + at[i]!, f, i === notes.length - 1 ? 1.2 : 0.22, { type: 'sawtooth', gain: 0.1, attack: 0.02 }));
  },
};

/** Play a sound if sound is on. Never throws; sound is never the only signal (PRD §10). */
export function play(name: SoundName, delayMs = 0): void {
  if (!soundEnabled()) return;
  unlock();
  if (!ctx || !master || ctx.state !== 'running') return;
  master.gain.value = useSoundStore.getState().volume;
  try {
    RECIPES[name](ctx.currentTime + 0.01 + delayMs / 1000);
  } catch {
    /* ignore */
  }
}
