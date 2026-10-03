import {
  MAX_ANTI_DEADZONE,
  MAX_DEADZONE,
  ROLES,
  ROLE_NAMES,
  TARGET_BY_ID,
  TARGET_MENUS,
  XUSB,
  bindingFor,
  controlKind,
  rolePrefix,
  splitControlId,
} from '../shared/controls.js';
import { SUPPORT_LABELS, defaultDeadzone, isCentered } from '../shared/devices.js';
import { MAX_NAME_LENGTH } from '../shared/profiles.js';
import { LAYOUTS, STAGE, toStage } from './layout.js';
import { buildGeneric } from './generic.js';
import { CHEVRON, FACE_COLORS, TILE_LABELS, hatIcon, targetIcon } from './icons.js';

// Inside Electron the preload exposes `window.joymap`; in a plain browser we run a simulator.
const api = window.joymap ?? (await import('./mock.js')).createMockApi();

const SVG_NS = 'http://www.w3.org/2000/svg';
const $ = (selector) => document.querySelector(selector);

const stage = $('#stage');
const popover = $('#popover');
const profileMenu = $('#profile-menu');
const deviceMenu = $('#device-menu');

let bindings = {}; // active profile's bindings (including unsaved edits)
let profiles = [];
let activeId = 'default';
let presets = [];
let status = null;
// The device on screen: { id, key, role, name, skin, support, axes, hats, buttons, buttonNames }.
// With a HOTAS every plugged-in device is live; this is the one being looked at.
let model = null;
let layout = null; // that device's photo layout, when it has one and it's showing
let layoutKey = null; // what the stage was last built for
let focused = null; // callout / row id currently highlighted
let openControl = null; // control id whose picker (or response popover) is open
let openKind = 'picker'; // picker | deadzone (the response popover, behind the DZ button)
let drawHud = null; // generic layout's live readout

const isLocked = () => status?.profile.locked ?? true;
const deviceSettings = () => status?.joystick.settings ?? {};
const devices = () => status?.joystick.devices ?? [];
// The stage works in the shown device's own control IDs (btn1, x, …). Bindings and live
// input cover every device, where all but the stick carry their role (throttle.z).
const full = (id) => rolePrefix(model?.role ?? 'stick') + id;

// Element lookups, rebuilt with the stage.
let calloutEl = {}; // callout / row id -> element
let leaderEl = {}; // callout id -> svg group (photo layout only)
let chipEl = {}; // control id -> chip button
let invEl = {}; // control id -> invert toggle
let dzEl = {}; // control id -> deadzone button
let liveEl = {}; // control id -> element that lights when pressed
let meterEl = {}; // control id -> meter fill
let guideEl = {}; // axis id -> { group, dot } (photo layout only)
let calloutOf = {}; // control id -> callout / row id

function svgEl(tag, attrs, parent) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  parent?.appendChild(node);
  return node;
}

function htmlEl(tag, className, parent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  parent?.appendChild(node);
  return node;
}

function button(className, text, parent, onClick) {
  const node = htmlEl('button', className, parent);
  node.type = 'button';
  node.textContent = text;
  if (onClick) node.addEventListener('click', onClick);
  return node;
}

// ─── Controls of the connected stick ─────────────────────────────────────────

const DIRECTION_NAMES = { up: 'Up', right: 'Right', down: 'Down', left: 'Left' };

// Every control id of the connected stick, buttons (incl. hat directions) then axes.
function controlIds() {
  if (!model) return [];
  const ids = Array.from({ length: model.buttons }, (_, i) => `btn${i + 1}`);
  for (const hat of model.hats) for (const dir of Object.keys(DIRECTION_NAMES)) ids.push(`${hat.id}_${dir}`);
  for (const axis of model.axes) ids.push(axis.id);
  return ids;
}

function controlInfo(id) {
  const kind = controlKind(id);
  if (kind === 'axis') {
    const axis = model?.axes.find((a) => a.id === id);
    return { id, kind, name: axis?.name ?? id, hint: axis?.hint, axis };
  }
  const hatMatch = /^(hat\d)_(\w+)$/.exec(id);
  if (hatMatch) {
    const hat = model?.hats.find((h) => h.id === hatMatch[1]);
    return { id, kind, name: `${hat?.name ?? 'Hat'} ${DIRECTION_NAMES[hatMatch[2]]}` };
  }
  return { id, kind, name: model?.buttonNames[id] ?? id };
}

function axisDefaultDeadzone(id) {
  const axis = model?.axes.find((a) => a.id === id);
  return axis ? defaultDeadzone(axis, isCentered(axis, deviceSettings())) : undefined;
}

function currentBinding(id) {
  return bindingFor(bindings, full(id), axisDefaultDeadzone(id));
}

// Any bound control by name: the shown device's own names, "Throttle: Button 3" for the rest.
function boundControlName(fullId) {
  const { role, local } = splitControlId(fullId);
  if (role === (model?.role ?? 'stick')) return controlInfo(local).name;
  const button = /^btn(\d+)$/.exec(local);
  const hat = /^hat\d_(\w+)$/.exec(local);
  const name = button ? `Button ${button[1]}` : hat ? `Hat ${DIRECTION_NAMES[hat[1]]}` : `${local.toUpperCase()} axis`;
  return `${ROLE_NAMES[role]}: ${name}`;
}

// ─── Photo or list ───────────────────────────────────────────────────────────

// A stick with a photo layout can be shown as the plain list instead: the photo only
// labels the controls the stick ships with, the list has everything it reports (for
// sticks that have been reprogrammed). Remembered per stick, on this computer.
const LIST_VIEW_KEY = 'joymap.listView';

function listViewKeys() {
  try {
    const keys = JSON.parse(localStorage.getItem(LIST_VIEW_KEY));
    return Array.isArray(keys) ? keys : [];
  } catch {
    return [];
  }
}

const inListView = (key) => listViewKeys().includes(key);

function setListView(key, on) {
  const keys = listViewKeys().filter((k) => k !== key);
  try {
    localStorage.setItem(LIST_VIEW_KEY, JSON.stringify(on ? [...keys, key] : keys));
  } catch {
    // Storage unavailable: the choice just won't be remembered.
  }
  if (status) renderStatus(status);
}

// ─── Folded labels ───────────────────────────────────────────────────────────

// A stick with more controls than there is room to show dropdowns for (see `folded` in
// layout.js) shows each label as its heading alone, with the outputs it is mapped to
// beside it. Clicking a label, or its dot, opens its dropdowns over the labels below.
let openCallout = null; // id of the label that is open
let summaryEl = {}; // callout id -> the icons beside its heading

function setOpenCallout(id) {
  if (openCallout === id) return;
  if (openControl && calloutOf[openControl] !== id) closePicker({ restoreFocus: false });
  if (openCallout) {
    calloutEl[openCallout]?.classList.remove('is-open');
    calloutEl[openCallout]?.querySelector('.callout-head')?.setAttribute('aria-expanded', 'false');
  }
  openCallout = id;
  stage.classList.toggle('has-open', id !== null);
  if (id) {
    calloutEl[id].classList.add('is-open');
    calloutEl[id].querySelector('.callout-head').setAttribute('aria-expanded', 'true');
  }
  setFocus(id);
}

