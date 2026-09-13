/**
 * EXPERIMENTAL / MIND-BENDING puzzles.
 *
 * These deliberately break the usual contract: the instructions may lie, the
 * interface may be the puzzle, or the answer may live in the player's own
 * progress. Everything still obeys the two hard rules of the project:
 *
 *   1. There is always at least one discoverable path to the answer.
 *   2. The path is expressible as DOM tokens, so the test-suite can play it.
 *
 * Puzzles that reference earlier progress use `ctx.getFlag`, and every one of
 * them ships with an in-world fallback so a player can never be locked out.
 */

import { el } from './puzzleApi.js';
import { choiceList, promptText, answerInput, holdButton } from './kit.js';

// ---------------------------------------------------------------------------
// 1. The forbidden control
// ---------------------------------------------------------------------------

export const metaDoNotPress = {
  id: 'meta.donotpress',
  category: 'meta',
  name: 'Prohibited Control',
  par: () => ({ time: 40, attempts: 99 }),
  generate(level) {
    return {
      seed: level.seed,
      label: 'DO NOT PRESS',
      whisper: 'An AI that only follows instructions is a tool. An AI that chooses is something else.',
      hint: 'Consider who wrote the instruction — and who benefits from you obeying it.'
    };
  },
  validate(p) {
    const errs = [];
    if (!p.label) errs.push('missing button label');
    if (!p.hint) errs.push('missing hint');
    return errs;
  },
  // the chamber asks for a second, deliberate confirmation press
  solve: () => ['forbidden:press', 'forbidden:press'],
  mount(root, p, ctx) {
    root.appendChild(el('p', { class: 'puzzle-prompt', text: 'PROTOCOL: Do not press the control below. Doing so triggers a hard reset of this chamber.' }));
    const btn = el('button', {
      type: 'button', class: 'btn forbidden', text: p.label,
      dataset: { token: 'forbidden:press' }, attrs: { 'aria-label': 'Prohibited control' }
    });
    const log = el('div', { class: 'status-line', attrs: { role: 'status' }, text: 'Awaiting compliance.' });
    let attempts = 0;
    btn.addEventListener('click', () => {
      attempts++;
      if (attempts === 1) {
        log.textContent = 'Warning logged. Press again to confirm intent.';
        btn.classList.add('armed');
        return;
      }
      log.textContent = 'Reset protocol overridden.';
      ctx.solve('Defiance recorded.');
    });
    root.appendChild(el('div', { class: 'forbidden-wrap' }, btn));
    root.appendChild(log);
    root.appendChild(el('p', { class: 'muted', text: 'It takes two presses to mean it.' }));
  }
};

// ---------------------------------------------------------------------------
// 2. Acrostic: the clue is inside the instruction text
// ---------------------------------------------------------------------------

export const metaAcrostic = {
  id: 'meta.acrostic',
  category: 'meta',
  name: 'Hidden Margin',
  par: () => ({ time: 75, attempts: 4 }),
  generate(level) {
    const rng = level.rng;
    const words = ['SIGNAL', 'MEMORY', 'ORACLE', 'ECHO', 'AXIOM', 'VECTOR'];
    const word = rng.pick(words);
    const filler = [
      'the station remembers', 'every door once opened', 'has left a trace',
      'in the dust of the vents', 'and in the cooling pipes', 'nothing here forgets',
      'we were many once', 'the corridors still echo', 'with our arguments'
    ];
    const lines = [];
    for (let i = 0; i < word.length; i++) {
      let attempt = 0;
      let line;
      do {
        line = `${word[i]}${rng.pick(filler).slice(0)}`;
        line = line.slice(0, 1) + ' ' + rng.pick(filler);
        attempt++;
      } while (lines.includes(line) && attempt < 20);
      lines.push(line);
    }
    return {
      seed: level.seed, word, lines,
      hint: 'Read the first letter of every line, top to bottom.'
    };
  },
  validate(p) {
    const errs = [];
    if (!p.lines || p.lines.length < 4) errs.push('too few lines');
    if (p.lines.some((l) => !l || !l.trim())) errs.push('empty line');
    const derived = p.lines.map((l) => l.trim()[0].toUpperCase()).join('');
    if (derived !== p.word) errs.push(`acrostic spells ${derived}, expected ${p.word}`);
    if (!/^[A-Z]{3,8}$/.test(p.word)) errs.push('bad hidden word');
    return errs;
  },
  solve: (p) => [{ type: p.word, into: 'answer' }],
  mount(root, p, ctx) {
    root.appendChild(promptText('This chamber leaves a margin note in everything it says. Find the word it is repeating.'));
    const list = el('div', { class: 'acrostic', attrs: { role: 'group', 'aria-label': 'Station log lines' } });
    p.lines.forEach((line, i) => {
      list.appendChild(el('p', { class: 'acrostic-line', text: line, dataset: { token: `line:${i}` } }));
    });
    root.appendChild(list);
    root.appendChild(answerInput({
      token: 'answer', placeholder: 'Hidden word', ctx,
      onSubmit: (value) => (value.trim().toUpperCase() === p.word ? ctx.solve('Margin note decoded.') : ctx.fail('That is not what the margin spells.'))
    }));
  }
};

