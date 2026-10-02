/**
 * Sons 100 % synthétisés (Web Audio), repris de la v5 et du POC.
 * Aucun fichier audio. Le contexte démarre au premier geste du joueur.
 */

interface Au {
  c: AudioContext | null;
  on: boolean;
  master: GainNode | null;
  sfx: GainNode | null;
  amb: GainNode | null;
  rev: ConvolverNode | null;
  nb: AudioBuffer | null;
  hum: OscillatorNode | null;
  hum2: OscillatorNode | null;
  humG: GainNode | null;
  mach: GainNode | null;
  machF: BiquadFilterNode | null;
}

const AU: Au = { c: null, on: true, master: null, sfx: null, amb: null, rev: null, nb: null, hum: null, hum2: null, humG: null, mach: null, machF: null };
const RL: Record<string, number> = {};

function limit(key: string, ms: number): boolean {
  const n = performance.now();
  if (RL[key] && n - RL[key] < ms) return true;
  RL[key] = n;
  return false;
}

export function soundOn(): boolean {
  return AU.on;
}

export function setSound(on: boolean): void {
  AU.on = on;
  if (!AU.c || !AU.master) {
    if (on) initAudio();
    return;
  }
  AU.master.gain.setTargetAtTime(on ? 0.9 : 0, AU.c.currentTime, 0.05);
  if (on) void AU.c.resume();
}

export function initAudio(): void {
  if (!AU.on) return;
  if (AU.c) {
    if (AU.c.state !== 'running') void AU.c.resume();
    return;
  }
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  const c = new Ctor();
  AU.c = c;
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 12;
  comp.ratio.value = 4;
  comp.attack.value = 0.003;
  comp.release.value = 0.2;
  comp.connect(c.destination);
  AU.master = c.createGain();
  AU.master.gain.value = 0.9;
  AU.master.connect(comp);
  AU.sfx = c.createGain();
  AU.sfx.gain.value = 0.8;
  AU.sfx.connect(AU.master);
  AU.amb = c.createGain();
  AU.amb.gain.value = 0;
  AU.amb.connect(AU.master);
  AU.amb.gain.setTargetAtTime(0.7, c.currentTime, 1.2);
  const len = Math.floor(c.sampleRate * 1.6);
  const ir = c.createBuffer(2, len, c.sampleRate);
  for (let k = 0; k < 2; k++) {
    const d = ir.getChannelData(k);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8);
  }
  AU.rev = c.createConvolver();
  AU.rev.buffer = ir;
  const rg = c.createGain();
  rg.gain.value = 0.3;
  AU.rev.connect(rg);
  rg.connect(AU.master);
  const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const nd = nb.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  AU.nb = nb;
  // ronron d'usine
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 170;
  AU.hum = c.createOscillator();
  AU.hum.type = 'sawtooth';
  AU.hum.frequency.value = 48;
  AU.hum2 = c.createOscillator();
  AU.hum2.type = 'sawtooth';
  AU.hum2.frequency.value = 48.6;
  AU.humG = c.createGain();
  AU.humG.gain.value = 0;
  AU.hum.connect(lp);
  AU.hum2.connect(lp);
  lp.connect(AU.humG);
  AU.humG.connect(AU.amb);
  AU.hum.start();
  AU.hum2.start();
  // brouhaha des machines (bruit filtré)
  const src = c.createBufferSource();
  src.buffer = nb;
  src.loop = true;
  AU.machF = c.createBiquadFilter();
  AU.machF.type = 'bandpass';
  AU.machF.frequency.value = 900;
  AU.machF.Q.value = 0.7;
  AU.mach = c.createGain();
  AU.mach.gain.value = 0;
  src.connect(AU.machF);
  AU.machF.connect(AU.mach);
  AU.mach.connect(AU.amb);
  src.start();
}

const can = (): boolean => !!AU.c && AU.on && AU.c.state === 'running';
const now = (): number => AU.c!.currentTime;

function bus(pan = 0, rev = 0): AudioNode {
  const c = AU.c!;
  const p = c.createStereoPanner ? c.createStereoPanner() : null;
  const node: AudioNode = p ?? c.createGain();
  if (p) p.pan.value = Math.max(-1, Math.min(1, pan));
  node.connect(AU.sfx!);
  if (rev > 0) {
    const s = c.createGain();
    s.gain.value = rev;
    node.connect(s);
    s.connect(AU.rev!);
  }
  return node;
}

