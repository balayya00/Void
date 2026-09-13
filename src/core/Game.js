/**
 * Game — the controller that ties everything together.
 *
 * It owns exactly one puzzle at a time, one timer, and one screen. Every
 * transition tears the previous screen down first (see ScreenHost), which is
 * how the game avoids leaked intervals, listeners and animation frames.
 *
 * Flow:
 *   menu → level select → playing → (paused | success | failure | story) → next
 */

import { EventBus } from './EventBus.js';
import { GameState, STATES } from './GameState.js';
import { AudioManager } from './AudioManager.js';
import { applySolution } from './AutoSolver.js';
import { SaveManager } from '../save/SaveManager.js';
import { evaluateAchievements, achievementById, ACHIEVEMENTS } from '../save/Achievements.js';
import {
  generateLevel, computeStars, computeScore, validateLevel, difficultyForLevel,
  newlyUnlockedSecrets, unlockDescription, isSecret, starCriteria
} from '../levels/LevelManager.js';
import {
  CHAPTERS, SECRET_CHAPTER, TOTAL_LEVELS, TOTAL_SECRETS,
  levelDefinition, chapterForLevel, levelsInChapter, ALL_LEVELS
} from '../levels/levelData.js';
import { beatForChapter, resolveEnding, STORY_BEATS } from '../story/StoryData.js';
import { el, clear, formatTime, announce } from '../utils/dom.js';
import { Rng } from '../utils/rng.js';

/** How many hints before the "let the station finish it" assist unlocks. */
export const HINTS_BEFORE_ASSIST = 3;
/** Extra attempts beyond the star allowance before the failure screen appears. */
export const FAILURE_GRACE = 3;

export class Game {
  constructor({ root, save, audio, host } = {}) {
    this.root = root;
    this.bus = new EventBus();
    this.state = new GameState(STATES.LOADING);
    this.save = save || new SaveManager({ onStatus: (status) => this.bus.emit('save:status', status) });
    this.audio = audio || new AudioManager(this.save.data.settings);
    this.host = host || null;
    this.level = null;
    this.lastResult = null;
    this.pendingStory = null;
    this.screens = new Map();
    this._tick = null;
    this._assistController = null;
    this._screenCleanup = null;
    this.testMode = false; // set by the automated UI tests; never true for players
    this._startedAt = 0;
    this._pausedAt = 0;
    this._pausedTotal = 0;
    this._boundKeydown = (ev) => this.onKeydown(ev);
  }

  get settings() {
    return this.save.data.settings;
  }

  get progress() {
    return this.save.summary();
  }

  // ── boot ────────────────────────────────────────────────────────────────

  register(name, factory) {
    this.screens.set(name, factory);
    return this;
  }

  onReady() {
    document.addEventListener('keydown', this._boundKeydown);
  }

  destroy() {
    document.removeEventListener('keydown', this._boundKeydown);
    this.stopTimer();
    this.teardownScreen();
    this.state = new GameState(STATES.LOADING);
  }

  // ── screen hosting ──────────────────────────────────────────────────────

  /**
   * Show a registered screen. The previous screen's cleanup runs first, so no
   * widget can outlive its screen.
   */
  show(name, payload = {}, { state = null, silent = false } = {}) {
    const factory = this.screens.get(name);
    if (!factory) throw new Error(`Unknown screen "${name}"`);
    this.teardownScreen();
    if (state && !this.state.transition(state)) {
      // the transition table refused it — fall back to the menu rather than
      // leaving the player on a dead screen
      this.state.transition(STATES.MENU, { force: true });
    }
    const container = el('div', { class: `screen screen-${name}`, dataset: { screen: name } });
    this.root.append(container);
    let cleanup = null;
    try {
      cleanup = factory(container, this, payload);
    } catch (err) {
      console.error('[neurovoid] screen failed', name, err);
      container.append(el('div', { class: 'panel' }, [
        el('h2', { text: 'A subsystem failed to render.' }),
        el('p', { class: 'muted', text: String(err && err.message) }),
        el('button', { class: 'btn btn-primary', type: 'button', text: 'RETURN TO MENU', onclick: () => this.show('menu', {}, { state: STATES.MENU }) })
      ]));
    }
    this._screenCleanup = typeof cleanup === 'function' ? cleanup : null;
    this._screenName = name;
    if (!silent) this.bus.emit('screen', { name, state: this.state.current, payload });
    return container;
  }

