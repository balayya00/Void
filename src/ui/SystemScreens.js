/**
 * Settings, save transfer, help and credits.
 *
 * The save screen is where the localStorage limitation is explained honestly:
 * progress lives in *this browser only*. Export to a file or copy the compact
 * code to move it between devices.
 */

import { el, formatTime } from '../utils/dom.js';
import { button, panel, statLine } from './Shell.js';
import { TOTAL_LEVELS, TOTAL_SECRETS } from '../levels/LevelManager.js';

const SETTING_ROWS = [
  { key: 'music', label: 'MUSIC', hint: 'Synthesised ambience. Never required to solve anything.' },
  { key: 'sfx', label: 'SOUND EFFECTS', hint: 'Clicks, confirmations and failure tones.' },
  { key: 'reducedMotion', label: 'REDUCED MOTION', hint: 'Shortens or removes animations and flashes.' },
  { key: 'highContrast', label: 'HIGH CONTRAST', hint: 'Stronger borders and text contrast.' },
  { key: 'largeText', label: 'LARGER TEXT', hint: 'Increases interface text size.' }
];

export function SettingsScreen(root, game, payload = {}) {
  const back = () => {
    if (payload.from === 'play' && game.level) game.show('play', {}, { state: 'playing' });
    else game.show('menu', {}, { state: 'menu' });
  };

  const toggles = SETTING_ROWS.map((row) => {
    const input = el('input', {
      type: 'checkbox',
      class: 'switch-input',
      checked: !!game.settings[row.key],
      attrs: { id: `setting-${row.key}`, 'aria-describedby': `hint-${row.key}` }
    });
    input.addEventListener('change', () => {
      game.applySetting(row.key, input.checked);
      game.host.toast({ text: `${row.label} ${input.checked ? 'on' : 'off'}`, kind: 'info', ms: 1400 });
    });
    return el('div', { class: 'setting-row' }, [
      el('label', { class: 'setting-label', attrs: { for: `setting-${row.key}` }, text: row.label }),
      el('span', { class: 'setting-hint', attrs: { id: `hint-${row.key}` }, text: row.hint }),
      el('label', { class: 'switch' }, [input, el('span', { class: 'switch-track' }, [el('span', { class: 'switch-thumb' })])])
    ]);
  });

  const summary = game.save.summary();

  root.append(el('div', { class: 'levels-wrap' }, [
    el('div', { class: 'screen-head' }, [
      el('h1', { text: 'SETTINGS' }),
      el('p', { class: 'muted', text: 'Everything can be changed at any time — including in the middle of an experiment.' })
    ]),
    panel([...toggles], { className: 'panel-settings' }),
    panel([
      el('h2', { text: 'PROGRESS' }),
      el('div', { class: 'stat-grid' }, [
        statLine('EXPERIMENTS', `${summary.completed} / ${TOTAL_LEVELS}`),
        statLine('SECRETS', `${summary.secrets} / ${TOTAL_SECRETS}`),
        statLine('STARS', summary.stars),
        statLine('BADGES', summary.achievements),
        statLine('LAST SAVE', summary.updatedAt ? new Date(summary.updatedAt).toLocaleString() : '—'),
        statLine('SCHEMA', `v${summary.version}`)
      ]),
      el('div', { class: 'btn-row' }, [
        button('IMPORT / EXPORT SAVE', { onClick: () => game.show('save-data', {}, { state: 'save-data' }) }),
        button('RESET PROGRESS', {
          className: 'btn-danger',
          onClick: () => confirmReset()
        })
      ])
    ]),
    el('div', { class: 'btn-row' }, [button('◀ BACK', { className: 'btn-primary', onClick: back })])
  ]));

  function confirmReset() {
    const overlay = el('div', { class: 'overlay', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Reset progress' } }, [
      el('div', { class: 'overlay-card' }, [
        el('h2', { text: 'RESET EVERYTHING?' }),
        el('p', { class: 'text-warn', text: 'All 120 experiments, stars, badges and discoveries in this browser are erased. Settings are kept.' }),
        el('div', { class: 'btn-col' }, [
          button('EXPORT FIRST', { onClick: () => game.show('save-data', {}, { state: 'save-data' }) }),
          button('RESET PROGRESS', {
            className: 'btn-danger',
            onClick: () => {
              game.save.reset({ keepSettings: true });
              game.host.toast({ text: 'Progress reset. The station starts again.', kind: 'warn' });
              overlay.remove();
              game.show('menu', {}, { state: 'menu' });
            }
          }),
          button('CANCEL', { className: 'btn-primary', onClick: () => overlay.remove() })
        ])
      ])
    ]);
    root.append(overlay);
  }
}

