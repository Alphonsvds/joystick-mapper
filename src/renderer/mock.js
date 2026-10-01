// Stand-in for the Electron bridge when the UI is opened in a plain browser.
// Three simulated sticks: the Extreme 3D Pro and the VKB Gladiator NXT EVO (photo layouts)
// and a Thrustmaster T.16000M built from its published layout (universal layout). Add
// ?device=gladiator or ?device=t16000m to start on one of the others.
// Add ?update=9.9.9 to see the "Update available" button.
// The keyboard drives whichever is selected:
//   W/S pitch · A/D roll · Q/E twist · R/F throttle · arrows = hat
//   Space = button 1 · V = button 2 · 3–9, 0 = buttons 3–10 · - = = buttons 11–12
import { sanitizeBinding, emptyBindings } from '../shared/controls.js';
import { describeDevice } from '../shared/devices.js';
import { NEUTRAL_INPUT, mapInput } from '../shared/mapper.js';
import { PRESETS } from '../shared/presets.js';
import {
  addProfile,
  fromExport,
  getProfile,
  isLocked,
  listProfiles,
  normalizeLibrary,
  presetBindings,
  removeProfile,
  renameProfile,
  setActive,
  setBindings,
  toExport,
} from '../shared/profiles.js';

const STORAGE_KEY = 'joymap.preview.library';

const hat = { page: 1, usage: 0x39, min: 0, max: 7 };
const SIMULATED = [
  {
    vendorId: 0x046d,
    productId: 0xc215,
    name: 'Logitech Extreme 3D',
    alias: 'extreme3dpro',
    throttle: 'slider',
    layout: {
      values: [
        { page: 1, usage: 0x31, min: 0, max: 1023 },
        { page: 1, usage: 0x30, min: 0, max: 1023 },
        hat,
        { page: 1, usage: 0x35, min: 0, max: 255 },
        { page: 1, usage: 0x36, min: 0, max: 255 },
      ],
      buttonCount: 12,
    },
  },
  {
    vendorId: 0x044f,
    productId: 0xb10a,
    name: 'Thrustmaster T.16000M',
    alias: 't16000m',
    throttle: 'slider',
    layout: {
      values: [
        { page: 1, usage: 0x30, min: 0, max: 16383 },
        { page: 1, usage: 0x31, min: 0, max: 16383 },
        { page: 1, usage: 0x35, min: 0, max: 255 },
        { page: 1, usage: 0x36, min: 0, max: 255 },
        hat,
      ],
      buttonCount: 16,
    },
  },
  // As reported by a real stick (GitHub issue #1): 128 buttons, and the Slider and Dial
  // axes are spares that rest at their midpoint.
  {
    vendorId: 0x231d,
    productId: 0x0200,
    name: 'VKBsim Gladiator EVO R',
    alias: 'gladiator',
    throttle: 'z',
    layout: {
      values: [
        { page: 1, usage: 0x30, min: 0, max: 4095 },
        { page: 1, usage: 0x31, min: 0, max: 4095 },
        { page: 1, usage: 0x35, min: 0, max: 2047 },
        { page: 1, usage: 0x32, min: 0, max: 2047 },
        { page: 1, usage: 0x33, min: 0, max: 1023 },
        { page: 1, usage: 0x34, min: 0, max: 1023 },
        { page: 1, usage: 0x36, min: 0, max: 2047 },
        { page: 1, usage: 0x37, min: 0, max: 2047 },
        hat,
      ],
      buttonCount: 128,
    },
  },
].map((d) => ({ ...d, model: describeDevice(d.layout, d) }));

const KEY_BUTTONS = {
  Space: 'btn1',
  KeyV: 'btn2',
  Digit3: 'btn3',
  Digit4: 'btn4',
  Digit5: 'btn5',
  Digit6: 'btn6',
  Digit7: 'btn7',
  Digit8: 'btn8',
  Digit9: 'btn9',
  Digit0: 'btn10',
  Minus: 'btn11',
  Equal: 'btn12',
  ArrowUp: 'hat1_up',
  ArrowRight: 'hat1_right',
  ArrowDown: 'hat1_down',
  ArrowLeft: 'hat1_left',
};

