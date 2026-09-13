/**
 * Result screens: success, failure, achievement, and the secret discovery card.
 */

import { el, formatTime } from '../utils/dom.js';
import { button, panel, statLine, starRow } from './Shell.js';
import { ACHIEVEMENTS } from '../save/Achievements.js';
import { TOTAL_LEVELS } from '../levels/LevelManager.js';

export function SuccessScreen(root, game, payload = {}) {
  const result = payload.result || game.lastResult || { stars: 1, score: 0, timeMs: 0, attempts: 1 };
  const secrets = payload.secrets || [];
  const level = game.levelStatus(result.level);
  const definition = level.definition;
  const nextLevelNumber = result.level + 1;
  const isFinal = result.level >= TOTAL_LEVELS;

  const card = panel([
    el('p', { class: 'eyebrow', text: result.level > TOTAL_LEVELS ? 'SECRET CHAMBER CLEARED' : 'EXPERIMENT COMPLETE' }),
    el('h1', { text: definition ? definition.title : `Level ${result.level}` }),
    el('div', { class: 'result-stars' }, [starRow(result.stars, 34)]),
    el('div', { class: 'stat-grid' }, [
      statLine('SCORE', result.score),
      statLine('TIME', formatTime(result.timeMs)),
      statLine('ATTEMPTS', result.attempts),
      statLine('HINTS', result.hints || 0),
      statLine('BEST TIME', level.record ? formatTime(level.record.bestTimeMs) : '—'),
      statLine('PUZZLE', definition && game.level && game.level.n === result.level ? game.level.puzzle.name : '')
    ]),
    result.assisted
      ? el('p', { class: 'muted small', text: 'Station assist was used: the score is forfeited and one star awarded, exactly as the pause screen promised.' })
      : null,
    result.improved ? el('p', { class: 'notice-good', text: 'New personal best recorded.' }) : el('p', { class: 'muted small', text: 'Record kept — your earlier result was stronger.' })
  ], { className: 'panel-result' });

  const secretCards = secrets.map((secret) => panel([
    el('p', { class: 'eyebrow', text: 'VOID ARCHIVE UNLOCKED' }),
    el('h2', { text: `Chamber ${secret.n} — ${secret.title}` }),
    el('p', { class: 'muted', text: secret.objective }),
    el('div', { class: 'btn-row' }, [
      button(`ENTER CHAMBER ${secret.n}`, { className: 'btn-accent', onClick: () => game.startLevel(secret.n) })
    ])
  ], { className: 'panel-secret' }));

  const actions = el('div', { class: 'btn-row btn-row-wrap' }, [
    isFinal
      ? button('SEE YOUR ENDING', { className: 'btn-primary btn-large', onClick: () => game.finishRun() })
      : button(`NEXT — ${nextLevelNumber}`, { className: 'btn-primary', onClick: () => game.nextLevel() }),
    button('REPLAY', { onClick: () => game.startLevel(result.level) }),
    button('LEVEL MAP', { onClick: () => game.leaveLevel() }),
    button('MENU', { onClick: () => game.show('menu', {}, { state: 'menu' }) })
  ]);

  root.append(el('div', { class: 'result-wrap' }, [
    el('div', { class: 'result-main' }, [card, ...secretCards]),
    actions,
    el('div', { class: 'chapter-foot' }, [
      el('p', { class: 'muted small', text: 'Autosave is on: progress is stored in this browser and can be exported from the save screen.' })
    ])
  ]));

  setTimeout(() => {
    const first = actions.querySelector('button');
    if (first) first.focus();
  }, 30);
}

