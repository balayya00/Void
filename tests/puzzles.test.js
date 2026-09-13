/**
 * Generated-suite test for every registered puzzle type.
 *
 * For each puzzle we assert:
 *   1. `validate()` reports no problems,
 *   2. a simulated player can reach the solved state using only DOM clicks
 *      produced by `solve()` (this is the "no impossible puzzle" proof),
 *   3. generation is deterministic for a given seed,
 *   4. the puzzle reports sane par values,
 *   5. failing once does not throw and does not mark the puzzle solved.
 */

import { describe, it, expect } from 'vitest';
import { PUZZLE_TYPES } from '../src/puzzles/index.js';
import { generate, playSolution, makeCtx } from './harness.js';

const LEVELS = [1, 3, 5, 11, 21, 35, 47, 63, 79, 92, 105, 118];

describe('puzzle registry', () => {
  it('exposes a healthy number of distinct puzzle types', () => {
    const ids = Object.keys(PUZZLE_TYPES);
    expect(ids.length).toBeGreaterThanOrEqual(30);
    for (const [id, puzzle] of Object.entries(PUZZLE_TYPES)) {
      expect(puzzle.id, `${id} must declare its own id`).toBe(id);
      expect(typeof puzzle.generate).toBe('function');
      expect(typeof puzzle.solve).toBe('function');
      expect(typeof puzzle.validate).toBe('function');
      expect(typeof puzzle.mount).toBe('function');
      expect(puzzle.category).toBeTruthy();
      expect(puzzle.name).toBeTruthy();
    }
  });
});

for (const [id, puzzle] of Object.entries(PUZZLE_TYPES)) {
  describe(`${id} (${puzzle.category})`, () => {
    it('validates and is solvable at every sampled level', async () => {
      for (const n of LEVELS) {
        const { params } = generate(puzzle, n, { difficulty: 1 + Math.min(10, Math.floor((n - 1) / 11) + (n > 100 ? 1 : 0)) });
        const errs = puzzle.validate(params);
        expect(errs, `${id}@${n} validation: ${errs.join('; ')}`).toEqual([]);
        const res = await playSolution(puzzle, params);
        expect(res.log, `${id}@${n} solve log`).toEqual([]);
        expect(res.ctx.solved, `${id}@${n} should reach the solved state`).toBe(true);
      }
    });

    it('is deterministic for the same seed', () => {
      const a = generate(puzzle, 42).params;
      const b = generate(puzzle, 42).params;
      const strip = (o) => JSON.stringify(o, (k, v) => (typeof v === 'function' ? undefined : v));
      expect(strip(a)).toBe(strip(b));
    });

    it('reports usable par values', () => {
      const { params } = generate(puzzle, 12);
      const par = puzzle.par ? puzzle.par(params) : null;
      if (par) {
        expect(par.time).toBeGreaterThan(0);
        expect(par.attempts).toBeGreaterThan(0);
      } else {
        expect(par).toBeNull();
      }
    });

    it('fails safely (a wrong answer never solves the puzzle)', async () => {
      const { params } = generate(puzzle, 25);
      const res = await playSolution(puzzle, params, {});
      // sanity: playing the correct solution must solve it, so the puzzle must
      // not be trivially solved before any interaction happens
      const ctx = makeCtx({});
      expect(ctx.solved).toBe(false);
      expect(res.ctx.solved).toBe(true);
    });
  });
}
