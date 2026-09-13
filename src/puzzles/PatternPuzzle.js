/**
 * Pattern Recognition — eight generators sharing one shape vocabulary.
 *
 * Every generator follows the same three-step recipe:
 *   1. pick a rule and a seed value,
 *   2. compute the answer *from the rule* (never hand-written),
 *   3. build the option list with `buildChoices`, which refuses to produce a
 *      question whose correct answer is missing.
 *
 * Params stay plain data (no DOM, no functions) so `generate()` is
 * deterministic and testable; rendering happens in `mount()`.
 */

import { el } from '../utils/dom.js';
import {
  buildChoices, numericDistractors, shapeDistractors, numberSequence, shapeSequence
} from './common.js';
import { shapeSVG, shapeLabel, shapeKey, normalizeShape, SHAPES, FILLS } from '../utils/shapes.js';
import { promptText, choiceList, interactiveGrid, chip } from './kit.js';
import { t } from './common.js';

const shapeRender = (value) => shapeSVG(value, { size: 44 });
const shapeLabelFor = (value) => shapeLabel(value);
const shapeEquals = (a, b) => shapeKey(a) === shapeKey(b);

function shapeChoices({ correct, distractors, rng, prefix = 'opt' }) {
  return buildChoices({
    correct,
    distractors,
    rng,
    prefix,
    equals: shapeEquals,
    labelFor: shapeLabelFor
  });
}

function numberChoices(correct, distractors, rng) {
  return buildChoices({ correct, distractors, rng, equals: (a, b) => a === b, labelFor: (v) => String(v) });
}

/** Shared mount helper for option lists (shape specs render as SVG glyphs). */
function optionContent(value) {
  return value !== null && typeof value === 'object' ? shapeSVG(value, { size: 44 }) : String(value);
}

function mountChoices(root, params, ctx) {
  const node = choiceList({
    options: params.choices.options.map((opt) => ({ ...opt, content: optionContent(opt.value) })),
    onChoose: (opt, btn) => {
      if (opt.token === params.choices.answerToken) {
        btn.classList.add('correct');
        ctx.solve('pattern decoded');
      } else {
        btn.classList.add('wrong');
        btn.disabled = true;
        ctx.fail('that does not follow the rule');
      }
    }
  });
  root.append(node);
  return node;
}

// ── pattern.missing ────────────────────────────────────────────────────────

export const patternMissing = {
  id: 'pattern.missing',
  category: 'pattern',
  name: 'Missing Symbol',
  how: 'Each row and column transforms the symbol. Supply the cell that is missing.',
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty || 1;
    const size = d <= 2 ? 3 : 4;
    const rotate = d >= 3 || rng.bool(0.5);
    const scale = d >= 5 && rng.bool(0.5);
    const rStep = rng.pick([45, 90]);
    const cStep = rng.pick(rotate ? [45, 90, 135] : [0]);
    const base = normalizeShape({
      shape: rng.pick(SHAPES.slice(0, 10)),
      fill: rng.pick(FILLS.slice(0, 4)),
      rot: rng.pick([0, 45, 90]),
      scale: 1
    });
    const cell = (r, c) => normalizeShape({
      ...base,
      rot: (base.rot + r * rStep + c * cStep) % 360,
      scale: scale ? Math.max(0.62, Number((1 - (r + c) * 0.12).toFixed(2))) : 1
    });
    const hole = { r: rng.int(0, size - 1), c: rng.int(0, size - 1) };
    const answer = cell(hole.r, hole.c);
    const grid = [];
    for (let r = 0; r < size; r++) {
      const row = [];
      for (let c = 0; c < size; c++) row.push(r === hole.r && c === hole.c ? null : cell(r, c));
      grid.push(row);
    }
    const dims = ['shape', 'fill'];
    if (rotate) dims.push('rot');
    if (scale) dims.push('scale');
    const choices = shapeChoices({
      correct: answer,
      distractors: shapeDistractors(answer, d >= 6 ? 5 : 3, rng, { dims }),
      rng
    });
    return { size, grid, hole, answer, choices };
  },
  validate(params) {
    const errors = [];
    if (!params.grid || params.grid.length !== params.size) errors.push('grid size mismatch');
    if (params.grid.flat().filter((c) => c === null).length !== 1) errors.push('exactly one gap required');
    if (params.choices.options.length < 4) errors.push('not enough options');
    if (!params.choices.options.some((o) => o.token === params.choices.answerToken)) errors.push('answer token missing');
    const keys = new Set(params.grid.flat().filter((c) => c !== null).map(shapeKey));
    if (keys.size < 3) errors.push('the visible grid does not vary enough to imply a rule');
    return errors;
  },
  solve(params) {
    return [params.choices.answerToken];
  },
  par(params) {
    return { time: 34 + params.size * 4, attempts: 3 };
  },
  mount(root, params, ctx) {
    const grid = el('div', { class: 'cell-grid', style: `--cols:${params.size};--cell:${params.size > 3 ? 64 : 80}px` });
    params.grid.flat().forEach((spec) => {
      const cellEl = el('div', { class: 'cell locked' });
      if (spec === null) {
        cellEl.classList.add('gap');
        cellEl.append(el('span', { class: 'gap-mark', text: '?' }));
      } else {
        cellEl.append(shapeSVG(spec, { size: 46 }));
      }
      grid.append(cellEl);
    });
    root.append(el('div', { class: 'puzzle-body' }, [promptText('Complete the matrix'), grid]));
    mountChoices(root, params, ctx);
  }
};

