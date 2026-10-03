/**
 * Textures procédurales, générées au chargement à partir d'un bruit à graine (aucun fichier image).
 * Chaque texture est une tuile répétable ; TEX texels par unité du monde, pour une échelle commune.
 */

export const TEX = 2;

type RGB = [number, number, number];

// ------------------------------------------------------------------ Bruit

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t: number) => t * t * (3 - 2 * t);

/** Bruit de valeur lissé, répétable sur `period` mailles. */
function vnoise(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = fade(x - xi);
  const fy = fade(y - yi);
  const m = (v: number) => ((v % period) + period) % period;
  const a = hash(m(xi), m(yi), seed);
  const b = hash(m(xi + 1), m(yi), seed);
  const c = hash(m(xi), m(yi + 1), seed);
  const d = hash(m(xi + 1), m(yi + 1), seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** Bruit fractal 0–1 répétable sur une tuile de w × w texels (cellule de base : w / period). */
function fbm(x: number, y: number, w: number, period: number, oct: number, seed: number): number {
  let s = 0;
  let a = 0.5;
  let n = 0;
  let p = period;
  for (let o = 0; o < oct; o++) {
    s += a * vnoise((x / w) * p, (y / w) * p, p, seed + o * 17);
    n += a;
    a *= 0.5;
    p *= 2;
  }
  return s / n;
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/** Remplit chaque texel avec fn(x, y) → [r, g, b]. */
function pixels(c: CanvasRenderingContext2D, w: number, h: number, fn: (x: number, y: number) => RGB): void {
  const img = c.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = fn(x, y);
    const i = (y * w + x) * 4;
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
    d[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
}

const hex = (s: string): RGB => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const add = (c: RGB, k: number): RGB => [c[0] + k, c[1] + k, c[2] + k];
const mul = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const lerp = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

// ------------------------------------------------------------------ Générateurs

/** Briques rouges, joints de mortier en creux, suie irrégulière. */
function brick(): HTMLCanvasElement {
  const W = 160;
  const H = 64;
  const [cv, c] = canvas(W, H);
  const pal = ['#7a3b2a', '#8a4430', '#6e3326', '#934a35', '#7f4a3a', '#6a3a2c'].map(hex);
  const mortar = hex('#5a5048');
  pixels(c, W, H, (x, y) => {
    const row = Math.floor(y / 16);
    const off = row % 2 ? 20 : 0;
    const bx = Math.floor(((x + off) % W) / 40);
    const lx = (x + off) % 40;
    const ly = y % 16;
    const n = fbm(x, y, W, 8, 3, 3);
    if (lx < 2 || ly < 2) return add(mortar, (n - 0.5) * 30 - (lx < 1 || ly < 1 ? 14 : 0));
    const id = row * 7 + bx;
    let col = pal[Math.floor(hash(id, 1, 9) * pal.length)];
    col = add(col, (n - 0.5) * 34 + (hash(x, y, 4) - 0.5) * 14);
    if (hash(id, 3, 2) < 0.18) col = mul(col, 0.72);
    if (ly === 2 || lx === 2) col = add(col, 16);
    if (ly === 15 || lx === 39) col = add(col, -22);
    return col;
  });
  return cv;
}

/** Parpaings peints (années 70) : peinture un peu passée, éclats qui laissent voir le béton. */
function block(paint: string, chips: number): () => HTMLCanvasElement {
  return () => {
    const W = 160;
    const H = 80;
    const [cv, c] = canvas(W, H);
    const base = hex(paint);
    const bare = hex('#8d8c86');
    pixels(c, W, H, (x, y) => {
      const row = Math.floor(y / 40);
      const lx = (x + (row % 2 ? 40 : 0)) % 80;
      const ly = y % 40;
      const n = fbm(x, y, W, 10, 3, 11);
      const fine = hash(x, y, 5) - 0.5;
      let col = add(base, (n - 0.5) * 16 + fine * 8);
      const chip = fbm(x, y, W, 16, 3, 23);
      if (chip > 1 - chips) col = add(bare, fine * 20 - 6);
      else if (chip > 1 - chips - 0.02) col = add(col, -18);
      if (lx < 2 || ly < 2) col = add(col, -26);
      else if (ly === 2) col = add(col, 10);
      return col;
    });
    return cv;
  };
}

/** Bardage acier nervuré (années 90) : crêtes claires, flancs sombres, coulures verticales. */
function cladding(): HTMLCanvasElement {
  const W = 48;
  const H = 128;
  const [cv, c] = canvas(W, H);
  const base = hex('#8e9aa6');
  pixels(c, W, H, (x, y) => {
    const p = x % 24;
    const prof = p < 6 ? 18 : p < 9 ? -16 : p < 21 ? 0 : -8;
    const streak = fbm(x * 6, y * 0.25, W * 6, 8, 2, 31) - 0.5;
    return add(base, prof + streak * 18 + (hash(x, y, 7) - 0.5) * 6);
  });
  return cv;
}

/** Panneaux sandwich blancs (aujourd'hui) : joints fins, micro-nervures. */
function panel(): HTMLCanvasElement {
  const W = 200;
  const H = 120;
  const [cv, c] = canvas(W, H);
  const base = hex('#dfe3e6');
  pixels(c, W, H, (x, y) => {
    let col = add(base, (fbm(x, y, W, 4, 2, 41) - 0.5) * 8 + (hash(x, y, 3) - 0.5) * 3);
    if (y % 6 === 0) col = add(col, -4);
    if (x < 2 || y < 2) col = add(col, x < 1 || y < 1 ? -40 : 12);
    return col;
  });
  return cv;
}

/** Paroi de l'usine noire : composite sombre, maille hexagonale. */
function blackWall(): HTMLCanvasElement {
  const W = 24;
  const H = 28;
  const [cv, c] = canvas(W, H);
  pixels(c, W, H, (x, y) => {
    const n = hash(x, y, 13) * 4;
    const cx = (x % 12) - 6;
    const cy = (y % 14) - 7 + (Math.floor(x / 12) % 2 ? 7 : 0);
    const d = Math.hypot(cx, ((cy + 14) % 14) - 7);
    return d < 2 ? [24 + n, 28 + n, 34 + n] : [16 + n, 18 + n, 22 + n];
  });
  return cv;
}

/** Pavés de la forge : cellules irrégulières (Voronoï répétable), joints de terre, suie. */
function pavers(): HTMLCanvasElement {
  const W = 128;
  const [cv, c] = canvas(W, W);
  const pts: [number, number, number][] = [];
  for (let i = 0; i < 14; i++) pts.push([hash(i, 1, 51) * W, hash(i, 2, 51) * W, i]);
  const pal = ['#5e5853', '#645d56', '#5a5550', '#69625a', '#57524d'].map(hex);
  pixels(c, W, W, (x, y) => {
    let d1 = 1e9;
    let d2 = 1e9;
    let id = 0;
    for (const [px, py, i] of pts) for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      const d = Math.hypot(x - px - ox * W, y - py - oy * W);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        id = i;
      } else if (d < d2) d2 = d;
    }
    const edge = d2 - d1;
    const n = fbm(x, y, W, 8, 3, 57) - 0.5;
    let col = add(pal[id % pal.length], n * 18 + (hash(x, y, 2) - 0.5) * 8);
    if (edge < 2) col = add(hex('#46403a'), n * 12);
    else if (edge < 3.5) col = add(col, -7);
    else col = add(col, Math.min(6, (edge - 3.5) * 1));
    return col;
  });
  return cv;
}

/** Béton de dalle : marbrure, granulats, fines fissures. */
function concrete(tone: string, cracks: number): () => HTMLCanvasElement {
  return () => {
    const W = 256;
    const [cv, c] = canvas(W, W);
    const base = hex(tone);
    pixels(c, W, W, (x, y) => {
      const n = fbm(x, y, W, 4, 4, 61) - 0.5;
      const g = hash(x, y, 8);
      let col = add(base, n * 26 + (g - 0.5) * 10);
      if (g > 0.985) col = add(col, -24);
      else if (g < 0.012) col = add(col, 18);
      return col;
    });
    c.strokeStyle = 'rgba(30,30,30,.35)';
    c.lineWidth = 0.8;
    for (let k = 0; k < cracks; k++) {
      let x = hash(k, 1, 71) * W;
      let y = hash(k, 2, 71) * W;
      let a = hash(k, 3, 71) * Math.PI * 2;
      c.beginPath();
      c.moveTo(x, y);
      for (let s = 0; s < 22; s++) {
        a += (hash(k, s, 73) - 0.5) * 0.9;
        x += Math.cos(a) * 4;
        y += Math.sin(a) * 4;
        c.lineTo(x, y);
      }
      c.stroke();
    }
    return cv;
  };
}

/** Résine de sol (années 90) : gris-vert lisse, paillettes. */
function epoxy(): HTMLCanvasElement {
  const W = 128;
  const [cv, c] = canvas(W, W);
  const base = hex('#6c7775');
  pixels(c, W, W, (x, y) => {
    const n = fbm(x, y, W, 3, 3, 81) - 0.5;
    const g = hash(x, y, 9);
    return add(base, n * 12 + (g > 0.97 ? 14 : g < 0.03 ? -10 : 0));
  });
  return cv;
}

/** Béton poli clair (aujourd'hui) : grandes marbrures douces, reflets. */
function polished(): HTMLCanvasElement {
  const W = 256;
  const [cv, c] = canvas(W, W);
  const base = hex('#b3b8bc');
  pixels(c, W, W, (x, y) => {
    const n = fbm(x, y, W, 3, 4, 91) - 0.5;
    const s = fbm(x * 0.2, y * 3, W * 0.2, 2, 2, 97) - 0.5;
    return add(base, n * 18 + s * 8 + (hash(x, y, 1) - 0.5) * 4);
  });
  return cv;
}

/** Bois d'établi : veinure, lames, nœuds. */
function wood(): HTMLCanvasElement {
  const W = 128;
  const H = 32;
  const [cv, c] = canvas(W, H);
  const a = hex('#8a5a33');
  const b = hex('#6b4426');
  pixels(c, W, H, (x, y) => {
    const n = fbm(x, y * 4, W, 4, 3, 101);
    const v = Math.sin((y + n * 6) * 1.7) * 0.5 + 0.5;
    let col = lerp(a, b, v * 0.6 + (hash(x, y, 4) - 0.5) * 0.1);
    if (y % 11 === 0) col = add(col, -30);
    const kx = x - 84;
    const ky = y - 18;
    if (kx * kx + ky * ky * 4 < 10) col = mul(col, 0.7);
    return col;
  });
  return cv;
}

/** Fonte peinte au marteau (vert machine), éclats d'usage. */
function painted(paint: string, chips: number, seed: number): () => HTMLCanvasElement {
  return () => {
    const W = 64;
    const [cv, c] = canvas(W, W);
    const base = hex(paint);
    const metal = hex('#4a4d52');
    pixels(c, W, W, (x, y) => {
      const ham = fbm(x, y, W, 16, 2, seed) - 0.5;
      const grime = fbm(x, y, W, 3, 2, seed + 5) - 0.5;
      let col = add(base, ham * 18 + grime * 16);
      const ch = fbm(x, y, W, 8, 3, seed + 9);
      if (ch > 1 - chips) col = add(metal, (hash(x, y, 3) - 0.5) * 20);
      else if (ch > 1 - chips - 0.025) col = add(col, 22);
      return col;
    });
    return cv;
  };
}

/** Acier brossé. */
function brushed(): HTMLCanvasElement {
  const W = 128;
  const H = 32;
  const [cv, c] = canvas(W, H);
  const base = hex('#a3aab2');
  pixels(c, W, H, (x, y) => {
    const s = fbm(x * 0.1, y * 2, W * 0.1, 2, 3, 111) - 0.5;
    return add(base, s * 30 + (hash(x, y, 6) - 0.5) * 8);
  });
  return cv;
}

/** Tôle larmée : losanges en relief, alternés. */
function diamond(): HTMLCanvasElement {
  const W = 24;
  const [cv, c] = canvas(W, W);
  pixels(c, W, W, (x, y) => {
    const base = 104 + (hash(x, y, 2) - 0.5) * 10;
    return [base, base + 4, base + 10];
  });
  const lozenge = (cx: number, cy: number, a: number) => {
    c.save();
    c.translate(cx, cy);
    c.rotate(a);
    c.fillStyle = 'rgba(30,33,38,.55)';
    c.fillRect(-4, 0, 9, 2.4);
    c.fillStyle = 'rgba(220,226,232,.55)';
    c.fillRect(-4, -1, 8, 1.4);
    c.restore();
  };
  for (const [x, y, a] of [[6, 6, 0.7], [18, 18, 0.7], [18, 6, -0.7], [6, 18, -0.7], [-6, 18, 0.7], [30, 6, 0.7]] as const) lozenge(x, y, a);
  return cv;
}

/** Tôle perforée (carters de protection). */
function perforated(): HTMLCanvasElement {
  const W = 8;
  const [cv, c] = canvas(W, W);
  pixels(c, W, W, (x, y) => {
    const d = Math.hypot((x % 4) - 1.5, (y % 4) - 1.5);
    return d < 1.1 ? [20, 22, 25] : [92, 98, 106];
  });
  return cv;
}

/** Enrobé de la route. */
function asphalt(): HTMLCanvasElement {
  const W = 128;
  const [cv, c] = canvas(W, W);
  pixels(c, W, W, (x, y) => {
    const n = fbm(x, y, W, 6, 3, 121) - 0.5;
    const g = hash(x, y, 3);
    const v = 58 + n * 16 + (g > 0.9 ? 16 : g < 0.1 ? -10 : 0);
    return [v, v + 1, v + 4];
  });
  return cv;
}

/** Herbe rase et terre. */
function grass(): HTMLCanvasElement {
  const W = 128;
  const [cv, c] = canvas(W, W);
  const g1 = hex('#5f7247');
  const g2 = hex('#77804f');
  const dirt = hex('#7b6a52');
  pixels(c, W, W, (x, y) => {
    const n = fbm(x, y, W, 4, 4, 131);
    const blade = hash(x, Math.floor(y / 3), 5);
    let col = lerp(g1, g2, n);
    const d = fbm(x, y, W, 4, 3, 137);
    if (d > 0.62) col = lerp(col, dirt, Math.min(0.45, (d - 0.62) * 3));
    return add(col, (blade - 0.5) * 16);
  });
  return cv;
}

/** Gravillons (parking, cour). */
function gravel(): HTMLCanvasElement {
  const W = 64;
  const [cv, c] = canvas(W, W);
  pixels(c, W, W, (x, y) => {
    const g = hash(Math.floor(x / 2), Math.floor(y / 2), 7);
    const v = 112 + (g - 0.5) * 50 + (fbm(x, y, W, 4, 2, 141) - 0.5) * 20;
    return [v, v - 4, v - 10];
  });
  return cv;
}

/** Tôle ondulée horizontale (toits). */
function roofSheet(): HTMLCanvasElement {
  const W = 64;
  const H = 16;
  const [cv, c] = canvas(W, H);
  pixels(c, W, H, (x, y) => {
    const v = 92 + Math.sin((y / H) * Math.PI * 4) * 14 + (fbm(x, y, W, 4, 2, 151) - 0.5) * 18;
    return [v, v + 4, v + 8];
  });
  return cv;
}

/** Peinture industrielle unie, légèrement granuleuse. */
function flat(paint: string, grain: number, seed: number): () => HTMLCanvasElement {
  return () => {
    const W = 64;
    const [cv, c] = canvas(W, W);
    const base = hex(paint);
    pixels(c, W, W, (x, y) => add(base, (fbm(x, y, W, 6, 2, seed) - 0.5) * grain + (hash(x, y, seed) - 0.5) * grain * 0.5));
    return cv;
  };
}

/** Patine et crasse : à poser par-dessus en multiplication (usure des machines, coins). */
function grime(): HTMLCanvasElement {
  const W = 128;
  const [cv, c] = canvas(W, W);
  pixels(c, W, W, (x, y) => {
    const n = fbm(x, y, W, 5, 4, 161);
    const v = 255 - Math.max(0, n - 0.42) * 300;
    return [v, v * 0.97, v * 0.92];
  });
  return cv;
}

const GEN: Record<string, () => HTMLCanvasElement> = {
  brick,
  blockCream: block('#d9d0b4', 0.06),
  blockGreen: block('#6f8f78', 0.1),
  cladding,
  panel,
  blackWall,
  pavers,
  concrete: concrete('#7f807c', 5),
  concreteDark: concrete('#5d5f60', 3),
  epoxy,
  polished,
  wood,
  castGreen: painted('#5d7a6c', 0.07, 171),
  castGrey: painted('#6c7178', 0.05, 177),
  orange: painted('#c4621f', 0.03, 181),
  yellow: flat('#e8a90a', 14, 191),
  darkMetal: flat('#2c2f35', 10, 197),
  graphite: flat('#17191d', 6, 199),
  brushed,
  diamond,
  perforated,
  asphalt,
  grass,
  gravel,
  roofSheet,
  grime,
  rust: painted('#7b4a2e', 0.25, 211),
};

export type TexName = keyof typeof GEN;

/**
 * Échelle de chaque matière par rapport à sa tuile : une échelle commune pour tout le jeu
 * (une personne mesure 30 unités ; une brique, un pavé, une tôle gardent des tailles plausibles).
 */
const SCALE: Partial<Record<TexName, number>> = {
  brick: 0.42, pavers: 0.42, grass: 0.7, gravel: 0.6, blockCream: 0.5, blockGreen: 0.5, cladding: 0.6, panel: 0.75, blackWall: 0.7, diamond: 0.7, perforated: 0.8,
};

const CACHE = new Map<string, HTMLCanvasElement>();

/** Tuile d'une matière ; lod > 0 : réduite de moitié par niveau (vue de loin, sans scintillement). */
export function texture(name: TexName, lod = 0): HTMLCanvasElement {
  const key = `${name}|${lod}`;
  let t = CACHE.get(key);
  if (!t) {
    if (lod === 0) t = GEN[name]();
    else {
      const src = texture(name, lod - 1);
      t = document.createElement('canvas');
      t.width = Math.max(1, src.width >> 1);
      t.height = Math.max(1, src.height >> 1);
      const c = t.getContext('2d')!;
      c.imageSmoothingQuality = 'high';
      c.drawImage(src, 0, 0, t.width, t.height);
    }
    CACHE.set(key, t);
  }
  return t;
}

let lodPx = 99;

/** Pixels de l'écran par unité du monde : choisit le niveau de détail des motifs. */
export function setTexLod(pxPerUnit: number): void {
  lodPx = pxPerUnit;
}

/** Les sprites mis en cache se dessinent toujours au détail maximal. */
export function fullDetail<T>(fn: () => T): T {
  const k = lodPx;
  lodPx = 99;
  try {
    return fn();
  } finally {
    lodPx = k;
  }
}

const PATS = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern>>();

/** Motif répétable à l'échelle du monde (TEX texels par unité), pour un contexte donné. */
export function pat(c: CanvasRenderingContext2D, name: TexName, scale = 1): CanvasPattern | string {
  let m = PATS.get(c);
  if (!m) {
    m = new Map();
    PATS.set(c, m);
  }
  const k = scale * (SCALE[name] ?? 1);
  // texels par pixel affiché : au-delà de 2, on passe à la tuile réduite
  const density = TEX / k / lodPx;
  const lod = density > 4 ? 2 : density > 2 ? 1 : 0;
  const key = `${name}|${k}|${lod}`;
  let p = m.get(key);
  if (!p) {
    p = c.createPattern(texture(name, lod), 'repeat') ?? undefined;
    if (!p) return '#666';
    const s = (k / TEX) * (1 << lod);
    if (typeof DOMMatrix !== 'undefined' && p.setTransform) p.setTransform(new DOMMatrix().scale(s, s));
    m.set(key, p);
  }
  return p;
}

/** Prépare les textures pendant l'écran titre, pour ne pas saccader la première image. */
export function warmTextures(names: TexName[] = Object.keys(GEN) as TexName[]): void {
  for (const n of names) texture(n);
}
