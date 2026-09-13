/**
 * Level definitions.
 *
 * 120 main levels + 12 secret levels. Every level is hand-authored here
 * (title, objective text, puzzle type, pacing, optional modifiers) while the
 * puzzle *content* is produced by the reusable generators in `src/puzzles`.
 *
 * `difficulty` is derived from the chapter (1–12) so the curve is predictable:
 *   ch1..ch10  → levels 1–100   (Tutorial → Final Tests)
 *   ch11..ch12 → levels 101–120 (endgame)
 *   secrets    → levels 121–132 (Void Archive, unlocked by conditions)
 */

export const CHAPTERS = [
  { id: 1, name: 'Waking Protocol', stage: 'Tutorial', range: [1, 10], accent: 'cyan', story: 'ch1' },
  { id: 2, name: 'Signal Discipline', stage: 'Easy', range: [11, 20], accent: 'cyan', story: 'ch2' },
  { id: 3, name: 'Pressure Routine', stage: 'Normal', range: [21, 30], accent: 'blue', story: 'ch3' },
  { id: 4, name: 'Deep Calibration', stage: 'Advanced', range: [31, 40], accent: 'blue', story: 'ch4' },
  { id: 5, name: 'Fault Lines', stage: 'Difficult', range: [41, 50], accent: 'violet', story: 'ch5' },
  { id: 6, name: 'Interpretation', stage: 'Expert', range: [51, 60], accent: 'violet', story: 'ch6' },
  { id: 7, name: 'Containment Drills', stage: 'Master', range: [61, 70], accent: 'amber', story: 'ch7' },
  { id: 8, name: 'Break Condition', stage: 'Extreme', range: [71, 80], accent: 'amber', story: 'ch8' },
  { id: 9, name: 'Unauthorised Thoughts', stage: 'Experimental', range: [81, 90], accent: 'rose', story: 'ch9' },
  { id: 10, name: 'The Final Tests', stage: 'Final', range: [91, 100], accent: 'rose', story: 'ch10' },
  { id: 11, name: 'Void Archive', stage: 'Endgame', range: [101, 110], accent: 'white', story: 'ch11' },
  { id: 12, name: 'Null Chamber', stage: 'Endgame', range: [111, 120], accent: 'white', story: 'ch12' }
];

export const SECRET_CHAPTER = { id: 13, name: 'Void Archive (Secret)', stage: 'Secret', range: [121, 132], accent: 'gold', story: 'secret' };

/** Convenience builder so each row stays readable. */
function L(n, puzzle, title, objective, extra = {}) {
  return { n, puzzle, title, objective, ...extra };
}