const toggleCallout = (id) => setOpenCallout(openCallout === id ? null : id);

const calloutControls = (c) => (c.group ? c.group.map((item) => item.id) : [c.id]);

// The outputs a folded label's controls are mapped to, as icons beside its heading.
function renderSummary(c) {
  const el = summaryEl[c.id];
  if (!el) return;
  const targets = calloutControls(c)
    .map((id) => TARGET_BY_ID[currentBinding(id).target])
    .filter(Boolean);
  el.innerHTML = targets
    .slice(0, 6)
    .map((target) => targetIcon(target.id))
    .join('');
  el.title = targets.map((target) => target.name).join(', ');
}

// ─── Stage ────────────────────────────────────────────────────────────────────

function fitStage() {
  const scale = Math.min(window.innerWidth / STAGE.width, window.innerHeight / STAGE.height);
  stage.style.setProperty('--scale', scale);
}

const endIntro = () => document.body.classList.remove('is-intro');

function resetRegistries() {
  calloutEl = {};
  leaderEl = {};
  chipEl = {};
  invEl = {};
  dzEl = {};
  liveEl = {};
  meterEl = {};
  guideEl = {};
  calloutOf = {};
  focused = null;
  drawHud = null;
  live = {};
}

// Rebuilds the stage for the connected stick: the photo layout for sticks with a skin,
// the universal layout for everything else, or a prompt when nothing is plugged in.
function buildStage() {
  closePicker({ restoreFocus: false });
  resetRegistries();
  for (const id of ['#leaders', '#guides', '#callouts', '#generic']) $(id).replaceChildren();
  stage.classList.remove('has-focus');
  stage.classList.remove('has-open');
  openCallout = null;
  summaryEl = {};
  layout = (model && !inListView(model.key) && LAYOUTS[model.skin]) || null;
  const mode = !model ? 'empty' : layout ? 'photo' : 'generic';
  stage.dataset.mode = mode;
  stage.dataset.skin = layout ? model.skin : '';
  stage.dataset.density = layout?.dense ? 'dense' : '';
  stage.dataset.fold = layout?.folded ? 'folded' : '';

  if (mode === 'photo') {
    buildImage();
    buildGuides();
    buildLeaders();
    buildCallouts();
  } else if (mode === 'generic') {
    ({ drawHud } = buildGeneric($('#generic'), model, deviceSettings(), genericHooks, { photo: Boolean(LAYOUTS[model.skin]) }));
    endIntro();
  } else {
    const empty = htmlEl('div', 'gen-empty', $('#generic'));
    htmlEl('div', 'gen-empty-title', empty).textContent = 'No joystick detected';
    htmlEl('p', 'gen-tip', empty).textContent = 'Plug in your flight stick. It shows up here automatically.';
    endIntro();
  }
  renderAllChips();
}

function buildImage() {
  const { image } = layout;
  const img = $('#stick');
  img.alt = layout.alt;
  img.style.left = `${image.x}px`;
  img.style.top = `${image.y}px`;
  img.style.width = `${image.width * image.scale}px`;
  img.style.height = `${image.height * image.scale}px`;
  if (img.getAttribute('src') === image.src && img.complete && img.naturalWidth) return endIntro();
  img.addEventListener('load', endIntro, { once: true });
  img.addEventListener('error', endIntro, { once: true });
  img.src = image.src;
}

function buildLeaders() {
  const layer = $('#leaders');
  layout.callouts.forEach((c, i) => {
    const col = layout.columns[c.side];
    const [tx, ty] = toStage(layout, c.at);
    const points = [[col.anchor, c.y], [col.elbow, c.y], ...(c.via ?? []), [tx, ty]]
      .map((p) => p.join(','))
      .join(' ');

    const g = svgEl('g', { class: 'leader', 'data-callout': c.id, style: `--i:${i}` }, layer);
    svgEl('polyline', { class: 'leader-halo', points, pathLength: 1 }, g);
    svgEl('polyline', { class: 'leader-line', points, pathLength: 1 }, g);
    const marker = svgEl('g', { class: 'marker' }, g);
    svgEl('circle', { class: 'leader-tick', cx: col.anchor, cy: c.y, r: 1.8 }, marker);
    svgEl('circle', { class: 'marker-pulse', cx: tx, cy: ty, r: 11 }, marker);
    const ring = svgEl('circle', { class: 'marker-ring', cx: tx, cy: ty, r: 7 }, marker);
    svgEl('circle', { class: 'marker-dot', cx: tx, cy: ty, r: 2.2 }, marker);

    ring.addEventListener('pointerenter', () => setFocus(c.id));
    ring.addEventListener('pointerleave', () => setFocus(null));
    ring.addEventListener('click', () => (layout.folded ? toggleCallout(c.id) : openPicker(c.group ? c.group[0].id : c.id)));
    leaderEl[c.id] = g;
  });
}

// A label's heading: its own name, else the hat's or the control's.
const calloutName = (c) => c.name ?? (c.group ? (model.hats.find((h) => h.id === c.id)?.name ?? 'Hat Switch') : controlInfo(c.id).name);

function buildMeter(axisId, head) {
  const axis = model.axes.find((a) => a.id === axisId);
  const meter = htmlEl('span', `meter${isCentered(axis, deviceSettings()) ? '' : ' meter-full'}`, head);
  meterEl[axisId] = htmlEl('span', 'meter-fill', meter);
}

function buildGuides() {
  const layer = $('#guides');
  for (const [axis, guide] of Object.entries(layout.guides)) {
    const group = svgEl('g', { class: 'guide' }, layer);
    svgEl('path', { class: 'guide-path', d: guide.path }, group);
    for (const [x, y, angle] of guide.arrows) {
      svgEl('path', { class: 'guide-arrow', d: 'M0 0 L-8 -4.5 L-8 4.5 Z', transform: `translate(${x} ${y}) rotate(${angle})` }, group);
    }
    const [cx, cy] = guide.point(0);
    const dot = svgEl('circle', { class: 'guide-dot', cx, cy, r: 4.5 }, group);
    guideEl[axis] = { group, dot, last: null, movedAt: 0 };
  }
}

function buildChip(controlId, parent) {
  const chip = htmlEl('button', 'chip', parent);
  chip.type = 'button';
  chip.setAttribute('aria-haspopup', 'dialog');
  chip.addEventListener('click', () => openPicker(controlId));
  chipEl[controlId] = chip;
  return chip;
}

function buildInv(axisId, parent) {
  const inv = button('inv', 'Inv', parent, () => updateBinding(axisId, { invert: !currentBinding(axisId).invert }));
  inv.title = 'Invert this axis';
  invEl[axisId] = inv;
  return inv;
}

