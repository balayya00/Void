/**
 * OBSERVATION puzzles.
 *
 * These are about *looking carefully*: differences, hidden items, twins and
 * anomalies. None of them are colour-based — every difference can be described
 * in words, which is what the accessible labels do.
 */

import { el } from './puzzleApi.js';
import { buildChoices, scaledSize, t } from './common.js';
import { shapeSVG, shapeKey, shapeLabel, normalizeShape, SHAPES, FILLS, varyShape } from '../utils/shapes.js';
import { choiceList, promptText, interactiveGrid, boardEl, seqStrip } from './kit.js';

const SQ = (spec, size = 34, tone = 0, title) => ({ node: shapeSVG(spec, { size, tone, title }), label: shapeLabel(spec) });

// ---------------------------------------------------------------------------
// 1. Spot the difference between two panels
// ---------------------------------------------------------------------------

export const observationDiff = {
  id: 'observation.diff',
  category: 'observation',
  name: 'Two-Reel Compare',
  par: (p) => ({ time: 22 + p.rows * p.cols * 1.2, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const n = scaledSize(d, 3, 4);
    const cells = [];
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        cells.push({ r, c, spec: normalizeShape({ shape: rng.pick(SHAPES), fill: rng.pick(['solid', 'outline', 'hatch']), rot: rng.pick([0, 45, 90]), scale: 1 }) });
      }
    }
    const target = cells[rng.int(0, cells.length - 1)];
    const dims = d <= 4 ? ['shape', 'fill'] : ['shape', 'fill', 'rot', 'scale'];
    let changed = varyShape(target.spec, rng.pick(dims), 1, rng);
    // the mutated glyph must not already exist elsewhere, otherwise the
    // difference between the two panels would not be unique
    let guard = 0;
    while (cells.some((c) => c !== target && shapeKey(c.spec) === shapeKey(changed)) && guard++ < 200) {
      changed = varyShape(target.spec, rng.pick(dims), rng.int(1, 2), rng);
    }
    return {
      seed: level.seed, rows: n, cols: n, cells, target: { r: target.r, c: target.c }, changed, decoys: 0,
      hint: 'Work in reading order and compare silhouette, then fill.'
    };
  },
  validate(p) {
    const errs = [];
    const target = p.cells.find((c) => c.r === p.target.r && c.c === p.target.c);
    if (!target) errs.push('target cell missing');
    if (shapeKey(target.spec) === shapeKey(p.changed)) errs.push('the changed glyph equals the original');
    if (p.cells.filter((c) => !(c.r === p.target.r && c.c === p.target.c) && shapeKey(c.spec) === shapeKey(p.changed)).length) {
      errs.push('another cell already shows the changed glyph — the difference would be ambiguous');
    }
    return errs;
  },
  solve: (p) => [t(p.target.r, p.target.c)],
  mount(root, p, ctx) {
    const panel = (label, mutate) => {
      const grid = boardEl(p.rows, p.cols, { cellSize: 40, ariaLabel: label, role: 'img' });
      p.cells.forEach((cell) => {
        const isTarget = cell.r === p.target.r && cell.c === p.target.c;
        const spec = isTarget && mutate ? p.changed : cell.spec;
        grid.appendChild(el('div', { class: 'board-cell static small', style: { gridArea: `${cell.r + 1} / ${cell.c + 1}` } },
          shapeSVG(spec, { size: 26, tone: (cell.r + cell.c) % 5 })));
      });
      return el('div', { class: 'panel' }, el('div', { class: 'panel-label', text: label }), grid);
    };
    const grid = interactiveGrid({
      rows: p.rows, cols: p.cols, cellSize: 40, tokenPrefix: 'cell', ariaLabel: 'Select the changed cell (panel A)',
      render: (r, c) => {
        const cell = p.cells.find((x) => x.r === r && x.c === c);
        return { node: shapeSVG(cell.spec, { size: 26, tone: (r + c) % 5, title: shapeLabel(cell.spec) }), label: `Row ${r + 1} column ${c + 1}` };
      },
      onSelect: (r, c) => (r === p.target.r && c === p.target.c ? ctx.solve('Difference located.') : ctx.fail('Those two cells match exactly.'))
    });
    root.appendChild(promptText('One cell changed between the two reels. Tap it on the interactive copy below.'));
    root.appendChild(el('div', { class: 'dual-panel' }, panel('REEL A', false), panel('REEL B', true)));
    root.appendChild(el('div', { class: 'panel-label', text: 'SELECT THE CHANGED CELL' }));
    root.appendChild(grid);
  }
};

