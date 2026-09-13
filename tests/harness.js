/**
 * Headless play harness.
 *
 * The rule this file exists to enforce: **every puzzle must be solvable through
 * the same interface a human uses**. The harness mounts a puzzle into a
 * detached jsdom node and then executes the steps returned by `puzzle.solve()`,
 * requiring a real `[data-token]` element for every click. A puzzle that
 * references a token it never renders fails here — which is what stops a
 * "missing answer" or "impossible level" from ever reaching a player.
 *
 * Two entry points are supported:
 *   • low level:  makeLevel / makeCtx / generate / mount / playSolution
 *   • full check: playPuzzle(puzzle, {difficulty}) → generate+validate+solve
 */

import { Rng } from '../src/utils/rng.js';
import { getPuzzleType } from '../src/puzzles/index.js';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Deterministic level descriptor handed to `puzzle.generate(level)`. */
export function makeLevel(n = 1, overrides = {}) {
  const seed = overrides.seed || `harness:${n}`;
  const difficulty = overrides.difficulty || 1 + Math.min(10, Math.floor((n - 1) / 11) + (n > 100 ? 1 : 0));
  return {
    number: n,
    level: n,
    seed,
    rng: new Rng(seed),
    difficulty,
    chapter: overrides.chapter || Math.min(12, Math.ceil(n / 10)),
    text: overrides.text,
    keyLetter: overrides.keyLetter,
    stars: overrides.stars ?? 0,
    testMode: true,
    ...overrides
  };
}

export function makeCtx(opts = {}) {
  const ctx = {
    testMode: opts.testMode !== false,
    reducedMotion: !!opts.reducedMotion,
    difficulty: opts.difficulty || 1,
    level: opts.level ?? 1,
    chapter: opts.chapter || 1,
    rng: opts.rng || new Rng(opts.seed || 'harness'),
    solved: false,
    failed: false,
    status: '',
    statuses: [],
    log: [],
    pauseHint: '',
    settings: { audio: true, music: false, sfx: false, reducedMotion: false, highContrast: false, largeText: false, ...(opts.settings || {}) },
    flags: { ...(opts.flags || {}) },
    starCount: opts.starCount || 0,
    audio: { ui() {}, correct() {}, wrong() {}, complete() {}, fail() {} },
    solve(detail = '') {
      if (ctx.solved) return;
      ctx.solved = true;
      ctx.log.push(`solve: ${detail}`);
    },
    fail(reason = '') {
      if (ctx.solved) return;
      ctx.failed = true;
      ctx.log.push(`fail: ${reason}`);
    },
    setStatus(text) { ctx.status = String(text); ctx.statuses.push(String(text)); },
    status(text) { return ctx.setStatus(text); },
    setPauseHint(text) { ctx.pauseHint = String(text); },
    setPanel(node) { ctx.panel = node; },
    announce(text) { ctx.log.push(`announce: ${text}`); },
    getFlag(key, fallback = null) { return key in ctx.flags ? ctx.flags[key] : fallback; },
    setFlag(key, value) { ctx.flags[key] = value; return value; },
    getStarCount() { return ctx.starCount; },
    setSetting(key, value) { ctx.settings[key] = value; return value; },
    hint() { return opts.hint || ''; }
  };
  return ctx;
}

/** Generate params for a puzzle type at level `n`. */
export function generate(puzzle, n = 1, overrides = {}) {
  const level = makeLevel(n, overrides);
  const ctx = makeCtx({ rng: level.rng.fork('ctx'), difficulty: level.difficulty, level: n, ...(overrides.ctx || {}) });
  const params = puzzle.generate(level, ctx);
  return { level, ctx, params };
}

/** Mount params into a fresh detached container. */
export function mount(puzzle, params, ctx) {
  const root = document.createElement('div');
  root.className = 'test-surface';
  document.body.appendChild(root);
  const cleanup = puzzle.mount(root, params, ctx);
  return { root, cleanup: typeof cleanup === 'function' ? cleanup : null };
}

/** Tokens referenced by a solution that are missing from the DOM. */
export function checkTokens(root, steps) {
  const missing = [];
  for (const step of steps) {
    const token = typeof step === 'string' ? step : (step && (step.click || step.hold)) || null;
    if (!token) continue;
    if (!root.querySelector(`[data-token="${token}"]`)) missing.push(token);
  }
  return missing;
}

/**
 * Play a mounted puzzle to completion using its own solution.
 * @returns {Promise<{ok:boolean, log:string[], ctx:object, tokens:number}>}
 */
export async function playSolution(puzzle, params, opts = {}) {
  const ctx = makeCtx({ rng: new Rng((opts.seed || `solve:${puzzle.id}`)), difficulty: opts.difficulty || 1, level: opts.level || 1, ...(opts.ctx || {}) });
  const log = [];
  let cleanup = null;
  let root = null;
  try {
    ({ root, cleanup } = mount(puzzle, params, ctx));
  } catch (err) {
    return { ok: false, log: [`mount threw: ${err.message}`], ctx, tokens: 0 };
  }
  if (ctx.solved && !puzzle.testAutoSolve) log.push('puzzle was already solved before any input');

  let steps = [];
  try {
    steps = puzzle.solve(params) || [];
  } catch (err) {
    log.push(`solve threw: ${err.message}`);
  }
  if (!steps.length && !puzzle.testAutoSolve) log.push('solve() returned no steps');

  for (const step of steps) {
    if (ctx.solved) break;
    try {
      await runStep(root, step, ctx, log);
      // Let queued timers run between clicks: several puzzles (turn-based
      // opponents, timed reveals) reply asynchronously, exactly as they do for
      // a real player. A zero-delay tick is enough because puzzles shorten
      // their own delays in test mode.
      await sleep(0);
    } catch (err) {
      log.push(`step ${JSON.stringify(step)} threw: ${err.message}`);
      break;
    }
  }

  if (!ctx.solved) log.push('the solution did not reach the solved state');
  if (ctx.failed) log.push(`the solution triggered a failure: ${ctx.log.filter((l) => l.startsWith('fail')).join('; ')}`);

  const tokens = root ? root.querySelectorAll('[data-token]').length : 0;
  if (cleanup) {
    try { cleanup(); } catch (err) { log.push(`cleanup threw: ${err.message}`); }
  }
  if (root) root.remove();
  return { ok: log.length === 0, log, ctx, tokens };
}

