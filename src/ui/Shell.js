/**
 * Shell — the persistent app chrome around every screen.
 *
 * The shell owns the header, the screen container, the toast stack and the
 * aria-live status region. Screens are mounted into `shell.main` and torn down
 * by the Game controller, so nothing inside a screen can leak into the next.
 */

import { el, clear, formatTime } from '../utils/dom.js';

export class Shell {
  constructor(mount) {
    this.mount = mount;
    this.toasts = [];
    this.build();
  }

  build() {
    clear(this.mount);
    this.header = el('header', { class: 'app-header', attrs: { role: 'banner' } });
    this.brand = el('button', {
      type: 'button',
      class: 'brand',
      attrs: { 'aria-label': 'NEURO//VOID — return to the main menu' }
    }, [
      el('span', { class: 'brand-mark', text: '//' }),
      el('span', { class: 'brand-text', text: 'NEURO//VOID' })
    ]);
    this.headerLeft = el('div', { class: 'header-left' }, [this.brand]);
    this.headerCenter = el('div', { class: 'header-center', attrs: { 'aria-live': 'polite' } });
    this.headerRight = el('div', { class: 'header-right' });
    this.header.append(this.headerLeft, this.headerCenter, this.headerRight);

    this.main = el('main', { class: 'app-main', attrs: { id: 'main', role: 'main' } });
    this.status = el('div', { class: 'sr-status', attrs: { role: 'status', 'aria-live': 'polite' } });
    this.toastHost = el('div', { class: 'toast-host', attrs: { 'aria-live': 'polite', 'aria-atomic': 'false' } });
    this.mount.append(this.header, this.main, this.status, this.toastHost);
  }

  get screens() {
    return this.main;
  }

  setBrandLabel(text) {
    this.brand.textContent = '';
    this.brand.append(el('span', { class: 'brand-mark', text: '//' }), el('span', { class: 'brand-text', text: text || 'NEURO//VOID' }));
  }

  setHeader({ left, center, right, title } = {}) {
    if (title !== undefined) this.setBrandLabel(title);
    if (left !== undefined) {
      clear(this.headerLeft);
      if (left) this.headerLeft.append(left);
    }
    if (center !== undefined) {
      clear(this.headerCenter);
      if (center) this.headerCenter.append(center);
    }
    if (right !== undefined) {
      clear(this.headerRight);
      if (Array.isArray(right)) this.headerRight.append(...right.filter(Boolean));
      else if (right) this.headerRight.append(right);
    }
  }

  showHeader(show = true) {
    this.header.classList.toggle('hidden', !show);
  }

  setStatus(text) {
    this.status.textContent = String(text || '');
  }

  toast({ text, kind = 'info', ms = 3200, action } = {}) {
    if (!text) return null;
    const node = el('div', { class: `toast toast-${kind}`, attrs: { role: 'status' } }, [
      el('span', { class: 'toast-text', text }),
      action ? el('button', { type: 'button', class: 'toast-action', text: action.label, onclick: () => action.onClick() }) : null
    ]);
    this.toastHost.append(node);
    const timer = setTimeout(() => this.dismissToast(node), ms);
    node.addEventListener('click', (ev) => {
      if (ev.target === node.querySelector('.toast-action')) return;
      clearTimeout(timer);
      this.dismissToast(node);
    });
    return node;
  }

  dismissToast(node) {
    if (!node || !node.parentNode) return;
    node.classList.add('leaving');
    setTimeout(() => node.remove(), 180);
  }

  /** Pause overlays the live puzzle instead of replacing it. */
  setPaused(paused) {
    this.main.classList.toggle('is-paused', !!paused);
    document.body.classList.toggle('paused', !!paused);
  }

  setSaveIndicator(state) {
    if (!this.saveIndicator) {
      this.saveIndicator = el('span', { class: 'save-indicator', text: 'READY' });
      this.headerRight.append(this.saveIndicator);
    }
    this.saveIndicator.textContent = state;
    this.saveIndicator.dataset.state = state;
  }

  setHeaderTitle(text) {
    this.headerCenter.textContent = text;
  }

  dispose() {
    this.toasts.forEach((node) => node.remove());
    clear(this.mount);
  }
}

/** Small shared builders used by several screens. */
export function button(label, opts = {}) {
  return el('button', {
    type: 'button',
    class: `btn ${opts.className || ''}`.trim(),
    text: label,
    attrs: { 'aria-label': opts.ariaLabel || label, disabled: opts.disabled || undefined },
    dataset: opts.token ? { token: opts.token } : undefined,
    onclick: opts.onClick
  });
}

export function panel(children, opts = {}) {
  return el('section', { class: `panel ${opts.className || ''}`.trim(), attrs: opts.attrs || {} }, children);
}

export function statLine(label, value, opts = {}) {
  return el('div', { class: `stat ${opts.className || ''}`.trim() }, [
    el('span', { class: 'stat-label', text: label }),
    el('span', { class: 'stat-value', text: String(value) })
  ]);
}

export function starRow(stars, size = 18) {
  const row = el('span', { class: 'star-row', attrs: { 'aria-label': `${stars} of 3 stars` } });
  for (let i = 0; i < 3; i++) {
    row.append(el('span', { class: `star ${i < stars ? 'filled' : ''}`.trim(), text: i < stars ? '★' : '☆' }));
  }
  return row;
}

export function timeLabel(ms) {
  return formatTime(ms || 0);
}
