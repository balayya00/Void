/**
 * Shared generation helpers used by every puzzle family.
 *
 * The single most important guarantee in this file: `buildChoices()` always
 * places the *correct* value inside the option list. A puzzle can therefore
 * never present a question whose answer is impossible to select.
 */

import { normalizeShape, shapeKey, varyShape, SHAPES, FILLS } from '../utils/shapes.js';

// ---------------------------------------------------------------------------
// Choice building
// ---------------------------------------------------------------------------

/**
 * @param {{correct:any, distractors:any[], rng:object, prefix?:string,
 *          equals?:(a:any,b:any)=>boolean, render?:(v:any,i:number)=>any}} cfg
 * @returns {{options:Array<{value:any,token:string,label:string,content:any,index:number}>,
 *            answerToken:string, answerIndex:number}}
 */
export function buildChoices(cfg) {
  const equals = cfg.equals || ((a, b) => a === b);
  const prefix = cfg.prefix || 'opt';
  const uniq = [];
  for (const d of cfg.distractors) {
    if (equals(d, cfg.correct)) continue;
    if (uniq.some((u) => equals(u, d))) continue;
    uniq.push(d);
  }
  const pool = [cfg.correct, ...uniq];
  const shuffled = cfg.rng ? cfg.rng.shuffle(pool) : pool;
  const options = shuffled.map((value, index) => ({
    value,
    index,
    token: `${prefix}:${index}`,
    label: cfg.labelFor ? cfg.labelFor(value, index) : String(value),
    // Rendering is best-effort: puzzles that want DOM options render them in
    // mount() from `value`, and tooling without a document (the level report,
    // node scripts) must still be able to generate params.
    content: cfg.render ? safeRender(cfg.render, value, index) : String(value)
  }));
  const answerIndex = options.findIndex((o) => equals(o.value, cfg.correct));
  if (answerIndex === -1) throw new Error('buildChoices: correct value missing from options');
  return { options, answerToken: `${prefix}:${answerIndex}`, answerIndex, correctValue: cfg.correct };
}

/**
 * Call a choice renderer only when a DOM exists and it behaves; otherwise fall
 * back to the plain text label. Keeps `generate()` usable outside the browser.
 */
function safeRender(render, value, index) {
  if (typeof document === 'undefined') return String(index + 1);
  try {
    const node = render(value, index);
    return node === undefined || node === null ? String(index + 1) : node;
  } catch (err) {
    return String(index + 1);
  }
}

/** Numeric distractors near the answer. */
export function numericDistractors(answer, count, rng, opts = {}) {
  const out = [];
  const min = opts.min ?? answer - (opts.spread ?? 12);
  const max = opts.max ?? answer + (opts.spread ?? 12);
  const banned = new Set(opts.banned || []);
  let guard = 0;
  const patterns = opts.patterns || [1, -1, 2, -2, 3, -3, 5, -5, 10, -10, 4, -4];
  let pi = 0;
  while (out.length < count && guard++ < 400) {
    let candidate;
    if (pi < patterns.length && rng.bool(0.7)) {
      candidate = answer + patterns[pi];
      pi++;
    } else {
      candidate = rng.int(min, max);
    }
    if (candidate === answer || banned.has(candidate) || out.includes(candidate)) continue;
    if (candidate < (opts.floor ?? -9999)) continue;
    out.push(candidate);
  }
  // deterministic padding if the random search struggled
  let filler = 1;
  while (out.length < count) {
    const candidate = answer + filler * (opts.step || 1) * (filler % 2 ? 1 : -1);
    if (candidate !== answer && !out.includes(candidate) && !banned.has(candidate)) out.push(candidate);
    filler++;
  }
  return out;
}

