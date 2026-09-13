/**
 * Puzzle Kit — the reusable interaction layer for every puzzle type.
 *
 * Rules of the kit:
 *  1. Every interactive element is a real <button> (or an element with
 *     role="button" + tabindex) so touch, mouse and keyboard all work for free.
 *  2. Elements that can be part of a solution carry `data-token="..."`.
 *     The automated test-suite "plays" levels by running the tokens returned
 *     from each puzzle's `solve(params)` function — this is how we prove that
 *     no level is impossible and no answer is missing.
 *  3. Nothing here animates when the user prefers reduced motion.
 */

import { el, append, clear, announce, flash, Disposer } from '../utils/dom.js';
import { shapeSVG } from '../utils/shapes.js';

export const TOKEN_SELECTOR = '[data-token]';

/** Outer frame for a puzzle surface. */
export function frame(children, opts = {}) {
  return el('div', { class: `puzzle-frame ${opts.className || ''}`.trim() }, children);
}

export function promptText(text, opts = {}) {
  return el('p', { class: `puzzle-prompt ${opts.className || ''}`.trim(), text });
}

export function boardEl(rows, cols, opts = {}) {
  const style = {
    '--rows': rows,
    '--cols': cols,
    '--cell': `${opts.cellSize || 52}px`
  };
  return el('div', {
    class: `board ${opts.className || ''}`.trim(),
    style,
    attrs: {
      role: opts.role || 'grid',
      'aria-label': opts.ariaLabel || 'Puzzle board',
      'aria-rowcount': rows,
      'aria-colcount': cols
    }
  });
}

/**
 * A single interactive board cell.
 * @param {{token?:string,label?:string,content?:Node|string,className?:string,onSelect?:Function,disabled?:boolean,selected?:boolean,attrs?:object}} opts
 */
export function cellEl(opts = {}) {
  const btn = el('button', {
    type: 'button',
    class: `cell ${opts.className || ''}`.trim(),
    attrs: {
      'aria-label': opts.label || undefined,
      'aria-pressed': opts.selected === undefined ? undefined : String(!!opts.selected),
      role: opts.role || 'gridcell',
      disabled: opts.disabled || undefined,
      tabindex: opts.disabled ? -1 : (opts.tabindex ?? 0),
      ...(opts.attrs || {})
    },
    dataset: opts.token ? { token: opts.token } : undefined
  });
  if (opts.content !== undefined && opts.content !== null) {
    append(btn, [opts.content]);
  }
  if (opts.onSelect) {
    btn.addEventListener('click', (ev) => {
      if (btn.disabled) return;
      opts.onSelect(ev, btn);
    });
  }
  return btn;
}

/** Render a gesture/shape descriptor into a span. */
export function glyph(spec, size = 44, tone = 0, title) {
  const wrap = el('span', { class: 'glyph-wrap' });
  wrap.appendChild(shapeSVG(spec, { size, tone, title }));
  return wrap;
}

/**
 * A list of answer choices.
 * @param {{options:Array<{content:any,token:string,label:string}>,columns?:number,onChoose:Function,className?:string,ariaLabel?:string}} cfg
 */
export function choiceList(cfg) {
  const list = el('div', {
    class: `choices ${cfg.className || ''}`.trim(),
    style: { '--choice-cols': cfg.columns || 0 },
    attrs: { role: 'group', 'aria-label': cfg.ariaLabel || 'Answer choices' }
  });
  cfg.options.forEach((opt) => {
    const btn = el('button', {
      type: 'button',
      class: 'choice',
      attrs: { 'aria-label': opt.label },
      dataset: { token: opt.token }
    });
    append(btn, [opt.content]);
    btn.addEventListener('click', () => cfg.onChoose(opt, btn));
    list.appendChild(btn);
  });
  return list;
}

/** Row of sequence items (non interactive display). */
export function seqStrip(items, opts = {}) {
  const strip = el('div', {
    class: `seq-strip ${opts.className || ''}`.trim(),
    attrs: { role: 'list', 'aria-label': opts.ariaLabel || 'Sequence' }
  });
  items.forEach((item) => {
    const cell = el('div', { class: `seq-item ${item.className || ''}`.trim(), attrs: { role: 'listitem' } });
    if (item.content instanceof Node) append(cell, [item.content]);
    else if (typeof item === 'object' && item !== null && 'shape' in item) cell.appendChild(glyph(item, item.__size || 36, item.__tone || 0, item.__label));
    else cell.textContent = item === undefined || item === null ? '?' : String(item);
    if (item && item.token) cell.dataset.token = item.token;
    strip.appendChild(cell);
  });
  return strip;
}