export function SaveDataScreen(root, game) {
  const summary = game.save.summary();
  const codeField = el('textarea', {
    class: 'code-field',
    rows: 4,
    readonly: true,
    attrs: { 'aria-label': 'Compact save code', spellcheck: 'false' }
  });
  codeField.value = game.save.exportCode();

  const importField = el('textarea', {
    class: 'code-field',
    rows: 4,
    attrs: { 'aria-label': 'Paste a save code or exported JSON', placeholder: 'Paste an NV1-… code or the contents of an exported .json file here.' }
  });
  const importStatus = el('p', { class: 'status-line', attrs: { role: 'status' } });

  const fileInput = el('input', {
    type: 'file',
    accept: '.json,application/json,text/plain',
    class: 'file-input',
    attrs: { 'aria-label': 'Import a save file' }
  });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      applyImport(text, `file ${file.name}`);
    } catch (err) {
      importStatus.textContent = `Could not read that file: ${err.message}`;
    }
  });

  function applyImport(text, source) {
    const result = game.save.importPayload(text);
    if (!result.ok) {
      importStatus.textContent = `Import rejected — ${result.error}`;
      game.host.toast({ text: `Import failed: ${result.error}`, kind: 'warn' });
      return;
    }
    if (result.migrations && result.migrations.length) {
      game.host.toast({ text: `Save upgraded from schema v${result.migrations[0]}.`, kind: 'info' });
    }
    if (result.repairs && result.repairs.length) {
      game.host.toast({ text: `Save repaired (${result.repairs.length} issue(s)).`, kind: 'info' });
    }
    game.applyAllSettings();
    importStatus.textContent = `Imported from ${source}. ${game.save.completedCount} experiments, ${game.save.totalStars} ★.`;
    game.host.toast({ text: 'Progress imported.', kind: 'badge' });
    game.show('save-data', {}, { state: 'save-data' });
  }

  root.append(el('div', { class: 'levels-wrap' }, [
    el('div', { class: 'screen-head' }, [
      el('h1', { text: 'SAVE DATA' }),
      el('p', { class: 'muted', text: 'Everything is stored locally with the key neurovoid_save_v1. No account, no server, nothing leaves this device unless you export it.' })
    ]),
    panel([
      el('h2', { text: 'EXPORT' }),
      el('div', { class: 'stat-grid' }, [
        statLine('EXPERIMENTS', summary.completed),
        statLine('STARS', summary.stars),
        statLine('SECRETS', summary.secrets),
        statLine('BADGES', summary.achievements)
      ]),
      el('div', { class: 'btn-row' }, [
        button('DOWNLOAD .JSON FILE', {
          className: 'btn-primary',
          onClick: () => {
            const blob = new Blob([game.save.exportJSON()], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = el('a', { href: url, download: `neurovoid-save-${new Date().toISOString().slice(0, 10)}.json` });
            document.body.append(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 4000);
            game.host.toast({ text: 'Save file exported.', kind: 'badge' });
          }
        }),
        button('COPY SAVE CODE', {
          onClick: async () => {
            const ok = await copyText(codeField.value);
            game.host.toast({ text: ok ? 'Save code copied to the clipboard.' : 'Copy failed — select the code and copy it manually.', kind: ok ? 'badge' : 'warn' });
          }
        })
      ]),
      el('label', { class: 'field-label', attrs: { for: 'save-code' }, text: 'Compact code (safe to paste anywhere you would paste a long password)' }),
      codeField
    ]),
    panel([
      el('h2', { text: 'IMPORT' }),
      el('p', { class: 'muted', text: 'Import a file, paste a code, or paste the JSON you exported. Invalid data is rejected without touching your current progress; repairable data is fixed and reported.' }),
      fileInput,
      importField,
      el('div', { class: 'btn-row' }, [
        button('IMPORT PASTED DATA', { className: 'btn-primary', onClick: () => applyImport(importField.value, 'pasted data') }),
        button('VALIDATE ONLY', {
          onClick: () => {
            const result = game.save.importPayload(importField.value);
            importStatus.textContent = result.ok ? 'That data is valid and would import cleanly.' : `Rejected — ${result.error}`;
          }
        })
      ]),
      importStatus
    ]),
    panel([
      el('h2', { text: 'KNOWN LIMITATION' }),
      el('p', { class: 'muted', text: 'localStorage does not sync between devices or browsers, and clearing site data erases it. Some browsers block localStorage in private mode — the game keeps playing and warns you that progress will not persist.' }),
      el('p', { class: 'muted', text: 'Workaround: export the .json file, or copy the compact code, and import it on the other device. Nothing else in the game needs the network.' })
    ]),
    el('div', { class: 'btn-row' }, [
      button('◀ MAIN MENU', { onClick: () => game.show('menu', {}, { state: 'menu' }) }),
      button('SETTINGS', { onClick: () => game.show('settings', {}, { state: 'settings' }) })
    ])
  ]));
}

