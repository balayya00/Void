/**
 * Catalog tests: every one of the 120 levels + 12 secret levels must generate,
 * validate, expose an answer and report sane par values. This is the test that
 * guarantees "no impossible level, no missing text, no broken configuration".
 */

import { describe, it, expect } from 'vitest';
import {
  ALL_LEVELS, LEVELS, SECRET_LEVELS, CHAPTERS, SECRET_CHAPTER,
  chapterForLevel, difficultyForLevel, levelsInChapter, TOTAL_LEVELS, TOTAL_SECRETS
} from '../src/levels/levelData.js';
import {
  generateLevel, validateLevel, validateCatalog, computeStars, computeScore,
  unlockMet, newlyUnlockedSecrets, isSecret, starCriteria
} from '../src/levels/LevelManager.js';
import { PUZZLE_TYPES, PUZZLE_CATEGORIES } from '../src/puzzles/index.js';
import { freshSave } from '../src/save/SaveValidator.js';
import { playSolution } from './harness.js';

describe('level catalog', () => {
  it('has 120 main levels and at least 10 secret levels', () => {
    expect(LEVELS.length).toBe(120);
    expect(SECRET_LEVELS.length).toBeGreaterThanOrEqual(10);
    expect(TOTAL_LEVELS).toBe(120);
    expect(TOTAL_SECRETS).toBe(SECRET_LEVELS.length);
  });

  it('numbers levels uniquely and in order', () => {
    const numbers = ALL_LEVELS.map((l) => l.n);
    expect(new Set(numbers).size).toBe(numbers.length);
    for (let i = 1; i < numbers.length; i++) expect(numbers[i]).toBeGreaterThan(numbers[i - 1]);
    for (let n = 1; n <= 120; n++) expect(ALL_LEVELS.some((l) => l.n === n)).toBe(true);
  });

  it('has 12 chapters covering levels 1..120', () => {
    expect(CHAPTERS).toHaveLength(12);
    for (let n = 1; n <= 120; n++) {
      const chapter = chapterForLevel(n);
      expect(chapter.range[0]).toBeLessThanOrEqual(n);
      expect(chapter.range[1]).toBeGreaterThanOrEqual(n);
      expect(difficultyForLevel(n)).toBeGreaterThanOrEqual(1);
      expect(difficultyForLevel(n)).toBeLessThanOrEqual(12);
    }
    expect(chapterForLevel(121).id).toBe(SECRET_CHAPTER.id);
  });

  it('gives every chapter between 9 and 11 levels', () => {
    for (const chapter of CHAPTERS) {
      const count = levelsInChapter(chapter.id).length;
      expect(count).toBeGreaterThanOrEqual(9);
      expect(count).toBeLessThanOrEqual(11);
    }
  });

  it('uses at least 40 distinct puzzle types across the game', () => {
    const used = new Set(ALL_LEVELS.map((l) => l.puzzle));
    expect(used.size).toBeGreaterThanOrEqual(40);
    for (const id of used) expect(PUZZLE_TYPES[id], `unknown puzzle type ${id}`).toBeTruthy();
  });

  it('covers every declared category', () => {
    const categories = new Set(ALL_LEVELS.map((l) => PUZZLE_TYPES[l.puzzle].category));
    for (const key of Object.keys(PUZZLE_CATEGORIES)) {
      expect(categories.has(key), `category ${key} is never used`).toBe(true);
    }
  });

  it('has objectives, titles and teaching tags for the tutorial chapter', () => {
    for (const level of ALL_LEVELS) {
      expect(level.title, `level ${level.n} title`).toBeTruthy();
      expect(level.objective.length, `level ${level.n} objective`).toBeGreaterThan(12);
      expect(level.objective.length, `level ${level.n} objective too long`).toBeLessThan(220);
      expect(/[.?]$/.test(level.objective), `level ${level.n} objective should read as a sentence`).toBe(true);
    }
    for (const level of LEVELS.slice(0, 10)) {
      expect(level.taught, `tutorial level ${level.n} should declare what it teaches`).toBeTruthy();
    }
  });

  it('unlocks secret levels by condition, never by chance', () => {
    for (const level of SECRET_LEVELS) {
      expect(level.secret).toBe(true);
      expect(level.unlock).toBeTruthy();
      expect(['stars', 'achievement', 'chapter', 'secret', 'choice']).toContain(level.unlock.type);
    }
  });
});

