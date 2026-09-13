/**
 * Story beats and endings.
 *
 * Story screens sit between chapters. A beat never blocks the player: it can be
 * read, answered with a statement that matches how they feel, and skipped
 * straight to the next experiment. The choice is recorded and feeds the ending
 * logic, the secret chambers and two badges.
 */

import { el } from '../utils/dom.js';
import { button, panel, starRow } from './Shell.js';
import { ENDINGS, resolveEnding } from '../story/StoryData.js';
import { chapterForLevel, TOTAL_LEVELS, TOTAL_SECRETS } from '../levels/LevelManager.js';

export function StoryScreen(root, game, payload = {}) {
  const beat = payload.beat;
  if (!beat) {
    game.show('menu', {}, { state: 'menu' });
    return () => {};
  }
  const chapter = chapterForLevel(Math.min(beat.chapter * 10, TOTAL_LEVELS));
  const nextLevel = payload.fresh ? 1 : Math.min(game.save.data.unlockedLevel || 1, TOTAL_LEVELS);

  const lines = el('div', { class: 'story-lines' }, beat.lines.map((line) => el('p', { class: 'story-line', text: line })));
  const speaker = el('div', { class: 'story-speaker' }, [
    el('span', { class: 'speaker-mark', text: '◈' }),
    el('span', { class: 'speaker-name', text: beat.speaker })
  ]);

  const choiceBox = el('div', { class: 'story-choice' });
  let chosen = null;

  const continueBtn = button(payload.fresh ? 'BEGIN EXPERIMENT 1' : `CONTINUE TO EXPERIMENT ${nextLevel}`, {
    className: 'btn-primary btn-large',
    onClick: () => {
      if (beat.choice && chosen) game.storyChoice(beat, chosen);
      if (beat.choice && chosen && beat.clues && beat.clues[chosen]) {
        game.host.toast({ text: beat.clues[chosen], kind: 'info', ms: 5200 });
      }
      if (payload.fresh) {
        game.show('levels', {}, { state: 'levels' });
      } else {
        game.startLevel(nextLevel);
      }
    }
  });

  if (beat.choice) {
    choiceBox.append(el('p', { class: 'eyebrow', text: beat.choice.prompt }));
    beat.choice.options.forEach((option) => {
      const btn = button(option.label, {
        className: 'story-option',
        onClick: () => {
          chosen = option.id;
          choiceBox.querySelectorAll('button').forEach((b) => b.classList.remove('selected'));
          btn.classList.add('selected');
          continueBtn.disabled = false;
          game.audio.ui();
        }
      });
      choiceBox.append(btn);
    });
    continueBtn.disabled = true;
  }

  const skip = button('SKIP TO EXPERIMENT', {
    className: 'btn-ghost',
    onClick: () => {
      if (beat.choice && chosen) game.storyChoice(beat, chosen);
      if (payload.fresh) game.show('levels', {}, { state: 'levels' });
      else game.startLevel(nextLevel);
    }
  });

  const meta = el('p', { class: 'muted small', text: `Log ${beat.id.toUpperCase()} · ${chapter.name} · ${chapter.stage}` });

  root.append(el('div', { class: 'story-wrap' }, [
    panel([speaker, lines, choiceBox, meta], { className: 'panel-story' }),
    el('div', { class: 'btn-row btn-row-wrap' }, [continueBtn, skip])
  ]));

  setTimeout(() => {
    if (!beat.choice) continueBtn.focus();
  }, 30);
}

export function EndingScreen(root, game, payload = {}) {
  const resolved = payload.resolved || resolveEnding(game.save.data);
  const ending = resolved.ending;
  const summary = game.save.summary();
  const secrets = game.secretLevels().filter((s) => s.unlocked).length;

  const archive = el('div', { class: 'ending-archive' }, ENDINGS.map((candidate) => {
    const unlocked = !!game.save.data.meta.endings[candidate.id] || (candidate.id === ending.id);
    return el('div', { class: `ending-card ${candidate.id === ending.id ? 'current' : ''} ${unlocked ? 'unlocked' : 'locked'}`.trim() }, [
      el('span', { class: 'ending-mark', text: unlocked ? '◆' : '◇' }),
      el('div', {}, [
        el('h3', { text: unlocked ? candidate.name : 'UNVISITED DOOR' }),
        el('p', { class: 'muted', text: unlocked ? candidate.tag : 'Conditions unknown. The station is still watching.' }),
        unlocked && candidate.id === ending.id ? el('p', { class: 'muted small', text: `This is the door your data points at: ${(resolved.reasons || []).join(', ')}.` }) : null
      ])
    ]);
  }));

  root.append(el('div', { class: 'levels-wrap' }, [
    el('div', { class: 'screen-head' }, [
      el('p', { class: 'eyebrow', text: payload.preview ? 'ENDING ARCHIVE (PREVIEW)' : 'ENDING' }),
      el('h1', { text: ending.name }),
      el('p', { class: 'tagline', text: ending.tag })
    ]),
    panel([
      ...ending.lines.map((line) => el('p', { class: 'story-line', text: line }))
    ], { className: 'panel-story panel-ending' }),
    panel([
      el('h2', { text: 'YOUR RECORD' }),
      el('div', { class: 'stat-grid' }, [
        el('div', { class: 'stat' }, [el('span', { class: 'stat-label', text: 'EXPERIMENTS' }), el('span', { class: 'stat-value', text: `${summary.completed} / ${TOTAL_LEVELS}` })]),
        el('div', { class: 'stat' }, [el('span', { class: 'stat-label', text: 'STARS' }), el('span', { class: 'stat-value' }, [starRow(Math.min(3, Math.ceil(summary.stars / 132)), 16), el('span', { text: ` ${summary.stars}` })])]),
        el('div', { class: 'stat' }, [el('span', { class: 'stat-label', text: 'SECRETS' }), el('span', { class: 'stat-value', text: `${secrets} / ${TOTAL_SECRETS}` })]),
        el('div', { class: 'stat' }, [el('span', { class: 'stat-label', text: 'BADGES' }), el('span', { class: 'stat-value', text: String(summary.achievements) })])
      ]),
      el('p', { class: 'muted small', text: 'Endings are decided by your decisions, discoveries and performance — never by a random number. Replaying the final chapters with different choices opens other doors.' })
    ]),
    el('h2', { class: 'section-title', text: 'THE FOUR DOORS' }),
    archive,
    el('div', { class: 'btn-row' }, [
      button('◀ MAIN MENU', { className: 'btn-primary', onClick: () => game.show('menu', {}, { state: 'menu' }) }),
      button('LEVEL MAP', { onClick: () => game.show('levels', {}, { state: 'levels' }) }),
      button('CREDITS & HELP', { onClick: () => game.show('help', {}, { state: 'credits' }) })
    ])
  ]));
}
