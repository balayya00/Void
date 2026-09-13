/**
 * SaveManager — the single owner of persistent state.
 *
 * Responsibilities
 *   • load / save / reset the local save (localStorage with a memory fallback),
 *   • validate and repair data on load (see SaveValidator),
 *   • migrate older schemas (see SaveMigration),
 *   • export / import as a JSON file or as a compact shareable code,
 *   • keep a rolling backup so a corrupted write can still be recovered,
 *   • emit status events so the UI can show "SAVED" / "REPAIRED" / "ERROR".
 *
 * It never talks to a server and never needs an account.
 */

import { validateSave, freshSave, STORAGE_KEY, BACKUP_KEY, SAVE_VERSION, describeSave } from './SaveValidator.js';
import { migrateSave } from './SaveMigration.js';

const CODE_PREFIX = 'NV1-';

/**
 * Keys that carry actual progress in some NEURO//VOID schema (v1 included).
 * `version` alone is not enough — random JSON with a version field must not be
 * allowed to replace a real save.
 */
const SAVE_KEYS = [
  'unlockedLevel', 'currentLevel', 'completed', 'achievements', 'secretLevels',
  'storyChoices', 'storySeen', 'flags', 'settings', 'stats', 'tutorial', 'meta', 'stars'
];

/**
 * Import must never clobber real progress with unrelated JSON: a payload is
 * only accepted if it carries at least one field a NEURO//VOID save would have.
 */
export function looksLikeSave(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (value.app === 'NEURO//VOID' || value.save) return true;
  return SAVE_KEYS.some((key) => key in value);
}

export class SaveManager {
  /**
   * @param {{ storage?:Storage|null, onStatus?:(status:object)=>void, autoSaveMs?:number }} [opts]
   */
  constructor(opts = {}) {
    this.storage = opts.storage !== undefined ? opts.storage : safeStorage();
    this.onStatus = opts.onStatus || (() => {});
    this.autoSaveMs = opts.autoSaveMs ?? 800;
    this.listeners = new Set();
    this.pendingTimer = null;
    this.lastError = null;
    this.repairs = [];
    this.data = freshSave();
    this.available = !!this.storage;
    this.memoryOnly = !this.storage;
  }

  // ── lifecycle ──────────────────────────────────────────────────────────

  load() {
    const result = { loaded: false, repaired: false, recovered: false, fresh: false, migrations: [], error: null };
    const raw = this._read(STORAGE_KEY);
    if (raw === null) {
      // first visit — or the entry was cleared
      const backup = this._read(BACKUP_KEY, true);
      if (backup) {
        const recovered = this._process(backup);
        this.data = recovered.data;
        this.repairs = recovered.repairs;
        result.loaded = true;
        result.recovered = true;
        this._status('recovered', 'Recovered your progress from a backup.');
        this._persist();
        return result;
      }
      this.data = freshSave();
      result.fresh = true;
      this._persist(); // write immediately so a reload finds the new save
      this._status('fresh', 'New save created.');
      return result;
    }
    const processed = this._process(raw);
    this.data = processed.data;
    this.repairs = processed.repairs;
    result.loaded = true;
    result.repaired = !processed.ok;
    result.migrations = processed.migrations;
    result.error = processed.error;
    if (processed.fatal) {
      // Unrecoverable. Keep the broken blob for inspection under its own key —
      // the rolling backup must stay intact, because it is the last good copy.
      const evidence = typeof raw === 'string' ? raw : JSON.stringify(raw);
      this._write(`${STORAGE_KEY}_corrupt`, evidence.slice(0, 20000));
      const backupRaw = this._read(BACKUP_KEY, true);
      if (backupRaw) {
        const fromBackup = this._process(backupRaw);
        if (!fromBackup.fatal) {
          this.data = fromBackup.data;
          this.repairs = fromBackup.repairs;
          result.recovered = true;
          result.repaired = !fromBackup.ok;
          this._status('recovered', 'The main save was unreadable — progress was restored from the backup copy.');
          this._persist();
          return result;
        }
      }
      this.data = freshSave();
      result.recovered = true;
      this._status('recovered', 'Save data was unreadable and no backup survived — a fresh save was created.');
      this._persist();
      return result;
    }
    if (processed.migrations.length) {
      this._status('migrated', `Save upgraded from v${processed.migrations[0]}.`);
      this._persist();
    } else if (!processed.ok) {
      this._status('repaired', `Save repaired (${processed.repairs.length} issue${processed.repairs.length === 1 ? '' : 's'}).`);
      this._persist();
    } else {
      this._status('loaded', 'Progress loaded.');
    }
    return result;
  }

