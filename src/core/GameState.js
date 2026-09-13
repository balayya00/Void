/**
 * Game state machine.
 *
 * Transitions are explicit and guarded: every screen change goes through
 * `transition()`, which tears down the previous screen first. This is what
 * keeps timers, listeners and animation loops from leaking between states.
 */

export const STATES = {
  LOADING: 'loading',
  MENU: 'menu',
  LEVELS: 'levels',
  PLAYING: 'playing',
  PAUSED: 'paused',
  SUCCESS: 'success',
  FAILURE: 'failure',
  STORY: 'story',
  ACHIEVEMENT: 'achievement',
  SETTINGS: 'settings',
  SAVE_DATA: 'save-data',
  ENDING: 'ending',
  CREDITS: 'credits',
  HELP: 'help'
};

/** Screens that host a live puzzle (the puzzle must be unmounted when leaving). */
export const PUZZLE_STATES = new Set([STATES.PLAYING, STATES.PAUSED, STATES.SUCCESS, STATES.FAILURE, STATES.ACHIEVEMENT]);

/** Legal transitions. Anything else is refused (and logged in development). */
const ALLOWED = {
  [STATES.LOADING]: [STATES.MENU, STATES.PLAYING, STATES.ENDING, STATES.HELP],
  [STATES.MENU]: [STATES.LEVELS, STATES.PLAYING, STATES.SETTINGS, STATES.SAVE_DATA, STATES.CREDITS, STATES.HELP, STATES.STORY, STATES.ENDING],
  [STATES.LEVELS]: [STATES.MENU, STATES.PLAYING, STATES.SETTINGS, STATES.SAVE_DATA, STATES.HELP],
  [STATES.PLAYING]: [STATES.PAUSED, STATES.SUCCESS, STATES.FAILURE, STATES.STORY, STATES.ACHIEVEMENT, STATES.MENU, STATES.LEVELS, STATES.ENDING],
  [STATES.PAUSED]: [STATES.PLAYING, STATES.MENU, STATES.LEVELS, STATES.SETTINGS, STATES.HELP],
  [STATES.SUCCESS]: [STATES.PLAYING, STATES.LEVELS, STATES.MENU, STATES.STORY, STATES.ENDING, STATES.ACHIEVEMENT],
  [STATES.FAILURE]: [STATES.PLAYING, STATES.LEVELS, STATES.MENU],
  [STATES.STORY]: [STATES.PLAYING, STATES.LEVELS, STATES.MENU, STATES.ENDING],
  [STATES.ACHIEVEMENT]: [STATES.PLAYING, STATES.SUCCESS, STATES.LEVELS, STATES.MENU],
  [STATES.SETTINGS]: [STATES.MENU, STATES.LEVELS, STATES.PAUSED, STATES.PLAYING],
  [STATES.SAVE_DATA]: [STATES.MENU, STATES.LEVELS],
  [STATES.ENDING]: [STATES.MENU, STATES.CREDITS, STATES.LEVELS],
  [STATES.CREDITS]: [STATES.MENU],
  [STATES.HELP]: [STATES.MENU, STATES.PLAYING, STATES.PAUSED, STATES.LEVELS]
};

/** Tiny EventTarget-ish base so GameState can be used without the DOM. */
class EventTargetish {
  constructor() {
    this._listeners = new Map();
  }
  addEventListener(type, handler) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(handler);
  }
  removeEventListener(type, handler) {
    const set = this._listeners.get(type);
    if (set) set.delete(handler);
  }
  emit(type, payload) {
    const set = this._listeners.get(type);
    if (!set) return;
    for (const handler of [...set]) {
      try { handler(payload); } catch (err) { console.warn('[neurovoid] state listener failed', err); }
    }
  }
}

export class GameState extends EventTargetish {
  constructor(initial = STATES.LOADING) {
    super();
    this.current = initial;
    this.previous = null;
    this.history = [initial];
    this.changedAt = Date.now();
  }

  can(next) {
    if (next === this.current) return true;
    const allowed = ALLOWED[this.current] || [];
    return allowed.includes(next);
  }

  transition(next, meta = {}) {
    if (next === this.current && !meta.force) return false;
    if (!this.can(next)) {
      console.warn(`[neurovoid] refused transition ${this.current} → ${next}`);
      return false;
    }
    this.previous = this.current;
    this.current = next;
    this.changedAt = Date.now();
    this.history.push(next);
    if (this.history.length > 40) this.history.shift();
    this.emit('change', { from: this.previous, to: next, meta });
    return true;
  }

  is(...states) {
    return states.includes(this.current);
  }

  get inPuzzle() {
    return PUZZLE_STATES.has(this.current);
  }
}