// ── pattern.next ───────────────────────────────────────────────────────────

export const patternNext = {
  id: 'pattern.next',
  category: 'pattern',
  name: 'Sequence',
  how: 'Work out the arithmetic rule, then supply the next term.',
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty || 1;
    const length = 4 + Math.min(3, Math.floor(d / 2.4));
    let seq = numberSequence(rng, d, length);
    let guard = 0;
    // A term that repeats inside the series, or an answer that already appeared,
    // makes the rule arguable — re-roll until the series is unambiguous.
    while ((new Set(seq.terms).size < 4 || seq.terms.includes(seq.answer)) && guard++ < 30) {
      seq = numberSequence(rng, d, length);
    }
    if (new Set(seq.terms).size < 4 || seq.terms.includes(seq.answer)) {
      const step = rng.int(3, 9);
      const first = rng.int(2, 20);
      const terms = Array.from({ length }, (_, i) => first + step * i);
      seq = { terms, answer: first + step * length, ruleId: 'arith', ruleLabel: `+${step}` };
    }
    const distractors = numericDistractors(seq.answer, d >= 6 ? 5 : 3, rng, { min: Math.min(...seq.terms) - 4, floor: 0 });
    const choices = numberChoices(seq.answer, distractors, rng);
    return { terms: seq.terms, answer: seq.answer, ruleId: seq.ruleId, ruleLabel: seq.ruleLabel, choices };
  },
  validate(params) {
    const errors = [];
    if (!params.terms || params.terms.length < 4) errors.push('sequence too short');
    if (!Number.isFinite(params.answer)) errors.push('no answer');
    if (new Set(params.terms).size < 4) errors.push('sequence is degenerate');
    if (params.terms.includes(params.answer)) errors.push('answer already appears in the series');
    if (params.choices.options.length < 4) errors.push('not enough options');
    return errors;
  },
  solve(params) {
    return [params.choices.answerToken];
  },
  par(params) {
    return { time: 26 + params.terms.length * 3, attempts: 2 };
  },
  mount(root, params, ctx) {
    const strip = el('div', { class: 'seq-strip' });
    params.terms.forEach((value) => strip.append(el('div', { class: 'seq-item', text: String(value) })));
    strip.append(el('div', { class: 'seq-item seq-gap', text: '?' }));
    root.append(el('div', { class: 'puzzle-body' }, [promptText('Next in the series'), strip]));
    mountChoices(root, params, ctx);
  }
};

// ── pattern.odd ────────────────────────────────────────────────────────────