/** Shape distractors that vary a controllable number of dimensions. */
export function shapeDistractors(base, count, rng, opts = {}) {
  const dims = opts.dims || ['shape', 'fill', 'rot', 'scale'];
  const out = [];
  const seen = new Set([shapeKey(base)]);
  let guard = 0;
  while (out.length < count && guard++ < 500) {
    const dim = rng.pick(dims);
    const delta = dim === 'rot' ? rng.pick([1, 1, 2, 3]) : rng.pick([1, 1, 2]);
    const candidate = varyShape(base, dim, delta, rng);
    const key = shapeKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  while (out.length < count) {
    const candidate = varyShape(base, 'shape', 1, { pick: (arr) => arr[out.length % arr.length] });
    const key = shapeKey(candidate) + out.length;
    if (!seen.has(key)) { seen.add(key); out.push(candidate); }
    else out.push({ ...candidate, rot: (candidate.rot + 15 * out.length) % 360 });
  }
  return out;
}

/** Words / labels distractors: swap letters, alter digits, etc. */
export function textDistractors(text, count, rng) {
  const out = [];
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let guard = 0;
  while (out.length < count && guard++ < 300) {
    const chars = text.split('');
    const muts = rng.int(1, Math.min(2, chars.length - 1));
    for (let i = 0; i < muts; i++) {
      const idx = rng.int(0, chars.length - 1);
      chars[idx] = rng.pick(alphabet.split(''));
    }
    const candidate = chars.join('');
    if (candidate !== text && !out.includes(candidate)) out.push(candidate);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Shape sequencing rules (used by several pattern puzzles)
// ---------------------------------------------------------------------------

export const RULES = {
  /** rotate the same glyph by `step` degrees each time */
  rotation: (base, i, step) => ({ ...normalizeShape(base), rot: (normalizeShape(base).rot + step * i) % 360 }),
  /** cycle the fill pattern each step */
  fillCycle: (base, i) => {
    const b = normalizeShape(base);
    return { ...b, fill: FILLS[(FILLS.indexOf(b.fill) + i) % FILLS.length] };
  },
  /** shrink or grow */
  scaleStep: (base, i, step) => {
    const b = normalizeShape(base);
    const s = Math.max(0.62, Math.min(1.15, Number((b.scale + step * i).toFixed(3))));
    return { ...b, scale: s };
  },
  /** cycle through shapes */
  shapeCycle: (base, i, pool) => {
    const b = normalizeShape(base);
    const list = pool && pool.length ? pool : SHAPES;
    const start = list.indexOf(b.shape);
    return { ...b, shape: list[(start + i + list.length * 4) % list.length] };
  },
  /** alternate between two states */
  alternate: (base, i, alt, dim) => (i % 2 === 0 ? normalizeShape(base) : varyShape(base, dim || 'fill', 1, { pick: (a) => (alt && a.includes(alt) ? alt : a[0]) }))
};

/** Generic arithmetic / abstract number sequences with a known next term. */
export const NUMBER_RULES = [
  { id: 'arith', name: 'add a constant', make: (rng, d) => { const a = rng.int(1, 4 + d); const s = rng.int(2 + d, 6 + d * 2); return { first: a, next: (n, i) => n + s, label: `+${s}` }; } },
  { id: 'geom', name: 'multiply by a constant', make: (rng, d) => { const f = rng.int(2, d > 5 ? 4 : 3); const a = rng.int(1, 3); return { first: a, next: (n) => n * f, label: `×${f}` }; } },
  { id: 'fib', name: 'each term is the sum of the two before', make: (rng) => { const a = rng.int(1, 3); const b = rng.int(1, 4); let s = [a, b]; return { first: a, seed: s, next: (n, i, arr) => arr[arr.length - 1] + arr[arr.length - 2], label: 'sum of previous two' }; } },
  { id: 'squares', name: 'perfect squares', make: (rng, d) => { const off = rng.int(-2, 2); return { gen: (i) => (i + 1 + d) * (i + 1 + d) + off, label: 'squares' }; } },
  { id: 'alt', name: 'alternating operations', make: (rng) => { const a = rng.int(2, 6); const b = rng.int(1, 4); return { first: a, next: (n, i) => (i % 2 === 0 ? n + b * 2 : n - b), label: `+${b * 2} then −${b}` }; } },
  { id: 'pow2', name: 'powers of two', make: (rng, d) => ({ gen: (i) => 2 ** (i + 1 + Math.floor(d / 3)), label: 'powers of two' }) },
  { id: 'doubleminus', name: 'double then subtract', make: (rng) => { const k = rng.int(1, 3); return { first: rng.int(3, 7), next: (n) => n * 2 - k, label: `×2 −${k}` }; } },
  { id: 'digitsum', name: 'add the previous term’s digits', make: (rng) => ({ first: rng.int(11, 19), next: (n) => n + String(n).split('').reduce((s, c) => s + Number(c), 0), label: 'add digit sum' }) }
];

/**
 * Produce a sequence of `length` terms plus the next term, from a rule.
 * Returns { terms:[...], answer, ruleId, ruleLabel }
 */
export function numberSequence(rng, difficulty, length = 5, ruleId = null) {
  const rule = ruleId
    ? NUMBER_RULES.find((r) => r.id === ruleId) || rng.pick(NUMBER_RULES)
    : rng.pick(NUMBER_RULES);
  const cfg = rule.make(rng, difficulty);
  const terms = [];
  if (cfg.gen) {
    for (let i = 0; i < length; i++) terms.push(cfg.gen(i));
  } else if (cfg.seed) {
    terms.push(cfg.seed[0], cfg.seed[1]);
    while (terms.length < length) terms.push(cfg.next(terms[terms.length - 1], terms.length, terms));
  } else {
    terms.push(cfg.first);
    while (terms.length < length) terms.push(cfg.next(terms[terms.length - 1], terms.length - 1, terms));
  }
  const answer = cfg.gen
    ? cfg.gen(length)
    : terms.length >= 2 && rule.id === 'fib'
      ? terms[terms.length - 1] + terms[terms.length - 2]
      : cfg.next(terms[terms.length - 1], terms.length - 1, terms);
  return { terms, answer, ruleId: rule.id, ruleLabel: cfg.label || rule.name };
}

/** Shape-based sequence with a known next glyph. */
export function shapeSequence(rng, difficulty, length = 5) {
  const base = { shape: rng.pick(SHAPES), fill: rng.pick(FILLS), rot: rng.pick([0, 0, 45, 90, 180]), scale: 1 };
  const mode = rng.pick(['rot', 'fill', 'scale', 'shape']);
  const step = mode === 'rot' ? rng.pick([30, 45, 60, 90]) : mode === 'scale' ? rng.pick([-0.08, 0.08]) : 1;
  const terms = [];
  for (let i = 0; i < length; i++) {
    if (mode === 'rot') terms.push({ ...base, rot: (base.rot + step * i) % 360 });
    else if (mode === 'fill') terms.push({ ...base, fill: FILLS[(FILLS.indexOf(base.fill) + i) % FILLS.length] });
    else if (mode === 'scale') {
      const s = Math.max(0.6, Math.min(1.15, base.scale + step * i));
      terms.push({ ...base, scale: Number(s.toFixed(2)) });
    } else {
      const start = SHAPES.indexOf(base.shape);
      terms.push({ ...base, shape: SHAPES[(start + i) % SHAPES.length] });
    }
  }
  let answer;
  if (mode === 'rot') answer = { ...base, rot: (base.rot + step * length) % 360 };
  else if (mode === 'fill') answer = { ...base, fill: FILLS[(FILLS.indexOf(base.fill) + length) % FILLS.length] };
  else if (mode === 'scale') {
    const s = Math.max(0.6, Math.min(1.15, base.scale + step * length));
    answer = { ...base, scale: Number(s.toFixed(2)) };
  } else {
    const start = SHAPES.indexOf(base.shape);
    answer = { ...base, shape: SHAPES[(start + length) % SHAPES.length] };
  }
  if (shapeKey(answer) === shapeKey(terms[terms.length - 1])) {
    // avoid a degenerate sequence where the next term equals the last one
    answer = varyShape(answer, 'fill', 1, rng);
  }
  return { terms, answer, mode, step };
}

/** Grid dimensions scaled by difficulty, kept inside mobile-safe limits. */
export function scaledSize(difficulty, easy = 3, hard = 6) {
  return Math.max(easy, Math.min(hard, easy + Math.floor((difficulty - 1) / 2.4)));
}

/** Guarantee a permutation is not the identity (prevents trivially "solved" states). */
export function derangedShuffle(rng, items) {
  if (items.length < 2) return items.slice();
  let out = rng.shuffle(items);
  let guard = 0;
  while (out.every((v, i) => v === items[i]) && guard++ < 50) out = rng.shuffle(items);
  return out;
}

/** Random integer composition (e.g. spread `total` across `parts` buckets). */
export function splitTotal(rng, total, parts, minEach = 0) {
  const out = Array.from({ length: parts }, () => minEach);
  let left = total - minEach * parts;
  while (left > 0) {
    const idx = rng.int(0, parts - 1);
    out[idx]++;
    left--;
  }
  return out;
}

/** Deterministic token for boolean grid cells ("toggle:r,c"). */
export function t(r, c, prefix = 'cell') {
  return `${prefix}:${r},${c}`;
}
