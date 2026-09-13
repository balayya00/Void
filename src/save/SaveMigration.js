/**
 * Save migration.
 *
 * Every shipped schema keeps a migration path here. Migrations are pure
 * functions (old data in → newer data out) which makes them trivial to test and
 * impossible to break at runtime: a failing migration falls back to the
 * validator's repair pass instead of throwing.
 */

import { SAVE_VERSION, freshSave, defaultSettings } from './SaveValidator.js';

function mapToTimestamps(value) {
  const out = {};
  if (!value || typeof value !== 'object') return out;
  for (const [key, v] of Object.entries(value)) {
    if (typeof key !== 'string' || key.length > 64) continue;
    out[key] = typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : Date.now();
  }
  return out;
}

export const MIGRATIONS = {
  /** v1 → v2: v1 stored `stars` as a flat map and had no secret/achievement bookkeeping. */
  1: (data) => {
    const next = freshSave(data.brand || 'NEURO//VOID');
    next.createdAt = data.createdAt || Date.now();
    next.unlockedLevel = Number(data.unlockedLevel) || 1;
    next.currentLevel = Number(data.currentLevel) || next.unlockedLevel;
    next.completed = {};
    const legacyStars = data.stars && typeof data.stars === 'object' ? data.stars : {};
    for (const [key, value] of Object.entries(legacyStars)) {
      const n = Number(key);
      if (!Number.isInteger(n) || n < 1) continue;
      const stars = Math.round(Number(value) || 0);
      if (stars < 1) continue; // a legacy 0-star row means "not completed"
      const clamped = Math.min(3, stars);
      next.completed[String(n)] = {
        stars: clamped,
        score: 0,
        bestTimeMs: 0,
        attempts: 1,
        hints: 0,
        completedAt: Date.now()
      };
    }
    for (const [key, value] of Object.entries(data.levelScores || {})) {
      const n = String(Number(key));
      if (/^\d+$/.test(n) && next.completed[n]) next.completed[n].score = Math.max(0, Number(value) || 0);
    }
    if (data.bestTimes) {
      for (const [key, value] of Object.entries(data.bestTimes)) {
        const n = String(Number(key));
        if (/^\d+$/.test(n) && next.completed[n]) next.completed[n].bestTimeMs = Math.max(0, Number(value) || 0);
      }
    }
    next.achievements = mapToTimestamps(data.achievements);
    next.secretLevels = mapToTimestamps(data.secretLevels);
    next.storyChoices = typeof data.storyChoices === 'object' && data.storyChoices ? { ...data.storyChoices } : {};
    next.flags = typeof data.flags === 'object' && data.flags ? { ...data.flags } : {};
    next.settings = { ...defaultSettings(), ...(data.settings || {}), ...(data.audioSettings || {}) };
    next.tutorial = typeof data.tutorialProgress === 'object' && data.tutorialProgress
      ? { seen: { ...data.tutorialProgress } }
      : { seen: {} };
    if (typeof data.stats === 'object' && data.stats) next.stats = { ...next.stats, ...data.stats };
    next.version = 2;
    return next;
  }
};

/**
 * Run every migration needed to bring `data` up to the current version.
 * @returns {{ data:object, applied:number[], error:string|null }}
 */
export function migrateSave(data) {
  const applied = [];
  if (!data || typeof data !== 'object') return { data, applied, error: 'not an object' };
  let current = data;
  let version = Math.max(1, Math.min(SAVE_VERSION, Number(current.version) || 1));
  let guard = 0;
  while (version < SAVE_VERSION && guard++ < 20) {
    const migration = MIGRATIONS[version];
    if (!migration) break;
    try {
      current = migration(current);
      applied.push(version);
      version = Number(current.version) || version + 1;
    } catch (err) {
      return { data: current, applied, error: err && err.message ? err.message : 'migration failed' };
    }
  }
  return { data: current, applied, error: null };
}
