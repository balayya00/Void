#!/usr/bin/env node
/**
 * Level report — `npm run levels:report`
 *
 * Generates, validates, solves and prices every level in the game (120 main +
 * 12 secret) and prints a report. It exits non-zero if any level is broken, so
 * it doubles as a CI gate for "no impossible, missing or misconfigured level".
 *
 * Pure Node: no DOM, no test runner, no dependencies.
 */

import {
  ALL_LEVELS, CHAPTERS, SECRET_CHAPTER, LEVELS, SECRET_LEVELS,
  chapterForLevel, TOTAL_LEVELS, TOTAL_SECRETS
} from '../src/levels/levelData.js';
import { generateLevel, validateLevel } from '../src/levels/LevelManager.js';
import { PUZZLE_TYPES, PUZZLE_CATEGORIES } from '../src/puzzles/index.js';

const args = new Set(process.argv.slice(2));
const showAll = args.has('--all') || args.has('-a');
const json = args.has('--json');

const report = validateCatalogDetailed();
print(report);
process.exit(report.failed > 0 ? 1 : 0);

function validateCatalogDetailed() {
  const rows = [];
  const byPuzzle = new Map();
  const byCategory = new Map();
  const byChapter = new Map();

  for (const level of ALL_LEVELS) {
    const row = { n: level.n, puzzle: level.puzzle, title: level.title, chapter: chapterForLevel(level.n).id, errors: [] };
    let puzzle = null;
    let params = null;
    try {
      const generated = generateLevel(level.n);
      puzzle = generated.puzzle;
      params = generated.params;
      row.puzzleName = puzzle.name;
      row.category = puzzle.category;
      const par = typeof puzzle.par === 'function' ? puzzle.par(params) : null;
      row.par = par;
      const steps = puzzle.solve(params) || [];
      row.steps = steps.length;
      if (!steps.length && !puzzle.testAutoSolve) row.errors.push('no solution path');
      const check = validateLevel(level.n);
      row.errors.push(...check.errors);
    } catch (err) {
      row.errors.push(`generation threw: ${err.message}`);
    }

    rows.push(row);
    const key = level.puzzle;
    if (!byPuzzle.has(key)) byPuzzle.set(key, { puzzle: key, name: puzzle ? puzzle.name : key, category: puzzle ? puzzle.category : '?', count: 0, errors: 0 });
    const entry = byPuzzle.get(key);
    entry.count++;
    entry.errors += row.errors.length;

    const category = puzzle ? puzzle.category : 'unknown';
    if (!byCategory.has(category)) byCategory.set(category, { count: 0, errors: 0, puzzles: new Set() });
    byCategory.get(category).count++;
    byCategory.get(category).errors += row.errors.length;
    if (puzzle) byCategory.get(category).puzzles.add(puzzle.id);

    const chapterId = row.chapter;
    if (!byChapter.has(chapterId)) byChapter.set(chapterId, { count: 0, errors: 0, steps: 0 });
    const chapter = byChapter.get(chapterId);
    chapter.count++;
    chapter.errors += row.errors.length;
    chapter.steps += row.steps;
  }

  const failed = rows.filter((r) => r.errors.length).length;
  return { rows, byPuzzle, byCategory, byChapter, failed };
}

function print(report) {
  if (json) {
    console.log(JSON.stringify({
      total: report.rows.length,
      failed: report.failed,
      levels: report.rows.map(({ n, puzzle, title, chapter, par, steps, errors }) => ({ n, puzzle, title, chapter, par, steps, errors })),
      puzzles: [...report.byPuzzle.values()],
      categories: [...report.byCategory.entries()].map(([id, v]) => ({ id, count: v.count, errors: v.errors, puzzles: v.puzzles.size }))
    }, null, 2));
    return;
  }

  console.log('');
  console.log('  NEURO//VOID — LEVEL REPORT');
  console.log('  ' + '─'.repeat(66));
  console.log(`  levels: ${LEVELS.length} main + ${SECRET_LEVELS.length} secret = ${ALL_LEVELS.length}`);
  console.log(`  puzzle types registered: ${Object.keys(PUZZLE_TYPES).length}`);
  console.log(`  puzzle types used by levels: ${report.byPuzzle.size}`);
  console.log(`  chapters: ${CHAPTERS.length} + secret = ${report.byChapter.size}`);
  console.log('');

  console.log('  PER CATEGORY');
  for (const [id, value] of [...report.byCategory.entries()].sort((a, b) => b[1].count - a[1].count)) {
    const name = PUZZLE_CATEGORIES[id] || id;
    const flag = value.errors ? `  ✗ ${value.errors} error(s)` : '  ✓';
    console.log(`    ${name.padEnd(24)} ${String(value.count).padStart(3)} levels  ${String(value.puzzles.size).padStart(2)} types${flag}`);
  }
  console.log('');

  console.log('  PER CHAPTER');
  for (const chapter of [...CHAPTERS, SECRET_CHAPTER]) {
    const value = report.byChapter.get(chapter.id) || { count: 0, errors: 0, steps: 0 };
    const flag = value.errors ? `  ✗ ${value.errors}` : '  ✓';
    console.log(`    ${String(chapter.id).padStart(2)}. ${chapter.name.padEnd(26)} ${chapter.stage.padEnd(13)} ${String(value.count).padStart(3)} levels${flag}`);
  }
  console.log('');

  if (showAll) {
    console.log('  EVERY LEVEL');
    let lastChapter = null;
    for (const row of report.rows) {
      if (row.chapter !== lastChapter) {
        lastChapter = row.chapter;
        console.log(`    — chapter ${row.chapter} —`);
      }
      const mark = row.errors.length ? '✗' : '✓';
      const par = row.par ? `par ${String(row.par.time).padStart(3)}s/${row.par.attempts}` : 'par —';
      console.log(`    ${mark} ${String(row.n).padStart(3)}  ${row.puzzle.padEnd(22)} ${par}  ${String(row.title).slice(0, 30)}`);
      for (const error of row.errors) console.log(`         ! ${error}`);
    }
    console.log('');
  }

  const failures = report.rows.filter((r) => r.errors.length);
  if (failures.length) {
    console.log('  FAILURES');
    for (const row of failures) {
      console.log(`    level ${row.n} (${row.puzzle}): ${row.errors.join('; ')}`);
    }
    console.log('');
    console.log(`  ✗ ${failures.length} of ${report.rows.length} levels are broken.`);
  } else {
    console.log(`  ✓ all ${report.rows.length} levels generate, validate and expose a solution path.`);
  }
  console.log('');
}
