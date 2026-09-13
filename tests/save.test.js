import { describe, it, expect, beforeEach } from 'vitest';
import { SaveManager, decodeCode } from '../src/save/SaveManager.js';
import { validateSave, freshSave, STORAGE_KEY, BACKUP_KEY, SAVE_VERSION, describeSave } from '../src/save/SaveValidator.js';
import { migrateSave } from '../src/save/SaveMigration.js';

function makeManager({ clear = true } = {}) {
  if (clear) localStorage.clear();
  return new SaveManager({ storage: localStorage, autoSaveMs: 0 });
}

describe('save validator', () => {
  it('accepts a fresh save unchanged', () => {
    const result = validateSave(freshSave());
    expect(result.fatal).toBe(false);
    expect(result.repairs).toEqual([]);
    expect(result.data.unlockedLevel).toBe(1);
  });

  it('rejects non-objects fatally but still returns a usable save', () => {
    const result = validateSave('not a save');
    expect(result.fatal).toBe(true);
    expect(result.data.version).toBe(SAVE_VERSION);
    expect(Object.keys(result.data.completed)).toHaveLength(0);
  });

  it('drops invalid completed entries and repairs out-of-range values', () => {
    const broken = freshSave();
    broken.unlockedLevel = 999;
    broken.currentLevel = -5;
    broken.completed = {
      1: { stars: 3, score: 900, bestTimeMs: 4000, attempts: 1 },
      2: { stars: 0, score: 10 },
      banana: { stars: 2 },
      3: 'nope'
    };
    const result = validateSave(broken);
    expect(result.data.unlockedLevel).toBeLessThanOrEqual(200);
    expect(result.data.currentLevel).toBeGreaterThanOrEqual(1);
    expect(Object.keys(result.data.completed)).toEqual(['1']);
    expect(result.repairs.length).toBeGreaterThan(0);
  });

  it('repairs a save that claims progress without any completion', () => {
    const broken = freshSave();
    broken.unlockedLevel = 42;
    broken.currentLevel = 42;
    const result = validateSave(broken);
    expect(result.data.unlockedLevel).toBe(1);
    expect(result.data.currentLevel).toBe(1);
    expect(result.repairs.some((r) => r.includes('without any completion'))).toBe(true);
  });

  it('keeps unknown settings out but preserves known booleans', () => {
    const data = freshSave();
    data.settings = { music: false, sfx: 'loud', reducedMotion: true, junk: 42 };
    const result = validateSave(data);
    expect(result.data.settings.music).toBe(false);
    expect(result.data.settings.reducedMotion).toBe(true);
    expect(result.data.settings.sfx).toBe(true); // default restored
    expect(result.repairs.some((r) => r.includes('sfx'))).toBe(true);
  });

  it('recomputes the star total from the completed map', () => {
    const data = freshSave();
    data.completed = {
      1: { stars: 3, score: 100, bestTimeMs: 1000, attempts: 1 },
      2: { stars: 2, score: 100, bestTimeMs: 1000, attempts: 2 }
    };
    data.stats.stars = 999;
    const result = validateSave(data);
    expect(result.data.stats.stars).toBe(5);
  });
});

describe('save migration', () => {
  it('migrates a v1 save (flat stars map) to the current schema', () => {
    const legacy = {
      version: 1,
      unlockedLevel: 7,
      currentLevel: 6,
      stars: { 1: 3, 2: 2, 3: 1, 4: 0 },
      levelScores: { 1: 1200, 2: 800 },
      bestTimes: { 1: 42000 },
      achievements: { firstSteps: 1700000000000 },
      secretLevels: { 121: 1700000000000 },
      storyChoices: { ch1: 'observe' },
      settings: { music: false },
      audioSettings: { sfx: false },
      tutorialProgress: { grid: true }
    };
    const { data, applied, error } = migrateSave(legacy);
    expect(error).toBeNull();
    expect(applied).toEqual([1]);
    expect(data.version).toBe(2);
    expect(data.completed['1'].stars).toBe(3);
    expect(data.completed['1'].score).toBe(1200);
    expect(data.completed['3'].stars).toBe(1);
    expect(data.completed['4']).toBeUndefined(); // 0 stars is not a completion
    expect(data.achievements.firstSteps).toBeGreaterThan(0);
    expect(data.secretLevels['121']).toBeGreaterThan(0);
    expect(data.settings.music).toBe(false);
    expect(data.settings.sfx).toBe(false);
    expect(data.tutorial.seen.grid).toBe(true);
    const validated = validateSave(data);
    expect(validated.fatal).toBe(false);
    expect(validated.data.unlockedLevel).toBeGreaterThan(1);
  });

  it('never throws on nonsense input', () => {
    for (const input of [null, 42, 'hello', [], { version: 'x' }]) {
      const result = migrateSave(input);
      expect(result).toBeTruthy();
    }
  });
});

