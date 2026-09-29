import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXTREME_3D_PRO, normalizeAxes } from '../src/main/devices/extreme3dpro.js';
import { XUSB, emptyBindings, normalizeBindings, sanitizeBinding, CONTROL_BY_ID } from '../src/shared/controls.js';
import { NEUTRAL_INPUT, mapInput } from '../src/shared/mapper.js';
import {
  DEFAULT_PROFILE_ID,
  addProfile,
  fromExport,
  getProfile,
  listProfiles,
  normalizeLibrary,
  presetBindings,
  removeProfile,
  renameProfile,
  setActive,
  setBindings,
  toExport,
} from '../src/shared/profiles.js';

// Build a raw 8-byte Windows report (leading report ID 0) from field values.
function report({ x = 512, y = 512, hat = 8, twist = 128, slider = 128, buttons = 0 }) {
  const b = Buffer.alloc(8);
  b[1] = x & 0xff;
  b[2] = ((x >> 8) & 0x03) | ((y & 0x3f) << 2);
  b[3] = ((y >> 6) & 0x0f) | ((hat & 0x0f) << 4);
  b[4] = twist;
  b[5] = buttons & 0xff;
  b[6] = slider;
  b[7] = (buttons >> 8) & 0x0f;
  return b;
}

function bindingsWith(overrides) {
  const b = emptyBindings();
  for (const [id, patch] of Object.entries(overrides)) b[id] = { ...b[id], ...patch };
  return b;
}

const input = (buttons = {}, axes = {}) => ({
  buttons: { ...NEUTRAL_INPUT.buttons, ...buttons },
  axes: { ...NEUTRAL_INPUT.axes, ...axes },
});

test('parses a report captured from a real Extreme 3D Pro at rest', () => {
  const s = EXTREME_3D_PRO.parse(Buffer.from([0x00, 0x00, 0x22, 0x87, 0x7f, 0x00, 0xff, 0x00]));
  assert.deepEqual(s.raw, { roll: 512, pitch: 456, yaw: 127, throttle: 255 });
  assert.equal(Object.values(s.buttons).some(Boolean), false);
});

test('parses every field at its extremes', () => {
  const s = EXTREME_3D_PRO.parse(report({ x: 1023, y: 0, hat: 2, twist: 255, slider: 0, buttons: 0b1000_0000_0001 }));
  assert.deepEqual(s.raw, { roll: 1023, pitch: 0, yaw: 255, throttle: 0 });
  assert.equal(s.buttons.trigger, true);
  assert.equal(s.buttons.b12, true);
  assert.equal(s.buttons.thumb, false);
  assert.equal(s.buttons.hat_right, true);
  assert.equal(s.buttons.hat_up, false);
});

test('accepts the 7-byte report without a report ID (macOS / hidapi)', () => {
  const s = EXTREME_3D_PRO.parse(report({ x: 0, buttons: 0b10 }).subarray(1));
  assert.equal(s.raw.roll, 0);
  assert.equal(s.buttons.thumb, true);
});

test('hat diagonals press two directions', () => {
  const s = EXTREME_3D_PRO.parse(report({ hat: 7 }));
  assert.equal(s.buttons.hat_up, true);
  assert.equal(s.buttons.hat_left, true);
  assert.equal(s.buttons.hat_down, false);
});

test('normalises axes into the gamepad sense', () => {
  const full = normalizeAxes(EXTREME_3D_PRO, { roll: 1023, pitch: 0, yaw: 255, throttle: 0 }, null);
  assert.deepEqual(full, { roll: 1, pitch: 1, yaw: 1, throttle: 1 });
  const back = normalizeAxes(EXTREME_3D_PRO, { roll: 0, pitch: 1023, yaw: 0, throttle: 255 }, null);
  assert.deepEqual(back, { roll: -1, pitch: -1, yaw: -1, throttle: -1 });
});

