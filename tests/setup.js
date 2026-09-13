/**
 * jsdom shims. jsdom implements most of what we need, but not the media query
 * list, animation frame timing or Web Audio — the game must degrade gracefully
 * without them, so the shims here model exactly that.
 */

if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    window.matchMedia = (query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() { return false; }
    });
  }

  if (!window.requestAnimationFrame) {
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
    window.cancelAnimationFrame = (id) => clearTimeout(id);
  }

  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }

  if (!window.scrollTo) window.scrollTo = () => {};

  if (!window.AudioContext && !window.webkitAudioContext) {
    // A deliberately silent context: proves the audio layer never throws when
    // Web Audio is missing (Safari private mode, older browsers, tests).
    window.AudioContext = class {
      constructor() {
        this.state = 'suspended';
        this.currentTime = 0;
        this.destination = { connect() {}, disconnect() {} };
      }
      createOscillator() {
        return {
          type: 'sine', frequency: { setValueAtTime() {}, value: 440 },
          connect() {}, disconnect() {}, start() {}, stop() {},
          addEventListener() {}, onended: null
        };
      }
      createGain() {
        return { gain: { setValueAtTime() {}, value: 0, linearRampToValueAtTime() {}, setTargetAtTime() {} }, connect() {}, disconnect() {} };
      }
      createBiquadFilter() {
        return { type: 'lowpass', frequency: { setValueAtTime() {} }, Q: { setValueAtTime() {} }, connect() {}, disconnect() {} };
      }
      createBuffer() {
        return { getChannelData: () => new Float32Array(64) };
      }
      createBufferSource() {
        return { buffer: null, connect() {}, start() {}, stop() {}, loop: false, playbackRate: { setValueAtTime() {} } };
      }
      resume() { this.state = 'running'; return Promise.resolve(); }
      suspend() { this.state = 'suspended'; return Promise.resolve(); }
      close() { return Promise.resolve(); }
    };
  }
}

// Silence the game's own diagnostics during tests unless a test opts in.
const realWarn = console.warn;
const realLog = console.log;
console.warn = (...args) => {
  if (typeof args[0] === 'string' && args[0].startsWith('[neurovoid]')) return;
  realWarn(...args);
};
console.log = (...args) => {
  if (typeof args[0] === 'string' && args[0].startsWith('[neurovoid]')) return;
  realLog(...args);
};

export {};
