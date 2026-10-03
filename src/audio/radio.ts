/**
 * Radio de l'atelier : une petite musique synthétisée qui change avec le site. Bal musette à la
 * forge, swing manouche dans la région, funk dans le pays, électro dans le monde. Le son passe
 * par un vieux poste (filtre) aux premiers actes. Aucun fichier audio.
 */
import { audioGraph } from './audio';

interface Style {
  bpm: number;
  /** Pas par mesure (6 = croches en 3/4, 16 = doubles croches en 4/4). */
  steps: number;
  swing: number;
  /** Accords (notes MIDI), un par mesure. */
  chords: number[][];
  /** Bande passante du poste : [bas, haut] en Hz. */
  band: [number, number];
  play: (step: number, bar: number, chord: number[], t: number, d: number) => void;
}

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
let out: GainNode | null = null;
let lo: BiquadFilterNode | null = null;
let hi: BiquadFilterNode | null = null;
let timer: number | null = null;
let style = -1;
let nextT = 0;
let step = 0;
let enabled = true;

function ctx(): AudioContext {
  return audioGraph()!.c;
}

/** Une note : oscillateur(s), enveloppe, filtre passe-bas optionnel. */
function note(type: OscillatorType, freq: number, t: number, dur: number, gain: number, o: { detune?: number; cut?: number; attack?: number; vib?: number } = {}): void {
  const c = ctx();
  const g = c.createGain();
  const a = o.attack ?? 0.008;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + a);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  let node: AudioNode = g;
  if (o.cut) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.cut;
    g.connect(f);
    node = f;
  }
  node.connect(out!);
  const oscs = o.detune ? [-o.detune, o.detune] : [0];
  for (const det of oscs) {
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = det;
    if (o.vib) {
      const lfo = c.createOscillator();
      const lg = c.createGain();
      lfo.frequency.value = 5.5;
      lg.gain.value = o.vib;
      lfo.connect(lg);
      lg.connect(osc.detune);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
    }
    osc.connect(g);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
}

function noise(t: number, dur: number, gain: number, freq: number, q = 0.8): void {
  const gr = audioGraph();
  if (!gr?.noise) return;
  const c = gr.c;
  const src = c.createBufferSource();
  src.buffer = gr.noise;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(out!);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.02);
}

function kick(t: number, gain: number): void {
  const c = ctx();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.frequency.setValueAtTime(130, t);
  osc.frequency.exponentialRampToValueAtTime(42, t + 0.18);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + 0.3);
  osc.connect(g);
  g.connect(out!);
  osc.start(t);
  osc.stop(t + 0.32);
}

const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