function buildDz(axisId, parent) {
  const dz = button('dz', 'DZ', parent, () => openDeadzone(axisId));
  dz.title = 'Deadzone and anti-deadzone: how the axis responds as it leaves its resting point';
  dz.setAttribute('aria-haspopup', 'dialog');
  dzEl[axisId] = dz;
  return dz;
}

function buildCallouts() {
  const layer = $('#callouts');
  layout.callouts.forEach((c, i) => {
    const folded = layout.folded === true;
    const node = htmlEl('div', `callout side-${c.side}${folded ? ' is-folded' : ''}`, layer);
    node.dataset.callout = c.id;
    node.style.setProperty('--i', i);
    node.style.top = `${c.y - 11}px`;
    if (c.side === 'left') node.style.right = `${STAGE.width - layout.columns.left.edge}px`;
    else node.style.left = `${layout.columns.right.edge}px`;

    const head = htmlEl('div', 'callout-head', node);
    htmlEl('span', 'callout-name', head).textContent = calloutName(c);
    if (c.tag) htmlEl('span', 'callout-tag', head).textContent = c.tag;
    // A folded label's dropdowns sit in a panel that opens under its heading.
    const body = folded ? htmlEl('div', 'callout-body', node) : node;
    if (folded) {
      head.setAttribute('role', 'button');
      head.tabIndex = 0;
      head.setAttribute('aria-expanded', 'false');
      head.addEventListener('click', () => toggleCallout(c.id));
      head.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        toggleCallout(c.id);
      });
    }

    if (c.group) {
      // With its dropdowns folded away, a lever's own meter goes beside the heading.
      const axes = c.group.filter((item) => controlKind(item.id) === 'axis');
      if (folded && axes.length === 1) buildMeter(axes[0].id, head);
      // Paired rows are narrow, so their chips abbreviate; a `wide` row spans the pair.
      const paired = c.columns === 2;
      const rows = paired ? htmlEl('div', `callout-grid${c.group.some((item) => item.dir) ? ' has-icons' : ''}`, body) : body;
      for (const item of c.group) {
        const row = htmlEl('div', `callout-row hat-row${item.wide ? ' is-wide' : ''}`, rows);
        if (item.dir) htmlEl('span', 'hat-icon', row).innerHTML = hatIcon(item.dir);
        if (item.label) htmlEl('span', 'hat-label', row).textContent = item.label;
        const chip = buildChip(item.id, row);
        if (paired && !item.wide) chip.classList.add('is-compact');
        if (controlKind(item.id) === 'axis') {
          buildInv(item.id, row);
          buildDz(item.id, row);
        }
        liveEl[item.id] = row;
        calloutOf[item.id] = c.id;
      }
    } else {
      const axis = model.axes.find((a) => a.id === c.id);
      if (axis) buildMeter(c.id, head);
      const row = htmlEl('div', 'callout-row', body);
      buildChip(c.id, row);
      if (axis) {
        buildInv(c.id, row);
        buildDz(c.id, row);
      }
      liveEl[c.id] = node;
      calloutOf[c.id] = c.id;
    }

    if (folded) summaryEl[c.id] = htmlEl('span', 'callout-sum', head);
    node.addEventListener('pointerenter', () => setFocus(c.id));
    node.addEventListener('pointerleave', () => setFocus(null));
    calloutEl[c.id] = node;
  });
}

// Hooks the generic layout uses to create chips and register rows.
const genericHooks = {
  chip: buildChip,
  inv: buildInv,
  dz: buildDz,
  register(id, row, extras = {}) {
    liveEl[id] = row;
    calloutEl[id] = row;
    calloutOf[id] = id;
    if (extras.meterFill) meterEl[id] = extras.meterFill;
    row.addEventListener('pointerenter', () => setFocus(id));
    row.addEventListener('pointerleave', () => setFocus(null));
  },
  action(parent, label, kind) {
    const run = { copy: copyDeviceInfo, report: () => api.reportDevice(), photo: () => setListView(model.key, false) };
    button('ghost', label, parent, run[kind]);
  },
};

// ─── Focus (hover highlight) ─────────────────────────────────────────────────

function setFocus(id) {
  if (openControl) id = calloutOf[openControl];
  else if (id === null) id = openCallout;
  if (focused === id) return;
  if (focused) {
    calloutEl[focused]?.classList.remove('is-focus');
    leaderEl[focused]?.classList.remove('is-focus');
  }
  focused = id;
  stage.classList.toggle('has-focus', id !== null && stage.dataset.mode === 'photo');
  if (id) {
    calloutEl[id]?.classList.add('is-focus');
    leaderEl[id]?.classList.add('is-focus');
  }
}

// ─── Chips ───────────────────────────────────────────────────────────────────

// For the narrow chips in paired rows: "Right Stick Up" → "RS Up", "A Button" → "A".
function shortName(target) {
  const part = /^(ls|rs|dpad)_(up|down|left|right|click)$/.exec(target.id)?.[1];
  const prefix = part ? (part === 'dpad' ? 'D-Pad ' : `${part.toUpperCase()} `) : '';
  return prefix + TILE_LABELS[target.id];
}

function renderChip(controlId) {
  const chip = chipEl[controlId];
  if (!chip) return;
  const binding = currentBinding(controlId);
  const target = binding.target ? TARGET_BY_ID[binding.target] : null;
  chip.classList.toggle('is-mapped', Boolean(target));
  chip.innerHTML = target
    ? `<span class="chip-icon">${targetIcon(target.id)}</span><span class="chip-label"></span>${CHEVRON}`
    : `<span class="chip-label"></span>${CHEVRON}`;
  const compact = chip.classList.contains('is-compact');
  chip.querySelector('.chip-label').textContent = target ? (compact ? shortName(target) : target.name) : 'Not mapped';
  chip.title = target && compact ? target.name : '';
  chip.setAttribute('aria-label', `${controlInfo(controlId).name}: ${target ? target.name : 'not mapped'}`);

  const inv = invEl[controlId];
  if (inv) {
    inv.disabled = !target;
    inv.setAttribute('aria-pressed', String(binding.invert === true));
    inv.classList.toggle('is-on', binding.invert === true);
  }

  const dz = dzEl[controlId];
  if (dz) {
    const percent = Math.round((binding.deadzone ?? 0) * 100);
    const anti = Math.round((binding.antiDeadzone ?? 0) * 100);
    dz.disabled = !target;
    dz.textContent = anti ? `DZ ${percent}% +${anti}%` : `DZ ${percent}%`;
    dz.classList.toggle('has-anti', anti > 0);
    dz.setAttribute(
      'aria-label',
      `${controlInfo(controlId).name} deadzone: ${percent}%${anti ? `, anti-deadzone: ${anti}%` : ''}`,
    );
  }
}

function renderAllChips() {
  for (const id of Object.keys(chipEl)) renderChip(id);
  for (const c of layout?.folded ? layout.callouts : []) renderSummary(c);
}

function applySnapshot(snap) {
  bindings = snap.bindings;
  profiles = snap.profiles;
  activeId = snap.activeId;
  renderStatus(snap.status);
  renderAllChips();
}

