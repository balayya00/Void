/**
 * Procedural vector "glyphs" — the game's entire visual vocabulary.
 *
 * Every puzzle symbol is generated as SVG from a tiny descriptor, which keeps
 * the download size near zero (no image assets at all) and lets the level
 * generators build unlimited distinct symbols from a few dimensions:
 *
 *   shape   — circle, square, triangle, ...
 *   fill    — solid, outline, hatched, dots, half
 *   rot     — rotation in degrees (multiples of 15)
 *   scale   — 0.6 – 1.15
 *
 * Important accessibility rule: *every* difference a puzzle relies on can be
 * produced by shape, rotation, fill or size — never by colour alone.
 */

import { svgEl } from './dom.js';

export const SHAPES = [
  'circle', 'ring', 'square', 'diamond', 'triangle', 'pentagon', 'hexagon',
  'octagon', 'star5', 'star6', 'cross', 'chevron', 'arrow', 'moon', 'gear', 'bar', 'dot3', 'droplet'
];

export const FILLS = ['solid', 'outline', 'hatch', 'dots', 'half', 'thin'];

/** Regular polygon points in a 0..100 view box, centred at 50,50. */
function regular(n, radius = 42, startAngle = -90) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = ((startAngle + (360 / n) * i) * Math.PI) / 180;
    pts.push([50 + radius * Math.cos(a), 50 + radius * Math.sin(a)]);
  }
  return pts;
}

function star(n, outer = 46, inner = 19, startAngle = -90) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = ((startAngle + (360 / (n * 2)) * i) * Math.PI) / 180;
    pts.push([50 + r * Math.cos(a), 50 + r * Math.sin(a)]);
  }
  return pts;
}

function ptsToPath(points, close = true) {
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ') + (close ? ' Z' : '');
}

/** Geometry (as SVG path `d` or primitive description) for each shape. */
const GEOMETRY = {
  circle: { type: 'circle', r: 42 },
  ring: { type: 'ring', r: 42, w: 12 },
  square: { type: 'rect', x: 9, y: 9, w: 82, h: 82 },
  diamond: { type: 'path', d: ptsToPath([[50, 6], [94, 50], [50, 94], [6, 50]]) },
  triangle: { type: 'path', d: ptsToPath(regular(3, 46, -90)) },
  pentagon: { type: 'path', d: ptsToPath(regular(5, 44)) },
  hexagon: { type: 'path', d: ptsToPath(regular(6, 44)) },
  octagon: { type: 'path', d: ptsToPath(regular(8, 43, -112.5)) },
  star5: { type: 'path', d: ptsToPath(star(5)) },
  star6: { type: 'path', d: ptsToPath(star(6)) },
  cross: { type: 'path', d: 'M38 6 H62 V38 H94 V62 H62 V94 H38 V62 H6 V38 H38 Z' },
  chevron: { type: 'path', d: 'M12 74 L50 30 L88 74 L88 92 L50 50 L12 92 Z' },
  arrow: { type: 'path', d: 'M50 4 L88 44 H68 V96 H32 V44 H12 Z' },
  moon: { type: 'path', d: 'M62 4 A46 46 0 1 0 62 96 A38 38 0 1 1 62 4 Z' },
  gear: {
    type: 'path',
    d: (() => {
      const teeth = 8;
      const seg = [];
      for (let i = 0; i < teeth; i++) {
        const a0 = (360 / teeth) * i;
        const a1 = a0 + (360 / teeth) * 0.5;
        const rad = (d) => (d * Math.PI) / 180;
        const P = (ang, r) => [50 + r * Math.cos(rad(ang)), 50 + r * Math.sin(rad(ang))];
        const [x0, y0] = P(a0, 46);
        const [x1, y1] = P(a1, 46);
        const [x2, y2] = P(a1 + 12, 34);
        const [x3, y3] = P(a0 + 12, 34);
        seg.push(`${i === 0 ? 'M' : 'L'}${x0.toFixed(1)} ${y0.toFixed(1)} L${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)} L${x3.toFixed(1)} ${y3.toFixed(1)}`);
      }
      return seg.join(' ') + ' Z M50 30 A20 20 0 1 0 50 70 A20 20 0 1 0 50 30 Z';
    })()
  },
  bar: { type: 'rect', x: 26, y: 12, w: 48, h: 76, rx: 4 },
  dot3: {
    type: 'path',
    d: (() => {
      const dots = [[30, 30], [70, 30], [50, 70]];
      return dots.map(([x, y]) => `M${x} ${y} m-11 0 a11 11 0 1 0 22 0 a11 11 0 1 0 -22 0`).join(' ');
    })()
  },
  droplet: { type: 'path', d: 'M50 5 C70 34 88 50 88 66 A38 38 0 1 1 12 66 C12 50 30 34 50 5 Z' }
};

/**
 * Normalise a loose descriptor into a full spec.
 * Accepts strings like 'triangle', 'triangle:outline', 'triangle:outline:90'
 */
export function normalizeShape(input) {
  if (typeof input === 'string') {
    const [shape, fill, rot] = input.split(':');
    return {
      shape: SHAPES.includes(shape) ? shape : 'circle',
      fill: FILLS.includes(fill) ? fill : 'solid',
      rot: Number(rot) || 0,
      scale: 1
    };
  }
  return {
    shape: SHAPES.includes(input?.shape) ? input.shape : 'circle',
    fill: FILLS.includes(input?.fill) ? input.fill : 'solid',
    rot: Number(input?.rot) || 0,
    scale: input?.scale === undefined ? 1 : Number(input.scale)
  };
}

