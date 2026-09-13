/**
 * Level select — chapters, stars, best times and the Void Archive.
 *
 * Every level shows its state in three ways at once (icon shape, text label and
 * colour) so nothing depends on colour alone. Locked levels explain exactly
 * what unlocks them, and secret chambers list their condition once discovered.
 */

import { el, formatTime } from '../utils/dom.js';
import { button, panel, starRow } from './Shell.js';
import {
  CHAPTERS, SECRET_CHAPTER, TOTAL_LEVELS, TOTAL_SECRETS,
  levelsInChapter, levelDefinition, unlockDescription
} from '../levels/LevelManager.js';
import { PUZZLE_TYPES } from '../puzzles/index.js';

export function LevelSelect(root, game) {
  const allChapters = [...CHAPTERS, SECRET_CHAPTER];
  const startChapter = Math.min(12, Math.max(1, Math.ceil((game.save.data.unlockedLevel || 1) / 10)));
  let activeChapter = startChapter;

  const tabs = el('div', { class: 'chapter-tabs', attrs: { role: 'tablist', 'aria-label': 'Chapters' } });
  const body = el('div', { class: 'chapter-body' });

  allChapters.forEach((chapter) => {
    const progress = game.chapterProgress(chapter.id);
    const tab = el('button', {
      type: 'button',
      class: 'chapter-tab',
      role: 'tab',
      dataset: { chapter: String(chapter.id) },
      attrs: {
        'aria-selected': String(chapter.id === activeChapter),
        'aria-controls': `chapter-panel-${chapter.id}`,
        'aria-label': `${chapter.name}, ${progress.done} of ${progress.total} complete`
      }
    }, [
      el('span', { class: 'chapter-index', text: chapter.id === SECRET_CHAPTER.id ? '✦' : String(chapter.id) }),
      el('span', { class: 'chapter-name', text: chapter.name }),
      el('span', { class: 'chapter-progress', text: chapter.id === SECRET_CHAPTER.id ? `${game.secretLevels().filter((s) => s.unlocked).length}/${TOTAL_SECRETS}` : `${progress.done}/${progress.total}` })
    ]);
    tab.addEventListener('click', () => select(chapter.id));
    tabs.append(tab);
  });

  function select(chapterId) {
    activeChapter = chapterId;
    tabs.querySelectorAll('.chapter-tab').forEach((tab) => {
      tab.setAttribute('aria-selected', String(Number(tab.dataset.chapter) === chapterId));
    });
    render();
  }

  function render() {
    body.textContent = '';
    const chapter = allChapters.find((c) => c.id === activeChapter) || CHAPTERS[0];
    const levels = levelsInChapter(chapter.id);
    const progress = game.chapterProgress(chapter.id);
    const header = el('div', { class: 'chapter-head' }, [
      el('div', {}, [
        el('h2', { text: `${chapter.id === SECRET_CHAPTER.id ? '✦' : chapter.id}. ${chapter.name}` }),
        el('p', { class: 'muted', text: chapter.id === SECRET_CHAPTER.id ? 'Unlocked by discovery, never by chance.' : chapter.stage })
      ]),
      el('div', { class: 'chapter-head-stats' }, [
        el('span', { class: 'stat-pill', text: `${progress.done}/${progress.total} complete` }),
        el('span', { class: 'stat-pill', text: `${progress.stars}/${progress.maxStars} ★` })
      ])
    ]);

    const grid = el('div', { class: 'level-grid', attrs: { role: 'list' } });
    levels.forEach((definition) => {
      const status = game.levelStatus(definition.n);
      const chapterLocked = definition.n > game.save.data.unlockedLevel && !definition.secret;
      const locked = definition.secret ? !status.unlocked : chapterLocked;
      const puzzle = PUZZLE_TYPES[definition.puzzle];
      const card = el('button', {
        type: 'button',
        role: 'listitem',
        class: `level-card ${status.record ? 'done' : ''} ${locked ? 'locked' : ''}`.trim(),
        attrs: {
          'aria-label': locked
            ? `Level ${definition.n} ${definition.title} — locked. ${definition.secret ? unlockDescription(definition.unlock) : 'Complete the previous experiment.'}`
            : `Level ${definition.n} ${definition.title}, ${status.record ? `${status.record.stars} stars, best ${formatTime(status.record.bestTimeMs)}` : 'not completed'}. ${puzzle ? puzzle.name : definition.puzzle}.`
        },
        onclick: () => {
          if (locked) {
            game.host.toast({
              text: definition.secret ? unlockDescription(definition.unlock) : 'Complete the previous experiment to open this chamber.',
              kind: 'warn'
            });
            return;
          }
          game.startLevel(definition.n);
        }
      }, [
        el('div', { class: 'level-card-top' }, [
          el('span', { class: 'level-number', text: String(definition.n).padStart(3, '0') }),
          el('span', { class: 'level-lock', text: locked ? '🔒' : status.record ? '◆' : '○', attrs: { 'aria-hidden': 'true' } })
        ]),
        el('span', { class: 'level-title', text: definition.secret && !status.unlocked ? 'Undiscovered' : definition.title }),
        el('span', { class: 'level-puzzle', text: locked ? '—' : (puzzle ? `${puzzle.category.toUpperCase()} · ${puzzle.name}` : definition.puzzle) }),
        el('div', { class: 'level-card-foot' }, [
          status.record ? starRow(status.record.stars) : el('span', { class: 'level-empty', text: locked ? 'LOCKED' : 'OPEN' }),
          status.record ? el('span', { class: 'level-time', text: formatTime(status.record.bestTimeMs) }) : null
        ])
      ]);
      grid.append(card);
    });

    const footer = el('div', { class: 'chapter-foot' }, [
      el('p', { class: 'muted small', text: chapter.id === SECRET_CHAPTER.id
        ? 'Secret chambers appear here once you discover them. Countless routes lead in: total stars, badges, story decisions, and finishing chapters completely.'
        : 'Stars: ★ finish · ★★ finish within the attempt allowance · ★★★ attempt allowance and the time target.' })
    ]);

    body.append(el('section', { class: 'panel', attrs: { id: `chapter-panel-${chapter.id}`, role: 'tabpanel', 'aria-label': chapter.name } }, [header, grid, footer]));
  }

  const wrap = el('div', { class: 'levels-wrap' }, [
    el('div', { class: 'screen-head' }, [
      el('h1', { text: 'EXPERIMENT MAP' }),
      el('p', { class: 'muted', text: `${game.save.completedCount} of ${TOTAL_LEVELS} experiments complete · ${game.save.totalStars} ★ earned` })
    ]),
    tabs,
    body,
    el('div', { class: 'btn-row' }, [
      button('◀ MAIN MENU', { onClick: () => game.show('menu', {}, { state: 'menu' }) }),
      button(game.save.completedCount ? `CONTINUE — ${game.save.data.unlockedLevel}` : 'START LEVEL 1', {
        className: 'btn-primary',
        onClick: () => game.startLevel(Math.min(game.save.data.unlockedLevel || 1, TOTAL_LEVELS))
      })
    ])
  ]);
  root.append(wrap);
  render();
}

export { levelDefinition };