export const patternOdd = {
  id: 'pattern.odd',
  category: 'pattern',
  name: 'Anomaly',
  how: 'Every symbol is identical except one. Tap the odd one out.',
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty || 1;
    const size = d <= 3 ? 3 : d <= 6 ? 4 : 5;
    const base = normalizeShape({
      shape: rng.pick(SHAPES.slice(0, 12)),
      fill: rng.pick(FILLS.slice(0, 4)),
      rot: rng.pick([0, 90, 180, 270]),
      scale: 1
    });
    const subtle = d >= 5;
    const dims = subtle ? ['rot', 'scale'] : ['shape', 'fill', 'rot'];
    const dim = rng.pick(dims);
    const amount = dim === 'scale' ? rng.pick([1, 2]) : rng.pick([1, 1, 2]);
    const odd = dim === 'rot'
      ? { ...base, rot: (base.rot + 45 * amount) % 360 }
      : dim === 'scale'
        ? { ...base, scale: Math.max(0.62, Number((1 - 0.16 * amount).toFixed(2))) }
        : { ...base, [dim]: dim === 'shape' ? SHAPES[(SHAPES.indexOf(base.shape) + amount) % SHAPES.length] : FILLS[(FILLS.indexOf(base.fill) + amount) % FILLS.length] };
    const index = rng.int(0, size * size - 1);
    const cells = Array.from({ length: size * size }, (_, i) => (i === index ? odd : base));
    return { size, cells, index, base, odd };
  },
  validate(params) {
    const errors = [];
    if (params.cells.length !== params.size * params.size) errors.push('cell count mismatch');
    if (shapeKey(params.cells[params.index]) !== shapeKey(params.odd)) errors.push('odd cell misplaced');
    const same = params.cells.filter((c) => shapeKey(c) === shapeKey(params.base)).length;
    if (same !== params.cells.length - 1) errors.push('more than one symbol differs');
    if (shapeKey(params.odd) === shapeKey(params.base)) errors.push('the odd symbol is not different');
    return errors;
  },
  solve(params) {
    return [t(Math.floor(params.index / params.size), params.index % params.size)];
  },
  par(params) {
    return { time: 14 + params.size * 4, attempts: 3 };
  },
  mount(root, params, ctx) {
    const grid = interactiveGrid({
      rows: params.size,
      cols: params.size,
      cellSize: params.size >= 5 ? 52 : 62,
      ariaLabel: 'Symbol array',
      render: (r, c) => {
        const spec = params.cells[r * params.size + c];
        return { node: shapeSVG(spec, { size: 34 }), className: 'locked' };
      },
      onSelect: (r, c) => {
        const i = r * params.size + c;
        if (i === params.index) ctx.solve('anomaly isolated');
        else ctx.fail('that symbol matches every other one');
      }
    });
    root.append(el('div', { class: 'puzzle-body' }, [promptText('One symbol is different'), grid]));
    ctx.setStatus(`Scan array ${params.size}×${params.size}`);
  }
};

// ── pattern.matrix ─────────────────────────────────────────────────────────

export const patternMatrix = {
  id: 'pattern.matrix',
  category: 'pattern',
  name: 'Rule Matrix',
  how: 'The row selects one attribute and the column another. Combine them.',
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty || 1;
    const shapes = rng.sample(SHAPES.slice(0, 12), 2);
    const fills = rng.sample(FILLS.slice(0, 4), 2);
    const rotStep = rng.pick([45, 90]);
    const scales = d >= 4 && rng.bool(0.5) ? [0.72, 1] : [1, 1];
    const cell = (r, c) => normalizeShape({
      shape: shapes[r],
      fill: fills[c],
      rot: (r * rotStep + c * rotStep) % 360,
      scale: scales[c]
    });
    const hole = { r: rng.int(0, 1), c: rng.int(0, 1) };
    const answer = cell(hole.r, hole.c);
    const grid = [[cell(0, 0), cell(0, 1)], [cell(1, 0), cell(1, 1)]];
    grid[hole.r][hole.c] = null;
    const dims = ['shape', 'fill', 'rot'];
    if (scales[0] !== scales[1]) dims.push('scale');
    const choices = shapeChoices({ correct: answer, distractors: shapeDistractors(answer, d >= 5 ? 5 : 3, rng, { dims }), rng });
    return { grid, hole, answer, choices, shapes, fills };
  },
  validate(params) {
    const errors = [];
    const flat = params.grid.flat();
    if (flat.filter((c) => c === null).length !== 1) errors.push('matrix needs exactly one gap');
    if (shapeKey(params.grid[0][0]) === shapeKey(params.grid[1][1]) && shapeKey(params.grid[0][1]) === shapeKey(params.grid[1][0])) {
      errors.push('matrix is symmetric — the rule is not observable');
    }
    if (!params.choices.options.some((o) => o.token === params.choices.answerToken)) errors.push('answer token missing');
    return errors;
  },
  solve(params) {
    return [params.choices.answerToken];
  },
  par() {
    return { time: 34, attempts: 3 };
  },
  mount(root, params, ctx) {
    const grid = el('div', { class: 'cell-grid', style: '--cols:2;--cell:88px' });
    params.grid.flat().forEach((spec) => {
      const cellEl = el('div', { class: 'cell locked' });
      if (spec === null) {
        cellEl.classList.add('gap');
        cellEl.append(el('span', { class: 'gap-mark', text: '?' }));
      } else {
        cellEl.append(shapeSVG(spec, { size: 52 }));
      }
      grid.append(cellEl);
    });
    const dimRow = el('div', { class: 'matrix-legend' }, [
      chip('rows', 'shape'), chip('columns', 'fill / rotation')
    ]);
    root.append(el('div', { class: 'puzzle-body' }, [promptText('Complete the matrix'), grid, dimRow]));
    mountChoices(root, params, ctx);
  }
};

