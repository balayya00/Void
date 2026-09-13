/** Grid maths shared by spatial / strategy / observation puzzles. */

export function makeGrid(rows, cols, fill = 0) {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => fill));
}

export function cloneGrid(grid) {
  return grid.map((row) => row.slice());
}

export function inBounds(grid, r, c) {
  return r >= 0 && c >= 0 && r < grid.length && c < grid[0].length;
}

export const DIRS4 = {
  up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1]
};

export const DIR_VECTORS = [
  { name: 'up', dr: -1, dc: 0, label: 'North', arrow: '▲' },
  { name: 'right', dr: 0, dc: 1, label: 'East', arrow: '▶' },
  { name: 'down', dr: 1, dc: 0, label: 'South', arrow: '▼' },
  { name: 'left', dr: 0, dc: -1, label: 'West', arrow: '◀' }
];

/** Turn a direction index (N,E,S,W) by -1 (left) or +1 (right). */
export function turn(dirIndex, delta) {
  return ((dirIndex + delta) % 4 + 4) % 4;
}

/** Breadth-first search; returns path as [{r,c}] or null. */
export function findPath(grid, start, goal, passable) {
  const rows = grid.length;
  const cols = grid[0].length;
  const key = (r, c) => r * cols + c;
  const prev = new Map();
  const seen = new Set([key(start.r, start.c)]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift();
    if (cur.r === goal.r && cur.c === goal.c) {
      const path = [];
      let node = cur;
      while (node) {
        path.push(node);
        node = prev.get(key(node.r, node.c));
      }
      return path.reverse();
    }
    for (const d of DIR_VECTORS) {
      const nr = cur.r + d.dr;
      const nc = cur.c + d.dc;
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
      if (!passable(grid, nr, nc)) continue;
      const k = key(nr, nc);
      if (seen.has(k)) continue;
      seen.add(k);
      prev.set(k, cur);
      queue.push({ r: nr, c: nc });
    }
  }
  return null;
}

/** Manhattan distance */
export function manhattan(a, b) {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
}

/** Rotate a square grid 90° clockwise. */
export function rotateGridCW(grid) {
  const n = grid.length;
  const out = makeGrid(n, grid[0].length);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < grid[0].length; c++) {
      out[c][n - 1 - r] = grid[r][c];
    }
  }
  return out;
}

/** Mirror a grid horizontally. */
export function mirrorGrid(grid) {
  return grid.map((row) => row.slice().reverse());
}

export function gridToCells(grid) {
  const cells = [];
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) cells.push({ r, c, value: grid[r][c] });
  }
  return cells;
}