test('calibrated centre reads zero and both ends still reach full deflection', () => {
  const cal = { roll: 512, pitch: 462, yaw: 127 };
  const rest = normalizeAxes(EXTREME_3D_PRO, { roll: 512, pitch: 462, yaw: 127, throttle: 128 }, cal);
  assert.equal(rest.pitch, 0);
  assert.equal(rest.roll, 0);
  assert.equal(normalizeAxes(EXTREME_3D_PRO, { roll: 512, pitch: 0, yaw: 127, throttle: 0 }, cal).pitch, 1);
  assert.equal(normalizeAxes(EXTREME_3D_PRO, { roll: 512, pitch: 1023, yaw: 127, throttle: 0 }, cal).pitch, -1);
});

test('maps buttons, hat and stick axes to an XUSB report', () => {
  const p = bindingsWith({
    trigger: { target: 'a' },
    hat_up: { target: 'dpad_up' },
    thumb: { target: 'rs_up' },
    pitch: { target: 'ls_y' },
    roll: { target: 'ls_x' },
  });
  const out = mapInput(input({ trigger: true, hat_up: true, thumb: true }, { pitch: 1, roll: -1 }), p);
  assert.equal(out.buttons, XUSB.A | XUSB.DPAD_UP);
  assert.equal(out.ly, 32767);
  assert.equal(out.lx, -32767);
  assert.equal(out.ry, 32767);
});

test('deadzone swallows drift and rescales the rest', () => {
  const p = bindingsWith({ pitch: { target: 'ls_y', deadzone: 0.1 } });
  assert.equal(mapInput(input({}, { pitch: 0.08 }), p).ly, 0);
  assert.equal(mapInput(input({}, { pitch: 1 }), p).ly, 32767);
  assert.equal(mapInput(input({}, { pitch: 0.55 }), p).ly, Math.round(0.5 * 32767));
});

test('invert flips an axis', () => {
  const p = bindingsWith({ pitch: { target: 'ls_y', invert: true } });
  assert.equal(mapInput(input({}, { pitch: 1 }), p).ly, -32767);
});

test('throttle split drives LT on the back half and RT on the front half', () => {
  const p = bindingsWith({ throttle: { target: 'lt_rt', deadzone: 0 } });
  assert.deepEqual([mapInput(input({}, { throttle: -1 }), p).lt, mapInput(input({}, { throttle: -1 }), p).rt], [255, 0]);
  assert.deepEqual([mapInput(input({}, { throttle: 1 }), p).lt, mapInput(input({}, { throttle: 1 }), p).rt], [0, 255]);
  assert.equal(mapInput(input({}, { throttle: 0 }), p).rt, 0);
});

test('an axis on a single trigger uses its full travel', () => {
  const p = bindingsWith({ throttle: { target: 'rt', deadzone: 0 } });
  assert.equal(mapInput(input({}, { throttle: -1 }), p).rt, 0);
  assert.equal(mapInput(input({}, { throttle: 0 }), p).rt, 128);
  assert.equal(mapInput(input({}, { throttle: 1 }), p).rt, 255);
});

test('twist past halfway presses a bumper', () => {
  const p = bindingsWith({ yaw: { target: 'lb_rb' } });
  assert.equal(mapInput(input({}, { yaw: 0.3 }), p).buttons, 0);
  assert.equal(mapInput(input({}, { yaw: 0.9 }), p).buttons, XUSB.RIGHT_SHOULDER);
  assert.equal(mapInput(input({}, { yaw: -0.9 }), p).buttons, XUSB.LEFT_SHOULDER);
});

test('L3 + R3 presses both stick clicks from one button', () => {
  const p = bindingsWith({ b6: { target: 'ls_rs_click' } });
  assert.equal(mapInput(input({ b6: true }), p).buttons, XUSB.LEFT_THUMB | XUSB.RIGHT_THUMB);
  assert.equal(mapInput(input({ b6: false }), p).buttons, 0);
  assert.equal(presetBindings('ace-combat-8').b6.target, 'ls_rs_click');
});

test('opposite D-pad directions cancel out', () => {
  const p = bindingsWith({ b7: { target: 'dpad_up' }, b8: { target: 'dpad_down' } });
  assert.equal(mapInput(input({ b7: true, b8: true }), p).buttons, 0);
});

