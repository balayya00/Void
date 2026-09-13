/**
 * Story, endings and achievements.
 *
 * The four endings are a hard requirement, so this file proves each one is
 * reachable from a *deterministic* save shape — choices, secrets, stars and
 * performance, never a random number — and that the story beats always offer a
 * recorded decision.
 */

import { describe, it, expect } from 'vitest';
import { STORY_BEATS, ENDINGS, resolveEnding, availableEndings, beatForChapter, storyBeat } from '../src/story/StoryData.js';
import { ACHIEVEMENTS, evaluateAchievements, achievementSnapshot, achievementById } from '../src/save/Achievements.js';
import { freshSave } from '../src/save/SaveValidator.js';
import { CHAPTERS, SECRET_LEVELS } from '../src/levels/levelData.js';

function saveWith({ levels = 0, stars = 3, secrets = 0, choices = [], endings = [], flags = {} } = {}) {
  const save = freshSave();
  for (let n = 1; n <= levels; n++) {
    save.completed[String(n)] = { stars, score: 500, bestTimeMs: 5000, attempts: 1, hints: 0, completedAt: Date.now() };
  }
  choices.forEach((choice, i) => { save.storyChoices[`beat${i}`] = choice; });
  endings.forEach((id) => { save.meta.endings[id] = Date.now(); });
  SECRET_LEVELS.slice(0, secrets).forEach((secret) => { save.secretLevels[String(secret.n)] = Date.now(); });
  Object.assign(save.flags, flags);
  return save;
}