async function updateBinding(controlId, patch) {
  try {
    applySnapshot(await api.setBinding(full(controlId), { ...currentBinding(controlId), ...patch }));
  } catch (err) {
    showToast(errorText(err));
  }
}

// Electron wraps IPC errors as "Error invoking remote method '…': Error: <message>".
function errorText(err) {
  return String(err?.message ?? err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

// ─── Target picker ───────────────────────────────────────────────────────────

// Other controls already mapped to each target (on any device), so doubles are visible.
function usedTargets(exceptId) {
  const used = {};
  for (const [id, binding] of Object.entries(bindings)) {
    if (id !== full(exceptId) && binding.target) (used[binding.target] ??= []).push(boundControlName(id));
  }
  return used;
}

function openPicker(controlId) {
  if (isLocked()) {
    showToast('Default leaves your joystick alone — create a game profile to map it');
    openProfileMenu('new');
    return;
  }
  closeMenus();
  closePicker({ restoreFocus: false });
  const control = controlInfo(controlId);
  const binding = currentBinding(controlId);
  const used = usedTargets(controlId);
  openControl = controlId;
  openKind = 'picker';
  setFocus(calloutOf[controlId]);
  chipEl[controlId].classList.add('is-open');

  popover.classList.remove('is-compact');
  popover.replaceChildren();
  popover.setAttribute('aria-label', `Map ${control.name}`);
  const head = htmlEl('div', 'pop-head', popover);
  htmlEl('span', 'pop-kicker', head).textContent = 'Map';
  htmlEl('span', 'pop-title', head).textContent = control.name;
  htmlEl('span', 'pop-kicker', head).textContent = 'to';

  const defaultHint = control.hint || 'Choose an Xbox input';
  const hint = htmlEl('span', 'pop-hint');
  hint.textContent = defaultHint;

  for (const section of TARGET_MENUS[control.kind]) {
    const block = htmlEl('section', 'pop-section', popover);
    htmlEl('h3', 'pop-heading', block).textContent = section.title;
    const tiles = htmlEl('div', 'tiles', block);
    for (const targetId of section.items) {
      const target = TARGET_BY_ID[targetId];
      const tile = htmlEl('button', 'tile', tiles);
      tile.type = 'button';
      tile.dataset.target = targetId;
      tile.setAttribute('aria-pressed', String(binding.target === targetId));
      tile.setAttribute('aria-label', target.name);
      tile.classList.toggle('is-selected', binding.target === targetId);
      tile.innerHTML = `${targetIcon(targetId)}<span class="tile-label"></span>`;
      tile.querySelector('.tile-label').textContent = TILE_LABELS[targetId];
      const also = used[targetId] ? ` · also on ${used[targetId].join(', ')}` : '';
      if (also) htmlEl('span', 'tile-used', tile);
      const describe = () => {
        hint.textContent = `${target.name}${target.hint ? ` — ${target.hint}` : ''}${also}`;
      };
      tile.addEventListener('pointerenter', describe);
      tile.addEventListener('focus', () => tile.matches(':focus-visible') && describe());
      tile.addEventListener('pointerleave', () => (hint.textContent = defaultHint));
      tile.addEventListener('click', async () => {
        await updateBinding(controlId, { target: targetId });
        closePicker();
      });
    }
  }

  if (control.kind === 'axis') {
    const options = htmlEl('div', 'pop-options', popover);
    responseSlider(options, controlId, DEADZONE);
    if (antiDeadzoneApplies(controlId)) responseSlider(options, controlId, ANTI_DEADZONE);

    // Throttles read end to end; sticks, twists and pedals spring back to a calibrated middle.
    if (control.axis) {
      const centered = isCentered(control.axis, deviceSettings());
      const toggle = htmlEl('button', 'pop-toggle', options);
      toggle.type = 'button';
      toggle.setAttribute('role', 'switch');
      toggle.setAttribute('aria-checked', String(centered));
      htmlEl('span', 'pop-option-name', toggle).textContent = 'Springs back to centre';
      htmlEl('span', 'switch', toggle).innerHTML = '<span class="switch-knob"></span>';
      toggle.title = 'On for sticks, twists and pedals. Off for throttles and sliders.';
      toggle.addEventListener('click', async () => {
        await api.setAxisCentered(controlId, !centered);
        closePicker();
      });
    }
  }

  const foot = htmlEl('div', 'pop-foot', popover);
  foot.append(hint);
  const clear = button('pop-clear', 'Clear', foot, async () => {
    await updateBinding(controlId, { target: null });
    closePicker();
  });
  clear.disabled = binding.target === null;

  popover.hidden = false;
  positionPicker(controlId);
  (popover.querySelector('.tile.is-selected') ?? popover.querySelector('.tile'))?.focus({ preventScroll: true });
}

// The two settings that shape how an axis responds as it leaves its resting point.
// Deadzone is about the stick: it ignores small movement (drift, a worn sensor).
// Anti-deadzone is about the game: output starts at this level the moment the axis
// moves, which cancels a deadzone the game applies to the Xbox stick itself.
const DEADZONE = {
  key: 'deadzone',
  name: 'Deadzone',
  max: MAX_DEADZONE,
  note: 'Movement smaller than this is ignored. Raise it if the axis drifts.',
};
const ANTI_DEADZONE = {
  key: 'antiDeadzone',
  name: 'Anti-deadzone',
  max: MAX_ANTI_DEADZONE,
  note: 'Output starts here the moment the axis moves.',
};

// Anti-deadzone needs an analog output: it means nothing for an axis that presses buttons.
function antiDeadzoneApplies(controlId) {
  const target = TARGET_BY_ID[currentBinding(controlId).target];
  return Boolean(target) && !target.digital;
}

// One response slider, shared by the picker and the DZ popover. Returns a setter so the
// popover's Reset button can move it. `onInput` gets the new value (0–max) as it changes.
function responseSlider(parent, controlId, { key, name, max, note }, onInput) {
  const label = htmlEl('label', 'pop-option', parent);
  label.title = note;
  htmlEl('span', 'pop-option-name', label).textContent = name;
  const slider = htmlEl('input', 'slider', label);
  slider.type = 'range';
  slider.min = '0';
  slider.max = String(max * 100);
  slider.step = '1';
  slider.value = String(Math.round((currentBinding(controlId)[key] ?? 0) * 100));
  const value = htmlEl('output', 'pop-option-value', label);
  value.textContent = `${slider.value}%`;
  let timer = null;
  slider.addEventListener('input', () => {
    value.textContent = `${slider.value}%`;
    onInput?.(Number(slider.value) / 100);
    clearTimeout(timer);
    timer = setTimeout(() => updateBinding(controlId, { [key]: Number(slider.value) / 100 }), 120);
  });
  return {
    slider,
    set(fraction) {
      clearTimeout(timer);
      slider.value = String(Math.round(fraction * 100));
      value.textContent = `${slider.value}%`;
    },
  };
}

// A small popover with the response sliders, opened from the DZ button beside an axis.
function openDeadzone(controlId) {
  if (openControl === controlId && openKind === 'deadzone') return closePicker();
  if (isLocked()) return;
  closeMenus();
  closePicker({ restoreFocus: false });
  const control = controlInfo(controlId);
  const binding = currentBinding(controlId);
  const defaults = { deadzone: axisDefaultDeadzone(controlId), antiDeadzone: 0 };
  const values = { deadzone: binding.deadzone, antiDeadzone: binding.antiDeadzone ?? 0 };
  openControl = controlId;
  openKind = 'deadzone';
  setFocus(calloutOf[controlId]);
  dzEl[controlId].classList.add('is-open');

  popover.classList.add('is-compact');
  popover.replaceChildren();
  popover.setAttribute('aria-label', `Response of ${control.name}`);
  const head = htmlEl('div', 'pop-head', popover);
  htmlEl('span', 'pop-kicker', head).textContent = 'Response';
  htmlEl('span', 'pop-title', head).textContent = control.name;

  let reset = null;
  const atDefaults = () => Object.keys(defaults).every((key) => Math.round(values[key] * 100) === Math.round(defaults[key] * 100));
  const options = htmlEl('div', 'pop-options', popover);
  const fields = {};
  for (const setting of [DEADZONE, ANTI_DEADZONE]) {
    fields[setting.key] = responseSlider(options, controlId, setting, (fraction) => {
      values[setting.key] = fraction;
      reset.disabled = atDefaults();
    });
    htmlEl('p', 'pop-note', options).textContent = setting.note;
  }
  if (!antiDeadzoneApplies(controlId)) {
    fields.antiDeadzone.slider.disabled = true;
    const output = TARGET_BY_ID[binding.target]?.name ?? 'This output';
    options.lastChild.textContent = `${output} only presses buttons, so there is no analog output to start higher.`;
  }

  const foot = htmlEl('div', 'pop-foot', popover);
  htmlEl('span', 'pop-hint', foot);
  reset = button('pop-clear', 'Reset', foot, async () => {
    Object.assign(values, defaults);
    for (const key of Object.keys(defaults)) fields[key].set(defaults[key]);
    reset.disabled = true;
    await updateBinding(controlId, defaults);
  });
  reset.disabled = atDefaults();

  popover.hidden = false;
  positionPicker(controlId);
  fields.deadzone.slider.focus({ preventScroll: true });
}

// The button the open popover hangs off: the DZ button, or the mapping chip.
const pickerAnchor = (controlId) => (openKind === 'deadzone' ? dzEl[controlId] : chipEl[controlId]);

// Opens beside its button, on whichever side has more room. The response popover clears
// the whole row (chip, INV and DZ) so the axis it edits stays visible.
function positionPicker(controlId) {
  const anchor = pickerAnchor(controlId);
  if (!anchor) return;
  const rect = (openKind === 'deadzone' ? anchor.parentElement : anchor).getBoundingClientRect();
  const onLeftHalf = rect.left + rect.width / 2 < window.innerWidth / 2;
  const gap = 18;
  const width = popover.offsetWidth;
  const height = popover.offsetHeight;
  let x = onLeftHalf ? rect.right + gap : rect.left - gap - width;
  let y = rect.top + rect.height / 2 - 48;
  x = Math.max(12, Math.min(window.innerWidth - width - 12, x));
  y = Math.max(12, Math.min(window.innerHeight - height - 12, y));
  popover.style.left = `${x}px`;
  popover.style.top = `${y}px`;
}

function closePicker({ restoreFocus = true } = {}) {
  if (!openControl) return;
  const chip = pickerAnchor(openControl);
  chip?.classList.remove('is-open');
  openControl = null;
  popover.hidden = true;
  popover.replaceChildren();
  setFocus(null);
  if (restoreFocus) chip?.focus({ preventScroll: true });
}

popover.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.stopPropagation(); // one Escape closes the picker, the next the label it opened from
    closePicker();
    return;
  }
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  const tiles = [...popover.querySelectorAll('.tile')];
  const index = tiles.indexOf(document.activeElement);
  if (index === -1) return;
  event.preventDefault();
  const next = event.key === 'ArrowRight' ? index + 1 : index - 1;
  tiles[(next + tiles.length) % tiles.length].focus();
});

