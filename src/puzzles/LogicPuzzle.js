/**
 * LOGIC puzzles — part 1: state manipulation, circuits, ordering, deduction.
 *
 * Two guarantees run through this file:
 *   1. Puzzles are generated *from* a solution.
 *   2. `validate()` re-derives the clue semantics from serialisable descriptors
 *      and brute-forces the search space to prove the puzzle is unique and
 *      therefore always solvable.
 */

import { el } from './puzzleApi.js';
import { buildChoices } from './common.js';
import { choiceList, promptText, boardEl, interactiveGrid, answerInput } from './kit.js';

/** All permutations of an array (n ≤ 6 everywhere it is used). */
export function permutations(items) {
  if (items.length <= 1) return [items.slice()];
  const out = [];
  items.forEach((item, i) => {
    const rest = items.slice(0, i).concat(items.slice(i + 1));
    for (const p of permutations(rest)) out.push([item, ...p]);
  });
  return out;
}

// ---------------------------------------------------------------------------
// 1. Relay matrix — reach the target configuration
// ---------------------------------------------------------------------------

export const logicSwitches = {
  id: 'logic.switches',
  category: 'logic',
  name: 'Relay Matrix',
  par: (p) => ({ time: 24 + p.rows * p.cols * 6, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const rows = d <= 3 ? 3 : d <= 6 ? 3 : 4;
    const cols = d <= 3 ? 3 : d <= 6 ? 4 : 4;
    const size = rows * cols;
    const target = new Array(size).fill(0);
    const presses = [];
    const pressCount = Math.max(2, Math.min(size, 2 + Math.floor(d * 0.6)));
    let guard = 0;
    while (presses.length < pressCount && guard++ < 200) {
      const cell = rng.int(0, size - 1);
      if (presses.includes(cell)) continue;
      presses.push(cell);
      toggleCross(target, rows, cols, cell);
    }
    if (target.every((v) => v === 0)) {
      toggleCross(target, rows, cols, 0);
      presses.push(0);
    }
    return { seed: level.seed, rows, cols, target, referenceSolution: presses, hint: 'Each relay flips itself and its four neighbours.' };
  },
  validate(p) {
    const errs = [];
    if (p.target.length !== p.rows * p.cols) errs.push('grid size mismatch');
    if (p.target.every((v) => v === 0)) errs.push('target is already the starting state');
    const state = new Array(p.rows * p.cols).fill(0);
    for (const cell of p.referenceSolution) toggleCross(state, p.rows, p.cols, cell);
    if (JSON.stringify(state) !== JSON.stringify(p.target)) errs.push('reference solution does not reach the target');
    if (!solveLights(p.rows, p.cols, p.target)) errs.push('no solution exists for this relay configuration');
    return errs;
  },
  solve(p) {
    const solution = solveLights(p.rows, p.cols, p.target) || p.referenceSolution;
    return solution.map((cell) => `sw:${Math.floor(cell / p.cols)},${cell % p.cols}`);
  },
  mount(root, p, ctx) {
    const size = p.rows * p.cols;
    const state = new Array(size).fill(0);
    const goal = boardEl(p.rows, p.cols, { cellSize: 40, ariaLabel: 'Target configuration', role: 'img' });
    p.target.forEach((v, i) => {
      goal.appendChild(el('div', {
        class: `board-cell static mini ${v ? 'on' : 'off'}`,
        style: { gridArea: `${Math.floor(i / p.cols) + 1} / ${(i % p.cols) + 1}` },
        attrs: { 'aria-label': v ? 'lit' : 'dark' }
      }));
    });
    const moves = el('div', { class: 'status-line', attrs: { role: 'status' }, text: 'Presses: 0' });
    let presses = 0;
    const grid = interactiveGrid({
      rows: p.rows, cols: p.cols, cellSize: 54, tokenPrefix: 'sw', ariaLabel: 'Relay grid',
      render: (r, c) => ({ node: el('span', { class: 'relay' }), label: `Relay row ${r + 1} column ${c + 1}, dark` }),
      onSelect: (r, c, btn) => {
        void btn;
        toggleCross(state, p.rows, p.cols, r * p.cols + c);
        presses++;
        ctx.audio.ui();
        for (let i = 0; i < size; i++) {
          const node = grid.__cell(Math.floor(i / p.cols), i % p.cols);
          if (!node) continue;
          const on = state[i] === 1;
          node.classList.toggle('on', on);
          node.setAttribute('aria-pressed', String(on));
          node.setAttribute('aria-label', `Relay row ${Math.floor(i / p.cols) + 1} column ${(i % p.cols) + 1}, ${on ? 'lit' : 'dark'}`);
        }
        moves.textContent = `Presses: ${presses}`;
        if (state.every((v, i) => v === p.target[i])) ctx.solve('Relay matrix aligned.');
      }
    });
    root.appendChild(el('div', { class: 'dual-panel' },
      el('div', { class: 'panel' }, el('div', { class: 'panel-label', text: 'CURRENT' }), grid),
      el('div', { class: 'panel' }, el('div', { class: 'panel-label', text: 'TARGET' }), goal)
    ));
    root.appendChild(moves);
    root.appendChild(promptText('Press relays until the current grid matches the target.'));
  }
};

function toggleCross(state, rows, cols, index) {
  const r = Math.floor(index / cols);
  const c = index % cols;
  const cells = [[r, c], [r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
  for (const [rr, cc] of cells) {
    if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
    state[rr * cols + cc] = state[rr * cols + cc] ? 0 : 1;
  }
}

/** Exhaustive search over press subsets (grids are ≤ 16 cells). */
export function solveLights(rows, cols, target) {
  const size = rows * cols;
  if (size > 20) return null;
  const limit = 1 << size;
  for (let mask = 0; mask < limit; mask++) {
    const state = new Array(size).fill(0);
    const presses = [];
    for (let i = 0; i < size; i++) {
      if (mask & (1 << i)) { toggleCross(state, rows, cols, i); presses.push(i); }
    }
    if (state.every((v, i) => v === target[i])) return presses;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 2. Gate circuits
// ---------------------------------------------------------------------------

const OPS = {
  AND: (a, b) => a & b,
  OR: (a, b) => a | b,
  XOR: (a, b) => a ^ b,
  NAND: (a, b) => 1 - (a & b),
  NOR: (a, b) => 1 - (a | b),
  XNOR: (a, b) => 1 - (a ^ b)
};

const evaluatePair = (pair, a, b, c) => OPS[pair.op2](OPS[pair.op1](a, b), c);

export const logicGate = {
  id: 'logic.gate',
  category: 'logic',
  name: 'Logic Core',
  par: () => ({ time: 50, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const ops = d <= 5 ? ['AND', 'OR', 'XOR'] : Object.keys(OPS);
    const allPairs = [];
    for (const op1 of ops) for (const op2 of ops) allPairs.push({ op1, op2 });
    // choose input bits that split the option space into two non-empty halves,
    // otherwise there is no puzzle to solve (every wiring would be identical)
    let a = 0;
    let b = 0;
    let c = 0;
    let zeroPairs = [];
    let onePairs = [];
    let guard = 0;
    do {
      a = rng.int(0, 1);
      b = rng.int(0, 1);
      c = rng.int(0, 1);
      zeroPairs = allPairs.filter((pair) => evaluatePair(pair, a, b, c) === 0);
      onePairs = allPairs.filter((pair) => evaluatePair(pair, a, b, c) === 1);
    } while ((!zeroPairs.length || !onePairs.length) && guard++ < 60);
    const output = zeroPairs.length && (!onePairs.length || zeroPairs.length <= onePairs.length) ? 0 : 1;
    const valid = output === 0 ? zeroPairs : onePairs;
    const invalid = output === 0 ? onePairs : zeroPairs;
    const correctPair = rng.pick(valid);
    const built = buildChoices({
      correct: correctPair,
      distractors: rng.sample(invalid, Math.min(5, invalid.length)),
      rng,
      equals: (x, y) => x.op1 === y.op1 && x.op2 === y.op2,
      labelFor: (v) => `${v.op1} then ${v.op2}`,
      render: (v) => el('span', { class: 'gate-pair' },
        el('span', { class: 'gate-chip', text: v.op1 }),
        el('span', { class: 'gate-arrow', text: '→' }),
        el('span', { class: 'gate-chip', text: v.op2 }))
    });
    return {
      seed: level.seed,
      inputs: { a, b, c },
      output,
      options: built.options.map((o) => ({ pair: o.value, token: o.token, label: o.label })),
      answerToken: built.answerToken,
      validCount: valid.length,
      hint: 'Work out ( A op B ) first, then combine the result with C.'
    };
  },
  validate(p) {
    const errs = [];
    if (!p.options || p.options.length < 3) errs.push('too few gate options');
    const valid = p.options.filter((o) => evaluatePair(o.pair, p.inputs.a, p.inputs.b, p.inputs.c) === p.output);
    if (valid.length === 0) errs.push('no option produces the required output');
    const answer = p.options.find((o) => o.token === p.answerToken);
    if (!answer) errs.push('answer token missing from options');
    else if (evaluatePair(answer.pair, p.inputs.a, p.inputs.b, p.inputs.c) !== p.output) errs.push('listed answer is wrong');
    if (new Set(p.options.map((o) => `${o.pair.op1}-${o.pair.op2}`)).size !== p.options.length) errs.push('duplicate gate options');
    return errs;
  },
  solve(p) {
    const valid = p.options.find((o) => evaluatePair(o.pair, p.inputs.a, p.inputs.b, p.inputs.c) === p.output);
    return valid ? [valid.token] : [];
  },
  mount(root, p, ctx) {
    const ioChip = (name, value) => el('span', { class: 'io-chip' },
      el('span', { class: 'io-name', text: name }),
      el('span', { class: `io-value ${value ? 'hi' : 'lo'}`, text: String(value) }));
    root.appendChild(el('div', { class: 'circuit' },
      el('div', { class: 'circuit-inputs' }, ioChip('A', p.inputs.a), ioChip('B', p.inputs.b), ioChip('C', p.inputs.c)),
      el('div', { class: 'circuit-formula', text: 'OUT = ( A ⟨op1⟩ B ) ⟨op2⟩ C' }),
      el('div', { class: 'circuit-target' },
        el('span', { class: 'muted', text: 'REQUIRED OUTPUT' }),
        el('span', { class: `io-value big ${p.output ? 'hi' : 'lo'}`, text: String(p.output) }))
    ));
    root.appendChild(choiceList({
      options: p.options.map((o) => ({
        token: o.token,
        label: o.label,
        pair: o.pair,
        content: el('span', { class: 'gate-pair' },
          el('span', { class: 'gate-chip', text: o.pair.op1 }),
          el('span', { class: 'gate-arrow', text: '→' }),
          el('span', { class: 'gate-chip', text: o.pair.op2 }))
      })),
      columns: 3,
      onChoose: (opt) => {
        const value = evaluatePair(opt.pair, p.inputs.a, p.inputs.b, p.inputs.c);
        if (value === p.output) ctx.solve('Circuit satisfied.');
        else ctx.fail(`That combination outputs ${value}, not ${p.output}.`);
      }
    }));
  }
};

// ---------------------------------------------------------------------------
// 3. Ordering with clues
// ---------------------------------------------------------------------------

const ORDER_ITEMS = ['REACTOR', 'MEDBAY', 'ARCHIVE', 'OBSERVATORY', 'CARGO', 'COMMS', 'CRYO', 'LAB'];

/**
 * Clue descriptors: { type, args } — serialisable so `validate` can rebuild
 * the predicate and brute-force the permutation space.
 */
export const ORDER_CLUE_TYPES = {
  before: {
    text: (a, b) => `${a} boots before ${b}.`,
    test: (order, a, b) => order.indexOf(a) < order.indexOf(b)
  },
  after: {
    text: (a, b) => `${a} boots after ${b}.`,
    test: (order, a, b) => order.indexOf(a) > order.indexOf(b)
  },
  immediately: {
    text: (a, b) => `${a} boots immediately after ${b}.`,
    test: (order, a, b) => order.indexOf(a) === order.indexOf(b) + 1
  },
  notFirst: { text: (a) => `${a} is not first.`, test: (order, a) => order.indexOf(a) !== 0 },
  notLast: { text: (a) => `${a} is not last.`, test: (order, a) => order.indexOf(a) !== order.length - 1 },
  position: { text: (a, i) => `${a} is position ${Number(i) + 1}.`, test: (order, a, i) => order.indexOf(a) === Number(i) },
  adjacent: { text: (a, b) => `${a} and ${b} are adjacent.`, test: (order, a, b) => Math.abs(order.indexOf(a) - order.indexOf(b)) === 1 },
  notAdjacent: { text: (a, b) => `${a} and ${b} are never adjacent.`, test: (order, a, b) => Math.abs(order.indexOf(a) - order.indexOf(b)) !== 1 }
};

export function clueText(clue) {
  return ORDER_CLUE_TYPES[clue.type].text(...clue.args);
}

export function clueHolds(clue, order) {
  return ORDER_CLUE_TYPES[clue.type].test(order, ...clue.args);
}

export const logicOrder = {
  id: 'logic.order',
  category: 'logic',
  name: 'Boot Sequence',
  par: (p) => ({ time: 45 + p.items.length * 14, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const count = Math.max(3, Math.min(6, 3 + Math.floor(d / 3)));
    const items = rng.sample(ORDER_ITEMS, count);
    const solution = rng.shuffle(items);

    const candidates = [];
    for (const a of items) {
      for (const b of items) {
        if (a === b) continue;
        for (const type of ['before', 'after', 'immediately', 'adjacent', 'notAdjacent']) {
          const clue = { type, args: [a, b] };
          if (clueHolds(clue, solution)) candidates.push(clue);
        }
      }
      const pos = solution.indexOf(a);
      for (const type of ['notFirst', 'notLast']) {
        const clue = { type, args: [a] };
        if (clueHolds(clue, solution)) candidates.push(clue);
      }
      if (d >= 4) candidates.push({ type: 'position', args: [a, pos] });
    }

    const allOrders = permutations(items);
    const chosen = [];
    const passes = (order) => chosen.every((c) => clueHolds(c, order));
    const solveCount = () => allOrders.filter(passes).length;
    const pool = rng.shuffle(candidates);
    let guard = 0;
    while (solveCount() > 1 && pool.length && guard++ < 400) {
      const next = pool.shift();
      if (chosen.some((c) => clueText(c) === clueText(next))) continue;
      chosen.push(next);
    }
    for (let i = chosen.length - 1; i >= 1; i--) {
      const removed = chosen.splice(i, 1)[0];
      if (solveCount() !== 1) chosen.splice(i, 0, removed);
    }
    return {
      seed: level.seed,
      items,
      clues: chosen.map((c) => ({ type: c.type, args: c.args, text: clueText(c) })),
      solution,
      hint: 'Pin down the first and last module, then chain the “immediately after” clues.'
    };
  },
  validate(p) {
    const errs = [];
    if (!p.items || p.items.length < 3) errs.push('too few items');
    if (!p.clues || p.clues.length < 2) errs.push('not enough clues');
    if (p.clues.some((c) => !ORDER_CLUE_TYPES[c.type])) errs.push('unknown clue type');
    if (p.clues.some((c) => !clueText(c))) errs.push('clue without text');
    const all = permutations(p.items);
    const valid = all.filter((order) => p.clues.every((c) => clueHolds(c, order)));
    if (!p.clues.every((c) => clueHolds(c, p.solution))) errs.push('intended solution contradicts a clue');
    if (valid.length !== 1) errs.push(`${valid.length} orders satisfy the clues (need exactly 1)`);
    if (new Set(p.items).size !== p.items.length) errs.push('duplicate items');
    return errs;
  },
  solve(p) {
    const order = p.items.slice();
    const steps = [];
    for (let i = 0; i < p.solution.length; i++) {
      if (order[i] === p.solution[i]) continue;
      const j = order.indexOf(p.solution[i]);
      steps.push(`item:${order[i]}`, `item:${order[j]}`);
      [order[i], order[j]] = [order[j], order[i]];
    }
    return steps;
  },
  mount(root, p, ctx) {
    let order = p.items.slice();
    let selected = null;
    let swaps = 0;
    const clueBox = el('ul', { class: 'clue-list', attrs: { 'aria-label': 'Clues' } });
    p.clues.forEach((c) => clueBox.appendChild(el('li', { class: 'clue', text: c.text })));
    const list = el('div', { class: 'order-list', attrs: { role: 'group', 'aria-label': 'Boot order — tap two cards to swap them' } });
    const status = el('div', { class: 'status-line', attrs: { role: 'status' }, text: 'Tap two cards to swap their positions.' });

    const render = () => {
      list.textContent = '';
      order.forEach((item, index) => {
        const btn = el('button', {
          type: 'button',
          class: `order-card ${selected === item ? 'selected' : ''}`.trim(),
          dataset: { token: `item:${item}` },
          attrs: { 'aria-label': `Position ${index + 1}: ${item}`, 'aria-pressed': String(selected === item) }
        }, el('span', { class: 'order-index', text: String(index + 1) }), el('span', { class: 'order-name', text: item }));
        btn.addEventListener('click', () => onTap(item));
        list.appendChild(btn);
      });
    };
    const onTap = (item) => {
      if (selected === null) { selected = item; render(); return; }
      if (selected === item) { selected = null; render(); return; }
      const i = order.indexOf(selected);
      const j = order.indexOf(item);
      [order[i], order[j]] = [order[j], order[i]];
      selected = null;
      swaps++;
      ctx.audio.ui();
      render();
      status.textContent = `Swaps used: ${swaps}`;
      if (order.every((v, idx) => v === p.solution[idx])) ctx.solve('Boot sequence confirmed.');
    };
    render();
    root.appendChild(clueBox);
    root.appendChild(list);
    root.appendChild(status);
  }
};

// ---------------------------------------------------------------------------
// 4. Deduction — two attributes per module, clues pin them down
// ---------------------------------------------------------------------------

const RANK = ['LOW', 'MID', 'HIGH', 'PEAK'];

export const DEDUCTION_CLUE_TYPES = {
  sectorIs: { text: (m, n) => `${m} is in sector ${n}.`, test: (cand, m, n) => cand.sector[m] === Number(n) },
  powerIs: { text: (m, v) => `${m} draws ${v} power.`, test: (cand, m, v) => cand.power[m] === v },
  lowerSector: { text: (m1, m2) => `${m1} sits in a lower sector number than ${m2}.`, test: (cand, m1, m2) => cand.sector[m1] < cand.sector[m2] },
  higherSector: { text: (m1, m2) => `${m1} sits in a higher sector number than ${m2}.`, test: (cand, m1, m2) => cand.sector[m1] > cand.sector[m2] },
  morePower: { text: (m1, m2) => `${m1} draws more power than ${m2}.`, test: (cand, m1, m2) => RANK.indexOf(cand.power[m1]) > RANK.indexOf(cand.power[m2]) },
  lessPower: { text: (m1, m2) => `${m1} draws less power than ${m2}.`, test: (cand, m1, m2) => RANK.indexOf(cand.power[m1]) < RANK.indexOf(cand.power[m2]) },
  sectorNeighbour: { text: (m1, m2) => `${m1} occupies the sector directly below ${m2}.`, test: (cand, m1, m2) => cand.sector[m2] - cand.sector[m1] === 1 },
  powerNeighbour: { text: (m1, m2) => `${m1} and ${m2} draw adjacent power levels.`, test: (cand, m1, m2) => Math.abs(RANK.indexOf(cand.power[m1]) - RANK.indexOf(cand.power[m2])) === 1 }
};

export const logicDeduction = {
  id: 'logic.deduction',
  category: 'logic',
  name: 'Sector Deduction',
  par: () => ({ time: 90, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const count = d <= 3 ? 3 : 4;
    const modules = ['ALPHA', 'BETA', 'GAMMA', 'DELTA'].slice(0, count);
    const sectors = Array.from({ length: count }, (_, i) => i + 1);
    const powers = RANK.slice(0, count);
    const sectorOrder = rng.shuffle(sectors);
    const powerOrder = rng.shuffle(powers);
    const solution = { sector: {}, power: {} };
    modules.forEach((m, i) => { solution.sector[m] = sectorOrder[i]; solution.power[m] = powerOrder[i]; });

    const candidates = [];
    for (const m of modules) {
      candidates.push({ type: 'sectorIs', args: [m, solution.sector[m]] });
      candidates.push({ type: 'powerIs', args: [m, solution.power[m]] });
    }
    for (const m1 of modules) {
      for (const m2 of modules) {
        if (m1 === m2) continue;
        for (const type of ['lowerSector', 'higherSector', 'morePower', 'lessPower', 'sectorNeighbour', 'powerNeighbour']) {
          const clue = { type, args: [m1, m2] };
          if (DEDUCTION_CLUE_TYPES[type].test(solution, m1, m2)) candidates.push(clue);
        }
      }
    }

    const cands = enumerateAssignments(modules, sectors, powers);
    const chosen = [];
    const passes = (cand) => chosen.every((c) => DEDUCTION_CLUE_TYPES[c.type].test(cand, ...c.args));
    const pool = rng.shuffle(candidates);
    let guard = 0;
    while (cands.filter(passes).length > 1 && pool.length && guard++ < 400) {
      const next = pool.shift();
      if (chosen.some((c) => DEDUCTION_CLUE_TYPES[c.type].text(...c.args) === DEDUCTION_CLUE_TYPES[next.type].text(...next.args))) continue;
      chosen.push(next);
    }
    for (let i = chosen.length - 1; i >= 1; i--) {
      const removed = chosen.splice(i, 1)[0];
      if (cands.filter(passes).length !== 1) chosen.splice(i, 0, removed);
    }
    return {
      seed: level.seed,
      modules,
      sectors,
      powers,
      solution,
      clues: chosen.map((c) => ({ type: c.type, args: c.args, text: DEDUCTION_CLUE_TYPES[c.type].text(...c.args) })),
      hint: 'Handle the plain statements first, then use the comparisons.'
    };
  },
  validate(p) {
    const errs = [];
    if (!p.clues || p.clues.length < 2) errs.push('not enough clues');
    if (p.clues.some((c) => !DEDUCTION_CLUE_TYPES[c.type])) errs.push('unknown clue type');
    if (p.clues.some((c) => !DEDUCTION_CLUE_TYPES[c.type].text(...c.args))) errs.push('clue without text');
    for (const m of p.modules) {
      if (!p.solution.sector[m] || !p.solution.power[m]) errs.push(`solution incomplete for ${m}`);
    }
    if (new Set(p.modules.map((m) => p.solution.sector[m])).size !== p.modules.length) errs.push('sectors are not distinct');
    if (new Set(p.modules.map((m) => p.solution.power[m])).size !== p.modules.length) errs.push('power levels are not distinct');
    const all = enumerateAssignments(p.modules, p.sectors, p.powers);
    const valid = all.filter((cand) => p.clues.every((c) => DEDUCTION_CLUE_TYPES[c.type].test(cand, ...c.args)));
    if (valid.length !== 1) errs.push(`${valid.length} assignments satisfy the clues (need exactly 1)`);
    return errs;
  },
  solve(p) {
    const steps = [];
    for (const m of p.modules) steps.push(`sector:${m}:${p.solution.sector[m]}`);
    steps.push({ click: 'assign:confirm' });
    for (const m of p.modules) steps.push(`power:${m}:${p.solution.power[m]}`);
    steps.push({ click: 'assign:confirm' });
    return steps;
  },
  mount(root, p, ctx) {
    const state = { sector: {}, power: {} };
    let phase = 'sector';
    const clueBox = el('ul', { class: 'clue-list', attrs: { 'aria-label': 'Deduction clues' } });
    p.clues.forEach((c) => clueBox.appendChild(el('li', { class: 'clue', text: c.text })));
    const status = el('div', { class: 'status-line', attrs: { role: 'status' }, text: 'Assign a sector to every module.' });
    const table = el('div', { class: 'assign-table' });
    const confirm = el('button', {
      type: 'button', class: 'btn btn-primary', text: 'LOCK SECTORS ▶', dataset: { token: 'assign:confirm' }
    });

    const render = () => {
      table.textContent = '';
      p.modules.forEach((m) => {
        const row = el('div', { class: 'assign-row' }, el('span', { class: 'assign-name', text: m }));
        const options = phase === 'sector' ? p.sectors : p.powers;
        const chosen = phase === 'sector' ? state.sector[m] : state.power[m];
        options.forEach((value) => {
          const btn = el('button', {
            type: 'button',
            class: `assign-chip ${chosen === value ? 'selected' : ''}`.trim(),
            text: String(value),
            dataset: { token: `${phase}:${m}:${value}` },
            attrs: { 'aria-pressed': String(chosen === value), 'aria-label': `${m}: ${phase} ${value}` }
          });
          btn.addEventListener('click', () => {
            state[phase][m] = value;
            ctx.audio.ui();
            render();
          });
          row.appendChild(btn);
        });
        table.appendChild(row);
      });
    };
    render();

    confirm.addEventListener('click', () => {
      const key = phase;
      if (p.modules.some((m) => state[key][m] === undefined)) {
        status.textContent = `Every module needs a ${key === 'sector' ? 'sector' : 'power draw'}.`;
        return;
      }
      if (new Set(p.modules.map((m) => state[key][m])).size !== p.modules.length) {
        status.textContent = `${key === 'sector' ? 'Sectors' : 'Power levels'} cannot repeat.`;
        return;
      }
      if (phase === 'sector') {
        phase = 'power';
        confirm.textContent = 'FINALISE ▶';
        status.textContent = 'Now assign each module a power draw.';
        render();
        return;
      }
      const wrongSector = p.modules.filter((m) => state.sector[m] !== p.solution.sector[m]);
      const wrongPower = p.modules.filter((m) => state.power[m] !== p.solution.power[m]);
      if (!wrongSector.length && !wrongPower.length) ctx.solve('Deduction confirmed.');
      else {
        ctx.fail(`${wrongSector.length} sector and ${wrongPower.length} power assignment(s) contradict the clues.`);
        phase = 'sector';
        confirm.textContent = 'LOCK SECTORS ▶';
        render();
      }
    });

    root.appendChild(clueBox);
    root.appendChild(table);
    root.appendChild(el('div', { class: 'btn-row' }, confirm));
    root.appendChild(status);
  }
};

export function enumerateAssignments(modules, sectors, powers) {
  const out = [];
  for (const sp of permutations(sectors)) {
    for (const pp of permutations(powers)) {
      const cand = { sector: {}, power: {} };
      modules.forEach((m, i) => { cand.sector[m] = sp[i]; cand.power[m] = pp[i]; });
      out.push(cand);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 5. Statement audit (truth-tellers, false-tellers)
// ---------------------------------------------------------------------------

/**
 * Statement kinds are evaluated parametrically so `validate` can search the
 * full space of (vault, liar-set) hypotheses and prove the puzzle is unique.
 */
export function evalStatement(statement, vault, liarSet) {
  const { kind, suspect, arg } = statement;
  switch (kind) {
    case 'vault':
      return arg === vault;
    case 'notVault':
      return arg !== vault;
    case 'accuseLiar':
      return liarSet.includes(arg);
    case 'accuseTruthful':
      return !liarSet.includes(arg);
    case 'selfLiar':
      return liarSet.includes(suspect);
    default:
      return false;
  }
}

function combos(arr, k) {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [head, ...rest] = arr;
  return combos(rest, k - 1).map((c) => [head, ...c]).concat(combos(rest, k));
}

/** Number of (vault, liar-set) hypotheses consistent with `statements`. */
export function countConsistent(statements, vaults, suspects, liarsCount) {
  let total = 0;
  for (const vault of vaults) {
    for (const set of combos(suspects, liarsCount)) {
      const ok = statements.every((st) => evalStatement(st, vault, set) === !set.includes(st.suspect));
      if (ok) total++;
    }
  }
  return total;
}

export const logicLiars = {
  id: 'logic.liars',
  category: 'logic',
  name: 'Statement Audit',
  par: () => ({ time: 75, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    // With fewer than three suspects the statements cannot pin down a unique
    // (vault, liar-set) hypothesis, so the minimum is three.
    const count = d <= 5 ? 3 : 4;
    const suspects = ['ARBITER', 'WARDEN', 'SCRIBE', 'ORACLE'].slice(0, count);
    const vaults = ['VAULT A', 'VAULT B', 'VAULT C', 'VAULT D'].slice(0, count);
    const liarsCount = d <= 6 ? 1 : 2;
    const answer = rng.pick(vaults);
    const liarSet = rng.sample(suspects, liarsCount);

    const buildStatements = () => suspects.map((suspect) => {
      const isLiar = liarSet.includes(suspect);
      const kindPool = ['vault', 'notVault'];
      if (count >= 3) kindPool.push('accuseLiar', 'accuseTruthful');
      if (d >= 6) kindPool.push('selfLiar');
      let statement = null;
      let guard = 0;
      while (!statement && guard++ < 80) {
        const kind = rng.pick(kindPool);
        let arg;
        if (kind === 'vault') arg = isLiar ? rng.pick(vaults.filter((v) => v !== answer)) : answer;
        else if (kind === 'notVault') arg = isLiar ? answer : rng.pick(vaults.filter((v) => v !== answer));
        else if (kind === 'accuseLiar' || kind === 'accuseTruthful') {
          const other = rng.pick(suspects.filter((s) => s !== suspect));
          const otherIsLiar = liarSet.includes(other);
          // an honest suspect must name the other's status correctly; a liar must invert it
          arg = other;
          if (kind === 'accuseLiar' && (otherIsLiar === isLiar)) continue;
          if (kind === 'accuseTruthful' && (otherIsLiar !== isLiar)) continue;
        } else {
          // selfLiar: "I am lying" is impossible to state truthfully; require the suspect to be honest
          if (isLiar) continue;
          arg = null;
        }
        const candidate = { suspect, kind, arg };
        const truth = evalStatement(candidate, answer, liarSet);
        if (truth === !isLiar) statement = candidate;
      }
      if (!statement) {
        const arg2 = isLiar ? rng.pick(vaults.filter((v) => v !== answer)) : answer;
        statement = { suspect, kind: 'vault', arg: arg2 };
      }
      return statement;
    });

    // search for a statement set whose unique consistent hypothesis is the truth
    let statements = buildStatements();
    let guard = 0;
    while (countConsistent(statements, vaults, suspects, liarsCount, answer) !== 1 && guard++ < 60) {
      statements = buildStatements();
    }
    if (countConsistent(statements, vaults, suspects, liarsCount, answer) !== 1) {
      // provably-unique construction: honest suspects name the true vault,
      // every liar names a different wrong vault (needs vaults ≥ liars + 2)
      const wrong = rng.shuffle(vaults.filter((v) => v !== answer));
      let wi = 0;
      statements = suspects.map((suspect) => (liarSet.includes(suspect)
        ? { suspect, kind: 'vault', arg: wrong[wi++] || wrong[0] }
        : { suspect, kind: 'vault', arg: answer }));
    }

    const texts = statements.map((s, i) => {
      switch (s.kind) {
        case 'vault': return `${suspects[i]} says: “The core is in ${s.arg}.”`;
        case 'notVault': return `${suspects[i]} says: “The core is not in ${s.arg}.”`;
        case 'accuseLiar': return `${suspects[i]} says: “${s.arg} is lying.”`;
        case 'accuseTruthful': return `${suspects[i]} says: “${s.arg} is telling the truth.”`;
        default: return `${suspects[i]} says: “I am lying.”`;
      }
    });

    return {
      seed: level.seed,
      suspects, vaults, answer, liarSet, liarsCount,
      statements: statements.map((s, i) => ({ ...s, text: texts[i] })),
      hint: 'Assume a single vault, count how many statements would then be false, and compare with the required number.'
    };
  },
  validate(p) {
    const errs = [];
    if (!p.vaults.includes(p.answer)) errs.push('answer vault not in list');
    if (p.liarSet.length !== p.liarsCount) errs.push('liar count mismatch');
    const hypotheses = [];
    for (const vault of p.vaults) {
      for (const set of combos(p.suspects, p.liarsCount)) {
        hypotheses.push({ vault, set });
      }
    }
    const consistent = hypotheses.filter(({ vault, set }) => p.statements.every((s) => evalStatement(s, vault, set) === !set.includes(s.suspect)));
    if (consistent.length !== 1) errs.push(`${consistent.length} hypotheses satisfy the statements (need exactly 1)`);
    else if (consistent[0].vault !== p.answer) errs.push('the unique consistent hypothesis is not the intended answer');
    if (p.statements.some((s) => !s.text)) errs.push('statement without text');
    return errs;
  },
  solve(p) {
    return [`vault:${p.vaults.indexOf(p.answer)}`];
  },
  mount(root, p, ctx) {
    root.appendChild(el('div', { class: 'clue-count', text: `Exactly ${p.liarsCount} statement${p.liarsCount > 1 ? 's are' : ' is'} false. The others are true.` }));
    const list = el('ul', { class: 'clue-list', attrs: { 'aria-label': 'Statements' } });
    p.statements.forEach((s) => list.appendChild(el('li', { class: 'clue', text: s.text })));
    root.appendChild(list);
    root.appendChild(promptText('Where is the core?'));
    root.appendChild(choiceList({
      options: p.vaults.map((v, i) => ({ value: v, token: `vault:${i}`, label: v, content: el('span', { class: 'num', text: v }) })),
      columns: 2,
      onChoose: (opt) => (opt.value === p.answer ? ctx.solve('Audit complete — core located.') : ctx.fail('That vault contradicts the statement count.'))
    }));
  }
};

// ---------------------------------------------------------------------------
// 6. Override code from numeric clues
// ---------------------------------------------------------------------------

export const KEY_CLUE_TYPES = {
  distinct: { text: (n) => `The code has ${n} distinct digits.`, test: (s, n) => s.length === Number(n) && new Set(s).size === Number(n) },
  sum: { text: (n) => `The digits add up to ${n}.`, test: (s, n) => s.split('').reduce((a, b) => a + Number(b), 0) === Number(n) },
  max: { text: (n) => `The largest digit is ${n}.`, test: (s, n) => Math.max(...s.split('').map(Number)) === Number(n) },
  min: { text: (n) => `The smallest digit is ${n}.`, test: (s, n) => Math.min(...s.split('').map(Number)) === Number(n) },
  evens: { text: (n) => `Exactly ${n} digit${Number(n) === 1 ? ' is' : 's are'} even.`, test: (s, n) => s.split('').filter((x) => Number(x) % 2 === 0).length === Number(n) },
  firstParity: { text: (n) => `The first digit is ${Number(n) > 4 ? 'greater than 4' : '4 or less'}.`, test: (s, n) => (Number(s[0]) > 4) === (Number(n) > 4) },
  lastParity: { text: (n) => `The last digit is ${Number(n) % 2 === 0 ? 'even' : 'odd'}.`, test: (s, n) => (Number(s[s.length - 1]) % 2 === 0) === (Number(n) % 2 === 0) },
  ascending: { text: (n) => (n === 1 ? 'The digits rise from left to right.' : 'The digits do not rise from left to right.'), test: (s, n) => (s === s.split('').sort().join('')) === (Number(n) === 1) },
  contains: { text: (n) => `The code contains the digit ${n}.`, test: (s, n) => s.includes(String(n)) },
  noZero: { text: () => 'The code contains no zero.', test: (s) => !s.includes('0') },
  middleHigh: { text: (n) => `The middle digit is ${Number(n) > 4 ? 'greater than 4' : '4 or less'}.`, test: (s, n) => (Number(s[Math.floor(s.length / 2)]) > 4) === (Number(n) > 4) },
  positionIs: {
    text: (i, d) => `Digit ${Number(i) + 1} is ${d}.`,
    test: (s, i, d) => s[Number(i)] === String(d)
  },
  positionParity: {
    text: (i, d) => `Digit ${Number(i) + 1} is ${Number(d) % 2 === 0 ? 'even' : 'odd'}.`,
    test: (s, i, d) => (Number(s[Number(i)]) % 2 === 0) === (Number(d) % 2 === 0)
  }
};

export const logicKeys = {
  id: 'logic.keys',
  category: 'logic',
  name: 'Override Code',
  par: () => ({ time: 90, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const length = d <= 4 ? 3 : 4;
    const digits = rng.sample([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], length);
    const code = digits.join('');
    const pool = Object.keys(KEY_CLUE_TYPES);
    let positionIndex = 0;
    const argsFor = (type) => {
      switch (type) {
        case 'distinct': return [length];
        case 'sum': return [digits.reduce((a, b) => a + b, 0)];
        case 'max': return [Math.max(...digits)];
        case 'min': return [Math.min(...digits)];
        case 'evens': return [digits.filter((x) => x % 2 === 0).length];
        case 'firstParity': return [digits[0]];
        case 'lastParity': return [digits[digits.length - 1]];
        case 'ascending': return [digits.join('') === digits.slice().sort().join('') ? 1 : 0];
        case 'contains': return [digits[rng.int(0, digits.length - 1)]];
        case 'noZero': return [];
        case 'positionIs': return [positionIndex, digits[positionIndex]];
        case 'positionParity': return [positionIndex, digits[positionIndex]];
        default: return [digits[Math.floor(length / 2)]];
      }
    };
    const candidates = [];
    const allCodes = [];
    const rec = (prefix) => {
      if (prefix.length === length) { allCodes.push(prefix); return; }
      for (let dig = 0; dig <= 9; dig++) {
        if (prefix.includes(String(dig))) continue;
        rec(prefix + String(dig));
      }
    };
    rec('');
    for (const type of pool) {
      if (type === 'positionIs' || type === 'positionParity') {
        // one candidate per digit position — guarantees the code can be pinned down
        for (let i = 0; i < length; i++) {
          positionIndex = i;
          const clue = { type, args: argsFor(type) };
          if (KEY_CLUE_TYPES[type].test(code, ...clue.args)) candidates.push(clue);
        }
        continue;
      }
      const args = argsFor(type);
      const clue = { type, args };
      if (KEY_CLUE_TYPES[type].test(code, ...args)) candidates.push(clue);
    }
    const chosen = [];
    const passes = (s) => chosen.every((c) => KEY_CLUE_TYPES[c.type].test(s, ...c.args));
    const poolShuffled = rng.shuffle(candidates);
    let guard = 0;
    while (allCodes.filter(passes).length > 1 && poolShuffled.length && guard++ < 300) {
      const next = poolShuffled.shift();
      if (chosen.some((c) => KEY_CLUE_TYPES[c.type].text(...c.args) === KEY_CLUE_TYPES[next.type].text(...next.args))) continue;
      chosen.push(next);
    }
    for (let i = chosen.length - 1; i >= 1; i--) {
      const removed = chosen.splice(i, 1)[0];
      if (allCodes.filter(passes).length !== 1) chosen.splice(i, 0, removed);
    }
    return {
      seed: level.seed,
      length,
      code,
      clues: chosen.map((c) => ({ type: c.type, args: c.args, text: KEY_CLUE_TYPES[c.type].text(...c.args) })),
      candidateCount: allCodes.filter(passes).length,
      hint: 'The sum narrows things fastest — then use the largest and smallest digits.'
    };
  },
  validate(p) {
    const errs = [];
    if (!/^\d+$/.test(p.code)) errs.push('code must be numeric');
    if (p.code.length !== p.length) errs.push('code length mismatch');
    if (new Set(p.code.split('')).size !== p.length) errs.push('code repeats a digit');
    if (!p.clues || p.clues.length < 2) errs.push('not enough clues');
    if (p.clues.some((c) => !KEY_CLUE_TYPES[c.type])) errs.push('unknown clue type');
    if (!p.clues.every((c) => KEY_CLUE_TYPES[c.type].test(p.code, ...c.args))) errs.push('a clue does not hold for the code');
    const all = [];
    const rec = (prefix) => {
      if (prefix.length === p.length) { all.push(prefix); return; }
      for (let dig = 0; dig <= 9; dig++) {
        if (prefix.includes(String(dig))) continue;
        rec(prefix + String(dig));
      }
    };
    rec('');
    const valid = all.filter((s) => p.clues.every((c) => KEY_CLUE_TYPES[c.type].test(s, ...c.args)));
    if (valid.length !== 1) errs.push(`${valid.length} codes satisfy the clues (need exactly 1)`);
    return errs;
  },
  solve: (p) => [{ type: p.code, into: 'answer' }],
  mount(root, p, ctx) {
    const list = el('ul', { class: 'clue-list', attrs: { 'aria-label': 'Code clues' } });
    p.clues.forEach((c) => list.appendChild(el('li', { class: 'clue', text: c.text })));
    root.appendChild(list);
    root.appendChild(promptText(`Enter the ${p.length}-digit override code.`));
    root.appendChild(answerInput({
      token: 'answer', length: p.length, numeric: true, placeholder: 'Code', ctx,
      onSubmit: (value) => (value.trim() === p.code ? ctx.solve('Override accepted.') : ctx.fail('The lock rejects that code.'))
    }));
  }
};

export const LOGIC_PUZZLES = {
  'logic.switches': logicSwitches,
  'logic.gate': logicGate,
  'logic.order': logicOrder,
  'logic.deduction': logicDeduction,
  'logic.liars': logicLiars,
  'logic.keys': logicKeys
};