export function shapeKey(spec) {
  const s = normalizeShape(spec);
  return `${s.shape}|${s.fill}|${s.rot % 360}|${s.scale.toFixed(2)}`;
}

export function shapeLabel(spec) {
  const s = normalizeShape(spec);
  const fillWord = { solid: 'filled', outline: 'hollow', hatch: 'striped', dots: 'dotted', half: 'half-filled', thin: 'thin' }[s.fill];
  return `${fillWord} ${s.shape}${s.rot ? ` rotated ${s.rot} degrees` : ''}`;
}

/**
 * Build the SVG element for a shape descriptor.
 * @param {string|object} spec
 * @param {{ size?: number, tone?: number, className?: string, title?: string }} [opts]
 */
export function shapeSVG(spec, opts = {}) {
  const s = normalizeShape(spec);
  const size = opts.size || 48;
  const tone = typeof opts.tone === 'number' ? opts.tone : 0;
  const cls = ['glyph', `tone-${((tone % 5) + 5) % 5}`, `fill-${s.fill}`, opts.className || ''].filter(Boolean).join(' ');

  const svg = svgEl('svg', {
    viewBox: '0 0 100 100',
    class: cls,
    width: size,
    height: size,
    role: 'img',
    'aria-hidden': opts.title ? null : 'true',
    focusable: 'false'
  });

  if (opts.title) {
    svg.appendChild(svgEl('title', {}, opts.title));
  }

  const defs = svgEl('defs');
  const patternId = `pat-${Math.random().toString(36).slice(2, 8)}`;
  if (s.fill === 'hatch') {
    defs.appendChild(svgEl('pattern', {
      id: patternId, width: 12, height: 12, patternUnits: 'userSpaceOnUse',
      patternTransform: 'rotate(45)'
    }, svgEl('line', { x1: 0, y1: 0, x2: 0, y2: 12, 'stroke-width': 5, class: 'glyph-stroke' })));
  } else if (s.fill === 'dots') {
    defs.appendChild(svgEl('pattern', {
      id: patternId, width: 16, height: 16, patternUnits: 'userSpaceOnUse'
    }, svgEl('circle', { cx: 8, cy: 8, r: 3.4, class: 'glyph-stroke-fill' })));
  }
  if (defs.childNodes.length) svg.appendChild(defs);

  const geo = GEOMETRY[s.shape] || GEOMETRY.circle;
  const scale = 0.62 + (s.scale - 0.6);
  const transform = `rotate(${s.rot} 50 50) translate(50 50) scale(${scale.toFixed(3)}) translate(-50 -50)`;

  const group = svgEl('g', { transform });

  const paint = s.fill === 'solid' ? 'glyph-solid'
    : s.fill === 'outline' ? 'glyph-outline'
      : s.fill === 'thin' ? 'glyph-thin'
        : s.fill === 'half' ? 'glyph-solid'
          : 'glyph-pattern';

  const drawShape = (fillRef, strokeRef) => {
    const base = { class: `${paint} ${fillRef || ''} ${strokeRef || ''}`.trim() };
    if (s.fill === 'hatch' || s.fill === 'dots') base.fill = `url(#${patternId})`;
    switch (geo.type) {
      case 'circle':
        return svgEl('circle', { cx: 50, cy: 50, r: geo.r, ...base });
      case 'ring':
        return svgEl('circle', { cx: 50, cy: 50, r: geo.r, 'stroke-width': geo.w, class: 'glyph-solid glyph-ring' });
      case 'rect':
        return svgEl('rect', { x: geo.x, y: geo.y, width: geo.w, height: geo.h, rx: 4, ...base });
      default:
        return svgEl('path', { d: geo.d, ...base });
    }
  };

  if (s.fill === 'half') {
    // Solid left half + hollow right half — a genuinely non-colour distinction.
    group.appendChild(drawShape('glyph-solid', ''));
    const clipId = `clip-${Math.random().toString(36).slice(2, 8)}`;
    const defs2 = svgEl('defs',
      svgEl('clipPath', { id: clipId }, svgEl('rect', { x: 50, y: 0, width: 50, height: 100 })));
    svg.appendChild(defs2);
    const hollow = drawShape('glyph-outline-only', 'glyph-outline-stroke');
    hollow.setAttribute('fill', 'var(--glyph-void)');
    hollow.setAttribute('clip-path', `url(#${clipId})`);
    hollow.setAttribute('stroke-width', 7);
    group.appendChild(hollow);
  } else {
    group.appendChild(drawShape());
  }

  svg.appendChild(group);
  return svg;
}

/** Human-readable list of the dimensions interesting to puzzle solvers. */
export const DIMENSIONS = ['shape', 'fill', 'rot', 'scale'];

/**
 * Make a variant of a base spec by changing exactly one dimension.
 * Used by "odd one out", "find the difference" and "spot the anomaly".
 */
export function varyShape(base, dimension, amount = 1, rng) {
  const s = normalizeShape(base);
  const next = { ...s };
  switch (dimension) {
    case 'shape': {
      const others = SHAPES.filter((x) => x !== s.shape);
      next.shape = rng ? rng.pick(others) : others[0];
      break;
    }
    case 'fill': {
      const others = FILLS.filter((x) => x !== s.fill);
      next.fill = rng ? rng.pick(others) : others[0];
      break;
    }
    case 'rot': {
      next.rot = (s.rot + 45 * amount) % 360;
      break;
    }
    case 'scale': {
      next.scale = Math.max(0.62, Math.min(1.14, Number((s.scale - 0.16 * amount).toFixed(2))));
      if (next.scale === s.scale) next.scale = Number((0.62).toFixed(2));
      break;
    }
    default:
      break;
  }
  return next;
}