export function FailureScreen(root, game, payload = {}) {
  const level = game.level;
  const reason = payload.reason || 'The chamber rejected that approach.';
  const hintsUsed = level ? level.hints : 0;
  const assistReady = game.canAssist() || hintsUsed >= 3;

  root.append(el('div', { class: 'result-wrap' }, [
    panel([
      el('p', { class: 'eyebrow', text: 'PROTOCOL FAILURE' }),
      el('h1', { text: level ? level.definition.title : 'Experiment failed' }),
      el('p', { class: 'text-warn', text: reason }),
      el('p', { class: 'muted', text: `Attempts used: ${payload.attempts || 0} of ${payload.allowed || 0}. The chamber resets, but nothing you have learned is lost — and no penalty is permanent.` }),
      el('div', { class: 'stat-grid' }, [
        statLine('HINTS USED', hintsUsed),
        statLine('STARS AVAILABLE', assistReady ? '★ (assist)' : '★★★'),
        statLine('LEVEL', level ? level.n : '—')
      ])
    ], { className: 'panel-result panel-fail' }),
    el('div', { class: 'btn-row btn-row-wrap' }, [
      button('TRY AGAIN', { className: 'btn-primary btn-large', onClick: () => game.retryAfterFailure() }),
      button('REQUEST A HINT', {
        onClick: () => {
          game.retryAfterFailure();
          game.useHint(); // PlayScreen shows the panel when it hears level:hint
        }
      }),
      button('LEVEL MAP', { onClick: () => game.leaveLevel() }),
      button('MAIN MENU', { onClick: () => game.show('menu', {}, { state: 'menu' }) })
    ]),
    el('div', { class: 'chapter-foot' }, [
      el('p', { class: 'muted small', text: 'Stuck is never permanent: after three hints the station will finish the experiment for you, keeping your progress (and one star).' })
    ])
  ]));
}

export function AchievementScreen(root, game, payload = {}) {
  const list = payload.list || [];
  root.append(el('div', { class: 'result-wrap' }, [
    panel([
      el('p', { class: 'eyebrow', text: list.length > 1 ? 'BADGES UNLOCKED' : 'BADGE UNLOCKED' }),
      ...list.map((achievement) => el('div', { class: 'badge-card' }, [
        el('span', { class: 'badge-icon', text: achievement.icon || '◆' }),
        el('div', {}, [
          el('h2', { text: achievement.name }),
          el('p', { class: 'muted', text: achievement.description })
        ])
      ]))
    ], { className: 'panel-result panel-badge' }),
    el('div', { class: 'btn-row' }, [
      button('CONTINUE', { className: 'btn-primary', onClick: () => game.show('levels', {}, { state: 'levels' }) }),
      button('ACHIEVEMENTS', { onClick: () => game.show('achievements', {}, { state: 'levels' }) })
    ])
  ]));
}

export function AchievementsScreen(root, game) {
  const list = game.achievements();
  const unlocked = list.filter((a) => a.unlocked).length;
  const grid = el('div', { class: 'badge-grid' }, list.map((achievement) => el('div', {
    class: `badge ${achievement.unlocked ? 'unlocked' : 'locked'}`,
    attrs: { 'aria-label': `${achievement.name}: ${achievement.unlocked ? 'unlocked' : 'locked'}. ${achievement.description}` }
  }, [
    el('span', { class: 'badge-icon', text: achievement.unlocked ? (achievement.icon || '◆') : '?' }),
    el('span', { class: 'badge-name', text: achievement.unlocked ? achievement.name : 'Locked' }),
    el('span', { class: 'badge-desc', text: achievement.description })
  ])));

  root.append(el('div', { class: 'levels-wrap' }, [
    el('div', { class: 'screen-head' }, [
      el('h1', { text: 'ACHIEVEMENTS' }),
      el('p', { class: 'muted', text: `${unlocked} of ${list.length} badges earned. Badges unlock secret chambers — they are not decoration.` })
    ]),
    grid,
    el('div', { class: 'btn-row' }, [
      button('◀ MAIN MENU', { onClick: () => game.show('menu', {}, { state: 'menu' }) }),
      button('LEVEL MAP', { onClick: () => game.show('levels', {}, { state: 'levels' }) })
    ])
  ]));
}

export { ACHIEVEMENTS };
