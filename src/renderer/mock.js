// Stand-in for the Electron bridge when the UI is opened in a plain browser.
// The keyboard simulates the joystick so the whole screen can be tried without hardware:
//   W/S pitch · A/D roll · Q/E twist · R/F throttle · arrows = hat
//   Space = trigger · V = thumb · 3–6 = head buttons · 7 8 9 0 - = = base buttons 7–12
import { CONTROL_BY_ID, emptyBindings, sanitizeBinding } from '../shared/controls.js';
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

const KEY_BUTTONS = {
  Space: 'trigger',
  KeyV: 'thumb',
  Digit3: 'b3',
  Digit4: 'b4',
  Digit5: 'b5',
  Digit6: 'b6',
  Digit7: 'b7',
  Digit8: 'b8',
  Digit9: 'b9',
  Digit0: 'b10',
  Minus: 'b11',
  Equal: 'b12',
  ArrowUp: 'hat_up',
  ArrowRight: 'hat_right',
  ArrowDown: 'hat_down',
  ArrowLeft: 'hat_left',
};

const KEY_AXES = {
  KeyW: ['pitch', 1],
  KeyS: ['pitch', -1],
  KeyD: ['roll', 1],
  KeyA: ['roll', -1],
  KeyE: ['yaw', 1],
  KeyQ: ['yaw', -1],
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
  const held = new Set();
  const axes = { ...NEUTRAL_INPUT.axes, throttle: -1 };
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
      joystick: { state: 'connected', name: 'Logitech Extreme 3D Pro (simulated)', message: '' },
      pad: { state: emulating() ? 'connected' : 'off', message: '' },
      profile: { id: p.id, name: p.name, locked: p.locked },
      emulation: emulating(),
      calibrated: true,
      dirty: dirty(),
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
    const target = { pitch: 0, roll: 0, yaw: 0 };
    for (const code of held) {
      const axis = KEY_AXES[code];
      if (axis) target[axis[0]] += axis[1];
    }
    // Springy stick: ease toward the held direction, return to centre when released.
    for (const id of ['pitch', 'roll', 'yaw']) axes[id] += (target[id] - axes[id]) * Math.min(1, dt * 10);
    // Throttle stays where you leave it.
    if (held.has('KeyR')) axes.throttle = Math.min(1, axes.throttle + dt * 1.2);
    if (held.has('KeyF')) axes.throttle = Math.max(-1, axes.throttle - dt * 1.2);

    const buttons = { ...NEUTRAL_INPUT.buttons };
    for (const code of held) if (KEY_BUTTONS[code]) buttons[KEY_BUTTONS[code]] = true;
    const input = { buttons, axes: { ...axes } };
    const output = mapInput(emulating() ? input : NEUTRAL_INPUT, working);
    frameListeners.forEach((cb) => cb({ input, output }));
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  return {
    async init() {
      return { ...snapshot(), presets: PRESETS.map(({ id, name, description }) => ({ id, name, description })), platform: 'preview' };
    },
    async setBinding(controlId, binding) {
      if (isLocked(library.active)) throw new Error('The Default profile can’t be changed');
      const clean = sanitizeBinding(CONTROL_BY_ID[controlId], binding);
      if (!clean) throw new Error(`Invalid binding for ${controlId}`);
      working = { ...working, [controlId]: clean };
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
    async recenter() {
      return true;
    },
    async installDriver() {
      return 'website';
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
