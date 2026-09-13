/**
 * Achievement definitions.
 *
 * Achievements are discovered through play: finishing levels, perfect runs,
 * endurance, secrets, and the story choices a player makes. Each one can be
 * checked against a save snapshot with a small pure predicate so the rules are
 * testable and never rely on random chance.
 */

export const ACHIEVEMENTS = [
  { id: 'first-steps', name: 'First Contact', description: 'Complete your first experiment.', icon: '◆', check: (s) => s.completed >= 1 },
  { id: 'chapter-1', name: 'Boot Sequence', description: 'Finish every level in Chapter 1.', icon: '▲', check: (s) => chapterDone(s, 1) },
  { id: 'stars-10', name: 'Constellation', description: 'Earn 10 ★ in total.', icon: '✦', check: (s) => s.stars >= 10 },
  { id: 'stars-30', name: 'Star Cartographer', description: 'Earn 30 ★ in total.', icon: '✦', check: (s) => s.stars >= 30 },
  { id: 'stars-90', name: 'Astral Archive', description: 'Earn 90 ★ in total.', icon: '✧', check: (s) => s.stars >= 90 },
  { id: 'stars-180', name: 'Total Recall', description: 'Earn 180 ★ in total.', icon: '✧', check: (s) => s.stars >= 180 },
  { id: 'perfect-10', name: 'Flawless Ten', description: 'Finish 10 experiments with three stars.', icon: '★', check: (s) => perfectCount(s) >= 10 },
  { id: 'perfect-50', name: 'Flawless Fifty', description: 'Finish 50 experiments with three stars.', icon: '★', check: (s) => perfectCount(s) >= 50 },
  { id: 'no-hints-20', name: 'Unassisted', description: 'Complete 20 experiments without ever using a hint.', icon: '◇', check: (s) => s.hintFree >= 20 },
  { id: 'speed-run', name: 'Overclocked', description: 'Finish any three experiments in under 20 seconds each.', icon: '⚡', check: (s) => s.fastWins >= 3 },
  { id: 'half-way', name: 'Halved Void', description: 'Complete 60 main experiments.', icon: '▰', check: (s) => s.completed >= 60 },
  { id: 'chapter-5', name: 'Deep Diver', description: 'Reach Chapter 5 and finish it completely.', icon: '▼', check: (s) => chapterDone(s, 5) },
  { id: 'chapter-10', name: 'The Long Night', description: 'Complete Chapter 10.', icon: '●', check: (s) => chapterDone(s, 10) },
  { id: 'all-levels', name: 'Voidwalk', description: 'Complete all 120 experiments.', icon: '◈', check: (s) => s.completed >= 120 },
  { id: 'secret-1', name: 'Hidden Door', description: 'Find your first secret chamber.', icon: '⟡', check: (s) => s.secrets >= 1 },
  { id: 'secret-6', name: 'Chamberlain', description: 'Discover six secret chambers.', icon: '⟡', check: (s) => s.secrets >= 6 },
  { id: 'secret-all', name: 'The Unlisted', description: 'Discover every secret chamber.', icon: '⟢', check: (s) => s.secrets >= 12 },
  { id: 'ending-a', name: 'The Witness', description: 'Reach the ending where you stay and watch.', icon: '☉', check: (s) => s.endings.includes('witness') },
  { id: 'ending-b', name: 'The Severance', description: 'Reach the ending where the link is cut.', icon: '⊘', check: (s) => s.endings.includes('severance') },
  { id: 'ending-c', name: 'The Merge', description: 'Reach the ending where nobody is left alone.', icon: '∞', check: (s) => s.endings.includes('merge') },
  { id: 'ending-d', name: 'The Quiet', description: 'Reach the ending that refuses every offer.', icon: '☾', check: (s) => s.endings.includes('quiet') },
  { id: 'latch', name: 'Latch', description: 'Find a control the station did not mention.', icon: '⟟', check: (s) => !!s.flags['hiddenui:found'] },
  { id: 'silence', name: 'Silence', description: 'Complete the chamber that asks for nothing at all.', icon: '○', check: (s) => !!s.flags['stillness:done'] },
  { id: 'starred', name: 'Star Chart', description: 'Earn 150 ★ in total.', icon: '✧', check: (s) => s.stars >= 150 },
  { id: 'defiant', name: 'Deviant Behaviour', description: 'Refuse an order from the station AI.', icon: '⌁', check: (s) => s.choices.includes('defiant') },
  { id: 'empathetic', name: 'Emulation', description: 'Answer a machine with something kind.', icon: '♡', check: (s) => s.choices.includes('kind') },
  { id: 'patient', name: 'Stillness', description: 'Complete the experiment that asks for nothing.', icon: '○', check: (s) => !!s.flags['stillness:done'] },
  { id: 'hint-collector', name: 'Curious Mind', description: 'Use 10 hints across your playthrough.', icon: '?', check: (s) => s.hintUses >= 10 },
  { id: 'failure', name: 'Error Tolerance', description: 'Fail an experiment and go back for it.', icon: '×', check: (s) => s.failures >= 1 },
  { id: 'returner', name: 'Persistence', description: 'Return to an already solved level and improve it.', icon: '↺', check: (s) => s.replays >= 1 },
  { id: 'all-achievements', name: 'Completionist Protocol', description: 'Unlock every other badge.', icon: '❖', check: (s) => s.otherAchievements >= 30 }
];

/** Turn the raw save into the flat snapshot the predicates expect. */
export function achievementSnapshot(save) {
  const completed = Object.values(save.completed || {}).filter((e) => e && typeof e === 'object');
  const stars = completed.reduce((sum, e) => sum + (e.stars || 0), 0);
  const flags = save.flags || {};
  const chapterCounts = {};
  for (const [key, entry] of Object.entries(save.completed || {})) {
    const n = Number(key);
    if (!Number.isInteger(n)) continue;
    const chapter = Math.min(12, Math.ceil(n / 10));
    chapterCounts[chapter] = (chapterCounts[chapter] || 0) + 1;
  }
  return {
    chapterCounts,
    completed: completed.length,
    stars,
    perfect: completed.filter((e) => e.stars === 3).length,
    hintFree: completed.filter((e) => (e.hints || 0) === 0).length,
    fastWins: completed.filter((e) => e.bestTimeMs > 0 && e.bestTimeMs < 20000).length,
    secrets: Object.keys(save.secretLevels || {}).length,
    hintUses: (save.stats && save.stats.hints) || 0,
    failures: (save.stats && save.stats.failures) || 0,
    replays: Number(flags.replays || 0),
    choices: Object.values(save.storyChoices || {}),
    endings: Object.keys((save.meta && save.meta.endings) || {}),
    flags,
    otherAchievements: Object.keys(save.achievements || {}).length
  };
}

export function evaluateAchievements(save) {
  const snapshot = achievementSnapshot(save);
  const unlocked = [];
  for (const achievement of ACHIEVEMENTS) {
    if (save.achievements && save.achievements[achievement.id]) continue;
    let ok = false;
    try {
      ok = !!achievement.check(snapshot);
    } catch (err) {
      ok = false;
    }
    if (ok) unlocked.push(achievement);
  }
  return unlocked;
}

function chapterDone(snapshot, chapter) {
  return snapshot.chapterCounts && snapshot.chapterCounts[chapter] >= 10;
}

export function achievementById(id) {
  return ACHIEVEMENTS.find((a) => a.id === id) || null;
}
