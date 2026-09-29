// The universal layout for sticks without a photo skin: axes and hats on the left, every
// button on the right, and a live HUD in the middle. Pressing anything lights up its row,
// so "Button 7" can be found without a picture of the stick.
import { isCentered } from '../shared/devices.js';
import { targetIcon } from './icons.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const DIRECTIONS = ['up', 'right', 'down', 'left'];
const HAT_ICON = { up: 'dpad_up', right: 'dpad_right', down: 'dpad_down', left: 'dpad_left' };
// More buttons than this switch the button list to two compact columns.
const SINGLE_COLUMN_MAX = 14;

const HUD = { size: 480, c: 240, ring: 196, inner: 128, travel: 176 };

function el(tag, className, parent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  parent?.appendChild(node);
  return node;
}

function svg(tag, attrs, parent) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  parent?.appendChild(node);
  return node;
}

function heading(parent, title, count) {
  const h = el('h3', 'gen-heading', parent);
  h.textContent = title;
  if (count !== undefined) el('span', 'gen-count', h).textContent = String(count);
}

// hooks: { chip(controlId, parent), inv(axisId, parent), register(controlId, row, extras) }
function axisRow(parent, axis, centered, hooks) {
  const row = el('div', 'gen-row gen-axis', parent);
  const label = el('div', 'gen-label', row);
  el('span', 'gen-name', label).textContent = axis.name;
  if (axis.hint) el('span', 'gen-hint', label).textContent = axis.hint;
  const meter = el('span', `meter${centered ? '' : ' meter-full'}`, label);
  const fill = el('span', 'meter-fill', meter);
  const controls = el('div', 'gen-controls', row);
  hooks.chip(axis.id, controls);
  hooks.inv(axis.id, controls);
  hooks.register(axis.id, row, { meterFill: fill, meter });
}

function hatRow(parent, hat, dir, hooks) {
  const id = `${hat.id}_${dir}`;
  const row = el('div', 'gen-row gen-hat', parent);
  const label = el('div', 'gen-label gen-label-inline', row);
  el('span', 'hat-icon', label).innerHTML = targetIcon(HAT_ICON[dir]);
  el('span', 'gen-name', label).textContent = dir;
  hooks.chip(id, el('div', 'gen-controls', row));
  hooks.register(id, row);
}

function buttonRow(parent, id, name, hooks) {
  const row = el('div', 'gen-row gen-button', parent);
  el('span', 'gen-name', el('div', 'gen-label', row)).textContent = name;
  hooks.chip(id, el('div', 'gen-controls', row));
  hooks.register(id, row);
}

