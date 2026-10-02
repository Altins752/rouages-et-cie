/** Particules du rendu (étincelles, poussière, fumée). Purement visuelles, coordonnées du monde. */

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  life: number;
  max: number;
  size: number;
  col: string;
  smoke: boolean;
  glow: boolean;
}

const MAX = 700;
export const particles: Particle[] = [];
let budget = 1;

/** Réduit la quantité de particules (mouvement réduit, grand nombre de halls). */
export function setParticleBudget(b: number): void {
  budget = b;
}

export function part(o: Partial<Particle> & { x: number; y: number }): void {
  if (particles.length >= MAX * budget) return;
  const life = o.life ?? 0.6;
  particles.push({ vx: 0, vy: 0, g: 0, size: 1.5, col: '#ffd25e', smoke: false, glow: false, ...o, life, max: life });
}

export function sparks(x: number, y: number, n: number, col = '#ffd25e', rnd = Math.random): void {
  const k = Math.max(1, Math.round(n * budget));
  for (let i = 0; i < k; i++) {
    const a = rnd() * Math.PI * 2;
    const v = 30 + rnd() * 70;
    part({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, g: 220, life: 0.3 + rnd() * 0.3, col, glow: true });
  }
}

export function dust(x: number, y: number, n = 14): void {
  for (let i = 0; i < n * budget; i++) {
    part({ x: x + (Math.random() - 0.5) * 30, y, vx: (Math.random() - 0.5) * 50, vy: -10 - Math.random() * 25, g: 20, life: 0.8, size: 3, col: 'rgba(190,170,140,.6)', smoke: true });
  }
}

export function smoke(x: number, y: number, col = 'rgba(60,60,64,.55)', size = 3, life = 1.6): void {
  part({ x: x + (Math.random() - 0.5) * 8, y, vx: 3 + Math.random() * 4, vy: -12 - Math.random() * 6, g: -3, life, size, col, smoke: true });
}

export function updateParticles(dt: number): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.vy += p.g * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}