/** Small labelled HUD chip (timer, moves left, lives...). */
export function chip(label, value, opts = {}) {
  const node = el('div', { class: `chip ${opts.className || ''}`.trim() },
    el('span', { class: 'chip-label', text: label }),
    el('span', { class: 'chip-value', text: String(value) })
  );
  return node;
}

export function meter(current, max, cls = '') {
  const pct = Math.max(0, Math.min(100, (current / max) * 100));
  return el('div', { class: `meter ${cls}`.trim(), attrs: { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': max, 'aria-valuenow': current } },
    el('div', { class: 'meter-fill', style: { width: `${pct}%` } }));
}

/**
 * Hold-to-activate button — used by the experimental levels and by anything
 * destructive. Also keyboard accessible (Space/Enter held = same behaviour).
 */
export function holdButton({ label, ms = 1200, token, onComplete, onTick, ctx }) {
  const reduce = ctx?.reducedMotion;
  const duration = reduce ? Math.min(400, ms) : ms;
  const btn = el('button', {
    type: 'button', class: 'btn btn-hold',
    attrs: { 'aria-label': `${label} — hold for ${(duration / 1000).toFixed(1)} seconds` },
    dataset: token ? { token } : undefined
  }, el('span', { class: 'hold-fill' }), el('span', { class: 'hold-label', text: label }));

  let start = 0;
  let raf = 0;
  let done = false;
  const fill = btn.querySelector('.hold-fill');

  const reset = () => {
    cancelAnimationFrame(raf);
    btn.classList.remove('holding');
    fill.style.width = '0%';
    onTick && onTick(0);
  };

  const finish = () => {
    if (done) return;
    done = true;
    reset();
    btn.disabled = true;
    onComplete && onComplete();
  };

  const tick = (now) => {
    const p = Math.min(1, (now - start) / duration);
    fill.style.width = `${p * 100}%`;
    onTick && onTick(p);
    if (p >= 1) { finish(); return; }
    raf = requestAnimationFrame(tick);
  };

  const begin = (ev) => {
    if (done || btn.disabled) return;
    ev.preventDefault();
    start = performance.now();
    btn.classList.add('holding');
    raf = requestAnimationFrame(tick);
  };
  const end = () => {
    if (done) return;
    reset();
  };

  btn.addEventListener('pointerdown', begin);
  btn.addEventListener('pointerup', end);
  btn.addEventListener('pointerleave', end);
  btn.addEventListener('pointercancel', end);
  btn.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) begin(e);
  });
  btn.addEventListener('keyup', end);
  btn.addEventListener('blur', end);
  btn.__forceComplete = finish; // test hook
  return btn;
}

/** Type-an-answer widget with on-screen keypad (touch + keyboard + test-friendly). */
export function answerInput({ token = 'answer', length = 0, placeholder = 'Enter answer', onSubmit, ctx, numeric = false }) {
  const input = el('input', {
    class: 'answer-input',
    type: 'text',
    inputmode: numeric ? 'numeric' : 'text',
    autocomplete: 'off',
    autocapitalize: 'characters',
    spellcheck: false,
    maxlength: 24,
    placeholder,
    attrs: { 'aria-label': placeholder },
    dataset: { token }
  });
  const submit = el('button', {
    type: 'button', class: 'btn btn-primary', text: 'SUBMIT',
    dataset: { token: `${token}-submit` }
  });
  const wrap = el('div', { class: 'answer-row' }, input, submit);

  const doSubmit = () => {
    const value = input.value.trim();
    if (!value) { input.focus(); return; }
    onSubmit(value, input);
  };
  submit.addEventListener('click', doSubmit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); doSubmit(); }
  });

  if (length > 0) {
    const keypad = el('div', { class: 'keypad', attrs: { role: 'group', 'aria-label': 'Keypad' } });
    const keys = numeric ? ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'] : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    keys.forEach((k) => {
      keypad.appendChild(el('button', {
        type: 'button', class: 'keypad-key', text: k,
        attrs: { 'aria-label': `Key ${k}` },
        onclick: () => {
          if (input.value.length < length) input.value += k;
          input.focus();
        }
      }));
    });
    if (numeric) {
      keypad.appendChild(el('button', { type: 'button', class: 'keypad-key', text: '⌫', attrs: { 'aria-label': 'Backspace' }, onclick: () => { input.value = input.value.slice(0, -1); } }));
    }
    wrap.appendChild(keypad);
  }
  setTimeout(() => { if (!ctx?.reducedMotion && !ctx?.testMode) input.focus({ preventScroll: true }); }, 60);
  return wrap;
}