  teardownScreen() {
    if (this._screenCleanup) {
      try { this._screenCleanup(); } catch (err) { console.warn('[neurovoid] screen cleanup failed', err); }
      this._screenCleanup = null;
    }
    clear(this.root);
  }

  get screenName() {
    return this._screenName || null;
  }

  // ── level lifecycle ─────────────────────────────────────────────────────

  /** Generate + validate a level, ready to mount. */
  prepareLevel(n) {
    if (!Number.isInteger(n) || n < 1 || n > TOTAL_LEVELS + TOTAL_SECRETS) {
      throw new Error(`Level ${n} is out of range`);
    }
    const generated = generateLevel(n, { totalStars: this.save.totalStars, testMode: false });
    const definition = generated.definition;
    const par = typeof generated.puzzle.par === 'function' ? generated.puzzle.par(generated.params) : null;
    const safePar = par && par.time > 0 && par.attempts > 0 ? par : { time: 60, attempts: 3 };
    return {
      n,
      definition,
      puzzle: generated.puzzle,
      params: generated.params,
      par: safePar,
      difficulty: difficultyForLevel(n),
      chapter: chapterForLevel(n),
      secret: isSecret(n),
      attempts: 1,
      hints: 0,
      startedAt: Date.now(),
      elapsed: 0,
      solvedSteps: null
    };
  }

  /**
   * Start (or restart) a level. `reason` is used for the transition table.
   */
  startLevel(n, { transition = true } = {}) {
    let prepared;
    try {
      prepared = this.prepareLevel(n);
    } catch (err) {
      console.error('[neurovoid] cannot start level', n, err);
      this.show('menu', {}, { state: STATES.MENU });
      return null;
    }
    // developer-facing guard: a broken definition must be loud in the console
    const check = validateLevel(n, { totalStars: this.save.totalStars });
    if (check.errors.length) {
      console.warn(`[neurovoid] level ${n} has configuration problems`, check.errors);
    }
    this.level = prepared;
    this._pausedTotal = 0;
    this._pausedAt = 0;
    this.save.setCurrentLevel(n);
    if (this.save.getLevelRecord(n)) {
      this.save.setFlag('replays', Number(this.save.getFlag('replays', 0)) + 1);
    }
    this.audio.unlock();
    this.audio.levelStart();
    this.show('play', {}, { state: transition ? STATES.PLAYING : null });
    this.startTimer();
    this.bus.emit('level:start', { n, puzzle: prepared.puzzle.id });
    return prepared;
  }

  restartLevel() {
    if (!this.level) return;
    const n = this.level.n;
    this.stopTimer();
    this.startLevel(n);
    this.bus.emit('level:restart', { n });
  }

  nextLevel() {
    if (!this.level) return;
    const n = this.level.n;
    const max = TOTAL_LEVELS;
    if (n >= max) {
      this.finishRun();
      return;
    }
    this.startLevel(n + 1);
  }

  leaveLevel() {
    this.stopTimer();
    this.cancelAssist();
    if (this.level) {
      this.save.setCurrentLevel(this.level.n);
      this.audio.suspend();
    }
    this.show('levels', {}, { state: STATES.LEVELS });
  }

  // ── timing ──────────────────────────────────────────────────────────────

  startTimer() {
    this.stopTimer();
    this._startedAt = Date.now();
    this._tick = setInterval(() => {
      if (this.state.current !== STATES.PLAYING || !this.level) return;
      this.level.elapsed = this.elapsedMs();
      this.bus.emit('level:tick', { elapsed: this.level.elapsed });
    }, 250);
  }

  stopTimer() {
    if (this._tick) {
      clearInterval(this._tick);
      this._tick = null;
    }
  }

  elapsedMs() {
    if (!this.level) return 0;
    const paused = this._pausedTotal + (this._pausedAt ? Date.now() - this._pausedAt : 0);
    return Math.max(0, Date.now() - this._startedAt - paused);
  }

  // ── pause ───────────────────────────────────────────────────────────────

  pause() {
    if (!this.level || this.state.current !== STATES.PLAYING) return false;
    this._pausedAt = Date.now();
    this.state.transition(STATES.PAUSED);
    if (this.host && this.host.setPaused) this.host.setPaused(true);
    this.audio.ui();
    this.bus.emit('level:pause', { n: this.level.n });
    return true;
  }

