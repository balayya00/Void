/**
 * Main menu — the station's welcome terminal.
 *
 * CONTINUE resumes the furthest unlocked level, NEW GAME wipes progress behind
 * a confirmation, and the smaller entries open the map, achievements, settings
 * and the save-transfer tools. The footer hides one of the game's secrets: a
 * maintenance panel that only reacts if the player looks for it.
 */

import { el } from '../utils/dom.js';
import { button, panel, statLine } from './Shell.js';
import { chapterForLevel, TOTAL_LEVELS, TOTAL_SECRETS } from '../levels/LevelManager.js';
import { CHAPTERS } from '../levels/levelData.js';
import { STORY_BEATS } from '../story/StoryData.js';

export function MenuScreen(root, game) {
  const summary = game.progress;
  const continueLevel = Math.min(game.save.data.unlockedLevel || 1, TOTAL_LEVELS);
  const chapter = chapterForLevel(continueLevel);
  const secrets = game.secretLevels();
  const foundSecrets = secrets.filter((s) => s.unlocked).length;
  const chapterProgress = game.chapterProgress(chapter.id);

  const title = el('div', { class: 'menu-title' }, [
    el('h1', { class: 'game-title' }, [
      el('span', { class: 'title-neuro', text: 'NEURO' }),
      el('span', { class: 'title-slash', text: '//' }),
      el('span', { class: 'title-void', text: 'VOID' })
    ]),
    el('p', { class: 'tagline', text: 'A station keeps thinking about you. 120 experiments. 12 doors that are not on the map.' })
  ]);

  const continuePanel = panel([
    el('h2', { text: game.save.completedCount ? 'CONTINUE' : 'BEGIN' }),
    el('p', { class: 'muted', text: `${chapter.name} · ${chapter.stage}` }),
    el('div', { class: 'stat-grid' }, [
      statLine('EXPERIMENT', `${continueLevel} / ${TOTAL_LEVELS}`),
      statLine('CHAPTER PROGRESS', `${chapterProgress.done} / ${chapterProgress.total}`),
      statLine('COMPLETION', `${summary.completed} levels · ${summary.stars} ★`),
      statLine('VOID ARCHIVE', `${foundSecrets} / ${TOTAL_SECRETS} chambers`)
    ]),
    el('div', { class: 'btn-row' }, [
      button(`CONTINUE — LEVEL ${continueLevel}${game.save.completedCount ? '' : ' (NEW GAME)'}`, {
        className: 'btn-primary btn-large',
        token: 'continue',
        onClick: () => {
          const beat = game.storyBeatFor(continueLevel);
          if (beat && !game.save.completedCount) game.showStory(beat);
          else game.startLevel(continueLevel);
        }
      })
    ])
  ], { className: 'panel-hero' });

  const entries = [
    { label: 'NEW GAME', hint: 'Erase this station and start from the first experiment.', onClick: () => confirmNewGame() },
    { label: 'LEVELS', hint: 'Chapter map, star record and secret chambers.', onClick: () => game.show('levels', {}, { state: 'levels' }) },
    { label: 'ACHIEVEMENTS', hint: `${Object.keys(game.save.data.achievements).length} of ${game.achievements().length} badges earned.`, onClick: () => game.show('achievements', {}, { state: 'levels' }) },
    { label: 'SETTINGS', hint: 'Audio, motion, contrast and text size.', onClick: () => game.show('settings', {}, { state: 'settings' }) },
    { label: 'IMPORT / EXPORT SAVE', hint: 'Move progress between devices with a file or a code.', onClick: () => game.show('save-data', {}, { state: 'save-data' }) },
    { label: 'CREDITS & HELP', hint: 'Controls, accessibility and how the rating works.', onClick: () => game.show('help', {}, { state: 'credits' }) }
  ];
  const endPreview = game.endingPreview();
  if (game.save.data.unlockedLevel >= 90 || Object.keys(game.save.data.meta.endings).length) {
    entries.splice(4, 0, {
      label: 'THE FOUR DOORS',
      hint: `The station currently reads your path as: ${endPreview.ending.name}.`,
      onClick: () => game.show('ending', { resolved: endPreview, preview: true }, { state: 'ending' })
    });
  }

  const menuList = el('div', { class: 'menu-list' }, entries.map((entry) => el('button', {
    type: 'button',
    class: 'menu-entry',
    onclick: entry.onClick
  }, [
    el('span', { class: 'menu-entry-label', text: entry.label }),
    el('span', { class: 'menu-entry-hint', text: entry.hint })
  ])));

  const footer = el('footer', { class: 'menu-footer' }, [
    el('span', { class: 'muted small', text: 'v1.0.0 · runs entirely in your browser · no account, no server' }),
    hiddenSigil(game)
  ]);

  root.append(el('div', { class: 'menu-wrap' }, [title, continuePanel, menuList, footer]));

  function confirmNewGame() {
    const overlay = el('div', { class: 'overlay', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Start a new game' } }, [
      el('div', { class: 'overlay-card' }, [
        el('h2', { text: 'START A NEW GAME?' }),
        el('p', { class: 'text-warn', text: 'Every experiment, star and discovery in this browser will be erased. Export a save first if you want to keep it.' }),
        el('div', { class: 'btn-col' }, [
          button('EXPORT SAVE FIRST', { onClick: () => game.show('save-data', {}, { state: 'save-data' }) }),
          button('ERASE AND START OVER', {
            className: 'btn-danger',
            onClick: () => {
              game.save.reset({ keepSettings: true });
              game.applyAllSettings();
              game.show('story', { beat: STORY_BEATS[0], after: false, fresh: true }, { state: 'story' });
            }
          }),
          button('CANCEL', { className: 'btn-primary', onClick: () => overlay.remove() })
        ])
      ])
    ]);
    root.append(overlay);
    const cancel = overlay.querySelector('.btn-primary');
    if (cancel) cancel.focus();
  }
}

/**
 * Secret: a maintenance panel in the menu footer. It is discoverable by
 * exploration (or by a story clue), grants the "latch" badge, and never blocks
 * anything if it is never found.
 */
export function hiddenSigil(game) {
  const found = !!game.save.getFlag('hiddenui:found');
  const sigil = el('button', {
    type: 'button',
    class: `sigil ${found ? 'found' : ''}`.trim(),
    text: found ? '⟡' : '·',
    attrs: {
      'aria-label': found ? 'Maintenance panel (already opened)' : 'A faint mark on the panel',
      title: found ? 'The panel is open' : 'Something is stamped into the casing'
    }
  });
  sigil.addEventListener('click', () => {
    if (found) {
      game.host.toast({ text: 'The panel is empty now. Whatever it held is in your log.', kind: 'info' });
      return;
    }
    game.save.setFlag('hiddenui:found', Date.now());
    sigil.textContent = '⟡';
    sigil.classList.add('found');
    game.audio.secret();
    game.checkAchievements();
    const discovered = game.collectSecrets();
    game.host.toast({ text: 'A panel clicks open in the casing — the station pretends not to notice.', kind: 'badge', ms: 5200 });
    if (discovered.length) {
      game.host.toast({ text: `${discovered.length} secret chamber${discovered.length > 1 ? 's' : ''} added to the Void Archive.`, kind: 'badge', ms: 5200 });
    }
  });
  return sigil;
}

export { CHAPTERS };
