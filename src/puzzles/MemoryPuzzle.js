/**
 * MEMORY puzzles.
 *
 * Temporal puzzles (Simon, streams, flashes) always run through a small phase
 * helper so that:
 *   • reduced-motion users get a longer, calmer display,
 *   • test mode skips the display entirely (deterministic tests),
 *   • every timer is registered for teardown (no leaked timers when leaving).
 */

import { el, Disposer } from './puzzleApi.js';
import { buildChoices, numericDistractors, scaledSize, t } from './common.js';
import { shapeSVG, shapeKey, shapeLabel, normalizeShape, SHAPES, FILLS } from '../utils/shapes.js';
import { choiceList, interactiveGrid, boardEl, seqStrip, answerInput, chip } from './kit.js';

/** Timing helper respecting reduced-motion + test mode. */
function timings(ctx, base) {
  const scale = ctx.testMode ? 0 : ctx.reducedMotion ? 1.5 : 1;
  return {
    show: ctx.testMode ? 0 : base * scale,
    gap: ctx.testMode ? 0 : Math.max(90, base * 0.35) * scale
  };
}

const SQ = (spec, size = 38, tone = 0, title) => ({ node: shapeSVG(spec, { size, tone, title }), label: shapeLabel(spec) });

// ---------------------------------------------------------------------------
// 1. Simon — repeat a flashed sequence on pads
// ---------------------------------------------------------------------------