export async function runStep(root, step, ctx, log = []) {
  if (typeof step === 'string') return clickToken(root, step, ctx, log);
  if (step && typeof step === 'object') {
    if (typeof step.fn === 'function') return step.fn(root, ctx);
    if (step.wait) return sleep(step.wait);
    if (step.hold) return forceHold(root, step.hold, ctx, log);
    if (step.type !== undefined) return typeInto(root, step, ctx, log);
    if (step.click) return clickToken(root, step.click, ctx, log);
  }
  log.push(`unknown solution step: ${JSON.stringify(step)}`);
  return false;
}

export function findToken(root, token) {
  return [...root.querySelectorAll('[data-token]')].find((n) => n.dataset.token === token) || null;
}

export function tokensIn(root) {
  return [...root.querySelectorAll('[data-token]')].map((n) => n.dataset.token);
}

export function clickToken(root, token, ctx, log = []) {
  const node = findToken(root, token);
  if (!node) {
    log.push(`MISSING TOKEN ${token}`);
    return false;
  }
  if (node.disabled) {
    log.push(`token ${token} is disabled and cannot be clicked`);
    return false;
  }
  node.click();
  return true;
}

export function forceHold(root, token, ctx, log = []) {
  const node = findToken(root, token);
  if (!node) {
    log.push(`MISSING TOKEN ${token}`);
    return false;
  }
  if (typeof node.__forceComplete !== 'function') {
    log.push(`token ${token} is not a hold control`);
    return false;
  }
  node.__forceComplete();
  return true;
}

export function typeInto(root, step, ctx, log = []) {
  const token = step.into || 'answer';
  const input = findToken(root, token);
  if (!input) {
    log.push(`MISSING TOKEN ${token}`);
    return false;
  }
  input.value = String(step.type);
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  const submit = findToken(root, `${token}-submit`) || root.querySelector('.answer-row .btn-primary');
  if (!submit) {
    log.push(`MISSING TOKEN ${token}-submit`);
    return false;
  }
  submit.click();
  return true;
}

/** Full pipeline for a single puzzle type: generate → validate → mount → solve. */
export async function playPuzzle(puzzle, { level: levelNumber = 1, difficulty, seed, ...opts } = {}) {
  const overrides = { ...opts, ...(difficulty ? { difficulty } : {}), ...(seed ? { seed } : {}) };
  const { level, ctx, params } = generate(puzzle, levelNumber, overrides);
  const errors = [];
  if (params === undefined || params === null) errors.push('generate() returned no params');
  if (typeof puzzle.validate === 'function') {
    let validation;
    try {
      validation = puzzle.validate(params);
    } catch (err) {
      errors.push(`validate threw: ${err.message}`);
    }
    if (Array.isArray(validation)) errors.push(...validation);
    else if (validation && validation.ok === false) errors.push(...(validation.errors || ['validate() returned ok:false']));
  }
  const result = await playSolution(puzzle, params, { level: levelNumber, difficulty: level.difficulty, ctx: { testMode: true, ...(opts.ctx || {}), ...ctxExtras(ctx) } });
  errors.push(...result.log);
  return { ok: errors.length === 0, errors, params, level, ctx: result.ctx };
}

function ctxExtras(ctx) {
  return { starCount: ctx.starCount, flags: ctx.flags, settings: ctx.settings };
}

/** Convenience: play a registered puzzle id. */
export async function playType(id, opts) {
  return playPuzzle(getPuzzleType(id), opts);
}

/** Play across a difficulty range and collect the first failure per difficulty. */
export async function playRange(puzzle, difficulties = [1, 3, 6, 9, 11]) {
  const failures = [];
  for (const difficulty of difficulties) {
    const result = await playPuzzle(puzzle, { level: difficulty * 7, difficulty });
    if (!result.ok) failures.push(`d${difficulty}: ${result.errors.join('; ')}`);
  }
  return failures;
}

/** Verify that params contain no DOM nodes, functions or NaN (JSON-safe). */
export function assertPlainParams(params, path = 'params', problems = [], depth = 0) {
  if (depth > 8 || params === null || params === undefined) return problems;
  const type = typeof params;
  if (type === 'function') problems.push(`${path} is a function`);
  else if (type === 'symbol') problems.push(`${path} is a symbol`);
  else if (type === 'number' && !Number.isFinite(params)) problems.push(`${path} is ${params}`);
  else if (type === 'object') {
    if (typeof Node !== 'undefined' && params instanceof Node) problems.push(`${path} is a DOM node`);
    else if (Array.isArray(params)) params.forEach((v, i) => assertPlainParams(v, `${path}[${i}]`, problems, depth + 1));
    else for (const [k, v] of Object.entries(params)) assertPlainParams(v, `${path}.${k}`, problems, depth + 1);
  }
  return problems;
}
