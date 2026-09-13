/**
 * Save validation & repair.
 *
 * The validator never throws. It walks the raw object, keeps everything it can
 * trust, replaces everything it cannot, and reports exactly what it fixed so
 * the UI can tell the player "your save was repaired" instead of dying with a
 * blank screen. This is the single most important reliability feature in the
 * game: a corrupt localStorage entry must never break the experience.
 */

export const SAVE_VERSION = 2;
export const STORAGE_KEY = 'neurovoid_save_v1'; // the v1 key is kept for backwards compatibility
export const BACKUP_KEY = 'neurovoid_save_v1_backup';

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const clampInt = (v, lo, hi, fallback) => (isFiniteNumber(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : fallback);

export function freshSave(brand = 'NEURO//VOID') {
  return {
    version: SAVE_VERSION,
    brand,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    currentLevel: 1,
    unlockedLevel: 1,
    completed: {},        // levelNumber -> { stars, score, bestTimeMs, attempts, hints, completedAt }
    achievements: {},     // achievementId -> timestamp
    secretLevels: {},     // levelNumber -> timestamp discovered
    storyChoices: {},     // beatId -> choiceId
    storySeen: {},        // beatId -> timestamp
    flags: {},            // free-form puzzle memory (archiveCode, confession, ...)
    settings: defaultSettings(),
    tutorial: { seen: {} },
    stats: { plays: 0, wins: 0, failures: 0, hints: 0, stars: 0, timePlayedMs: 0 },
    meta: { lastLevel: 1, endings: {} }
  };
}

export function defaultSettings() {
  return {
    music: true,
    sfx: true,
    reducedMotion: false,
    highContrast: false,
    largeText: false
  };
}

/**
 * Validate + repair a raw save object.
 * @returns {{ ok:boolean, data:object, repairs:string[], fatal:boolean }}
 */
export function validateSave(raw) {
  const repairs = [];
  if (!isPlainObject(raw)) {
    return { ok: false, data: freshSave(), repairs: ['save data was not an object'], fatal: true };
  }
  const data = freshSave();
  const src = raw;

  if (isFiniteNumber(src.createdAt) && src.createdAt > 0) data.createdAt = src.createdAt;
  if (isFiniteNumber(src.updatedAt) && src.updatedAt > 0) data.updatedAt = src.updatedAt;
  if (typeof src.brand === 'string' && src.brand.length < 40) data.brand = src.brand;

  // level counters
  const unlocked = clampInt(src.unlockedLevel, 1, 200, 1);
  if (unlocked !== src.unlockedLevel) repairs.push('unlockedLevel out of range');
  data.unlockedLevel = unlocked;
  const current = clampInt(src.currentLevel, 1, 200, unlocked);
  if (current !== src.currentLevel) repairs.push('currentLevel out of range');
  data.currentLevel = Math.max(1, current);

  // completed levels
  if (isPlainObject(src.completed)) {
    let dropped = 0;
    for (const [key, value] of Object.entries(src.completed)) {
      const n = Number(key);
      if (!Number.isInteger(n) || n < 1 || n > 200 || !isPlainObject(value)) { dropped++; continue; }
      const stars = clampInt(value.stars, 0, 3, 0);
      if (stars < 1) { dropped++; continue; }
      data.completed[String(n)] = {
        stars,
        score: Math.max(0, clampInt(value.score, 0, 1000000, 0)),
        bestTimeMs: Math.max(0, clampInt(value.bestTimeMs, 0, 24 * 3600 * 1000, 0)),
        attempts: Math.max(0, clampInt(value.attempts, 0, 100000, 1)),
        hints: Math.max(0, clampInt(value.hints, 0, 100000, 0)),
        completedAt: isFiniteNumber(value.completedAt) ? value.completedAt : Date.now()
      };
    }
    if (dropped) repairs.push(`${dropped} invalid completed level(s) removed`);
  } else if (src.completed !== undefined) {
    repairs.push('completed map was not an object');
  }

  data.achievements = sanitiseTimestampMap(src.achievements, repairs, 'achievements');
  data.secretLevels = sanitiseTimestampMap(src.secretLevels, repairs, 'secretLevels');
  data.storySeen = sanitiseTimestampMap(src.storySeen, repairs, 'storySeen');

  data.storyChoices = sanitiseStringMap(src.storyChoices, repairs, 'storyChoices');
  data.flags = sanitiseFreeMap(src.flags, repairs, 'flags');

  // settings — merge over defaults so new options appear for old saves
  if (isPlainObject(src.settings)) {
    for (const key of Object.keys(defaultSettings())) {
      if (typeof src.settings[key] === 'boolean') data.settings[key] = src.settings[key];
      else if (src.settings[key] !== undefined) repairs.push(`setting "${key}" was not boolean`);
    }
  } else if (src.settings !== undefined) {
    repairs.push('settings was not an object');
  }

  // tutorial
  if (isPlainObject(src.tutorial) && isPlainObject(src.tutorial.seen)) {
    data.tutorial.seen = sanitiseBooleanMap(src.tutorial.seen, repairs, 'tutorial.seen');
  }

  // stats
  if (isPlainObject(src.stats)) {
    data.stats.plays = Math.max(0, clampInt(src.stats.plays, 0, 1e9, 0));
    data.stats.wins = Math.max(0, clampInt(src.stats.wins, 0, 1e9, 0));
    data.stats.failures = Math.max(0, clampInt(src.stats.failures, 0, 1e9, 0));
    data.stats.hints = Math.max(0, clampInt(src.stats.hints, 0, 1e9, 0));
    data.stats.timePlayedMs = Math.max(0, clampInt(src.stats.timePlayedMs, 0, 1e12, 0));
    if (data.stats.wins > data.stats.plays) {
      repairs.push('wins exceeded plays — clamped');
      data.stats.wins = data.stats.plays;
    }
  }
  data.stats.stars = Object.values(data.completed).reduce((sum, entry) => sum + entry.stars, 0);

  if (isPlainObject(src.meta)) {
    data.meta.lastLevel = clampInt(src.meta.lastLevel, 1, 200, data.meta.lastLevel);
    data.meta.endings = sanitiseTimestampMap(src.meta.endings, repairs, 'meta.endings');
  }

  // version
  const version = clampInt(src.version, 1, SAVE_VERSION, 1);
  data.version = version;

  // cross-field repairs
  const maxCompleted = Math.max(0, ...Object.keys(data.completed).map(Number));
  if (data.unlockedLevel < maxCompleted + 1) {
    data.unlockedLevel = Math.min(120, maxCompleted + 1);
    repairs.push('unlockedLevel was behind the completed levels — advanced');
  }
  if (data.currentLevel > data.unlockedLevel) {
    data.currentLevel = data.unlockedLevel;
    repairs.push('currentLevel was beyond the unlocked level — clamped');
  }
  if (Object.keys(data.completed).length === 0 && data.unlockedLevel > 1) {
    // A save that claims progress without any completed level is inconsistent.
    data.unlockedLevel = 1;
    data.currentLevel = 1;
    repairs.push('unlocked level without any completion — reset to level 1');
  }
  if (!isPlainObject(data.settings)) data.settings = defaultSettings();

  return { ok: repairs.length === 0, data, repairs, fatal: false };
}

function sanitiseTimestampMap(value, repairs, label) {
  const out = {};
  if (value === undefined) return out;
  if (!isPlainObject(value)) { repairs.push(`${label} was not an object`); return out; }
  for (const [key, ts] of Object.entries(value)) {
    if (typeof key !== 'string' || key.length > 64) continue;
    out[key] = isFiniteNumber(ts) && ts > 0 ? ts : Date.now();
  }
  return out;
}

function sanitiseStringMap(value, repairs, label) {
  const out = {};
  if (value === undefined) return out;
  if (!isPlainObject(value)) { repairs.push(`${label} was not an object`); return out; }
  for (const [key, v] of Object.entries(value)) {
    if (typeof v === 'string' && v.length <= 64) out[key] = v;
    else if (typeof v === 'number' || typeof v === 'boolean') out[key] = String(v);
    else repairs.push(`${label}.${key} had an unexpected type`);
  }
  return out;
}

function sanitiseFreeMap(value, repairs, label) {
  const out = {};
  if (value === undefined) return out;
  if (!isPlainObject(value)) { repairs.push(`${label} was not an object`); return out; }
  for (const [key, v] of Object.entries(value)) {
    if (typeof key !== 'string' || key.length > 64) continue;
    const t = typeof v;
    if (t === 'string' && v.length <= 256) out[key] = v;
    else if (t === 'number' && Number.isFinite(v)) out[key] = v;
    else if (t === 'boolean') out[key] = v;
    else if (isPlainObject(v)) {
      const nested = {};
      for (const [k2, v2] of Object.entries(v)) {
        if (typeof k2 === 'string' && k2.length <= 64 && (typeof v2 === 'string' || typeof v2 === 'number' || typeof v2 === 'boolean')) {
          nested[k2] = typeof v2 === 'string' && v2.length > 256 ? v2.slice(0, 256) : v2;
        }
      }
      out[key] = nested;
    } else repairs.push(`${label}.${key} had an unsupported type`);
  }
  return out;
}

function sanitiseBooleanMap(value, repairs, label) {
  const out = {};
  if (!isPlainObject(value)) { repairs.push(`${label} was not an object`); return out; }
  for (const [key, v] of Object.entries(value)) {
    if (typeof key !== 'string' || key.length > 64) continue;
    out[key] = !!v;
  }
  return out;
}

/** Structural report used by the settings screen and by tests. */
export function describeSave(data) {
  const completed = Object.keys(data.completed).length;
  const stars = Object.values(data.completed).reduce((sum, e) => sum + e.stars, 0);
  return {
    version: data.version,
    completed,
    stars,
    unlockedLevel: data.unlockedLevel,
    secrets: Object.keys(data.secretLevels).length,
    achievements: Object.keys(data.achievements).length,
    updatedAt: data.updatedAt,
    settings: { ...data.settings }
  };
}