function env(g: GainNode, t: number, a: number, pk: number, d: number): void {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(pk, t + Math.max(a, 0.002));
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a, 0.002) + d);
}

function tone(type: OscillatorType, f: number, t: number, a: number, pk: number, d: number, dest: AudioNode, f2?: number): void {
  const c = AU.c!;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d);
  o.connect(g);
  g.connect(dest);
  env(g, t, a, pk, d);
  o.start(t);
  o.stop(t + a + d + 0.05);
}

function nz(t: number, d: number, type: BiquadFilterType, f: number, q: number, pk: number, a: number, dest: AudioNode, f2?: number): void {
  const c = AU.c!;
  const s = c.createBufferSource();
  s.buffer = AU.nb;
  s.loop = true;
  const fl = c.createBiquadFilter();
  fl.type = type;
  fl.frequency.setValueAtTime(f, t);
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + a + d);
  fl.Q.value = q;
  const g = c.createGain();
  s.connect(fl);
  fl.connect(g);
  g.connect(dest);
  env(g, t, a, pk, d);
  s.start(t, Math.random() * 1.5);
  s.stop(t + a + d + 0.05);
}

export type Sfx =
  | 'tap' | 'buy' | 'build' | 'hire' | 'research' | 'fail' | 'cash' | 'type' | 'click' | 'denied' | 'warn'
  | 'milestone' | 'move' | 'coin' | 'deliver' | 'repair' | 'contract';

/** Effet ponctuel. `pan` de −1 (gauche) à 1 (droite). */
export function sfx(k: Sfx, pan = 0, x = 0): void {
  if (!can()) return;
  const t = now();
  switch (k) {
    case 'tap': {
      if (limit('tap', 25)) return;
      const o = bus(pan, 0.15);
      tone('square', 220 + x * 660, t, 0.001, 0.05, 0.035, o);
      nz(t, 0.015, 'highpass', 4000, 2, 0.08, 0.001, o);
      tone('sine', 160, t, 0.002, 0.3, 0.08, o, 60);
      break;
    }
    case 'buy': {
      const o = bus(pan, 0.3);
      nz(t, 0.06, 'lowpass', 1300, 1, 0.5, 0.002, o);
      tone('sine', 115, t, 0.002, 0.55, 0.14, o, 55);
      [1318.5, 1975.5].forEach((f, i) => tone('triangle', f, t + 0.1 + i * 0.06, 0.004, 0.13, 0.35, o));
      break;
    }
    case 'build': {
      const o = bus(pan, 0.4);
      tone('sine', 90, t, 0.003, 0.6, 0.4, o, 40);
      nz(t, 0.3, 'lowpass', 600, 1, 0.3, 0.002, o);
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone('triangle', f, t + 0.1 + i * 0.07, 0.003, 0.12, 0.45, o));
      break;
    }
    case 'hire': {
      const o = bus(pan, 0.3);
      tone('triangle', 784, t, 0.003, 0.14, 0.25, o);
      tone('triangle', 1046.5, t + 0.09, 0.003, 0.14, 0.35, o);
      break;
    }
    case 'research': {
      const o = bus(0, 0.45);
      nz(t, 0.5, 'bandpass', 400, 2, 0.12, 0.05, o, 5000);
      [523.25, 783.99, 1046.5, 1567.98, 2093].forEach((f, i) => tone('triangle', f, t + 0.08 + i * 0.055, 0.003, 0.13, 0.5, o));
      break;
    }
    case 'milestone': {
      const o = bus(0, 0.5);
      [1046.5, 1318.5, 1568, 2093, 2637].forEach((f, i) => {
        tone('triangle', f, t + i * 0.07, 0.004, 0.13, 0.7, o);
        tone('sine', f * 1.003, t + i * 0.07, 0.004, 0.06, 0.8, o);
      });
      nz(t + 0.3, 0.8, 'highpass', 6500, 1, 0.06, 0.05, o);
      break;
    }
    case 'move': {
      const o = bus(0, 0.5);
      tone('sine', 72, t, 0.01, 0.6, 0.9, o, 38);
      nz(t, 0.6, 'lowpass', 500, 1, 0.22, 0.01, o, 90);
      [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone('triangle', f, t + 0.2 + i * 0.09, 0.004, 0.14, 0.6, o));
      break;
    }
    case 'fail': {
      const o = bus(pan, 0.2);
      tone('sawtooth', 220, t, 0.005, 0.08, 0.3, o, 150);
      tone('sawtooth', 165, t + 0.2, 0.005, 0.08, 0.4, o, 100);
      break;
    }
    case 'cash': {
      const o = bus(0, 0.3);
      nz(t, 0.03, 'highpass', 3000, 1, 0.35, 0.001, o);
      tone('sine', 95, t, 0.002, 0.35, 0.12, o, 50);
      [2637, 3520].forEach((f, i) => tone('sine', f, t + 0.07 + i * 0.07, 0.002, 0.15, 0.6, o));
      break;
    }
    case 'coin': {
      if (limit('coin', 160)) return;
      tone('sine', 2637, t, 0.002, 0.035, 0.12, bus(0.6));
      break;
    }
    case 'type': {
      if (limit('type', 35)) return;
      nz(t, 0.02, 'bandpass', 3500, 3, 0.06, 0.001, bus(-0.3));
      break;
    }
    case 'click': {
      const o = bus(pan);
      nz(t, 0.02, 'highpass', 2500, 1, 0.18, 0.001, o);
      tone('square', 900, t, 0.001, 0.025, 0.03, o);
      break;
    }
    case 'denied': {
      if (limit('den', 150)) return;
      tone('triangle', 150, t, 0.002, 0.2, 0.12, bus(pan), 110);
      break;
    }
    case 'warn': {
      if (limit('warn', 4000)) return;
      const o = bus(0, 0.2);
      tone('square', 660, t, 0.003, 0.05, 0.1, o);
      tone('square', 660, t + 0.18, 0.003, 0.05, 0.1, o);
      break;
    }
    case 'deliver': {
      const o = bus(pan, 0.2);
      tone('sine', 200, t, 0.002, 0.45, 0.1, o, 110);
      nz(t, 0.07, 'lowpass', 650, 1, 0.4, 0.002, o);
      break;
    }
    case 'repair': {
      const o = bus(pan, 0.2);
      for (let i = 0; i < 3; i++) tone('triangle', 1800 + i * 300, t + i * 0.06, 0.001, 0.06, 0.08, o);
      break;
    }
    case 'contract': {
      const o = bus(0, 0.25);
      tone('sine', 150, t, 0.002, 0.6, 0.12, o, 55);
      nz(t, 0.05, 'lowpass', 900, 1, 0.4, 0.001, o);
      nz(t + 0.01, 0.06, 'bandpass', 2600, 2, 0.12, 0.002, o);
      break;
    }
  }
}

