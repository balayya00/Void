/**
 * Save portability: JSON export/import and the compact copy-paste code.
 *
 * These tests simulate the real cross-device workflow: export on one "device",
 * import on another, and confirm the progress, settings and unlocks survive —
 * including through a corrupted and a legacy save.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SaveManager, decodeCode } from '../src/save/SaveManager.js';
import { STORAGE_KEY, SAVE_VERSION } from '../src/save/SaveValidator.js';

function seededDevice(overrides = {}) {
  localStorage.clear();
  const manager = new SaveManager({ storage: localStorage, autoSaveMs: 0 });
  manager.load();
  manager.completeLevel(1, { stars: 3, score: 900, timeMs: 4200, attempts: 1, hints: 0 });
  manager.completeLevel(2, { stars: 2, score: 640, timeMs: 21000, attempts: 3, hints: 1 });
  manager.setSetting('music', false);
  manager.setSetting('highContrast', true);
  manager.setStoryChoice('ch1', 'kind');
  manager.unlockSecret(121, 'stars');
  manager.grantAchievement('first-steps', 'First Contact');
  manager.save(true);
  Object.assign(manager.data, overrides);
  return manager;
}

describe('JSON export / import', () => {
  it('carries progress between devices', () => {
    const source = seededDevice();
    const exported = source.exportJSON();
    const envelope = JSON.parse(exported);
    expect(envelope.app).toBe('NEURO//VOID');
    expect(envelope.save.version).toBe(SAVE_VERSION);

    localStorage.clear();
    const target = new SaveManager({ storage: localStorage, autoSaveMs: 0 });
    target.load();
    const result = target.importPayload(exported);
    expect(result.ok).toBe(true);
    expect(target.totalStars).toBe(5);
    expect(target.getLevelRecord(1).bestTimeMs).toBe(4200);
    expect(target.data.settings.music).toBe(false);
    expect(target.data.settings.highContrast).toBe(true);
    expect(target.data.storyChoices.ch1).toBe('kind');
    expect(target.isUnlocked(121)).toBe(true);
    expect(target.hasAchievement('first-steps')).toBe(true);
  });

  it('accepts a bare save object (not only the exported envelope)', () => {
    const source = seededDevice();
    const bare = JSON.stringify(source.data);
    const target = new SaveManager({ storage: localStorage, autoSaveMs: 0 });
    target.load();
    expect(target.importPayload(bare).ok).toBe(true);
    expect(target.totalStars).toBe(5);
  });

  it('persists the imported save so a reload finds it', () => {
    const source = seededDevice();
    const target = new SaveManager({ storage: localStorage, autoSaveMs: 0 });
    target.load();
    target.importPayload(source.exportJSON());
    const reloaded = new SaveManager({ storage: localStorage, autoSaveMs: 0 });
    reloaded.load();
    expect(reloaded.totalStars).toBe(5);
    expect(reloaded.data.settings.highContrast).toBe(true);
  });

  it('rejects junk without destroying the current save', () => {
    const target = seededDevice();
    const before = JSON.stringify(target.data);
    for (const junk of ['', '   ', 'hello', '{"not":"a save"}', '[1,2,3]', 'NV1-nonsense', '{"save":42}', '{"version":"x"}']) {
      const result = target.importPayload(junk);
      expect(result.ok, `junk ${JSON.stringify(junk)} should be rejected`).toBe(false);
      expect(JSON.stringify(target.data)).toBe(before);
    }
  });

  it('repairs and reports a partially damaged export instead of failing', () => {
    const source = seededDevice();
    const parsed = JSON.parse(source.exportJSON());
    parsed.save.completed['99'] = { stars: 7, score: -12, bestTimeMs: -5, attempts: 'many' };
    parsed.save.unlockedLevel = 8000;
    parsed.save.settings = { music: 'yes', junk: true };
    const target = new SaveManager({ storage: localStorage, autoSaveMs: 0 });
    target.load();
    const result = target.importPayload(JSON.stringify(parsed));
    expect(result.ok).toBe(true);
    expect(result.repairs.length).toBeGreaterThan(0);
    expect(target.getLevelRecord(99).stars).toBeLessThanOrEqual(3);
    expect(target.data.unlockedLevel).toBeLessThanOrEqual(200);
    expect(target.data.settings.music).toBe(true); // default restored
  });

  it('imports a v1 save (migration + validation together)', () => {
    const legacy = {
      version: 1,
      unlockedLevel: 4,
      stars: { 1: 2, 2: 3, 3: 1 },
      settings: { music: false }
    };
    const target = new SaveManager({ storage: localStorage, autoSaveMs: 0 });
    target.load();
    const result = target.importPayload(JSON.stringify(legacy));
    expect(result.ok).toBe(true);
    expect(result.migrations).toEqual([1]);
    expect(target.totalStars).toBe(6);
    expect(target.data.unlockedLevel).toBe(4);
  });
});

describe('compact save code', () => {
  let device;
  beforeEach(() => {
    device = seededDevice();
  });

  it('round-trips through a short pasteable string', () => {
    const code = device.exportCode();
    expect(code.startsWith('NV1-')).toBe(true);
    expect(code.length).toBeLessThan(1500);
    expect(code).not.toContain(' ');

    const target = new SaveManager({ storage: localStorage, autoSaveMs: 0 });
    target.load();
    const result = target.importPayload(code);
    expect(result.ok).toBe(true);
    expect(target.totalStars).toBe(5);
    expect(target.completedCount).toBe(2);
    expect(target.data.storyChoices.ch1).toBe('kind');
    expect(target.isUnlocked(121)).toBe(true);
  });

  it('tolerates surrounding whitespace and line breaks', () => {
    const code = device.exportCode();
    const target = new SaveManager({ storage: localStorage, autoSaveMs: 0 });
    target.load();
    expect(target.importPayload(`\n  ${code}  \n`).ok).toBe(true);
    expect(target.totalStars).toBe(5);
  });

  it('decodes to a plain object that can be inspected', () => {
    const decoded = decodeCode(device.exportCode());
    expect(decoded).toBeTruthy();
    expect(decoded.unlockedLevel).toBe(3);
    expect(decoded.completed['1'].stars).toBe(3);
  });

  it('rejects a truncated code', () => {
    const code = device.exportCode();
    const target = new SaveManager({ storage: localStorage, autoSaveMs: 0 });
    target.load();
    expect(target.importPayload(code.slice(0, code.length - 12)).ok).toBe(false);
  });

  it('handles empty states without throwing', () => {
    localStorage.clear();
    const empty = new SaveManager({ storage: localStorage, autoSaveMs: 0 });
    empty.load();
    const code = empty.exportCode();
    expect(code.startsWith('NV1-')).toBe(true);
    const restored = new SaveManager({ storage: localStorage, autoSaveMs: 0 });
    restored.load();
    expect(restored.importPayload(code).ok).toBe(true);
    expect(restored.completedCount).toBe(0);
  });
});

describe('storage limits & recovery', () => {
  it('keeps the game playable when the storage quota is exceeded', () => {
    let writes = 0;
    const tiny = {
      data: new Map(),
      getItem(key) { return this.data.has(key) ? this.data.get(key) : null; },
      setItem(key, value) {
        writes++;
        if (String(value).length > 600) throw new Error('QuotaExceededError');
        this.data.set(key, String(value));
      },
      removeItem(key) { this.data.delete(key); },
      clear() { this.data.clear(); },
      key(i) { return [...this.data.keys()][i] ?? null; },
      get length() { return this.data.size; }
    };
    const manager = new SaveManager({ storage: tiny, autoSaveMs: 0 });
    manager.load();
    for (let n = 1; n <= 8; n++) manager.completeLevel(n, { stars: 3, score: 500, timeMs: 1000, attempts: 1 });
    // the run must survive in memory even when every write is rejected
    expect(manager.totalStars).toBe(24);
    expect(writes).toBeGreaterThan(0);
    expect(manager.memoryOnly).toBe(true);
    // and the game must still be able to export that in-memory progress
    expect(JSON.parse(manager.exportJSON()).save.completed['8'].stars).toBe(3);
  });

  it('recovers progress from the backup copy after corruption', () => {
    const device = seededDevice();
    device.completeLevel(3, { stars: 3, score: 700, timeMs: 3000, attempts: 1 });
    device.save(true);
    const good = localStorage.getItem(STORAGE_KEY);
    device.completeLevel(4, { stars: 3, score: 700, timeMs: 3000, attempts: 1 });
    device.save(true); // this write pushes the "good" copy into the backup slot

    localStorage.setItem(STORAGE_KEY, good.slice(0, 40) + '##corrupt');
    const recovered = new SaveManager({ storage: localStorage, autoSaveMs: 0 });
    const result = recovered.load();
    expect(result.recovered).toBe(true);
    expect(recovered.totalStars).toBeGreaterThanOrEqual(5);
  });
});