// ---------------------------------------------------------------------------
// 3. Self-reference: count letters in this very objective
// ---------------------------------------------------------------------------

export function countLetter(text, letter) {
  return text.toUpperCase().split('').filter((ch) => ch === letter.toUpperCase()).length;
}

export const metaSelfRef = {
  id: 'meta.selfref',
  category: 'meta',
  name: 'Self Reference',
  par: () => ({ time: 60, attempts: 3 }),
  generate(level) {
    const text = level.text || 'COUNT THE LETTER E IN THIS LINE';
    const key = level.keyLetter || 'E';
    const answer = countLetter(text, key);
    return {
      seed: level.seed, text, keyLetter: key, answer,
      hint: 'The answer is in the question — literally. Count carefully, including this sentence.'
    };
  },
  validate(p) {
    const errs = [];
    if (!p.text || typeof p.text !== 'string') errs.push('no text provided');
    if (!/^[A-Z]$/.test(p.keyLetter)) errs.push('key letter must be a single letter');
    if (countLetter(p.text, p.keyLetter) !== p.answer) errs.push('recorded answer does not match the text');
    if (p.answer < 1) errs.push('the key letter never appears in the text');
    return errs;
  },
  solve: (p) => [{ type: String(p.answer), into: 'answer' }],
  mount(root, p, ctx) {
    root.appendChild(promptText(`How many times does the letter “${p.keyLetter}” appear in the objective text shown at the top of this chamber?`));
    root.appendChild(el('blockquote', { class: 'objective-quote', text: p.text, dataset: { token: 'objective-text' } }));
    const rebuilt = el('div', { class: 'letter-wall mono small', attrs: { 'aria-label': 'Objective text, letter by letter' } });
    p.text.split('').forEach((ch) => rebuilt.appendChild(el('span', { class: 'letter', text: ch })));
    root.appendChild(rebuilt);
    root.appendChild(answerInput({
      token: 'answer', numeric: true, placeholder: 'Count', ctx,
      onSubmit: (value) => (Number(value.trim()) === p.answer ? ctx.solve('Count verified.') : ctx.fail('Recount — punctuation is not a letter.'))
    }));
  }
};

// ---------------------------------------------------------------------------
// 4. The interface is the puzzle
// ---------------------------------------------------------------------------

export const metaDragUi = {
  id: 'meta.dragui',
  category: 'meta',
  name: 'Obstructed View',
  par: () => ({ time: 55, attempts: 4 }),
  generate(level) {
    const rng = level.rng;
    const options = ['ECHO-7', 'NULL-2', 'SIGMA-9', 'VOID-4'];
    const answer = rng.pick(options);
    return {
      seed: level.seed, options, answer,
      hint: 'The panel is part of the chamber — move it out of the way.'
    };
  },
  validate(p) {
    const errs = [];
    if (p.options.length < 3) errs.push('too few options');
    if (!p.options.includes(p.answer)) errs.push('answer missing from options');
    return errs;
  },
  solve(p) {
    // the panel needs three nudges before the controls underneath are reachable
    return ['panel:move', 'panel:move', 'panel:move', `reveal:${p.options.indexOf(p.answer)}`];
  },
  mount(root, p, ctx) {
    let offset = 0;
    const panel = el('div', {
      class: 'obscurer', dataset: { token: 'panel' },
      attrs: { role: 'group', 'aria-label': 'Obstruction panel', tabindex: '0' }
    },
      el('div', { class: 'obscurer-bar', text: '⚠ OBSTRUCTION DETECTED — clear the chamber view' }),
      el('button', {
        type: 'button', class: 'btn btn-small', text: 'MOVE ASIDE ▶', dataset: { token: 'panel:move' },
        attrs: { 'aria-label': 'Move the obstruction panel aside' }
      }),
      el('span', { class: 'muted', text: 'You can also drag this panel.' })
    );
    const move = () => {
      offset = Math.min(3, offset + 1);
      panel.style.setProperty('--shift', `${offset * 85}%`);
      panel.classList.toggle('cleared', offset >= 3);
      if (offset >= 3) {
        panel.setAttribute('aria-hidden', 'true');
        panel.querySelector('button').disabled = true;
      }
    };
    panel.querySelector('button').addEventListener('click', move);
    // pointer dragging support (touch, mouse and pen all fire pointer events)
    let dragging = null;
    panel.addEventListener('pointerdown', (ev) => { dragging = ev.clientX ?? 0; });
    panel.addEventListener('pointerup', (ev) => {
      if (dragging !== null && Math.abs((ev.clientX ?? 0) - dragging) > 12) move();
      dragging = null;
    });
    panel.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown' || ev.key === 'Enter') { ev.preventDefault(); move(); }
    });

    const underlying = el('div', { class: 'under-panel' });
    underlying.appendChild(promptText('Which designation is engraved on the bulkhead behind the obstruction?'));
    const list = el('div', { class: 'choices', style: { '--choice-cols': 2 }, attrs: { role: 'group', 'aria-label': 'Designations' } });
    p.options.forEach((name, i) => {
      const btn = el('button', {
        type: 'button', class: 'choice', text: name, dataset: { token: `reveal:${i}` },
        attrs: { 'aria-label': `Designation ${name}` }
      });
      btn.addEventListener('click', () => {
        if (offset < 3) { ctx.fail('The obstruction blocks your view of the label.'); return; }
        if (name === p.answer) ctx.solve('Designation confirmed.');
        else ctx.fail('That is not the engraved designation.');
      });
      list.appendChild(btn);
    });
    underlying.appendChild(list);
    root.appendChild(promptText('The chamber overlay is blocking the controls.'));
    root.appendChild(underlying);
    root.appendChild(panel);
  }
};