// ─── Menus (profiles, joystick) ──────────────────────────────────────────────

let menuMode = 'list'; // list | new | rename

async function runProfileAction(action) {
  try {
    const result = await action();
    if (result && typeof result === 'object' && 'bindings' in result) applySnapshot(result);
    return result;
  } catch (err) {
    showToast(errorText(err));
    return null;
  }
}

function openMenu(menu, anchor) {
  menu.hidden = false;
  anchor.classList.add('is-open');
  const rect = anchor.getBoundingClientRect();
  const width = menu.offsetWidth;
  menu.style.left = `${Math.max(12, Math.min(window.innerWidth - width - 12, rect.left))}px`;
  menu.style.top = `${rect.bottom + 10}px`;
}

function closeMenus() {
  for (const [menu, anchor] of [
    [profileMenu, '#profile-picker'],
    [deviceMenu, '#device-picker'],
  ]) {
    if (menu.hidden) continue;
    menu.hidden = true;
    menu.replaceChildren();
    $(anchor).classList.remove('is-open');
  }
}
const closeProfileMenu = closeMenus;

function openProfileMenu(mode = 'list') {
  closePicker({ restoreFocus: false });
  closeMenus();
  menuMode = mode;
  renderProfileMenu();
  openMenu(profileMenu, $('#profile-picker'));
  (profileMenu.querySelector('input') ?? profileMenu.querySelector('.profile-item.is-active'))?.focus({ preventScroll: true });
}

function renderProfileMenu() {
  profileMenu.replaceChildren();
  if (menuMode === 'new') return renderNameForm('new');
  if (menuMode === 'rename') return renderNameForm('rename');

  htmlEl('h3', 'pop-heading', profileMenu).textContent = 'Profiles';
  const list = htmlEl('div', 'profile-list', profileMenu);
  for (const p of profiles) {
    const item = htmlEl('button', 'profile-item', list);
    item.type = 'button';
    item.classList.toggle('is-active', p.id === activeId);
    item.setAttribute('aria-pressed', String(p.id === activeId));
    htmlEl('span', 'profile-check', item).textContent = p.id === activeId ? '●' : '';
    const text = htmlEl('span', 'profile-text', item);
    htmlEl('span', 'profile-item-name', text).textContent = p.name;
    if (p.locked) htmlEl('span', 'profile-item-note', text).textContent = 'Joystick works as-is · no virtual controller';
    item.addEventListener('click', async () => {
      closeMenus();
      await runProfileAction(() => api.selectProfile(p.id));
    });
  }

  const actions = htmlEl('div', 'profile-actions', profileMenu);
  button('ghost', '+ New profile', actions, () => openProfileMenu('new'));
  button('ghost', 'Import…', actions, async () => {
    closeMenus();
    const snap = await runProfileAction(() => api.importProfile());
    if (snap && snap.activeId !== activeId) showToast('Profile imported');
  });

  if (!isLocked()) {
    const current = htmlEl('div', 'profile-actions profile-actions-current', profileMenu);
    htmlEl('span', 'profile-current-label', current).textContent = status.profile.name;
    button('ghost', 'Rename', current, () => openProfileMenu('rename'));
    button('ghost', 'Export', current, async () => {
      closeMenus();
      if (await runProfileAction(() => api.exportProfile(activeId))) showToast('Profile exported');
    });
    button('ghost', 'Reset', current, async () => {
      closeMenus();
      await runProfileAction(() => api.resetProfile(activeId));
    });
    button('ghost ghost-danger', 'Delete', current, async () => {
      closeMenus();
      await runProfileAction(() => api.deleteProfile(activeId));
    });
  }
}

