/**
 * End-to-end app tests.
 *
 * These boot the real game in jsdom and click through it the way a player
 * would: menu → level → solve → success → next, pause and resume, level map,
 * settings, save transfer. They exist to catch wiring mistakes that unit tests
 * cannot see (missing screen registration, a leaked timer, a dead button).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

window.__NEUROVOID_TEST__ = true;

const { boot } = await import('../src/main.js');
const { SaveManager } = await import('../src/save/SaveManager.js');
const { validateLevel } = await import('../src/levels/LevelManager.js');

const realMatchMedia = window.matchMedia;
const realGetContext = window.HTMLCanvasElement.prototype.getContext;

let App;

function mountApp() {
  try { localStorage.clear(); } catch (err) { /* storage may be blocked in this test */ }
  document.body.innerHTML = '<div id="app"></div>';
  App = boot(document.getElementById('app'));
  App.game.host = App.shell;
  // Automated tests skip the "watch this" delays; players never do.
  App.game.testMode = true;
  return App;
}

function clickToken(root, token) {
  const node = [...root.querySelectorAll(`[data-token="${token}"]`)][0];
  if (!node) throw new Error(`token ${token} not found`);
  node.click();
  return node;
}

function screen() {
  return document.querySelector('.screen');
}

/** Solve the currently mounted puzzle using its own solution, single-step. */
async function solveCurrentPuzzle(steps = 1) {
  const { game } = App;
  const level = game.level;
  const host = document.querySelector('.puzzle-host');
  const solution = level.puzzle.solve(level.params) || [];
  let performed = 0;
  for (const step of solution) {
    if (performed >= steps) break;
    if (typeof step === 'string') {
      const node = [...host.querySelectorAll(`[data-token="${step}"]`)][0];
      if (!node) throw new Error(`solution token ${step} missing`);
      node.click();
      performed++;
    } else if (step && step.click) {
      clickToken(host, step.click);
      performed++;
    } else if (step && step.hold) {
      const node = [...host.querySelectorAll(`[data-token="${step.hold}"]`)][0];
      node.__forceComplete();
      performed++;
    } else if (step && step.type !== undefined) {
      const input = [...host.querySelectorAll(`[data-token="${step.into || 'answer'}"]`)][0];
      input.value = String(step.type);
      const submit = [...host.querySelectorAll(`[data-token="${(step.into || 'answer')}-submit"]`)][0]
        || host.querySelector('.answer-row .btn-primary');
      submit.click();
      performed++;
    } else if (step && step.wait) {
      // skip waits
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return performed;
}

beforeEach(() => {
  mountApp();
});

afterEach(() => {
  try {
    App.game.destroy();
  } catch (err) { /* ignore */ }
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  window.matchMedia = realMatchMedia;
  window.HTMLCanvasElement.prototype.getContext = realGetContext;
});

describe('boot', () => {
  it('starts on the main menu with the boot screen removed', () => {
    expect(screen().dataset.screen).toBe('menu');
    expect(document.querySelector('.boot-screen')).toBeNull();
    expect(document.getElementById('app').getAttribute('aria-busy')).toBe('false');
  });

  it('creates a save on the first visit', () => {
    expect(App.save.data.unlockedLevel).toBe(1);
    expect(localStorage.getItem('neurovoid_save_v1')).toBeTruthy();
  });

  it('shows every required menu entry', () => {
    const text = screen().textContent;
    for (const label of ['CONTINUE', 'NEW GAME', 'LEVELS', 'ACHIEVEMENTS', 'SETTINGS', 'IMPORT / EXPORT SAVE', 'CREDITS']) {
      expect(text, `menu should offer ${label}`).toContain(label);
    }
  });

  it('keeps the shell and screen host alive after a failure in a screen factory', () => {
    App.game.register('__broken', () => { throw new Error('boom'); });
    App.game.show('__broken', {}, { state: 'menu' });
    expect(screen().textContent).toContain('subsystem failed');
    App.game.show('menu', {}, { state: 'menu' });
    expect(screen().dataset.screen).toBe('menu');
  });
});

describe('playing a level', () => {
  it('starts level 1 from the menu (through the opening story beat) and mounts a puzzle', () => {
    clickToken(document, 'continue');
    // a fresh save opens the first story beat before the first experiment
    expect(screen().dataset.screen).toBe('story');
    document.querySelector('.story-option').click();
    [...document.querySelectorAll('button')].find((b) => b.textContent.includes('CONTINUE TO EXPERIMENT')).click();
    expect(App.game.level.n).toBe(1);
    expect(document.querySelector('.puzzle-host')).toBeTruthy();
    expect(document.querySelector('.hud')).toBeTruthy();
  });

  it('sets the objective, chapter and par values in the HUD', () => {
    App.game.startLevel(1);
    const hud = document.querySelector('.hud').textContent;
    expect(hud).toContain('CHAPTER 1');
    expect(hud).toContain('EXPERIMENT 001');
    expect(hud).toContain('ATTEMPTS');
  });

  it('completes level 1, awards stars, saves and moves on', async () => {
    App.game.startLevel(1);
    await solveCurrentPuzzle(999);
    expect(screen().dataset.screen).toBe('success');
    expect(App.save.getLevelRecord(1)).toBeTruthy();
    expect(App.save.getLevelRecord(1).stars).toBeGreaterThanOrEqual(1);
    const next = [...document.querySelectorAll('.btn-row button')].find((b) => b.textContent.includes('NEXT'));
    expect(next).toBeTruthy();
    next.click();
    expect(App.game.level.n).toBe(2);
  });

  it('unlocks the next level in the save as soon as one is finished', async () => {
    App.game.startLevel(1);
    await solveCurrentPuzzle(999);
    App.save.flush();
    const reloaded = new SaveManager({ storage: localStorage, autoSaveMs: 0 });
    reloaded.load();
    expect(reloaded.isUnlocked(2)).toBe(true);
  });

  it('pause and resume keep the puzzle mounted and the state consistent', () => {
    App.game.startLevel(1);
    const host = document.querySelector('.puzzle-host');
    App.game.pause();
    expect(App.game.state.current).toBe('paused');
    expect(document.querySelector('.overlay')).toBeTruthy();
    expect(document.querySelector('.puzzle-host')).toBe(host); // same node: nothing was rebuilt
    App.game.resume();
    expect(App.game.state.current).toBe('playing');
    expect(document.querySelector('.overlay')).toBeNull();
  });

  it('restarting a level rebuilds the same puzzle deterministically', async () => {
    App.game.startLevel(5);
    const before = JSON.stringify(App.game.level.params, (k, v) => (typeof v === 'function' ? undefined : v));
    App.game.restartLevel();
    const after = JSON.stringify(App.game.level.params, (k, v) => (typeof v === 'function' ? undefined : v));
    expect(after).toBe(before);
  });

  it('records an attempt when a puzzle reports a failure', () => {
    App.game.startLevel(1);
    const before = App.game.level.attempts;
    App.game.onFail('nope');
    expect(App.game.level.attempts).toBe(before + 1);
    expect(App.save.data.stats.failures).toBeGreaterThan(0);
  });

  it('eventually shows the failure screen instead of dead-ending the player', () => {
    App.game.startLevel(1);
    for (let i = 0; i < 10; i++) App.game.onFail('nope');
    expect(screen().dataset.screen).toBe('failure');
    const retry = [...document.querySelectorAll('.btn-row button')].find((b) => b.textContent.includes('TRY AGAIN'));
    retry.click();
    expect(App.game.state.current).toBe('playing');
  });

  it('gives a hint, then offers the station assist after three', () => {
    App.game.startLevel(1);
    expect(App.game.canAssist()).toBe(false);
    expect(App.game.useHint()).toBeTruthy();
    App.game.useHint();
    App.game.useHint();
    expect(App.game.canAssist()).toBe(true);
    expect(App.save.data.stats.hints).toBe(3);
  });

  it('never leaks the level timer after leaving', () => {
    App.game.startLevel(1);
    expect(App.game._tick).toBeTruthy();
    App.game.leaveLevel();
    expect(App.game._tick).toBeNull();
    expect(screen().dataset.screen).toBe('levels');
  });
});

describe('level map', () => {
  it('lists the first chapter with ten experiments', () => {
    App.game.show('levels', {}, { state: 'levels' });
    const cards = document.querySelectorAll('.level-card');
    expect(cards.length).toBeGreaterThanOrEqual(10);
    expect(screen().textContent).toContain('EXPERIMENT MAP');
  });

  it('shows a lock on levels that are not unlocked yet', () => {
    App.game.show('levels', {}, { state: 'levels' });
    const locked = [...document.querySelectorAll('.level-card')].filter((c) => c.classList.contains('locked'));
    expect(locked.length).toBeGreaterThan(0);
    expect(locked[0].textContent).toContain('LOCKED');
  });

  it('opens a chapter tab and shows the secret chapter', () => {
    App.game.show('levels', {}, { state: 'levels' });
    const tabs = [...document.querySelectorAll('.chapter-tab')];
    expect(tabs.length).toBe(13);
    tabs[12].click();
    expect(screen().textContent).toContain('Void Archive');
  });
});

describe('settings & accessibility toggles', () => {
  it('applies and persists every toggle', () => {
    App.game.show('settings', {}, { state: 'settings' });
    const inputs = [...document.querySelectorAll('.switch-input')];
    expect(inputs.length).toBe(5);
    const contrast = inputs.find((i) => i.id === 'setting-highContrast');
    contrast.checked = true;
    contrast.dispatchEvent(new Event('change'));
    expect(App.save.data.settings.highContrast).toBe(true);
    expect(document.documentElement.classList.contains('high-contrast')).toBe(true);

    const motion = inputs.find((i) => i.id === 'setting-reducedMotion');
    motion.checked = true;
    motion.dispatchEvent(new Event('change'));
    expect(document.documentElement.classList.contains('reduced-motion')).toBe(true);

    const music = inputs.find((i) => i.id === 'setting-music');
    music.checked = false;
    music.dispatchEvent(new Event('change'));
    expect(App.save.data.settings.music).toBe(false);
  });

  it('respects the reduced-motion token in the stylesheet contract', () => {
    // jsdom has no layout engine, so the contract is asserted through the class
    // the game toggles — the CSS keys off exactly this hook.
    App.game.applySetting('reducedMotion', true);
    expect(document.documentElement.classList.contains('reduced-motion')).toBe(true);
    App.game.applySetting('reducedMotion', false);
    expect(document.documentElement.classList.contains('reduced-motion')).toBe(false);
  });
});

describe('save data screen', () => {
  it('exports a code, resets and imports it back', async () => {
    App.game.startLevel(1);
    await solveCurrentPuzzle(999);
    App.game.show('save-data', {}, { state: 'save-data' });
    const code = document.querySelector('.code-field').value;
    expect(code.startsWith('NV1-')).toBe(true);

    App.save.reset({ keepSettings: true });
    expect(App.save.totalStars).toBe(0);

    const importField = document.querySelectorAll('.code-field')[1];
    importField.value = code;
    const button = [...document.querySelectorAll('button')].find((b) => b.textContent === 'IMPORT PASTED DATA');
    button.click();
    expect(App.save.totalStars).toBeGreaterThan(0);
  });

  it('rejects junk input with a message instead of throwing', () => {
    App.game.show('save-data', {}, { state: 'save-data' });
    const importField = document.querySelectorAll('.code-field')[1];
    importField.value = 'definitely not a save';
    [...document.querySelectorAll('button')].find((b) => b.textContent === 'IMPORT PASTED DATA').click();
    expect(document.querySelector('.status-line').textContent).toContain('rejected');
  });
});

describe('story & endings', () => {
  it('plays a story beat and records the chosen reply', () => {
    App.game.startLevel(10);
    const beat = App.game.storyBeatFor(10);
    App.game.showStory(beat);
    expect(screen().dataset.screen).toBe('story');
    const option = document.querySelector('.story-option');
    option.click();
    const cont = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('CONTINUE TO EXPERIMENT'));
    cont.click();
    expect(Object.values(App.save.data.storyChoices)).toContain('obey');
  });

  it('resolves a deterministic ending from the save, never randomly', () => {
    const first = App.game.endingPreview().ending.id;
    const second = App.game.endingPreview().ending.id;
    expect(first).toBe(second);
    expect(['witness', 'severance', 'merge', 'quiet']).toContain(first);
  });

  it('reaches a different ending after a defiant playthrough with secrets', () => {
    for (let n = 1; n <= 120; n++) App.save.data.completed[String(n)] = { stars: 3, score: 800, bestTimeMs: 4000, attempts: 1, hints: 0, completedAt: Date.now() };
    App.save.setStoryChoice('ch1', 'defiant');
    App.save.setStoryChoice('ch4', 'defiant');
    for (const secret of [121, 122, 123, 124, 125, 126, 127, 128, 129, 130]) App.save.unlockSecret(secret);
    const resolved = App.game.endingPreview();
    expect(resolved.ending.id).toBe('quiet');
    expect(resolved.reasons.length).toBeGreaterThan(0);
  });

  it('shows the ending screen with all four doors', () => {
    App.game.show('ending', { resolved: App.game.endingPreview() }, { state: 'ending' });
    const text = screen().textContent;
    expect(text).toContain('THE FOUR DOORS');
    expect(text).toContain('WITNESS');
  });
});

describe('achievements & secrets', () => {
  it('grants the first badge after the first experiment', async () => {
    App.game.startLevel(1);
    await solveCurrentPuzzle(999);
    expect(App.save.hasAchievement('first-steps')).toBe(true);
  });

  it('unlocks secret chambers when their conditions are met', () => {
    for (let n = 1; n <= 10; n++) App.save.data.completed[String(n)] = { stars: 3, score: 100, bestTimeMs: 1000, attempts: 1, hints: 0, completedAt: Date.now() };
    const discovered = App.game.collectSecrets();
    expect(discovered.length).toBeGreaterThan(0);
    expect(App.save.isUnlocked(121)).toBe(true);
  });

  it('links a solved stillness chamber to its badge and secret chamber', async () => {
    App.game.startLevel(88); // meta.stillness — solved by doing nothing at all
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(App.save.getFlag('stillness:done')).toBeTruthy();
    expect(App.save.hasAchievement('silence')).toBe(true);
    expect(App.save.isUnlocked(122)).toBe(true);
  });

  it('lets an in-puzzle mute switch really change the audio settings', () => {
    App.game.startLevel(94); // meta.setting asks for the mute switch
    const ctx = App.game.puzzleCtx;
    const before = ctx.settings.audio;
    ctx.setSetting('audio', !before);
    expect(App.save.data.settings.music).toBe(!before);
    expect(App.save.data.settings.sfx).toBe(!before);
    expect(App.game.puzzleCtx.settings.audio).toBe(!before);
  });

  it('hides a findable control in the menu footer (secret route)', () => {
    App.game.show('menu', {}, { state: 'menu' });
    const sigil = document.querySelector('.sigil');
    expect(sigil).toBeTruthy();
    sigil.click();
    expect(App.save.getFlag('hiddenui:found')).toBeTruthy();
    expect(App.save.hasAchievement('latch')).toBe(true);
  });
});

describe('robustness', () => {
  it('survives a corrupt save on boot and still plays', () => {
    localStorage.setItem('neurovoid_save_v1', '{"broken":');
    document.body.innerHTML = '<div id="app"></div>';
    const recovered = boot(document.getElementById('app'));
    expect(recovered.game.save.data.unlockedLevel).toBe(1);
    recovered.game.startLevel(1);
    expect(document.querySelector('.puzzle-host')).toBeTruthy();
    recovered.game.destroy();
  });

  it('warns instead of crashing when storage is blocked', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new Error('blocked by browser settings'); }
    });
    expect(() => mountApp()).not.toThrow();
    expect(App.save.available).toBe(false);
    App.game.startLevel(1);
    expect(document.querySelector('.puzzle-host')).toBeTruthy();
    Object.defineProperty(window, 'localStorage', original);
  });

  it('keeps every level definition playable (spot check across the game)', () => {
    for (const n of [1, 30, 60, 90, 100, 120, 132]) {
      const result = validateLevel(n);
      expect(result.errors, `level ${n}`).toEqual([]);
    }
  });

  it('never leaves a stale screen behind when navigating quickly', () => {
    for (const name of ['menu', 'levels', 'settings', 'achievements', 'save-data', 'help']) {
      App.game.show(name, {}, { state: name === 'levels' || name === 'achievements' ? 'levels' : name === 'menu' ? 'menu' : name === 'settings' ? 'settings' : name === 'save-data' ? 'save-data' : 'credits' });
    }
    expect(document.querySelectorAll('.screen').length).toBe(1);
  });
});