// ── pattern.analogy ────────────────────────────────────────────────────────

export const patternAnalogy = {
  id: 'pattern.analogy',
  category: 'pattern',
  name: 'Analogy',
  how: 'A becomes B through one change. Apply the same change to C.',
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty || 1;
    const start = normalizeShape({
      shape: rng.pick(SHAPES.slice(0, 12)),
      fill: rng.pick(FILLS.slice(0, 4)),
      rot: rng.pick([0, 45, 90]),
      scale: 1
    });
    const kind = rng.pick(d >= 5 ? ['rotate', 'fill', 'shape'] : ['rotate', 'fill']);
    const amount = kind === 'rotate' ? rng.pick([1, 2, 3]) : rng.pick([1, 2]);
    const transform = (spec) => {
      const next = { ...normalizeShape(spec) };
      if (kind === 'rotate') next.rot = (next.rot + 45 * amount) % 360;
      else if (kind === 'fill') next.fill = FILLS[(FILLS.indexOf(next.fill) + amount) % FILLS.length];
      else next.shape = SHAPES[(SHAPES.indexOf(next.shape) + amount) % SHAPES.length];
      return next;
    };
    const a = start;
    const b = transform(a);
    const c = normalizeShape({ ...start, rot: (start.rot + rng.pick([45, 90, 180, 270])) % 360, fill: FILLS[(FILLS.indexOf(start.fill) + 1) % FILLS.length] });
    const answer = transform(c);
    const dims = kind === 'rotate' ? ['rot', 'fill'] : kind === 'fill' ? ['fill', 'shape'] : ['shape', 'fill'];
    const choices = shapeChoices({ correct: answer, distractors: shapeDistractors(answer, d >= 6 ? 5 : 3, rng, { dims }), rng });
    return { a, b, c, answer, kind, amount, choices };
  },
  validate(params) {
    const errors = [];
    if (shapeKey(params.a) === shapeKey(params.b)) errors.push('example pair is identical');
    if (shapeKey(params.c) === shapeKey(params.answer)) errors.push('answer equals the input');
    if (!params.choices.options.some((o) => o.token === params.choices.answerToken)) errors.push('answer token missing');
    if (params.choices.options.length < 4) errors.push('not enough options');
    return errors;
  },
  solve(params) {
    return [params.choices.answerToken];
  },
  par() {
    return { time: 32, attempts: 3 };
  },
  mount(root, params, ctx) {
    const pair = (leftSpec, rightSpec, label) => el('div', { class: 'analogy-pair' }, [
      el('div', { class: 'analogy-label', text: label }),
      el('div', { class: 'analogy-inner' }, [
        el('div', { class: 'cell locked' }, [shapeSVG(leftSpec, { size: 46 })]),
        el('span', { class: 'analogy-arrow', text: '→' }),
        el('div', { class: 'cell locked' }, [rightSpec ? shapeSVG(rightSpec, { size: 46 }) : el('span', { class: 'gap-mark', text: '?' })])
      ])
    ]);
    root.append(el('div', { class: 'puzzle-body' }, [
      promptText('Same change, new symbol'),
      el('div', { class: 'analogy-row' }, [pair(params.a, params.b, 'Example'), pair(params.c, null, 'Apply')])
    ]));
    mountChoices(root, params, ctx);
  }
};

// ── pattern.shapes ─────────────────────────────────────────────────────────