/**
 * Show a "watch this" phase, then run `onReady`.
 * Respects reduced motion by shortening delays; in test mode it is instant.
 */
export function watchPhase(ms, onReady, ctx) {
  const scale = ctx?.reducedMotion ? 0.55 : 1;
  const delay = ctx?.testMode ? 0 : ms * scale;
  if (delay <= 0) { onReady(); return () => {}; }
  const id = setTimeout(onReady, delay);
  return () => clearTimeout(id);
}

/** A tiny countdown ring/number used by reaction & timing levels. */
export function countdown(ms, onDone, ctx, opts = {}) {
  const node = el('div', { class: 'countdown', text: `${(ms / 1000).toFixed(1)}` });
  const reduce = ctx?.reducedMotion || ctx?.testMode;
  const step = 100;
  let left = ms;
  const id = setInterval(() => {
    left -= step;
    node.textContent = `${Math.max(0, left / 1000).toFixed(1)}`;
    if (left <= 0) {
      clearInterval(id);
      if (opts.hideOnDone !== false) node.classList.add('done');
      onDone();
    }
  }, reduce ? step / 2 : step);
  return { node, stop: () => clearInterval(id) };
}

/** Data attribute tokens for grid coordinates. */
export function cellToken(prefix, r, c) {
  return `${prefix}:${r},${c}`;
}

export function parseCellToken(token) {
  const [r, c] = token.split(':')[1].split(',').map(Number);
  return { r, c };
}

/**
 * Build a clickable grid.
 * @param {{rows:number,cols:number,render:Function,onSelect:Function,ctx:object,tokenPrefix?:string,ariaLabel?:string,cellSize?:number,className?:string}} cfg
 */
export function interactiveGrid(cfg) {
  const prefix = cfg.tokenPrefix || 'cell';
  const root = boardEl(cfg.rows, cfg.cols, { cellSize: cfg.cellSize, ariaLabel: cfg.ariaLabel, className: cfg.className, role: 'grid' });
  const buttons = new Map();
  for (let r = 0; r < cfg.rows; r++) {
    for (let c = 0; c < cfg.cols; c++) {
      const content = cfg.render(r, c);
      const btn = cellEl({
        token: cellToken(prefix, r, c),
        label: (typeof content === 'object' && content && content.label) || `Row ${r + 1} column ${c + 1}`,
        content: content && content.node ? content.node : content,
        className: (content && content.className) || '',
        onSelect: () => cfg.onSelect(r, c, buttons.get(`${r},${c}`))
      });
      btn.style.gridArea = `${r + 1} / ${c + 1}`;
      btn.setAttribute('aria-rowindex', r + 1);
      btn.setAttribute('aria-colindex', c + 1);
      buttons.set(`${r},${c}`, btn);
      root.appendChild(btn);
    }
  }
  root.__cell = (r, c) => buttons.get(`${r},${c}`);
  return root;
}

/** Keyboard helper: arrow key navigation inside a grid of buttons. */
export function enableGridKeys(root, cols) {
  root.addEventListener('keydown', (ev) => {
    const keys = { ArrowUp: -cols, ArrowDown: cols, ArrowLeft: -1, ArrowRight: 1 };
    const delta = keys[ev.key];
    if (delta === undefined) return;
    const buttons = Array.from(root.querySelectorAll('button:not([disabled])'));
    const idx = buttons.indexOf(document.activeElement);
    if (idx === -1) { buttons[0] && buttons[0].focus(); return; }
    ev.preventDefault();
    const next = buttons[Math.max(0, Math.min(buttons.length - 1, idx + delta))];
    next && next.focus();
  });
}

export { el, append, clear, announce, flash, Disposer };