  _process(raw) {
    let parsed = raw;
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        return { ok: false, data: freshSave(), repairs: ['invalid JSON'], fatal: true, migrations: [], error: err.message };
      }
    }
    const migrated = migrateSave(parsed);
    const validation = validateSave(migrated.data);
    const repairs = [...validation.repairs];
    if (migrated.error) repairs.push(`migration problem: ${migrated.error}`);
    return {
      ok: validation.ok && !migrated.error,
      data: validation.data,
      repairs,
      fatal: validation.fatal,
      migrations: migrated.applied,
      error: migrated.error
    };
  }

  // ── persisting ─────────────────────────────────────────────────────────

  save(immediate = true) {
    if (!immediate) return this.scheduleSave();
    return this._persist();
  }

  scheduleSave() {
    if (this.pendingTimer) return;
    this.pendingTimer = setTimeout(() => {
      this.pendingTimer = null;
      this._persist();
    }, this.autoSaveMs);
    this._status('dirty', 'Saving…');
  }

  flush() {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
      return this._persist();
    }
    return true;
  }

  _persist() {
    this.data.updatedAt = Date.now();
    this.data.stats.stars = Object.values(this.data.completed).reduce((sum, e) => sum + e.stars, 0);
    let payload;
    try {
      payload = JSON.stringify(this.data);
    } catch (err) {
      this.lastError = err;
      this._status('error', 'Could not serialise the save.');
      return false;
    }
    // keep the previous good value as a backup before overwriting
    const previous = this._read(STORAGE_KEY);
    if (previous) this._write(BACKUP_KEY, previous);
    const ok = this._write(STORAGE_KEY, payload);
    if (!ok) {
      this._status('error', 'Storage is unavailable — progress stays only in this tab.');
      return false;
    }
    this._status('saved', 'Progress saved.');
    return true;
  }

  _read(key, quiet = false) {
    if (!this.storage) return null;
    try {
      const value = this.storage.getItem(key);
      return value === null ? null : value;
    } catch (err) {
      if (!quiet) this.lastError = err;
      return null;
    }
  }

  _write(key, value) {
    if (!this.storage) {
      this.memoryOnly = true;
      return true; // memory-only mode: nothing to write, but nothing failed either
    }
    try {
      this.storage.setItem(key, value);
      return true;
    } catch (err) {
      this.lastError = err;
      // Quota exceeded or private-browsing restrictions: degrade gracefully.
      try {
        this.storage.removeItem(BACKUP_KEY);
        this.storage.setItem(key, value);
        this.memoryOnly = true;
        this._status('warning', 'Storage is full — some detail may be lost.');
        return true;
      } catch (inner) {
        this.memoryOnly = true;
        return false;
      }
    }
  }

  _status(kind, message) {
    const snapshot = describeSave(this.data);
    const status = { kind, message, at: Date.now(), ...snapshot };
    try {
      this.onStatus(status);
    } catch (err) {
      console.warn('[neurovoid] status callback failed', err);
    }
    this.listeners.forEach((fn) => {
      try { fn(status); } catch { /* listener errors must never break saving */ }
    });
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // ── progress helpers ───────────────────────────────────────────────────

  get completedCount() {
    return Object.keys(this.data.completed).length;
  }

  get totalStars() {
    return Object.values(this.data.completed).reduce((sum, e) => sum + e.stars, 0);
  }

  get completionPercent() {
    // 120 main levels + 12 secrets define 100 %
    return Math.min(100, Math.round((this.completedCount / 132) * 100));
  }

  getLevelRecord(n) {
    return this.data.completed[String(n)] || null;
  }

  isUnlocked(n) {
    if (n <= 120) return n <= this.data.unlockedLevel;
    return !!this.data.secretLevels[String(n)];
  }

  /**
   * Record a completed level. Returns { improved, stars, best }.
   */
  completeLevel(n, result) {
    const key = String(n);
    const previous = this.data.completed[key] || null;
    const entry = {
      stars: Math.max(result.stars || 1, previous ? previous.stars : 0),
      score: Math.max(result.score || 0, previous ? previous.score : 0),
      bestTimeMs: previous && previous.bestTimeMs ? Math.min(previous.bestTimeMs, result.timeMs || Infinity) : (result.timeMs || 0),
      attempts: result.attempts || 1,
      hints: Math.min(previous ? previous.hints : Infinity, result.hints || 0),
      completedAt: Date.now()
    };
    if (!entry.bestTimeMs || !Number.isFinite(entry.bestTimeMs)) entry.bestTimeMs = result.timeMs || 0;
    this.data.completed[key] = entry;
    if (n <= 120 && n + 1 > this.data.unlockedLevel) this.data.unlockedLevel = Math.min(120, n + 1);
    this.data.stats.wins += 1;
    this.data.stats.timePlayedMs += result.timeMs || 0;
    this.data.meta.lastLevel = n;
    const improved = !previous || entry.stars > previous.stars || entry.score > previous.score;
    this.save(true);
    return { improved, stars: entry.stars, best: entry };
  }

  unlockSecret(n, reason = '') {
    const key = String(n);
    if (this.data.secretLevels[key]) return false;
    this.data.secretLevels[key] = Date.now();
    if (reason) this.data.flags[`secretUnlock:${n}`] = reason;
    this.save(true);
    return true;
  }

  grantAchievement(id, label = '') {
    if (this.data.achievements[id]) return false;
    this.data.achievements[id] = Date.now();
    if (label) this.data.flags[`achievement:${id}`] = label;
    this.save(true);
    return true;
  }

  hasAchievement(id) {
    return !!this.data.achievements[id];
  }

  setFlag(key, value) {
    this.data.flags[key] = value;
    this.save(false);
    return value;
  }

  getFlag(key, fallback = null) {
    return key in this.data.flags ? this.data.flags[key] : fallback;
  }

  setStoryChoice(beatId, choiceId) {
    this.data.storyChoices[beatId] = choiceId;
    this.data.storySeen[beatId] = Date.now();
    this.save(true);
  }

  setSetting(key, value) {
    this.data.settings[key] = value;
    this.save(true);
  }

  setCurrentLevel(n) {
    this.data.currentLevel = Math.max(1, n);
    this.data.meta.lastLevel = n;
    this.save(false);
  }

  markTutorialSeen(id) {
    this.data.tutorial.seen[id] = true;
    this.save(false);
  }

  // ── export / import ────────────────────────────────────────────────────

  exportJSON(pretty = true) {
    const payload = {
      app: 'NEURO//VOID',
      exportedAt: new Date().toISOString(),
      schema: SAVE_VERSION,
      save: this.data
    };
    return pretty ? JSON.stringify(payload, null, 2) : JSON.stringify(payload);
  }

  /**
   * Import a save from an exported JSON string, a raw save object, or a code.
   * @returns {{ ok:boolean, error?:string, repairs?:string[], migrations?:number[], status?:object }}
   */
  importPayload(text) {
    if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'Nothing was pasted.' };
    const trimmed = text.trim();
    let parsed = null;
    let usedCode = false;
    if (trimmed.startsWith(CODE_PREFIX)) {
      const decoded = decodeCode(trimmed);
      if (!decoded) return { ok: false, error: 'That save code is not valid.' };
      parsed = decoded;
      usedCode = true;
    } else {
      try {
        parsed = JSON.parse(trimmed);
      } catch (err) {
        return { ok: false, error: 'That is not valid JSON.' };
      }
    }
    if (parsed && parsed.save) parsed = parsed.save; // exported envelope
    if (!looksLikeSave(parsed)) return { ok: false, error: 'That data is not a NEURO//VOID save.' };
    const processed = this._process(parsed);
    if (processed.fatal) return { ok: false, error: 'That file does not contain NEURO//VOID progress.' };
    this.data = processed.data;
    this.save(true);
    this._status('imported', usedCode ? 'Save code applied.' : 'Save file applied.');
    return {
      ok: true,
      repairs: processed.repairs,
      migrations: processed.migrations,
      status: describeSave(this.data)
    };
  }

  /** Compact, human-copyable code (base64url of a trimmed save). */
  exportCode() {
    const minimal = {
      v: this.data.version,
      u: this.data.unlockedLevel,
      c: this.data.completed,
      a: Object.keys(this.data.achievements),
      s: Object.keys(this.data.secretLevels),
      ch: this.data.storyChoices,
      t: Object.fromEntries(Object.entries(this.data.tutorial.seen).filter(([, v]) => v)),
      st: this.data.settings
    };
    return CODE_PREFIX + encodeBase64Url(JSON.stringify(minimal));
  }

  /** Human readable summary used by the import/export screen. */
  summary() {
    return describeSave(this.data);
  }

  // ── reset ──────────────────────────────────────────────────────────────

  reset({ keepSettings = true, keepAchievements = false } = {}) {
    const previous = this.data;
    const next = freshSave();
    if (keepSettings) next.settings = { ...previous.settings };
    if (keepAchievements) {
      next.achievements = { ...previous.achievements };
      next.secretLevels = { ...previous.secretLevels };
    }
    this.data = next;
    this.save(true);
    this._status('reset', 'Progress reset.');
    return next;
  }

  destroy() {
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
    this.listeners.clear();
  }
}