  resume() {
    if (this.state.current !== STATES.PAUSED) return false;
    this._pausedTotal += Date.now() - this._pausedAt;
    this._pausedAt = 0;
    this.state.transition(STATES.PLAYING);
    if (this.host && this.host.setPaused) this.host.setPaused(false);
    this.bus.emit('level:resume', { n: this.level.n });
    return true;
  }

  togglePause() {
    if (this.state.current === STATES.PLAYING) return this.pause();
    if (this.state.current === STATES.PAUSED) return this.resume();
    return false;
  }

  // ── hints & assist ─────────────────────────────────────────────────────

  hintText() {
    const { params, puzzle, definition } = this.level;
    const parts = [];
    if (params && typeof params.hint === 'string' && params.hint) parts.push(params.hint);
    if (puzzle.how) parts.push(puzzle.how);
    if (this.level.hints === 1 && definition.hint) parts.push(definition.hint);
    if (this.level.hints === 2) parts.push('Try talking it through out loud: the station listens and it counts.');
    if (!parts.length) {
      parts.push('Read the objective again slowly — the wording is the clue.');
      parts.push('Check the pause screen: the rules for stars are listed there.');
    }
    return parts[Math.min(parts.length - 1, Math.max(0, this.level.hints - 1))] || parts[0];
  }

  useHint() {
    if (!this.level) return null;
    this.level.hints += 1;
    this.save.data.stats.hints += 1;
    this.save.scheduleSave();
    this.audio.ui();
    const text = this.hintText();
    this.bus.emit('level:hint', { n: this.level.n, hints: this.level.hints, text, assistReady: this.canAssist() });
    return text;
  }

  canAssist() {
    return !!this.level && this.level.hints >= HINTS_BEFORE_ASSIST;
  }

  /**
   * Let the station finish the level for the player. Score is zeroed and only
   * the completion star is awarded — progress is never blocked.
   */
  async assist() {
    if (!this.level || !this.canAssist()) return false;
    const { puzzle, params } = this.level;
    let steps = [];
    try {
      steps = puzzle.solve(params) || [];
    } catch (err) {
      console.warn('[neurovoid] assist could not plan the level', err);
    }
    if (!steps.length && !puzzle.testAutoSolve) {
      this.bus.emit('toast', { text: 'This chamber has no scripted route — it must be solved by hand.', kind: 'warn' });
      return false;
    }
    const surface = this.root.querySelector('.puzzle-host') || this.root;
    let cancelled = false;
    const cancel = () => { cancelled = true; };
    surface.addEventListener('pointerdown', cancel, { once: true });
    surface.addEventListener('keydown', cancel, { once: true });
    this.assisted = true;
    this.bus.emit('toast', { text: 'Station assist engaged — the station will finish this experiment.', kind: 'info' });
    await applySolution(surface, steps, { ctx: this.puzzleCtx, isCancelled: () => cancelled, delay: 340 });
    if (!cancelled) {
      this.bus.emit('toast', { text: 'Assist complete. Score reduced, progress kept.', kind: 'info' });
    }
    return true;
  }

  cancelAssist() {
    this._assistController = null;
  }

  // ── puzzle callbacks ───────────────────────────────────────────────────

  /** The ctx handed to the mounted puzzle. */
  get puzzleCtx() {
    return this._puzzleCtx || null;
  }

  buildPuzzleCtx({ onStatus } = {}) {
    const game = this;
    const ctx = {
      get level() { return game.level; },
      testMode: this.testMode === true,
      reducedMotion: !!this.settings.reducedMotion,
      difficulty: this.level ? this.level.difficulty : 1,
      rng: new Rng(`${this.level ? this.level.n : 0}:mount`),
      // `settings.audio` is the coarse in-puzzle mute switch; it maps onto the
      // music + sfx pair so the toggle really changes what the player hears.
      settings: new Proxy(this.settings, {
        get: (target, key) => {
          if (key === 'audio') return !!(target.music || target.sfx);
          return target[key];
        }
      }),
      audio: {
        ui: () => this.audio.ui(),
        correct: () => this.audio.correct(),
        wrong: () => this.audio.wrong(),
        fail: () => this.audio.fail()
      },
      solve: (detail) => this.onSolved(detail),
      fail: (reason) => this.onFail(reason),
      setStatus: (text) => { if (onStatus) onStatus(text); },
      announce: (text) => announce(text),
      getFlag: (key, fallback = null) => this.save.getFlag(key, fallback),
      setFlag: (key, value) => this.save.setFlag(key, value),
      getStarCount: () => this.save.totalStars,
      setPauseHint: (text) => { this._pauseHint = text; this.bus.emit('level:pausehint', { text }); },
      setSetting: (key, value) => { this.applySetting(key, value); },
      hint: () => this.hintText()
    };
    this._puzzleCtx = ctx;
    return ctx;
  }

