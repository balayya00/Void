/**
 * Puzzle registry — the single place the level engine looks up puzzle types.
 *
 * Adding a category means adding one import and one spread below; nothing else
 * in the engine changes.
 */

import { PATTERN_PUZZLES } from './PatternPuzzle.js';
import { MEMORY_PUZZLES } from './MemoryPuzzle.js';
import { LOGIC_PUZZLES } from './LogicPuzzle.js';
import { LOGIC2_PUZZLES } from './DeductionPuzzle.js';
import { SPATIAL_PUZZLES } from './SpatialPuzzle.js';
import { OBSERVATION_PUZZLES } from './ObservationPuzzle.js';
import { STRATEGY_PUZZLES } from './StrategyPuzzle.js';
import { META_PUZZLES } from './MetaPuzzle.js';

export const PUZZLE_TYPES = {
  ...PATTERN_PUZZLES,
  ...MEMORY_PUZZLES,
  ...LOGIC_PUZZLES,
  ...LOGIC2_PUZZLES,
  ...SPATIAL_PUZZLES,
  ...OBSERVATION_PUZZLES,
  ...STRATEGY_PUZZLES,
  ...META_PUZZLES
};

export const PUZZLE_CATEGORIES = {
  pattern: 'Pattern Recognition',
  memory: 'Memory',
  logic: 'Logic',
  spatial: 'Spatial Reasoning',
  observation: 'Observation',
  strategy: 'Strategy',
  meta: 'Experimental'
};

/** Look up a puzzle type by id; throws a descriptive error when missing. */
export function getPuzzleType(id) {
  const puzzle = PUZZLE_TYPES[id];
  if (!puzzle) {
    const known = Object.keys(PUZZLE_TYPES).sort().join(', ');
    throw new Error(`Unknown puzzle type "${id}". Known types: ${known}`);
  }
  return puzzle;
}

export function puzzleIdsByCategory(category) {
  return Object.values(PUZZLE_TYPES).filter((p) => p.category === category).map((p) => p.id).sort();
}