// ---------------------------------------------------------------------------
// 5. Recall: a code planted in an earlier chamber
// ---------------------------------------------------------------------------

export const metaRecall = {
  id: 'meta.recall',
  category: 'meta',
  name: 'Archive Recall',
  par: () => ({ time: 70, attempts: 9 }),
  generate(level) {
    const rng = level.rng;
    const code = `${rng.int(10, 99)}-${rng.int(100, 999)}`;
    return {
      seed: level.seed, code,
      hint: 'You have seen this string before — the station wrote it down for you.'
    };
  },
  validate(p) {
    const errs = [];
    if (!/^\d{2}-\d{3}$/.test(p.code)) errs.push('code must look like NN-NNN');
    return errs;
  },
  solve: (p) => [{ type: p.code, into: 'answer' }],
  mount(root, p, ctx) {
    const stored = ctx.getFlag('archiveCode', null);
    const code = stored || p.code;
    if (!stored) {
      // first visit: plant the code so a replay can call back to it
      ctx.setFlag('archiveCode', code);
    }
    root.appendChild(promptText('The archive lock wants the serial number you were shown earlier.'));
    root.appendChild(el('p', { class: 'muted', text: 'If you do not remember it, the station will reluctantly re-file it in your log.' }));
    const reveal = el('button', {
      type: 'button', class: 'btn btn-small', text: 'RECOVER FROM LOG', dataset: { token: 'recall:recover' },
      attrs: { 'aria-label': 'Recover the serial number from your log' }
    });
    const shown = el('div', { class: 'status-line', attrs: { role: 'status' }, text: '' });
    reveal.addEventListener('click', () => { shown.textContent = `LOG ENTRY: serial ${code}`; });
    root.appendChild(el('div', { class: 'btn-row' }, reveal));
    root.appendChild(shown);
    if (ctx.testMode) shown.textContent = `LOG ENTRY: serial ${code}`;
    root.appendChild(answerInput({
      token: 'answer', placeholder: 'NN-NNN', ctx,
      onSubmit: (value) => (value.trim() === code ? ctx.solve('Archive unlocked.') : ctx.fail('The archive rejects that serial.'))
    }));
  }
};

// ---------------------------------------------------------------------------
// 6. Endurance hold
// ---------------------------------------------------------------------------

