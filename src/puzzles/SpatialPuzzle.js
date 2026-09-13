/**
 * SPATIAL REASONING puzzles.
 *
 * Everything here is drawn procedurally with SVG (grids, isometric cube stacks,
 * accented glyphs) — no image assets. Orientation puzzles use an "accent" dot
 * so that mirror images are genuinely distinguishable; the game therefore never
 * relies on colour to separate a rotation from a reflection.
 */

import { el, svgEl } from './puzzleApi.js';
import { buildChoices, scaledSize, t } from './common.js';
import { shapeSVG, shapeLabel, shapeKey, normalizeShape } from '../utils/shapes.js';
import { choiceList, promptText, interactiveGrid, boardEl } from './kit.js';
import { makeGrid, cloneGrid, findPath, DIR_VECTORS } from '../utils/grid.js';

/**
 * Composite glyph = base shape + two "marks" at different radii.
 *
 * Why two marks? Every base shape in this game is rotationally symmetric, so a
 * single mark on that orbit would make a mirrored glyph indistinguishable from
 * a rotated one. Two marks at different radii and non-orthogonal angles give
 * the image a genuine handedness, which is exactly what a rotation-vs-mirror
 * puzzle needs (and it never depends on colour).
 */
function compositeSVG(spec, marks, size = 44, title) {
  const s = normalizeShape(spec);
  const svg = svgEl('svg', {
    viewBox: '0 0 100 100', width: size, height: size, class: 'glyph composite', focusable: 'false',
    role: title ? 'img' : 'presentation'
  });
  if (title) svg.appendChild(svgEl('title', {}, title));
  const g = svgEl('g', { transform: 'translate(9 9) scale(0.82)' });
  g.appendChild(shapeSVG(s, { size: 100 , class: 'composite-shape' }));
  svg.appendChild(g);
  marks.forEach((mark, i) => {
    const rad = (mark.angle * Math.PI) / 180;
    svg.appendChild(svgEl('circle', {
      cx: 50 + mark.r * Math.cos(rad),
      cy: 50 + mark.r * Math.sin(rad),
      r: mark.r > 30 ? 8 : 5.5,
      class: `accent-dot accent-${i}`
    }));
  });
  return svg;
}

const normAngle = (a) => ((Math.round(a) % 360) + 360) % 360;

function compositeKey(c) {
  const marks = c.marks.map((m) => `${normAngle(m.angle)}:${m.r}`).sort().join('|');
  return `${shapeKey(c.spec)}|${marks}`;
}

function rotateComposite(c, steps) {
  return {
    spec: { ...normalizeShape(c.spec), rot: (normalizeShape(c.spec).rot + 45 * steps) % 360 },
    marks: c.marks.map((m) => ({ ...m, angle: normAngle(m.angle + 45 * steps) }))
  };
}

/** Reflection in the vertical axis: angle θ → 180° − θ (angles stay integral). */
function mirrorComposite(c) {
  return {
    spec: { ...normalizeShape(c.spec), rot: (360 - normalizeShape(c.spec).rot) % 360 },
    marks: c.marks.map((m) => ({ ...m, angle: normAngle(180 - m.angle) }))
  };
}

function describeComposite(c) {
  return `${shapeLabel(c.spec)}; outer mark at ${normAngle(c.marks[0].angle)}°, inner mark at ${normAngle(c.marks[1].angle)}°`;
}

// ---------------------------------------------------------------------------
// 1. Rotation vs reflection
// ---------------------------------------------------------------------------