  onSolved(detail = '') {
    if (!this.level || this.state.current !== STATES.PLAYING) return;
    const level = this.level;
    const timeMs = this.elapsedMs();
    this.stopTimer();
    const stars = this.assisted ? 1 : computeStars({ timeMs, attempts: level.attempts, par: level.par });
    const score = this.assisted ? 0 : computeScore({
      timeMs,
      attempts: level.attempts,
      hints: level.hints,
      stars,
      difficulty: level.chapter.id,
      par: level.par
    });
    const outcome = this.save.completeLevel(level.n, {
      stars,
      score,
      timeMs,
      attempts: level.attempts,
      hints: level.hints
    });
    this.audio.complete();
    this.lastResult = { ...outcome, level: level.n, stars, score, timeMs, attempts: level.attempts, hints: level.hints, detail, assisted: this.assisted };
    this.bus.emit('level:solved', this.lastResult);
    this.checkAchievements();
    const discovered = this.collectSecrets();
    this.assisted = false;
    this.show('success', { result: this.lastResult, secrets: discovered }, { state: STATES.SUCCESS });
  }

  onFail(reason = '') {
    if (!this.level || this.state.current !== STATES.PLAYING) return;
    this.level.failed = true;
    this.audio.wrong();
    this.save.data.stats.failures += 1;
    this.save.scheduleSave();
    const allowed = this.level.par.attempts + FAILURE_GRACE;
    if (this.level.attempts >= allowed) {
      this.stopTimer();
      this.show('failure', { reason, attempts: this.level.attempts, allowed }, { state: STATES.FAILURE });
      return;
    }
    this.level.attempts += 1;
    this.bus.emit('level:fail', { reason, attempts: this.level.attempts, allowed });
  }

  retryAfterFailure() {
    if (!this.level) return;
    this.level.attempts += 1;
    this.startLevel(this.level.n);
  }

  // ── achievements, secrets, story ───────────────────────────────────────

  checkAchievements() {
    const unlocked = evaluateAchievements(this.save.data);
    const granted = [];
    for (const achievement of unlocked) {
      if (this.save.grantAchievement(achievement.id, achievement.name)) granted.push(achievement);
    }
    if (granted.length) {
      this.bus.emit('achievements', { list: granted });
      this.audio.secret();
    }
    return granted;
  }

  collectSecrets() {
    const discovered = newlyUnlockedSecrets(this.save.data);
    for (const secret of discovered) {
      this.save.unlockSecret(secret.n, secret.unlock ? unlockDescription(secret.unlock) : 'discovered');
    }
    // an achievement-based secret can cascade (discovering N secrets unlocks more)
    if (discovered.length) {
      const more = this.collectSecrets();
      if (more.length) discovered.push(...more);
    }
    return discovered;
  }

  /** Story beat before/after a chapter — shown between levels, never forced. */
  storyBeatFor(levelNumber) {
    const chapter = chapterForLevel(levelNumber);
    const beat = beatForChapter(chapter.id);
    if (!beat) return null;
    if (this.save.data.storySeen[beat.id]) return null;
    return beat;
  }

  showStory(beat, { after = false } = {}) {
    if (!beat) return false;
    this.save.data.storySeen[beat.id] = Date.now();
    this.save.save(false);
    this.audio.story();
    this.show('story', { beat, after }, { state: STATES.STORY });
    return true;
  }

  storyChoice(beat, choiceId) {
    if (!beat) return;
    this.save.setStoryChoice(beat.id, choiceId);
    this.bus.emit('story:choice', { beat: beat.id, choice: choiceId });
    this.audio.ui();
    this.checkAchievements();
    this.collectSecrets();
  }

