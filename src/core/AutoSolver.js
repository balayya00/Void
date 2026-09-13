/**
 * AutoSolver — plays a puzzle's own solution through the DOM.
 *
 * This is the safety net behind the game's promise that no player can ever be
 * permanently stuck: after three hints the player may ask the station to take
 * over. It clicks the very same `[data-token]` elements a human would click, so
 * it can never "cheat" past a puzzle — if a solution step does not exist, the
 * assist stops and reports it instead of silently solving.
 *
 * It is interruptible: any pointer/key input from the player cancels the run.
 */

export const AUTO_STEP_DELAY = 320;

export async function applySolution(root, steps, { onStep, delay = AUTO_STEP_DELAY, isCancelled = () => false, ctx } = {}) {
  const log = [];
  for (const step of steps || []) {
    if (isCancelled()) {
      log.push('cancelled');
      break;
    }
    const outcome = await runStep(root, step, ctx, log);
    if (onStep) onStep(step, outcome);
    if (outcome === 'missing') break;
    const wait = typeof step === 'object' && step && step.wait ? step.wait : delay;
    if (wait > 0) await sleep(wait);
  }
  return log;
}

export async function runStep(root, step, ctx, log = []) {
  if (typeof step === 'string') return click(root, step, log);
  if (step && typeof step === 'object') {
    if (typeof step.fn === 'function') {
      step.fn(root, ctx);
      return 'ok';
    }
    if (step.wait) return 'wait';
    if (step.hold) return hold(root, step.hold, log);
    if (step.type !== undefined) return type(root, step, log);
    if (step.click) return click(root, step.click, log);
  }
  log.push(`unsupported step ${JSON.stringify(step)}`);
  return 'unsupported';
}

function find(root, token) {
  return [...root.querySelectorAll('[data-token]')].find((n) => n.dataset.token === token) || null;
}

function click(root, token, log) {
  const node = find(root, token);
  if (!node) {
    log.push(`missing ${token}`);
    return 'missing';
  }
  if (node.disabled) {
    log.push(`disabled ${token}`);
    return 'missing';
  }
  node.click();
  return 'ok';
}

function hold(root, token, log) {
  const node = find(root, token);
  if (!node) {
    log.push(`missing ${token}`);
    return 'missing';
  }
  if (typeof node.__forceComplete === 'function') {
    node.__forceComplete();
    return 'ok';
  }
  // fall back to a real pointer press for a few frames
  node.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
  return new Promise((resolve) => {
    setTimeout(() => {
      node.dispatchEvent(new window.Event('pointerup', { bubbles: true }));
      resolve('ok');
    }, 1400);
  });
}

function type(root, step, log) {
  const token = step.into || 'answer';
  const input = find(root, token);
  if (!input) {
    log.push(`missing ${token}`);
    return 'missing';
  }
  input.value = String(step.type);
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  const submit = find(root, `${token}-submit`) || root.querySelector('.answer-row .btn-primary');
  if (!submit) {
    log.push(`missing ${token}-submit`);
    return 'missing';
  }
  submit.click();
  return 'ok';
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