// ── helpers ────────────────────────────────────────────────────────────────

function safeStorage() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const probe = '__neurovoid_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch (err) {
    return null;
  }
}

function encodeBase64Url(str) {
  try {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    bytes.forEach((b) => { binary += String.fromCharCode(b); });
    const b64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(str, 'utf8').toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch (err) {
    return '';
  }
}

function decodeBase64Url(code) {
  try {
    const padded = code.replace(/-/g, '+').replace(/_/g, '/');
    const withPad = padded + '='.repeat((4 - (padded.length % 4)) % 4);
    const binary = typeof atob === 'function' ? atob(withPad) : Buffer.from(withPad, 'base64').toString('binary');
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch (err) {
    return null;
  }
}

/**
 * Decode a compact save code back into a v2 save object.
 * Legacy/unknown keys are ignored; unknown versions go through the normal
 * migration + validation pipeline inside importPayload().
 */
export function decodeCode(code) {
  const json = decodeBase64Url(code.replace(/^NV1-/, ''));
  if (!json) return null;
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  return {
    version: Number(parsed.v) || 2,
    brand: 'NEURO//VOID',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    currentLevel: Number(parsed.u) || 1,
    unlockedLevel: Number(parsed.u) || 1,
    completed: parsed.c || {},
    achievements: Object.fromEntries((parsed.a || []).map((id) => [id, Date.now()])),
    secretLevels: Object.fromEntries((parsed.s || []).map((id) => [id, Date.now()])),
    storyChoices: parsed.ch || {},
    storySeen: {},
    flags: {},
    settings: parsed.st || undefined,
    tutorial: { seen: parsed.t || {} },
    stats: { plays: 0, wins: 0, failures: 0, hints: 0, stars: 0, timePlayedMs: 0 },
    meta: { lastLevel: Number(parsed.u) || 1, endings: {} }
  };
}