export const patternShapes = {
  id: 'pattern.shapes',
  category: 'pattern',
  name: 'Glyph Series',
  how: 'One attribute of the glyph changes every step. Continue the series.',
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty || 1;
    const length = 4 + Math.min(2, Math.floor(d / 4));
    const seq = shapeSequence(rng, d, length);
    const choices = shapeChoices({ correct: seq.answer, distractors: shapeDistractors(seq.answer, d >= 5 ? 5 : 3, rng, {}), rng });
    return { terms: seq.terms, answer: seq.answer, mode: seq.mode, choices };
  },
  validate(params) {
    const errors = [];
    if (params.terms.length < 4) errors.push('series too short');
    if (shapeKey(params.terms[params.terms.length - 1]) === shapeKey(params.answer)) errors.push('answer repeats the last term');
    if (new Set(params.terms.map(shapeKey)).size < 3) errors.push('series does not vary');
    if (params.choices.options.length < 4) errors.push('not enough options');
    return errors;
  },
  solve(params) {
    return [params.choices.answerToken];
  },
  par(params) {
    return { time: 30 + params.terms.length * 2, attempts: 2 };
  },
  mount(root, params, ctx) {
    const strip = el('div', { class: 'seq-strip glyphs' });
    params.terms.forEach((spec) => strip.append(el('div', { class: 'seq-item' }, [shapeSVG(spec, { size: 40 })])));
    strip.append(el('div', { class: 'seq-item seq-gap' }, [el('span', { class: 'gap-mark', text: '?' })]));
    root.append(el('div', { class: 'puzzle-body' }, [promptText('Continue the series'), strip]));
    mountChoices(root, params, ctx);
  }
};

// ── pattern.gate ───────────────────────────────────────────────────────────

export const patternGate = {
  id: 'pattern.gate',
  category: 'pattern',
  name: 'Symbol Logic',
  how: 'Two symbols combine under a hidden rule (AND, OR, XOR). Apply it to the last row.',
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty || 1;
    const ops = d >= 5 ? ['and', 'or', 'xor'] : ['and', 'or'];
    const op = rng.pick(ops);
    const shape = rng.pick(SHAPES.slice(0, 10));
    const combine = (a, b) => (op === 'and' ? a && b : op === 'or' ? a || b : a !== b);
    const render = (on) => normalizeShape({ shape, fill: on ? FILLS[0] : FILLS[1], rot: 0, scale: on ? 1 : 0.8 });
    // Two worked examples that between them show a true and a false output,
    // then the query row the player has to compute.
    const fallbacks = {
      and: [{ a: true, b: true }, { a: true, b: false }],
      or: [{ a: false, b: false }, { a: true, b: false }],
      xor: [{ a: false, b: false }, { a: true, b: false }]
    };
    let examples = fallbacks[op];
    let guard = 0;
    while (guard++ < 40) {
      const candidate = [0, 1].map(() => ({ a: rng.bool(), b: rng.bool() }));
      const outs = candidate.map((r) => combine(r.a, r.b));
      if (outs.includes(true) && outs.includes(false)) {
        examples = candidate;
        break;
      }
    }
    const rows = [
      { ...examples[0], out: combine(examples[0].a, examples[0].b), hidden: false },
      { ...examples[1], out: combine(examples[1].a, examples[1].b), hidden: false },
      { a: 0, b: 0, out: false, hidden: true }
    ];
    const query = { a: rng.bool(), b: rng.bool() };
    rows[2] = { ...query, out: combine(query.a, query.b), hidden: true };
    const answer = render(combine(query.a, query.b));
    const distractors = [
      render(!combine(query.a, query.b)),
      normalizeShape({ ...answer, shape: SHAPES[(SHAPES.indexOf(shape) + 1) % SHAPES.length] }),
      normalizeShape({ ...answer, scale: answer.scale === 1 ? 0.72 : 1 })
    ];
    const choices = shapeChoices({ correct: answer, distractors, rng });
    return { op, shape, rows, query, answer, choices };
  },
  validate(params) {
    const errors = [];
    if (!['and', 'or', 'xor'].includes(params.op)) errors.push('unknown operator');
    if (params.rows.length !== 3) errors.push('expected three rows');
    const shown = params.rows.filter((r) => !r.hidden);
    if (!shown.some((r) => r.out) || !shown.some((r) => !r.out)) errors.push('the worked examples do not show both outcomes of the rule');
    if (params.choices.options.length < 3) errors.push('not enough options');
    return errors;
  },
  solve(params) {
    return [params.choices.answerToken];
  },
  par() {
    return { time: 38, attempts: 3 };
  },
  mount(root, params, ctx) {
    const spec = (on) => normalizeShape({ shape: params.shape, fill: on ? FILLS[0] : FILLS[1], rot: 0, scale: on ? 1 : 0.8 });
    const board = el('div', { class: 'gate-board' });
    params.rows.forEach((row, i) => {
      board.append(el('div', { class: 'gate-row', 'data-token': `row:${i}` }, [
        el('div', { class: 'cell locked small' }, [shapeSVG(spec(row.a), { size: 32 })]),
        el('span', { class: 'gate-op', text: params.op.toUpperCase() }),
        el('div', { class: 'cell locked small' }, [shapeSVG(spec(row.b), { size: 32 })]),
        el('span', { class: 'gate-op', text: '=' }),
        el('div', { class: 'cell locked small' }, [row.hidden ? el('span', { class: 'gap-mark', text: '?' }) : shapeSVG(spec(row.out), { size: 32 })])
      ]));
    });
    root.append(el('div', { class: 'puzzle-body' }, [promptText('Apply the operator to the final row'), board]));
    mountChoices(root, params, ctx);
  }
};