describe('level generation (every level, every secret)', () => {
  it('generates, validates and solves each level definition', async () => {
    const failures = [];
    for (const level of ALL_LEVELS) {
      const result = validateLevel(level.n);
      if (result.errors.length) failures.push(`${level.n} (${level.puzzle}): ${result.errors.join('; ')}`);
    }
    expect(failures).toEqual([]);
  }, 60000);

  it('produces params that are deterministic for a given level number', () => {
    for (const level of [1, 12, 40, 77, 100, 120, 126]) {
      const a = generateLevel(level);
      const b = generateLevel(level);
      const strip = (o) => JSON.stringify(o, (k, v) => (typeof v === 'function' ? undefined : v));
      expect(strip(a.params), `level ${level} params differ between runs`).toBe(strip(b.params));
    }
  });

  it('can be played to completion through the DOM — every level and every secret', async () => {
    const failures = [];
    for (const level of ALL_LEVELS) {
      const { puzzle, params } = generateLevel(level.n);
      const result = await playSolution(puzzle, params, { level: level.n });
      if (!result.ok) failures.push(`${level.n} (${level.puzzle}): ${result.log.join(', ') || 'never reached the solved state'}`);
      // every level must render at least one interactive token and say something
      if (result.tokens === 0 && !puzzle.testAutoSolve) failures.push(`${level.n} (${level.puzzle}): mounted no interactive controls`);
    }
    expect(failures).toEqual([]);
  }, 180000);

  it('mounts cleanly under simulated reduced-motion and high-contrast preferences', async () => {
    const failures = [];
    for (const level of ALL_LEVELS.filter((l) => l.n % 7 === 0)) {
      const { puzzle, params } = generateLevel(level.n);
      const result = await playSolution(puzzle, params, {
        level: level.n,
        ctx: { reducedMotion: true, settings: { audio: false, music: false, sfx: false, reducedMotion: true, highContrast: true, largeText: true } }
      });
      if (!result.ok) failures.push(`${level.n}: ${result.log.join(', ')}`);
    }
    expect(failures).toEqual([]);
  }, 120000);

  it('reports a catalog summary without failures', () => {
    const report = validateCatalog();
    expect(report.failures).toEqual([]);
    expect(report.ok).toBe(report.total);
    expect(report.total).toBe(ALL_LEVELS.length);
  }, 60000);
});

describe('scoring', () => {
  const par = { time: 30, attempts: 2 };

  it('awards stars fairly', () => {
    expect(computeStars({ timeMs: 45000, attempts: 5, par })).toBe(1);
    expect(computeStars({ timeMs: 45000, attempts: 2, par })).toBe(2);
    expect(computeStars({ timeMs: 12000, attempts: 1, par })).toBe(3);
  });

  it('never awards more than three stars', () => {
    expect(computeStars({ timeMs: 1, attempts: 1, par })).toBeLessThanOrEqual(3);
    expect(computeStars({ timeMs: 0, attempts: 0, par })).toBeGreaterThanOrEqual(1);
  });

  it('keeps scores inside the documented range', () => {
    const worst = computeScore({ timeMs: 200000, attempts: 40, hints: 8, stars: 1, difficulty: 1, par });
    const best = computeScore({ timeMs: 500, attempts: 1, hints: 0, stars: 3, difficulty: 12, par });
    expect(worst).toBeGreaterThanOrEqual(50);
    expect(best).toBeLessThanOrEqual(5000);
    expect(best).toBeGreaterThan(worst);
  });

  it('penalises hints slightly but keeps hints usable', () => {
    const withoutHint = computeScore({ timeMs: 12000, attempts: 1, hints: 0, stars: 3, difficulty: 5, par });
    const withHint = computeScore({ timeMs: 12000, attempts: 1, hints: 1, stars: 3, difficulty: 5, par });
    expect(withHint).toBeLessThan(withoutHint);
    expect(withoutHint - withHint).toBeLessThan(100);
  });

  it('describes the star rules', () => {
    const criteria = starCriteria(par);
    expect(criteria).toHaveLength(3);
    criteria.forEach((line) => expect(line.length).toBeGreaterThan(5));
  });
});

describe('unlocking rules', () => {
  it('gates secret levels behind stars, chapters, achievements, secrets and choices', () => {
    const save = freshSave();
    expect(unlockMet(save, { type: 'stars', value: 30 })).toBe(false);
    save.completed['1'] = { stars: 3, score: 0, bestTimeMs: 0, attempts: 1, hints: 0, completedAt: Date.now() };
    for (let n = 2; n <= 10; n++) save.completed[String(n)] = { stars: 3, score: 0, bestTimeMs: 0, attempts: 1, hints: 0, completedAt: Date.now() };
    expect(unlockMet(save, { type: 'stars', value: 30 })).toBe(true);
    expect(unlockMet(save, { type: 'chapter', value: 1 })).toBe(true);
    expect(unlockMet(save, { type: 'chapter', value: 2 })).toBe(false);
    expect(unlockMet(save, { type: 'achievement', value: 'defiant' })).toBe(false);
    save.achievements.defiant = Date.now();
    expect(unlockMet(save, { type: 'achievement', value: 'defiant' })).toBe(true);
    expect(unlockMet(save, { type: 'secret', value: 1 })).toBe(false);
    save.secretLevels['121'] = Date.now();
    expect(unlockMet(save, { type: 'secret', value: 1 })).toBe(true);
    expect(unlockMet(save, { type: 'choice', value: 'defiant' })).toBe(false);
    save.storyChoices.ch1 = 'defiant';
    expect(unlockMet(save, { type: 'choice', value: 'defiant' })).toBe(true);
  });

  it('lists newly unlocked secrets only once', () => {
    const save = freshSave();
    for (let n = 1; n <= 12; n++) save.completed[String(n)] = { stars: 3, score: 0, bestTimeMs: 0, attempts: 1, hints: 0, completedAt: Date.now() };
    const first = newlyUnlockedSecrets(save);
    expect(first.length).toBeGreaterThan(0);
    for (const level of first) save.secretLevels[String(level.n)] = Date.now();
    const second = newlyUnlockedSecrets(save);
    expect(second.length).toBe(0);
  });

  it('knows which level numbers are secret', () => {
    expect(isSecret(120)).toBe(false);
    expect(isSecret(121)).toBe(true);
  });
});
