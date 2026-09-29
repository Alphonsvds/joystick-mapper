import { MAX_DEADZONE, TARGET_BY_ID, TARGET_MENUS, XUSB, bindingFor, controlKind } from '../shared/controls.js';
import { defaultDeadzone, isCentered } from '../shared/devices.js';
import { MAX_NAME_LENGTH } from '../shared/profiles.js';
import { AXIS_GUIDES, CALLOUTS, COLUMNS, IMAGE, STAGE, toStage } from './layout.js';
import { buildGeneric } from './generic.js';
import { CHEVRON, FACE_COLORS, TILE_LABELS, targetIcon } from './icons.js';

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
let model = null; // the connected stick: { key, name, skin, support, axes, hats, buttons, buttonNames }
let layoutKey = null; // what the stage was last built for
let focused = null; // callout / row id currently highlighted
let openControl = null; // control id whose picker is open
let drawHud = null; // generic layout's live readout

const isLocked = () => status?.profile.locked ?? true;
const deviceSettings = () => status?.joystick.settings ?? {};

// Element lookups, rebuilt with the stage.
let calloutEl = {}; // callout / row id -> element
let leaderEl = {}; // callout id -> svg group (photo layout only)
let chipEl = {}; // control id -> chip button
let invEl = {}; // control id -> invert toggle
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

