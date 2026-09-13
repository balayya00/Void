/**
 * Deterministic pseudo-random number generator.
 *
 * Every procedural level is generated from a stable integer seed, so the same
 * level number always produces the same puzzle (important for fairness, for
 * tests, and for "retry" giving you the puzzle you were already solving).
 */

/** Convert a string or number into a 32-bit unsigned integer seed. */
export function hashSeed(input) {
  const str = String(input);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — tiny, fast, good enough distribution for puzzles. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed) {
    this.seed = typeof seed === 'number' ? seed >>> 0 : hashSeed(seed);
    this._next = mulberry32(this.seed);
    this._count = 0;
  }

  /** float in [0,1) */
  next() {
    this._count++;
    return this._next();
  }

  /** integer in [min,max] inclusive */
  int(min, max) {
    if (max < min) [min, max] = [max, min];
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** float in [min,max) */
  float(min, max) {
    return min + this.next() * (max - min);
  }

  bool(p = 0.5) {
    return this.next() < p;
  }

  /** random element */
  pick(arr) {
    if (!arr || arr.length === 0) throw new Error('Rng.pick: empty array');
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** n distinct elements (or as many as available) */
  sample(arr, n) {
    const copy = arr.slice();
    shuffle(copy, this);
    return copy.slice(0, Math.min(n, copy.length));
  }

  /** weighted pick: entries [{ value, weight }] */
  weighted(entries) {
    const total = entries.reduce((s, e) => s + Math.max(0, e.weight), 0);
    if (total <= 0) return entries[0] && entries[0].value;
    let r = this.next() * total;
    for (const e of entries) {
      r -= Math.max(0, e.weight);
      if (r <= 0) return e.value;
    }
    return entries[entries.length - 1].value;
  }

  /** shuffle a copy */
  shuffle(arr) {
    const copy = arr.slice();
    shuffle(copy, this);
    return copy;
  }

  /** fork a child generator (independent stream, still deterministic) */
  fork(salt = '') {
    return new Rng(`${this.seed}:${salt}:${this._count}`);
  }
}

/** In-place Fisher–Yates with an Rng (or Math.random fallback). */
export function shuffle(arr, rng) {
  const rand = rng ? () => rng.next() : Math.random;
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Range helper: ints(min,max) -> [min..max] */
export function ints(min, max) {
  const out = [];
  for (let i = min; i <= max; i++) out.push(i);
  return out;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
