/**
 * Convenience barrel so puzzle modules can import everything they need from
 * one place. Importing from here keeps the individual puzzle files tidy and
 * makes the dependency direction obvious: puzzles → puzzleApi → {dom, kit}.
 */

export {
  el, append, clear, announce, flash, reflow, Disposer, formatTime, formatNumber, svgEl
} from '../utils/dom.js';

export {
  frame, promptText, boardEl, cellEl, glyph, choiceList, seqStrip, chip, meter,
  holdButton, answerInput, watchPhase, countdown, cellToken, parseCellToken,
  interactiveGrid, enableGridKeys, TOKEN_SELECTOR
} from './kit.js';

export { shapeSVG, shapeLabel, shapeKey, normalizeShape, SHAPES, FILLS, varyShape } from '../utils/shapes.js';

export {
  makeGrid, cloneGrid, DIR_VECTORS, DIRS4, findPath, manhattan, rotateGridCW, mirrorGrid, turn
} from '../utils/grid.js';

export const noop = () => {};