const KEY_AXES = {
  KeyW: ['y', 1],
  KeyS: ['y', -1],
  KeyD: ['x', 1],
  KeyA: ['x', -1],
  KeyE: ['rz', 1],
  KeyQ: ['rz', -1],
};

function readStored() {
  try {
    return normalizeLibrary(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch {
    return normalizeLibrary(null);
  }
}

function pickFile() {
  return new Promise((resolve) => {
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = '.json,application/json';
    picker.addEventListener('change', () => resolve(picker.files?.[0] ?? null), { once: true });
    picker.click();
  });
}

export function createMockApi() {
  let library = readStored();
  let working = getProfile(library, library.active).bindings;
  let paused = false;
  const query = new URLSearchParams(location.search);
  const wanted = query.get('device');
  const update = /^\d+\.\d+\.\d+$/.test(query.get('update') ?? '') ? { version: query.get('update') } : null;
  let device = SIMULATED.find((d) => wanted && (d.model.key === wanted || d.alias === wanted)) ?? SIMULATED[0];
  const deviceSettings = {};
  const held = new Set();
  let throttle = -1;
  const axes = { x: 0, y: 0, rz: 0 };
  const frameListeners = new Set();
  const statusListeners = new Set();

  const active = () => getProfile(library, library.active);
  const emulating = () => !isLocked(library.active) && !paused;
  const dirty = () => !isLocked(library.active) && JSON.stringify(working) !== JSON.stringify(active().bindings);
  const persist = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
    } catch {
      // Preview only: nothing to persist to.
    }
  };
  const status = () => {
    const p = active();
    return {
      joystick: {
        state: 'connected',
        message: '',
        device: device.model,
        devices: SIMULATED.map((d) => ({ key: d.model.key, name: `${d.name} (simulated)` })),
        settings: deviceSettings[device.model.key] ?? {},
      },
      pad: { state: emulating() ? 'connected' : 'off', message: '' },
      profile: { id: p.id, name: p.name, locked: p.locked },
      emulation: emulating(),
      dirty: dirty(),
      update,
    };
  };
  const snapshot = () => ({ profiles: listProfiles(library), activeId: library.active, bindings: working, status: status() });
  const emitStatus = () => statusListeners.forEach((cb) => cb(status()));
  const activate = (id) => {
    library = setActive(library, id);
    working = active().bindings;
    paused = false;
    persist();
    emitStatus();
  };
  const settleUnsaved = () => {
    if (!dirty()) return true;
    if (window.confirm(`Save changes to "${active().name}"? (Cancel discards them.)`)) {
      library = setBindings(library, library.active, working);
      persist();
    }
    return true;
  };

  const typing = () => document.activeElement?.matches?.('input, textarea');
  window.addEventListener('keydown', (e) => {
    if (typing() || e.ctrlKey || e.metaKey || e.altKey) return;
    if (KEY_BUTTONS[e.code] || KEY_AXES[e.code] || e.code === 'KeyR' || e.code === 'KeyF') {
      held.add(e.code);
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => held.delete(e.code));
  window.addEventListener('blur', () => held.clear());

  let last = performance.now();
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const target = { x: 0, y: 0, rz: 0 };
    for (const code of held) {
      const axis = KEY_AXES[code];
      if (axis) target[axis[0]] += axis[1];
    }
    // Springy stick: ease toward the held direction, return to centre when released.
    for (const id of ['x', 'y', 'rz']) axes[id] += (target[id] - axes[id]) * Math.min(1, dt * 10);
    // Throttle stays where you leave it.
    if (held.has('KeyR')) throttle = Math.min(1, throttle + dt * 1.2);
    if (held.has('KeyF')) throttle = Math.max(-1, throttle - dt * 1.2);

    const buttons = {};
    for (const code of held) if (KEY_BUTTONS[code]) buttons[KEY_BUTTONS[code]] = true;
    const input = { buttons, axes: { ...axes, [device.throttle]: throttle } };
    const output = mapInput(emulating() ? input : NEUTRAL_INPUT, working);
    frameListeners.forEach((cb) => cb({ input, output }));
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  return {
    async init() {
      return { ...snapshot(), presets: PRESETS.map(({ id, name, description, skin }) => ({ id, name, description, skin })), platform: 'preview' };
    },
    async setBinding(controlId, binding) {
      if (isLocked(library.active)) throw new Error('The Default profile can’t be changed');
      const clean = sanitizeBinding(controlId, binding);
      if (!clean) throw new Error(`Invalid binding for ${controlId}`);
      const { [controlId]: _previous, ...rest } = working;
      working = clean.target === null ? rest : { ...rest, [controlId]: clean };
      emitStatus();
      return snapshot();
    },
    async save() {
      library = setBindings(library, library.active, working);
      working = active().bindings;
      persist();
      emitStatus();
      return snapshot();
    },
    async selectProfile(id) {
      if (id !== library.active && settleUnsaved()) activate(id);
      return snapshot();
    },
    async createProfile({ name, presetId } = {}) {
      settleUnsaved();
      const created = addProfile(library, name, presetBindings(presetId));
      library = created.library;
      activate(created.id);
      return snapshot();
    },
    async renameProfile(id, name) {
      library = renameProfile(library, id, name);
      persist();
      emitStatus();
      return snapshot();
    },
    async resetProfile(id) {
      const p = getProfile(library, id);
      if (!p || p.locked || !window.confirm(`Reset "${p.name}"? Every control goes back to Not mapped.`)) return snapshot();
      library = setBindings(library, id, emptyBindings());
      if (id === library.active) working = active().bindings;
      persist();
      emitStatus();
      return snapshot();
    },
    async deleteProfile(id) {
      const p = getProfile(library, id);
      if (!p || p.locked || !window.confirm(`Delete "${p.name}"?`)) return snapshot();
      const wasActive = id === library.active;
      library = removeProfile(library, id);
      if (wasActive) activate(library.active);
      else persist();
      return snapshot();
    },
    async exportProfile(id) {
      const p = getProfile(library, id);
      if (!p || p.locked) return false;
      const bindings = id === library.active ? working : p.bindings;
      const blob = new Blob([JSON.stringify(toExport({ ...p, bindings }), null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${p.name}.joymap.json`;
      link.click();
      URL.revokeObjectURL(link.href);
      return true;
    },
    async importProfile() {
      const file = await pickFile();
      if (!file) return snapshot();
      let imported = null;
      try {
        imported = fromExport(JSON.parse(await file.text()));
      } catch {
        imported = null;
      }
      if (!imported) throw new Error('That file isn’t a Joystick Mapper profile');
      settleUnsaved();
      const created = addProfile(library, imported.name, imported.bindings);
      library = created.library;
      activate(created.id);
      return snapshot();
    },
    async setEmulation(on) {
      if (!isLocked(library.active)) paused = on !== true;
      emitStatus();
      return snapshot();
    },
    async openControls() {
      window.open('controls.html', 'joymap-controls', 'width=560,height=700');
    },
    async selectDevice(key) {
      device = SIMULATED.find((d) => d.model.key === key) ?? device;
      emitStatus();
      return true;
    },
    async setAxisCentered(axisId, centered) {
      const key = device.model.key;
      deviceSettings[key] = { ...deviceSettings[key], centered: { ...deviceSettings[key]?.centered, [axisId]: centered } };
      emitStatus();
      return true;
    },
    async copyDeviceInfo() {
      await navigator.clipboard?.writeText(JSON.stringify({ simulated: true, device: device.name, layout: device.layout }, null, 2));
      return true;
    },
    async reportDevice() {
      window.open('https://github.com/Alphonsvds/joystick-mapper/issues/new?template=joystick-support.yml', '_blank');
    },
    async recenter() {
      return true;
    },
    async installDriver() {
      return 'website';
    },
    async openUpdate() {
      window.open('https://github.com/Alphonsvds/joystick-mapper/releases/latest', '_blank');
    },
    onFrame(cb) {
      frameListeners.add(cb);
      return () => frameListeners.delete(cb);
    },
    onStatus(cb) {
      statusListeners.add(cb);
      return () => statusListeners.delete(cb);
    },
  };
}