// ---------------------------------------------------------------------------
// 2. Find the target glyph hidden in noise
// ---------------------------------------------------------------------------

export const observationHidden = {
  id: 'observation.hidden',
  category: 'observation',
  name: 'Signal in Noise',
  par: (p) => ({ time: 20 + p.rows * p.cols * 0.8, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const n = scaledSize(d, 4, 6);
    const target = normalizeShape({ shape: rng.pick(SHAPES), fill: rng.pick(FILLS), rot: rng.pick([0, 45, 90]) });
    const decoys = [];
    const decoyCount = d <= 3 ? 3 : d <= 6 ? 5 : 7;
    let guard = 0;
    while (decoys.length < decoyCount && guard++ < 200) {
      const candidate = varyShape(target, rng.pick(['shape', 'fill', 'rot', 'scale']), 1, rng);
      if (shapeKey(candidate) === shapeKey(target)) continue;
      if (decoys.some((x) => shapeKey(x) === shapeKey(candidate))) continue;
      decoys.push(candidate);
    }
    const cells = [];
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        cells.push({ r, c, spec: rng.pick(decoys) });
      }
    }
    const answer = cells[rng.int(0, cells.length - 1)];
    answer.spec = target;
    return {
      seed: level.seed, rows: n, cols: n, cells, target, answer: { r: answer.r, c: answer.c },
      hint: 'Your target is shown above — compare one attribute at a time.'
    };
  },
  validate(p) {
    const errs = [];
    const matches = p.cells.filter((c) => shapeKey(c.spec) === shapeKey(p.target));
    if (matches.length !== 1) errs.push(`${matches.length} cells match the target (need exactly 1)`);
    else if (matches[0].r !== p.answer.r || matches[0].c !== p.answer.c) errs.push('recorded answer is not the matching cell');
    return errs;
  },
  solve: (p) => [t(p.answer.r, p.answer.c)],
  mount(root, p, ctx) {
    root.appendChild(el('div', { class: 'scan-target' },
      el('span', { class: 'scan-target-label', text: 'FIND' }),
      shapeSVG(p.target, { size: 38, tone: 3, title: shapeLabel(p.target) })
    ));
    root.appendChild(interactiveGrid({
      rows: p.rows, cols: p.cols, cellSize: 42, tokenPrefix: 'cell', ariaLabel: 'Signal field',
      render: (r, c) => {
        const cell = p.cells.find((x) => x.r === r && x.c === c);
        return { node: shapeSVG(cell.spec, { size: 28, tone: (r + c) % 5, title: shapeLabel(cell.spec) }), label: `Row ${r + 1} column ${c + 1}` };
      },
      onSelect: (r, c, btn) => {
        if (r === p.answer.r && c === p.answer.c) { btn.classList.add('correct'); ctx.solve('Signal extracted.'); }
        else { btn.classList.add('wrong'); ctx.fail('That is a decoy.'); }
      }
    }));
  }
};

// ---------------------------------------------------------------------------
// 3. Anomaly: one row breaks the rule
// ---------------------------------------------------------------------------