function renderNameForm(kind) {
  const form = htmlEl('form', 'profile-form', profileMenu);
  htmlEl('h3', 'pop-heading', form).textContent = kind === 'new' ? 'New game profile' : 'Rename profile';
  const input = htmlEl('input', 'text-input', form);
  input.type = 'text';
  input.maxLength = MAX_NAME_LENGTH;
  input.placeholder = 'e.g. Ace Combat 8';
  input.value = kind === 'rename' ? status.profile.name : '';
  input.required = true;

  // A template is written for one stick's buttons, so it's only offered on that stick
  // (or before any stick is plugged in); every other stick starts blank.
  const stickSkin = devices().length ? (devices().find((d) => d.role === 'stick')?.skin ?? null) : 'extreme3dpro';
  const offered = presets.filter((p) => !p.skin || p.skin === stickSkin);
  let presetId = 'blank';
  if (kind === 'new' && offered.some((p) => p.skin)) {
    presetId = offered.find((p) => p.skin).id;
    htmlEl('h3', 'pop-heading', form).textContent = 'Start from';
    const choices = htmlEl('div', 'preset-list', form);
    let typed = false;
    input.addEventListener('input', () => (typed = input.value.trim() !== ''));
    for (const preset of offered) {
      const choice = htmlEl('button', 'preset', choices);
      choice.type = 'button';
      choice.classList.toggle('is-selected', preset.id === presetId);
      htmlEl('span', 'preset-name', choice).textContent = preset.name;
      htmlEl('span', 'preset-note', choice).textContent = preset.description;
      choice.addEventListener('click', () => {
        presetId = preset.id;
        for (const c of choices.children) c.classList.toggle('is-selected', c === choice);
        if (!typed) input.value = preset.id === 'blank' ? '' : preset.name;
      });
    }
    input.value = offered.find((p) => p.id === presetId)?.name ?? '';
  }

  const actions = htmlEl('div', 'profile-actions profile-form-actions', form);
  button('ghost', 'Cancel', actions, () => openProfileMenu('list'));
  const submit = htmlEl('button', 'save is-dirty', actions);
  submit.type = 'submit';
  submit.textContent = kind === 'new' ? 'Create' : 'Rename';

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) return input.focus();
    closeMenus();
    if (kind === 'new') {
      const snap = await runProfileAction(() => api.createProfile({ name, presetId }));
      if (snap && !snap.status.profile.locked) showToast(`Profile "${snap.status.profile.name}" created`);
    } else {
      await runProfileAction(() => api.renameProfile(activeId, name));
    }
  });
}

function openDeviceMenu() {
  closePicker({ restoreFocus: false });
  closeMenus();
  deviceMenu.replaceChildren();
  htmlEl('h3', 'pop-heading', deviceMenu).textContent = 'Devices';
  const list = htmlEl('div', 'profile-list', deviceMenu);
  const plugged = devices();
  const several = plugged.length > 1;
  // Roles matter with several devices, or for one that was a throttle in a HOTAS and is
  // now plugged in alone (it stays the throttle until it's made the stick here).
  const roles = several || plugged.some((d) => d.role !== 'stick');
  if (!plugged.length) htmlEl('p', 'menu-empty', list).textContent = 'No joystick detected. Plug one in.';
  if (several) htmlEl('p', 'menu-note', list).textContent = 'All of these work together. Pick one to map its controls.';
  for (const d of plugged) {
    const current = d.id === model?.id;
    const item = htmlEl('button', 'profile-item', list);
    item.type = 'button';
    item.classList.toggle('is-active', current);
    item.setAttribute('aria-pressed', String(current));
    htmlEl('span', 'profile-check', item).textContent = current ? '●' : '';
    const text = htmlEl('span', 'profile-text', item);
    htmlEl('span', 'profile-item-name', text).textContent = d.name;
    htmlEl('span', 'profile-item-note', text).textContent =
      d.problem || [d.support && SUPPORT_LABELS[d.support], d.key].filter(Boolean).join(' · ');
    if (roles) htmlEl('span', 'profile-role', item).textContent = d.role ? ROLE_NAMES[d.role] : 'Not in use';
    item.addEventListener('click', async () => {
      closeMenus();
      if (!current) await api.selectDevice(d.id);
    });
  }
  // What the device on screen is in the rig. Picking a role another device has swaps them.
  if (model && roles) {
    const row = htmlEl('div', 'role-row', deviceMenu);
    htmlEl('h3', 'pop-heading', row).textContent = `Use ${model.name} as`;
    const options = htmlEl('div', 'role-options', row);
    for (const role of ROLES) {
      const holder = plugged.find((d) => d.role === role && d.id !== model.id);
      const option = button('role-option', ROLE_NAMES[role], options, async () => {
        closeMenus();
        if (role !== model.role) await api.setDeviceRole(model.id, role);
      });
      option.classList.toggle('is-selected', role === model.role);
      option.setAttribute('aria-pressed', String(role === model.role));
      if (holder) option.title = `Swaps with ${holder.name}`;
    }
  }
  if (model) {
    const actions = htmlEl('div', 'profile-actions', deviceMenu);
    if (LAYOUTS[model.skin]) {
      const listed = inListView(model.key);
      const view = button('ghost', listed ? 'Photo view' : 'List view', actions, () => {
        closeMenus();
        setListView(model.key, !listed);
      });
      view.title = listed ? 'Show the photo of the stick' : 'Show every button and axis the stick reports, as a list';
    }
    button('ghost', 'Copy device info', actions, () => {
      closeMenus();
      copyDeviceInfo();
    });
    button('ghost', 'Report this stick ↗', actions, () => {
      closeMenus();
      api.reportDevice();
    });
  }
  openMenu(deviceMenu, $('#device-picker'));
}

async function copyDeviceInfo() {
  const ok = await api.copyDeviceInfo().catch(() => false);
  showToast(ok ? 'Device info copied — paste it into a GitHub issue' : 'No joystick to describe');
}

for (const menu of [profileMenu, deviceMenu]) {
  menu.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenus();
  });
}

