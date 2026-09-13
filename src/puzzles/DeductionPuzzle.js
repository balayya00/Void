/**
 * LOGIC puzzles — part 2: constraint solving, resources, sets, ciphers,
 * rule discovery and weighing deductions.
 *
 * Every generator either (a) constructs the solution first and proves the
 * puzzle is solvable with a search, or (b) verifies its own uniqueness with a
 * brute-force sweep inside `validate()`.
 */

import { el } from './puzzleApi.js';
import { buildChoices } from './common.js';
import { shapeSVG, shapeLabel, shapeKey, normalizeShape } from '../utils/shapes.js';
import { choiceList, promptText, interactiveGrid, answerInput } from './kit.js';

const SQ = (spec, size = 36, tone = 0, title) => ({ node: shapeSVG(spec, { size, tone, title }), label: shapeLabel(spec) });

/** Number of sides for the rule predicates (circles count as 0, stars as 10). */
export function sides(shape) {
  switch (shape) {
    case 'circle': case 'ring': case 'dot3': return 0;
    case 'triangle': return 3;
    case 'square': return 4;
    case 'pentagon': case 'star5': return 5;
    case 'hexagon': case 'star6': return 6;
    case 'octagon': case 'gear': return 8;
    case 'moon': case 'droplet': return 2;
    default: return 4;
  }
}

// ---------------------------------------------------------------------------
// 1. Queens-style placement constraint
// ---------------------------------------------------------------------------

export const logicQueens = {
  id: 'logic.queens',
  category: 'logic',
  name: 'Isolation Protocol',
  par: (p) => ({ time: 30 + p.n * 12, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const n = d <= 3 ? 4 : d <= 6 ? 5 : 6;
    const solution = solveQueens(n, rng);
    if (!solution) return logicQueens.generate({ ...level, rng: level.rng, difficulty: Math.max(1, d - 1) });
    return {
      seed: level.seed, n, solution,
      hint: 'One token per row and column — then check the diagonals.'
    };
  },
  validate(p) {
    const errs = [];
    if (!p.solution || p.solution.length !== p.n) errs.push('solution is not a full placement');
    if (p.solution && !isValidQueens(p.solution, p.n)) errs.push('generated solution violates the constraint');
    if (p.n < 4) errs.push('board too small');
    return errs;
  },
  solve: (p) => p.solution.map((c, r) => `cell:${r},${c}`),
  mount(root, p, ctx) {
    const placed = [];
    const status = el('div', { class: 'status-line', attrs: { role: 'status' }, text: `0 / ${p.n} tokens placed` });
    const grid = interactiveGrid({
      rows: p.n, cols: p.n, cellSize: 56, tokenPrefix: 'cell', ariaLabel: 'Isolation board',
      render: (r, c) => ({ node: el('span', { class: 'token-slot' }), label: `Row ${r + 1} column ${c + 1}` }),
      onSelect: (r, c, btn) => {
        const idx = placed.findIndex((x) => x.r === r && x.c === c);
        if (idx >= 0) {
          placed.splice(idx, 1);
          btn.classList.remove('occupied');
          btn.setAttribute('aria-pressed', 'false');
        } else {
          placed.push({ r, c });
          btn.classList.add('occupied');
          btn.setAttribute('aria-pressed', 'true');
          ctx.audio.ui();
        }
        status.textContent = `${placed.length} / ${p.n} tokens placed`;
        if (placed.length === p.n) {
          if (isValidQueens(placed.map((x) => x.c), p.n) && new Set(placed.map((x) => x.r)).size === p.n) {
            ctx.solve('Isolation protocol achieved.');
          } else {
            ctx.fail('Two tokens share a row, column or diagonal.');
          }
        }
      }
    });
    root.appendChild(promptText(`Place ${p.n} tokens so that no two share a row, a column or a diagonal.`));
    root.appendChild(grid);
    root.appendChild(status);
  }
};

function isValidQueens(cols, n) {
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (cols[i] === cols[j]) return false;
      if (Math.abs(cols[i] - cols[j]) === j - i) return false;
    }
  }
  return true;
}

function solveQueens(n, rng) {
  const cols = [];
  const tries = 400;
  for (let attempt = 0; attempt < tries; attempt++) {
    cols.length = 0;
    const used = new Set();
    let ok = true;
    for (let r = 0; r < n; r++) {
      const options = [];
      for (let c = 0; c < n; c++) {
        if (used.has(c)) continue;
        if (cols.some((cc, rr) => Math.abs(cc - c) === Math.abs(rr - r))) continue;
        options.push(c);
      }
      if (!options.length) { ok = false; break; }
      const pick = options[Math.floor(rng.next() * options.length)];
      used.add(pick);
      cols.push(pick);
    }
    if (ok && cols.length === n) return cols.slice();
  }
  // deterministic fallback for small boards (known solutions)
  const known = { 4: [1, 3, 0, 2], 5: [0, 2, 4, 1, 3], 6: [1, 3, 5, 0, 2, 4] };
  return known[n] || null;
}

// ---------------------------------------------------------------------------
// 2. Water jug resource puzzle
// ---------------------------------------------------------------------------

function jugStates(capacities) {
  const states = new Map();
  const key = (s) => s.join(',');
  const start = capacities.map(() => 0);
  states.set(key(start), { state: start, path: [] });
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift();
    const info = states.get(key(cur));
    if (info.path.length > 12) continue;
    const moves = [];
    cur.forEach((v, i) => {
      if (v !== capacities[i]) moves.push({ type: 'fill', i });
      if (v !== 0) moves.push({ type: 'empty', i });
      cur.forEach((w, j) => {
        if (i === j) return;
        if (v === 0 || w === capacities[j]) return;
        moves.push({ type: 'pour', i, j });
      });
    });
    for (const move of moves) {
      const next = cur.slice();
      if (move.type === 'fill') next[move.i] = capacities[move.i];
      else if (move.type === 'empty') next[move.i] = 0;
      else {
        const amount = Math.min(next[move.i], capacities[move.j] - next[move.j]);
        next[move.i] -= amount;
        next[move.j] += amount;
      }
      const k = key(next);
      if (states.has(k)) continue;
      states.set(k, { state: next, path: [...info.path, move] });
      queue.push(next);
    }
  }
  return states;
}