function currentBinding(id) {
  const axis = model?.axes.find((a) => a.id === id);
  const dz = axis ? defaultDeadzone(axis, isCentered(axis, deviceSettings())) : undefined;
  return bindingFor(bindings, id, dz);
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
  const mode = !model ? 'empty' : model.skin === 'extreme3dpro' ? 'photo' : 'generic';
  stage.dataset.mode = mode;

  if (mode === 'photo') {
    buildImage();
    buildGuides();
    buildLeaders();
    buildCallouts();
  } else if (mode === 'generic') {
    ({ drawHud } = buildGeneric($('#generic'), model, deviceSettings(), genericHooks));
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
  const img = $('#stick');
  img.style.left = `${IMAGE.x}px`;
  img.style.top = `${IMAGE.y}px`;
  img.style.width = `${IMAGE.width * IMAGE.scale}px`;
  img.style.height = `${IMAGE.height * IMAGE.scale}px`;
  if (img.complete && img.naturalWidth) return endIntro();
  img.addEventListener('load', endIntro, { once: true });
  img.addEventListener('error', endIntro, { once: true });
  img.src = IMAGE.src;
}

function buildLeaders() {
  const layer = $('#leaders');
  CALLOUTS.forEach((c, i) => {
    const col = COLUMNS[c.side];
    const [tx, ty] = toStage(c.at);
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
    ring.addEventListener('click', () => openPicker(c.group ? c.group[0].id : c.id));
    leaderEl[c.id] = g;
  });
}

function buildGuides() {
  const layer = $('#guides');
  for (const [axis, guide] of Object.entries(AXIS_GUIDES)) {
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

const HAT_DPAD = { up: 'dpad_up', right: 'dpad_right', down: 'dpad_down', left: 'dpad_left' };

function buildCallouts() {
  const layer = $('#callouts');
  CALLOUTS.forEach((c, i) => {
    const node = htmlEl('div', `callout side-${c.side}`, layer);
    node.dataset.callout = c.id;
    node.style.setProperty('--i', i);
    node.style.top = `${c.y - 11}px`;
    if (c.side === 'left') node.style.right = `${STAGE.width - COLUMNS.left.edge}px`;
    else node.style.left = `${COLUMNS.right.edge}px`;

    const head = htmlEl('div', 'callout-head', node);
    const name = c.group ? model.hats.find((h) => h.id === c.id)?.name ?? 'Hat Switch' : controlInfo(c.id).name;
    htmlEl('span', 'callout-name', head).textContent = name;
    if (c.tag) htmlEl('span', 'callout-tag', head).textContent = c.tag;

    if (c.group) {
      for (const { id, dir } of c.group) {
        const row = htmlEl('div', 'callout-row hat-row', node);
        htmlEl('span', 'hat-icon', row).innerHTML = targetIcon(HAT_DPAD[dir]);
        htmlEl('span', 'hat-label', row).textContent = dir;
        buildChip(id, row);
        liveEl[id] = row;
        calloutOf[id] = c.id;
      }
    } else {
      const axis = model.axes.find((a) => a.id === c.id);
      if (axis) {
        const meter = htmlEl('span', `meter${isCentered(axis, deviceSettings()) ? '' : ' meter-full'}`, head);
        meterEl[c.id] = htmlEl('span', 'meter-fill', meter);
      }
      const row = htmlEl('div', 'callout-row', node);
      buildChip(c.id, row);
      if (axis) buildInv(c.id, row);
      liveEl[c.id] = node;
      calloutOf[c.id] = c.id;
    }

    node.addEventListener('pointerenter', () => setFocus(c.id));
    node.addEventListener('pointerleave', () => setFocus(null));
    calloutEl[c.id] = node;
  });
}

// Hooks the generic layout uses to create chips and register rows.
const genericHooks = {
  chip: buildChip,
  inv: buildInv,
  register(id, row, extras = {}) {
    liveEl[id] = row;
    calloutEl[id] = row;
    calloutOf[id] = id;
    if (extras.meterFill) meterEl[id] = extras.meterFill;
    row.addEventListener('pointerenter', () => setFocus(id));
    row.addEventListener('pointerleave', () => setFocus(null));
  },
  action(parent, label, kind) {
    button('ghost', label, parent, () => (kind === 'copy' ? copyDeviceInfo() : api.reportDevice()));
  },
};

// ─── Focus (hover highlight) ─────────────────────────────────────────────────

function setFocus(id) {
  if (openControl) id = calloutOf[openControl];
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

function renderChip(controlId) {
  const chip = chipEl[controlId];
  if (!chip) return;
  const binding = currentBinding(controlId);
  const target = binding.target ? TARGET_BY_ID[binding.target] : null;
  chip.classList.toggle('is-mapped', Boolean(target));
  chip.innerHTML = target
    ? `<span class="chip-icon">${targetIcon(target.id)}</span><span class="chip-label"></span>${CHEVRON}`
    : `<span class="chip-label"></span>${CHEVRON}`;
  chip.querySelector('.chip-label').textContent = target ? target.name : 'Not mapped';
  chip.setAttribute('aria-label', `${controlInfo(controlId).name}: ${target ? target.name : 'not mapped'}`);

  const inv = invEl[controlId];
  if (inv) {
    inv.disabled = !target;
    inv.setAttribute('aria-pressed', String(binding.invert === true));
    inv.classList.toggle('is-on', binding.invert === true);
  }
}

function renderAllChips() {
  for (const id of Object.keys(chipEl)) renderChip(id);
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
    applySnapshot(await api.setBinding(controlId, { ...currentBinding(controlId), ...patch }));
  } catch (err) {
    showToast(errorText(err));
  }
}

// Electron wraps IPC errors as "Error invoking remote method '…': Error: <message>".
function errorText(err) {
  return String(err?.message ?? err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

// ─── Target picker ───────────────────────────────────────────────────────────

// Other controls already mapped to each target, so doubles are visible.
function usedTargets(exceptId) {
  const used = {};
  for (const [id, binding] of Object.entries(bindings)) {
    if (id !== exceptId && binding.target) (used[binding.target] ??= []).push(controlInfo(id).name);
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
  setFocus(calloutOf[controlId]);
  chipEl[controlId].classList.add('is-open');

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
    const label = htmlEl('label', 'pop-option', options);
    htmlEl('span', 'pop-option-name', label).textContent = 'Deadzone';
    const slider = htmlEl('input', 'slider', label);
    slider.type = 'range';
    slider.min = '0';
    slider.max = String(MAX_DEADZONE * 100);
    slider.step = '1';
    slider.value = String(Math.round(binding.deadzone * 100));
    const value = htmlEl('output', 'pop-option-value', label);
    value.textContent = `${slider.value}%`;
    let timer = null;
    slider.addEventListener('input', () => {
      value.textContent = `${slider.value}%`;
      clearTimeout(timer);
      timer = setTimeout(() => updateBinding(controlId, { deadzone: Number(slider.value) / 100 }), 120);
    });

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

// Opens beside the chip, on whichever side has more room.
function positionPicker(controlId) {
  const chip = chipEl[controlId];
  if (!chip) return;
  const rect = chip.getBoundingClientRect();
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
  const chip = chipEl[openControl];
  chip?.classList.remove('is-open');
  openControl = null;
  popover.hidden = true;
  popover.replaceChildren();
  setFocus(null);
  if (restoreFocus) chip?.focus({ preventScroll: true });
}

popover.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
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

  let presetId = 'blank';
  if (kind === 'new') {
    htmlEl('h3', 'pop-heading', form).textContent = 'Start from';
    const choices = htmlEl('div', 'preset-list', form);
    let typed = false;
    input.addEventListener('input', () => (typed = input.value.trim() !== ''));
    for (const preset of presets) {
      const choice = htmlEl('button', 'preset', choices);
      choice.type = 'button';
      choice.classList.toggle('is-selected', preset.id === presetId);
      htmlEl('span', 'preset-name', choice).textContent = preset.name;
      htmlEl('span', 'preset-note', choice).textContent = preset.description;
      choice.addEventListener('click', () => {
        presetId = preset.id;
        for (const c of choices.children) c.classList.toggle('is-selected', c === choice);
        if (!typed && preset.id !== 'blank') input.value = preset.name;
      });
    }
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
  htmlEl('h3', 'pop-heading', deviceMenu).textContent = 'Joysticks';
  const list = htmlEl('div', 'profile-list', deviceMenu);
  const devices = status?.joystick.devices ?? [];
  if (!devices.length) htmlEl('p', 'menu-empty', list).textContent = 'No joystick detected. Plug one in.';
  for (const d of devices) {
    const current = d.key === model?.key;
    const item = htmlEl('button', 'profile-item', list);
    item.type = 'button';
    item.classList.toggle('is-active', current);
    htmlEl('span', 'profile-check', item).textContent = current ? '●' : '';
    const text = htmlEl('span', 'profile-text', item);
    htmlEl('span', 'profile-item-name', text).textContent = d.name;
    htmlEl('span', 'profile-item-note', text).textContent =
      current && model ? `${model.support === 'full' ? 'Fully supported' : 'Experimental'} · ${d.key}` : d.key;
    item.addEventListener('click', async () => {
      closeMenus();
      if (!current) await api.selectDevice(d.key);
    });
  }
  if (model) {
    const actions = htmlEl('div', 'profile-actions', deviceMenu);
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
  if (openControl && !popover.contains(event.target) && !chipEl[openControl]?.contains(event.target)) {
    closePicker({ restoreFocus: false });
  }
  const inMenus = [profileMenu, deviceMenu, $('#profile-picker'), $('#device-picker')].some((n) => n.contains(event.target));
  if (!inMenus) closeMenus();
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

// A stick's layout signature; the stage is rebuilt only when it changes.
const layoutSignature = (m, settings) =>
  m ? JSON.stringify([m.key, m.skin, m.axes.map((a) => a.id), m.hats.length, m.buttons, settings.centered ?? {}]) : 'none';

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
  stick.dataset.state = connected ? 'connected' : next.joystick.state;
  $('#device-name').textContent = connected ? model.name : next.joystick.state === 'unsupported' ? 'Unsupported' : 'Not detected';
  const support = connected ? ` · ${model.support === 'full' ? 'fully supported' : 'experimental support'}` : '';
  stick.title = next.joystick.message || (connected ? `${model.name} (${model.key})${support}` : 'Plug in a joystick');
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

  const save = $('#save');
  save.hidden = locked;
  save.disabled = !next.dirty;
  save.classList.toggle('is-dirty', next.dirty);
  save.textContent = next.dirty ? 'Save' : 'Saved';
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
  const [x, y] = AXIS_GUIDES[id].point(v);
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
  let hatLive = false;

  for (const id of controlIds()) {
    if (controlKind(id) === 'button') {
      const on = input.buttons[id] === true;
      if (id.startsWith('hat') && on) hatLive = true;
      if (live[id] === on) continue;
      live[id] = on;
      liveEl[id]?.classList.toggle('is-live', on);
      leaderEl[id]?.classList.toggle('is-live', on);
      if (on) reveal(id);
      continue;
    }
    const axis = model.axes.find((a) => a.id === id);
    const v = input.axes[id] ?? 0;
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
  leaderEl.hat1?.classList.toggle('is-live', hatLive);
  drawHud?.(input.axes);
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