const STYLES: Style[] = [
  // Bal musette : valse en do, accordéon (deux scies désaccordées), basse « oum-pa-pa »
  {
    bpm: 168, steps: 6, swing: 0, band: [380, 3200],
    chords: [[60, 64, 67], [55, 59, 62, 65], [55, 59, 62, 65], [60, 64, 67], [53, 57, 60], [60, 64, 67], [55, 59, 62, 65], [60, 64, 67]],
    play(s, _bar, ch, t, d) {
      if (s === 0) note('triangle', midi(ch[0] - 24), t, d * 1.8, 0.16);
      if (s === 2 || s === 4) for (const n of ch) note('sawtooth', midi(n), t, d * 1.2, 0.025, { detune: 7, cut: 1700 });
      if (s % 2 === 0 || Math.random() < 0.4) note('sawtooth', midi(pick(ch) + 12 + pick([0, 0, 2, -1])), t, d * 1.6, 0.04, { detune: 9, cut: 2400, vib: 12 });
    },
  },
  // Swing manouche : « la pompe » en la mineur, guitare pincée, mélodie au vibrato
  {
    bpm: 170, steps: 8, swing: 0.18, band: [260, 4200],
    chords: [[57, 60, 64], [57, 60, 64], [62, 65, 69], [62, 65, 69], [64, 68, 71, 74], [64, 68, 71, 74], [57, 60, 64], [57, 60, 64]],
    play(s, _bar, ch, t, d) {
      if (s === 0 || s === 4) note('triangle', midi(ch[0] - 24 + (s === 4 ? 7 : 0)), t, d * 1.5, 0.15);
      if (s === 2 || s === 6) for (const n of ch) note('triangle', midi(n), t, d * 0.7, 0.04, { attack: 0.003 });
      if (s % 2 === 1 && Math.random() < 0.55) note('sine', midi(pick([69, 72, 74, 76, 79, 81]) + pick([0, 0, 12])), t, d * 1.8, 0.05, { vib: 18 });
    },
  },
  // Funk années 80 : ré mineur, basse carrée qui saute l'octave, claps, accords en stab
  {
    bpm: 104, steps: 16, swing: 0.1, band: [90, 9000],
    chords: [[62, 65, 69, 72], [62, 65, 69, 72], [67, 71, 74, 77], [67, 71, 74, 77]],
    play(s, _bar, ch, t, d) {
      if (s === 0 || s === 8 || s === 11) kick(t, 0.32);
      if (s === 4 || s === 12) noise(t, 0.16, 0.22, 1600, 0.9);
      if (s % 2 === 0) noise(t, 0.04, 0.05, 8000, 1.2);
      if ([0, 3, 6, 8, 10, 14].includes(s)) note('square', midi(ch[0] - 24 + (s === 3 || s === 10 ? 12 : 0)), t, d * 1.6, 0.06, { cut: 900 });
      if (s === 6 || s === 14) for (const n of ch) note('sawtooth', midi(n), t, d * 1.2, 0.02, { cut: 2600 });
    },
  },
  // Électro : quatre temps, charleston à contretemps, arpège qui s'ouvre
  {
    bpm: 124, steps: 16, swing: 0, band: [40, 14000],
    chords: [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]],
    play(s, bar, ch, t, d) {
      if (s % 4 === 0) kick(t, 0.38);
      if (s % 4 === 2) noise(t, 0.05, 0.08, 9000, 1);
      if (s === 4 || s === 12) noise(t, 0.12, 0.1, 2000, 0.7);
      const arp = [...ch, ch[0] + 12];
      note('sawtooth', midi(arp[s % arp.length] + 12), t, d * 0.9, 0.025, { cut: 900 + 2200 * (0.5 + 0.5 * Math.sin((bar * 16 + s) / 24)) });
      if (s === 0) note('sine', midi(ch[0] - 24), t, d * 7, 0.12);
    },
  },
];

function styleFor(act: number): number {
  return act <= 1 ? 0 : act === 2 ? 1 : act === 3 ? 2 : 3;
}

function ensureOut(): boolean {
  const gr = audioGraph();
  if (!gr) return false;
  if (!out) {
    out = gr.c.createGain();
    out.gain.value = 0;
    hi = gr.c.createBiquadFilter();
    hi.type = 'highpass';
    lo = gr.c.createBiquadFilter();
    lo.type = 'lowpass';
    out.connect(hi);
    hi.connect(lo);
    lo.connect(gr.master);
  }
  return true;
}

function schedule(): void {
  const gr = audioGraph();
  if (!gr || !out || style < 0 || gr.c.state !== 'running') return;
  const st = STYLES[style];
  const d = 60 / st.bpm / (st.steps === 6 ? 2 : st.steps / 4);
  if (nextT < gr.c.currentTime) nextT = gr.c.currentTime + 0.05;
  while (nextT < gr.c.currentTime + 0.15) {
    const s = step % st.steps;
    const bar = Math.floor(step / st.steps);
    const t = nextT + (s % 2 === 1 ? st.swing * d : 0);
    st.play(s, bar, st.chords[bar % st.chords.length], t, d);
    nextT += d;
    step++;
  }
}

/** Allume, éteint ou change de style selon le site (appelé quelques fois par seconde). */
export function radioTick(act: number): void {
  if (!enabled || !ensureOut()) return;
  const want = styleFor(act);
  const c = ctx();
  if (want !== style) {
    style = want;
    step = 0;
    nextT = c.currentTime + 0.3;
    const [a, b] = STYLES[style].band;
    hi!.frequency.setTargetAtTime(a, c.currentTime, 0.2);
    lo!.frequency.setTargetAtTime(b, c.currentTime, 0.2);
  }
  out!.gain.setTargetAtTime(0.32, c.currentTime, 0.8);
  if (timer === null) timer = window.setInterval(schedule, 30);
}

export function setRadio(on: boolean): void {
  enabled = on;
  if (!on) {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
    style = -1;
    if (out) out.gain.setTargetAtTime(0, ctx().currentTime, 0.2);
  }
}