/** Son de travail d'un poste (cadence limitée). */
export function workSound(station: number, tier: number, pan: number): void {
  if (!can()) return;
  if (limit(`w${station}`, tier >= 3 ? 220 : 120)) return;
  const t = now();
  const o = bus(pan, 0.12);
  if (tier >= 3) {
    tone('sine', 600 + station * 120, t, 0.004, 0.025, 0.08, o, 900 + station * 150);
    return;
  }
  if (station === 0) nz(t, 0.18, 'bandpass', 2600, 2, 0.05, 0.002, o);
  else if (station === 1) {
    tone('sine', tier ? 110 : 150, t, 0.002, 0.25, 0.15, o, 45);
    nz(t, 0.06, 'bandpass', 2200, 6, 0.1, 0.001, o);
  } else if (station === 2) tone('triangle', 900, t, 0.004, 0.04, 0.12, o, 1300);
  else tone('sine', 1760, t, 0.002, 0.04, 0.1, o);
}

/** Ambiance continue : le ronron suit l'activité et la vitesse du temps. */
export function ambience(activity: number, speed: number, workers: number): void {
  if (!can() || !AU.humG || !AU.hum || !AU.hum2 || !AU.mach || !AU.machF) return;
  const t = now();
  AU.humG.gain.setTargetAtTime(0.03 + 0.03 * Math.min(1, activity) + 0.02 * (speed - 1), t, 0.2);
  const f = 44 + 16 * (speed - 1) + Math.min(workers, 30) * 0.3;
  AU.hum.frequency.setTargetAtTime(f, t, 0.2);
  AU.hum2.frequency.setTargetAtTime(f * 1.012, t, 0.2);
  AU.mach.gain.setTargetAtTime(0.012 * Math.min(1, activity) * (0.6 + 0.4 * speed), t, 0.3);
  AU.machF.frequency.setTargetAtTime(700 + 300 * speed, t, 0.3);
}

export function suspendAudio(hidden: boolean): void {
  if (!AU.c) return;
  if (hidden) void AU.c.suspend();
  else if (AU.on) void AU.c.resume();
}