test('bindings are validated against the control kind', () => {
  assert.equal(sanitizeBinding(CONTROL_BY_ID.trigger, { target: 'ls_x' }), null);
  assert.equal(sanitizeBinding(CONTROL_BY_ID.trigger, { target: 'nope' }), null);
  assert.deepEqual(sanitizeBinding(CONTROL_BY_ID.trigger, { target: 'lt' }), { target: 'lt' });
  assert.deepEqual(sanitizeBinding(CONTROL_BY_ID.throttle, { target: 'lt', invert: 'yes', deadzone: 9 }), {
    target: 'lt',
    invert: false,
    deadzone: 0.5,
  });
});

test('damaged bindings fall back to unmapped, keeping valid entries', () => {
  assert.deepEqual(normalizeBindings('garbage'), emptyBindings());
  const b = normalizeBindings({ trigger: { target: 'a' }, thumb: { target: 'ls_x' }, extra: {} });
  assert.equal(b.trigger.target, 'a');
  assert.equal(b.thumb.target, null);
  assert.equal('extra' in b, false);
});

test('the Default profile is always present, locked and unmapped', () => {
  const lib = normalizeLibrary(null);
  assert.equal(lib.active, DEFAULT_PROFILE_ID);
  assert.deepEqual(listProfiles(lib), [{ id: 'default', name: 'Default', locked: true }]);
  assert.deepEqual(getProfile(lib, 'default').bindings, emptyBindings());
  assert.equal(renameProfile(lib, 'default', 'Mine'), lib);
  assert.equal(removeProfile(lib, 'default'), lib);
  assert.equal(setBindings(lib, 'default', presetBindings('ace-combat-8')), lib);
});

test('profiles can be created from a preset, renamed, switched and deleted', () => {
  let { library: lib, id } = addProfile(normalizeLibrary(null), '  Ace   Combat 8 ', presetBindings('ace-combat-8'));
  assert.equal(getProfile(lib, id).name, 'Ace Combat 8');
  assert.equal(getProfile(lib, id).bindings.throttle.target, 'lt_rt');
  assert.equal(getProfile(lib, id).bindings.yaw.target, 'lb_rb');

  // Names stay unique (case-insensitively).
  const second = addProfile(lib, 'ace combat 8', {});
  assert.equal(getProfile(second.library, second.id).name, 'ace combat 8 (2)');

  lib = setActive(renameProfile(lib, id, 'AC8'), id);
  assert.equal(getProfile(lib, lib.active).name, 'AC8');
  lib = removeProfile(lib, id);
  assert.equal(lib.active, DEFAULT_PROFILE_ID);
  assert.equal(lib.profiles.length, 0);
});

test('a reserved name is suffixed rather than shadowing Default', () => {
  const { library, id } = addProfile(normalizeLibrary(null), 'Default', {});
  assert.equal(getProfile(library, id).name, 'Default (2)');
});

test('export → import round-trips a profile and rejects other files', () => {
  const { library, id } = addProfile(normalizeLibrary(null), 'AC8', presetBindings('ace-combat-8'));
  const file = JSON.parse(JSON.stringify(toExport(getProfile(library, id))));
  const back = fromExport(file);
  assert.equal(back.name, 'AC8');
  assert.deepEqual(back.bindings, getProfile(library, id).bindings);
  assert.equal(fromExport({ bindings: {} }), null);
  assert.equal(fromExport('nope'), null);
});

test('a damaged library on disk keeps the good profiles', () => {
  const lib = normalizeLibrary({
    active: 'p-2',
    profiles: [{ id: 'p-1', name: 'Good', bindings: {} }, { id: 'bad id!', name: 'x' }, { id: 'p-3', name: '' }, 'junk'],
  });
  assert.deepEqual(
    lib.profiles.map((p) => p.id),
    ['p-1'],
  );
  assert.equal(lib.active, DEFAULT_PROFILE_ID); // p-2 doesn't exist
});