export const observationAnomaly = {
  id: 'observation.anomaly',
  category: 'observation',
  name: 'Row Violation',
  par: () => ({ time: 45, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const rows = scaledSize(d, 3, 5);
    const cols = Math.max(3, Math.min(5, rows));
    const rule = rng.pick(['rotation', 'scale', 'fillCycle']);
    const base = normalizeShape({ shape: rng.pick(SHAPES), fill: rng.pick(FILLS), rot: rng.pick([0, 45]), scale: 0.8 });
    const stepFor = { rotation: rng.pick([30, 45, 60]), scale: 0.1, fillCycle: 1 };
    const buildRow = (broken) => {
      const row = [];
      for (let c = 0; c < cols; c++) {
        let spec = { ...base };
        const c2 = broken && c >= Math.ceil(cols / 2) ? c + 1 : c;
        if (rule === 'rotation') spec = { ...spec, rot: (base.rot + stepFor.rotation * c2) % 360 };
        else if (rule === 'scale') spec = { ...spec, scale: Number(Math.max(0.62, base.scale + stepFor.scale * c2).toFixed(2)) };
        else spec = { ...spec, fill: FILLS[(FILLS.indexOf(base.fill) + c2) % FILLS.length] };
        row.push(normalizeShape(spec));
      }
      return row;
    };
    const brokenRow = rng.int(0, rows - 1);
    const grid = [];
    for (let r = 0; r < rows; r++) grid.push(buildRow(r === brokenRow));
    const keys = new Set(grid.map((row) => row.map(shapeKey).join('|')));
    if (keys.size < 2) {
      // ensure the anomaly is real
      grid[brokenRow] = buildRow(true).map((spec, i) => (i === cols - 1 ? varyShape(spec, 'shape', 1, rng) : spec));
    }
    return {
      seed: level.seed, rows, cols, grid, brokenRow, rule,
      hint: `Every row follows the same rule for ${rule === 'rotation' ? 'rotation' : rule === 'scale' ? 'size' : 'fill'}. One row jumps.`
    };
  },
  validate(p) {
    const errs = [];
    const keys = p.grid.map((row) => row.map(shapeKey).join('|'));
    const counts = new Map();
    keys.forEach((k) => counts.set(k, (counts.get(k) || 0) + 1));
    const shared = [...counts.entries()].filter(([, v]) => v > 1).length;
    if (shared === 0) errs.push('every row is unique — the anomaly cannot be identified');
    if (keys.filter((k, i) => k === keys[p.brokenRow]).length > 1) errs.push('the recorded broken row also appears elsewhere');
    return errs;
  },
  solve: (p) => p.grid[p.brokenRow].map((_, c) => t(p.brokenRow, c)),
  mount(root, p, ctx) {
    const grid = boardEl(p.rows, p.cols, { cellSize: 44, ariaLabel: 'Rows of glyph sequences', role: 'img' });
    p.grid.forEach((row, r) => row.forEach((spec, c) => {
      grid.appendChild(el('div', { class: 'board-cell static small', style: { gridArea: `${r + 1} / ${c + 1}` } },
        shapeSVG(spec, { size: 30, tone: r % 5 })));
    }));
    root.appendChild(promptText('Every row follows the same progression except one. Tap any glyph in the rule-breaking row.'));
    root.appendChild(grid);
    root.appendChild(interactiveGrid({
      rows: p.rows, cols: p.cols, cellSize: 34, tokenPrefix: 'cell', ariaLabel: 'Select the offending row',
      className: 'overlay-grid',
      render: (r, c) => ({ node: el('span', { class: 'hitbox' }), label: `Row ${r + 1} column ${c + 1}` }),
      onSelect: (r) => (r === p.brokenRow ? ctx.solve('Violation isolated.') : ctx.fail('That row keeps the pattern.'))
    }));
  }
};

// ---------------------------------------------------------------------------
// 4. Twin hunt: exactly two tiles are identical
// ---------------------------------------------------------------------------

export const observationTwin = {
  id: 'observation.twin',
  category: 'observation',
  name: 'Twin Manifest',
  par: (p) => ({ time: 30 + p.cells.length, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const count = d <= 3 ? 6 : d <= 6 ? 9 : 12;
    const specs = [];
    let guard = 0;
    while (specs.length < count && guard++ < 500) {
      const spec = normalizeShape({
        shape: rng.pick(SHAPES),
        fill: rng.pick(FILLS),
        rot: rng.pick([0, 45, 90, 135, 180]),
        scale: rng.pick([0.75, 0.9, 1, 1.1])
      });
      if (specs.some((s) => shapeKey(s) === shapeKey(spec))) continue;
      specs.push(spec);
    }
    const twinIndex = rng.int(0, specs.length - 1);
    specs.push({ ...specs[twinIndex] });
    const placed = rng.shuffle(specs.map((spec, i) => ({ spec, id: i })));
    const byKey = new Map();
    placed.forEach((entry, i) => {
      const k = shapeKey(entry.spec);
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(i);
    });
    const pair = [...byKey.values()].find((list) => list.length === 2);
    const twins = pair ? pair.slice(0, 2) : [];
    return {
      seed: level.seed, cells: placed, twins,
      hint: 'Two tiles are exactly alike — everything else differs in at least one attribute.'
    };
  },
  validate(p) {
    const errs = [];
    const counts = new Map();
    p.cells.forEach((c) => {
      const k = shapeKey(c.spec);
      counts.set(k, (counts.get(k) || 0) + 1);
    });
    const duplicated = [...counts.entries()].filter(([, v]) => v === 2);
    if (duplicated.length !== 1) errs.push(`${duplicated.length} pairs share a glyph (need exactly 1)`);
    if (p.twins.length !== 2) errs.push('twin list must hold two indices');
    if (!p.twins.every((i) => shapeKey(p.cells[i].spec) === shapeKey(p.cells[p.twins[0]].spec))) errs.push('listed twins are not identical');
    return errs;
  },
  solve: (p) => p.twins.map((i) => `tile:${i}`),
  mount(root, p, ctx) {
    const selected = [];
    root.appendChild(promptText('Exactly two tiles are identical. Select both.'));
    const list = el('div', { class: 'choices wide', style: { '--choice-cols': 4 }, attrs: { role: 'group', 'aria-label': 'Tiles' } });
    p.cells.forEach((cell, i) => {
      const btn = el('button', {
        type: 'button', class: 'choice tile', dataset: { token: `tile:${i}` },
        attrs: { 'aria-label': `Tile ${i + 1}: ${shapeLabel(cell.spec)}`, 'aria-pressed': 'false' }
      }, shapeSVG(cell.spec, { size: 34, tone: i % 5 }));
      btn.addEventListener('click', () => {
        if (selected.includes(i)) return;
        selected.push(i);
        btn.classList.add('selected');
        btn.setAttribute('aria-pressed', 'true');
        ctx.audio.ui();
        if (selected.length === 2) {
          const [a, b] = selected;
          if (a === p.twins[0] && b === p.twins[1] || a === p.twins[1] && b === p.twins[0]) ctx.solve('Twins confirmed.');
          else {
            ctx.fail('Those two tiles differ.');
            selected.length = 0;
            list.querySelectorAll('.choice').forEach((n) => { n.classList.remove('selected'); n.setAttribute('aria-pressed', 'false'); });
          }
        }
      });
      list.appendChild(btn);
    });
    root.appendChild(list);
  }
};

// ---------------------------------------------------------------------------
// 5. Hidden word in a letter wall
// ---------------------------------------------------------------------------

export const observationText = {
  id: 'observation.text',
  category: 'observation',
  name: 'Manifest Trace',
  par: () => ({ time: 60, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const words = ['ECHO', 'VOID', 'CORE', 'AXON', 'SIGMA', 'PULSE', 'ORBIT', 'DRIFT'];
    const word = rng.pick(words.filter((w) => w.length <= (d <= 4 ? 4 : 5)));
    const rows = d <= 4 ? 5 : 7;
    const cols = rows + 2;
    const grid = [];
    for (let r = 0; r < rows; r++) {
      grid.push(Array.from({ length: cols }, () => rng.pick('ABCDEFGHIJKLMNOPQRSTUVWXYZ#%*'.split(''))));
    }
    const horizontal = rng.bool(0.5) || rows < word.length + 1;
    let placed = false;
    let guard = 0;
    while (!placed && guard++ < 200) {
      if (horizontal) {
        const r = rng.int(0, rows - 1);
        const start = rng.int(0, cols - word.length);
        for (let i = 0; i < word.length; i++) grid[r][start + i] = word[i];
        placed = true;
      } else {
        const c = rng.int(0, cols - 1);
        const start = rng.int(0, rows - word.length);
        for (let i = 0; i < word.length; i++) grid[start + i][c] = word[i];
        placed = true;
      }
    }
    return {
      seed: level.seed, rows, cols, grid, word, direction: horizontal ? 'left to right' : 'top to bottom',
      hint: 'Read every row and every column; the word is unbroken.'
    };
  },
  validate(p) {
    const errs = [];
    const flat = p.grid.map((row) => row.join(''));
    const inRow = flat.some((row) => row.includes(p.word));
    const cols = [];
    for (let c = 0; c < p.cols; c++) cols.push(p.grid.map((row) => row[c]).join(''));
    const inCol = cols.some((col) => col.includes(p.word));
    if (!inRow && !inCol) errs.push('the hidden word does not appear in the grid');
    if (inRow && inCol) errs.push('the word appears twice — ambiguous');
    return errs;
  },
  solve: (p) => [{ type: p.word, into: 'answer' }],
  mount(root, p, ctx) {
    const wall = el('div', { class: 'letter-wall mono', attrs: { role: 'img', 'aria-label': 'Letter wall' } });
    p.grid.forEach((row) => {
      const line = el('div', { class: 'letter-row' });
      row.forEach((ch) => line.appendChild(el('span', { class: 'letter', text: ch })));
      wall.appendChild(line);
    });
    root.appendChild(promptText('A word is hidden in the manifest, reading left to right or top to bottom. What is it?'));
    root.appendChild(wall);
    root.appendChild(answerField(p, ctx));
  }
};

function answerField(p, ctx) {
  // small helper defined lower in the file for the text puzzle
  const input = el('input', {
    class: 'answer-input', type: 'text', placeholder: 'Hidden word', autocomplete: 'off',
    attrs: { 'aria-label': 'Your answer', maxlength: 16 }, dataset: { token: 'answer' }
  });
  const submit = el('button', { type: 'button', class: 'btn btn-primary', text: 'SUBMIT', dataset: { token: 'answer-submit' } });
  const doSubmit = () => {
    const value = input.value.trim().toUpperCase();
    if (!value) return;
    if (value === p.word) ctx.solve('Manifest decrypted.');
    else ctx.fail('That word does not appear.');
  };
  submit.addEventListener('click', doSubmit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSubmit(); });
  return el('div', { class: 'answer-row' }, input, submit);
}

// ---------------------------------------------------------------------------
// 6. Silhouette matching
// ---------------------------------------------------------------------------

export const observationSilhouette = {
  id: 'observation.silhouette',
  category: 'observation',
  name: 'Shadow Match',
  par: () => ({ time: 40, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const spec = normalizeShape({ shape: rng.pick(SHAPES), fill: rng.pick(FILLS), rot: rng.pick([0, 30, 45, 60, 90]), scale: 1 });
    const silhouette = { ...spec, fill: 'solid', rot: spec.rot };
    const distractors = [];
    let guard = 0;
    while (distractors.length < 5 && guard++ < 300) {
      const candidate = rng.bool(0.6)
        ? { ...silhouette, rot: (silhouette.rot + rng.pick([15, 30, 45, 60])) % 360 }
        : { ...varyShape(silhouette, 'scale', rng.int(1, 2), rng), fill: 'solid' };
      if (shapeKey(candidate) === shapeKey(silhouette)) continue;
      if (distractors.some((x) => shapeKey(x) === shapeKey(candidate))) continue;
      distractors.push(normalizeShape(candidate));
    }
    const built = buildChoices({
      correct: silhouette,
      distractors,
      rng,
      equals: (a, b) => shapeKey(a) === shapeKey(b),
      labelFor: (v) => shapeLabel(v),
      render: (v) => SQ(v, 40)
    });
    return {
      seed: level.seed, spec, options: built.options.map((o) => ({ spec: o.value, token: o.token, label: o.label })),
      answerToken: built.answerToken, answer: silhouette,
      hint: 'Ignore the internal pattern — only the outline matters.'
    };
  },
  validate(p) {
    const errs = [];
    if (!p.options || p.options.length < 3) errs.push('too few options');
    if (p.options.filter((o) => shapeKey(o.spec) === shapeKey(p.answer)).length !== 1) errs.push('the silhouette must appear exactly once');
    if (p.options.some((o) => o.spec.fill !== 'solid')) errs.push('option is not a silhouette');
    return errs;
  },
  solve: (p) => [p.answerToken],
  mount(root, p, ctx) {
    root.appendChild(el('div', { class: 'rewrite-row' },
      el('div', { class: 'panel-label', text: 'OBJECT' }),
      shapeSVG(p.spec, { size: 60, tone: 2, title: shapeLabel(p.spec) })
    ));
    root.appendChild(promptText('Which shadow is cast by this object?'));
    root.appendChild(choiceList({
      options: p.options.map((o) => ({ ...o, content: shapeSVG(o.spec, { size: 40 }) })),
      columns: 3,
      onChoose: (opt) => (shapeKey(opt.spec) === shapeKey(p.answer) ? ctx.solve('Shadow matched.') : ctx.fail('That outline does not match.'))
    }));
  }
};

// ---------------------------------------------------------------------------
// 7. Out-of-order element in a sequence
// ---------------------------------------------------------------------------

/** How many single rotations would repair the ladder? Exactly one is expected. */
function countAnomalies(ladder, step) {
  const rots = ladder.map((s) => s.rot);
  let count = 0;
  for (let i = 1; i < rots.length; i++) {
    const trial = rots.slice();
    trial[i] = (rots[i - 1] + step) % 360;
    let ok = true;
    for (let j = 1; j < trial.length; j++) {
      if (((trial[j] - trial[j - 1]) % 360 + 360) % 360 !== ((step % 360) + 360) % 360) { ok = false; break; }
    }
    if (ok) count++;
  }
  return count;
}

export const observationOrder = {
  id: 'observation.order',
  category: 'observation',
  name: 'Broken Ladder',
  par: () => ({ time: 35, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const length = d <= 4 ? 5 : 7;
    const step = rng.pick([15, 30, 45, 60]);
    const base = normalizeShape({ shape: rng.pick(SHAPES), fill: 'outline', rot: rng.int(0, 3) * 45 });
    const ladder = [];
    for (let i = 0; i < length; i++) ladder.push({ ...base, rot: (base.rot + step * i) % 360 });
    let brokenIndex = rng.int(1, length - 2);
    let guard = 0;
    let candidateLadder;
    do {
      brokenIndex = rng.int(1, length - 2);
      candidateLadder = ladder.map((s, i) => (i === brokenIndex ? { ...s, rot: (s.rot + step * 2) % 360 } : s));
    } while (countAnomalies(candidateLadder, step) !== 1 && guard++ < 200);
    return {
      seed: level.seed, ladder: candidateLadder, brokenIndex, step,
      hint: `Each glyph rotates by exactly ${step}° — find the one that jumps too far.`
    };
  },
  validate(p) {
    const errs = [];
    if (!p.ladder || p.ladder.length < 4) errs.push('ladder too short');
    const anomalies = countAnomalies(p.ladder, p.step);
    if (anomalies !== 1) errs.push(`${anomalies} anomalies found (need exactly 1)`);
    const brokenKey = shapeKey(p.ladder[p.brokenIndex]);
    const repaired = p.ladder.map((s2, i) => (i === p.brokenIndex ? { ...s2, rot: (p.ladder[i - 1].rot + p.step) % 360 } : s2));
    if (countAnomalies(repaired, p.step) === 0 && shapeKey(repaired[p.brokenIndex]) === brokenKey && p.step !== 0) {
      errs.push('the recorded anomaly does not change anything');
    }
    return errs;
  },
  solve: (p) => [`step:${p.brokenIndex}`],
  mount(root, p, ctx) {
    root.appendChild(promptText('One glyph breaks the rotation ladder. Select it.'));
    root.appendChild(seqStrip(p.ladder.map((spec, i) => ({
      content: (() => {
        const btn = el('button', {
          type: 'button', class: 'choice tile', dataset: { token: `step:${i}` },
          attrs: { 'aria-label': `Position ${i + 1}: ${shapeLabel(spec)}` }
        }, shapeSVG(spec, { size: 34, tone: 1 }));
        btn.addEventListener('click', () => (i === p.brokenIndex ? ctx.solve('Anomaly isolated.') : ctx.fail('That glyph follows the ladder.')));
        return btn;
      })()
    })), { className: 'selectable' }));
  }
};

// ---------------------------------------------------------------------------
// 8. Rapid discrimination rounds (multi-round, generous and report-friendly)
// ---------------------------------------------------------------------------

export const observationRapid = {
  id: 'observation.rapid',
  category: 'observation',
  name: 'Rapid Sort',
  par: (p) => ({ time: 30 + p.roundCount * 8, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const rounds = Math.max(3, Math.min(6, 3 + Math.floor(d / 3)));
    const items = [];
    for (let i = 0; i < rounds; i++) {
      const count = 4 + Math.min(3, Math.floor(d / 3));
      const base = normalizeShape({ shape: rng.pick(SHAPES), fill: rng.pick(['solid', 'outline', 'hatch']), rot: rng.pick([0, 45, 90]) });
      const odd = varyShape(base, rng.pick(['rot', 'scale', 'shape']), rng.int(1, 2), rng);
      const cells = Array.from({ length: count }, () => ({ ...base }));
      const oddIndex = rng.int(0, count - 1);
      cells[oddIndex] = normalizeShape(odd);
      items.push({ cells, oddIndex, order: rng.shuffle(cells.map((_, idx) => idx)) });
    }
    return {
      seed: level.seed, rounds: items, roundCount: rounds,
      hint: 'Compare left to right against the first item; the odd one is only slightly different.'
    };
  },
  validate(p) {
    const errs = [];
    if (!p.rounds || p.rounds.length < 3) errs.push('too few rounds');
    for (const [i, round] of p.rounds.entries()) {
      const keys = round.cells.map(shapeKey);
      const counts = new Map();
      keys.forEach((k) => counts.set(k, (counts.get(k) || 0) + 1));
      const uniques = [...counts.entries()].filter(([, v]) => v === 1);
      if (uniques.length !== 1) errs.push(`round ${i + 1} has ${uniques.length} unique items (need exactly 1)`);
      const uniqueKey = uniques[0] && uniques[0][0];
      if (uniqueKey && shapeKey(round.cells[round.oddIndex]) !== uniqueKey) errs.push(`round ${i + 1} marks the wrong item`);
    }
    return errs;
  },
  solve(p) {
    // tokens are positional: round r exposes r:<round>|<shuffled index>
    return p.rounds.map((round, r) => {
      const position = round.order.indexOf(round.oddIndex);
      return `r:${r}|${position}`;
    });
  },
  mount(root, p, ctx) {
    let roundIndex = 0;
    const status = el('div', { class: 'status-line', attrs: { role: 'status' }, text: `Round 1 / ${p.roundCount}` });
    const board = el('div', { class: 'choices wide', style: { '--choice-cols': 4 }, attrs: { role: 'group', 'aria-label': 'Round items' } });
    const render = () => {
      board.textContent = '';
      const round = p.rounds[roundIndex];
      const ordered = round.order.map((idx) => ({ spec: round.cells[idx], index: idx }));
      ordered.forEach((entry, position) => {
        const btn = el('button', {
          type: 'button', class: 'choice tile', dataset: { token: `r:${roundIndex}|${position}` },
          attrs: { 'aria-label': `Item ${position + 1}: ${shapeLabel(entry.spec)}` }
        }, shapeSVG(entry.spec, { size: 36, tone: 2 }));
        btn.addEventListener('click', () => {
          if (entry.index === round.oddIndex) {
            roundIndex++;
            ctx.audio.ui();
            if (roundIndex >= p.roundCount) { ctx.solve('All rounds cleared.'); return; }
            status.textContent = `Round ${roundIndex + 1} / ${p.roundCount}`;
            render();
          } else {
            ctx.fail('That item matches the others.');
          }
        });
        board.appendChild(btn);
      });
    };
    render();
    root.appendChild(promptText('Each round holds one item that differs from the rest. Select it.'));
    root.appendChild(status);
    root.appendChild(board);
  }
};

export const OBSERVATION_PUZZLES = {
  'observation.diff': observationDiff,
  'observation.hidden': observationHidden,
  'observation.anomaly': observationAnomaly,
  'observation.twin': observationTwin,
  'observation.text': observationText,
  'observation.silhouette': observationSilhouette,
  'observation.order': observationOrder,
  'observation.rapid': observationRapid
};