export const memorySimon = {
  id: 'memory.simon',
  category: 'memory',
  name: 'Echo Array',
  par: (p) => ({ time: 18 + p.sequence.length * 3, attempts: 2 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const padCount = d <= 2 ? 4 : d <= 5 ? 4 : d <= 8 ? 6 : 9;
    const length = Math.max(3, Math.min(9, 2 + Math.ceil(d * 0.65) + (padCount > 4 ? 1 : 0)));
    const pads = Array.from({ length: padCount }, (_, i) => normalizeShape({
      shape: SHAPES[i % SHAPES.length],
      fill: d >= 6 ? FILLS[i % FILLS.length] : 'solid',
      rot: 0, scale: 1
    }));
    const sequence = Array.from({ length }, () => rng.int(0, padCount - 1));
    return {
      seed: level.seed, pads, sequence, padCount, reverse: false,
      hint: 'Group the flashes into chunks of two or three.'
    };
  },
  validate(p) {
    const errs = [];
    if (!p.sequence || p.sequence.length < 3) errs.push('sequence too short');
    if (p.sequence.some((i) => i < 0 || i >= p.padCount)) errs.push('sequence index out of range');
    if (p.pads.length !== p.padCount) errs.push('pad count mismatch');
    if (p.pads.some((s) => !s.shape)) errs.push('invalid pad glyph');
    return errs;
  },
  solve: (p) => p.sequence.map((i) => `pad:${i}`),
  mount(root, p, ctx) {
    const disp = new Disposer();
    const cols = p.padCount === 9 ? 3 : 2;
    const grid = boardEl(cols, cols, { cellSize: 64, ariaLabel: 'Echo pads' });
    const padNodes = [];
    for (let i = 0; i < p.padCount; i++) {
      const btn = el('button', {
        type: 'button', class: 'pad', dataset: { token: `pad:${i}` },
        attrs: { 'aria-label': `Pad ${i + 1}: ${shapeLabel(p.pads[i])}`, disabled: !ctx.testMode }
      }, shapeSVG(p.pads[i], { size: 38, tone: i % 5 }));
      btn.style.gridArea = `${Math.floor(i / cols) + 1} / ${(i % cols) + 1}`;
      btn.addEventListener('click', () => onPad(i));
      padNodes.push(btn);
      grid.appendChild(btn);
    }
    const status = el('div', { class: 'status-line', text: 'Stand by…', attrs: { role: 'status' } });
    root.appendChild(status);
    root.appendChild(grid);

    let progress = 0;
    let accepting = !!ctx.testMode;

    const flashPad = (i, ms) => {
      const node = padNodes[i];
      node.classList.add('lit');
      disp.timeout(() => node.classList.remove('lit'), Math.max(ms * 0.7, 120));
    };

    const onPad = (i) => {
      if (!accepting) return;
      const expected = p.sequence[progress];
      if (i === expected) {
        flashPad(i, 220);
        ctx.audio.ui();
        progress++;
        status.textContent = `${progress} / ${p.sequence.length}`;
        if (progress === p.sequence.length) {
          accepting = false;
          ctx.solve('Echo matched.');
        }
      } else {
        ctx.audio.wrong();
        ctx.fail('The echo diverged.');
      }
    };

    const { show, gap } = timings(ctx, 560);
    if (ctx.testMode) {
      accepting = true;
      status.textContent = 'Repeat the echo.';
      padNodes.forEach((n) => { n.disabled = false; });
    } else {
      status.textContent = 'Observe the echo…';
      p.sequence.forEach((pad, idx) => {
        disp.timeout(() => {
          if (idx > 0) padNodes[p.sequence[idx - 1]].classList.remove('lit');
          flashPad(pad, show);
        }, idx * (show + gap) + 260);
      });
      disp.timeout(() => {
        accepting = true;
        padNodes.forEach((n) => { n.disabled = false; });
        status.textContent = 'Repeat the echo.';
        setStatusText(ctx, status.textContent);
      }, p.sequence.length * (show + gap) + 320);
    }
    return () => disp.dispose();
  }
};

function setStatusText(ctx, text) {
  if (ctx.setStatus) ctx.setStatus(text);
}

// ---------------------------------------------------------------------------
// 2. Grid flash — reproduce the lit cells (order free)
// ---------------------------------------------------------------------------

export const memoryGrid = {
  id: 'memory.grid',
  category: 'memory',
  name: 'Cell Recall',
  par: (p) => ({ time: 15 + p.targets.length * 4, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const n = scaledSize(d, 3, 5);
    const count = Math.max(3, Math.min(n * n - 2, 2 + Math.ceil(d * 0.7)));
    const all = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) all.push({ r, c });
    const targets = rng.sample(all, count);
    return {
      seed: level.seed, rows: n, cols: n, targets, count,
      hint: 'Anchor the shape to a corner and read it like a letter.'
    };
  },
  validate(p) {
    const errs = [];
    if (!p.targets || p.targets.length < 2) errs.push('too few targets');
    if (p.targets.some((x) => x.r < 0 || x.c < 0 || x.r >= p.rows || x.c >= p.cols)) errs.push('target out of bounds');
    if (new Set(p.targets.map((x) => `${x.r},${x.c}`)).size !== p.targets.length) errs.push('duplicate targets');
    return errs;
  },
  solve: (p) => p.targets.map((x) => t(x.r, x.c)),
  mount(root, p, ctx) {
    const disp = new Disposer();
    const remaining = el('div', { class: 'status-line', attrs: { role: 'status' }, text: 'Observe…' });
    root.appendChild(remaining);
    let accepting = !!ctx.testMode;
    let hits = 0;
    const grid = interactiveGrid({
      rows: p.rows, cols: p.cols, cellSize: 58, tokenPrefix: 'cell',
      ariaLabel: 'Recall grid',
      render: (r, c) => ({ node: el('span', { class: 'cell-dot' }), label: `Row ${r + 1} column ${c + 1}` }),
      onSelect: (r, c, btn) => {
        if (!accepting) return;
        const isTarget = p.targets.some((x) => x.r === r && x.c === c);
        if (isTarget && !btn.classList.contains('correct')) {
          btn.classList.add('correct');
          hits++;
          ctx.audio.ui();
          remaining.textContent = `${hits} / ${p.targets.length} recovered`;
          if (hits === p.targets.length) {
            accepting = false;
            ctx.solve('Cells recalled.');
          }
        } else if (!isTarget) {
          ctx.audio.wrong();
          ctx.fail('That cell was never lit.');
        }
      }
    });
    root.appendChild(grid);
    const { show } = timings(ctx, 900 + Math.max(0, 6 - p.targets.length) * 120);
    if (ctx.testMode) {
      accepting = true;
      remaining.textContent = `Tap all ${p.targets.length} cells that were lit.`;
    } else {
      p.targets.forEach(({ r, c }) => {
        const node = grid.__cell(r, c);
        if (node) node.classList.add('lit');
      });
      disp.timeout(() => {
        p.targets.forEach(({ r, c }) => { const node = grid.__cell(r, c); if (node) node.classList.remove('lit'); });
        accepting = true;
        remaining.textContent = `Tap all ${p.targets.length} cells that were lit.`;
        setStatusText(ctx, remaining.textContent);
      }, show);
    }
    return () => disp.dispose();
  }
};

// ---------------------------------------------------------------------------
// 3. Reverse echo
// ---------------------------------------------------------------------------

export const memoryReverse = {
  id: 'memory.reverse',
  category: 'memory',
  name: 'Inverse Echo',
  par: (p) => ({ time: 22 + p.sequence.length * 4, attempts: 2 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const padCount = 4;
    const length = Math.max(3, Math.min(7, 2 + Math.ceil(d * 0.5)));
    const pads = Array.from({ length: padCount }, (_, i) => normalizeShape({ shape: SHAPES[i * 3 % SHAPES.length], fill: 'solid' }));
    let sequence = Array.from({ length }, () => rng.int(0, padCount - 1));
    let guard = 0;
    while (new Set(sequence).size < 2 && guard++ < 50) {
      sequence = Array.from({ length }, () => rng.int(0, padCount - 1));
    }
    sequence[1] = sequence[1] === sequence[0] ? (sequence[0] + 1) % padCount : sequence[1];
    return { seed: level.seed, pads, sequence, padCount, reverse: true, hint: 'Play it backwards. Last flash first.' };
  },
  validate(p) {
    const errs = [];
    if (!p.sequence || p.sequence.length < 3) errs.push('sequence too short');
    if (p.sequence.some((i) => i < 0 || i >= p.padCount)) errs.push('sequence index out of range');
    if (new Set(p.sequence).size < 2) errs.push('sequence never varies — reverse order is ambiguous');
    return errs;
  },
  solve: (p) => p.sequence.slice().reverse().map((i) => `pad:${i}`),
  mount(root, p, ctx) {
    const disp = new Disposer();
    const grid = boardEl(2, 2, { cellSize: 66, ariaLabel: 'Inverse echo pads' });
    const padNodes = [];
    const status = el('div', { class: 'status-line', attrs: { role: 'status' }, text: 'Observe the echo…' });
    root.appendChild(status);
    let accepting = !!ctx.testMode;
    let progress = 0;
    const expected = p.sequence.slice().reverse();
    for (let i = 0; i < p.padCount; i++) {
      const btn = el('button', {
        type: 'button', class: 'pad', dataset: { token: `pad:${i}` },
        attrs: { 'aria-label': `Pad ${i + 1}: ${shapeLabel(p.pads[i])}`, disabled: !ctx.testMode }
      }, shapeSVG(p.pads[i], { size: 40, tone: i % 5 }));
      btn.style.gridArea = `${Math.floor(i / 2) + 1} / ${(i % 2) + 1}`;
      btn.addEventListener('click', () => {
        if (!accepting) return;
        if (i === expected[progress]) {
          btn.classList.add('lit');
          disp.timeout(() => btn.classList.remove('lit'), 200);
          progress++;
          status.textContent = `${progress} / ${expected.length}`;
          if (progress === expected.length) { accepting = false; ctx.solve('Inverse echo matched.'); }
        } else {
          ctx.fail('That is not the reverse order.');
        }
      });
      padNodes.push(btn);
      grid.appendChild(btn);
    }
    root.appendChild(grid);
    const { show, gap } = timings(ctx, 560);
    if (ctx.testMode) {
      accepting = true;
      padNodes.forEach((n) => { n.disabled = false; });
      status.textContent = 'Repeat the echo in reverse.';
    } else {
      p.sequence.forEach((pad, idx) => {
        disp.timeout(() => {
          padNodes.forEach((n) => n.classList.remove('lit'));
          padNodes[pad].classList.add('lit');
        }, idx * (show + gap) + 200);
      });
      disp.timeout(() => {
        padNodes.forEach((n) => n.classList.remove('lit'));
        accepting = true;
        padNodes.forEach((n) => { n.disabled = false; });
        status.textContent = 'Repeat the echo in reverse.';
      }, p.sequence.length * (show + gap) + 260);
    }
    return () => disp.dispose();
  }
};

// ---------------------------------------------------------------------------
// 4. N-back: step through a stream and flag matches
// ---------------------------------------------------------------------------

export const memoryNBack = {
  id: 'memory.nback',
  category: 'memory',
  name: 'Continuity Watch',
  par: (p) => ({ time: 25 + p.stream.length * 2, attempts: 2 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const n = d <= 4 ? 1 : d <= 7 ? 2 : 2;
    const length = Math.max(6, Math.min(14, 5 + d));
    const pool = rng.sample(SHAPES, 4).map((s) => normalizeShape({ shape: s, fill: 'solid' }));
    const stream = [];
    for (let i = 0; i < length; i++) {
      const useMatch = i >= n && rng.bool(d >= 7 ? 0.3 : 0.35) && !(i >= n + 1 && shapeKey(stream[i - n]) === shapeKey(stream[i - 1]));
      if (useMatch) stream.push(stream[i - n]);
      else {
        let spec;
        let guard = 0;
        do { spec = rng.pick(pool); } while (guard++ < 40 && i >= n && shapeKey(spec) === shapeKey(stream[i - n]));
        stream.push(spec);
      }
    }
    const matches = [];
    for (let i = n; i < stream.length; i++) if (shapeKey(stream[i]) === shapeKey(stream[i - n])) matches.push(i);
    if (matches.length === 0) {
      // force at least one match so the puzzle always has a target
      stream[stream.length - 1] = stream[stream.length - 1 - n];
      matches.push(stream.length - 1);
    }
    return { seed: level.seed, stream, n, matches, length, hint: `Flag the item whenever it matches the one ${n} step${n > 1 ? 's' : ''} earlier.` };
  },
  validate(p) {
    const errs = [];
    if (!p.stream || p.stream.length < 5) errs.push('stream too short');
    if (!p.matches || p.matches.length === 0) errs.push('no matches to find');
    const expected = [];
    for (let i = p.n; i < p.stream.length; i++) if (shapeKey(p.stream[i]) === shapeKey(p.stream[i - p.n])) expected.push(i);
    if (JSON.stringify(expected) !== JSON.stringify(p.matches)) errs.push('match list inconsistent with stream');
    return errs;
  },
  solve(p) {
    // The flag applies to the item currently on screen, so flag then advance.
    const steps = [];
    for (let i = 0; i < p.stream.length; i++) {
      if (p.matches.includes(i)) steps.push({ click: 'stream:flag' });
      steps.push({ click: 'stream:advance' });
    }
    return steps;
  },
  mount(root, p, ctx) {
    let index = 0;
    let flags = [];
    const view = el('div', { class: 'stream-view', attrs: { role: 'img', 'aria-label': 'Current item' } });
    const counter = el('div', { class: 'status-line', attrs: { role: 'status' } });
    const render = () => {
      view.textContent = '';
      if (index >= p.stream.length) {
        view.appendChild(el('span', { class: 'stream-done', text: '— END OF STREAM —' }));
      } else {
        view.appendChild(shapeSVG(p.stream[index], { size: 64, tone: 2, title: shapeLabel(p.stream[index]) }));
      }
      counter.textContent = `${Math.min(index + 1, p.stream.length)} / ${p.stream.length} · flagged ${flags.length}`;
    };
    render();

    const advance = el('button', {
      type: 'button', class: 'btn btn-primary', text: 'NEXT ▶',
      dataset: { token: 'stream:advance' }, attrs: { 'aria-label': 'Show the next item' }
    });
    const flag = el('button', {
      type: 'button', class: 'btn btn-accent', text: '◆ MATCH',
      dataset: { token: 'stream:flag' }, attrs: { 'aria-label': `Flag a match with ${p.n} step(s) earlier` }
    });
    // flag applies to the item currently on screen
    advance.addEventListener('click', () => {
      index++;
      render();
      if (index >= p.stream.length) {
        const expected = p.matches;
        const same = expected.length === flags.length && expected.every((v, i) => v === flags[i]);
        if (same) ctx.solve('Continuity confirmed.');
        else ctx.fail(`You flagged ${flags.length} match(es); expected ${expected.length}.`);
        advance.disabled = true;
        flag.disabled = true;
      }
    });
    flag.addEventListener('click', () => {
      if (index >= p.stream.length) return;
      const i = index;
      if (p.matches.includes(i) && !flags.includes(i)) {
        flags.push(i);
        ctx.audio.ui();
      } else {
        ctx.audio.wrong();
        flag.classList.add('wrong');
        ctx.fail('That item did not match its predecessor.');
      }
      render();
    });
    root.appendChild(chip('RULE', `${p.n}-back`));
    root.appendChild(view);
    root.appendChild(counter);
    root.appendChild(el('div', { class: 'btn-row' }, flag, advance));
    setStatusText(ctx, `Flag matches with the item ${p.n} step(s) earlier.`);
  }
};

// ---------------------------------------------------------------------------
// 5. Order recall — items are shown in order, then re-shown shuffled
// ---------------------------------------------------------------------------

export const memoryOrder = {
  id: 'memory.order',
  category: 'memory',
  name: 'Sequence Vault',
  par: (p) => ({ time: 16 + p.items.length * 4, attempts: 2 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const count = Math.max(4, Math.min(7, 3 + Math.ceil(d * 0.45)));
    const pool = rng.sample(SHAPES, count);
    const items = pool.map((s, i) => normalizeShape({ shape: s, fill: i % 2 === 0 ? 'solid' : 'outline', rot: (i * 45) % 360 }));
    return { seed: level.seed, items, shuffled: rng.shuffle(items.map((_, i) => i)), hint: 'Attach a story or a word to each glyph.' };
  },
  validate(p) {
    const errs = [];
    if (!p.items || p.items.length < 3) errs.push('too few items');
    if (!p.shuffled || p.shuffled.length !== p.items.length) errs.push('shuffle mismatch');
    if (new Set(p.shuffled).size !== p.shuffled.length) errs.push('shuffle contains duplicates');
    return errs;
  },
  solve(p) {
    // tokens are indexed by *shuffled* position, so map item index -> displayed index
    const steps = [];
    for (let i = 0; i < p.items.length; i++) {
      const displayIndex = p.shuffled.indexOf(i);
      steps.push(`${p.reverse ? 'rev:' : 'item:'}${displayIndex}`);
    }
    return steps;
  },
  mount(root, p, ctx) {
    const disp = new Disposer();
    const status = el('div', { class: 'status-line', attrs: { role: 'status' }, text: 'Observe the order…' });
    root.appendChild(status);
    let accepting = !!ctx.testMode;
    let progress = 0;
    const palette = el('div', { class: 'palette', attrs: { role: 'group', 'aria-label': 'Shuffled glyph palette' } });
    p.shuffled.forEach((itemIndex, displayIndex) => {
      const btn = el('button', {
        type: 'button', class: 'choice', dataset: { token: `item:${displayIndex}` },
        attrs: { 'aria-label': `Position ${displayIndex + 1}: ${shapeLabel(p.items[itemIndex])}`, disabled: !ctx.testMode }
      }, shapeSVG(p.items[itemIndex], { size: 40, tone: displayIndex % 5 }));
      btn.addEventListener('click', () => {
        if (!accepting) return;
        if (itemIndex === progress) {
          btn.classList.add('correct');
          btn.disabled = true;
          progress++;
          if (progress === p.items.length) {
            accepting = false;
            ctx.solve('Order restored.');
          }
        } else {
          btn.classList.add('wrong');
          ctx.fail('That was not the next glyph in the original order.');
        }
      });
      palette.appendChild(btn);
    });
    root.appendChild(palette);
    const { show, gap } = timings(ctx, 620);
    if (ctx.testMode) {
      accepting = true;
      palette.querySelectorAll('button').forEach((b) => { b.disabled = false; });
      setStatusText(ctx, 'Select the glyphs in the order they appeared.');
    } else {
      const preview = seqStrip([], { ariaLabel: 'Preview' });
      root.insertBefore(preview, status);
      p.items.forEach((spec, i) => {
        disp.timeout(() => {
          preview.appendChild(el('span', { class: 'seq-item shown' }, shapeSVG(spec, { size: 34, tone: i % 5 })));
        }, 250 + i * (show + gap));
      });
      disp.timeout(() => {
        preview.textContent = '';
        preview.appendChild(el('span', { class: 'muted', text: '— order hidden —' }));
        accepting = true;
        palette.querySelectorAll('button').forEach((b) => { b.disabled = false; });
        setStatusText(ctx, 'Select the glyphs in the order they appeared.');
      }, 400 + p.items.length * (show + gap));
    }
    return () => disp.dispose();
  }
};

// ---------------------------------------------------------------------------
// 6. Count occurrences in a flashed stream
// ---------------------------------------------------------------------------

export const memoryCount = {
  id: 'memory.count',
  category: 'memory',
  name: 'Signal Tally',
  par: (p) => ({ time: 20 + p.stream.length * 2, attempts: 2 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const length = Math.max(6, Math.min(16, 5 + d));
    const kinds = rng.sample(SHAPES, d <= 4 ? 2 : 3).map((s, i) => normalizeShape({ shape: s, fill: i === 0 ? 'solid' : i === 1 ? 'outline' : 'hatch' }));
    const target = kinds[0];
    const stream = [];
    let count = 0;
    for (let i = 0; i < length; i++) {
      const idx = rng.int(0, kinds.length - 1) === 0 ? 0 : rng.int(1, kinds.length - 1);
      if (idx === 0) count++;
      stream.push(kinds[idx]);
    }
    if (count === 0) { stream[0] = target; count = 1; }
    if (count === length) { stream[0] = kinds[1]; count = length - 1; }
    const built = buildChoices({
      correct: count,
      distractors: numericDistractors(count, 4, rng, { spread: 3, floor: 1 }),
      rng,
      labelFor: (v) => `${v}`,
      render: (v) => el('span', { class: 'num', text: String(v) })
    });
    return {
      seed: level.seed, stream, target, answer: count,
      options: built.options.map((o) => ({ value: o.value, token: o.token, label: o.label })),
      answerToken: built.answerToken,
      hint: 'Count only the target glyph; ignore the decoys.'
    };
  },
  validate(p) {
    const errs = [];
    const actual = p.stream.filter((s) => shapeKey(s) === shapeKey(p.target)).length;
    if (actual !== p.answer) errs.push(`answer ${p.answer} ≠ actual ${actual}`);
    if (!p.options.some((o) => o.token === p.answerToken)) errs.push('answer missing from options');
    if (new Set(p.options.map((o) => o.value)).size !== p.options.length) errs.push('duplicate options');
    return errs;
  },
  solve: (p) => [p.answerToken],
  mount(root, p, ctx) {
    const disp = new Disposer();
    const view = el('div', { class: 'stream-view', attrs: { 'aria-label': 'Stream display' } });
    const status = el('div', { class: 'status-line', attrs: { role: 'status' }, text: 'Observe…' });
    root.appendChild(el('div', { class: 'scan-target' },
      el('span', { class: 'scan-target-label', text: 'COUNT' }), shapeSVG(p.target, { size: 34, tone: 3 })));
    root.appendChild(view);
    root.appendChild(status);
    const answers = el('div', { class: 'answers hidden' });
    root.appendChild(answers);
    const finish = () => {
      view.textContent = '';
      view.appendChild(el('span', { class: 'stream-done', text: '— STREAM ENDED —' }));
      status.textContent = 'How many target glyphs appeared?';
      answers.classList.remove('hidden');
      answers.appendChild(choiceList({
        options: p.options.map((o) => ({ ...o, content: el('span', { class: 'num', text: String(o.value) }) })),
        columns: p.options.length,
        onChoose: (opt) => (opt.value === p.answer ? ctx.solve('Tally confirmed.') : ctx.fail('The tally was different.'))
      }));
      setStatusText(ctx, status.textContent);
    };
    if (ctx.testMode) {
      finish();
    } else {
      const { show, gap } = timings(ctx, 520);
      p.stream.forEach((spec, i) => {
        disp.timeout(() => {
          view.textContent = '';
          view.appendChild(shapeSVG(spec, { size: 58, tone: 1 }));
        }, 250 + i * (show + gap));
      });
      disp.timeout(finish, 350 + p.stream.length * (show + gap));
    }
    return () => disp.dispose();
  }
};

// ---------------------------------------------------------------------------
// 7. Track changing objects — spot which cell mutated
// ---------------------------------------------------------------------------

export const memoryChange = {
  id: 'memory.change',
  category: 'memory',
  name: 'Mutation Track',
  par: (p) => ({ time: 24, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const n = scaledSize(d, 3, 4);
    const cells = [];
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        cells.push({ r, c, before: normalizeShape({ shape: rng.pick(SHAPES), fill: 'solid', rot: 0, scale: 1 }) });
      }
    }
    const target = rng.pick(cells);
    const dims = d <= 4 ? ['shape'] : ['shape', 'fill', 'rot'];
    const dim = rng.pick(dims);
    const after = dim === 'shape'
      ? { ...target.before, shape: rng.pick(SHAPES.filter((s) => s !== target.before.shape)) }
      : dim === 'fill'
        ? { ...target.before, fill: target.before.fill === 'solid' ? 'outline' : 'solid' }
        : { ...target.before, rot: (target.before.rot + 90) % 360 };
    return {
      seed: level.seed, rows: n, cols: n,
      cells: cells.map((c) => (c === target ? { ...c, after } : { ...c, after: c.before })),
      answerCell: { r: target.r, c: target.c }, dim,
      hint: `One cell changed: ${dim === 'shape' ? 'its silhouette' : dim === 'fill' ? 'its fill' : 'its rotation'}.`
    };
  },
  validate(p) {
    const errs = [];
    if (!p.cells || p.cells.length !== p.rows * p.cols) errs.push('cell count mismatch');
    const changed = p.cells.filter((c) => shapeKey(c.before) !== shapeKey(c.after));
    if (changed.length !== 1) errs.push(`expected exactly one mutation, found ${changed.length}`);
    const a = p.cells.find((c) => c.r === p.answerCell.r && c.c === p.answerCell.c);
    if (!a || shapeKey(a.before) === shapeKey(a.after)) errs.push('answer cell did not change');
    return errs;
  },
  solve: (p) => [t(p.answerCell.r, p.answerCell.c)],
  mount(root, p, ctx) {
    const disp = new Disposer();
    const status = el('div', { class: 'status-line', attrs: { role: 'status' }, text: 'Observe…' });
    root.appendChild(status);
    let accepting = !!ctx.testMode;
    const grid = interactiveGrid({
      rows: p.rows, cols: p.cols, cellSize: 58, tokenPrefix: 'cell', ariaLabel: 'Mutation grid',
      render: (r, c) => {
        const cell = p.cells.find((x) => x.r === r && x.c === c);
        return { node: shapeSVG(cell.before, { size: 34, tone: (r + c) % 5, title: shapeLabel(cell.before) }), label: `Row ${r + 1} column ${c + 1}` };
      },
      onSelect: (r, c, btn) => {
        if (!accepting) return;
        if (r === p.answerCell.r && c === p.answerCell.c) {
          btn.classList.add('correct');
          accepting = false;
          ctx.solve('Mutation located.');
        } else {
          btn.classList.add('wrong');
          ctx.fail('That glyph never changed.');
        }
      }
    });
    root.appendChild(grid);
    const { show } = timings(ctx, 1500);
    if (ctx.testMode) {
      p.cells.forEach((cell) => {
        const node = grid.__cell(cell.r, cell.c);
        if (node) { node.textContent = ''; node.appendChild(shapeSVG(cell.after, { size: 34, tone: (cell.r + cell.c) % 5, title: shapeLabel(cell.after) })); }
      });
      accepting = true;
      setStatusText(ctx, 'Which cell mutated?');
    } else {
      disp.timeout(() => {
        const cell = p.cells.find((x) => x.r === p.answerCell.r && x.c === p.answerCell.c);
        const node = grid.__cell(p.answerCell.r, p.answerCell.c);
        if (node) {
          node.textContent = '';
          node.appendChild(shapeSVG(cell.after, { size: 34, tone: (p.answerCell.r + p.answerCell.c) % 5, title: shapeLabel(cell.after) }));
        }
        accepting = true;
        status.textContent = 'Which cell mutated?';
        setStatusText(ctx, status.textContent);
      }, show);
    }
    return () => disp.dispose();
  }
};

// ---------------------------------------------------------------------------
// 8. Pair matching (concentration) with a move budget
// ---------------------------------------------------------------------------

export const memoryPairs = {
  id: 'memory.pairs',
  category: 'memory',
  name: 'Twin Vaults',
  par: (p) => ({ time: 60, attempts: 2 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const pairs = Math.max(3, Math.min(8, 3 + Math.ceil(d * 0.35)));
    const pool = rng.sample(SHAPES, pairs);
    const glyphs = pool.map((s, i) => normalizeShape({ shape: s, fill: i % 2 ? 'outline' : 'solid', rot: (i * 30) % 360 }));
    const deck = rng.shuffle(glyphs.flatMap((g, i) => [{ g, id: i }, { g, id: i }]));
    const moveBudget = pairs * 3 + 2;
    return { seed: level.seed, deck, pairs, moveBudget, hint: 'Remember positions of the pairs you have already seen.' };
  },
  validate(p) {
    const errs = [];
    if (p.deck.length !== p.pairs * 2) errs.push('deck size mismatch');
    const counts = new Map();
    p.deck.forEach((c) => counts.set(c.id, (counts.get(c.id) || 0) + 1));
    if ([...counts.values()].some((v) => v !== 2)) errs.push('every pair must appear exactly twice');
    if (p.moveBudget < p.pairs) errs.push('move budget too small to be solvable');
    return errs;
  },
  solve(p) {
    // reveal each matching pair (two clicks per pair), simulating a perfect run
    const steps = [];
    for (let id = 0; id < p.pairs; id++) {
      const indices = p.deck.map((c, i) => (c.id === id ? i : -1)).filter((i) => i >= 0);
      steps.push(`card:${indices[0]}`, `card:${indices[1]}`);
    }
    return steps;
  },
  mount(root, p, ctx) {
    let first = null;
    let busy = false;
    let matched = 0;
    let moves = 0;
    const status = el('div', { class: 'status-line', attrs: { role: 'status' }, text: `Moves left: ${p.moveBudget}` });
    const grid = boardEl(Math.ceil((p.deck.length) / 4), 4, { cellSize: 58, ariaLabel: 'Concentration board' });
    const cards = p.deck.map((card, i) => {
      const btn = el('button', {
        type: 'button', class: 'card', dataset: { token: `card:${i}` },
        attrs: { 'aria-label': `Card ${i + 1}, face down` }
      }, el('span', { class: 'card-back', text: '◇' }),
        el('span', { class: 'card-face' }, shapeSVG(card.g, { size: 34, tone: i % 5 })));
      btn.style.gridArea = `${Math.floor(i / 4) + 1} / ${(i % 4) + 1}`;
      btn.addEventListener('click', () => reveal(i, btn));
      grid.appendChild(btn);
      return { btn, card, index: i };
    });
    root.appendChild(status);
    root.appendChild(grid);

    const reveal = (i, btn) => {
      if (busy || btn.classList.contains('matched') || btn.classList.contains('open')) return;
      btn.classList.add('open');
      btn.setAttribute('aria-label', `Card ${i + 1}: ${shapeLabel(p.deck[i].g)}`);
      ctx.audio.ui();
      if (!first) { first = { i, btn }; return; }
      moves++;
      const other = first;
      first = null;
      const isMatch = p.deck[i].id === p.deck[other.i].id;
      if (isMatch) {
        other.btn.classList.add('matched');
        btn.classList.add('matched');
        matched++;
        ctx.audio.correct();
        if (matched === p.pairs) { ctx.solve('All vaults paired.'); return; }
      } else {
        ctx.audio.wrong();
        busy = true;
        const delay = ctx.testMode ? 0 : ctx.reducedMotion ? 900 : 520;
        setTimeout(() => {
          other.btn.classList.remove('open');
          btn.classList.remove('open');
          busy = false;
          update();
        }, delay);
      }
      update();
    };
    const update = () => {
      status.textContent = `Pairs ${matched}/${p.pairs} · Moves left ${p.moveBudget - moves}`;
      if (p.moveBudget - moves < 0 && matched < p.pairs) {
        ctx.fail('Move budget exhausted. The vaults reseal.');
        Array.from(grid.children).forEach((b) => { b.disabled = true; });
      }
    };
    update();
  }
};

// ---------------------------------------------------------------------------
// 9. Path recall — memorise a route, then retrace it
// ---------------------------------------------------------------------------

export const memoryPath = {
  id: 'memory.path',
  category: 'memory',
  name: 'Route Memory',
  par: (p) => ({ time: 20 + p.path.length * 3, attempts: 2 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const n = scaledSize(d, 3, 5);
    const len = Math.max(3, Math.min(n * 2, 3 + Math.floor(d * 0.6)));
    const occupied = new Set();
    const path = [{ r: rng.int(0, n - 1), c: rng.int(0, n - 1) }];
    occupied.add(`${path[0].r},${path[0].c}`);
    let guard = 0;
    while (path.length < len && guard++ < 400) {
      const last = path[path.length - 1];
      const opts = [[-1, 0], [1, 0], [0, -1], [0, 1]]
        .map(([dr, dc]) => ({ r: last.r + dr, c: last.c + dc }))
        .filter((p2) => p2.r >= 0 && p2.c >= 0 && p2.r < n && p2.c < n && !occupied.has(`${p2.r},${p2.c}`));
      if (!opts.length) break;
      const next = rng.pick(opts);
      path.push(next);
      occupied.add(`${next.r},${next.c}`);
    }
    return { seed: level.seed, rows: n, cols: n, path, start: path[0], hint: 'Trace the route from the glowing start cell.' };
  },
  validate(p) {
    const errs = [];
    if (!p.path || p.path.length < 3) errs.push('path too short');
    for (let i = 1; i < p.path.length; i++) {
      const a = p.path[i - 1];
      const b = p.path[i];
      if (Math.abs(a.r - b.r) + Math.abs(a.c - b.c) !== 1) errs.push(`path step ${i} is not adjacent`);
      if (b.r < 0 || b.c < 0 || b.r >= p.rows || b.c >= p.cols) errs.push(`path step ${i} out of bounds`);
    }
    if (new Set(p.path.map((x) => `${x.r},${x.c}`)).size !== p.path.length) errs.push('path revisits a cell');
    return errs;
  },
  solve: (p) => p.path.map((x) => t(x.r, x.c)),
  mount(root, p, ctx) {
    const disp = new Disposer();
    const status = el('div', { class: 'status-line', attrs: { role: 'status' }, text: 'Memorise the route…' });
    root.appendChild(status);
    let accepting = !!ctx.testMode;
    let step = 0;
    const grid = interactiveGrid({
      rows: p.rows, cols: p.cols, cellSize: 54, tokenPrefix: 'cell', ariaLabel: 'Route grid',
      render: (r, c) => ({ node: el('span', { class: 'cell-dot' }), label: `Row ${r + 1} column ${c + 1}` }),
      onSelect: (r, c, btn) => {
        if (!accepting) return;
        const want = p.path[step];
        if (want.r === r && want.c === c) {
          btn.classList.add('correct');
          step++;
          if (step === p.path.length) { accepting = false; ctx.solve('Route retraced.'); }
        } else {
          btn.classList.add('wrong');
          ctx.fail('The route did not pass through there.');
        }
      }
    });
    root.appendChild(grid);
    const { show } = timings(ctx, 900 + p.path.length * 220);
    if (ctx.testMode) {
      accepting = true;
      setStatusText(ctx, 'Retrace the route.');
    } else {
      p.path.forEach((cell, i) => {
        disp.timeout(() => {
          const node = grid.__cell(cell.r, cell.c);
          if (node) node.classList.add('lit');
        }, 200 + i * (show / p.path.length));
      });
      disp.timeout(() => {
        p.path.forEach((cell) => { const node = grid.__cell(cell.r, cell.c); if (node) node.classList.remove('lit'); });
        const startNode = grid.__cell(p.start.r, p.start.c);
        if (startNode) startNode.classList.add('start');
        accepting = true;
        status.textContent = 'Retrace the route.';
        setStatusText(ctx, status.textContent);
      }, 350 + show);
    }
    return () => disp.dispose();
  }
};

// ---------------------------------------------------------------------------
// 10. Associative memory — remember the glyph↔number cipher, then answer
// ---------------------------------------------------------------------------

export const memoryAssoc = {
  id: 'memory.assoc',
  category: 'memory',
  name: 'Cipher Recall',
  par: (p) => ({ time: 18 + p.legend.length * 4, attempts: 2 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const count = Math.max(3, Math.min(6, 3 + Math.floor(d / 3)));
    const pool = rng.sample(SHAPES, count);
    const numbers = rng.sample([2, 3, 4, 5, 6, 7, 8, 9].map((n2) => n2), count);
    const legend = pool.map((s, i) => ({ spec: normalizeShape({ shape: s, fill: i % 2 ? 'outline' : 'solid' }), code: numbers[i] }));
    const query = legend[rng.int(0, legend.length - 1)];
    return {
      seed: level.seed, legend, query, answer: String(query.code),
      hint: 'Say each pairing out loud once — it doubles as a memory hook.'
    };
  },
  validate(p) {
    const errs = [];
    if (!p.legend || p.legend.length < 3) errs.push('legend too small');
    if (!p.query) errs.push('no query glyph');
    if (new Set(p.legend.map((l) => l.code)).size !== p.legend.length) errs.push('duplicate codes');
    if (!p.legend.some((l) => shapeKey(l.spec) === shapeKey(p.query.spec))) errs.push('query not in legend');
    if (p.answer !== String(p.query.code)) errs.push('answer does not match the query code');
    return errs;
  },
  solve: (p) => [{ type: p.answer, into: 'answer' }],
  mount(root, p, ctx) {
    const disp = new Disposer();
    const legend = el('div', { class: 'legend', attrs: { role: 'group', 'aria-label': 'Glyph to code legend' } });
    p.legend.forEach((entry) => {
      legend.appendChild(el('div', { class: 'legend-item' },
        shapeSVG(entry.spec, { size: 34, tone: entry.code % 5, title: shapeLabel(entry.spec) }),
        el('span', { class: 'legend-code', text: `= ${entry.code}` })
      ));
    });
    const status = el('div', { class: 'status-line', attrs: { role: 'status' }, text: 'Memorise the cipher…' });
    const question = el('div', { class: 'query-box hidden' });
    root.appendChild(status);
    root.appendChild(legend);
    root.appendChild(question);
    const askNow = () => {
      legend.classList.add('hidden');
      question.classList.remove('hidden');
      question.appendChild(el('div', { class: 'query-glyph' }, shapeSVG(p.query.spec, { size: 58, tone: 1, title: shapeLabel(p.query.spec) })));
      question.appendChild(el('div', { class: 'muted', text: 'Enter the code for this glyph.' }));
      question.appendChild(answerInput({
        token: 'answer', length: 1, numeric: true, placeholder: 'Code',
        ctx,
        onSubmit: (value) => {
          if (value.trim() === p.answer) ctx.solve('Cipher recalled.');
          else ctx.fail('That code belonged to a different glyph.');
        }
      }));
      status.textContent = 'Cipher hidden. Enter the code.';
      setStatusText(ctx, status.textContent);
    };
    if (ctx.testMode) askNow();
    else disp.timeout(askNow, 1200 + p.legend.length * 900);
    return () => disp.dispose();
  }
};

export const MEMORY_PUZZLES = {
  'memory.simon': memorySimon,
  'memory.grid': memoryGrid,
  'memory.reverse': memoryReverse,
  'memory.nback': memoryNBack,
  'memory.order': memoryOrder,
  'memory.count': memoryCount,
  'memory.change': memoryChange,
  'memory.pairs': memoryPairs,
  'memory.path': memoryPath,
  'memory.assoc': memoryAssoc
};