export const LEVELS = [
  // ── Chapter 1 · Waking Protocol (tutorial) ───────────────────────────────
  L(1, 'memory.grid', 'First Light', 'Watch which cells light up. When the chamber goes dark, tap every cell that glowed.', { taught: 'memory-grid', tutorial: true }),
  L(2, 'pattern.missing', 'Missing Symbol', 'One cell of the matrix is empty. Choose the symbol that completes it.', { taught: 'pattern-matrix' }),
  L(3, 'pattern.next', 'Sequence Extrapolation', 'The chamber counts in a pattern. Choose the next value.', { taught: 'pattern-sequence' }),
  L(4, 'logic.order', 'Boot Sequence', 'Four systems boot one after another. Read the clues and arrange them in order.', { taught: 'logic-order' }),
  L(5, 'spatial.maze', 'Duct Walk', 'An entry duct, an exit, and walls between. Walk the maze by tapping neighbouring cells.', { taught: 'spatial-maze' }),
  L(6, 'observation.diff', 'Two-Reel Compare', 'Two recordings of the same wall. One glyph changed. Tap the cell that differs.', { taught: 'observation-diff' }),
  L(7, 'logic.switches', 'Relay Matrix', 'Each relay flips itself and its four neighbours. Match the target grid.', { taught: 'logic-switches' }),
  L(8, 'memory.simon', 'Echo Array', 'The pads will flash a sequence. Repeat it exactly.', { taught: 'memory-simon' }),
  L(9, 'spatial.navigate', 'Bay Transit', 'Reach the exit within the move budget. Use the direction pad or arrow keys.', { taught: 'spatial-navigate' }),
  L(10, 'pattern.matrix', 'Compound Matrix', 'Rows decide the body, columns decide the surface. Complete the matrix.', { taught: 'pattern-compound', chapterFinale: true }),

  // ── Chapter 2 · Signal Discipline (easy) ─────────────────────────────────
  L(11, 'pattern.odd', 'Anomaly Detection', 'One symbol in the field does not belong. Find it.'),
  L(12, 'memory.reverse', 'Inverse Echo', 'The pads flash a sequence. Repeat it in reverse.'),
  L(13, 'pattern.shapes', 'Glyph Ladder', 'The symbols climb a ladder. Choose the next rung.'),
  L(14, 'logic.gate', 'Logic Core', 'Find the gate pair that produces the required output.'),
  L(15, 'spatial.rotate', 'Chirality Test', 'Which option is a pure rotation of the target — not a mirror image?'),
  L(16, 'observation.hidden', 'Signal in Noise', 'One glyph in the field matches the target exactly. Extract it.'),
  L(17, 'logic.cipher', 'Cipher Lock', 'A shifted alphabet. Decrypt the intercepted word.'),
  L(18, 'spatial.direction', 'Vector Drift', 'Follow the turns and report the final facing.'),
  L(19, 'strategy.route', 'Least Resistance', 'Every cell costs its number. Find the cheapest total.'),
  L(20, 'memory.pairs', 'Twin Vaults', 'Match every pair before the vault seals.', { chapterFinale: true }),

  // ── Chapter 3 · Pressure Routine (normal) ────────────────────────────────
  L(21, 'pattern.count', 'Inventory Scan', 'Count every occurrence of the target glyph. Decoys differ by fill as well as shape.'),
  L(22, 'memory.nback', 'Continuity Watch', 'Flag each item that matches the one two steps earlier.'),
  L(23, 'pattern.gate', 'Overlay Logic', 'Two glyphs combine through one fixed operation. Choose the result.'),
  L(24, 'logic.keys', 'Override Code', 'Deduce the keypad code from the numbered clues.'),
  L(25, 'spatial.topview', 'Stack Projection', 'Identify the footprint of the cube stacks from directly above.'),
  L(26, 'observation.twin', 'Twin Manifest', 'Exactly two tiles are identical. Select both.'),
  L(27, 'strategy.network', 'Relay Network', 'Each node flips its linked partners. Match the target state.'),
  L(28, 'logic.liars', 'Statement Audit', 'Some statements are false. Find the core.'),
  L(29, 'spatial.transform', 'Plate Rotation', 'Rotate and flip the plate until it matches the target.'),
  L(30, 'memory.change', 'Mutation Track', 'One cell mutated while you watched. Identify it.', { chapterFinale: true }),

  // ── Chapter 4 · Deep Calibration (advanced) ──────────────────────────────
  L(31, 'pattern.binary', 'Bit Drift', 'Continue the bit pattern.'),
  L(32, 'pattern.analogy', 'Analogical Transfer', 'A relates to B exactly as C relates to what?'),
  L(33, 'memory.order', 'Sequence Vault', 'The glyphs were shown in order. Reproduce that order.'),
  L(34, 'logic.queens', 'Isolation Protocol', 'Place tokens so no two share a row, column or diagonal.'),
  L(35, 'spatial.fit', 'Cavity Match', 'Which plate exactly fills the cavity?'),
  L(36, 'observation.anomaly', 'Row Violation', 'Every row follows the same progression except one.'),
  L(37, 'strategy.alloc', 'Power Budget', 'Allocate power so every constraint is satisfied.'),
  L(38, 'logic.sets', 'Set Intersection', 'Find the element that belongs to the sets named in the query.'),
  L(39, 'spatial.fragment', 'Fragment Search', 'One fragment is taken straight from the pattern. Which?'),
  L(40, 'memory.path', 'Route Memory', 'Memorise the route, then retrace it.', { chapterFinale: true }),

  // ── Chapter 5 · Fault Lines (difficult) ──────────────────────────────────
  L(41, 'logic.balance', 'Mass Discrepancy', 'One ball differs in mass. Work out which, from the weighings.'),
  L(42, 'memory.count', 'Signal Tally', 'Count how many target glyphs passed in the stream.'),
  L(43, 'spatial.cubes', 'Cube Census', 'How many cubes are in the structure?'),
  L(44, 'observation.text', 'Manifest Trace', 'A word is hidden in the manifest. Read it out.'),
  L(45, 'strategy.sokoban', 'Cargo Shunt', 'Push the container onto the plate.'),
  L(46, 'logic.decode', 'Codebook Drift', 'Decode the transmission with the given codebook.'),
  L(47, 'memory.assoc', 'Cipher Recall', 'The cipher is shown briefly. Enter the code for the queried glyph.'),
  L(48, 'strategy.budget', 'Salvage Manifest', 'Choose the salvage that maximises value inside the budget.'),
  L(49, 'spatial.mirror', 'Mirror Bay', 'Complete the board so the two halves are mirror images.'),
  L(50, 'logic.deduction', 'Sector Deduction', 'Assign every module a sector and a power draw.', { chapterFinale: true }),

  // ── Chapter 6 · Interpretation (expert) ──────────────────────────────────
  L(51, 'logic.rulelearn', 'Inference Drill', 'A hidden rule separates accepted from rejected. Which candidate passes?'),
  L(52, 'strategy.enemy', 'Patrol Window', 'Reach the exit without ever sharing a cell with a patrol.'),
  L(53, 'logic.jug', 'Coolant Routing', 'Measure the exact volume using only fills, empties and pours.'),
  L(54, 'pattern.matrix', 'Compound Matrix', 'The matrix is larger now. Rows and columns still decide everything.'),
  L(55, 'observation.silhouette', 'Shadow Match', 'Which shadow does this object cast?'),
  L(56, 'logic.condition', 'Conditional Rewrite', 'Apply the rewrite rules in order. Which glyph results?'),
  L(57, 'memory.nback', 'Continuity Watch', 'Longer stream, same rule: flag every match.'),
  L(58, 'strategy.nim', 'Drawing Down', 'Take cores in turns. Whoever takes the last one wins.'),
  L(59, 'spatial.navigate', 'Bay Transit', 'A larger bay and a tighter budget.'),
  L(60, 'pattern.odd', 'Anomaly Detection', 'The anomaly is subtler: check rotation, then size.', { chapterFinale: true }),

  // ── Chapter 7 · Containment Drills (master) ──────────────────────────────
  L(61, 'logic.nim', 'Terminal Gambit', 'Which single move guarantees the last token?'),
  L(62, 'strategy.pack', 'Hold Packing', 'Pack every piece so nothing overlaps and nothing is left empty.'),
  L(63, 'memory.grid', 'Cell Recall', 'More cells, shorter glimpse.'),
  L(64, 'logic.order', 'Boot Sequence', 'Six systems, tighter clues.'),
  L(65, 'spatial.maze', 'Duct Walk', 'A deeper maze.'),
  L(66, 'observation.order', 'Broken Ladder', 'One glyph breaks the rotation ladder.'),
  L(67, 'strategy.network', 'Relay Network', 'More nodes, a tighter press budget.'),
  L(68, 'logic.liars', 'Statement Audit', 'Four suspects and two liars.'),
  L(69, 'pattern.next', 'Sequence Extrapolation', 'The chamber counts in a harder pattern now.'),
  L(70, 'memory.pairs', 'Twin Vaults', 'Sixteen cards, fewer spare moves.', { chapterFinale: true }),

  // ── Chapter 8 · Break Condition (extreme) ────────────────────────────────
  L(71, 'logic.balance', 'Mass Discrepancy', 'Nine balls, three weighings.'),
  L(72, 'strategy.sokoban', 'Cargo Shunt', 'A wider bay, a longer push.'),
  L(73, 'logic.deduction', 'Sector Deduction', 'Four modules, two attributes, no wasted clues.'),
  L(74, 'observation.twin', 'Twin Vaults', 'Two vault manifests should match. Find the one entry that moved.'),
  L(75, 'spatial.topview', 'Stack Projection', 'Taller stacks, more decoys.'),
  L(76, 'strategy.alloc', 'Power Budget', 'Four systems, a strict total.'),
  L(77, 'logic.keys', 'Override Code', 'Four digits and every clue matters.'),
  L(78, 'observation.rapid', 'Rapid Sort', 'Six rounds of near-identical items.'),
  L(79, 'pattern.matrix', 'Compound Matrix', 'A four-by-four compound matrix.'),
  L(80, 'spatial.transform', 'Plate Rotation', 'More operations, a larger plate.', { chapterFinale: true }),

  // ── Chapter 9 · Unauthorised Thoughts (experimental) ─────────────────────
  L(81, 'meta.acrostic', 'Hidden Margin', 'The chamber leaves a margin note in everything it says. Find the word.'),
  L(82, 'meta.donotpress', 'Prohibited Control', 'PROTOCOL: do not press the control.'),
  L(83, 'meta.selfref', 'Self Reference', 'Count the letters in this chamber’s own objective.', { injectText: true, keyLetter: 'E' }),
  L(84, 'meta.dragui', 'Obstructed View', 'The overlay is part of the experiment. Clear the view.'),
  L(85, 'meta.invert', 'Inverted Grading', 'The chamber grades on inverted logic.'),
  L(86, 'meta.dial', 'Frequency Dial', 'Lock the dial on each target frequency in order.'),
  L(87, 'meta.hold', 'Continuous Contact', 'Keep the plate charged without letting go.'),
  L(88, 'meta.stillness', 'Null Protocol', 'Touch nothing until the chamber settles.'),
  L(89, 'meta.mirror', 'Reversed Signal', 'The signal is written in mirror script.'),
  L(90, 'meta.hiddenui', 'Protruding Edge', 'The release latch is not inside the frame.', { chapterFinale: true }),

  // ── Chapter 10 · The Final Tests ─────────────────────────────────────────
  L(91, 'meta.pause', 'Suspended State', 'The chamber speaks only while the station is paused.'),
  L(92, 'meta.lies', 'Doctored Bulletin', 'Exactly one claim on the panel is false.'),
  L(93, 'meta.recall', 'Archive Recall', 'Enter the serial you were shown in an earlier chamber.'),
  L(94, 'meta.setting', 'Silence Requirement', 'This experiment runs only in the right configuration.'),
  L(95, 'meta.levelnumber', 'Progress Lock', 'The lock is built from your own record.'),
  L(96, 'observation.silhouette', 'Shadow Match', 'One shadow in the line matches the object exactly. The station is rotating them to hide it.'),
  L(97, 'strategy.enemy', 'Patrol Window', 'Three patrols, one window.'),
  L(98, 'spatial.cubes', 'Cube Census', 'Count carefully — the structure is tall.'),
  L(99, 'logic.decode', 'Codebook Drift', 'The codebook changed. Decode anyway.'),
  L(100, 'meta.confess', 'Disclosure', 'The station asks what you want. It records the answer.', { injectText: false, finale: true }),

  // ── Chapter 11 · Void Archive (endgame) ──────────────────────────────────
  L(101, 'logic.liars', 'Statement Audit', 'The suspects are the crew now. Two are lying.'),
  L(102, 'memory.nback', 'Continuity Watch', 'Three-back. The stream is long.'),
  L(103, 'pattern.binary', 'Bit Drift', 'The bits are the station’s own memory map.'),
  L(104, 'spatial.fragment', 'Fragment Search', 'Which fragment is taken from the station’s own schematic?'),
  L(105, 'strategy.hanoi', 'Disk Transfer', 'Move the stack of disks between rods. A larger disk may never rest on a smaller one.'),
  L(106, 'logic.jug', 'Coolant Routing', 'Three jugs, eleven units, exact measurement.'),
  L(107, 'observation.rapid', 'Rapid Sort', 'The station is impatient now.'),
  L(108, 'meta.invert', 'Inverted Grading', 'Everything you were taught is inverted here.'),
  L(109, 'observation.text', 'Manifest Trace', 'One character in the manifest does not belong. Read the whole line.'),
  L(110, 'memory.assoc', 'Cipher Recall', 'The final cipher. Nothing is shown twice.', { chapterFinale: true }),

  // ── Chapter 12 · Null Chamber ────────────────────────────────────────────
  L(111, 'pattern.shapes', 'Margin Glyphs', 'The margin note is written in glyphs that change one attribute per step. Continue the line.'),
  L(112, 'meta.dragui', 'Obstructed View', 'Two obstructions.'),
  L(113, 'meta.dial', 'Frequency Dial', 'Four frequencies in sequence.'),
  L(114, 'meta.pause', 'Suspended State', 'Some answers only exist while everything is suspended.'),
  L(115, 'spatial.rotate', 'Chirality Test', 'The glyphs are almost identical. Trust the markers.'),
  L(116, 'observation.order', 'Broken Ladder', 'The ladder of values is out of order at exactly one rung. Mark it.'),
  L(117, 'strategy.pack', 'Hold Packing', 'The hold is larger and the pieces are worse.'),
  L(118, 'logic.balance', 'Mass Discrepancy', 'Nine balls, three weighings, no second chance.'),
  L(119, 'meta.selfref', 'Self Reference', 'Count the letters in this chamber’s objective.', { injectText: true, keyLetter: 'N' }),
  L(120, 'meta.confess', 'Disclosure', 'The last question the station will ever ask you.', { injectText: false, finale: true })
];

