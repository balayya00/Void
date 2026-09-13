/**
 * PlayScreen — HUD + puzzle surface + in-level overlays.
 *
 * The puzzle stays mounted while paused (pause is an overlay, not a screen
 * replacement), and every listener/timer created here is released in the
 * cleanup function the controller calls before showing the next screen.
 */

import { el, clear, formatTime } from '../utils/dom.js';
import { button, starRow, timeLabel } from './Shell.js';
import { HINTS_BEFORE_ASSIST, FAILURE_GRACE } from '../core/Game.js';
import { starCriteria } from '../levels/LevelManager.js';

export function PlayScreen(root, game) {
  const level = game.level;
  if (!level) {
    game.show('menu', {}, { state: 'menu' });
    return () => {};
  }
  const disposers = [];
  const on = (target, type, handler, opts) => {
    target.addEventListener(type, handler, opts);
    disposers.push(() => target.removeEventListener(type, handler, opts));
  };

  // ── HUD ────────────────────────────────────────────────────────────────
  const chapterLabel = `${level.secret ? 'VOID ARCHIVE' : `CHAPTER ${level.chapter.id}`} · ${level.chapter.stage.toUpperCase()}`;
  const levelLabel = `EXPERIMENT ${String(level.n).padStart(3, '0')}${level.secret ? ' (SECRET)' : ''} / ${level.secret ? '' : '120'}`;
  const objective = el('p', { class: 'objective', text: level.definition.objective });
  const attemptsLabel = el('span', { class: 'hud-value', text: String(level.attempts) });
  const timerLabel = el('span', { class: 'hud-value', text: formatTime(0) });
  const parLabel = el('span', { class: 'hud-sub', text: `target ${level.par.time}s` });
  const hintCount = el('span', { class: 'hud-value', text: `${level.hints}/${HINTS_BEFORE_ASSIST}` });

  const hudTop = el('div', { class: 'hud-top' }, [
    el('div', { class: 'hud-block' }, [
      el('span', { class: 'hud-label', text: chapterLabel }),
      el('span', { class: 'hud-title', text: level.definition.title })
    ]),
    el('div', { class: 'hud-stats' }, [
      el('div', { class: 'hud-stat' }, [el('span', { class: 'hud-label', text: 'ATTEMPTS' }), attemptsLabel]),
      el('div', { class: 'hud-stat' }, [el('span', { class: 'hud-label', text: 'TIME' }), timerLabel, parLabel]),
      el('div', { class: 'hud-stat' }, [el('span', { class: 'hud-label', text: 'HINTS' }), hintCount])
    ])
  ]);
  const hudMeta = el('div', { class: 'hud-meta' }, [el('span', { class: 'hud-sub', text: levelLabel })]);

  const pauseBtn = button('PAUSE', { className: 'btn-ghost', ariaLabel: 'Pause the experiment', onClick: () => game.togglePause() });
  const hintBtn = button('HINT', { className: 'btn-ghost', ariaLabel: 'Request a hint', onClick: () => useHint() });
  const statusLine = el('p', { class: 'status-line', attrs: { role: 'status' }, text: 'Calibrating…' });

  const hud = el('div', { class: 'hud' }, [
    hudTop,
    el('div', { class: 'hud-objective' }, [objective, hudMeta]),
    el('div', { class: 'hud-actions' }, [statusLine, el('div', { class: 'hud-buttons' }, [hintBtn, pauseBtn])])
  ]);

  // ── puzzle surface ─────────────────────────────────────────────────────
  const puzzleHost = el('div', { class: 'puzzle-host', attrs: { 'aria-label': level.definition.title } });
  const wrap = el('div', { class: 'play-wrap' }, [hud, puzzleHost]);
  root.append(wrap);

  const ctx = game.buildPuzzleCtx({
    onStatus: (text) => { statusLine.textContent = text; game.host.setStatus(text); }
  });

  let puzzleCleanup = null;
  try {
    puzzleCleanup = level.puzzle.mount(puzzleHost, level.params, ctx);
  } catch (err) {
    console.error('[neurovoid] puzzle failed to mount', err);
    clear(puzzleHost);
    puzzleHost.append(el('div', { class: 'panel panel-warn' }, [
      el('h2', { text: 'This chamber failed to initialise.' }),
      el('p', { class: 'muted', text: 'The station logged the fault. You can restart it or return to the map — your progress is safe.' }),
      el('div', { class: 'btn-row' }, [
        button('RESTART CHAMBER', { className: 'btn-primary', onClick: () => game.restartLevel() }),
        button('LEVEL MAP', { onClick: () => game.leaveLevel() })
      ])
    ]));
  }

  if (level.definition.taught) {
    game.host.toast({
      text: `New mechanic: ${level.definition.taught.replace(/-/g, ' ')}`,
      kind: 'info',
      ms: 2600
    });
  }

  // ── overlays ───────────────────────────────────────────────────────────
  const overlayHost = el('div', { class: 'overlay-host' });
  root.append(overlayHost);
  let pauseOverlay = null;
  let hintPanel = null;

  function openPause() {
    if (pauseOverlay) return;
    const criteria = starCriteria(level.par);
    pauseOverlay = el('div', { class: 'overlay', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Paused' } }, [
      el('div', { class: 'overlay-card' }, [
        el('h2', { text: 'PAUSED' }),
        el('p', { class: 'muted', text: `Experiment ${level.n} · ${level.definition.title}` }),
        el('div', { class: 'star-rules' }, criteria.map((line) => el('p', { text: line }))),
        game._pauseHint ? el('p', { class: 'pause-hint', text: `Chamber note: ${game._pauseHint}` }) : null,
        el('div', { class: 'btn-col' }, [
          button('RESUME', { className: 'btn-primary', onClick: () => game.resume() }),
          button('RESTART EXPERIMENT', { onClick: () => { game.resume(); game.restartLevel(); } }),
          button('SETTINGS', { onClick: () => game.show('settings', { from: 'play' }, { state: 'settings' }) }),
          button('LEVEL MAP', { onClick: () => game.leaveLevel() })
        ])
      ])
    ]);
    overlayHost.append(pauseOverlay);
    const first = pauseOverlay.querySelector('button');
    if (first) first.focus();
  }

  function closePause() {
    if (!pauseOverlay) return;
    pauseOverlay.remove();
    pauseOverlay = null;
    pauseBtn.focus();
  }

  function useHint() {
    game.useHint(); // PlayScreen reacts through the level:hint event below
  }

  function showHint({ text }) {
    hintCount.textContent = `${level.hints}/${HINTS_BEFORE_ASSIST}`;
    if (hintPanel) hintPanel.remove();
    hintPanel = el('div', { class: 'hint-panel', attrs: { role: 'status' } }, [
      el('strong', { text: `Hint ${level.hints}` }),
      el('p', { text }),
      game.canAssist()
        ? el('div', { class: 'hint-assist' }, [
            el('p', { class: 'muted', text: 'You have used every hint. The station can finish this experiment for you: you keep the level and one star, but the score is forfeited.' }),
            button('LET THE STATION FINISH IT', { className: 'btn-accent', onClick: () => { game.assist(); } })
          ])
        : null
    ]);
    overlayHost.append(hintPanel);
    setTimeout(() => { if (hintPanel) hintPanel.remove(); hintPanel = null; }, 9000);
    game.host.setStatus(text);
  }

  // ── bus wiring ─────────────────────────────────────────────────────────
  disposers.push(game.bus.on('level:tick', ({ elapsed }) => {
    timerLabel.textContent = formatTime(elapsed);
  }));
  disposers.push(game.bus.on('level:hint', (payload) => showHint(payload)));
  disposers.push(game.bus.on('level:fail', ({ reason, attempts }) => {
    attemptsLabel.textContent = String(attempts);
    statusLine.textContent = reason || 'Failed attempt — the chamber resets that step.';
    game.host.toast({ text: reason || 'Failed attempt', kind: 'warn', ms: 2200 });
  }));
  disposers.push(game.bus.on('level:pause', () => openPause()));
  disposers.push(game.bus.on('level:resume', () => closePause()));
  disposers.push(game.bus.on('level:pausehint', ({ text }) => { game._pauseHint = text; }));
  disposers.push(game.bus.on('achievements', ({ list }) => {
    list.forEach((achievement, i) => {
      setTimeout(() => game.host.toast({ text: `BADGE UNLOCKED — ${achievement.name}`, kind: 'badge', ms: 4200 }), i * 400);
    });
  }));
  disposers.push(game.bus.on('toast', (payload) => game.host.toast(payload)));

  // ── cleanup ────────────────────────────────────────────────────────────
  return () => {
    game.stopTimer();
    if (puzzleCleanup) {
      try { puzzleCleanup(); } catch (err) { console.warn('[neurovoid] puzzle cleanup failed', err); }
      puzzleCleanup = null;
    }
    disposers.forEach((fn) => fn());
    disposers.length = 0;
    clear(overlayHost);
    game.host.setStatus('');
  };
}

export function levelIntroLine(level) {
  return level.secret
    ? `SECRET CHAMBER ${level.n} · ${level.definition.title}`
    : `EXPERIMENT ${level.n} · ${level.definition.title}`;
}

export function attemptsRemaining(level) {
  const allowed = level.par.attempts + FAILURE_GRACE;
  return Math.max(0, allowed - level.attempts);
}

export { starRow, timeLabel, button };