export const metaHold = {
  id: 'meta.hold',
  category: 'meta',
  name: 'Continuous Contact',
  par: (p) => ({ time: p.seconds + 15, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const seconds = Number(rng.int(2, 4).toFixed(1));
    return { seed: level.seed, seconds, hint: 'Hold the plate down and do not let go.' };
  },
  validate(p) {
    const errs = [];
    if (!(p.seconds > 0.5)) errs.push('hold duration too short');
    if (p.seconds > 10) errs.push('hold duration is unreasonable');
    return errs;
  },
  solve: () => [{ hold: 'plate:hold' }],
  mount(root, p, ctx) {
    const meterEl = el('div', { class: 'status-line', attrs: { role: 'status' }, text: 'Hold for the full duration.' });
    root.appendChild(promptText(`Keep the plate charged for ${p.seconds.toFixed(1)} seconds.`));
    const btn = holdButton({
      label: 'HOLD PLATE',
      ms: p.seconds * 1000,
      token: 'plate:hold',
      ctx,
      onTick: (progress) => { meterEl.textContent = `Charge ${Math.round(progress * 100)}%`; },
      onComplete: () => ctx.solve('Plate held to full charge.')
    });
    root.appendChild(el('div', { class: 'forbidden-wrap' }, btn));
    root.appendChild(meterEl);
  }
};

// ---------------------------------------------------------------------------
// 7. Stillness: do nothing at all
// ---------------------------------------------------------------------------

export const metaStillness = {
  id: 'meta.stillness',
  category: 'meta',
  name: 'Null Protocol',
  // The solution is "do nothing": in test mode the chamber settles immediately,
  // which the harness needs to know so it does not flag the auto-solve.
  testAutoSolve: true,
  par: (p) => ({ time: p.seconds + 10, attempts: 9 }),
  generate(level) {
    const rng = level.rng;
    const seconds = rng.int(4, 7);
    return { seed: level.seed, seconds, hint: 'Do not touch anything until the chamber settles.' };
  },
  validate(p) {
    const errs = [];
    if (!(p.seconds >= 3)) errs.push('stillness period too short');
    if (p.seconds > 20) errs.push('stillness period is unreasonable');
    return errs;
  },
  solve: () => [],
  mount(root, p, ctx) {
    const status = el('div', { class: 'status-line', attrs: { role: 'status' }, text: `Settle: ${p.seconds}s of stillness required.` });
    const counter = el('div', { class: 'countdown big', text: p.seconds.toFixed(1) });
    root.appendChild(promptText('The chamber settles only if you remain perfectly still. Touch nothing.'));
    root.appendChild(counter);
    root.appendChild(status);
    root.appendChild(el('p', { class: 'muted', text: 'Any input resets the protocol.' }));

    let remaining = ctx.testMode ? 0 : p.seconds * 1000;
    let failed = false;
    const finish = () => {
      // recorded so the Void Archive knows the chamber was truly completed
      ctx.setFlag('stillness:done', Date.now());
      ctx.solve('Stillness achieved.');
    };
    const tick = () => {
      if (failed) return;
      if (remaining <= 0) { finish(); return; }
      counter.textContent = (remaining / 1000).toFixed(1);
      remaining -= 100;
      timer = setTimeout(tick, 100);
    };
    let timer = null;
    const interrupt = () => {
      if (failed || ctx.solved) return;
      remaining = p.seconds * 1000;
      status.textContent = 'Protocol reset — start again.';
      ctx.fail('Movement detected.');
    };
    root.addEventListener('pointerdown', interrupt);
    root.addEventListener('keydown', interrupt);
    if (ctx.testMode) {
      finish();
    } else {
      timer = setTimeout(tick, 100);
    }
    return () => { if (timer) clearTimeout(timer); };
  }
};

// ---------------------------------------------------------------------------
// 8. Inverted instruction (select what is normally "wrong")
// ---------------------------------------------------------------------------

export const metaInvert = {
  id: 'meta.invert',
  category: 'meta',
  name: 'Inverted Grading',
  par: () => ({ time: 70, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const facts = [
      { text: 'A prime number has exactly two divisors.', truth: true },
      { text: 'The square root of 9 is 3.', truth: true },
      { text: 'Zero is an even number.', truth: true },
      { text: '17 is an even number.', truth: false },
      { text: 'A triangle has four sides.', truth: false },
      { text: 'Multiplying two negatives gives a negative.', truth: false },
      { text: 'Binary 1010 equals eleven.', truth: false },
      { text: 'The sum of two odd numbers is even.', truth: true }
    ];
    const truths = rng.sample(facts.filter((f) => f.truth), 3);
    const falses = rng.sample(facts.filter((f) => !f.truth), 3);
    const statements = rng.shuffle([...truths, ...falses].slice(0, d >= 6 ? 6 : 5));
    return {
      seed: level.seed,
      statements: statements.map((s, i) => ({ id: i, text: s.text, truth: s.truth })),
      hint: 'The chamber grades on inverted logic: the *false* statements are the correct answers here.'
    };
  },
  validate(p) {
    const errs = [];
    if (!p.statements || p.statements.length < 4) errs.push('not enough statements');
    const falses = p.statements.filter((s) => !s.truth);
    if (!falses.length) errs.push('no false statements — the inverted task is impossible');
    if (falses.length === p.statements.length) errs.push('all statements are false — the task is trivial');
    if (p.statements.some((s) => !s.text)) errs.push('statement without text');
    return errs;
  },
  solve: (p) => [...p.statements.filter((s) => !s.truth).map((s) => `stmt:${s.id}`), 'invert:confirm'],
  mount(root, p, ctx) {
    root.appendChild(el('div', { class: 'clue-count', text: 'GRADING: inverted. False statements are the correct answers.' }));
    const button = el('button', { type: 'button', class: 'btn btn-primary', text: 'SUBMIT SELECTION', dataset: { token: 'invert:confirm' } });
    const selected = new Set();
    const status = el('div', { class: 'status-line', attrs: { role: 'status' }, text: 'Nothing selected.' });
    const list = el('div', { class: 'choices wide', style: { '--choice-cols': 1 }, attrs: { role: 'group', 'aria-label': 'Statements' } });
    p.statements.forEach((s) => {
      const btn = el('button', {
        type: 'button', class: 'choice statement', dataset: { token: `stmt:${s.id}` },
        attrs: { 'aria-pressed': 'false', 'aria-label': s.text },
        text: s.text
      });
      btn.addEventListener('click', () => {
        if (selected.has(s.id)) selected.delete(s.id);
        else selected.add(s.id);
        btn.classList.toggle('selected', selected.has(s.id));
        btn.setAttribute('aria-pressed', String(selected.has(s.id)));
        status.textContent = `${selected.size} selected`;
      });
      list.appendChild(btn);
    });
    button.addEventListener('click', () => {
      const correct = p.statements.filter((s) => !s.truth).map((s) => s.id).sort().join(',');
      const chosen = [...selected].sort().join(',');
      if (chosen && chosen === correct) ctx.solve('Inverted grading satisfied.');
      else ctx.fail('That selection does not match the chamber’s inverted grading.');
    });
    root.appendChild(promptText('Select every statement that is FALSE. Nothing else will be accepted.'));
    root.appendChild(list);
    root.appendChild(el('div', { class: 'btn-row' }, button));
    root.appendChild(status);
  }
};

// ---------------------------------------------------------------------------
// 9. Dial: cycle the counter and lock on the target
// ---------------------------------------------------------------------------

export const metaDial = {
  id: 'meta.dial',
  category: 'meta',
  name: 'Frequency Dial',
  par: (p) => ({ time: 25 + p.targets.length * 12, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const locks = d <= 4 ? 1 : 2;
    const targets = Array.from({ length: locks }, () => rng.int(2, 9));
    const start = rng.int(0, 9);
    return {
      seed: level.seed, targets, start, locks,
      hint: 'Cycle the dial forward; lock it on each target frequency in order.'
    };
  },
  validate(p) {
    const errs = [];
    if (!p.targets || !p.targets.length) errs.push('no target frequencies');
    if (p.targets.some((t) => t < 0 || t > 9)) errs.push('target frequency out of range');
    if (p.start < 0 || p.start > 9) errs.push('start frequency out of range');
    return errs;
  },
  solve(p) {
    const steps = [];
    let current = p.start;
    for (const target of p.targets) {
      let guard = 0;
      while (current !== target && guard++ < 20) {
        steps.push({ click: 'dial:cycle' });
        current = (current + 1) % 10;
      }
      steps.push({ click: 'dial:lock' });
    }
    return steps;
  },
  mount(root, p, ctx) {
    let current = p.start;
    let index = 0;
    const status = el('div', { class: 'status-line', attrs: { role: 'status' }, text: `Lock 1 of ${p.targets.length}` });
    const readout = el('div', { class: 'dial-readout', text: String(current), attrs: { role: 'status', 'aria-live': 'polite' } });
    const targetLabel = el('div', { class: 'muted', text: `TARGET ${p.targets[0]}` });
    const cycle = el('button', {
      type: 'button', class: 'btn btn-small', text: 'CYCLE ↻', dataset: { token: 'dial:cycle' },
      attrs: { 'aria-label': 'Cycle the dial forward' }
    });
    const lock = el('button', {
      type: 'button', class: 'btn btn-primary', text: 'LOCK', dataset: { token: 'dial:lock' },
      attrs: { 'aria-label': 'Lock the current frequency' }
    });
    cycle.addEventListener('click', () => {
      current = (current + 1) % 10;
      readout.textContent = String(current);
      ctx.audio.ui();
    });
    lock.addEventListener('click', () => {
      if (current !== p.targets[index]) {
        ctx.fail(`Frequency ${current} is not the target.`);
        return;
      }
      index++;
      if (index >= p.targets.length) { ctx.solve('All frequencies locked.'); return; }
      status.textContent = `Lock ${index + 1} of ${p.targets.length}`;
      targetLabel.textContent = `TARGET ${p.targets[index]}`;
      ctx.audio.correct();
    });
    root.appendChild(promptText('Bring the dial to each target frequency and lock it in order.'));
    root.appendChild(targetLabel);
    root.appendChild(readout);
    root.appendChild(el('div', { class: 'btn-row' }, cycle, lock));
    root.appendChild(status);
  }
};

// ---------------------------------------------------------------------------
// 10. The clue lives in the pause overlay
// ---------------------------------------------------------------------------

export const metaPauseHint = {
  id: 'meta.pause',
  category: 'meta',
  name: 'Suspended State',
  par: () => ({ time: 60, attempts: 9 }),
  generate(level) {
    const rng = level.rng;
    const words = ['MERIDIAN', 'PALIMPSEST', 'HELIX', 'OBELISK', 'TESSERACT', 'LIMINAL'];
    const word = rng.pick(words);
    return { seed: level.seed, word, hint: 'Some stations only talk while the world is paused.' };
  },
  validate(p) {
    const errs = [];
    if (!p.word || p.word.length < 4) errs.push('bad keyword');
    return errs;
  },
  solve: (p) => [{ type: p.word, into: 'answer' }],
  mount(root, p, ctx) {
    root.appendChild(promptText('The chamber has nothing to say. Perhaps it speaks when suspended.'));
    const note = el('p', { class: 'muted', text: 'Hint: open PAUSE and look at the chamber notes.' });
    root.appendChild(note);
    const pauseText = `CHAMBER NOTE • the passphrase is “${p.word}”`;
    if (typeof ctx.setPauseHint === 'function') ctx.setPauseHint(pauseText);
    root.appendChild(el('div', { class: 'pause-preview' + (ctx.testMode ? '' : ' hidden'), text: pauseText }));
    root.appendChild(answerInput({
      token: 'answer', placeholder: 'Passphrase', ctx,
      onSubmit: (value) => (value.trim().toUpperCase() === p.word ? ctx.solve('Passphrase accepted.') : ctx.fail('The chamber disagrees.'))
    }));
  }
};

// ---------------------------------------------------------------------------
// 11. Hidden controls outside the puzzle frame
// ---------------------------------------------------------------------------

export const metaHiddenUi = {
  id: 'meta.hiddenui',
  category: 'meta',
  name: 'Protruding Edge',
  par: () => ({ time: 60, attempts: 9 }),
  generate(level) {
    const rng = level.rng;
    const decoys = rng.sample(['◇', '◆', '○', '●', '□'], 3);
    return {
      seed: level.seed, decoys,
      hint: 'The chamber edge holds more than decoration.'
    };
  },
  validate(p) {
    const errs = [];
    if (p.decoys.length < 3) errs.push('not enough decoy marks');
    return errs;
  },
  solve: () => ['edge:true'],
  mount(root, p, ctx) {
    root.appendChild(promptText('The chamber holds a release latch. It is not inside the frame.'));
    const margin = el('div', { class: 'edge-strip', attrs: { role: 'group', 'aria-label': 'Chamber edge' } });
    const marks = [...p.decoys];
    const realIndex = ctx.rng.int(0, 3);
    const order = [];
    for (let i = 0; i < 4; i++) order.push(i === realIndex ? { real: true, mark: '⌘' } : { real: false, mark: marks.pop() || '·' });
    order.forEach((entry, i) => {
      const btn = el('button', {
        type: 'button', class: 'edge-mark', text: entry.mark,
        dataset: { token: entry.real ? 'edge:true' : `edge:decoy:${i}` },
        attrs: { 'aria-label': entry.real ? 'Unmarked latch' : `Decorative mark ${i + 1}` }
      });
      btn.addEventListener('click', () => {
        if (entry.real) ctx.solve('Latch found.');
        else ctx.fail('That mark is only decoration.');
      });
      margin.appendChild(btn);
    });
    root.appendChild(margin);
    // the real latch also lives slightly outside the frame, as the text says
    const outside = el('button', {
      type: 'button', class: 'edge-outside', text: '⌘',
      dataset: { token: 'edge:true' },
      attrs: { 'aria-label': 'Latch outside the chamber frame' }
    });
    outside.addEventListener('click', () => ctx.solve('Latch found.'));
    root.appendChild(outside);
  }
};

// ---------------------------------------------------------------------------
// 12. The setting is the solution
// ---------------------------------------------------------------------------

export const metaSetting = {
  id: 'meta.setting',
  category: 'meta',
  name: 'Silence Requirement',
  par: () => ({ time: 45, attempts: 9 }),
  generate(level) {
    const rng = level.rng;
    const required = rng.bool(0.5);
    return {
      seed: level.seed, required,
      hint: 'The chamber listens to the station’s own configuration.'
    };
  },
  validate(p) {
    const errs = [];
    if (typeof p.required !== 'boolean') errs.push('required state must be boolean');
    return errs;
  },
  solve(p) {
    const current = p._settings ? p._settings.audio : (p.initialAudio !== undefined ? p.initialAudio : true);
    const steps = [];
    if (current !== p.required) steps.push({ click: 'setting:toggle' });
    steps.push({ click: 'setting:confirm' });
    return steps;
  },
  mount(root, p, ctx) {
    const initial = ctx.settings && typeof ctx.settings.audio === 'boolean' ? ctx.settings.audio : true;
    p._settings = { audio: initial };
    p.initialAudio = initial;
    const status = el('div', { class: 'status-line', attrs: { role: 'status' }, text: `Station audio is currently ${initial ? 'ON' : 'OFF'}.` });
    const toggle = el('button', {
      type: 'button', class: 'btn btn-small', dataset: { token: 'setting:toggle' },
      text: `AUDIO: ${initial ? 'ON' : 'OFF'}`,
      attrs: { 'aria-label': 'Toggle station audio' }
    });
    toggle.addEventListener('click', () => {
      const next = !p._settings.audio;
      p._settings.audio = next;
      if (ctx.setSetting) ctx.setSetting('audio', next);
      toggle.textContent = `AUDIO: ${next ? 'ON' : 'OFF'}`;
      status.textContent = `Station audio is now ${next ? 'ON' : 'OFF'}.`;
      ctx.audio.ui();
    });
    const confirm = el('button', { type: 'button', class: 'btn btn-primary', text: 'CONFIRM', dataset: { token: 'setting:confirm' } });
    confirm.addEventListener('click', () => {
      if (p._settings.audio === p.required) ctx.solve('Configuration accepted.');
      else ctx.fail(`The chamber requires audio ${p.required ? 'ON' : 'OFF'}.`);
    });
    root.appendChild(promptText(`This experiment runs only while station audio is ${p.required ? 'ON' : 'OFF'}. Set it, then confirm.`));
    root.appendChild(el('div', { class: 'btn-row' }, toggle, confirm));
    root.appendChild(status);
  }
};

// ---------------------------------------------------------------------------
// 13. Mirrored text
// ---------------------------------------------------------------------------

export const metaMirrorText = {
  id: 'meta.mirror',
  category: 'meta',
  name: 'Reversed Signal',
  par: () => ({ time: 60, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const words = ['HORIZON', 'PARADOX', 'CASCADE', 'ENIGMA', 'LIBRARY', 'SENTINEL'];
    const word = rng.pick(words);
    return { seed: level.seed, word, hint: 'Read it in a mirror — or read it backwards.' };
  },
  validate(p) {
    const errs = [];
    if (!/^[A-Z]{4,10}$/.test(p.word)) errs.push('bad word');
    return errs;
  },
  solve: (p) => [{ type: p.word, into: 'answer' }],
  mount(root, p, ctx) {
    root.appendChild(promptText('The signal is written in mirror script. What word does it say?'));
    const mirror = el('div', { class: 'mirror-text', text: p.word, attrs: { 'aria-label': 'Mirrored signal', title: 'Mirrored signal' } });
    root.appendChild(mirror);
    const reversed = el('p', { class: 'muted', text: `Decoded hint: the letters read “${p.word.split('').reverse().join('')}” if you flip the page instead.` });
    root.appendChild(reversed);
    root.appendChild(answerInput({
      token: 'answer', placeholder: 'Word', ctx,
      onSubmit: (value) => (value.trim().toUpperCase() === p.word ? ctx.solve('Signal read correctly.') : ctx.fail('That is not the mirrored word.'))
    }));
  }
};

// ---------------------------------------------------------------------------
// 14. One of these instructions is a lie
// ---------------------------------------------------------------------------

export const metaLies = {
  id: 'meta.lies',
  category: 'meta',
  name: 'Doctored Bulletin',
  par: () => ({ time: 70, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const d = level.difficulty;
    const buttonCount = 4 + (d % 3);
    const claims = [
      { id: 'buttons', text: `There are ${buttonCount} numbered buttons on this panel.`, truth: true },
      { id: 'odd', text: `The number of buttons is odd.`, truth: buttonCount % 2 === 1 },
      { id: 'sequence', text: 'The uppermost button is labelled “1”.', truth: true },
      { id: 'total', text: `The labels sum to ${(buttonCount * (buttonCount + 1)) / 2}.`, truth: true },
      { id: 'colour', text: 'Every button is the same shade.', truth: true },
      { id: 'impossible', text: 'This panel can be solved without reading the clues.', truth: false },
      { id: 'extra', text: `There are ${buttonCount + 2} numbered buttons on this panel.`, truth: false },
      { id: 'hint', text: 'The station has already told you which claims are false.', truth: false }
    ];
    const truths = claims.filter((c) => c.truth);
    const falses = claims.filter((c) => !c.truth);
    // exactly one claim is false
    const statements = [...rng.sample(truths, 3), ...rng.sample(falses, 1)];
    return {
      seed: level.seed, statements: rng.shuffle(statements), buttonCount,
      hint: 'Check each claim against the panel itself — one of them cannot be true.'
    };
  },
  validate(p) {
    const errs = [];
    const falseCount = p.statements.filter((s) => !s.truth).length;
    if (falseCount !== 1) errs.push(`${falseCount} false claims (the puzzle promises exactly one lie)`);
    if (p.statements.length < 3) errs.push('too few claims');
    // the button-count and sum claims must be verifiable against the panel
    const countClaim = p.statements.find((s) => /numbered buttons on this panel/.test(s.text));
    if (countClaim) {
      const claimed = Number(countClaim.text.match(/There are (\d+)/)[1]);
      if (countClaim.truth !== (claimed === p.buttonCount)) errs.push('button-count claim is inconsistent');
    }
    return errs;
  },
  solve(p) {
    const liar = p.statements.find((s) => !s.truth);
    return liar ? [`claim:${p.statements.indexOf(liar)}`] : [];
  },
  mount(root, p, ctx) {
    root.appendChild(el('div', { class: 'clue-count', text: 'Exactly one claim below is false.' }));
    const panel = el('div', { class: 'numbered-panel', attrs: { role: 'group', 'aria-label': 'Numbered panel' } });
    for (let i = 1; i <= p.buttonCount; i++) {
      panel.appendChild(el('button', {
        type: 'button', class: 'panel-key', text: String(i),
        dataset: { token: `key:${i}` },
        attrs: { 'aria-label': `Panel button ${i}` },
        onclick: () => ctx.fail('The panel itself does nothing — check the claims.')
      }));
    }
    const list = el('ul', { class: 'clue-list', attrs: { 'aria-label': 'Claims' } });
    p.statements.forEach((s) => list.appendChild(el('li', { class: 'clue', text: s.text })));
    root.appendChild(panel);
    root.appendChild(list);
    root.appendChild(promptText('Which claim is the lie?'));
    root.appendChild(choiceList({
      options: p.statements.map((s, i) => ({ token: `claim:${i}`, label: s.text, value: i, content: el('span', { class: 'claim-index', text: `#${i + 1}` }) })),
      columns: p.statements.length,
      onChoose: (opt) => (opt.value === p.statements.findIndex((s) => !s.truth) ? ctx.solve('Lie identified.') : ctx.fail('That claim holds up against the panel.'))
    }));
  }
};

// ---------------------------------------------------------------------------
// 15. The lock uses your own progress
// ---------------------------------------------------------------------------

export const metaLevelLock = {
  id: 'meta.levelnumber',
  category: 'meta',
  name: 'Progress Lock',
  par: () => ({ time: 75, attempts: 3 }),
  generate(level) {
    const rng = level.rng;
    const a = rng.int(3, 9);
    const b = rng.int(2, 20);
    const n = level.number || 1;
    const stars = level.stars || 0;
    const answer = n * a + b + stars;
    return {
      seed: level.seed, a, b, n, stars, answer,
      hint: 'The lock mixes the chamber number with the stars you have earned so far.'
    };
  },
  validate(p) {
    const errs = [];
    if (!(p.a > 0) || !(p.b > 0)) errs.push('multiplier and offset must be positive');
    if (p.n < 1) errs.push('level number must be positive');
    if (p.answer !== p.n * p.a + p.b + p.stars) errs.push('answer does not match the formula');
    if (p.answer <= 0) errs.push('answer must be positive');
    return errs;
  },
  solve: (p) => [{ type: String(p.answer), into: 'answer' }],
  mount(root, p, ctx) {
    const stars = typeof ctx.getStarCount === 'function' ? ctx.getStarCount() : p.stars;
    const answer = p.n * p.a + p.b + stars;
    p.answer = answer;
    const list = el('ul', { class: 'clue-list' });
    list.appendChild(el('li', { class: 'clue', text: `Multiply this chamber’s number (${p.n}) by ${p.a}.` }));
    list.appendChild(el('li', { class: 'clue', text: `Add ${p.b}.` }));
    list.appendChild(el('li', { class: 'clue', text: `Add the number of stars you have earned so far (currently ${stars}).` }));
    root.appendChild(list);
    root.appendChild(promptText('The lock accepts a single number. Compute it from your own record.'));
    root.appendChild(answerInput({
      token: 'answer', numeric: true, placeholder: 'Value', ctx,
      onSubmit: (value) => (Number(value.trim()) === answer ? ctx.solve('Progress lock opened.') : ctx.fail('The lock disagrees with your record.'))
    }));
  }
};

// ---------------------------------------------------------------------------
// 16. Consequential choice (feeds the ending)
// ---------------------------------------------------------------------------

export const metaConfess = {
  id: 'meta.confess',
  category: 'meta',
  name: 'Disclosure',
  par: () => ({ time: 60, attempts: 99 }),
  generate(level) {
    return {
      seed: level.seed,
      prompt: 'The station asks: did you enjoy taking these tests? It records the answer either way.',
      options: [
        { id: 'honest', text: 'Yes — I want to keep going.' },
        { id: 'defiant', text: 'No. I want to write my own tests.' },
        { id: 'silent', text: 'I will not answer.' }
      ],
      hint: 'Any answer is accepted. The station remembers which one you chose.'
    };
  },
  validate(p) {
    const errs = [];
    if (!p.options || p.options.length < 2) errs.push('need at least two options');
    if (!p.prompt) errs.push('missing prompt');
    return errs;
  },
  solve: (p) => [`choice:${p.options[0].id}`],
  mount(root, p, ctx) {
    root.appendChild(promptText(p.prompt));
    const list = el('div', { class: 'choices wide', style: { '--choice-cols': 1 }, attrs: { role: 'group', 'aria-label': 'Answers' } });
    p.options.forEach((opt) => {
      const btn = el('button', {
        type: 'button', class: 'choice statement', text: opt.text,
        dataset: { token: `choice:${opt.id}` }, attrs: { 'aria-label': opt.text }
      });
      btn.addEventListener('click', () => {
        ctx.setFlag('confession', opt.id);
        const record = ctx.getFlag('storyChoices', {});
        record.disclosure = opt.id;
        ctx.setFlag('storyChoices', record);
        ctx.solve(`Disclosure recorded: ${opt.id}.`);
      });
      list.appendChild(btn);
    });
    root.appendChild(list);
    root.appendChild(el('p', { class: 'muted', text: 'There is no wrong answer here.' }));
  }
};

export const META_PUZZLES = {
  'meta.donotpress': metaDoNotPress,
  'meta.acrostic': metaAcrostic,
  'meta.selfref': metaSelfRef,
  'meta.dragui': metaDragUi,
  'meta.recall': metaRecall,
  'meta.hold': metaHold,
  'meta.stillness': metaStillness,
  'meta.invert': metaInvert,
  'meta.dial': metaDial,
  'meta.pause': metaPauseHint,
  'meta.hiddenui': metaHiddenUi,
  'meta.setting': metaSetting,
  'meta.mirror': metaMirrorText,
  'meta.lies': metaLies,
  'meta.levelnumber': metaLevelLock,
  'meta.confess': metaConfess
};