// ── pattern.count ──────────────────────────────────────────────────────────

export const patternCount = {
  id: 'pattern.count',
  category: 'pattern',
  name: 'Census',
  how: 'Count the symbols that match the target exactly — rotation and fill matter.',
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty || 1;
    const size = d <= 3 ? 4 : d <= 6 ? 5 : 6;
    const target = normalizeShape({
      shape: rng.pick(SHAPES.slice(0, 12)),
      fill: rng.pick(FILLS.slice(0, 4)),
      rot: rng.pick([0, 90, 180, 270]),
      scale: 1
    });
    const total = size * size;
    const count = Math.max(3, Math.round(total * (0.14 + rng.float(0, 0.08))));
    const cells = [];
    for (let i = 0; i < total; i++) {
      if (i < count) {
        cells.push(target);
        continue;
      }
      let other;
      let guard = 0;
      do {
        other = normalizeShape({
          shape: rng.pick(SHAPES.slice(0, 12)),
          fill: rng.pick(FILLS.slice(0, 4)),
          rot: rng.pick([0, 45, 90, 180, 270]),
          scale: rng.pick([1, 1, 0.8])
        });
      } while (shapeKey(other) === shapeKey(target) && guard++ < 60);
      cells.push(other);
    }
    const shuffled = rng.shuffle(cells);
    const actual = shuffled.filter((s) => shapeKey(s) === shapeKey(target)).length;
    const choices = numberChoices(actual, numericDistractors(actual, d >= 5 ? 5 : 3, rng, { min: 1, floor: 1 }), rng);
    return { size, cells: shuffled, target, count: actual, choices };
  },
  validate(params) {
    const errors = [];
    if (params.cells.length !== params.size * params.size) errors.push('grid size mismatch');
    const counted = params.cells.filter((s) => shapeKey(s) === shapeKey(params.target)).length;
    if (counted !== params.count) errors.push('stored count does not match the grid');
    if (params.count < 2) errors.push('count too small to be meaningful');
    if (!params.choices.options.some((o) => o.token === params.choices.answerToken)) errors.push('answer token missing');
    return errors;
  },
  solve(params) {
    return [params.choices.answerToken];
  },
  par(params) {
    return { time: 22 + params.size * 5, attempts: 2 };
  },
  mount(root, params, ctx) {
    const head = el('div', { class: 'count-head' }, [
      el('div', { class: 'cell locked small' }, [shapeSVG(params.target, { size: 36 })]),
      el('div', { class: 'count-label', text: 'Count every exact match.' })
    ]);
    const grid = el('div', { class: 'cell-grid tight', style: `--cols:${params.size}` });
    params.cells.forEach((spec, i) => {
      grid.append(el('div', { class: 'cell locked', 'data-cell': String(i) }, [shapeSVG(spec, { size: 28 })]));
    });
    root.append(el('div', { class: 'puzzle-body' }, [promptText('Symbol census'), head, grid]));
    mountChoices(root, params, ctx);
  }
};