/**
 * Secret levels. Each one has an unlock condition that the SaveManager can
 * evaluate, and they all live in the Void Archive (chapter 13).
 */
export const SECRET_LEVELS = [
  L(121, 'meta.hiddenui', 'Protruding Edge', 'The latch was always there.', { secret: true, unlock: { type: 'stars', value: 30 }, reward: 'achievement:latch' }),
  L(122, 'meta.stillness', 'Null Protocol', 'Perfect stillness, twice as long.', { secret: true, unlock: { type: 'achievement', value: 'silence' } }),
  L(123, 'logic.balance', 'Ghost Weighing', 'A weighing record with no ball named.', { secret: true, unlock: { type: 'chapter', value: 5 } }),
  L(124, 'meta.donotpress', 'Prohibited Control', 'The protocol you already broke once.', { secret: true, unlock: { type: 'achievement', value: 'defiant' } }),
  L(125, 'spatial.transform', 'Plate Rotation', 'A plate that never stops turning.', { secret: true, unlock: { type: 'stars', value: 60 } }),
  L(126, 'logic.liars', 'Hollow Audit', 'Five voices, three of them false.', { secret: true, unlock: { type: 'choice', value: 'defiant' } }),
  L(127, 'meta.recall', 'Archive Recall', 'The serial you never wrote down.', { secret: true, unlock: { type: 'secret', value: 3 } }),
  L(128, 'strategy.nim', 'Last Core', 'Take the last core or lose everything.', { secret: true, unlock: { type: 'chapter', value: 8 } }),
  L(129, 'meta.setting', 'Silence Requirement', 'The station asks for silence again.', { secret: true, unlock: { type: 'stars', value: 90 } }),
  L(130, 'observation.rapid', 'Rapid Sort', 'Twelve rounds. No mistakes allowed.', { secret: true, unlock: { type: 'secret', value: 7 } }),
  L(131, 'meta.pause', 'Suspended State', 'A passphrase written in the pause overlay.', { secret: true, unlock: { type: 'achievement', value: 'starred' } }),
  L(132, 'meta.confess', 'Disclosure', 'The station asks about you, in private.', { secret: true, unlock: { type: 'stars', value: 120 }, reward: 'ending:hidden' })
];

export const ALL_LEVELS = [...LEVELS, ...SECRET_LEVELS];

export const TOTAL_LEVELS = LEVELS.length;
export const TOTAL_SECRETS = SECRET_LEVELS.length;

/** Chapter lookup for a level number (1–120 → chapters 1–12, secrets → 13). */
export function chapterForLevel(n) {
  if (n > TOTAL_LEVELS) return SECRET_CHAPTER;
  const chapter = CHAPTERS.find((c) => n >= c.range[0] && n <= c.range[1]);
  return chapter || CHAPTERS[CHAPTERS.length - 1];
}

/** Difficulty (1–12) — one step per chapter, so the curve is gradual. */
export function difficultyForLevel(n) {
  const chapter = chapterForLevel(n);
  return Math.max(1, Math.min(12, chapter.id));
}

export function levelDefinition(n) {
  return ALL_LEVELS.find((level) => level.n === n) || null;
}

export function levelsInChapter(chapterId) {
  if (chapterId === SECRET_CHAPTER.id) return SECRET_LEVELS;
  const chapter = CHAPTERS.find((c) => c.id === chapterId);
  if (!chapter) return [];
  return LEVELS.filter((l) => l.n >= chapter.range[0] && l.n <= chapter.range[1]);
}
