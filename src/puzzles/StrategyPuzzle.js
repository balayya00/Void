/**
 * STRATEGY puzzles — planning several steps ahead under a budget.
 *
 * Every puzzle in this file is generated backwards from a solvable state and
 * verified with a search (BFS / Dijkstra / exhaustive enumeration) inside
 * `validate()`, so "there is no way to win" is impossible by construction.
 */

import { el } from './puzzleApi.js';
import { buildChoices, scaledSize } from './common.js';

import { choiceList, promptText, boardEl } from './kit.js';
import { makeGrid, DIR_VECTORS } from '../utils/grid.js';

const KEYS = { N: 0, E: 1, S: 2, W: 3 };

// ---------------------------------------------------------------------------
// 1. Crate pushing (Sokoban-lite)
// ---------------------------------------------------------------------------

function sokobanMoves(grid, player, crate) {
  const rows = grid.length;
  const cols = grid[0].length;
  const key = (p2, c2) => `${p2.r},${p2.c},${c2.r},${c2.c}`;
  const seen = new Set([key(player, crate)]);
  const queue = [{ player, crate, path: [] }];
  while (queue.length) {
    const node = queue.shift();
    if (node.crate.r === grid.goalR && node.crate.c === grid.goalC) return node.path;
    if (node.path.length > 24) continue;
    for (const [letter, dir] of Object.entries(KEYS)) {
      const d = DIR_VECTORS[dir];
      const np = { r: node.player.r + d.dr, c: node.player.c + d.dc };
      if (np.r < 0 || np.c < 0 || np.r >= rows || np.c >= cols) continue;
      if (grid[np.r][np.c] === 0) continue;
      let ncrate = node.crate;
      if (np.r === node.crate.r && np.c === node.crate.c) {
        const beyond = { r: np.r + d.dr, c: np.c + d.dc };
        if (beyond.r < 0 || beyond.c < 0 || beyond.r >= rows || beyond.c >= cols) continue;
        if (grid[beyond.r][beyond.c] === 0) continue;
        ncrate = beyond;
      }
      const k = key(np, ncrate);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push({ player: np, crate: ncrate, path: [...node.path, letter] });
    }
  }
  return null;
}