// A flight-HUD style readout: stick position on the crosshair, twist on the ring,
// throttle on the side bar. Uses whichever of those axes the stick has.
function buildHud(parent, model, settings) {
  const { size, c, ring, inner } = HUD;
  const root = svg('svg', { class: 'gen-hud', viewBox: `0 0 ${size} ${size}`, 'aria-hidden': 'true' }, parent);
  svg('circle', { class: 'hud-ring', cx: c, cy: c, r: ring }, root);
  svg('circle', { class: 'hud-inner', cx: c, cy: c, r: inner }, root);
  svg('path', { class: 'hud-cross', d: `M ${c - ring} ${c} H ${c + ring} M ${c} ${c - ring} V ${c + ring}` }, root);
  for (let deg = 0; deg < 360; deg += 15) {
    const long = deg % 45 === 0;
    const a = (deg * Math.PI) / 180;
    const r1 = ring + 4;
    const r2 = ring + (long ? 14 : 8);
    svg('line', {
      class: 'hud-tick',
      x1: c + r1 * Math.sin(a),
      y1: c - r1 * Math.cos(a),
      x2: c + r2 * Math.sin(a),
      y2: c - r2 * Math.cos(a),
    }, root);
  }

  const centred = model.axes.filter((a) => isCentered(a, settings));
  const xAxis = model.axes.find((a) => a.id === 'x') ?? centred[0];
  const yAxis = model.axes.find((a) => a.id === 'y') ?? centred.find((a) => a !== xAxis);
  const twist = model.axes.find((a) => a.id === 'rz' && a !== xAxis && a !== yAxis);
  const throttle = model.axes.find((a) => !isCentered(a, settings));

  const stem = svg('line', { class: 'hud-stem', x1: c, y1: c, x2: c, y2: c }, root);
  const dot = svg('circle', { class: 'hud-dot', cx: c, cy: c, r: 7 }, root);
  const twistMark = twist ? svg('path', { class: 'hud-twist', d: `M ${c} ${c - ring - 2} l -7 -13 h 14 z` }, root) : null;
  if (twist) svg('text', { class: 'hud-label', x: c, y: 16, 'text-anchor': 'middle' }, root).textContent = 'TWIST';

  let throttleFill = null;
  if (throttle) {
    const x = size - 10;
    svg('rect', { class: 'hud-track', x: x - 3, y: c - ring, width: 4, height: ring * 2, rx: 2 }, root);
    throttleFill = svg('rect', { class: 'hud-fill', x: x - 3, y: c + ring, width: 4, height: 0, rx: 2 }, root);
    svg('text', { class: 'hud-label', x: x - 1, y: c + ring + 24, 'text-anchor': 'middle' }, root).textContent =
      throttle.name.toUpperCase();
  }
  if (xAxis || yAxis) {
    svg('text', { class: 'hud-label', x: c + ring - 6, y: c - 8, 'text-anchor': 'end' }, root).textContent =
      [xAxis?.name, yAxis?.name].filter(Boolean).join(' · ').toUpperCase();
  }

  return (axes) => {
    const x = xAxis ? axes[xAxis.id] ?? 0 : 0;
    const y = yAxis ? axes[yAxis.id] ?? 0 : 0;
    const px = c + x * HUD.travel;
    const py = c - y * HUD.travel;
    dot.setAttribute('cx', px.toFixed(1));
    dot.setAttribute('cy', py.toFixed(1));
    stem.setAttribute('x2', px.toFixed(1));
    stem.setAttribute('y2', py.toFixed(1));
    if (twistMark) twistMark.setAttribute('transform', `rotate(${((axes[twist.id] ?? 0) * 70).toFixed(1)} ${c} ${c})`);
    if (throttleFill) {
      const h = (((axes[throttle.id] ?? 0) + 1) / 2) * ring * 2;
      throttleFill.setAttribute('y', (c + ring - h).toFixed(1));
      throttleFill.setAttribute('height', h.toFixed(1));
    }
  };
}

// Builds the layout into `root`. Returns { drawHud(axes) }.
export function buildGeneric(root, model, settings, hooks) {
  root.replaceChildren();

  const left = el('section', 'gen-panel', root);
  if (model.axes.length) {
    heading(left, 'Axes', model.axes.length);
    for (const axis of model.axes) axisRow(left, axis, isCentered(axis, settings), hooks);
  }
  for (const hat of model.hats) {
    heading(left, hat.name);
    for (const dir of DIRECTIONS) hatRow(left, hat, dir, hooks);
  }

  const center = el('div', 'gen-center', root);
  const drawHud = buildHud(center, model, settings);
  const identity = el('div', 'gen-identity', center);
  el('div', 'gen-device', identity).textContent = model.name;
  const meta = el('div', 'gen-meta', identity);
  const badge = el('span', `badge badge-${model.support}`, meta);
  badge.textContent = model.support === 'full' ? 'Fully supported' : 'Experimental';
  const counts = [`${model.axes.length} axes`, model.hats.length ? `${model.hats.length} hat` : '', `${model.buttons} buttons`];
  el('span', 'gen-counts', meta).textContent = counts.filter(Boolean).join(' · ');
  const actions = el('div', 'gen-actions', identity);
  hooks.action(actions, 'Copy device info', 'copy');
  hooks.action(actions, 'Report this stick ↗', 'report');

  const right = el('section', 'gen-panel', root);
  heading(right, 'Buttons', model.buttons);
  const compact = model.buttons > SINGLE_COLUMN_MAX;
  const grid = el('div', `gen-buttons${compact ? ' is-compact' : ''}`, right);
  for (let b = 1; b <= model.buttons; b++) {
    const id = `btn${b}`;
    buttonRow(grid, id, compact ? `B${b}` : model.buttonNames[id], hooks);
  }

  return { drawHud };
}