document.addEventListener('pointerdown', (event) => {
  if (openControl && !popover.contains(event.target) && !pickerAnchor(openControl)?.contains(event.target)) {
    closePicker({ restoreFocus: false });
  }
  const inMenus = [profileMenu, deviceMenu, $('#profile-picker'), $('#device-picker')].some((n) => n.contains(event.target));
  if (!inMenus) closeMenus();
  if (openCallout && ![calloutEl[openCallout], leaderEl[openCallout], popover].some((n) => n?.contains(event.target))) setOpenCallout(null);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && openCallout && !openControl) setOpenCallout(null);
});

// ─── Status bar ──────────────────────────────────────────────────────────────

// Only unusual states get words next to the emulation switch.
const PAD_PROBLEM = {
  connecting: 'Connecting',
  'driver-missing': 'Driver needed',
  unsupported: 'Windows only',
  error: 'Error',
};
let lastPadError = '';

// What each support level means, for the joystick button's tooltip.
const SUPPORT_TIPS = {
  full: 'fully supported',
  beta: 'beta: its labels are still being confirmed, so say if one points at the wrong control',
  experimental: 'experimental support',
};

// A device's layout signature; the stage is rebuilt only when it changes.
const layoutSignature = (m, settings) =>
  m
    ? JSON.stringify([
        m.id,
        m.role,
        m.skin,
        inListView(m.key),
        m.axes.map((a) => a.id),
        m.hats.length,
        m.buttons,
        settings.centered ?? {},
      ])
    : 'none';

function renderStatus(next) {
  status = next;
  const locked = next.profile.locked;
  stage.classList.toggle('is-locked', locked);
  $('#profile-name').textContent = next.profile.name;

  model = next.joystick.device ?? null;
  const signature = layoutSignature(model, next.joystick.settings ?? {});
  if (signature !== layoutKey) {
    layoutKey = signature;
    buildStage();
  }

  const stick = $('#device-picker');
  const connected = next.joystick.state === 'connected' && model;
  // With more than one device the button names the one on screen by its role, and
  // gains an arrow: the menu is where the others are.
  const several = next.joystick.devices.length > 1;
  stick.dataset.state = connected ? 'connected' : next.joystick.state;
  stick.dataset.several = String(several);
  $('#device-key').textContent = connected && (several || model.role !== 'stick') ? ROLE_NAMES[model.role] : 'Joystick';
  $('#device-name').textContent = connected ? model.name : next.joystick.state === 'unsupported' ? 'Unsupported' : 'Not detected';
  stick.title =
    next.joystick.message ||
    (!connected
      ? 'Plug in a joystick'
      : `${model.name} (${model.key}) · ${SUPPORT_TIPS[model.support]}` +
        (several ? ` · ${next.joystick.devices.length} devices working together, click to see another` : ''));
  $('#device-tag').hidden = !(connected && model.support === 'beta');
  $('#recenter').disabled = !connected;

  const pad = $('#stat-pad');
  const padState = next.emulation || next.pad.state === 'unsupported' ? next.pad.state : 'off';
  const problem = PAD_PROBLEM[padState];
  pad.dataset.state = padState;
  pad.setAttribute('aria-checked', String(next.emulation));
  $('#stat-pad-value').hidden = !problem;
  $('#stat-pad-value').textContent = problem ?? '';
  pad.title = locked
    ? 'Default profile leaves the joystick alone. Pick or create a game profile to emulate an Xbox controller.'
    : next.pad.message || (next.emulation ? 'Emulating an Xbox 360 controller — click to pause' : 'Paused — click to emulate again');
  $('#get-driver').hidden = padState !== 'driver-missing';
  $('#monitor').dataset.state = padState;

  // Driver/FFI failures would otherwise only live in a tooltip.
  const padError = padState === 'error' ? next.pad.message : '';
  if (padError && padError !== lastPadError) showToast(padError);
  lastPadError = padError;

  renderUpdate(next.update);

  const save = $('#save');
  save.hidden = locked;
  save.disabled = !next.dirty;
  save.classList.toggle('is-dirty', next.dirty);
  save.textContent = next.dirty ? 'Save' : 'Saved';
}

// The update button: installs from here where it can, otherwise opens the release page (↗).
function renderUpdate(update) {
  const node = $('#update');
  node.hidden = !update;
  if (!update) return;
  node.disabled = update.state !== 'available';
  node.title = update.inApp ? 'Downloads the update, then restarts to install it' : 'Opens the download page';
  if (update.state === 'downloading') node.textContent = `Downloading update · ${update.progress}%`;
  else if (update.state === 'installing') node.textContent = 'Installing update';
  else node.textContent = `Update available · v${update.version}${update.inApp ? '' : ' ↗'}`;
}

async function save() {
  if (!status?.dirty) return;
  if (await runProfileAction(() => api.save())) showToast('Mapping saved');
}

let toastTimer = null;
function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
}

function wireTopbar() {
  $('#save').addEventListener('click', save);
  $('#open-controls').addEventListener('click', () => api.openControls());
  $('#update').addEventListener('click', () => api.installUpdate().catch((err) => showToast(errorText(err))));
  $('#profile-picker').addEventListener('click', () => (profileMenu.hidden ? openProfileMenu('list') : closeMenus()));
  $('#device-picker').addEventListener('click', () => (deviceMenu.hidden ? openDeviceMenu() : closeMenus()));
  $('#stat-pad').addEventListener('click', async () => {
    if (status.pad.state === 'unsupported') return showToast('Virtual Xbox controllers need Windows');
    if (isLocked()) {
      showToast('Default leaves your joystick alone — pick or create a game profile to emulate');
      return openProfileMenu(profiles.length > 1 ? 'list' : 'new');
    }
    await runProfileAction(() => api.setEmulation(!status.emulation));
  });
  $('#get-driver').addEventListener('click', async () => {
    const how = await api.installDriver().catch(() => null);
    showToast(how === 'launched' ? 'Driver installer opened — approve the Windows prompt' : 'Opened the ViGEmBus download page');
  });
  $('#recenter').addEventListener('click', async () => {
    const ok = await api.recenter().catch(() => false);
    showToast(ok ? 'Stick centre calibrated' : "Couldn't read the stick — is it plugged in?");
  });
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      save();
    }
  });
}

// ─── Output monitor ──────────────────────────────────────────────────────────

const PAD_BUTTONS = [
  ['lb', XUSB.LEFT_SHOULDER],
  ['rb', XUSB.RIGHT_SHOULDER],
  ['dup', XUSB.DPAD_UP],
  ['ddown', XUSB.DPAD_DOWN],
  ['dleft', XUSB.DPAD_LEFT],
  ['dright', XUSB.DPAD_RIGHT],
  ['view', XUSB.BACK],
  ['menu', XUSB.START],
  ['a', XUSB.A],
  ['b', XUSB.B],
  ['x', XUSB.X],
  ['y', XUSB.Y],
  ['ls', XUSB.LEFT_THUMB],
  ['rs', XUSB.RIGHT_THUMB],
];
const padEl = {};