export const spatialRotate = {
  id: 'spatial.rotate',
  category: 'spatial',
  name: 'Chirality Test',
  par: () => ({ time: 55, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const a1 = rng.int(0, 7) * 45;
    // the inner mark sits off the outer lattice → the pair is chiral
    const offset = rng.int(2, 5) * 25 + rng.int(0, 1) * 10;
    const base = {
      spec: normalizeShape({ shape: rng.pick(['chevron', 'arrow', 'moon', 'droplet', 'triangle', 'pentagon', 'star5']), fill: rng.pick(['solid', 'outline']), rot: 0, scale: 1 }),
      marks: [{ angle: normAngle(a1), r: 39 }, { angle: normAngle(a1 + offset), r: 19 }]
    };
    const steps = rng.int(1, d >= 6 ? 7 : 5);
    const answer = rotateComposite(base, steps);
    const distractors = [];
    for (let m = 0; m < 8 && distractors.length < 5; m++) {
      const mirrored = mirrorComposite(rotateComposite(base, m));
      if (compositeKey(mirrored) === compositeKey(answer)) continue;
      if (distractors.some((x) => compositeKey(x) === compositeKey(mirrored))) continue;
      distractors.push(mirrored);
    }
    const built = buildChoices({
      correct: answer,
      distractors,
      rng,
      equals: (a, b) => compositeKey(a) === compositeKey(b),
      labelFor: (c) => describeComposite(c),
      render: (c) => compositeSVG(c.spec, c.marks, 42)
    });
    return {
      seed: level.seed,
      target: base,
      options: built.options.map((o) => ({ value: o.value, token: o.token, label: o.label })),
      answerToken: built.answerToken,
      answer,
      hint: 'Follow the pair of dots: in a rotation the inner dot keeps the same clockwise offset from the outer dot.'
    };
  },
  validate(p) {
    const errs = [];
    if (!p.options || p.options.length < 3) errs.push('too few options');
    const keys = p.options.map((o) => compositeKey(o.value));
    if (new Set(keys).size !== keys.length) errs.push('duplicate option glyphs');
    if (keys.filter((k) => k === compositeKey(p.answer)).length !== 1) errs.push('answer must appear exactly once');
    const rotations = new Set();
    for (let m = 0; m < 8; m++) rotations.add(compositeKey(rotateComposite(p.answer, m)));
    if (rotations.has(compositeKey(p.answer)) === false) errs.push('rotation model broken');
    for (const opt of p.options) {
      if (compositeKey(opt.value) === compositeKey(p.answer)) continue;
      if (rotations.has(compositeKey(opt.value))) errs.push('a distractor is actually a rotation of the target');
    }
    return errs;
  },
  solve: (p) => [p.answerToken],
  mount(root, p, ctx) {
    root.appendChild(el('div', { class: 'rewrite-row' },
      el('div', { class: 'panel-label', text: 'TARGET' }),
      compositeSVG(p.target.spec, p.target.marks, 64, describeComposite(p.target))
    ));
    root.appendChild(promptText('Which option is a pure rotation of the target — not a mirror image?'));
    root.appendChild(choiceList({
      options: p.options.map((o) => ({ ...o, content: compositeSVG(o.value.spec, o.value.marks, 42) })),
      columns: 3,
      onChoose: (opt) => (compositeKey(opt.value) === compositeKey(p.answer) ? ctx.solve('Chirality confirmed.') : ctx.fail('That is a mirror image, not a rotation.'))
    }));
  }
};

// ---------------------------------------------------------------------------
// 2. Mirror completion
// ---------------------------------------------------------------------------

export const spatialMirror = {
  id: 'spatial.mirror',
  category: 'spatial',
  name: 'Mirror Bay',
  par: (p) => ({ time: 24 + p.rows * p.cols * 3, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const rows = scaledSize(d, 3, 4);
    const cols = rows * 2 + 1;
    const half = Math.floor(cols / 2);
    const pattern = makeGrid(rows, half + 1);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c <= half; c++) {
        pattern[r][c] = rng.bool(d <= 3 ? 0.5 : 0.4) ? 1 : 0;
      }
    }
    if (pattern.flat().every((v) => !v)) pattern[0][0] = 1;
    const solution = [];
    for (let r = 0; r < rows; r++) {
      for (let c = half + 1; c < cols; c++) {
        const mirrored = pattern[r][cols - 1 - c];
        if (mirrored) solution.push({ r, c });
      }
    }
    if (!solution.length) {
      pattern[1][1] = 1;
      for (let r = 0; r < rows; r++) {
        for (let c = half + 1; c < cols; c++) if (pattern[r][cols - 1 - c]) solution.push({ r, c });
      }
    }
    return {
      seed: level.seed, rows, cols, half, pattern, solution,
      hint: 'Every lit cell must have a twin the same distance from the centre column.'
    };
  },
  validate(p) {
    const errs = [];
    if (p.cols !== p.rows * 2 + 1) errs.push('board must have an odd number of columns');
    if (!p.solution.length) errs.push('nothing to mirror');
    for (const { r, c } of p.solution) {
      const mirrored = p.cols - 1 - c;
      if (!p.pattern[r][mirrored]) errs.push(`cell ${r},${c} has no mirror partner`);
    }
    return errs;
  },
  solve: (p) => p.solution.map(({ r, c }) => t(r, c)),
  mount(root, p, ctx) {
    let placed = 0;
    const status = el('div', { class: 'status-line', attrs: { role: 'status' }, text: `0 / ${p.solution.length} mirror cells` });
    const grid = interactiveGrid({
      rows: p.rows, cols: p.cols, cellSize: 42, tokenPrefix: 'cell', ariaLabel: 'Mirror board',
      render: (r, c) => {
        if (c <= p.half) {
          return {
            node: el('span', { class: `cell-dot ${p.pattern[r][c] ? 'lit' : ''}`.trim() }),
            label: `Row ${r + 1} column ${c + 1}: ${p.pattern[r][c] ? 'lit source' : 'dark source'}`,
            className: 'source'
          };
        }
        return { node: el('span', { class: 'cell-dot' }), label: `Row ${r + 1} column ${c + 1}: editable` };
      },
      onSelect: (r, c, btn) => {
        if (c <= p.half) return;
        const isSolution = p.solution.some((x) => x.r === r && x.c === c);
        const active = btn.classList.toggle('correct');
        if (isSolution === active) {
          placed = grid.querySelectorAll('.cell.correct').length;
          status.textContent = `${placed} / ${p.solution.length} mirror cells`;
          if (placed === p.solution.length) ctx.solve('Mirror bay aligned.');
        } else if (active && !isSolution) {
          ctx.fail('That cell has no counterpart on the source side.');
          btn.classList.remove('correct');
          placed = grid.querySelectorAll('.cell.correct').length;
          status.textContent = `${placed} / ${p.solution.length} mirror cells`;
        }
      }
    });
    root.appendChild(promptText('Complete the right half so the whole board is a perfect mirror image.'));
    root.appendChild(grid);
    root.appendChild(status);
  }
};

// ---------------------------------------------------------------------------
// 3. Directional navigation with a move budget
// ---------------------------------------------------------------------------