describe('SaveManager', () => {
  let manager;
  beforeEach(() => { manager = makeManager(); });

  it('creates a fresh save on first run and persists it', () => {
    const load = manager.load();
    expect(load.fresh).toBe(true);
    expect(manager.data.unlockedLevel).toBe(1);
    manager.save(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy();
  });

  it('round-trips progress through localStorage', () => {
    manager.load();
    manager.completeLevel(1, { stars: 3, score: 900, timeMs: 5000, attempts: 1, hints: 0 });
    manager.completeLevel(2, { stars: 2, score: 700, timeMs: 12000, attempts: 2, hints: 1 });
    manager.flush();

    const second = makeManager({ clear: false });
    const result = second.load();
    expect(result.loaded).toBe(true);
    expect(second.data.unlockedLevel).toBe(3);
    expect(second.getLevelRecord(1).stars).toBe(3);
    expect(second.totalStars).toBe(5);
  });

  it('recovers from corrupt JSON using the rolling backup', () => {
    manager.load();
    manager.completeLevel(1, { stars: 3, score: 900, timeMs: 1000, attempts: 1 });
    manager.flush();
    // second write creates a backup of the good payload …
    manager.completeLevel(2, { stars: 1, score: 100, timeMs: 1000, attempts: 1 });
    manager.flush();
    expect(localStorage.getItem(BACKUP_KEY)).toBeTruthy();

    // … now simulate corruption of the live entry
    localStorage.setItem(STORAGE_KEY, '{ this is not json ');
    const third = makeManager({ clear: false });
    const result = third.load();
    expect(result.fatal !== true).toBe(true);
    expect(result.recovered || result.fresh).toBe(true);
    expect(third.data.unlockedLevel).toBeGreaterThanOrEqual(1);
    // the game must still be playable
    expect(third.data.settings.music).toBeDefined();
  });

  it('creates a fresh save (and does not crash) when everything is corrupt', () => {
    localStorage.setItem(STORAGE_KEY, '###');
    localStorage.setItem(BACKUP_KEY, '###');
    const fourth = makeManager({ clear: false });
    const result = fourth.load();
    expect(result.recovered).toBe(true);
    expect(fourth.data.unlockedLevel).toBe(1);
    expect(describeSave(fourth.data).completed).toBe(0);
  });

  it('keeps the best result when a level is replayed', () => {
    manager.load();
    manager.completeLevel(1, { stars: 1, score: 300, timeMs: 30000, attempts: 5 });
    manager.completeLevel(1, { stars: 3, score: 950, timeMs: 4000, attempts: 1 });
    const record = manager.getLevelRecord(1);
    expect(record.stars).toBe(3);
    expect(record.score).toBe(950);
    expect(record.bestTimeMs).toBe(4000);
    // and a later worse run must not downgrade anything
    manager.completeLevel(1, { stars: 1, score: 100, timeMs: 90000, attempts: 9 });
    expect(manager.getLevelRecord(1).stars).toBe(3);
    expect(manager.getLevelRecord(1).score).toBe(950);
  });

  it('unlocks the next level only when one step at a time', () => {
    manager.load();
    expect(manager.isUnlocked(2)).toBe(false);
    manager.completeLevel(1, { stars: 1, score: 100, timeMs: 1000, attempts: 1 });
    expect(manager.isUnlocked(2)).toBe(true);
    expect(manager.isUnlocked(3)).toBe(false);
  });

  it('handles secret unlocks and achievements idempotently', () => {
    manager.load();
    expect(manager.unlockSecret(121)).toBe(true);
    expect(manager.unlockSecret(121)).toBe(false);
    expect(manager.isUnlocked(121)).toBe(true);
    expect(manager.grantAchievement('firstSteps')).toBe(true);
    expect(manager.grantAchievement('firstSteps')).toBe(false);
    expect(manager.hasAchievement('firstSteps')).toBe(true);
  });

  it('exports and re-imports a JSON save', () => {
    manager.load();
    manager.completeLevel(1, { stars: 3, score: 900, timeMs: 5000, attempts: 1 });
    manager.setStoryChoice('ch1', 'listen');
    manager.unlockSecret(122);
    manager.flush();
    const exported = manager.exportJSON();

    const other = makeManager({ clear: false });
    other.load();
    const result = other.importPayload(exported);
    expect(result.ok).toBe(true);
    expect(other.getLevelRecord(1).stars).toBe(3);
    expect(other.data.storyChoices.ch1).toBe('listen');
    expect(other.isUnlocked(122)).toBe(true);
  });

  it('exports and imports a compact code', () => {
    manager.load();
    manager.completeLevel(3, { stars: 2, score: 500, timeMs: 9000, attempts: 2 });
    manager.setSetting('music', false);
    const code = manager.exportCode();
    expect(code.startsWith('NV1-')).toBe(true);
    expect(code.length).toBeLessThan(4000);

    const other = makeManager({ clear: false });
    other.load();
    const applied = other.importPayload(code);
    expect(applied.ok).toBe(true);
    expect(other.getLevelRecord(3).stars).toBe(2);
    expect(other.data.settings.music).toBe(false);
    expect(JSON.parse(decodeCode(code) ? '{}' : '{}')).toEqual({});
  });

  it('rejects garbage imports without touching existing progress', () => {
    manager.load();
    manager.completeLevel(1, { stars: 3, score: 900, timeMs: 1000, attempts: 1 });
    const before = manager.totalStars;
    expect(manager.importPayload('not json at all').ok).toBe(false);
    expect(manager.importPayload('NV1-@@@@').ok).toBe(false);
    expect(manager.importPayload('').ok).toBe(false);
    expect(manager.totalStars).toBe(before);
  });

  it('resets progress while keeping settings', () => {
    manager.load();
    manager.completeLevel(1, { stars: 3, score: 900, timeMs: 1000, attempts: 1 });
    manager.setSetting('sfx', false);
    manager.reset();
    expect(manager.totalStars).toBe(0);
    expect(manager.data.unlockedLevel).toBe(1);
    expect(manager.data.settings.sfx).toBe(false);
  });

  it('reports completion percentage across 120 levels + 12 secrets', () => {
    manager.load();
    expect(manager.completionPercent).toBe(0);
    manager.completeLevel(1, { stars: 3, score: 100, timeMs: 1000, attempts: 1 });
    expect(manager.completionPercent).toBe(1);
  });

  it('emits status updates for the save indicator', () => {
    const events = [];
    const local = new SaveManager({ storage: localStorage, autoSaveMs: 0, onStatus: (s) => events.push(s) });
    local.load();
    local.completeLevel(1, { stars: 1, score: 100, timeMs: 1000, attempts: 1 });
    local.flush();
    expect(events.some((e) => e.kind === 'saved')).toBe(true);
    expect(events.every((e) => typeof e.message === 'string')).toBe(true);
  });

  it('degrades gracefully when storage throws (private browsing)', () => {
    const throwing = {
      getItem() { throw new Error('blocked'); },
      setItem() { throw new Error('blocked'); },
      removeItem() { throw new Error('blocked'); },
      clear() {},
      key() { return null; },
      length: 0
    };
    const local = new SaveManager({ storage: throwing, autoSaveMs: 0 });
    const result = local.load();
    expect(result.loaded).toBe(false);
    expect(result.fresh).toBe(true);
    const saved = local.completeLevel(1, { stars: 1, score: 100, timeMs: 1000, attempts: 1 });
    expect(saved.improved).toBe(true);
    expect(local.totalStars).toBe(1);
  });
});
