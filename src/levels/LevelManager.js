/**
 * LevelManager — turns a level number into a playable puzzle.
 *
 *   definition → level descriptor → puzzle generator → params → validation
 *
 * Scoring also lives here: `computeStars` and `computeScore` are pure
 * functions so the fairness rules can be unit-tested and shown to the player.
 */

import {
  ALL_LEVELS, LEVELS, SECRET_LEVELS, CHAPTERS, SECRET_CHAPTER,
  chapterForLevel, difficultyForLevel, levelDefinition, levelsInChapter,
  TOTAL_LEVELS, TOTAL_SECRETS
} from './levelData.js';
import { getPuzzleType, PUZZLE_CATEGORIES } from '../puzzles/index.js';
import { Rng } from '../utils/rng.js';

/** Deterministic seed for a level — the same layout every time it is played. */
export function levelSeed(n) {
  return `nv:lvl:${n}`;
}

/**
 * Build the descriptor handed to `puzzle.generate(level)`.
 * The shape is the contract every puzzle module relies on:
 *   { number, seed, rng, difficulty, chapter, text, keyLetter, stars, testMode }
 */
export function createLevelDescriptor(n, state = {}) {
  const definition = levelDefinition(n);
  if (!definition) throw new Error(`No level definition for ${n}`);
  const seed = levelSeed(n);
  return {
    number: n,
    level: n,
    seed,
    rng: new Rng(`${seed}:gen`),
    difficulty: difficultyForLevel(n),
    chapter: chapterForLevel(n).id,
    text: definition.injectText ? definition.objective : undefined,
    keyLetter: definition.keyLetter,
    stars: state.totalStars || 0,
    testMode: !!state.testMode
  };
}

/** Generate a level's params plus its puzzle descriptor. */
export function generateLevel(n, state = {}) {
  const definition = levelDefinition(n);
  if (!definition) throw new Error(`No level definition for ${n}`);
  const puzzle = getPuzzleType(definition.puzzle);
  const level = createLevelDescriptor(n, state);
  const params = puzzle.generate(level);
  return { definition, puzzle, params, level, context: level };
}

/** Validate a single level definition (used by tests and the levels report). */
export function validateLevel(n, state = {}) {
  const errors = [];
  let generated;
  try {
    generated = generateLevel(n, state);
  } catch (err) {
    return { number: n, errors: [`generation threw: ${err.message}`], definition: null, puzzle: null, params: null };
  }
  const { definition, puzzle, params } = generated;
  if (!definition.title) errors.push('missing title');
  if (!definition.objective) errors.push('missing objective text');
  if (params === undefined || params === null) errors.push('no parameters generated');
  else {
    let puzzleErrors = [];
    if (typeof puzzle.validate === 'function') {
      try {
        puzzleErrors = puzzle.validate(params) || [];
      } catch (err) {
        errors.push(`validate threw: ${err.message}`);
        puzzleErrors = [];
      }
    }
    errors.push(...puzzleErrors);
    let steps = [];
    try {
      steps = puzzle.solve(params) || [];
    } catch (err) {
      errors.push(`solve threw: ${err.message}`);
    }
    // A puzzle whose solution is "do nothing" (meta.stillness) legitimately has
    // no steps to play; the DOM check in tests/puzzles.test.js covers it.
    if (!steps.length && !puzzle.testAutoSolve) errors.push('solve() produced no steps — the puzzle has no answer path');
    if (typeof puzzle.par === 'function') {
      const par = puzzle.par(params);
      if (!par || !(par.time > 0) || !(par.attempts > 0)) errors.push('par values are unusable');
    }
  }
  return { number: n, errors, definition, puzzle, params };
}

/** Validate the whole catalog (120 levels + secrets) — `npm run levels:report`. */
export function validateCatalog(state = {}) {
  const report = { total: 0, ok: 0, failures: [], byPuzzle: {}, byCategory: {}, rows: [] };
  for (const level of ALL_LEVELS) {
    report.total++;
    const result = validateLevel(level.n, state);
    const puzzleId = level.puzzle;
    report.byPuzzle[puzzleId] = report.byPuzzle[puzzleId] || { levels: 0, errors: 0 };
    report.byPuzzle[puzzleId].levels++;
    if (result.puzzle) {
      const category = result.puzzle.category;
      report.byCategory[category] = report.byCategory[category] || { levels: 0, errors: 0 };
      report.byCategory[category].levels++;
    }
    if (result.errors.length) {
      report.failures.push({ number: level.n, puzzle: puzzleId, errors: result.errors });
      report.byPuzzle[puzzleId].errors++;
      if (result.puzzle) report.byCategory[result.puzzle.category].errors++;
    } else {
      report.ok++;
    }
    report.rows.push({ n: level.n, puzzle: puzzleId, title: level.title, chapter: chapterForLevel(level.n).id, errors: result.errors.length });
  }
  return report;
}

