/**
 * NEURO//VOID — entry point.
 *
 * Boot order matters:
 *   1. load (and repair) the save,
 *   2. build the audio manager (silent until the first gesture),
 *   3. build the shell + game controller,
 *   4. register the screens,
 *   5. show the menu, then register the service worker (production only).
 *
 * Nothing here downloads anything at runtime: the game is fully offline once
 * the bundle is cached, and every failure path falls back to something playable.
 */

import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/screens.css';
import './styles/puzzles.css';

import { SaveManager } from './save/SaveManager.js';
import { AudioManager } from './core/AudioManager.js';
import { Game } from './core/Game.js';
import { STATES } from './core/GameState.js';
import { Shell } from './ui/Shell.js';
import { MenuScreen } from './ui/MenuScreen.js';
import { LevelSelect } from './ui/LevelSelect.js';
import { PlayScreen } from './ui/PlayScreen.js';
import { SuccessScreen, FailureScreen, AchievementScreen, AchievementsScreen } from './ui/ResultScreens.js';
import { SettingsScreen, SaveDataScreen, HelpScreen } from './ui/SystemScreens.js';
import { StoryScreen, EndingScreen } from './ui/StoryScreen.js';
import { el } from './utils/dom.js';

export function boot(mount = document.getElementById('app')) {
  if (!mount) throw new Error('NEURO//VOID: mount element missing');

  const save = new SaveManager({ onStatus: (status) => game && game.bus.emit('save:status', status) });
  const loadResult = save.load();

  const audio = new AudioManager(save.data.settings);
  const shell = new Shell(mount);
  const game = new Game({ root: shell.screens, save, audio, host: shell });
  game.host = shell;

  // screens
  game.register('menu', MenuScreen);
  game.register('levels', LevelSelect);
  game.register('play', PlayScreen);
  game.register('success', SuccessScreen);
  game.register('failure', FailureScreen);
  game.register('achievement', AchievementScreen);
  game.register('achievements', AchievementsScreen);
  game.register('settings', SettingsScreen);
  game.register('save-data', SaveDataScreen);
  game.register('help', HelpScreen);
  game.register('story', StoryScreen);
  game.register('ending', EndingScreen);

  game.applyAllSettings();
  game.onReady();

  // header behaviour
  shell.brand.addEventListener('click', () => {
    if (game.state.inPuzzle && game.level) game.leaveLevel();
    else game.show('menu', {}, { state: STATES.MENU });
  });
  shell.setSaveIndicator(loadResult.recovered ? 'RECOVERED' : loadResult.fresh ? 'NEW' : 'READY');
  game.bus.on('save:status', (status) => {
    if (!status) return;
    const label = {
      saved: 'SAVED',
      saving: 'SAVING',
      dirty: 'SAVING',
      loaded: 'READY',
      repaired: 'REPAIRED',
      recovered: 'RECOVERED',
      migrated: 'MIGRATED',
      imported: 'IMPORTED',
      exported: 'EXPORTED',
      reset: 'RESET',
      error: 'STORAGE OFF',
      warning: 'STORAGE FULL',
      fresh: 'NEW'
    }[status.kind] || 'READY';
    shell.setSaveIndicator(label);
    if (status.kind === 'repaired' || status.kind === 'recovered' || status.kind === 'error') {
      shell.toast({ text: status.message, kind: status.kind === 'error' ? 'warn' : 'info', ms: 5200 });
    }
  });

  // first user gesture unlocks Web Audio (required by autoplay policies)
  const unlockAudio = () => {
    audio.unlock();
    audio.applySettings(save.data.settings);
    window.removeEventListener('pointerdown', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
  };
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);

  // pause the audio when the tab is hidden; save the pending write on exit
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      audio.suspend();
      save.flush();
      if (game.state.current === STATES.PLAYING) game.pause();
    } else {
      audio.resume();
    }
  });
  window.addEventListener('pagehide', () => save.flush());
  window.addEventListener('beforeunload', () => save.flush());

  // the very first story beat, then the menu — unless progress already exists
  if (loadResult.fresh && !save.completedCount) {
    game.show('menu', {}, { state: STATES.MENU });
  } else {
    game.show('menu', {}, { state: STATES.MENU });
  }

  mount.setAttribute('aria-busy', 'false');
  const bootScreen = mount.querySelector('.boot-screen');
  if (bootScreen) bootScreen.remove();

  registerServiceWorker();
  return { game, save, audio, shell };
}

function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (!import.meta.env || !import.meta.env.PROD) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('[neurovoid] offline cache unavailable', err);
    });
  });
}

// Auto-boot in the browser; tests import `boot` and drive it themselves.
if (typeof document !== 'undefined' && document.getElementById('app') && !window.__NEUROVOID_TEST__) {
  try {
    boot();
  } catch (err) {
    console.error('[neurovoid] fatal boot error', err);
    const mount = document.getElementById('app');
    if (mount) {
      mount.innerHTML = '';
      mount.append(el('div', { class: 'panel panel-warn' }, [
        el('h1', { text: 'The station failed to start.' }),
        el('p', { class: 'muted', text: err && err.message ? err.message : 'Unknown error.' }),
        el('p', { class: 'muted small', text: 'Try a hard refresh. If it keeps happening, clear this site\'s storage to reset the save.' })
      ]));
    }
  }
}