// ── pattern.binary ─────────────────────────────────────────────────────────

export const patternBinary = {
  id: 'pattern.binary',
  category: 'pattern',
  name: 'Bit Logic',
  how: 'The series follows a binary rule — shifts, XOR masks, Gray code or popcount.',
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty || 1;
    const kinds = d >= 5 ? ['shift', 'xor', 'gray', 'popcount', 'mask'] : ['shift', 'xor', 'popcount'];
    let kind = rng.pick(kinds);
    let start = rng.int(kind === 'gray' ? 2 : 1, kind === 'popcount' ? 12 : 9);
    let mask = rng.int(1, 15);
    const termFor = (k, s, m, i) => {
      const n = s + i;
      switch (k) {
        case 'shift': return s * (2 ** i);
        case 'xor': return n ^ m;
        case 'gray': return n ^ (n >> 1);
        case 'mask': return n & m;
        default: return popcount(n);
      }
    };
    // Re-roll until the series is varied and the answer is genuinely new.
    let guard = 0;
    let terms = [];
    let answer = 0;
    do {
      terms = Array.from({ length: 5 }, (_, i) => termFor(kind, start, mask, i));
      answer = termFor(kind, start, mask, 5);
      if (new Set(terms).size >= 4 && !terms.includes(answer)) break;
      kind = rng.pick(kinds);
      start = rng.int(kind === 'gray' ? 2 : 1, kind === 'popcount' ? 12 : 9);
      mask = rng.int(1, 15);
    } while (guard++ < 40);
    if (new Set(terms).size < 4 || terms.includes(answer)) {
      // deterministic fallback: pure powers of two always satisfy both rules
      kind = 'shift';
      start = rng.int(1, 6);
      mask = 0;
      terms = Array.from({ length: 5 }, (_, i) => termFor('shift', start, 0, i));
      answer = termFor('shift', start, 0, 5);
    }
    const term = (i) => termFor(kind, start, mask, i);
    const labels = {
      shift: 'each term doubles the previous one',
      xor: `each term is n XOR ${mask}`,
      gray: 'Gray code order: n XOR (n >> 1)',
      mask: `each term is n AND ${mask} (bit mask)`,
      popcount: 'the number of 1 bits in n'
    };
    const choices = numberChoices(answer, numericDistractors(answer, d >= 6 ? 5 : 3, rng, { floor: 0, min: 0 }), rng);
    return { kind, start, mask, terms, answer, ruleLabel: labels[kind], choices };
  },
  validate(params) {
    const errors = [];
    if (params.terms.length !== 5) errors.push('expected five terms');
    if (!Number.isFinite(params.answer)) errors.push('missing answer');
    if (new Set(params.terms).size < 4) errors.push('series is not varied enough');
    if (params.choices.options.length < 4) errors.push('not enough options');
    return errors;
  },
  solve(params) {
    return [params.choices.answerToken];
  },
  par() {
    return { time: 44, attempts: 2 };
  },
  mount(root, params, ctx) {
    const strip = el('div', { class: 'seq-strip' });
    params.terms.forEach((value) => strip.append(el('div', { class: 'seq-item', text: String(value) })));
    strip.append(el('div', { class: 'seq-item seq-gap', text: '?' }));
    const bits = el('div', { class: 'bit-row' });
    params.terms.forEach((value) => bits.append(el('span', { class: 'bit-chip', text: value.toString(2).padStart(5, '0') })));
    root.append(el('div', { class: 'puzzle-body' }, [promptText('Decode the bit rule'), strip, bits]));
    mountChoices(root, params, ctx);
  }
};

export function popcount(n) {
  let count = 0;
  let value = Math.abs(n);
  while (value > 0) {
    count += value & 1;
    value >>= 1;
  }
  return count;
}

export const PATTERN_HELPERS = { shapeChoices, numberChoices, mountChoices, shapeRender, t };

export const PATTERN_PUZZLES = {
  'pattern.missing': patternMissing,
  'pattern.next': patternNext,
  'pattern.odd': patternOdd,
  'pattern.matrix': patternMatrix,
  'pattern.analogy': patternAnalogy,
  'pattern.shapes': patternShapes,
  'pattern.gate': patternGate,
  'pattern.count': patternCount,
  'pattern.binary': patternBinary
};