export const spatialNavigate = {
  id: 'spatial.navigate',
  category: 'spatial',
  name: 'Bay Transit',
  par: (p) => ({ time: 20 + p.path.length * 5, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const n = scaledSize(d, 4, 6);
    const walls = new Set();
    const wallCount = Math.floor(n * n * (d <= 3 ? 0.12 : d <= 6 ? 0.2 : 0.26));
    for (let i = 0; i < wallCount; i++) {
      const r = rng.int(0, n - 1);
      const c = rng.int(0, n - 1);
      walls.add(`${r},${c}`);
    }
    const start = { r: rng.int(0, n - 2), c: rng.int(0, n - 2) };
    const goal = { r: rng.int(1, n - 1), c: rng.int(1, n - 1) };
    walls.delete(`${start.r},${start.c}`);
    walls.delete(`${goal.r},${goal.c}`);
    const grid = makeGrid(n, n, 1);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (walls.has(`${r},${c}`)) grid[r][c] = 0;
    const passable = (g, r, c) => g[r][c] === 1;
    let path = findPath(grid, start, goal, passable);
    let guard = 0;
    while ((!path || path.length < 3) && guard++ < 40) {
      for (const key of walls) grid[Number(key.split(',')[0])][Number(key.split(',')[1])] = 0;
      walls.clear();
      for (let i = 0; i < Math.floor(wallCount / 2); i++) {
        const r = rng.int(0, n - 1);
        const c = rng.int(0, n - 1);
        if ((r === start.r && c === start.c) || (r === goal.r && c === goal.c)) continue;
        walls.add(`${r},${c}`);
        grid[r][c] = 0;
      }
      path = findPath(grid, start, goal, passable);
    }
    if (!path) {
      // free corridor fallback: everything passable
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) grid[r][c] = 1;
      path = findPath(grid, start, goal, passable);
    }
    const moveBudget = path.length - 1 + (d <= 3 ? 4 : d <= 6 ? 2 : 0);
    return {
      seed: level.seed, n, grid, start, goal, path, moveBudget,
      optimal: path.length - 1,
      hint: 'Moving into a bulkhead wastes a move — plan the whole route first.'
    };
  },
  validate(p) {
    const errs = [];
    const passable = (g, r, c) => g[r][c] === 1;
    if (!p.grid || p.grid.length !== p.n) errs.push('grid size mismatch');
    if (!passable(p.grid, p.start.r, p.start.c)) errs.push('start is inside a wall');
    if (!passable(p.grid, p.goal.r, p.goal.c)) errs.push('goal is inside a wall');
    const path = findPath(p.grid, p.start, p.goal, passable);
    if (!path) errs.push('no route from start to goal');
    else if (p.moveBudget < path.length - 1) errs.push('move budget is smaller than the shortest route');
    return errs;
  },
  solve(p) {
    const passable = (g, r, c) => g[r][c] === 1;
    const path = findPath(p.grid, p.start, p.goal, passable) || [];
    return path.slice(1).map((step, i) => {
      const prev = path[i];
      const dir = step.r - prev.r === -1 ? 'N' : step.r - prev.r === 1 ? 'S' : step.c - prev.c === 1 ? 'E' : 'W';
      return `move:${dir}`;
    });
  },
  mount(root, p, ctx) {
    let pos = { ...p.start };
    let budget = p.moveBudget;
    const status = el('div', { class: 'status-line', attrs: { role: 'status' }, text: `Moves left: ${budget}` });
    const board = boardEl(p.n, p.n, { cellSize: 46, ariaLabel: 'Station bay', role: 'img' });
    const wallNodes = new Map();
    for (let r = 0; r < p.n; r++) {
      for (let c = 0; c < p.n; c++) {
        const node = el('div', {
          class: `board-cell static ${p.grid[r][c] ? 'floor' : 'wall'}`,
          style: { gridArea: `${r + 1} / ${c + 1}` },
          attrs: { 'aria-label': p.grid[r][c] ? 'floor' : 'bulkhead' }
        });
        wallNodes.set(`${r},${c}`, node);
        board.appendChild(node);
      }
    }
    const crew = el('div', { class: 'rover', text: '◇', attrs: { 'aria-hidden': 'true' } });
    const update = () => {
      crew.style.gridArea = `${pos.r + 1} / ${pos.c + 1}`;
      wallNodes.forEach((node, key) => node.classList.toggle('rover-here', key === `${pos.r},${pos.c}`));
    };
    board.appendChild(crew);
    update();
    const move = (dir) => {
      const index = { N: 0, E: 1, S: 2, W: 3 }[dir];
      const delta = DIR_VECTORS[index];
      if (!delta) return;
      const nr = pos.r + delta.dr;
      const nc = pos.c + delta.dc;
      if (nr < 0 || nc < 0 || nr >= p.n || nc >= p.n) { ctx.fail('That is the outer hull.'); return; }
      if (!p.grid[nr][nc]) { ctx.fail('A bulkhead blocks the way.'); return; }
      budget--;
      pos = { r: nr, c: nc };
      ctx.audio.ui();
      update();
      status.textContent = `Moves left: ${budget}`;
      if (pos.r === p.goal.r && pos.c === p.goal.c) ctx.solve('Destination reached.');
      else if (budget <= 0) ctx.fail('Out of power — the transit stalls.');
    };
    const pad = el('div', { class: 'dpad', attrs: { role: 'group', 'aria-label': 'Movement controls' } });
    [['N', '▲', 1, 2], ['W', '◀', 2, 1], ['E', '▶', 2, 3], ['S', '▼', 3, 2]].forEach(([dir, label, row, col]) => {
      const btn = el('button', {
        type: 'button', class: 'dpad-btn', text: label, dataset: { token: `move:${dir}` },
        attrs: { 'aria-label': `Move ${dir}`, style: `grid-area:${row}/${col}` }
      });
      btn.addEventListener('click', () => move(dir));
      pad.appendChild(btn);
    });
    root.appendChild(promptText(`Reach the exit within ${p.moveBudget} moves.`));
    root.appendChild(board);
    root.appendChild(pad);
    root.appendChild(status);
  }
};

// ---------------------------------------------------------------------------
// 4. Maze by tapping cells
// ---------------------------------------------------------------------------

export const spatialMaze = {
  id: 'spatial.maze',
  category: 'spatial',
  name: 'Duct Walk',
  par: (p) => ({ time: 40 + p.cells * 2, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const n = d <= 3 ? 5 : d <= 6 ? 7 : 9;
    const grid = makeGrid(n, n, 0);
    // recursive-backtracker maze on odd cells
    const cellsR = Math.floor((n - 1) / 2);
    const cellsC = Math.floor((n - 1) / 2);
    const visited = new Set();
    const carve = (r, c) => {
      visited.add(`${r},${c}`);
      grid[r * 2][c * 2] = 1;
      const dirs = rng.shuffle([[0, 1], [1, 0], [0, -1], [-1, 0]]);
      for (const [dr, dc] of dirs) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nc < 0 || nr >= cellsR || nc >= cellsC) continue;
        if (visited.has(`${nr},${nc}`)) continue;
        grid[r * 2 + dr][c * 2 + dc] = 1;
        carve(nr, nc);
      }
    };
    carve(0, 0);
    const start = { r: 0, c: 0 };
    const goal = { r: (cellsR - 1) * 2, c: (cellsC - 1) * 2 };
    grid[start.r][start.c] = 1;
    grid[goal.r][goal.c] = 1;
    const path = findPath(grid, start, goal, (g, r, c) => g[r][c] === 1) || [];
    return {
      seed: level.seed, n, grid, start, goal, path, cells: n * n,
      hint: 'Dead ends are free to explore — you can always step back the way you came.'
    };
  },
  validate(p) {
    const errs = [];
    if (!p.grid || p.grid.length !== p.n) errs.push('grid size mismatch');
    const path = findPath(p.grid, p.start, p.goal, (g, r, c) => g[r][c] === 1);
    if (!path) errs.push('maze has no route to the exit');
    if (p.grid[p.start.r][p.start.c] !== 1 || p.grid[p.goal.r][p.goal.c] !== 1) errs.push('start or exit is walled in');
    return errs;
  },
  solve: (p) => {
    const path = findPath(p.grid, p.start, p.goal, (g, r, c) => g[r][c] === 1) || [];
    // the walker already occupies the first cell, so only the steps after it
    // are clicks (clicking the start would be rejected as "not adjacent")
    return path.slice(1).map(({ r, c }) => t(r, c));
  },
  mount(root, p, ctx) {
    let pos = { ...p.start };
    const trail = new Set([`${pos.r},${pos.c}`]);
    const status = el('div', { class: 'status-line', attrs: { role: 'status' }, text: 'Trace a route to the exit.' });
    const grid = interactiveGrid({
      rows: p.n, cols: p.n, cellSize: p.n > 7 ? 32 : 42, tokenPrefix: 'cell', ariaLabel: 'Duct maze',
      render: (r, c) => ({
        node: el('span', { class: p.grid[r][c] ? 'duct' : 'duct-wall' }),
        label: `Row ${r + 1} column ${c + 1}: ${p.grid[r][c] ? 'open duct' : 'wall'}`
      }),
      onSelect: (r, c, btn) => {
        const adjacent = Math.abs(r - pos.r) + Math.abs(c - pos.c) === 1;
        if (!adjacent) { ctx.fail('You can only move to an adjacent duct.'); return; }
        if (!p.grid[r][c]) { ctx.fail('That duct is sealed.'); return; }
        pos = { r, c };
        trail.add(`${pos.r},${pos.c}`);
        btn.classList.add('traversed');
        ctx.audio.ui();
        if (pos.r === p.goal.r && pos.c === p.goal.c) ctx.solve('Exit reached.');
      }
    });
    const startNode = grid.__cell(p.start.r, p.start.c);
    if (startNode) startNode.classList.add('start-cell');
    const goalNode = grid.__cell(p.goal.r, p.goal.c);
    if (goalNode) goalNode.classList.add('goal-cell');
    root.appendChild(promptText('Walk from the entry duct (◇) to the exit (◆) by tapping neighbouring cells.'));
    root.appendChild(grid);
    root.appendChild(status);
  }
};

