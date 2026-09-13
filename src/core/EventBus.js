/**
 * Minimal event bus. Used for decoupling the game controller from the UI
 * (audio reactions, toasts, achievement banners) without a framework.
 */
export class EventBus {
  constructor() {
    this.map = new Map();
  }

  on(type, handler) {
    if (!this.map.has(type)) this.map.set(type, new Set());
    this.map.get(type).add(handler);
    return () => this.off(type, handler);
  }

  once(type, handler) {
    const off = this.on(type, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  off(type, handler) {
    const set = this.map.get(type);
    if (!set) return;
    set.delete(handler);
    if (!set.size) this.map.delete(type);
  }

  emit(type, payload) {
    const set = this.map.get(type);
    if (set) {
      for (const handler of [...set]) {
        try {
          handler(payload);
        } catch (err) {
          console.warn('[neurovoid] listener failed', type, err);
        }
      }
    }
    const wildcard = this.map.get('*');
    if (wildcard) {
      for (const handler of [...wildcard]) {
        try {
          handler({ type, payload });
        } catch (err) {
          console.warn('[neurovoid] wildcard listener failed', err);
        }
      }
    }
  }

  clear() {
    this.map.clear();
  }
}