  // ── endings ─────────────────────────────────────────────────────────────

  finishRun() {
    const resolved = resolveEnding(this.save.data);
    this.save.data.meta.endings[resolved.ending.id] = Date.now();
    this.save.save(true);
    this.checkAchievements();
    this.audio.secret();
    this.show('ending', { resolved }, { state: STATES.ENDING });
  }

  endingPreview() {
    return resolveEnding(this.save.data);
  }

  // ── settings ────────────────────────────────────────────────────────────

  applySetting(key, value) {
    if (key === 'audio') {
      // puzzles think in terms of a single mute switch
      this.save.setSetting('music', !!value);
      this.save.setSetting('sfx', !!value);
      this.audio.applySettings(this.settings);
      this.bus.emit('setting', { key, value });
      return value;
    }
    this.save.setSetting(key, value);
    this.audio.applySettings(this.settings);
    if (key === 'reducedMotion') document.documentElement.classList.toggle('reduced-motion', !!value);
    if (key === 'highContrast') document.documentElement.classList.toggle('high-contrast', !!value);
    if (key === 'largeText') document.documentElement.classList.toggle('large-text', !!value);
    this.bus.emit('setting', { key, value });
    return value;
  }

  applyAllSettings() {
    const s = this.settings;
    document.documentElement.classList.toggle('reduced-motion', !!s.reducedMotion);
    document.documentElement.classList.toggle('high-contrast', !!s.highContrast);
    document.documentElement.classList.toggle('large-text', !!s.largeText);
    this.audio.applySettings(s);
  }

  // ── progress helpers used by the UI ────────────────────────────────────

  levelStatus(n) {
    const record = this.save.getLevelRecord(n);
    const unlocked = this.save.isUnlocked(n);
    return {
      n,
      record,
      unlocked,
      stars: record ? record.stars : 0,
      bestTime: record ? record.bestTimeMs : 0,
      score: record ? record.score : 0,
      definition: levelDefinition(n)
    };
  }

  chapterProgress(chapterId) {
    const levels = levelsInChapter(chapterId);
    let done = 0;
    let stars = 0;
    for (const level of levels) {
      const record = this.save.getLevelRecord(level.n);
      if (record) {
        done += 1;
        stars += record.stars;
      }
    }
    return { done, total: levels.length, stars, maxStars: levels.length * 3 };
  }

  secretLevels() {
    return ALL_LEVELS.filter((level) => level.secret).map((level) => ({
      ...level,
      unlocked: this.save.isUnlocked(level.n),
      record: this.save.getLevelRecord(level.n)
    }));
  }

  achievements() {
    return ACHIEVEMENTS.map((achievement) => ({
      ...achievement,
      unlocked: this.save.hasAchievement(achievement.id),
      at: this.save.data.achievements[achievement.id] || null
    }));
  }

  chapters() {
    return [...CHAPTERS, SECRET_CHAPTER];
  }

  timeLabel(ms) {
    return formatTime(ms);
  }

  // ── keyboard ───────────────────────────────────────────────────────────

  onKeydown(ev) {
    if (ev.defaultPrevented) return;
    const target = ev.target;
    const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
    if (ev.key === 'Escape') {
      if (this.state.current === STATES.PLAYING || this.state.current === STATES.PAUSED) {
        ev.preventDefault();
        this.togglePause();
      }
      return;
    }
    if (typing) return;
    if ((ev.key === 'p' || ev.key === 'P') && (this.state.current === STATES.PLAYING || this.state.current === STATES.PAUSED)) {
      ev.preventDefault();
      this.togglePause();
    }
  }

  // ── development helper ─────────────────────────────────────────────────

  /** Unlock everything — used by the level report / manual QA, never by players. */
  unlockAll() {
    for (const level of ALL_LEVELS) {
      this.save.data.completed[String(level.n)] = this.save.data.completed[String(level.n)] || {
        stars: 3, score: 900, bestTimeMs: 1000, attempts: 1, hints: 0, completedAt: Date.now()
      };
    }
    this.save.data.unlockedLevel = TOTAL_LEVELS;
    for (const secret of this.secretLevels()) this.save.unlockSecret(secret.n, 'qa');
    this.save.save(true);
  }
}
