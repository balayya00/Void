/**
 * Scoring & star fairness.
 *
 * The rating system must never punish a player twice: hints cost points but
 * never a star, replays keep the best result, and every level is reachable with
 * three stars by playing well within its own par values.
 */

import { describe, it, expect } from 'vitest';
import { computeStars, computeScore, starCriteria, validateCatalog } from '../src/levels/LevelManager.js';
import { generateLevel } from '../src/levels/LevelManager.js';
import { ALL_LEVELS } from '../src/levels/levelData.js';

describe('star rating', () => {
  const par = { time: 30, attempts: 2 };

  it('gives three stars for a fast, clean run', () => {
    expect(computeStars({ timeMs: 1000, attempts: 1, par })).toBe(3);
    expect(computeStars({ timeMs: 30000, attempts: 2, par })).toBe(3); // exactly on target counts
  });

  it('gives two stars for a clean attempt count but a slow run', () => {
    expect(computeStars({ timeMs: 45000, attempts: 2, par })).toBe(2);
    expect(computeStars({ timeMs: 45000, attempts: 1, par })).toBe(2);
  });

  it('gives one star for a slow or messy run — never zero', () => {
    expect(computeStars({ timeMs: 120000, attempts: 9, par })).toBe(1);
    expect(computeStars({ timeMs: 1, attempts: 99, par })).toBe(1);
  });

  it('is monotonic: more time or more attempts never earns more stars', () => {
    for (const attempts of [1, 2, 3, 6, 12]) {
      let previous = 3;
      for (const seconds of [1, 5, 20, 45, 90, 200]) {
        const stars = computeStars({ timeMs: seconds * 1000, attempts, par });
        expect(stars).toBeLessThanOrEqual(previous);
        previous = stars;
      }
    }
  });

  it('always awards at least one star for finishing', () => {
    for (let attempts = 1; attempts <= 20; attempts++) {
      for (const seconds of [0, 1, 60, 600]) {
        expect(computeStars({ timeMs: seconds * 1000, attempts, par })).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('explains its rules in plain language', () => {
    const lines = starCriteria(par);
    expect(lines.join(' ')).toContain('30s');
    expect(lines.join(' ')).toContain('2 attempts');
  });
});

describe('score', () => {
  const par = { time: 30, attempts: 2 };

  it('stays inside the documented 50–5000 range for every extreme', () => {
    const extremes = [
      { timeMs: 0, attempts: 0, hints: 0, stars: 0, difficulty: 1, par },
      { timeMs: 10 ** 9, attempts: 10 ** 6, hints: 10 ** 5, stars: 1, difficulty: 12, par },
      { timeMs: 45000, attempts: 3, hints: 2, stars: 2, difficulty: 6, par }
    ];
    for (const input of extremes) {
      const score = computeScore(input);
      expect(Number.isFinite(score)).toBe(true);
      expect(score).toBeGreaterThanOrEqual(50);
      expect(score).toBeLessThanOrEqual(5000);
    }
  });

  it('pays more for three stars than two, and two more than one', () => {
    const base = { timeMs: 20000, attempts: 1, hints: 0, difficulty: 4, par };
    expect(computeScore({ ...base, stars: 3 })).toBeGreaterThan(computeScore({ ...base, stars: 2 }));
    expect(computeScore({ ...base, stars: 2 })).toBeGreaterThan(computeScore({ ...base, stars: 1 }));
  });

  it('rewards difficulty', () => {
    const base = { timeMs: 20000, attempts: 1, hints: 0, stars: 3, par };
    expect(computeScore({ ...base, difficulty: 12 })).toBeGreaterThan(computeScore({ ...base, difficulty: 1 }));
  });

  it('treats hints as a nudge, not a punishment', () => {
    const base = { timeMs: 20000, attempts: 1, stars: 3, difficulty: 4, par };
    const clean = computeScore({ ...base, hints: 0 });
    const oneHint = computeScore({ ...base, hints: 1 });
    const threeHints = computeScore({ ...base, hints: 3 });
    expect(clean - oneHint).toBeLessThan(200);
    expect(threeHints).toBeGreaterThan(clean * 0.5);
  });
});

describe('par values', () => {
  it('are generous enough that a careful player can earn three stars', () => {
    for (const level of ALL_LEVELS) {
      const { puzzle, params } = generateLevel(level.n);
      const par = puzzle.par ? puzzle.par(params) : null;
      if (!par) continue;
      expect(par.time, `level ${level.n} time par`).toBeGreaterThanOrEqual(10);
      expect(par.time, `level ${level.n} time par is unreasonable`).toBeLessThanOrEqual(420);
      expect(par.attempts, `level ${level.n} attempt par`).toBeGreaterThanOrEqual(1);
      // The experimental chapter (81–120) and the Void Archive deliberately use
      // a forgiving attempt allowance: those chambers are about exploring a
      // mechanic, not about repeating it. Everything before that must be tight.
      const ceiling = level.n <= 80 ? 5 : 99;
      expect(par.attempts, `level ${level.n} attempt par`).toBeLessThanOrEqual(ceiling);
    }
  }, 60000);

  it('keeps the whole catalog playable (no broken definitions)', () => {
    const report = validateCatalog();
    expect(report.failures).toEqual([]);
    expect(report.ok).toBe(report.total);
  }, 60000);
});