export const strategySokoban = {
  id: 'strategy.sokoban',
  category: 'strategy',
  name: 'Cargo Shunt',
  par: (p) => ({ time: 30 + p.minMoves * 6, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const n = scaledSize(d, 4, 5);
    let result = null;
    let guard = 0;
    while (!result && guard++ < 400) {
      const grid = makeGrid(n, n, 0);
      // rooms: carve a connected layout
      const start = { r: rng.int(0, n - 1), c: rng.int(0, n - 1) };
      const carved = new Set([`${start.r},${start.c}`]);
      const frontier = [start];
      const targetCells = Math.max(6, Math.floor(n * n * 0.65));
      while (carved.size < targetCells && frontier.length) {
        const base = frontier[rng.int(0, frontier.length - 1)];
        const dir = rng.pick([[0, 1], [1, 0], [0, -1], [-1, 0]]);
        const nr = base.r + dir[0];
        const nc = base.c + dir[1];
        if (nr < 0 || nc < 0 || nr >= n || nc >= n) continue;
        if (!carved.has(`${nr},${nc}`)) {
          carved.add(`${nr},${nc}`);
          frontier.push({ r: nr, c: nc });
        }
        if (rng.bool(0.3)) frontier.splice(frontier.indexOf(base), 1);
      }
      for (const k of carved) {
        const [r, c] = k.split(',').map(Number);
        grid[r][c] = 1;
      }
      const free = [...carved].map((k) => {
        const [r, c] = k.split(',').map(Number);
        return { r, c };
      });
      if (free.length < 5) continue;
      const goal = rng.pick(free);
      const crate = rng.pick(free.filter((f) => f.r !== goal.r || f.c !== goal.c));
      if (!crate) continue;
      const player = rng.pick(free.filter((f) => (f.r !== goal.r || f.c !== goal.c) && (f.r !== crate.r || f.c !== crate.c)));
      if (!player) continue;
      const board = grid.map((row) => row.slice());
      board.goalR = goal.r;
      board.goalC = goal.c;
      const path = sokobanMoves(board, player, crate);
      if (!path || path.length < 3) continue;
      result = { grid, player, crate, goal, path };
    }
    if (!result) {
      // deterministic fallback: a straight corridor with the crate in the middle
      const grid = makeGrid(3, 5, 1);
      grid.goalR = 1;
      grid.goalC = 4;
      const crate = { r: 1, c: 2 };
      const player = { r: 1, c: 0 };
      result = { grid, player, crate, goal: { r: 1, c: 4 }, path: ['E', 'E', 'E', 'E'] };
    }
    return {
      seed: level.seed,
      n,
      grid: result.grid.map((row) => row.slice()),
      player: result.player,
      crate: result.crate,
      goal: result.goal,
      minMoves: result.path.length,
      solution: result.path.map((letter) => `step:${letter}`),
      hint: 'Never push the crate into a corner — sometimes you must walk around it first.'
    };
  },
  validate(p) {
    const errs = [];
    const board = p.grid.map((row) => row.slice());
    board.goalR = p.goal.r;
    board.goalC = p.goal.c;
    if (p.grid[p.player.r][p.player.c] !== 1) errs.push('player starts inside a wall');
    if (p.grid[p.crate.r][p.crate.c] !== 1) errs.push('crate starts inside a wall');
    if (p.grid[p.goal.r][p.goal.c] !== 1) errs.push('goal is inside a wall');
    if (p.crate.r === p.goal.r && p.crate.c === p.goal.c) errs.push('crate already on the goal');
    const path = sokobanMoves(board, p.player, p.crate);
    if (!path) errs.push('no solution exists for this layout');
    else if (!p.solution || p.solution.length !== path.length) errs.push('recorded solution length differs from the search result');
    return errs;
  },
  solve: (p) => p.solution.slice(),
  mount(root, p, ctx) {
    let player = { ...p.player };
    let crate = { ...p.crate };
    let moves = 0;
    const status = el('div', { class: 'status-line', attrs: { role: 'status' }, text: 'Moves: 0' });
    const board = boardEl(p.n, p.n, { cellSize: 44, ariaLabel: 'Cargo bay', role: 'grid' });
    const nodes = new Map();
    for (let r = 0; r < p.n; r++) {
      for (let c = 0; c < p.n; c++) {
        const node = el('div', {
          class: `board-cell static ${p.grid[r][c] ? 'floor' : 'wall'}`,
          style: { gridArea: `${r + 1} / ${c + 1}` },
          attrs: { 'aria-label': p.grid[r][c] ? 'floor' : 'bulkhead' }
        });
        nodes.set(`${r},${c}`, node);
        board.appendChild(node);
      }
    }
    const crateNode = el('div', { class: 'crate', text: '▣', attrs: { 'aria-hidden': 'true' } });
    const playerNode = el('div', { class: 'rover', text: '◇', attrs: { 'aria-hidden': 'true' } });
    board.appendChild(crateNode);
    board.appendChild(playerNode);
    const update = () => {
      crateNode.style.gridArea = `${crate.r + 1} / ${crate.c + 1}`;
      playerNode.style.gridArea = `${player.r + 1} / ${player.c + 1}`;
      const goalNode = nodes.get(`${p.goal.r},${p.goal.c}`);
      if (goalNode) goalNode.classList.toggle('goal-satisfied', crate.r === p.goal.r && crate.c === p.goal.c);
    };
    const goalNode = nodes.get(`${p.goal.r},${p.goal.c}`);
    if (goalNode) goalNode.classList.add('goal-cell');
    update();
    const push = (letter) => {
      const d = DIR_VECTORS[KEYS[letter]];
      const np = { r: player.r + d.dr, c: player.c + d.dc };
      if (np.r < 0 || np.c < 0 || np.r >= p.n || np.c >= p.n || p.grid[np.r][np.c] === 0) return;
      if (np.r === crate.r && np.c === crate.c) {
        const beyond = { r: np.r + d.dr, c: np.c + d.dc };
        if (beyond.r < 0 || beyond.c < 0 || beyond.r >= p.n || beyond.c >= p.n || p.grid[beyond.r][beyond.c] === 0) return;
        crate = beyond;
      }
      player = np;
      moves++;
      ctx.audio.ui();
      update();
      status.textContent = `Moves: ${moves}`;
      if (crate.r === p.goal.r && crate.c === p.goal.c) ctx.solve('Cargo secured.');
    };
    const pad = el('div', { class: 'dpad', attrs: { role: 'group', 'aria-label': 'Push controls' } });
    [['N', '▲', 1, 2], ['W', '◀', 2, 1], ['E', '▶', 2, 3], ['S', '▼', 3, 2]].forEach(([letter, label, row, col]) => {
      const btn = el('button', {
        type: 'button', class: 'dpad-btn', text: label, dataset: { token: `step:${letter}` },
        attrs: { 'aria-label': `Move ${letter}`, style: `grid-area:${row}/${col}` }
      });
      btn.addEventListener('click', () => push(letter));
      pad.appendChild(btn);
    });
    root.appendChild(promptText('Push the cargo container onto the marked plate.'));
    root.appendChild(board);
    root.appendChild(pad);
    root.appendChild(status);
  }
};

// ---------------------------------------------------------------------------
// 2. Patrol evasion
// ---------------------------------------------------------------------------

const PATROLS = [
  [{ r: 1, c: 1 }, { r: 1, c: 2 }, { r: 1, c: 3 }],
  [{ r: 3, c: 1 }, { r: 3, c: 2 }, { r: 3, c: 3 }, { r: 3, c: 4 }],
  [{ r: 2, c: 4 }, { r: 2, c: 5 }]
];

function patrolStateAt(patrols, turn) {
  return patrols.map((cycle) => cycle[turn % cycle.length]);
}

function evasionPath(grid, start, goal, patrols, maxTurns) {
  const key = (pos, turn) => `${pos.r},${pos.c},${turn}`;
  const seen = new Set([key(start, 0)]);
  const queue = [{ pos: start, turn: 0, path: [] }];
  const rows = grid.length;
  const cols = grid[0].length;
  while (queue.length) {
    const node = queue.shift();
    if (node.pos.r === goal.r && node.pos.c === goal.c) return node.path;
    if (node.turn >= maxTurns) continue;
    const guards = patrolStateAt(patrols, node.turn + 1);
    for (const [letter, dir] of Object.entries(KEYS)) {
      const d = DIR_VECTORS[dir];
      const np = { r: node.pos.r + d.dr, c: node.pos.c + d.dc };
      if (np.r < 0 || np.c < 0 || np.r >= rows || np.c >= cols) continue;
      if (grid[np.r][np.c] === 0) continue;
      if (guards.some((g) => g.r === np.r && g.c === np.c)) continue;
      if (guards.some((g) => g.r === node.pos.r && g.c === node.pos.c) && np.r === node.pos.r && np.c === node.pos.c) continue;
      const k = key(np, node.turn + 1);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push({ pos: np, turn: node.turn + 1, path: [...node.path, letter] });
    }
  }
  return null;
}

export const strategyEnemy = {
  id: 'strategy.enemy',
  category: 'strategy',
  name: 'Patrol Window',
  par: (p) => ({ time: 35 + p.minMoves * 5, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const n = d <= 5 ? 4 : 5;
    const grid = makeGrid(n, n, 1);
    // a few bulkheads for texture, never blocking the border ring
    for (let i = 0; i < Math.floor(n * n * 0.12); i++) {
      const r = rng.int(1, n - 2);
      const c = rng.int(1, n - 2);
      grid[r][c] = 0;
    }
    const rings = [
      [{ r: 0, c: 1 }, { r: 0, c: 2 }, { r: 0, c: 3 }],
      [{ r: n - 1, c: 1 }, { r: n - 1, c: 2 }, { r: n - 1, c: 3 }, { r: n - 1, c: 2 }],
      [{ r: 2, c: 0 }, { r: 2, c: 1 }]
    ].slice(0, d <= 4 ? 2 : 3);
    const patrols = rings.map((cycle) => cycle.filter((cell) => grid[cell.r] && grid[cell.r][cell.c] === 1)
      .filter((cell) => cell.r >= 0 && cell.c >= 0 && cell.r < n && cell.c < n));
    for (const cycle of patrols) for (const cell of cycle) grid[cell.r][cell.c] = 1;
    const start = { r: n - 1, c: 0 };
    const goal = { r: 0, c: n - 1 };
    grid[start.r][start.c] = 1;
    grid[goal.r][goal.c] = 1;
    let path = evasionPath(grid, start, goal, patrols, 24);
    let guard = 0;
    while (!path && guard++ < 60) {
      for (const cycle of patrols) cycle.reverse();
      path = evasionPath(grid, start, goal, patrols, 24);
    }
    return {
      seed: level.seed, n, grid, start, goal, patrols,
      minMoves: path ? path.length : 0,
      solution: (path || []).map((letter) => `step:${letter}`),
      hint: 'Guards only see the cell they stand on — count the beat and slip through the gap.'
    };
  },
  validate(p) {
    const errs = [];
    if (!p.patrols.length) errs.push('no patrols');
    for (const cycle of p.patrols) {
      if (!cycle.length) errs.push('empty patrol cycle');
      for (const cell of cycle) {
        if (cell.r < 0 || cell.c < 0 || cell.r >= p.n || cell.c >= p.n) errs.push('patrol leaves the deck');
        else if (p.grid[cell.r][cell.c] !== 1) errs.push('patrol stands inside a wall');
      }
    }
    if (p.grid[p.start.r][p.start.c] !== 1 || p.grid[p.goal.r][p.goal.c] !== 1) errs.push('start or exit is walled');
    const path = evasionPath(p.grid, p.start, p.goal, p.patrols, 24);
    if (!path) errs.push('no evasion route exists');
    else if (p.solution.length !== path.length) errs.push('recorded solution differs from the search result');
    return errs;
  },
  solve: (p) => p.solution.slice(),
  mount(root, p, ctx) {
    let turn = 0;
    let pos = { ...p.start };
    let alive = true;
    const status = el('div', { class: 'status-line', attrs: { role: 'status' }, text: 'Turn 0' });
    const board = boardEl(p.n, p.n, { cellSize: 46, ariaLabel: 'Patrolled deck', role: 'grid' });
    const nodes = new Map();
    for (let r = 0; r < p.n; r++) {
      for (let c = 0; c < p.n; c++) {
        const node = el('div', {
          class: `board-cell static ${p.grid[r][c] ? 'floor' : 'wall'}`,
          style: { gridArea: `${r + 1} / ${c + 1}` }
        });
        nodes.set(`${r},${c}`, node);
        board.appendChild(node);
      }
    }
    const goalNode = nodes.get(`${p.goal.r},${p.goal.c}`);
    if (goalNode) { goalNode.classList.add('goal-cell'); goalNode.appendChild(el('span', { class: 'goal-mark', text: '◆' })); }
    const guardNodes = p.patrols.map(() => {
      const node = el('div', { class: 'guard', text: '✕', attrs: { 'aria-hidden': 'true' } });
      board.appendChild(node);
      return node;
    });
    const playerNode = el('div', { class: 'rover', text: '◇', attrs: { 'aria-hidden': 'true' } });
    board.appendChild(playerNode);
    const render = () => {
      const guards = patrolStateAt(p.patrols, turn);
      guards.forEach((g, i) => { guardNodes[i].style.gridArea = `${g.r + 1} / ${g.c + 1}`; });
      playerNode.style.gridArea = `${pos.r + 1} / ${pos.c + 1}`;
      status.textContent = `Turn ${turn}`;
      const standing = guards.some((g) => g.r === pos.r && g.c === pos.c);
      if (standing && alive) {
        alive = false;
        ctx.fail('A patrol caught you in the open.');
      }
    };
    render();
    const step = (letter) => {
      if (!alive) return;
      const d = DIR_VECTORS[KEYS[letter]];
      const np = { r: pos.r + d.dr, c: pos.c + d.dc };
      if (np.r < 0 || np.c < 0 || np.r >= p.n || np.c >= p.n || p.grid[np.r][np.c] === 0) return;
      turn++;
      const guards = patrolStateAt(p.patrols, turn);
      if (guards.some((g) => g.r === np.r && g.c === np.c)) {
        ctx.fail('You stepped straight into a patrol.');
        return;
      }
      pos = np;
      ctx.audio.ui();
      render();
      if (pos.r === p.goal.r && pos.c === p.goal.c) {
        alive = false;
        ctx.solve('Evacuated undetected.');
      }
    };
    const pad = el('div', { class: 'dpad', attrs: { role: 'group', 'aria-label': 'Movement controls' } });
    [['N', '▲', 1, 2], ['W', '◀', 2, 1], ['E', '▶', 2, 3], ['S', '▼', 3, 2]].forEach(([letter, label, row, col]) => {
      const btn = el('button', {
        type: 'button', class: 'dpad-btn', text: label, dataset: { token: `step:${letter}` },
        attrs: { 'aria-label': `Step ${letter}`, style: `grid-area:${row}/${col}` }
      });
      btn.addEventListener('click', () => step(letter));
      pad.appendChild(btn);
    });
    root.appendChild(promptText('Reach the exit (◆) without ever sharing a cell with a patrol (✕). Each move advances the patrol beat.'));
    root.appendChild(board);
    root.appendChild(pad);
    root.appendChild(status);
  }
};

// ---------------------------------------------------------------------------
// 3. Relay network (graph toggles)
// ---------------------------------------------------------------------------

function applyPressNetwork(state, links) {
  for (const idx of links) state[idx] = state[idx] ? 0 : 1;
}

function solveNetwork(nodeCount, links, target) {
  const limit = 1 << nodeCount;
  if (nodeCount > 14) return null;
  for (let mask = 0; mask < limit; mask++) {
    const state = new Array(nodeCount).fill(0);
    const presses = [];
    for (let i = 0; i < nodeCount; i++) {
      if (mask & (1 << i)) {
        applyPressNetwork(state, links[i]);
        presses.push(i);
      }
    }
    if (state.every((v, i) => v === target[i])) return presses;
  }
  return null;
}

export const strategyNetwork = {
  id: 'strategy.network',
  category: 'strategy',
  name: 'Relay Network',
  par: (p) => ({ time: 40 + p.minPresses * 10, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const nodeCount = d <= 3 ? 5 : d <= 6 ? 7 : 9;
    const links = [];
    for (let i = 0; i < nodeCount; i++) {
      const set = new Set([i]);
      const partners = rng.int(1, 2);
      for (let k = 0; k < partners; k++) {
        set.add(rng.int(0, nodeCount - 1));
      }
      links.push([...set].sort((a, b) => a - b));
    }
    const target = new Array(nodeCount).fill(0);
    const seedPresses = [];
    const pressCount = Math.max(2, Math.min(nodeCount, 2 + Math.floor(d * 0.5)));
    let guard = 0;
    while (seedPresses.length < pressCount && guard++ < 100) {
      const n2 = rng.int(0, nodeCount - 1);
      if (seedPresses.includes(n2)) continue;
      seedPresses.push(n2);
      applyPressNetwork(target, links[n2]);
    }
    if (target.every((v) => v === 0)) {
      applyPressNetwork(target, links[0]);
      seedPresses.push(0);
    }
    const minimal = solveNetwork(nodeCount, links, target);
    const budget = (minimal ? minimal.length : seedPresses.length) + 2;
    return {
      seed: level.seed, nodeCount, links, target, budget,
      solution: (minimal || seedPresses).map((i) => `node:${i}`),
      minPresses: minimal ? minimal.length : seedPresses.length,
      hint: 'A node also flips its linked partners — work backwards from the target.'
    };
  },
  validate(p) {
    const errs = [];
    if (p.target.length !== p.nodeCount) errs.push('target size mismatch');
    if (p.links.length !== p.nodeCount) errs.push('link table size mismatch');
    const solution = solveNetwork(p.nodeCount, p.links, p.target);
    if (!solution) errs.push('target configuration is unreachable');
    else {
      if (solution.length > p.budget) errs.push('press budget is smaller than a known solution');
      const state = new Array(p.nodeCount).fill(0);
      for (const idx of solution) applyPressNetwork(state, p.links[idx]);
      if (!state.every((v, i) => v === p.target[i])) errs.push('solver output does not reach the target');
    }
    if (p.target.every((v) => v === 0)) errs.push('target equals the starting state');
    return errs;
  },
  solve: (p) => p.solution.slice(),
  mount(root, p, ctx) {
    const state = new Array(p.nodeCount).fill(0);
    let presses = 0;
    const status = el('div', { class: 'status-line', attrs: { role: 'status' }, text: `Presses left: ${p.budget}` });
    const wrap = el('div', { class: 'network', attrs: { role: 'group', 'aria-label': 'Relay network' } });
    const goal = el('div', { class: 'network-target' },
      el('div', { class: 'panel-label', text: 'TARGET STATE' }),
      el('div', { class: 'node-row' }, p.target.map((v) => el('span', { class: `node-dot ${v ? 'on' : 'off'}` })))
    );
    const nodes = [];
    p.links.forEach((links, i) => {
      const btn = el('button', {
        type: 'button', class: `network-node ${links.length > 1 ? 'linked' : ''}`.trim(),
        dataset: { token: `node:${i}` },
        attrs: { 'aria-label': `Relay ${i + 1}, links to ${links.map((x) => x + 1).join(' and ')}` }
      }, el('span', { class: 'node-body' }), el('span', { class: 'node-links', text: links.map((x) => x + 1).join('·') }));
      btn.addEventListener('click', () => {
        applyPressNetwork(state, links);
        presses++;
        ctx.audio.ui();
        nodes.forEach((n, idx) => n.classList.toggle('on', !!state[idx]));
        status.textContent = `Presses left: ${p.budget - presses}`;
        if (state.every((v, idx) => v === p.target[idx])) ctx.solve('Network stabilised.');
        else if (presses >= p.budget) ctx.fail('Power budget exhausted.');
      });
      nodes.push(btn);
      wrap.appendChild(btn);
    });
    root.appendChild(goal);
    root.appendChild(promptText(`Match the target state within ${p.budget} presses.`));
    root.appendChild(wrap);
    root.appendChild(status);
  }
};

// ---------------------------------------------------------------------------
// 4. Resource allocation
// ---------------------------------------------------------------------------

/** Structured allocation constraints: { kind, text, ...args } */
export const ALLOC_CONSTRAINTS = {
  total: { text: (v) => `Total output must be exactly ${v} units.`, test: (values, v) => values.reduce((a, b) => a + b, 0) === v },
  atLeast: { text: (name, v) => `${name} needs at least ${v} units.`, test: (values, v, i) => values[i] >= v },
  atMost: { text: (name, v) => `${name} must stay at or below ${v} units.`, test: (values, v, i) => values[i] <= v },
  outrank: { text: (a, b) => `${a} must outrank ${b}.`, test: (values, v, i, j) => values[i] > values[j] }
};

function allocationSatisfies(values, constraints) {
  return constraints.every((c) => {
    const def = ALLOC_CONSTRAINTS[c.kind];
    if (!def) return true;
    return def.test(values, ...c.args);
  });
}

export const strategyAlloc = {
  id: 'strategy.alloc',
  category: 'strategy',
  name: 'Power Budget',
  par: () => ({ time: 80, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const systems = ['LIFE SUPPORT', 'ENGINES', 'SHIELDS', 'SENSORS'];
    const count = d <= 4 ? 3 : 4;
    const max = d <= 4 ? 6 : 8;
    const chosen = systems.slice(0, count);
    let solution = null;
    let guard = 0;
    while (!solution && guard++ < 200) {
      const candidate = chosen.map(() => rng.int(1, max));
      const total = candidate.reduce((a, b) => a + b, 0);
      if (total >= count + 2 && total <= count * max - 2) solution = candidate;
    }
    if (!solution) solution = chosen.map(() => Math.floor(max / 2));
    const total = solution.reduce((a, b) => a + b, 0);
    const constraints = [{ kind: 'total', args: [total], text: ALLOC_CONSTRAINTS.total.text(total) }];
    chosen.forEach((name, i) => {
      if (rng.bool(0.5)) {
        constraints.push({ kind: 'atLeast', args: [solution[i], i], text: ALLOC_CONSTRAINTS.atLeast.text(name, solution[i]) });
      } else {
        constraints.push({ kind: 'atMost', args: [solution[i], i], text: ALLOC_CONSTRAINTS.atMost.text(name, solution[i]) });
      }
    });
    for (let i = 0; i + 1 < count; i++) {
      if (rng.bool(0.35) && solution[i] !== solution[i + 1]) {
        const higher = solution[i] > solution[i + 1] ? i : i + 1;
        const lower = higher === i ? i + 1 : i;
        constraints.push({
          kind: 'outrank',
          args: [0, higher, lower],
          text: ALLOC_CONSTRAINTS.outrank.text(chosen[higher], chosen[lower])
        });
      }
    }
    return {
      seed: level.seed, systems: chosen, max,
      constraints: constraints.map((c) => ({ kind: c.kind, args: c.args, text: c.text })),
      solution,
      hint: 'Start every system at its lowest permitted value, then spend the remaining units.'
    };
  },
  validate(p) {
    const errs = [];
    if (!p.solution || p.solution.length !== p.systems.length) errs.push('solution size mismatch');
    if (p.solution.some((v) => v < 0 || v > p.max)) errs.push('solution outside the permitted range');
    if (p.constraints.some((c) => !ALLOC_CONSTRAINTS[c.kind])) errs.push('unknown constraint kind');
    if (p.constraints.some((c) => !c.text)) errs.push('constraint without text');
    if (!p.constraints.some((c) => c.kind === 'total')) errs.push('no total constraint — the budget is unbounded');
    const found = [];
    const rec = (prefix) => {
      if (prefix.length === p.systems.length) {
        if (allocationSatisfies(prefix, p.constraints)) found.push(prefix.slice());
        return;
      }
      for (let v = 0; v <= p.max; v++) rec([...prefix, v]);
    };
    if (p.systems.length <= 4 && p.max <= 8) rec([]);
    if (!found.length) errs.push('no allocation satisfies the constraints');
    if (!allocationSatisfies(p.solution, p.constraints)) errs.push('the stored solution violates a constraint');
    return errs;
  },
  solve(p) {
    const steps = [];
    for (let i = 0; i < p.systems.length; i++) {
      for (let v = 0; v < p.solution[i]; v++) steps.push(`inc:${i}`);
    }
    steps.push({ click: 'alloc:confirm' });
    return steps;
  },
  mount(root, p, ctx) {
    const values = p.systems.map(() => 0);
    const status = el('div', { class: 'status-line', attrs: { role: 'status' }, text: 'Adjust each system, then commit.' });
    const rows = el('div', { class: 'alloc-table' });
    const render = () => {
      rows.textContent = '';
      p.systems.forEach((name, i) => {
        rows.appendChild(el('div', { class: 'alloc-row' },
          el('span', { class: 'alloc-name', text: name }),
          el('button', {
            type: 'button', class: 'btn btn-small', text: '−', dataset: { token: `dec:${i}` },
            attrs: { 'aria-label': `Decrease ${name}` },
            onclick: () => { values[i] = Math.max(0, values[i] - 1); ctx.audio.ui(); render(); }
          }),
          el('span', { class: 'alloc-value', text: String(values[i]), attrs: { 'aria-live': 'polite' } }),
          el('button', {
            type: 'button', class: 'btn btn-small', text: '+', dataset: { token: `inc:${i}` },
            attrs: { 'aria-label': `Increase ${name}` },
            onclick: () => { values[i] = Math.min(p.max, values[i] + 1); ctx.audio.ui(); render(); }
          })
        ));
      });
    };
    render();
    const list = el('ul', { class: 'clue-list', attrs: { 'aria-label': 'Constraints' } });
    p.constraints.forEach((c) => list.appendChild(el('li', { class: 'clue', text: c.text })));
    const confirm = el('button', {
      type: 'button', class: 'btn btn-primary', text: 'COMMIT ALLOCATION', dataset: { token: 'alloc:confirm' }
    });
    confirm.addEventListener('click', () => {
      if (allocationSatisfies(values, p.constraints)) ctx.solve('Allocation accepted.');
      else {
        const failed = p.constraints.filter((c) => !allocationSatisfies(values, [c])).length;
        ctx.fail(`${failed} constraint(s) violated.`);
      }
    });
    root.appendChild(list);
    root.appendChild(rows);
    root.appendChild(el('div', { class: 'btn-row' }, confirm));
    root.appendChild(status);
  }
};

// ---------------------------------------------------------------------------
// 5. Tower of Hanoi
// ---------------------------------------------------------------------------

export const strategyHanoi = {
  id: 'strategy.hanoi',
  category: 'strategy',
  name: 'Disk Transfer',
  par: (p) => ({ time: 30 + p.optimal * 8, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const disks = d <= 3 ? 3 : d <= 6 ? 4 : 5;
    const optimal = 2 ** disks - 1;
    const solution = [];
    const move = (n2, from, to, via) => {
      if (n2 === 0) return;
      move(n2 - 1, from, via, to);
      solution.push(`move:${from}>${to}`);
      move(n2 - 1, via, to, from);
    };
    move(disks, 0, 2, 1);
    const moves = solution.map((token) => token.replace('move:', '').split('>').map(Number));
    return {
      seed: level.seed, disks, optimal, budget: optimal + Math.max(2, disks),
      moves,
      hint: 'Move the smallest disk on every odd turn and never place a larger disk on a smaller one.'
    };
  },
  validate(p) {
    const errs = [];
    if (p.disks < 3 || p.disks > 6) errs.push('disk count out of range');
    if (p.moves.length !== 2 ** p.disks - 1) errs.push('move list is not the optimal solution length');
    const result = simulatePegTaps(p.disks, p.moves);
    if (result.error) errs.push(result.error);
    if (!result.solved) errs.push('tapping the listed pegs does not finish the tower');
    if (p.moves.length > p.budget) errs.push('move budget is smaller than the optimal solution');
    return errs;
  },
  solve: (p) => [].concat(...p.moves.map(([from, to]) => [`peg:${from}`, `peg:${to}`])),
  mount(root, p, ctx) {
    const pegs = [
      Array.from({ length: p.disks }, (_, i) => p.disks - i),
      [],
      []
    ];
    let selected = null;
    let moves = 0;
    const status = el('div', { class: 'status-line', attrs: { role: 'status' }, text: `Moves: 0 / ${p.budget}` });
    const wrap = el('div', { class: 'hanoi', attrs: { role: 'group', 'aria-label': 'Tower of Hanoi pegs' } });
    const render = () => {
      wrap.textContent = '';
      pegs.forEach((peg, i) => {
        const column = el('div', { class: 'peg-column' });
        const button = el('button', {
          type: 'button', class: `peg ${selected === i ? 'selected' : ''}`.trim(),
          dataset: { token: `peg:${i}` },
          attrs: { 'aria-label': `Peg ${i + 1} holds ${peg.length} disk${peg.length === 1 ? '' : 's'}`, 'aria-pressed': String(selected === i) }
        },
          el('span', { class: 'peg-rod' }),
          el('span', { class: 'disk-stack' }, peg.slice().reverse().map((size) => el('span', {
            class: 'disk', style: { width: `${24 + size * 12}%` }, text: String(size)
          })))
        );
        button.addEventListener('click', () => onPeg(i));
        column.appendChild(button);
        wrap.appendChild(column);
      });
    };
    const onPeg = (i) => {
      if (selected === null) {
        if (!pegs[i].length) { status.textContent = 'That peg is empty.'; return; }
        selected = i;
        render();
        return;
      }
      if (selected === i) { selected = null; render(); return; }
      const disk = pegs[selected][pegs[selected].length - 1];
      const top = pegs[i][pegs[i].length - 1];
      if (top !== undefined && top < disk) {
        ctx.fail('A larger disk cannot rest on a smaller one.');
        selected = null;
        render();
        return;
      }
      pegs[i].push(pegs[selected].pop());
      selected = null;
      moves++;
      ctx.audio.ui();
      render();
      status.textContent = `Moves: ${moves} / ${p.budget}`;
      if (pegs[2].length === p.disks) ctx.solve('Transfer complete.');
      else if (moves > p.budget) ctx.fail('Move budget exceeded.');
    };
    render();
    root.appendChild(promptText(`Move all ${p.disks} disks to the right-hand peg. Larger disks never sit on smaller ones.`));
    root.appendChild(wrap);
    root.appendChild(status);
  }
};

function simulatePegTaps(disks, moves) {
  const pegs = [Array.from({ length: disks }, (_, i) => disks - i), [], []];
  for (const [from, to] of moves) {
    if (!pegs[from] || !pegs[to]) return { error: 'move references a missing peg' };
    const disk = pegs[from].pop();
    if (disk === undefined) return { error: 'move lifts from an empty peg' };
    const top = pegs[to][pegs[to].length - 1];
    if (top !== undefined && top < disk) return { error: 'move places a larger disk on a smaller one' };
    pegs[to].push(disk);
  }
  return { solved: pegs[2].length === disks, pegs };
}

// ---------------------------------------------------------------------------
// 6. Subtraction game against a perfect opponent
// ---------------------------------------------------------------------------

export const strategyNim = {
  id: 'strategy.nim',
  category: 'strategy',
  name: 'Drawing Down',
  par: () => ({ time: 70, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const take = 3;
    let total = 3;
    let guard = 0;
    do {
      total = rng.int(12, 16 + d * 2);
      guard++;
    } while (total % (take + 1) === 0 && guard < 100);
    // win(remaining, toMove) — does the *player* win with perfect play?
    //   toMove = true  → the player must find one winning continuation
    //   toMove = false → the opponent moves; every reply must still lose for them
    const win = (remaining, toMove) => {
      if (remaining <= 0) return !toMove; // whoever moved last took the final core
      if (toMove) {
        for (let k = 1; k <= take && k <= remaining; k++) if (win(remaining - k, false)) return true;
        return false;
      }
      for (let k = 1; k <= take && k <= remaining; k++) if (!win(remaining - k, true)) return false;
      return true;
    };
    const winningMoves = [];
    for (let k = 1; k <= take && k <= total; k++) {
      if (win(total - k, false)) winningMoves.push(k);
    }
    let fixGuard = 0;
    while (!winningMoves.length && fixGuard++ < 8) {
      total += 1;
      winningMoves.length = 0;
      for (let k = 1; k <= take && k <= total; k++) if (win(total - k, false)) winningMoves.push(k);
    }
    return {
      seed: level.seed, total, take, winningMoves,
      hint: `Leave your opponent a multiple of ${take + 1}.`
    };
  },
  validate(p) {
    const errs = [];
    if (p.total < 6) errs.push('heap too small to be interesting');
    if (!p.take || p.take < 1) errs.push('invalid take limit');
    if (p.total % (p.take + 1) === 0) errs.push('the first player has no winning strategy — unwinnable');
    if (!p.winningMoves.length) errs.push('no winning opening move recorded');
    for (const k of p.winningMoves) {
      const remaining = p.total - k;
      if (remaining % (p.take + 1) !== 0) errs.push(`taking ${k} does not leave a losing position`);
      if (k < 1 || k > p.take) errs.push('winning move is outside the take limit');
    }
    return errs;
  },
  solve(p) {
    const steps = [];
    let remaining = p.total;
    let playerTurn = true;
    while (remaining > 0) {
      if (playerTurn) {
        const move = [];
        for (let k = 1; k <= p.take && k <= remaining; k++) if ((remaining - k) % (p.take + 1) === 0) move.push(k);
        const take = move.length ? move[0] : 1;
        steps.push(`take:${take}`);
        remaining -= take;
        playerTurn = false;
      } else {
        let aiMove = 1;
        for (let k = 1; k <= p.take && k <= remaining; k++) if ((remaining - k) % (p.take + 1) === 0) aiMove = k;
        remaining -= aiMove;
        playerTurn = true;
      }
      if (remaining <= 0) break;
    }
    return steps;
  },
  mount(root, p, ctx) {
    let remaining = p.total;
    let lock = false;
    const status = el('div', { class: 'status-line', attrs: { role: 'status' }, text: 'Your turn — take 1 to 3 cores.' });
    const heap = el('div', { class: 'heap', attrs: { role: 'img', 'aria-label': `${remaining} cores remaining` } });
    const renderHeap = () => {
      heap.textContent = '';
      heap.setAttribute('aria-label', `${remaining} cores remaining`);
      for (let i = 0; i < remaining; i++) heap.appendChild(el('span', { class: 'heap-token' }));
    };
    const takeButtons = [];
    const takeRow = el('div', { class: 'btn-row' });
    for (let k = 1; k <= p.take; k++) {
      const btn = el('button', {
        type: 'button', class: 'btn btn-accent', text: `TAKE ${k}`, dataset: { token: `take:${k}` },
        attrs: { 'aria-label': `Take ${k} core${k > 1 ? 's' : ''}` }
      });
      btn.addEventListener('click', () => {
        if (lock || k > remaining) return;
        remaining -= k;
        renderHeap();
        if (remaining === 0) { lock = true; ctx.solve('You took the final core.'); return; }
        lock = true;
        status.textContent = 'The station responds…';
        setTimeout(() => {
          let aiMove = 1;
          for (let m = 1; m <= p.take && m <= remaining; m++) if ((remaining - m) % (p.take + 1) === 0) aiMove = m;
          remaining -= aiMove;
          renderHeap();
          lock = false;
          if (remaining === 0) {
            ctx.fail('The station took the final core. It played perfectly.');
            status.textContent = 'Defeat — tap TAKE 1 to restart the round.';
            return;
          }
          status.textContent = `The station takes ${aiMove}. Your turn — ${remaining} cores remain.`;
        }, ctx.testMode ? 0 : 520);
      });
      takeButtons.push(btn);
      takeRow.appendChild(btn);
    }
    renderHeap();
    root.appendChild(promptText('Take cores in turns with the station. Whoever takes the LAST core wins. You move first — the station plays perfectly.'));
    root.appendChild(status);
    root.appendChild(heap);
    root.appendChild(takeRow);
  }
};

// ---------------------------------------------------------------------------
// 7. Budget optimisation with a unique optimum
// ---------------------------------------------------------------------------

export const strategyBudget = {
  id: 'strategy.budget',
  category: 'strategy',
  name: 'Salvage Manifest',
  par: () => ({ time: 80, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const itemCount = d <= 4 ? 4 : d <= 7 ? 5 : 6;
    const items = [];
    const names = ['COOLANT', 'ALLOY', 'CELLS', 'LENS', 'DRIVE', 'SENSOR', 'REAGENT', 'CABLE'];
    const chosenNames = rng.sample(names, itemCount);
    chosenNames.forEach((name, i) => {
      items.push({ name, id: i, cost: rng.int(2, 5 + Math.floor(d / 2)), value: rng.int(3, 9) });
    });
    const budget = Math.max(6, Math.floor(items.reduce((a, b) => a + b.cost, 0) * 0.55));
    // exhaustive search for all optimal subsets
    const subsets = [];
    for (let mask = 1; mask < (1 << items.length); mask++) {
      const chosen = items.filter((_, i) => mask & (1 << i));
      const cost = chosen.reduce((a, b) => a + b.cost, 0);
      if (cost > budget) continue;
      subsets.push({ mask, cost, value: chosen.reduce((a, b) => a + b.value, 0) });
    }
    const best = subsets.reduce((acc, s2) => (s2.value > acc.value ? s2 : acc), { value: -1 });
    const optima = subsets.filter((s2) => s2.value === best.value);
    return {
      seed: level.seed, items, budget,
      bestValue: best.value,
      optimalCount: optima.length,
      solution: items.map((_, i) => (best.mask & (1 << i) ? `item:${i}` : null)).filter(Boolean),
      hint: 'Rank the items by value per unit of cost first.'
    };
  },
  validate(p) {
    const errs = [];
    if (!p.items || p.items.length < 3) errs.push('too few salvage items');
    if (p.items.some((i) => i.cost <= 0 || i.value <= 0)) errs.push('items must have positive cost and value');
    const subsets = [];
    for (let mask = 1; mask < (1 << p.items.length); mask++) {
      const chosen = p.items.filter((_, i) => mask & (1 << i));
      const cost = chosen.reduce((a, b) => a + b.cost, 0);
      if (cost > p.budget) continue;
      subsets.push({ mask, cost, value: chosen.reduce((a, b) => a + b.value, 0) });
    }
    if (!subsets.length) errs.push('no subset fits the budget');
    const best = subsets.reduce((acc, s2) => (s2.value > acc.value ? s2 : acc), { value: -1 });
    if (best.value !== p.bestValue) errs.push('recorded optimum is wrong');
    const chosen = p.items.filter((_, i) => p.solution.some((tok) => tok === `item:${i}`));
    const cost = chosen.reduce((a, b) => a + b.cost, 0);
    if (cost > p.budget) errs.push('listed solution exceeds the budget');
    if (chosen.reduce((a, b) => a + b.value, 0) !== p.bestValue) errs.push('listed solution is not optimal');
    return errs;
  },
  solve: (p) => [...p.solution, { click: 'salvage:confirm' }],
  mount(root, p, ctx) {
    const selected = new Set();
    const status = el('div', { class: 'status-line', attrs: { role: 'status' }, text: 'Select salvage, then confirm.' });
    const list = el('div', { class: 'choices wide', style: { '--choice-cols': 3 }, attrs: { role: 'group', 'aria-label': 'Salvage items' } });
    const update = () => {
      const cost = p.items.filter((i) => selected.has(i.id)).reduce((a, b) => a + b.cost, 0);
      const value = p.items.filter((i) => selected.has(i.id)).reduce((a, b) => a + b.value, 0);
      status.textContent = `Cost ${cost}/${p.budget} · Value ${value}`;
    };
    p.items.forEach((item) => {
      const btn = el('button', {
        type: 'button', class: 'choice tile', dataset: { token: `item:${item.id}` },
        attrs: { 'aria-label': `${item.name}: cost ${item.cost}, value ${item.value}`, 'aria-pressed': 'false' }
      }, el('span', { class: 'item-name', text: item.name }),
        el('span', { class: 'item-stats', text: `cost ${item.cost} · value ${item.value}` }));
      btn.addEventListener('click', () => {
        if (selected.has(item.id)) selected.delete(item.id);
        else selected.add(item.id);
        btn.classList.toggle('selected', selected.has(item.id));
        btn.setAttribute('aria-pressed', String(selected.has(item.id)));
        update();
      });
      list.appendChild(btn);
    });
    const confirm = el('button', { type: 'button', class: 'btn btn-primary', text: 'CONFIRM SALVAGE', dataset: { token: 'salvage:confirm' } });
    confirm.addEventListener('click', () => {
      const chosen = p.items.filter((i) => selected.has(i.id));
      const cost = chosen.reduce((a, b) => a + b.cost, 0);
      const value = chosen.reduce((a, b) => a + b.value, 0);
      if (cost > p.budget) ctx.fail('That manifest exceeds the budget.');
      else if (value < p.bestValue) ctx.fail(`That yields ${value} — ${p.bestValue - value} short of the best known haul.`);
      else ctx.solve('Optimal manifest filed.');
    });
    update();
    root.appendChild(el('div', { class: 'scan-target' },
      el('span', { class: 'scan-target-label', text: 'BUDGET' }), el('span', { class: 'num', text: String(p.budget) })));
    root.appendChild(list);
    root.appendChild(el('div', { class: 'btn-row' }, confirm));
    root.appendChild(status);
  }
};

// ---------------------------------------------------------------------------
// 8. Cheapest route (cost grid)
// ---------------------------------------------------------------------------

function dijkstra(grid, start, goal) {
  const rows = grid.length;
  const cols = grid[0].length;
  const dist = makeGrid(rows, cols, Infinity);
  dist[start.r][start.c] = grid[start.r][start.c];
  const queue = [{ ...start, d: dist[start.r][start.c] }];
  while (queue.length) {
    queue.sort((a, b) => a.d - b.d);
    const node = queue.shift();
    if (node.r === goal.r && node.c === goal.c) return dist[goal.r][goal.c];
    for (const d of DIR_VECTORS) {
      const nr = node.r + d.dr;
      const nc = node.c + d.dc;
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
      const nd = node.d + grid[nr][nc];
      if (nd < dist[nr][nc]) {
        dist[nr][nc] = nd;
        queue.push({ r: nr, c: nc, d: nd });
      }
    }
  }
  return dist[goal.r][goal.c];
}

export const strategyRoute = {
  id: 'strategy.route',
  category: 'strategy',
  name: 'Least Resistance',
  par: () => ({ time: 60, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const n = scaledSize(d, 3, 5);
    const grid = makeGrid(n, n, 0);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) grid[r][c] = rng.int(1, 9);
    const start = { r: 0, c: 0 };
    const goal = { r: n - 1, c: n - 1 };
    const cost = dijkstra(grid, start, goal);
    const options = [cost, cost + rng.int(1, 4), cost - rng.int(1, 3), cost + rng.int(4, 8), cost + rng.int(6, 12)]
      .filter((v, i, arr) => v > 0 && arr.indexOf(v) === i);
    const built = buildChoices({
      correct: cost,
      distractors: options.filter((v) => v !== cost),
      rng,
      labelFor: (v) => `${v} units`,
      render: (v) => el('span', { class: 'num', text: String(v) })
    });
    return {
      seed: level.seed, n, grid, start, goal, cost,
      options: built.options.map((o) => ({ value: o.value, token: o.token, label: o.label })),
      answerToken: built.answerToken,
      hint: 'Travel through the low numbers; going around a big number is often cheaper.'
    };
  },
  validate(p) {
    const errs = [];
    const cost = dijkstra(p.grid, p.start, p.goal);
    if (cost !== p.cost) errs.push('recorded cost does not match Dijkstra');
    if (!p.options.some((o) => o.value === p.cost)) errs.push('answer missing from options');
    if (new Set(p.options.map((o) => o.value)).size !== p.options.length) errs.push('duplicate options');
    const sumAll = p.grid.flat().reduce((a, b) => a + b, 0);
    if (p.cost >= sumAll) errs.push('cost is not smaller than the total of the grid');
    return errs;
  },
  solve(p) {
    const opt = p.options.find((o) => o.value === p.cost);
    return opt ? [opt.token] : [];
  },
  mount(root, p, ctx) {
    const grid = boardEl(p.n, p.n, { cellSize: 42, ariaLabel: 'Resistance grid', role: 'img' });
    for (let r = 0; r < p.n; r++) {
      for (let c = 0; c < p.n; c++) {
        const node = el('div', {
          class: 'board-cell static cost-cell', style: { gridArea: `${r + 1} / ${c + 1}` },
          text: String(p.grid[r][c]),
          attrs: { 'aria-label': `Cost ${p.grid[r][c]}` }
        });
        if (r === p.start.r && c === p.start.c) node.classList.add('start-cell');
        if (r === p.goal.r && c === p.goal.c) node.classList.add('goal-cell');
        grid.appendChild(node);
      }
    }
    root.appendChild(promptText('Traverse from the top-left to the bottom-right. Every cell you enter costs its number. What is the cheapest total?'));
    root.appendChild(grid);
    root.appendChild(choiceList({
      options: p.options.map((o) => ({ ...o, content: el('span', { class: 'num', text: String(o.value) }) })),
      columns: 3,
      onChoose: (opt) => (opt.value === p.cost ? ctx.solve('Optimal route computed.') : ctx.fail('A cheaper route exists.'))
    }));
  }
};

// ---------------------------------------------------------------------------
// 9. Exact packing
// ---------------------------------------------------------------------------

export const strategyPack = {
  id: 'strategy.pack',
  category: 'strategy',
  name: 'Hold Packing',
  par: () => ({ time: 90, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const rows = 3;
    const cols = d <= 4 ? 3 : 4;
    const total = rows * cols;
    const pieces = [];
    const cellsLeft = new Set(Array.from({ length: total }, (_, i) => i));
    let guard = 0;
    while (cellsLeft.size > 0 && guard++ < 600) {
      const startIdx = [...cellsLeft][0];
      const startR = Math.floor(startIdx / cols);
      const startC = startIdx % cols;
      const size = Math.min(cellsLeft.size, rng.int(2, d <= 4 ? 3 : 4));
      const shape = [{ r: startR, c: startC }];
      cellsLeft.delete(startIdx);
      let inner = 0;
      while (shape.length < size && inner++ < 60) {
        const base = rng.pick(shape);
        const dir = rng.pick([[0, 1], [1, 0], [0, -1], [-1, 0]]);
        const nr = base.r + dir[0];
        const nc = base.c + dir[1];
        if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
        const idx = nr * cols + nc;
        if (!cellsLeft.has(idx)) continue;
        if (shape.some((x) => x.r === nr && x.c === nc)) continue;
        shape.push({ r: nr, c: nc });
        cellsLeft.delete(idx);
      }
      pieces.push(shape);
    }
    const order = rng.shuffle(pieces.map((_, i) => i));
    const solution = [];
    order.forEach((pieceIndex) => {
      const piece = pieces[pieceIndex];
      const anchor = piece.reduce((acc, cell) => (cell.r < acc.r || (cell.r === acc.r && cell.c < acc.c) ? cell : acc), piece[0]);
      solution.push(`piece:${pieceIndex}`, `cell:${anchor.r},${anchor.c}`);
    });
    return {
      seed: level.seed, rows, cols, pieces, order, solution,
      hint: 'Start with the piece that has the most awkward shape.'
    };
  },
  validate(p) {
    const errs = [];
    const covered = makeGrid(p.rows, p.cols, 0);
    for (const piece of p.pieces) {
      if (!piece.length) errs.push('empty piece');
      for (const cell of piece) {
        if (cell.r < 0 || cell.c < 0 || cell.r >= p.rows || cell.c >= p.cols) errs.push('piece cell out of bounds');
        else {
          covered[cell.r][cell.c]++;
          if (covered[cell.r][cell.c] > 1) errs.push('pieces overlap');
        }
      }
      // connectivity check
      const set = new Set(piece.map((c) => `${c.r},${c.c}`));
      const stack = [piece[0]];
      const seen = new Set();
      while (stack.length) {
        const cur = stack.pop();
        const k = `${cur.r},${cur.c}`;
        if (seen.has(k)) continue;
        seen.add(k);
        for (const d of DIR_VECTORS) {
          const k2 = `${cur.r + d.dr},${cur.c + d.dc}`;
          if (set.has(k2) && !seen.has(k2)) stack.push({ r: cur.r + d.dr, c: cur.c + d.dc });
        }
      }
      if (seen.size !== piece.length) errs.push('piece is not connected');
    }
    if (covered.flat().some((v) => v !== 1)) errs.push('container is not exactly covered');
    if (p.order.length !== p.pieces.length) errs.push('order length mismatch');
    if (!p.solution || p.solution.length !== p.pieces.length * 2) errs.push('solution length mismatch');
    return errs;
  },
  solve: (p) => p.solution.slice(),
  mount(root, p, ctx) {
    const placed = new Map();
    let selected = null;
    const status = el('div', { class: 'status-line', attrs: { role: 'status' }, text: 'Select a piece, then tap its top-left cell.' });
    const tray = el('div', { class: 'piece-tray', attrs: { role: 'group', 'aria-label': 'Piece tray' } });
    const grid = el('div', {
      class: 'board hold-grid',
      style: { '--rows': p.rows, '--cols': p.cols, '--cell': '50px' },
      attrs: { role: 'grid', 'aria-label': 'Cargo hold' }
    });

    const ownerAt = (r, c) => [...placed.entries()].find(([, cells]) => cells.some((cell) => cell.r === r && cell.c === c));

    const render = () => {
      // tray
      tray.textContent = '';
      p.order.forEach((pieceIndex) => {
        if (placed.has(pieceIndex)) return;
        const piece = p.pieces[pieceIndex];
        const btn = el('button', {
          type: 'button',
          class: `choice tile ${selected === pieceIndex ? 'selected' : ''}`.trim(),
          dataset: { token: `piece:${pieceIndex}` },
          attrs: { 'aria-label': `Piece ${pieceIndex + 1} with ${piece.length} cells`, 'aria-pressed': String(selected === pieceIndex) }
        }, pieceSVG(piece, 44));
        btn.addEventListener('click', () => {
          selected = selected === pieceIndex ? null : pieceIndex;
          status.textContent = selected === null ? 'Selection cleared.' : 'Now tap the top-left cell of the target position.';
          ctx.audio.ui();
          render();
        });
        tray.appendChild(btn);
      });
      // hold
      grid.textContent = '';
      for (let r = 0; r < p.rows; r++) {
        for (let c = 0; c < p.cols; c++) {
          const owner = ownerAt(r, c);
          const btn = el('button', {
            type: 'button',
            class: `cell ${owner ? `filled tone-${owner[0] % 5}` : ''}`.trim(),
            dataset: { token: `cell:${r},${c}` },
            style: { gridArea: `${r + 1} / ${c + 1}` },
            attrs: { 'aria-label': `Row ${r + 1} column ${c + 1}${owner ? `, piece ${owner[0] + 1}` : ', empty'}` }
          }, el('span', { class: 'hold-cell' }));
          btn.addEventListener('click', () => tryPlace(r, c));
          grid.appendChild(btn);
        }
      }
    };

    const tryPlace = (r, c) => {
      if (selected === null) { status.textContent = 'Pick a piece from the tray first.'; return; }
      const piece = p.pieces[selected];
      const anchor = piece.reduce((acc, cell) => (cell.r < acc.r || (cell.r === acc.r && cell.c < acc.c) ? cell : acc), piece[0]);
      const targetCells = piece.map((cell) => ({ r: cell.r - anchor.r + r, c: cell.c - anchor.c + c }));
      const inside = targetCells.every((cell) => cell.r >= 0 && cell.c >= 0 && cell.r < p.rows && cell.c < p.cols);
      const free = inside && targetCells.every((cell) => !ownerAt(cell.r, cell.c));
      if (!free) { ctx.fail('That piece does not fit there.'); return; }
      placed.set(selected, targetCells);
      selected = null;
      ctx.audio.ui();
      render();
      status.textContent = `${placed.size} / ${p.pieces.length} pieces placed`;
      if (placed.size === p.pieces.length) ctx.solve('Hold packed to capacity.');
    };

    render();
    root.appendChild(promptText('Pack every piece into the hold so nothing overlaps and nothing is left empty.'));
    root.appendChild(tray);
    root.appendChild(grid);
    root.appendChild(status);
  }
};

function pieceSVG(piece, size = 44) {
  const rows = Math.max(...piece.map((c) => c.r)) + 1;
  const cols = Math.max(...piece.map((c) => c.c)) + 1;
  const box = Math.max(rows, cols);
  const cellSize = 100 / box;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('class', 'piece');
  for (let r = 0; r < box; r++) {
    for (let c = 0; c < box; c++) {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      const filled = piece.some((x) => x.r === r && x.c === c);
      rect.setAttribute('x', String(c * cellSize + 1));
      rect.setAttribute('y', String(r * cellSize + 1));
      rect.setAttribute('width', String(cellSize - 2));
      rect.setAttribute('height', String(cellSize - 2));
      rect.setAttribute('rx', '2');
      rect.setAttribute('class', filled ? 'piece-cell on' : 'piece-cell off');
      svg.appendChild(rect);
    }
  }
  return svg;
}

export const STRATEGY_PUZZLES = {
  'strategy.sokoban': strategySokoban,
  'strategy.enemy': strategyEnemy,
  'strategy.network': strategyNetwork,
  'strategy.alloc': strategyAlloc,
  'strategy.hanoi': strategyHanoi,
  'strategy.nim': strategyNim,
  'strategy.budget': strategyBudget,
  'strategy.route': strategyRoute,
  'strategy.pack': strategyPack
};