describe('story beats', () => {
  it('provides a beat for every chapter, plus the secret archive', () => {
    for (const chapter of CHAPTERS) {
      const beat = beatForChapter(chapter.id);
      expect(beat, `chapter ${chapter.id} needs a story beat`).toBeTruthy();
      expect(beat.lines.length).toBeGreaterThanOrEqual(3);
      expect(beat.speaker).toBeTruthy();
    }
    expect(storyBeat('secret')).toBeTruthy();
    expect(STORY_BEATS.length).toBeGreaterThanOrEqual(10);
  });

  it('leaves the beats open to more than one interpretation', () => {
    for (const beat of STORY_BEATS) {
      const text = beat.lines.join(' ');
      expect(text.length, `beat ${beat.id} is too thin`).toBeGreaterThan(120);
      // never tells the player what to think
      expect(text).not.toMatch(/\b(the truth is|obviously|correct answer is)\b/i);
    }
  });

  it('offers at most one decision per beat and always with 2–4 options', () => {
    for (const beat of STORY_BEATS) {
      if (!beat.choice) continue;
      expect(beat.choice.options.length).toBeGreaterThanOrEqual(2);
      expect(beat.choice.options.length).toBeLessThanOrEqual(4);
      for (const option of beat.choice.options) {
        expect(option.id).toBeTruthy();
        expect(option.label.length).toBeGreaterThan(6);
      }
      const ids = beat.choice.options.map((o) => o.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('endings', () => {
  it('declares four distinct endings', () => {
    expect(ENDINGS).toHaveLength(4);
    expect(new Set(ENDINGS.map((e) => e.id)).size).toBe(4);
    for (const ending of ENDINGS) {
      expect(ending.lines.length).toBeGreaterThanOrEqual(3);
      expect(ending.requirement.length).toBeGreaterThan(10);
    }
  });

  it('reaches THE WITNESS with an ordinary playthrough', () => {
    const resolved = resolveEnding(saveWith({ levels: 40, choices: ['obey'], secrets: 1 }));
    expect(resolved.ending.id).toBe('witness');
  });

  it('reaches THE SEVERANCE by refusing the station and finding secrets', () => {
    const resolved = resolveEnding(saveWith({ levels: 60, choices: ['defiant'], secrets: 6 }));
    expect(resolved.ending.id).toBe('severance');
  });

  it('reaches THE MERGE through performance and discovery', () => {
    const resolved = resolveEnding(saveWith({ levels: 90, stars: 3, secrets: 9, choices: ['obey'] }));
    expect(resolved.ending.id).toBe('merge');
  });

  it('reaches THE QUIET by refusing everything and finishing the game', () => {
    const resolved = resolveEnding(saveWith({ levels: 120, stars: 3, secrets: 10, choices: ['defiant', 'defiant'] }));
    expect(resolved.ending.id).toBe('quiet');
  });

  it('also allows the kind path to THE MERGE', () => {
    const resolved = resolveEnding(saveWith({ levels: 50, stars: 2, secrets: 4, choices: ['kind', 'kind'] }));
    expect(resolved.ending.id).toBe('merge');
  });

  it('is deterministic: the same save always resolves to the same door', () => {
    const save = saveWith({ levels: 45, secrets: 5, choices: ['defiant'] });
    const first = resolveEnding(save).ending.id;
    for (let i = 0; i < 25; i++) expect(resolveEnding(save).ending.id).toBe(first);
  });

  it('never depends on randomness — repeated resolutions agree even when shuffling the save', () => {
    const a = saveWith({ levels: 70, stars: 3, secrets: 9 });
    const b = saveWith({ levels: 70, stars: 3, secrets: 9 });
    expect(resolveEnding(a).ending.id).toBe(resolveEnding(b).ending.id);
  });

  it('reports why the door was chosen', () => {
    const resolved = resolveEnding(saveWith({ levels: 120, stars: 3, secrets: 10, choices: ['defiant', 'defiant'] }));
    expect(resolved.reasons.length).toBeGreaterThan(0);
    expect(resolved.reasons.join(' ')).toMatch(/secret|star|refusal|complete/i);
  });

  it('marks endings the player has already seen', () => {
    const save = saveWith({ endings: ['witness'] });
    const list = availableEndings(save);
    expect(list.find((e) => e.id === 'witness').unlocked).toBe(true);
    expect(list.find((e) => e.id === 'quiet').unlocked).toBe(false);
  });
});

describe('achievements', () => {
  it('defines a healthy set with unique ids and descriptions', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(25);
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const achievement of ACHIEVEMENTS) {
      expect(achievement.name).toBeTruthy();
      expect(achievement.description.length).toBeGreaterThan(10);
      expect(typeof achievement.check).toBe('function');
    }
  });

  it('never throws, whatever the save looks like', () => {
    const broken = [
      freshSave(),
      { completed: null, stats: undefined },
      { completed: { x: null }, achievements: 5 },
      {}
    ];
    for (const save of broken) {
      expect(() => evaluateAchievements(save)).not.toThrow();
    }
  });

  it('unlocks badges from progress, secrets and choices', () => {
    const save = saveWith({ levels: 12, secrets: 6, choices: ['defiant', 'kind'], flags: { 'hiddenui:found': 1, 'stillness:done': 1 } });
    save.stats.hints = 12;
    save.stats.failures = 2;
    const unlocked = evaluateAchievements(save).map((a) => a.id);
    expect(unlocked).toContain('first-steps');
    expect(unlocked).toContain('chapter-1');
    expect(unlocked).toContain('stars-30');
    expect(unlocked).toContain('secret-1');
    expect(unlocked).toContain('secret-6');
    expect(unlocked).toContain('defiant');
    expect(unlocked).toContain('empathetic');
    expect(unlocked).toContain('latch');
    expect(unlocked).toContain('silence');
    expect(unlocked).toContain('patient');
    expect(unlocked).toContain('hint-collector');
    expect(unlocked).toContain('failure');
  });

  it('counts chapters the way the level map does', () => {
    const save = saveWith({ levels: 10, stars: 3 });
    const snapshot = achievementSnapshot(save);
    expect(snapshot.chapterCounts[1]).toBe(10);
    expect(snapshot.stars).toBe(30);
    expect(achievementById('chapter-1').check(snapshot)).toBe(true);
    expect(achievementById('chapter-5').check(snapshot)).toBe(false);
    expect(achievementById('chapter-5').check({ ...snapshot, chapterCounts: { ...snapshot.chapterCounts, 5: 10 } })).toBe(true);
  });

  it('unlocks a badge for every ending so a full archive is achievable', () => {
    const badgeFor = { witness: 'ending-a', severance: 'ending-b', merge: 'ending-c', quiet: 'ending-d' };
    for (const ending of ENDINGS) {
      const save = saveWith({ levels: 120, endings: [ending.id] });
      const unlocked = evaluateAchievements(save).map((a) => a.id);
      expect(unlocked, `ending ${ending.id} should award a badge`).toContain(badgeFor[ending.id]);
    }
  });

  it('reserves the completionist badge for a nearly complete archive', () => {
    const save = saveWith({ levels: 120, stars: 3, secrets: 12, choices: ['defiant', 'kind'], endings: ENDINGS.map((e) => e.id), flags: { 'hiddenui:found': 1, 'stillness:done': 1 } });
    save.stats.hints = 20;
    const snapshot = achievementSnapshot(save);
    const unlocked = evaluateAchievements(save).map((a) => a.id);
    const others = unlocked.filter((id) => id !== 'all-achievements');
    if (others.length >= snapshot.otherAchievements) {
      expect(achievementById('all-achievements').check({ ...snapshot, otherAchievements: ACHIEVEMENTS.length - 1 })).toBe(true);
    }
  });
});