function buildPadViz() {
  const face = (id, cx, cy) =>
    `<g class="pv-btn pv-face" data-pv="${id}" style="--face:${FACE_COLORS[id]}">` +
    `<circle cx="${cx}" cy="${cy}" r="8"/><text x="${cx}" y="${cy + 3.3}">${id.toUpperCase()}</text></g>`;
  $('#padviz').innerHTML = `
    <text class="pv-label" x="0" y="20">LT</text>
    <rect class="pv-track" x="0" y="27" width="54" height="5" rx="2.5"/>
    <rect class="pv-fill" data-pv="lt" x="0" y="27" width="0" height="5" rx="2.5"/>
    <g class="pv-btn" data-pv="lb"><rect x="66" y="22" width="46" height="20" rx="10"/><text x="89" y="35.5">LB</text></g>
    <g class="pv-btn" data-pv="ls"><circle cx="150" cy="32" r="22"/></g>
    <circle class="pv-stick" data-pv="ls-dot" cx="150" cy="32" r="5"/>
    <g class="pv-btn" data-pv="dup"><rect x="211" y="11" width="10" height="14" rx="2"/></g>
    <g class="pv-btn" data-pv="ddown"><rect x="211" y="39" width="10" height="14" rx="2"/></g>
    <g class="pv-btn" data-pv="dleft"><rect x="195" y="27" width="14" height="10" rx="2"/></g>
    <g class="pv-btn" data-pv="dright"><rect x="223" y="27" width="14" height="10" rx="2"/></g>
    <g class="pv-btn" data-pv="view"><circle cx="262" cy="32" r="8"/><text x="262" y="35">⧉</text></g>
    <g class="pv-btn" data-pv="menu"><circle cx="288" cy="32" r="8"/><text x="288" y="35">≡</text></g>
    ${face('y', 342, 14)}${face('x', 324, 32)}${face('b', 360, 32)}${face('a', 342, 50)}
    <g class="pv-btn" data-pv="rs"><circle cx="414" cy="32" r="22"/></g>
    <circle class="pv-stick" data-pv="rs-dot" cx="414" cy="32" r="5"/>
    <g class="pv-btn" data-pv="rb"><rect x="452" y="22" width="46" height="20" rx="10"/><text x="475" y="35.5">RB</text></g>
    <text class="pv-label" x="564" y="20" text-anchor="end">RT</text>
    <rect class="pv-track" x="510" y="27" width="54" height="5" rx="2.5"/>
    <rect class="pv-fill" data-pv="rt" x="510" y="27" width="0" height="5" rx="2.5"/>`;
  for (const node of document.querySelectorAll('#padviz [data-pv]')) padEl[node.dataset.pv] = node;
}

function drawPad(out) {
  for (const [id, bit] of PAD_BUTTONS) padEl[id].classList.toggle('is-on', (out.buttons & bit) !== 0);
  padEl.lt.setAttribute('width', ((out.lt / 255) * 54).toFixed(1));
  const rtWidth = (out.rt / 255) * 54;
  padEl.rt.setAttribute('width', rtWidth.toFixed(1));
  padEl.rt.setAttribute('x', (564 - rtWidth).toFixed(1));
  padEl['ls-dot'].setAttribute('cx', (150 + (out.lx / 32767) * 15).toFixed(1));
  padEl['ls-dot'].setAttribute('cy', (32 - (out.ly / 32767) * 15).toFixed(1));
  padEl['rs-dot'].setAttribute('cx', (414 + (out.rx / 32767) * 15).toFixed(1));
  padEl['rs-dot'].setAttribute('cy', (32 - (out.ry / 32767) * 15).toFixed(1));
}

// ─── Live input ──────────────────────────────────────────────────────────────

let live = {};
let pendingFrame = null;
let frameQueued = false;

function drawMeter(id, v, centered) {
  const fill = meterEl[id];
  if (!fill) return;
  if (!centered) {
    fill.style.left = '0%';
    fill.style.width = `${((v + 1) / 2) * 100}%`;
  } else {
    fill.style.left = `${50 + Math.min(0, v) * 50}%`;
    fill.style.width = `${Math.abs(v) * 50}%`;
  }
}

function drawGuide(id, v, centered, now) {
  const guide = guideEl[id];
  if (!guide) return;
  // Ignore sensor jitter (worn pots wobble a percent or so at rest).
  if (guide.last === null || Math.abs(v - guide.last) > 0.05) {
    guide.last = v;
    guide.movedAt = now;
  }
  const [x, y] = layout.guides[id].point(v);
  guide.dot.setAttribute('cx', x.toFixed(1));
  guide.dot.setAttribute('cy', y.toFixed(1));
  const deflected = centered && Math.abs(v) > 0.12;
  const active = focused === id || deflected || now - guide.movedAt < 900;
  guide.group.classList.toggle('is-active', active);
}

// In the generic layout, the first press of a control scrolls its row into view.
function reveal(id) {
  if (stage.dataset.mode !== 'generic') return;
  liveEl[id]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function drawFrame() {
  frameQueued = false;
  if (!pendingFrame) return;
  const { input, output } = pendingFrame;
  const now = performance.now();
  const settings = deviceSettings();
  // The frame carries every device; the stage shows this one's part of it.
  const prefix = rolePrefix(model?.role ?? 'stick');
  const axes = {};

  for (const id of controlIds()) {
    if (controlKind(id) === 'button') {
      const on = input.buttons[prefix + id] === true;
      if (live[id] === on) continue;
      live[id] = on;
      liveEl[id]?.classList.toggle('is-live', on);
      leaderEl[id]?.classList.toggle('is-live', on);
      if (on) reveal(id);
      continue;
    }
    const axis = model.axes.find((a) => a.id === id);
    const v = (axes[id] = input.axes[prefix + id] ?? 0);
    const centered = isCentered(axis, settings);
    drawMeter(id, v, centered);
    drawGuide(id, v, centered, now);
    // Moving an axis well away from rest counts as "pressing" it for the generic layout.
    const moved = centered ? Math.abs(v) > 0.35 : false;
    if (live[id] !== moved) {
      live[id] = moved;
      liveEl[id]?.classList.toggle('is-live', moved);
      if (moved) reveal(id);
    }
  }
  // A label shared by several controls lights while any of them is pressed.
  for (const c of layout?.callouts ?? []) {
    if (!c.group) continue;
    const any = c.group.some((item) => live[item.id] === true);
    leaderEl[c.id].classList.toggle('is-live', any);
    if (layout.folded) calloutEl[c.id].classList.toggle('has-live', any);
  }
  drawHud?.(axes);
  drawPad(output);
}

// ─── Boot ────────────────────────────────────────────────────────────────────

const boot = await api.init();
presets = boot.presets;

fitStage();
window.addEventListener('resize', () => {
  fitStage();
  if (openControl) positionPicker(openControl);
  closeMenus();
});
buildPadViz();
wireTopbar();
applySnapshot(boot);

api.onStatus(renderStatus);
api.onFrame((frame) => {
  pendingFrame = frame;
  if (!frameQueued) {
    frameQueued = true;
    requestAnimationFrame(drawFrame);
  }
});