// ---------------------------------------------------------------------------
// 5. Facing / direction reasoning
// ---------------------------------------------------------------------------

export const spatialDirection = {
  id: 'spatial.direction',
  category: 'spatial',
  name: 'Vector Drift',
  par: () => ({ time: 45, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const turns = Math.max(2, Math.min(7, 2 + Math.floor(d * 0.6)));
    const start = rng.int(0, 3);
    const commands = [];
    let facing = start;
    let pos = { r: 2, c: 2 };
    const gridSize = 5;
    for (let i = 0; i < turns; i++) {
      const kind = rng.pick(d <= 3 ? ['turn', 'turn'] : ['turn', 'turn', 'move']);
      if (kind === 'turn') {
        const delta = rng.pick([1, -1, 2]);
        facing = ((facing + delta) % 4 + 4) % 4;
        commands.push({ kind: 'turn', delta });
      } else {
        const dir = DIR_VECTORS[facing];
        const steps = rng.int(1, 2);
        const nr = Math.max(0, Math.min(gridSize - 1, pos.r + dir.dr * steps));
        const nc = Math.max(0, Math.min(gridSize - 1, pos.c + dir.dc * steps));
        const moved = Math.abs(nr - pos.r) + Math.abs(nc - pos.c);
        if (moved === 0) { commands.push({ kind: 'turn', delta: 1 }); facing = (facing + 1) % 4; continue; }
        pos = { r: nr, c: nc };
        commands.push({ kind: 'move', steps: moved });
      }
    }
    const directions = DIR_VECTORS.map((v) => v.label);
    const built = buildChoices({
      correct: directions[facing],
      distractors: directions.filter((dir) => dir !== directions[facing]),
      rng,
      labelFor: (v) => v,
      render: (v) => el('span', { class: 'num', text: v })
    });
    return {
      seed: level.seed, gridSize, start, commands, finalFacing: facing, finalPos: pos,
      options: built.options.map((o) => ({ value: o.value, token: o.token, label: o.label })),
      answerToken: built.answerToken,
      hint: 'Turn yourself, not the grid: left is a quarter turn anticlockwise.'
    };
  },
  validate(p) {
    const errs = [];
    if (!p.commands.length) errs.push('no commands');
    let facing = p.start;
    for (const cmd of p.commands) if (cmd.kind === 'turn') facing = ((facing + cmd.delta) % 4 + 4) % 4;
    if (facing !== p.finalFacing) errs.push('recorded final facing does not match the commands');
    if (!p.options.some((o) => o.token === p.answerToken)) errs.push('answer missing from options');
    if (p.options.length !== 4) errs.push('all four directions must be offered');
    return errs;
  },
  solve: (p) => [p.answerToken],
  mount(root, p, ctx) {
    const arrow = ['↑', '→', '↓', '←'][p.start];
    const list = el('ol', { class: 'clue-list', attrs: { 'aria-label': 'Commands' } });
    p.commands.forEach((cmd) => {
      const text = cmd.kind === 'turn'
        ? cmd.delta === 1 ? 'Turn 90° clockwise.'
          : cmd.delta === -1 ? 'Turn 90° anticlockwise.'
            : 'Turn 180°.'
        : `Move forward ${cmd.steps} step${cmd.steps > 1 ? 's' : ''}.`;
      list.appendChild(el('li', { class: 'clue', text }));
    });
    root.appendChild(el('div', { class: 'rewrite-row' },
      el('div', { class: 'panel-label', text: 'FACING NOW' }),
      el('span', { class: 'dir-arrow', text: arrow, attrs: { 'aria-label': DIR_VECTORS[p.start].label } })
    ));
    root.appendChild(list);
    root.appendChild(promptText('Which direction are you facing after the whole sequence?'));
    root.appendChild(choiceList({
      options: p.options.map((o) => ({ ...o, content: el('span', { class: 'num', text: o.value }) })),
      columns: 4,
      onChoose: (opt) => (opt.value === DIR_VECTORS[p.finalFacing].label ? ctx.solve('Vector traced.') : ctx.fail('You would be facing another way.'))
    }));
  }
};

// ---------------------------------------------------------------------------
// 6. Piece fitting (exact shape match)
// ---------------------------------------------------------------------------

function normalizeCells(cells) {
  const minR = Math.min(...cells.map((c) => c.r));
  const minC = Math.min(...cells.map((c) => c.c));
  return cells.map((c) => `${c.r - minR},${c.c - minC}`).sort().join('|');
}

export const spatialFit = {
  id: 'spatial.fit',
  category: 'spatial',
  name: 'Cavity Match',
  par: () => ({ time: 60, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const size = d <= 4 ? 3 : 4;
    const areas = d <= 4 ? [4, 5] : [5, 6];
    const area = rng.pick(areas);
    const grow = (limit) => {
      const cells = [{ r: rng.int(0, size - 1), c: rng.int(0, size - 1) }];
      let guard = 0;
      while (cells.length < limit && guard++ < 200) {
        const base = rng.pick(cells);
        const dir = rng.pick([[0, 1], [1, 0], [0, -1], [-1, 0]]);
        const nr = base.r + dir[0];
        const nc = base.c + dir[1];
        if (nr < 0 || nc < 0 || nr >= size || nc >= size) continue;
        if (cells.some((x) => x.r === nr && x.c === nc)) continue;
        cells.push({ r: nr, c: nc });
      }
      return cells;
    };
    const cavity = grow(area);
    const cavityKey = normalizeCells(cavity);
    const candidates = [cavity];
    let guard = 0;
    while (candidates.length < 5 && guard++ < 400) {
      const piece = grow(area);
      const key = normalizeCells(piece);
      if (candidates.some((p) => normalizeCells(p) === key)) continue;
      candidates.push(piece);
    }
    const built = buildChoices({
      correct: cavity,
      distractors: candidates.filter((c) => normalizeCells(c) !== cavityKey),
      rng,
      equals: (a, b) => normalizeCells(a) === normalizeCells(b),
      labelFor: (cells) => `${cells.length}-cell piece`,
      render: (cells) => pieceSVG(cells, 44)
    });
    return {
      seed: level.seed, cavity, size,
      options: built.options.map((o) => ({ cells: o.value, token: o.token, label: o.label })),
      answerToken: built.answerToken,
      hint: 'Count the cells first: a piece with the wrong area cannot fit at all.'
    };
  },
  validate(p) {
    const errs = [];
    const cavityKey = normalizeCells(p.cavity);
    if (!p.options || p.options.length < 3) errs.push('too few candidate pieces');
    if (p.options.filter((o) => normalizeCells(o.cells) === cavityKey).length !== 1) errs.push('exactly one piece must match the cavity');
    const answer = p.options.find((o) => o.token === p.answerToken);
    if (!answer) errs.push('answer token missing');
    else if (normalizeCells(answer.cells) !== cavityKey) errs.push('listed answer does not match the cavity');
    if (p.options.some((o) => o.cells.length !== p.cavity.length)) errs.push('a candidate has the wrong area — it would be trivially wrong');
    return errs;
  },
  solve: (p) => [p.answerToken],
  mount(root, p, ctx) {
    root.appendChild(promptText('Which plate exactly fills the cavity?'));
    root.appendChild(el('div', { class: 'rewrite-row' },
      el('div', { class: 'panel-label', text: 'CAVITY' }),
      pieceSVG(p.cavity, 64)
    ));
    const cavityKey = normalizeCells(p.cavity);
    root.appendChild(choiceList({
      options: p.options.map((o) => ({ ...o, content: pieceSVG(o.cells, 44) })),
      columns: 3,
      onChoose: (opt) => (normalizeCells(opt.cells) === cavityKey ? ctx.solve('Plate seated.') : ctx.fail('That plate leaves a gap.'))
    }));
  }
};

function pieceSVG(cells, size = 44) {
  const rows = Math.max(...cells.map((c) => c.r)) + 1;
  const cols = Math.max(...cells.map((c) => c.c)) + 1;
  const box = Math.max(rows, cols);
  const cellSize = 100 / box;
  const svg = svgEl('svg', { viewBox: '0 0 100 100', width: size, height: size, class: 'piece', focusable: 'false', role: 'presentation' });
  for (let r = 0; r < box; r++) {
    for (let c = 0; c < box; c++) {
      const filled = cells.some((x) => x.r === r && x.c === c);
      svg.appendChild(svgEl('rect', {
        x: c * cellSize + 1, y: r * cellSize + 1, width: cellSize - 2, height: cellSize - 2,
        class: filled ? 'piece-cell on' : 'piece-cell off', rx: 2
      }));
    }
  }
  return svg;
}

// ---------------------------------------------------------------------------
// 7. Cube-stack views
// ---------------------------------------------------------------------------

function isoCube(x, y, unit, z = 0) {
  const h = unit;
  const top = [
    [x, y - h], [x + h, y - h * 2], [x + h * 2, y - h], [x + h, y]
  ];
  const left = [
    [x, y - h], [x, y - h + h * 1.6], [x + h, y + h * 0.6], [x + h, y]
  ];
  const right = [
    [x + h, y], [x + h, y + h * 1.6], [x + h * 2, y + h * 0.6], [x + h * 2, y - h]
  ];
  const poly = (points, cls) => svgEl('polygon', { points: points.map(([px, py]) => `${px.toFixed(1)},${(py - z).toFixed(1)}`).join(' '), class: cls });
  return [poly(left, 'cube-left'), poly(right, 'cube-right'), poly(top, 'cube-top')];
}

export function isoStacks(heights, size = 220) {
  const rows = heights.length;
  const cols = heights[0].length;
  const unit = Math.min(38, 200 / (rows + cols));
  const svg = svgEl('svg', {
    viewBox: '0 0 260 220', width: size, height: (size * 220) / 260, class: 'iso', focusable: 'false',
    role: 'img', 'aria-label': 'Isometric view of cube stacks'
  });
  const originX = 118;
  const originY = 176;
  const maxH = Math.max(...heights.flat());
  for (let r = rows - 1; r >= 0; r--) {
    for (let c = cols - 1; c >= 0; c--) {
      const h = heights[r][c];
      for (let level = 0; level < h; level++) {
        const x = originX + (c - r) * unit;
        const y = originY + (c + r) * unit * 0.5 - level * unit * 1.6 - (maxH - h) * 0;
        for (const part of isoCube(x, y, unit)) svg.appendChild(part);
      }
    }
  }
  return svg;
}

export const spatialTopView = {
  id: 'spatial.topview',
  category: 'spatial',
  name: 'Stack Projection',
  par: () => ({ time: 60, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const n = d <= 4 ? 3 : 4;
    const rotate = (grid) => grid[0].map((_, i) => grid.map((row) => row[i]).reverse());
    const mirror = (grid) => grid.map((row) => row.slice().reverse());
    const key = (g) => g.map((r) => r.join('')).join('/');
    let heights = [];
    let top = [];
    let distractorGrids = [];
    let guard = 0;
    while (guard++ < 200) {
      heights = [];
      for (let r = 0; r < n; r++) {
        const row = [];
        for (let c = 0; c < n; c++) row.push(rng.next() < 0.78 ? rng.int(1, d <= 4 ? 3 : 5) : 0);
        heights.push(row);
      }
      top = heights.map((row) => row.map((h) => (h > 0 ? 1 : 0)));
      if (!top.flat().some(Boolean)) continue;
      if (top.flat().filter(Boolean).length < Math.max(3, Math.ceil(n * n * 0.45))) continue;
      const variants = [rotate(top), rotate(rotate(top)), rotate(rotate(rotate(top))), mirror(top), mirror(rotate(top))];
      const seen = new Set([key(top)]);
      distractorGrids = [];
      for (const v of variants) {
        const k = key(v);
        if (seen.has(k)) continue;
        seen.add(k);
        distractorGrids.push(v);
      }
      if (distractorGrids.length >= 3) break;
    }
    if (distractorGrids.length < 3) {
      // deterministic fallback: single-cell mutations of the silhouette
      const cells = [];
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (top[r][c]) cells.push({ r, c });
      for (const cell of cells) {
        const copy = top.map((row) => row.slice());
        copy[cell.r][cell.c] = 0;
        const k = key(copy);
        if (distractorGrids.some((g) => key(g) === k)) continue;
        distractorGrids.push(copy);
        if (distractorGrids.length >= 4) break;
      }
    }
    const built = buildChoices({
      correct: top,
      distractors: distractorGrids,
      rng,
      equals: (a, b) => key(a) === key(b),
      labelFor: () => 'top view',
      render: (grid) => viewSVG(grid, 44)
    });
    return {
      seed: level.seed, heights, top, n,
      options: built.options.map((o) => ({ grid: o.value, token: o.token, label: o.label })),
      answerToken: built.answerToken,
      hint: 'Only the occupied cells matter: a stack of one cube casts the same footprint as a stack of five.'
    };
  },
  validate(p) {
    const errs = [];
    if (!p.heights.length || p.heights[0].length !== p.n) errs.push('heightmap malformed');
    if (!p.heights.flat().some((h) => h > 0)) errs.push('structure is empty');
    const key = (g) => g.map((r) => r.join('')).join('/');
    const derived = p.heights.map((row) => row.map((h) => (h > 0 ? 1 : 0)));
    if (key(derived) !== key(p.top)) errs.push('the answer grid is not the footprint of the heightmap');
    if (p.options.filter((o) => key(o.grid) === key(p.top)).length !== 1) errs.push('answer grid must appear exactly once');
    if (p.options.length < 3) errs.push('too few options');
    return errs;
  },
  solve: (p) => [p.answerToken],
  mount(root, p, ctx) {
    root.appendChild(el('div', { class: 'rewrite-row' }, isoStacks(p.heights, 260)));
    root.appendChild(promptText('Which grid shows the stacks seen from directly above?'));
    const key = (g) => g.map((r) => r.join('')).join('/');
    root.appendChild(choiceList({
      options: p.options.map((o) => ({ ...o, content: viewSVG(o.grid, 46) })),
      columns: p.options.length,
      onChoose: (opt) => (key(opt.grid) === key(p.top) ? ctx.solve('Projection correct.') : ctx.fail('That is not the view from above.'))
    }));
  }
};

function viewSVG(grid, size = 46) {
  const n = grid.length;
  const cell = 100 / n;
  const svg = svgEl('svg', { viewBox: '0 0 100 100', width: size, height: size, class: 'view-grid', focusable: 'false', role: 'presentation' });
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      svg.appendChild(svgEl('rect', {
        x: c * cell + 2, y: r * cell + 2, width: cell - 4, height: cell - 4,
        class: grid[r][c] ? 'view-cell on' : 'view-cell off', rx: 3
      }));
    }
  }
  return svg;
}

// ---------------------------------------------------------------------------
// 8. Board transformation by explicit operations
// ---------------------------------------------------------------------------

function rotateGrid(grid) {
  const n = grid.length;
  return grid[0].map((_, c) => grid.map((row) => row[c]).reverse());
}

function flipGrid(grid) {
  return grid.map((row) => row.slice().reverse());
}

export const spatialTransform = {
  id: 'spatial.transform',
  category: 'spatial',
  name: 'Plate Rotation',
  par: () => ({ time: 55, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const n = d <= 4 ? 3 : 4;
    const start = makeGrid(n, n, 0);
    const litCount = Math.max(3, Math.floor(n * n * 0.4));
    const chosen = rng.sample(Array.from({ length: n * n }, (_, i) => i), litCount);
    chosen.forEach((i) => { start[Math.floor(i / n)][i % n] = 1; });
    let current = cloneGrid(start);
    const ops = [];
    const opCount = Math.max(1, Math.min(4, 1 + Math.floor(d * 0.4)));
    let guard = 0;
    do {
      current = cloneGrid(start);
      ops.length = 0;
      for (let i = 0; i < opCount; i++) {
        const op = rng.pick(['cw', 'ccw', 'flip']);
        ops.push(op);
        current = op === 'cw' ? rotateGrid(current) : op === 'ccw' ? rotateGrid(rotateGrid(rotateGrid(current))) : flipGrid(current);
      }
    } while (JSON.stringify(current) === JSON.stringify(start) && guard++ < 60);
    const target = current;
    return {
      seed: level.seed, n, start, target, ops,
      hint: 'The operations are reversible — try undoing the target back onto the plate.'
    };
  },
  validate(p) {
    const errs = [];
    if (!p.start.length || p.start.length !== p.n) errs.push('start grid malformed');
    if (!p.target.length || p.target.length !== p.n) errs.push('target grid malformed');
    const same = JSON.stringify(p.start) === JSON.stringify(p.target);
    if (same) errs.push('start and target are identical');
    if (!p.ops.length) errs.push('no operations to perform');
    // prove reachability: the group generated by cw/ccw/flip must reach the target
    const seen = new Set();
    const queue = [p.start];
    const key = (g) => JSON.stringify(g);
    seen.add(key(p.start));
    let reached = false;
    while (queue.length) {
      const cur = queue.shift();
      if (key(cur) === key(p.target)) { reached = true; break; }
      if (seen.size > 200) break;
      for (const next of [rotateGrid(cur), rotateGrid(rotateGrid(rotateGrid(cur))), flipGrid(cur)]) {
        if (seen.has(key(next))) continue;
        seen.add(key(next));
        queue.push(next);
      }
    }
    if (!reached) errs.push('target is unreachable from the start plate');
    return errs;
  },
  solve(p) {
    // BFS over the transformation group, then emit the token sequence
    const key = (g) => JSON.stringify(g);
    const start = p.start;
    const seen = new Set([key(start)]);
    const queue = [{ grid: start, path: [] }];
    while (queue.length) {
      const { grid, path } = queue.shift();
      if (key(grid) === key(p.target)) return path;
      if (path.length > 6) continue;
      const moves = [['cw', rotateGrid(grid)], ['ccw', rotateGrid(rotateGrid(rotateGrid(grid)))], ['flip', flipGrid(grid)]];
      for (const [name, next] of moves) {
        if (seen.has(key(next))) continue;
        seen.add(key(next));
        queue.push({ grid: next, path: [...path, `op:${name}`] });
      }
    }
    return [];
  },
  mount(root, p, ctx) {
    let current = cloneGrid(p.start);
    const movesUsed = el('div', { class: 'status-line', attrs: { role: 'status' }, text: 'Operations: 0' });
    let used = 0;
    const renderPlate = (grid, label, cls = '') => {
      const board = boardEl(p.n, p.n, { cellSize: 34, ariaLabel: label, role: 'img', className: `plate ${cls}` });
      for (let r = 0; r < p.n; r++) {
        for (let c = 0; c < p.n; c++) {
          board.appendChild(el('div', {
            class: `board-cell static ${grid[r][c] ? 'lit' : 'dark'}`,
            style: { gridArea: `${r + 1} / ${c + 1}` }
          }));
        }
      }
      return board;
    };
    const currentWrap = el('div', { class: 'panel' }, el('div', { class: 'panel-label', text: 'CURRENT PLATE' }));
    const redraw = () => {
      currentWrap.textContent = '';
      currentWrap.appendChild(el('div', { class: 'panel-label', text: 'CURRENT PLATE' }));
      currentWrap.appendChild(renderPlate(current, 'Current plate'));
    };
    redraw();
    const targetWrap = el('div', { class: 'panel' }, el('div', { class: 'panel-label', text: 'TARGET' }), renderPlate(p.target, 'Target plate'));
    const apply = (name) => {
      current = name === 'cw' ? rotateGrid(current) : name === 'ccw' ? rotateGrid(rotateGrid(rotateGrid(current))) : flipGrid(current);
      used++;
      movesUsed.textContent = `Operations: ${used}`;
      ctx.audio.ui();
      redraw();
      if (JSON.stringify(current) === JSON.stringify(p.target)) ctx.solve('Plate aligned.');
    };
    const controls = el('div', { class: 'btn-row wrap' },
      el('button', { type: 'button', class: 'btn btn-small', text: '↻ ROTATE CW', dataset: { token: 'op:cw' }, attrs: { 'aria-label': 'Rotate clockwise' }, onclick: () => apply('cw') }),
      el('button', { type: 'button', class: 'btn btn-small', text: '↺ ROTATE CCW', dataset: { token: 'op:ccw' }, attrs: { 'aria-label': 'Rotate anticlockwise' }, onclick: () => apply('ccw') }),
      el('button', { type: 'button', class: 'btn btn-small', text: '⇋ FLIP', dataset: { token: 'op:flip' }, attrs: { 'aria-label': 'Flip horizontally' }, onclick: () => apply('flip') })
    );
    root.appendChild(promptText('Rotate or flip the plate until it matches the target.'));
    root.appendChild(el('div', { class: 'dual-panel' }, currentWrap, targetWrap));
    root.appendChild(controls);
    root.appendChild(movesUsed);
  }
};

// ---------------------------------------------------------------------------
// 9. Fragment hunting inside a larger pattern
// ---------------------------------------------------------------------------

export const spatialFragment = {
  id: 'spatial.fragment',
  category: 'spatial',
  name: 'Fragment Search',
  par: () => ({ time: 55, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const n = d <= 4 ? 5 : 6;
    const pattern = makeGrid(n, n, 0);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) pattern[r][c] = rng.bool(0.45) ? 1 : 0;
    const fragSize = 3;
    const fr = rng.int(0, n - fragSize);
    const fc = rng.int(0, n - fragSize);
    const fragment = [];
    for (let r = 0; r < fragSize; r++) {
      const row = [];
      for (let c = 0; c < fragSize; c++) row.push(pattern[fr + r][fc + c]);
      fragment.push(row);
    }
    const existsIn = (grid, frag) => {
      for (let r = 0; r + frag.length <= grid.length; r++) {
        for (let c = 0; c + frag[0].length <= grid[0].length; c++) {
          let ok = true;
          for (let i = 0; i < frag.length && ok; i++) {
            for (let j = 0; j < frag[0].length && ok; j++) if (grid[r + i][c + j] !== frag[i][j]) ok = false;
          }
          if (ok) return true;
        }
      }
      return false;
    };
    const distractors = [];
    let guard = 0;
    while (distractors.length < 4 && guard++ < 300) {
      const copy = fragment.map((row) => row.slice());
      const flips = rng.int(1, 3);
      for (let i = 0; i < flips; i++) {
        const r = rng.int(0, fragSize - 1);
        const c = rng.int(0, fragSize - 1);
        copy[r][c] = copy[r][c] ? 0 : 1;
      }
      if (JSON.stringify(copy) === JSON.stringify(fragment)) continue;
      if (existsIn(pattern, copy)) continue;
      if (distractors.some((d2) => JSON.stringify(d2) === JSON.stringify(copy))) continue;
      distractors.push(copy);
    }
    if (distractors.length < 3) {
      // deterministic fallback: invert a corner cell
      for (let i = 0; i < 4 && distractors.length < 4; i++) {
        const copy = fragment.map((row) => row.slice());
        copy[0][i % fragSize] = copy[0][i % fragSize] ? 0 : 1;
        if (!existsIn(pattern, copy) && JSON.stringify(copy) !== JSON.stringify(fragment)) distractors.push(copy);
      }
    }
    const built = buildChoices({
      correct: fragment,
      distractors,
      rng,
      equals: (a, b) => JSON.stringify(a) === JSON.stringify(b),
      labelFor: () => 'fragment',
      render: (grid) => viewSVG(grid, 44)
    });
    return {
      seed: level.seed, pattern, fragment, n, fragSize,
      options: built.options.map((o) => ({ grid: o.value, token: o.token, label: o.label })),
      answerToken: built.answerToken,
      hint: 'Scan row by row and match the corner cells first.'
    };
  },
  validate(p) {
    const errs = [];
    const existsIn = (grid, frag) => {
      for (let r = 0; r + frag.length <= grid.length; r++) {
        for (let c = 0; c + frag[0].length <= grid[0].length; c++) {
          let ok = true;
          for (let i = 0; i < frag.length && ok; i++) {
            for (let j = 0; j < frag[0].length && ok; j++) if (grid[r + i][c + j] !== frag[i][j]) ok = false;
          }
          if (ok) return true;
        }
      }
      return false;
    };
    if (!existsIn(p.pattern, p.fragment)) errs.push('the true fragment does not appear in the pattern');
    const matching = p.options.filter((o) => existsIn(p.pattern, o.grid));
    if (matching.length !== 1) errs.push(`${matching.length} options appear in the pattern (need exactly 1)`);
    const answer = p.options.find((o) => o.token === p.answerToken);
    if (!answer || !existsIn(p.pattern, answer.grid)) errs.push('listed answer does not appear in the pattern');
    if (p.options.length < 3) errs.push('too few options');
    return errs;
  },
  solve: (p) => [p.answerToken],
  mount(root, p, ctx) {
    const camo = el('div', { class: 'camograph', attrs: { role: 'img', 'aria-label': 'Surveillance pattern' } });
    for (let r = 0; r < p.n; r++) {
      for (let c = 0; c < p.n; c++) {
        camo.appendChild(el('span', { class: `camograph-cell ${p.pattern[r][c] ? 'on' : 'off'}`.trim() }));
      }
    }
    root.appendChild(promptText('One fragment is taken straight from the surveillance pattern. Which one?'));
    root.appendChild(camo);
    const existsIn = (grid, frag) => {
      for (let r = 0; r + frag.length <= p.pattern.length; r++) {
        for (let c = 0; c + frag[0].length <= p.pattern[0].length; c++) {
          let ok = true;
          for (let i = 0; i < frag.length && ok; i++) {
            for (let j = 0; j < frag[0].length && ok; j++) if (p.pattern[r + i][c + j] !== frag[i][j]) ok = false;
          }
          if (ok) return true;
        }
      }
      return false;
    };
    void existsIn;
    root.appendChild(choiceList({
      options: p.options.map((o) => ({ ...o, content: viewSVG(o.grid, 46) })),
      columns: 3,
      onChoose: (opt) => (opt.token === p.answerToken ? ctx.solve('Fragment traced.') : ctx.fail('That arrangement never appears in the pattern.'))
    }));
  }
};

// ---------------------------------------------------------------------------
// 10. Cube counting
// ---------------------------------------------------------------------------

export const spatialCubes = {
  id: 'spatial.cubes',
  category: 'spatial',
  name: 'Cube Census',
  par: () => ({ time: 50, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const n = d <= 4 ? 2 : 3;
    const heights = [];
    for (let r = 0; r < n; r++) {
      const row = [];
      for (let c = 0; c < n; c++) row.push(rng.int(1, d <= 4 ? 3 : 5));
      heights.push(row);
    }
    const total = heights.flat().reduce((a, b) => a + b, 0);
    const choices = [];
    const push = (v) => { if (v > 0 && v !== total && !choices.includes(v)) choices.push(v); };
    [total - 1, total + 1, total - n, total + n, total - 2, total + 3].forEach(push);
    let guard = 0;
    while (choices.length < 4 && guard++ < 50) push(total + guard);
    const built = buildChoices({
      correct: total,
      distractors: choices.slice(0, 4),
      rng,
      labelFor: (v) => `${v}`,
      render: (v) => el('span', { class: 'num', text: String(v) })
    });
    return {
      seed: level.seed, heights, total,
      options: built.options.map((o) => ({ value: o.value, token: o.token, label: o.label })),
      answerToken: built.answerToken,
      hint: 'Hidden cubes support the ones above them — count every level of every stack.'
    };
  },
  validate(p) {
    const errs = [];
    const total = p.heights.flat().reduce((a, b) => a + b, 0);
    if (total !== p.total) errs.push('recorded total is wrong');
    if (!p.options.some((o) => o.value === p.total)) errs.push('answer not among options');
    if (new Set(p.options.map((o) => o.value)).size !== p.options.length) errs.push('duplicate options');
    return errs;
  },
  solve(p) {
    const opt = p.options.find((o) => o.value === p.total);
    return opt ? [opt.token] : [];
  },
  mount(root, p, ctx) {
    root.appendChild(el('div', { class: 'rewrite-row' }, isoStacks(p.heights, 240)));
    root.appendChild(promptText('How many cubes are in the structure?'));
    root.appendChild(choiceList({
      options: p.options.map((o) => ({ ...o, content: el('span', { class: 'num', text: String(o.value) }) })),
      columns: p.options.length,
      onChoose: (opt) => (opt.value === p.total ? ctx.solve('Census confirmed.') : ctx.fail('Recount the hidden support cubes.'))
    }));
  }
};

export const SPATIAL_PUZZLES = {
  'spatial.rotate': spatialRotate,
  'spatial.mirror': spatialMirror,
  'spatial.navigate': spatialNavigate,
  'spatial.maze': spatialMaze,
  'spatial.direction': spatialDirection,
  'spatial.fit': spatialFit,
  'spatial.topview': spatialTopView,
  'spatial.transform': spatialTransform,
  'spatial.fragment': spatialFragment,
  'spatial.cubes': spatialCubes
};