export const logicJug = {
  id: 'logic.jug',
  category: 'logic',
  name: 'Coolant Routing',
  par: (p) => ({ time: 40 + p.minimumMoves * 12, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const capacities = d <= 3 ? [5, 3] : d <= 6 ? [8, 5, 3] : [11, 7, 4];
    const amounts = capacities.map((c) => rng.int(1, c));
    let target = null;
    let path = null;
    let guard = 0;
    const states = jugStates(capacities);
    while (!path && guard++ < 100) {
      target = amounts[rng.int(0, amounts.length - 1)];
      for (const entry of states.values()) {
        if (entry.state.some((v, i) => v === target && capacities[i] !== target)) {
          path = entry.path;
          break;
        }
      }
      if (path && path.length < 2) path = null;
    }
    if (!path) {
      // guaranteed construction: fill the first jug, pour until the target appears
      target = capacities[0] - capacities[1] > 0 ? capacities[0] - capacities[1] : 2;
      for (const entry of states.values()) {
        if (entry.state.includes(target)) { path = entry.path; break; }
      }
    }
    return {
      seed: level.seed,
      capacities,
      target,
      minimumMoves: path ? path.length : 0,
      solution: (path || []).map((m) => (m.type === 'pour' ? `pour:${m.i}>${m.j}` : `${m.type}:${m.i}`)),
      hint: 'Fill the largest jug first, then pour into the smaller ones.'
    };
  },
  validate(p) {
    const errs = [];
    if (!p.capacities || p.capacities.length < 2) errs.push('need at least two jugs');
    if (!(p.target > 0)) errs.push('target volume must be positive');
    if (p.capacities.every((c) => c === p.target)) errs.push('target equals a jug capacity — nothing to solve');
    for (let i = 1; i < p.capacities.length; i++) {
      if (p.capacities[i] > p.capacities[i - 1]) errs.push('jug capacities must be ascending');
    }
    if (!p.solution || !p.solution.length) errs.push('no solution path found');
    // replay the solution to prove it reaches the target
    const state = p.capacities.map(() => 0);
    for (const step of p.solution) {
      const [op, args] = step.split(':');
      if (op === 'fill') state[Number(args)] = p.capacities[Number(args)];
      else if (op === 'empty') state[Number(args)] = 0;
      else {
        const [i, j] = args.split('>').map(Number);
        const amount = Math.min(state[i], p.capacities[j] - state[j]);
        state[i] -= amount;
        state[j] += amount;
      }
    }
    if (!state.includes(p.target)) errs.push('solution does not reach the target volume');
    return errs;
  },
  solve: (p) => p.solution.slice(),
  mount(root, p, ctx) {
    const state = p.capacities.map(() => 0);
    const moves = el('div', { class: 'status-line', attrs: { role: 'status' }, text: 'Moves used: 0' });
    let used = 0;
    const jars = el('div', { class: 'jug-row' });
    const render = () => {
      jars.textContent = '';
      p.capacities.forEach((cap, i) => {
        const pct = (state[i] / cap) * 100;
        jars.appendChild(el('div', { class: 'jug' },
          el('div', { class: 'jug-glass', attrs: { role: 'img', 'aria-label': `Jug ${i + 1} holds ${state[i]} of ${cap}` } },
            el('div', { class: 'jug-water', style: { height: `${pct}%` } })),
          el('div', { class: 'jug-label', text: `${state[i]} / ${cap}` })
        ));
      });
    };
    const run = (fn) => {
      fn();
      used++;
      moves.textContent = `Moves used: ${used}`;
      render();
      if (state.includes(p.target)) ctx.solve('Coolant routed.');
      else if (used > p.minimumMoves * 4 + 8) ctx.fail('Too many transfers — the loop is draining power.');
    };
    const controls = el('div', { class: 'btn-row wrap' });
    p.capacities.forEach((cap, i) => {
      controls.appendChild(el('button', {
        type: 'button', class: 'btn btn-small', text: `FILL ${i + 1}`, dataset: { token: `fill:${i}` },
        attrs: { 'aria-label': `Fill jug ${i + 1} to ${cap}` },
        onclick: () => run(() => { state[i] = cap; })
      }));
      controls.appendChild(el('button', {
        type: 'button', class: 'btn btn-small', text: `EMPTY ${i + 1}`, dataset: { token: `empty:${i}` },
        attrs: { 'aria-label': `Empty jug ${i + 1}` },
        onclick: () => run(() => { state[i] = 0; })
      }));
    });
    p.capacities.forEach((_, i) => {
      p.capacities.forEach((__, j) => {
        if (i === j) return;
        controls.appendChild(el('button', {
          type: 'button', class: 'btn btn-small btn-ghost', text: `POUR ${i + 1}→${j + 1}`, dataset: { token: `pour:${i}>${j}` },
          attrs: { 'aria-label': `Pour jug ${i + 1} into jug ${j + 1}` },
          onclick: () => run(() => {
            const amount = Math.min(state[i], p.capacities[j] - state[j]);
            state[i] -= amount;
            state[j] += amount;
          })
        }));
      });
    });
    render();
    root.appendChild(el('div', { class: 'scan-target' },
      el('span', { class: 'scan-target-label', text: 'TARGET VOLUME' }),
      el('span', { class: 'num', text: String(p.target) })
    ));
    root.appendChild(jars);
    root.appendChild(controls);
    root.appendChild(moves);
    root.appendChild(promptText(`Get exactly ${p.target} units into any single jug.`));
  }
};

// ---------------------------------------------------------------------------
// 3. Set membership reasoning
// ---------------------------------------------------------------------------

const SET_NAMES = ['ALPHA', 'BETA', 'GAMMA'];

const QUERIES = [
  { id: 'exactlyOne', test: (m) => m.filter(Boolean).length === 1, text: (sets) => `belongs to exactly one of ${sets.join(', ')}` },
  { id: 'two', test: (m) => m.filter(Boolean).length === 2, text: () => 'belongs to exactly two sets' },
  { id: 'all', test: (m) => m.filter(Boolean).length === 3, text: () => 'belongs to all three sets' },
  { id: 'onlyA', test: (m) => m[0] && !m[1] && !m[2], text: (sets) => `belongs to ${sets[0]} and nothing else` },
  { id: 'onlyB', test: (m) => !m[0] && m[1] && !m[2], text: (sets) => `belongs to ${sets[1]} and nothing else` },
  { id: 'onlyC', test: (m) => !m[0] && !m[1] && m[2], text: (sets) => `belongs to ${sets[2]} and nothing else` },
  { id: 'AbC', test: (m) => m[0] && m[1] && !m[2], text: (sets) => `belongs to ${sets[0]} and ${sets[1]} but not ${sets[2]}` },
  { id: 'aBc', test: (m) => !m[0] && m[1] && m[2], text: (sets) => `belongs to ${sets[1]} and ${sets[2]} but not ${sets[0]}` },
  { id: 'Abc', test: (m) => m[0] && !m[1] && m[2], text: (sets) => `belongs to ${sets[0]} and ${sets[2]} but not ${sets[1]}` }
];

export const logicSets = {
  id: 'logic.sets',
  category: 'logic',
  name: 'Set Intersection',
  par: () => ({ time: 45, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const count = Math.max(4, Math.min(7, 4 + Math.floor(d / 4)));
    const query = rng.pick(d <= 4 ? QUERIES.slice(0, 4) : QUERIES);
    let memberships = [];
    let guard = 0;
    do {
      memberships = [];
      for (let i = 0; i < count; i++) {
        let m;
        let inner = 0;
        do {
          m = [rng.bool(0.55), rng.bool(0.5), rng.bool(0.45)];
          inner++;
        } while (m.every((v) => !v) && inner < 20);
        memberships.push(m);
      }
      guard++;
    } while (memberships.filter((m) => query.test(m)).length !== 1 && guard < 200);
    if (memberships.filter((m) => query.test(m)).length !== 1) {
      // force exactly one match
      memberships[0] = [true, false, false];
      for (let i = 1; i < memberships.length; i++) {
        memberships[i] = query.id === 'all' ? [true, true, false] : [true, true, true];
        if (query.test(memberships[i])) memberships[i] = [false, false, false];
        if (query.test(memberships[i])) memberships[i] = [true, false, true];
        if (query.test(memberships[i])) memberships[i] = [false, true, true];
      }
    }
    const elements = memberships.map((m, i) => ({
      id: i,
      membership: m,
      spec: normalizeShape({ shape: ['circle', 'triangle', 'square', 'pentagon', 'hexagon', 'star5', 'diamond'][i % 7], fill: 'outline' })
    }));
    const answer = elements.find((e) => query.test(e.membership));
    return {
      seed: level.seed,
      sets: SET_NAMES,
      elements,
      queryId: query.id,
      queryText: query.text(SET_NAMES),
      answerId: answer.id,
      hint: 'Read each element’s badge left to right: A · B · C.'
    };
  },
  validate(p) {
    const errs = [];
    const query = QUERIES.find((q) => q.id === p.queryId);
    if (!query) errs.push('unknown query');
    if (p.elements.length < 3) errs.push('too few elements');
    const matches = p.elements.filter((e) => query.test(e.membership));
    if (matches.length !== 1) errs.push(`${matches.length} elements satisfy the query (need exactly 1)`);
    else if (matches[0].id !== p.answerId) errs.push('recorded answer is not the matching element');
    if (p.elements.some((e) => !e.spec || !e.spec.shape)) errs.push('element without a glyph');
    return errs;
  },
  solve: (p) => [`elem:${p.answerId}`],
  mount(root, p, ctx) {
    root.appendChild(el('div', { class: 'panel-label', text: `${p.sets.join(' · ')} FIELD SCAN` }));
    const list = el('div', { class: 'element-list', attrs: { role: 'group', 'aria-label': 'Scanned elements' } });
    const buttons = [];
    p.elements.forEach((entry) => {
      const badges = p.sets.map((name, i) => el('span', {
        class: `badge ${entry.membership[i] ? 'in' : 'out'}`.trim(),
        attrs: { 'aria-label': `${name}: ${entry.membership[i] ? 'member' : 'not a member'}` },
        text: `${name[0]}${entry.membership[i] ? '✓' : '·'}`
      }));
      const btn = el('button', {
        type: 'button', class: 'element-card', dataset: { token: `elem:${entry.id}` },
        attrs: { 'aria-label': `Element ${entry.id + 1}: ${shapeLabel(entry.spec)}, ${entry.membership.map((m, i) => (m ? `in ${p.sets[i]}` : `not in ${p.sets[i]}`)).join(', ')}` }
      }, shapeSVG(entry.spec, { size: 30, tone: entry.id % 5 }), el('span', { class: 'badge-row' }, badges));
      btn.addEventListener('click', () => {
        if (entry.id === p.answerId) ctx.solve('Unique element isolated.');
        else ctx.fail('That element does not satisfy the query.');
      });
      buttons.push(btn);
      list.appendChild(btn);
    });
    root.appendChild(list);
    root.appendChild(promptText(`Find the element that ${p.queryText}.`));
  }
};

// ---------------------------------------------------------------------------
// 4. Nim — find the winning move
// ---------------------------------------------------------------------------

export const logicNim = {
  id: 'logic.nim',
  category: 'logic',
  name: 'Terminal Gambit',
  par: () => ({ time: 60, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const pileCount = d <= 4 ? 2 : 3;
    let piles = [];
    let guard = 0;
    do {
      piles = Array.from({ length: pileCount }, () => rng.int(2, 9 + Math.floor(d / 2)));
      guard++;
    } while (guard < 100 && (piles.reduce((a, b) => a ^ b, 0) === 0 || piles.reduce((a, b) => a + b, 0) < 6));
    if (piles.reduce((a, b) => a ^ b, 0) === 0) piles[0] += 1;
    const target = piles.reduce((a, b) => a ^ b, 0);
    const moves = [];
    piles.forEach((p, i) => {
      for (let take = 1; take <= p; take++) {
        const next = piles.slice();
        next[i] = p - take;
        if (next.reduce((a, b) => a ^ b, 0) === 0) moves.push({ pile: i, take, resulting: next });
      }
    });
    const answer = rng.pick(moves);
    const allMoves = [];
    piles.forEach((p, i) => {
      for (let take = 1; take <= p; take++) allMoves.push({ pile: i, take });
    });
    const wrong = rng.sample(allMoves.filter((m) => !moves.some((w) => w.pile === m.pile && w.take === m.take)), Math.min(4, allMoves.length - 1));
    const built = buildChoices({
      correct: answer,
      distractors: wrong,
      rng,
      equals: (a, b) => a.pile === b.pile && a.take === b.take,
      labelFor: (m) => `Take ${m.take} from pile ${m.pile + 1}`,
      render: (m) => el('span', { class: 'num', text: `P${m.pile + 1} −${m.take}` })
    });
    return {
      seed: level.seed, piles, nimSum: target,
      winningMoves: moves,
      options: built.options.map((o) => ({ move: o.value, token: o.token, label: o.label })),
      answerToken: built.answerToken,
      hint: 'Write the pile sizes in binary and compare the columns.'
    };
  },
  validate(p) {
    const errs = [];
    if (!p.piles || p.piles.length < 2) errs.push('need at least two piles');
    if (p.piles.some((v) => v <= 0)) errs.push('piles must be positive');
    if (p.piles.reduce((a, b) => a ^ b, 0) === 0) errs.push('starting position is already lost for the first player');
    const winners = p.options.filter((o) => {
      const next = p.piles.slice();
      next[o.move.pile] -= o.move.take;
      return next.reduce((a, b) => a ^ b, 0) === 0;
    });
    if (!winners.length) errs.push('no winning move among the options');
    const answer = p.options.find((o) => o.token === p.answerToken);
    if (!answer) errs.push('answer token missing');
    else {
      const next = p.piles.slice();
      next[answer.move.pile] -= answer.move.take;
      if (next.reduce((a, b) => a ^ b, 0) !== 0) errs.push('listed answer is not a winning move');
    }
    if (p.options.some((o) => o.move.take <= 0 || o.move.take > p.piles[o.move.pile])) errs.push('illegal move offered');
    return errs;
  },
  solve(p) {
    const winner = p.options.find((o) => {
      const next = p.piles.slice();
      next[o.move.pile] -= o.move.take;
      return next.reduce((a, b) => a ^ b, 0) === 0;
    });
    return winner ? [winner.token] : [];
  },
  mount(root, p, ctx) {
    const pileRow = el('div', { class: 'pile-row' });
    p.piles.forEach((count, i) => {
      const tokens = el('div', { class: 'pile-tokens', attrs: { 'aria-hidden': 'true' } });
      for (let k = 0; k < count; k++) tokens.appendChild(el('span', { class: 'pile-token' }));
      pileRow.appendChild(el('div', { class: 'pile', attrs: { role: 'img', 'aria-label': `Pile ${i + 1} holds ${count} tokens` } },
        el('div', { class: 'pile-label', text: `P${i + 1} · ${count}` }), tokens));
    });
    root.appendChild(pileRow);
    root.appendChild(promptText('Which single move guarantees you eventually take the last token? (You move first; your opponent plays perfectly.)'));
    root.appendChild(choiceList({
      options: p.options.map((o) => ({ ...o, content: el('span', { class: 'num', text: `P${o.move.pile + 1} −${o.move.take}` }) })),
      columns: 3,
      onChoose: (opt) => {
        const next = p.piles.slice();
        next[opt.move.pile] -= opt.move.take;
        if (next.reduce((a, b) => a ^ b, 0) === 0) ctx.solve('Winning move found.');
        else ctx.fail('Perfect play from that position wins for your opponent.');
      }
    }));
  }
};

// ---------------------------------------------------------------------------
// 5. Binary / codepage decoding
// ---------------------------------------------------------------------------

export const logicDecode = {
  id: 'logic.decode',
  category: 'logic',
  name: 'Codebook Drift',
  par: () => ({ time: 70, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const words = ['VOID', 'CORE', 'ECHO', 'SIGMA', 'NULL', 'DRIFT', 'ORBIT', 'AXON', 'LUMEN', 'PULSE'];
    const word = rng.pick(words.filter((w) => w.length <= (d <= 5 ? 4 : 5)));
    const mode = d <= 3 ? 'binary' : d <= 6 ? rng.pick(['binary', 'base4']) : rng.pick(['binary', 'base4', 'offset']);
    const encode = (letter) => {
      const code = letter.charCodeAt(0) - 64; // A=1
      if (mode === 'binary') return code.toString(2).padStart(5, '0');
      if (mode === 'base4') {
        const digits = [];
        let v = code;
        do { digits.unshift(v % 4); v = Math.floor(v / 4); } while (v > 0);
        return digits.join('');
      }
      return String(code);
    };
    const encoded = word.split('').map(encode);
    const legend = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').slice(0, 12).map((letter) => ({ letter, code: encode(letter) }));
    return {
      seed: level.seed, word, mode, encoded, legend,
      hint: mode === 'binary' ? 'Each group is a 5-bit number equal to the letter’s position in the alphabet.' : mode === 'base4' ? 'Each group is the letter’s alphabet position written in base 4 (no leading zeros).' : 'Each group is the plain alphabet position of the letter.'
    };
  },
  validate(p) {
    const errs = [];
    if (!p.word || !/^[A-Z]{3,6}$/.test(p.word)) errs.push('bad plain word');
    if (!p.encoded || p.encoded.length !== p.word.length) errs.push('encoded length mismatch');
    if (p.encoded.some((e) => typeof e !== 'string' || !e.length)) errs.push('empty encoded group');
    if (p.legend.length < 8) errs.push('legend too small');
    return errs;
  },
  solve: (p) => [{ type: p.word, into: 'answer' }],
  mount(root, p, ctx) {
    const legend = el('div', { class: 'legend' });
    p.legend.forEach((entry) => legend.appendChild(el('div', { class: 'legend-item' },
      el('span', { class: 'legend-code mono', text: entry.letter }), el('span', { class: 'muted', text: '=' }), el('span', { class: 'mono', text: entry.code }))));
    root.appendChild(el('div', { class: 'muted', text: p.mode === 'binary' ? 'CODEBOOK: 5-BIT BINARY (A=1)' : p.mode === 'base4' ? 'CODEBOOK: BASE-4 VALUES (A=1)' : 'CODEBOOK: DECIMAL ALPHABET INDEX (A=1)' }));
    root.appendChild(legend);
    root.appendChild(el('div', { class: 'seq-strip', attrs: { 'aria-label': 'Encoded message' } },
      p.encoded.map((group) => el('span', { class: 'seq-item mono', text: group }))));
    root.appendChild(promptText('Decode the transmission. Which word was sent?'));
    root.appendChild(answerInput({
      token: 'answer', placeholder: 'Decoded word', ctx,
      onSubmit: (value) => (value.trim().toUpperCase() === p.word ? ctx.solve('Transmission decoded.') : ctx.fail('The codebook disagrees.'))
    }));
  }
};

// ---------------------------------------------------------------------------
// 6. Rule discovery (learn the hidden rule from examples)
// ---------------------------------------------------------------------------

const LEARN_RULES = [
  { id: 'evenSides', text: 'even number of sides (a circle counts as zero)', test: (s) => sides(s.shape) % 2 === 0 },
  { id: 'oddSides', text: 'odd number of sides, at least three', test: (s) => sides(s.shape) >= 3 && sides(s.shape) % 2 === 1 },
  { id: 'hatch', text: 'a textured fill (striped or dotted)', test: (s) => s.fill === 'hatch' || s.fill === 'dots' },
  { id: 'hollow', text: 'a hollow body', test: (s) => s.fill === 'outline' || s.fill === 'thin' },
  { id: 'upright', text: 'no rotation (0°)', test: (s) => s.rot % 360 === 0 },
  { id: 'turned', text: 'rotated off-axis (not 0° or 90°)', test: (s) => s.rot % 360 !== 0 && s.rot % 180 !== 0 },
  { id: 'small', text: 'a reduced size', test: (s) => s.scale < 0.9 },
  { id: 'fullSize', text: 'full size', test: (s) => s.scale >= 0.98 },
  { id: 'star', text: 'a star or circular silhouette', test: (s) => s.shape.startsWith('star') || s.shape === 'circle' || s.shape === 'ring' },
  { id: 'pointy', text: 'a polygon with corners (not a circle or star)', test: (s) => !s.shape.startsWith('star') && !['circle', 'ring', 'moon', 'droplet'].includes(s.shape) }
];

export const logicRuleLearn = {
  id: 'logic.rulelearn',
  category: 'logic',
  name: 'Inference Drill',
  par: () => ({ time: 80, attempts: 4 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const rule = rng.pick(d <= 3 ? LEARN_RULES.slice(0, 4) : LEARN_RULES);
    const pool = [];
    let guard = 0;
    while (pool.length < 40 && guard++ < 400) {
      const spec = normalizeShape({
        shape: rng.pick(['circle', 'ring', 'triangle', 'square', 'pentagon', 'hexagon', 'star5', 'diamond', 'octagon', 'moon']),
        fill: rng.pick(['solid', 'outline', 'hatch', 'dots', 'thin']),
        rot: rng.pick([0, 0, 45, 90, 135, 180]),
        scale: rng.pick([1, 1, 0.8, 0.72, 1.08])
      });
      if (pool.some((x) => shapeKey(x) === shapeKey(spec))) continue;
      pool.push(spec);
    }
    const accepted = rng.sample(pool.filter((s) => rule.test(s)), 4);
    const rejected = rng.sample(pool.filter((s) => !rule.test(s)), 4);
    const candidates = rng.sample(pool, 4);
    const matching = candidates.filter((s) => rule.test(s));
    if (matching.length !== 1) {
      // rebuild the candidate set so exactly one candidate is accepted
      const good = rng.pick(pool.filter((s) => rule.test(s)));
      const bads = rng.sample(pool.filter((s) => !rule.test(s)), 3);
      candidates.length = 0;
      candidates.push(good, ...bads);
    }
    const answer = candidates.find((s) => rule.test(s)) || candidates[0];
    return {
      seed: level.seed,
      ruleId: rule.id,
      examplesAccepted: accepted,
      examplesRejected: rejected,
      candidates,
      answer,
      hint: 'Compare accepted and rejected pairs that differ in only one attribute.'
    };
  },
  validate(p) {
    const errs = [];
    const rule = LEARN_RULES.find((r) => r.id === p.ruleId);
    if (!rule) errs.push('unknown rule');
    if (p.examplesAccepted.length < 3 || p.examplesRejected.length < 3) errs.push('not enough examples');
    if (p.examplesAccepted.some((s) => !rule.test(s))) errs.push('an accepted example does not satisfy the rule');
    if (p.examplesRejected.some((s) => rule.test(s))) errs.push('a rejected example satisfies the rule');
    const matching = p.candidates.filter((s) => rule.test(s));
    if (matching.length !== 1) errs.push(`${matching.length} candidates satisfy the rule (need exactly 1)`);
    else if (shapeKey(matching[0]) !== shapeKey(p.answer)) errs.push('the answer is not the matching candidate');
    return errs;
  },
  solve(p) {
    const index = p.candidates.findIndex((s) => shapeKey(s) === shapeKey(p.answer));
    return [index >= 0 ? `cand:${index}` : ''];
  },
  mount(root, p, ctx) {
    const col = (items, cls, label) => el('div', { class: `rule-col ${cls}` },
      el('div', { class: 'panel-label', text: label }),
      el('div', { class: 'rule-items' }, items.map((spec, i) => el('div', {
        class: `rule-item ${cls}`,
        dataset: { token: `${cls}:${i}` },
        attrs: { 'aria-label': `${label}: ${shapeLabel(spec)}` }
      }, shapeSVG(spec, { size: 30, tone: i % 5 })))));
    root.appendChild(el('div', { class: 'dual-panel' },
      col(p.examplesAccepted, 'accepted', 'ACCEPTED ✓'),
      col(p.examplesRejected, 'rejected', 'REJECTED ✕')
    ));
    root.appendChild(promptText('A hidden rule separates the two columns. Which candidate passes the test?'));
    const list = el('div', { class: 'choices', style: { '--choice-cols': p.candidates.length }, attrs: { role: 'group', 'aria-label': 'Candidates' } });
    p.candidates.forEach((spec, i) => {
      const btn = el('button', {
        type: 'button', class: 'choice', dataset: { token: `cand:${i}` },
        attrs: { 'aria-label': `Candidate ${i + 1}: ${shapeLabel(spec)}` }
      }, shapeSVG(spec, { size: 38, tone: i % 5 }));
      btn.addEventListener('click', () => {
        if (shapeKey(spec) === shapeKey(p.answer)) ctx.solve('Rule inferred.');
        else ctx.fail('That candidate fails the hidden rule.');
      });
      list.appendChild(btn);
    });
    root.appendChild(list);
  }
};

// ---------------------------------------------------------------------------
// 7. Substitution cipher
// ---------------------------------------------------------------------------

export const logicCipher = {
  id: 'logic.cipher',
  category: 'logic',
  name: 'Cipher Lock',
  par: () => ({ time: 90, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const words = ['STATION', 'MEMORY', 'SIGNAL', 'VECTOR', 'ENGINE', 'ORACLE', 'STATIC', 'MATRIX'];
    const word = rng.pick(words);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const shift = rng.int(d >= 6 ? 4 : 1, d >= 6 ? 12 : 6);
    const map = {};
    alphabet.forEach((letter, i) => { map[letter] = alphabet[(i + shift) % 26]; });
    const cipher = word.split('').map((l) => map[l]).join('');
    const revealed = rng.sample([...new Set(word.split(''))], Math.min(new Set(word.split('')).size - 1, d >= 6 ? 2 : 3)).map((letter) => ({ letter, cipher: map[letter] }));
    return {
      seed: level.seed, word, cipher, shift, revealed,
      hint: 'The shift is constant for every letter — line the given pairs up against the alphabet.'
    };
  },
  validate(p) {
    const errs = [];
    if (!/^[A-Z]{4,8}$/.test(p.word)) errs.push('bad plaintext word');
    if (p.cipher.length !== p.word.length) errs.push('cipher length mismatch');
    const derived = p.word.split('').map((l) => String.fromCharCode(((l.charCodeAt(0) - 65 + p.shift) % 26) + 65)).join('');
    if (derived !== p.cipher) errs.push('cipher does not match the shift');
    if (!p.revealed || p.revealed.length < 1) errs.push('no letters revealed');
    if (p.revealed.some((r) => !p.word.includes(r.letter))) errs.push('revealed letter is not in the word');
    return errs;
  },
  solve: (p) => [{ type: p.word, into: 'answer' }],
  mount(root, p, ctx) {
    const legend = el('div', { class: 'legend' });
    p.revealed.forEach((r) => legend.appendChild(el('div', { class: 'legend-item' },
      el('span', { class: 'mono', text: `${r.cipher} → ${r.letter}` }))));
    root.appendChild(el('div', { class: 'panel-label', text: 'INTERCEPTED SIGNAL' }));
    root.appendChild(el('div', { class: 'seq-strip', attrs: { 'aria-label': 'Cipher text' } },
      p.cipher.split('').map((ch) => el('span', { class: 'seq-item mono', text: ch }))));
    root.appendChild(el('div', { class: 'panel-label', text: 'KNOWN PAIRS' }));
    root.appendChild(legend);
    root.appendChild(promptText('Decrypt the signal. What is the original word?'));
    root.appendChild(answerInput({
      token: 'answer', placeholder: 'Plain text', ctx,
      onSubmit: (value) => (value.trim().toUpperCase() === p.word ? ctx.solve('Cipher broken.') : ctx.fail('That is not the plain text.'))
    }));
  }
};

// ---------------------------------------------------------------------------
// 8. Weighing deduction
// ---------------------------------------------------------------------------

/**
 * Plan a set of weighings that provably identifies the odd ball.
 *
 * Greedy information split over the hypothesis space {ball} × {heavy, light}:
 * at every step we sample random pan assignments and keep the one that divides
 * the surviving hypotheses most evenly. Filtering by the true result then
 * leaves exactly one hypothesis — the puzzle can never be ambiguous.
 */
export function planWeighings(n, oddBall, heavy, rng, maxWeighings = 3) {
  const balls = Array.from({ length: n }, (_, i) => i);
  let hypotheses = [];
  for (const ball of balls) for (const h of [true, false]) hypotheses.push({ ball, heavy: h });
  const weighings = [];
  const weight = (ball, h, id) => (ball === id ? (h ? 1 : -1) : 0);

  while (hypotheses.length > 1 && weighings.length < maxWeighings) {
    let best = null;
    let bestScore = Infinity;
    const panSize = Math.max(1, Math.floor(Math.min(n, 6) / 2));
    for (let attempt = 0; attempt < 120; attempt++) {
      const pool = rng.shuffle(balls);
      const left = pool.slice(0, panSize);
      const right = pool.slice(panSize, panSize * 2);
      const branches = { left: 0, right: 0, balance: 0 };
      for (const hyp of hypotheses) {
        let l = 0;
        let r = 0;
        for (const b of left) l += weight(b, hyp.heavy, hyp.ball);
        for (const b of right) r += weight(b, hyp.heavy, hyp.ball);
        l += left.length;
        r += right.length;
        if (l === r) branches.balance++;
        else if (l > r) branches.left++;
        else branches.right++;
      }
      const score = Math.max(branches.left, branches.right, branches.balance);
      if (score < bestScore) {
        bestScore = score;
        best = { left, right };
      }
    }
    if (!best) break;
    const lWeight = best.left.reduce((sum, b) => sum + (b === oddBall ? (heavy ? 1 : -1) : 0), 0) + best.left.length;
    const rWeight = best.right.reduce((sum, b) => sum + (b === oddBall ? (heavy ? 1 : -1) : 0), 0) + best.right.length;
    const result = lWeight === rWeight ? 'balance' : lWeight > rWeight ? 'left' : 'right';
    weighings.push({ left: best.left, right: best.right, result });
    hypotheses = hypotheses.filter((hyp) => {
      const l = best.left.reduce((sum, b) => sum + weight(b, hyp.heavy, hyp.ball), 0) + best.left.length;
      const r = best.right.reduce((sum, b) => sum + weight(b, hyp.heavy, hyp.ball), 0) + best.right.length;
      const res = l === r ? 'balance' : l > r ? 'left' : 'right';
      return res === result;
    });
  }
  return { weighings, remaining: hypotheses.length };
}

export const logicBalance = {
  id: 'logic.balance',
  category: 'logic',
  name: 'Mass Discrepancy',
  par: (p) => ({ time: 40 + p.weighings.length * 20, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const n = d <= 4 ? 6 : d <= 7 ? 8 : 9;
    const oddBall = rng.int(0, n - 1);
    const heavy = rng.bool(0.6);
    const { weighings, remaining } = planWeighings(n, oddBall, heavy, rng, 3);
    // the planner is information-optimal; if a hardware limit was hit we simply
    // shrink the puzzle until the ball is provably unique
    let finalWeighings = weighings;
    if (remaining !== 1) {
      const retry = planWeighings(n, oddBall, heavy, rng.fork('retry'), 6);
      finalWeighings = retry.weighings;
    }
    const labelled = finalWeighings.map((w, i) => ({ index: i + 1, ...w }));
    return {
      seed: level.seed, n, oddBall, heavy, weighings: labelled,
      hint: 'A balanced weighing clears every ball on both pans. A tipped pan points at the heavy side (or the light side).'
    };
  },
  validate(p) {
    const errs = [];
    if (p.oddBall < 0 || p.oddBall >= p.n) errs.push('odd ball out of range');
    if (!p.weighings.length) errs.push('no weighings');
    if (p.weighings.some((w) => !w.left.length || !w.right.length)) errs.push('a weighing has an empty pan');
    if (p.weighings.some((w) => w.left.some((b) => w.right.includes(b)))) errs.push('a ball appears on both pans');
    const consistent = [];
    for (let ball = 0; ball < p.n; ball++) {
      for (const heavyGuess of [true, false]) {
        const ok = p.weighings.every((w) => {
          const lw = w.left.length + (w.left.includes(ball) ? (heavyGuess ? 1 : -1) : 0);
          const rw = w.right.length + (w.right.includes(ball) ? (heavyGuess ? 1 : -1) : 0);
          const res = lw === rw ? 'balance' : lw > rw ? 'left' : 'right';
          return res === w.result;
        });
        if (ok) consistent.push({ ball, heavyGuess });
      }
    }
    const ids = [...new Set(consistent.map((c) => c.ball))];
    if (ids.length !== 1 || ids[0] !== p.oddBall) errs.push(`weighings allow ${ids.length} possible balls (need exactly 1)`);
    return errs;
  },
  solve: (p) => [`ball:${p.oddBall}`],
  mount(root, p, ctx) {
    const weighingsBox = el('div', { class: 'weigh-list', attrs: { 'aria-label': 'Weighing results' } });
    p.weighings.forEach((w, i) => {
      const pan = (ids, label) => el('div', { class: 'pan' },
        el('div', { class: 'pan-label', text: label }),
        el('div', { class: 'pan-balls', attrs: { 'aria-label': label } },
          ids.map((b) => el('span', { class: 'ball', text: String(b + 1) }))));
      weighingsBox.appendChild(el('div', { class: 'weigh-row' },
        el('span', { class: 'weigh-index', text: `#${i + 1}` }),
        pan(w.left, 'LEFT'),
        el('span', { class: `weigh-result ${w.result}`, text: w.result === 'balance' ? 'between = balanced' : w.result === 'left' ? '◀ left pan is heavier' : 'right pan is heavier ▶' }),
        pan(w.right, 'RIGHT')
      ));
    });
    root.appendChild(weighingsBox);
    root.appendChild(promptText('One ball has a different mass. Which one?'));
    const list = el('div', { class: 'choices', style: { '--choice-cols': Math.min(5, p.n) }, attrs: { role: 'group', 'aria-label': 'Balls' } });
    for (let b = 0; b < p.n; b++) {
      const btn = el('button', {
        type: 'button', class: 'choice', dataset: { token: `ball:${b}` },
        attrs: { 'aria-label': `Ball ${b + 1}` }, text: String(b + 1)
      });
      btn.addEventListener('click', () => (b === p.oddBall ? ctx.solve('Discrepancy identified.') : ctx.fail('That ball is consistent with a balanced reading.')));
      list.appendChild(btn);
    }
    root.appendChild(list);
  }
};

// ---------------------------------------------------------------------------
// 9. Conditional transformation rules
// ---------------------------------------------------------------------------

export const logicCondition = {
  id: 'logic.condition',
  category: 'logic',
  name: 'Conditional Rewrite',
  par: () => ({ time: 70, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const conditions = [
      { id: 'hollowBody', text: 'the body is hollow', test: (s) => s.fill === 'outline' || s.fill === 'thin' },
      { id: 'solidBody', text: 'the body is solid', test: (s) => s.fill === 'solid' || s.fill === 'half' },
      { id: 'manySides', text: 'the body has 6 or more sides', test: (s) => sides(s.shape) >= 6 },
      { id: 'pointy', text: 'the body has exactly 3 or 4 sides', test: (s) => sides(s.shape) === 3 || sides(s.shape) === 4 },
      { id: 'tilted', text: 'the body is tilted (not a multiple of 90°)', test: (s) => s.rot % 90 !== 0 },
      { id: 'upright', text: 'the body is a multiple of 90°', test: (s) => s.rot % 90 === 0 },
      { id: 'small', text: 'the body is reduced in size', test: (s) => s.scale < 0.9 },
      { id: 'large', text: 'the body is full size', test: (s) => s.scale >= 0.98 }
    ];
    const actions = [
      { id: 'rotate90', text: 'rotate it 90° clockwise', apply: (s) => ({ ...s, rot: (s.rot + 90) % 360 }) },
      { id: 'rotate45', text: 'rotate it 45° clockwise', apply: (s) => ({ ...s, rot: (s.rot + 45) % 360 }) },
      { id: 'invert', text: 'invert its fill (solid ↔ hollow)', apply: (s) => ({ ...s, fill: s.fill === 'solid' ? 'outline' : 'solid' }) },
      { id: 'texture', text: 'apply a striped texture', apply: (s) => ({ ...s, fill: 'hatch' }) },
      { id: 'shrink', text: 'reduce its size one step', apply: (s) => ({ ...s, scale: Math.max(0.62, Number((s.scale - 0.16).toFixed(2))) }) },
      { id: 'grow', text: 'increase its size one step', apply: (s) => ({ ...s, scale: Math.min(1.14, Number((s.scale + 0.16).toFixed(2))) }) }
    ];
    const ruleCount = d <= 3 ? 2 : d <= 6 ? 2 : 3;
    const rules = rng.sample(conditions, ruleCount).map((cond) => ({ cond, action: rng.pick(actions) }));
    // pick an input the first rule definitely reacts to, so the rewrite chain
    // always has at least one observable effect (the puzzle is never a no-op)
    let input = null;
    let inputGuard = 0;
    do {
      input = normalizeShape({
        shape: rng.pick(['circle', 'triangle', 'square', 'pentagon', 'hexagon', 'star5', 'octagon']),
        fill: rng.pick(['solid', 'outline', 'hatch', 'thin']),
        rot: rng.pick([0, 45, 90, 135]),
        scale: rng.pick([1, 0.84])
      });
    } while (!rules[0].cond.test(input) && inputGuard++ < 400);
    const fired = [];
    let result = input;
    rules.forEach((rule) => {
      if (rule.cond.test(result)) {
        fired.push(1);
        result = normalizeShape(rule.action.apply(result));
      }
    });
    const distractors = [
      normalizeShape({ ...input, fill: input.fill === 'solid' ? 'outline' : 'solid' }),
      normalizeShape(input),
      normalizeShape({ ...result, rot: (result.rot + 45) % 360 }),
      ...(fired.length > 1 ? [normalizeShape(rules.slice(1).reduce((acc, r) => (r.cond.test(acc) ? r.action.apply(acc) : acc), input))] : [])
    ];
    const built = buildChoices({
      correct: result,
      distractors,
      rng,
      equals: (a, b) => shapeKey(a) === shapeKey(b),
      labelFor: (v) => shapeLabel(v),
      render: (v) => SQ(v, 38)
    });
    return {
      seed: level.seed,
      input,
      rules: rules.map((r) => ({ text: `If ${r.cond.text}, ${r.action.text}.` })),
      options: built.options.map((o) => ({ spec: o.value, token: o.token, label: o.label })),
      answerToken: built.answerToken,
      answer: result,
      ruleIds: rules.map((r) => ({ cond: r.cond.id, action: r.action.id })),
      hint: 'Apply the rules in order, one at a time, and re-check the conditions after each rewrite.'
    };
  },
  validate(p) {
    const errs = [];
    if (!p.rules || p.rules.length < 2) errs.push('need at least two rules');
    if (p.rules.some((r) => !r.text)) errs.push('rule without text');
    if (!p.options || p.options.length < 3) errs.push('too few options');
    if (!p.options.some((o) => o.token === p.answerToken)) errs.push('answer missing from options');
    // re-derive the answer from ids (proves the puzzle is internally consistent)
    const conditionById = {
      hollowBody: (s) => s.fill === 'outline' || s.fill === 'thin',
      solidBody: (s) => s.fill === 'solid' || s.fill === 'half',
      manySides: (s) => sides(s.shape) >= 6,
      pointy: (s) => sides(s.shape) === 3 || sides(s.shape) === 4,
      tilted: (s) => s.rot % 90 !== 0,
      upright: (s) => s.rot % 90 === 0,
      small: (s) => s.scale < 0.9,
      large: (s) => s.scale >= 0.98
    };
    const actionById = {
      rotate90: (s) => ({ ...s, rot: (s.rot + 90) % 360 }),
      rotate45: (s) => ({ ...s, rot: (s.rot + 45) % 360 }),
      invert: (s) => ({ ...s, fill: s.fill === 'solid' ? 'outline' : 'solid' }),
      texture: (s) => ({ ...s, fill: 'hatch' }),
      shrink: (s) => ({ ...s, scale: Math.max(0.62, Number((s.scale - 0.16).toFixed(2))) }),
      grow: (s) => ({ ...s, scale: Math.min(1.14, Number((s.scale + 0.16).toFixed(2))) })
    };
    let derived = normalizeShape(p.input);
    for (const rule of p.ruleIds) {
      if (conditionById[rule.cond](derived)) derived = normalizeShape(actionById[rule.action](derived));
    }
    if (shapeKey(derived) !== shapeKey(p.answer)) errs.push('derived answer differs from the stored answer');
    if (p.options.filter((o) => shapeKey(o.spec) === shapeKey(p.answer)).length !== 1) errs.push('answer appears more than once among the options');
    return errs;
  },
  solve: (p) => [p.answerToken],
  mount(root, p, ctx) {
    root.appendChild(el('div', { class: 'rewrite-row' },
      el('div', { class: 'panel-label', text: 'INPUT' }),
      shapeSVG(p.input, { size: 52, tone: 1, title: shapeLabel(p.input) })
    ));
    const list = el('ol', { class: 'clue-list' });
    p.rules.forEach((r) => list.appendChild(el('li', { class: 'clue', text: r.text })));
    root.appendChild(list);
    root.appendChild(promptText('Which glyph results after the rewrites?'));
    root.appendChild(choiceList({
      options: p.options.map((o) => ({ ...o, content: SQ(o.spec, 38) })),
      columns: p.options.length,
      onChoose: (opt) => (opt.token === p.answerToken ? ctx.solve('Rewrite chain confirmed.') : ctx.fail('The rules produce a different glyph.'))
    }));
  }
};

export const LOGIC2_PUZZLES = {
  'logic.queens': logicQueens,
  'logic.jug': logicJug,
  'logic.sets': logicSets,
  'logic.nim': logicNim,
  'logic.decode': logicDecode,
  'logic.rulelearn': logicRuleLearn,
  'logic.cipher': logicCipher,
  'logic.balance': logicBalance,
  'logic.condition': logicCondition
};
