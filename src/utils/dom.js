/**
 * Tiny DOM helpers. The whole game is built from these — no framework.
 * Everything is created with textContent (never innerHTML with user data),
 * which keeps us safe from XSS in imported save files.
 */

export function el(tag, props, ...children) {
  const node = document.createElement(tag);
  if (props && typeof props === 'object' && !isNodeLike(props) && typeof props !== 'string') {
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class' || key === 'className') node.className = String(value);
      else if (key === 'text') node.textContent = String(value);
      else if (key === 'html') node.innerHTML = String(value); // only used with trusted static markup
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
      else if (key.startsWith('on') && typeof value === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key === 'attrs' && typeof value === 'object') {
        for (const [a, v] of Object.entries(value)) {
          if (v === false || v === null || v === undefined) continue;
          node.setAttribute(a, v === true ? '' : String(v));
        }
      } else if (key in node && key !== 'list' && key !== 'type') {
        try { node[key] = value; } catch { node.setAttribute(key, String(value)); }
      } else {
        node.setAttribute(key, String(value));
      }
    }
  } else if (props !== undefined && props !== null) {
    children.unshift(props);
  }
  append(node, children);
  return node;
}

function isNodeLike(v) {
  return v instanceof Node;
}

export function append(parent, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(parent, child);
    else if (child instanceof Node) parent.appendChild(child);
    else parent.appendChild(document.createTextNode(String(child)));
  }
  return parent;
}

export function svgEl(tag, attrs = {}, ...children) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    node.setAttribute(k, String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function qs(sel, root = document) {
  return root.querySelector(sel);
}

export function qsa(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

export function on(target, type, handler, options) {
  target.addEventListener(type, handler, options);
  return () => target.removeEventListener(type, handler, options);
}

/** Track a group of teardown functions for a screen / puzzle. */
export class Disposer {
  constructor() {
    this._fns = [];
    this.disposed = false;
  }
  add(fn) {
    if (typeof fn === 'function') this._fns.push(fn);
    return fn;
  }
  /** register a DOM listener that is removed on dispose */
  listen(target, type, handler, options) {
    if (!target) return () => {};
    target.addEventListener(type, handler, options);
    const off = () => target.removeEventListener(type, handler, options);
    this.add(off);
    return off;
  }
  /** register a timer that is cleared on dispose */
  timeout(fn, ms) {
    const id = setTimeout(() => {
      this._fns = this._fns.filter((f) => f !== clearIt);
      fn();
    }, ms);
    const clearIt = () => clearTimeout(id);
    this.add(clearIt);
    return id;
  }
  interval(fn, ms) {
    const id = setInterval(fn, ms);
    this.add(() => clearInterval(id));
    return id;
  }
  /** register an animation frame loop that stops on dispose */
  raf(fn) {
    let id = 0;
    let stopped = false;
    const stop = () => { stopped = true; cancelAnimationFrame(id); };
    this.add(stop);
    const tick = (t) => {
      if (stopped) return;
      fn(t);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return stop;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const fn of this._fns.reverse()) {
      try { fn(); } catch (err) { console.warn('[disposer]', err); }
    }
    this._fns = [];
  }
}

/** Force a style recalculation (used to restart CSS animations). */
export function reflow(node) {
  void node.offsetHeight;
}

/** Add a class for N ms, restarting the animation if already running. */
export function flash(node, cls, ms = 420) {
  if (!node) return;
  node.classList.remove(cls);
  reflow(node);
  node.classList.add(cls);
  setTimeout(() => node.classList.remove(cls), ms);
}

export function announce(message) {
  const region = document.getElementById('live-region');
  if (!region) return;
  region.textContent = '';
  setTimeout(() => { region.textContent = message; }, 20);
}

export function formatTime(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatNumber(n) {
  return Number(n || 0).toLocaleString('en-US');
}