// ── scoring ────────────────────────────────────────────────────────────────

/**
 * Star rules (shown to the player in the level list and in the pause screen):
 *   ★   finish the experiment
 *   ★★  finish it within the attempt allowance
 *   ★★★ attempt allowance and the time target
 * Hints never remove a star; they reduce the score instead.
 */
export function computeStars({ timeMs, attempts, par }) {
  if (!par) return 1;
  const withinAttempts = attempts <= par.attempts;
  const withinTime = timeMs <= par.time * 1000;
  if (withinAttempts && withinTime) return 3;
  if (withinAttempts) return 2;
  return 1;
}

export function computeScore({ timeMs, attempts, hints = 0, stars = 1, difficulty = 1, par }) {
  const base = 400 + difficulty * 40;
  const starBonus = stars * 200;
  let speedBonus = 0;
  if (par && par.time > 0) {
    const ratio = 1 - Math.min(1, timeMs / (par.time * 1000));
    speedBonus = Math.round(ratio * 220);
  }
  const attemptPenalty = Math.max(0, attempts - 1) * 15;
  const hintPenalty = hints * 35;
  const raw = base + starBonus + speedBonus - attemptPenalty - hintPenalty;
  return Math.max(50, Math.min(5000, Math.round(raw)));
}

export function starCriteria(par) {
  if (!par) return ['★ Complete the experiment.'];
  return [
    '★ Complete the experiment.',
    `★★ Finish in ${par.attempts} attempt${par.attempts === 1 ? '' : 's'} or fewer.`,
    `★★★ Attempts and a time under ${par.time}s.`
  ];
}

// ── unlocking ──────────────────────────────────────────────────────────────

export function isSecret(n) {
  return n > TOTAL_LEVELS;
}

/**
 * Secret levels unlock from play, never from randomness:
 *   stars / achievement / chapter / secret / choice
 */
export function unlockMet(saveData, condition) {
  if (!condition) return false;
  switch (condition.type) {
    case 'stars': {
      const stars = Object.values(saveData.completed || {}).reduce((sum, e) => sum + (e.stars || 0), 0);
      return stars >= condition.value;
    }
    case 'achievement':
      return !!(saveData.achievements || {})[condition.value];
    case 'chapter': {
      const chapter = CHAPTERS.find((c) => c.id === condition.value);
      if (!chapter) return false;
      for (let n = chapter.range[0]; n <= chapter.range[1]; n++) {
        if (!(saveData.completed || {})[String(n)]) return false;
      }
      return true;
    }
    case 'secret':
      return Object.keys(saveData.secretLevels || {}).length >= condition.value;
    case 'choice':
      return Object.values(saveData.storyChoices || {}).includes(condition.value);
    default:
      return false;
  }
}

/** Secret levels whose conditions are satisfied but which are not granted yet. */
export function newlyUnlockedSecrets(saveData) {
  return SECRET_LEVELS.filter((level) => !(saveData.secretLevels || {})[String(level.n)] && unlockMet(saveData, level.unlock));
}

/** Human-readable unlock requirement for the UI. */
export function unlockDescription(condition) {
  if (!condition) return 'Hidden.';
  switch (condition.type) {
    case 'stars': return `Collect ${condition.value} ★ in total.`;
    case 'achievement': return 'Earn a specific archive badge.';
    case 'chapter': return `Complete Chapter ${condition.value} completely.`;
    case 'secret': return `Discover ${condition.value} secret chambers.`;
    case 'choice': return 'Make a particular decision in the story.';
    default: return 'Hidden.';
  }
}

export {
  ALL_LEVELS, LEVELS, SECRET_LEVELS, CHAPTERS, SECRET_CHAPTER,
  chapterForLevel, difficultyForLevel, levelDefinition, levelsInChapter,
  TOTAL_LEVELS, TOTAL_SECRETS, PUZZLE_CATEGORIES
};