async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) { /* fall through to the legacy path */ }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', 'true');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand && document.execCommand('copy');
    area.remove();
    return !!ok;
  } catch (err) {
    return false;
  }
}

export function HelpScreen(root, game) {
  const controls = [
    ['Touch', 'Tap any control. Nothing requires dragging, hovering or two fingers.'],
    ['Mouse', 'Click. Hovering is never required to progress.'],
    ['Keyboard', 'Tab moves focus, Enter or Space activates. Arrow keys move through grids. Esc or P pauses.'],
    ['Answer fields', 'Type with a keyboard or tap the on-screen keys — both work everywhere.']
  ];
  const rules = [
    ['★', 'Complete the experiment.'],
    ['★★', 'Complete it within the attempt allowance.'],
    ['★★★', 'Complete it within the allowance and the time target.'],
    ['Hints', 'A hint lowers the score but never the stars.'],
    ['Station assist', 'After three hints the station can finish the level: one star, score forfeited, progress kept.']
  ];

  root.append(el('div', { class: 'levels-wrap' }, [
    el('div', { class: 'screen-head' }, [
      el('h1', { text: 'HELP & CREDITS' }),
      el('p', { class: 'muted', text: 'NEURO//VOID is a browser game: vanilla JavaScript, procedural graphics, a synthesised soundtrack and no servers.' })
    ]),
    panel([
      el('h2', { text: 'CONTROLS' }),
      ...controls.map(([title, text]) => el('div', { class: 'help-row' }, [el('strong', { text: title }), el('span', { text }) ]))
    ]),
    panel([
      el('h2', { text: 'HOW THE RATING WORKS' }),
      ...rules.map(([mark, text]) => el('div', { class: 'help-row' }, [el('strong', { text: mark }), el('span', { text })])),
      el('p', { class: 'muted small', text: 'Stars are never random and never lost by replaying: your best result for each experiment is kept, and you can always return to improve it.' })
    ]),
    panel([
      el('h2', { text: 'ACCESSIBILITY' }),
      el('p', { class: 'muted', text: 'Every interactive element is at least 44×44 CSS pixels. Colours are never the only signal — shape, text and position always carry the same information. Reduced motion, high contrast and larger text are in Settings. Audio is optional and never required.' })
    ]),
    panel([
      el('h2', { text: 'CREDITS' }),
      el('p', { class: 'muted', text: 'Design, code, story, puzzle generators and the procedural soundtrack: the Void Station Collective. Built with Vite and the DOM; no game engine and no third-party runtime code.' }),
      el('p', { class: 'muted small', text: 'MIT licensed. All art is generated from vector primitives at runtime.' })
    ]),
    el('div', { class: 'btn-row' }, [
      button('◀ MAIN MENU', { className: 'btn-primary', onClick: () => game.show('menu', {}, { state: 'menu' }) }),
      button('SETTINGS', { onClick: () => game.show('settings', {}, { state: 'settings' }) })
    ])
  ]));
}

export { formatTime };
