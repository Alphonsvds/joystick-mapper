import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Extreme3DProParser } from '../src/main/devices/extreme3dpro.js';
import { TARGET_BY_ID, XUSB, emptyBindings, normalizeBindings, sanitizeBinding } from '../src/shared/controls.js';
import { SKINS, describeDevice, hatDirections, normalizeInput } from '../src/shared/devices.js';
import { GAMES } from '../src/shared/games.js';
import { LAYOUTS } from '../src/renderer/layout.js';
import { NEUTRAL_INPUT, mapInput } from '../src/shared/mapper.js';
import { PRESETS } from '../src/shared/presets.js';
import { isNewer, parseVersion, updateFromRelease } from '../src/shared/updates.js';
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

// ─── Layout fixtures ──────────────────────────────────────────────────────────
// Field lists as Windows' HID parser reports them (see src/main/hidp.js).

// Read from a real Extreme 3D Pro through HidP on 2026-09-29.
const EXTREME_LAYOUT = {
  values: [
    { page: 1, usage: 0x31, min: 0, max: 1023 },
    { page: 1, usage: 0x30, min: 0, max: 1023 },
    { page: 1, usage: 0x39, min: 0, max: 7 },
    { page: 1, usage: 0x35, min: 0, max: 255 },
    { page: 1, usage: 0x36, min: 0, max: 255 },
  ],
  buttonCount: 12,
};
const EXTREME = { vendorId: 0x046d, productId: 0xc215, name: 'Logitech Extreme 3D' };

// Thrustmaster T.16000M FCS, from its published specs (not a captured device).
const T16000M_LAYOUT = {
  values: [
    { page: 1, usage: 0x30, min: 0, max: 16383 },
    { page: 1, usage: 0x31, min: 0, max: 16383 },
    { page: 1, usage: 0x35, min: 0, max: 255 },
    { page: 1, usage: 0x36, min: 0, max: 255 },
    { page: 1, usage: 0x39, min: 0, max: 7 },
  ],
  buttonCount: 16,
};
const T16000M = { vendorId: 0x044f, productId: 0xb10a, name: 'Thrustmaster T.16000M' };

// VKB Gladiator NXT EVO (right hand), from an owner's "Copy device info" on 2026-10-01
// (GitHub issue #1). GLADIATOR_REST is the axis part of its last report, stick let go.
const GLADIATOR_LAYOUT = {
  values: [
    { page: 1, usage: 0x30, min: 0, max: 4095 },
    { page: 1, usage: 0x31, min: 0, max: 4095 },
    { page: 1, usage: 0x35, min: 0, max: 2047 },
    { page: 1, usage: 0x32, min: 0, max: 2047 },
    { page: 1, usage: 0x33, min: 0, max: 1023 },
    { page: 1, usage: 0x34, min: 0, max: 1023 },
    { page: 1, usage: 0x36, min: 0, max: 2047 },
    { page: 1, usage: 0x37, min: 0, max: 2047 },
    { page: 1, usage: 0x39, min: 0, max: 7 },
  ],
  buttonCount: 128,
};
const GLADIATOR = { vendorId: 0x231d, productId: 0x0200, name: 'VKB-Sim (C) Alex Oz 2023 VKBsim Gladiator EVO R' };
const GLADIATOR_REST = [2048, 2048, 1024, 1010, 512, 512, 1024, 1024, null];

// Build a raw 8-byte Windows report (leading report ID 0) for the Extreme 3D Pro.
function extremeReport({ x = 512, y = 512, hat = 8, twist = 128, slider = 128, buttons = 0 }) {
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

const decoded = (values, buttons = []) => ({ values, buttons: new Set(buttons) });
const bindingsWith = (raw) => normalizeBindings(raw);
const input = (buttons = {}, axes = {}) => ({ buttons: { ...NEUTRAL_INPUT.buttons, ...buttons }, axes: { ...NEUTRAL_INPUT.axes, ...axes } });

// ─── Reading sticks ───────────────────────────────────────────────────────────

test('the Extreme 3D Pro fallback parser reads a report captured from a real stick', () => {
  const parser = new Extreme3DProParser();
  const { values, buttons } = parser.decode(Buffer.from([0x00, 0x00, 0x22, 0x87, 0x7f, 0x00, 0xff, 0x00]));
  assert.deepEqual(values, [456, 512, 8, 127, 255]); // Y, X, hat, Rz, slider (HidP order)
  assert.equal(buttons.size, 0);
});

test('the fallback parser reads every field at its extremes, with or without the report ID', () => {
  const parser = new Extreme3DProParser();
  const full = parser.decode(extremeReport({ x: 1023, y: 0, hat: 2, twist: 255, slider: 0, buttons: 0b1000_0000_0001 }));
  assert.deepEqual(full.values, [0, 1023, 2, 255, 0]);
  assert.deepEqual([...full.buttons].sort((a, b) => a - b), [1, 12]);
  const short = parser.decode(extremeReport({ x: 0, buttons: 0b10 }).subarray(1));
  assert.equal(short.values[1], 0);
  assert.deepEqual([...short.buttons], [2]);
});

test('a known stick gets its photo skin and friendly names', () => {
  const model = describeDevice(EXTREME_LAYOUT, EXTREME);
  assert.equal(model.key, '046d:c215');
  assert.equal(model.skin, 'extreme3dpro');
  assert.equal(model.support, 'full');
  assert.equal(model.name, 'Logitech Extreme 3D Pro');
  assert.deepEqual(
    model.axes.map((a) => [a.id, a.name]),
    [
      ['y', 'Pitch'],
      ['x', 'Roll'],
      ['rz', 'Yaw'],
      ['slider', 'Throttle'],
    ],
  );
  assert.deepEqual(model.hats.map((h) => h.id), ['hat1']);
  assert.equal(model.buttons, 12);
  assert.equal(model.buttonNames.btn1, 'Trigger');
  assert.equal(model.buttonNames.btn7, 'Button 7');
});

test('the Gladiator NXT EVO gets its skin, with names for the controls it ships with', () => {
  const model = describeDevice(GLADIATOR_LAYOUT, GLADIATOR);
  assert.equal(model.key, '231d:0200');
  assert.equal(model.skin, 'gladiatorevo');
  assert.equal(model.support, 'beta'); // until an owner has confirmed every label
  assert.equal(model.name, 'VKB Gladiator NXT EVO');
  assert.deepEqual(
    model.axes.map((a) => [a.id, a.name]),
    [
      ['x', 'Roll'],
      ['y', 'Pitch'],
      ['rz', 'Yaw'],
      ['z', 'Throttle'],
      ['rx', 'A1 Stick X'],
      ['ry', 'A1 Stick Y'],
      ['slider', 'Slider'],
      ['dial', 'Dial'],
    ],
  );
  assert.deepEqual(model.hats.map((h) => [h.id, h.name]), [['hat1', 'A1 Hat']]);
  // The stick advertises 128 buttons; the factory profile uses the first 29.
  assert.equal(model.buttons, 128);
  assert.equal(model.buttonNames.btn2, 'Trigger Stage 2');
  assert.equal(model.buttonNames.btn10, 'A3 Push');
  assert.equal(model.buttonNames.btn16, 'C1 Up');
  assert.equal(model.buttonNames.btn29, 'F3');
  assert.equal(model.buttonNames.btn30, 'Button 30');
});

test('a Gladiator at rest reads centred, including its two spare axes', () => {
  const model = describeDevice(GLADIATOR_LAYOUT, GLADIATOR);
  const { axes, buttons } = normalizeInput({ values: GLADIATOR_REST, buttons: new Set() }, model);
  for (const id of ['x', 'y', 'rz', 'rx', 'ry', 'slider', 'dial']) assert.ok(Math.abs(axes[id]) < 0.01, `${id} = ${axes[id]}`);
  assert.ok(Math.abs(axes.z) < 0.05); // the throttle lever happened to be near the middle
  assert.equal(Object.values(buttons).some(Boolean), false);
});

test('every photo layout points only at controls its stick has, each one once', () => {
  const sticks = { extreme3dpro: [EXTREME_LAYOUT, EXTREME], gladiatorevo: [GLADIATOR_LAYOUT, GLADIATOR] };
  assert.deepEqual(Object.keys(LAYOUTS).sort(), Object.values(SKINS).map((s) => s.id).sort());
  for (const [skin, layout] of Object.entries(LAYOUTS)) {
    const model = describeDevice(...sticks[skin]);
    const known = new Set([
      ...model.axes.map((a) => a.id),
      ...model.hats.flatMap((h) => ['up', 'right', 'down', 'left'].map((dir) => `${h.id}_${dir}`)),
      ...Object.keys(model.buttonNames),
    ]);
    const shown = layout.callouts.flatMap((c) => (c.group ? c.group.map((item) => item.id) : [c.id]));
    assert.deepEqual(shown.filter((id) => !known.has(id)), [], `${skin}: unknown controls`);
    assert.equal(new Set(shown).size, shown.length, `${skin}: a control is shown twice`);
    for (const axis of Object.keys(layout.guides)) assert.ok(shown.includes(axis), `${skin}: guide for ${axis}`);
  }
  // The Gladiator's photo covers everything the factory profile sends.
  const gladiator = LAYOUTS.gladiatorevo.callouts.flatMap((c) => (c.group ? c.group.map((item) => item.id) : [c.id]));
  for (let b = 1; b <= 29; b++) assert.ok(gladiator.includes(`btn${b}`), `btn${b}`);
});

test('a template is only offered on the stick it was written for', () => {
  const skins = Object.values(SKINS).map((s) => s.id);
  assert.equal(PRESETS.find((p) => p.id === 'blank').skin, undefined);
  for (const preset of PRESETS.filter((p) => p.id !== 'blank')) assert.ok(skins.includes(preset.skin), preset.id);
});

test('an unknown stick is described generically and marked experimental', () => {
  const model = describeDevice(T16000M_LAYOUT, T16000M);
  assert.equal(model.key, '044f:b10a');
  assert.equal(model.skin, null);
  assert.equal(model.support, 'experimental');
  assert.equal(model.name, 'Thrustmaster T.16000M');
  assert.deepEqual(model.axes.map((a) => [a.id, a.centered]), [
    ['x', true],
    ['y', true],
    ['rz', true],
    ['slider', false],
  ]);
  assert.equal(model.buttons, 16);
  assert.equal(model.buttonNames.btn16, 'Button 16');
  // Known sticks can be forced onto the generic layout too.
  assert.equal(describeDevice(EXTREME_LAYOUT, { ...EXTREME, ignoreSkin: true }).skin, null);
});

test('duplicate axes get numbered; vendor data and empty ranges are ignored', () => {
  const model = describeDevice(
    {
      values: [
        { page: 1, usage: 0x36, min: 0, max: 255 },
        { page: 1, usage: 0x36, min: 0, max: 255 },
        { page: 0xff00, usage: 0x01, min: 0, max: 255 }, // vendor-defined
        { page: 1, usage: 0x32, min: 0, max: 0 }, // no range
        { page: 1, usage: 0x39, min: 0, max: 7 },
        { page: 1, usage: 0x39, min: 0, max: 3 },
      ],
      buttonCount: 3,
    },
    { vendorId: 1, productId: 2, name: 'HOTAS' },
  );
  assert.deepEqual(model.axes.map((a) => [a.id, a.name]), [
    ['slider', 'Slider'],
    ['slider2', 'Slider 2'],
  ]);
  assert.deepEqual(model.hats.map((h) => [h.id, h.name]), [
    ['hat1', 'Hat Switch'],
    ['hat2', 'Hat 2'],
  ]);
});

test('rudder pedals (simulation controls) are understood', () => {
  const model = describeDevice(
    {
      values: [
        { page: 2, usage: 0xba, min: 0, max: 1023 },
        { page: 2, usage: 0xc5, min: 0, max: 255 },
      ],
      buttonCount: 0,
    },
    { vendorId: 3, productId: 4, name: 'Pedals' },
  );
  assert.deepEqual(model.axes.map((a) => [a.id, a.centered]), [
    ['rudder', true],
    ['brake', false],
  ]);
});

test('normalised axes follow the gamepad sense on the Extreme 3D Pro', () => {
  const model = describeDevice(EXTREME_LAYOUT, EXTREME);
  const full = normalizeInput(decoded([0, 1023, 8, 255, 0]), model, {});
  assert.deepEqual(full.axes, { y: 1, x: 1, rz: 1, slider: 1 }); // forward, right, twist right, throttle forward
  const back = normalizeInput(decoded([1023, 0, 8, 0, 255]), model, {});
  assert.deepEqual(back.axes, { y: -1, x: -1, rz: -1, slider: -1 });
});

test('a calibrated centre reads zero and both ends still reach full deflection', () => {
  const model = describeDevice(EXTREME_LAYOUT, EXTREME);
  const settings = { calibration: { x: 512, y: 462, rz: 127 } };
  const rest = normalizeInput(decoded([462, 512, 8, 127, 128]), model, settings);
  assert.equal(rest.axes.y, 0);
  assert.equal(rest.axes.x, 0);
  assert.equal(normalizeInput(decoded([0, 512, 8, 127, 0]), model, settings).axes.y, 1);
  assert.equal(normalizeInput(decoded([1023, 512, 8, 127, 0]), model, settings).axes.y, -1);
});

test('an axis can be switched between throttle-style and centred', () => {
  const model = describeDevice(T16000M_LAYOUT, T16000M);
  const values = [8191.5, 8191.5, 127.5, 255, 8];
  assert.equal(normalizeInput(decoded(values), model, {}).axes.slider, -1);
  const centred = normalizeInput(decoded(values), model, { centered: { slider: true } });
  assert.equal(centred.axes.slider, -1); // raw max = back once inverted, either way
  assert.equal(normalizeInput(decoded([0, 0, 0, 127.5, 8]), model, { centered: { slider: true } }).axes.slider, 0);
});

test('signed axis ranges centre on zero', () => {
  const model = describeDevice({ values: [{ page: 1, usage: 0x30, min: -32768, max: 32767 }], buttonCount: 0 }, { vendorId: 5, productId: 6 });
  assert.equal(normalizeInput(decoded([-0.5]), model, {}).axes.x, 0);
  assert.equal(normalizeInput(decoded([32767]), model, {}).axes.x, 1);
  assert.equal(normalizeInput(decoded([-32768]), model, {}).axes.x, -1);
});

test('buttons and hat directions become button controls', () => {
  const model = describeDevice(EXTREME_LAYOUT, EXTREME);
  const state = normalizeInput(decoded([512, 512, 7, 128, 128], [1, 12]), model, {});
  assert.equal(state.buttons.btn1, true);
  assert.equal(state.buttons.btn12, true);
  assert.equal(state.buttons.btn2, false);
  assert.equal(state.buttons.hat1_up, true);
  assert.equal(state.buttons.hat1_left, true);
  assert.equal(state.buttons.hat1_down, false);
});

test('hats: 8-way, 4-way, degrees, and centred', () => {
  assert.deepEqual(hatDirections(0, 0, 7), [true, false, false, false]);
  assert.deepEqual(hatDirections(3, 0, 7), [false, true, true, false]);
  assert.deepEqual(hatDirections(8, 0, 7), [false, false, false, false]);
  assert.deepEqual(hatDirections(null, 0, 7), [false, false, false, false]);
  assert.deepEqual(hatDirections(1, 0, 3), [false, true, false, false]);
  assert.deepEqual(hatDirections(3, 0, 3), [false, false, false, true]);
  assert.deepEqual(hatDirections(1, 1, 8), [true, false, false, false]); // 1-based hats
  assert.deepEqual(hatDirections(270, 0, 315), [false, false, false, true]); // degrees
  assert.deepEqual(hatDirections(-1, 0, 315), [false, false, false, false]);
});

// ─── Mapping ──────────────────────────────────────────────────────────────────

test('maps buttons, hat and stick axes to an XUSB report', () => {
  const p = bindingsWith({
    btn1: { target: 'a' },
    hat1_up: { target: 'dpad_up' },
    btn2: { target: 'rs_up' },
    y: { target: 'ls_y' },
    x: { target: 'ls_x' },
  });
  const out = mapInput(input({ btn1: true, hat1_up: true, btn2: true }, { y: 1, x: -1 }), p);
  assert.equal(out.buttons, XUSB.A | XUSB.DPAD_UP);
  assert.equal(out.ly, 32767);
  assert.equal(out.lx, -32767);
  assert.equal(out.ry, 32767);
});

test('deadzone swallows drift and rescales the rest', () => {
  const p = bindingsWith({ y: { target: 'ls_y', deadzone: 0.1 } });
  assert.equal(mapInput(input({}, { y: 0.08 }), p).ly, 0);
  assert.equal(mapInput(input({}, { y: 1 }), p).ly, 32767);
  assert.equal(mapInput(input({}, { y: 0.55 }), p).ly, Math.round(0.5 * 32767));
});

test('anti-deadzone starts the output past a game deadzone and still reaches full travel', () => {
  const p = bindingsWith({ y: { target: 'ls_y', deadzone: 0.1, antiDeadzone: 0.2 } });
  const ly = (y) => mapInput(input({}, { y }), p).ly;
  // At rest, and inside the stick's own deadzone, nothing is sent.
  assert.equal(ly(0), 0);
  assert.equal(ly(0.08), 0);
  // The smallest real movement already clears 20%, in either direction.
  assert.ok(ly(0.11) > 0.2 * 32767 && ly(0.11) < 0.22 * 32767, `${ly(0.11)}`);
  assert.equal(ly(-0.11), -ly(0.11));
  // Halfway through the remaining travel lands halfway between 20% and 100%.
  assert.equal(ly(0.55), Math.round(0.6 * 32767));
  assert.equal(ly(1), 32767);
  assert.equal(ly(-1), -32767);
});

test('anti-deadzone also lifts triggers, and is off unless set', () => {
  const single = bindingsWith({ slider: { target: 'rt', deadzone: 0, antiDeadzone: 0.2 } });
  assert.equal(mapInput(input({}, { slider: -1 }), single).rt, 0);
  assert.equal(mapInput(input({}, { slider: 0 }), single).rt, Math.round(0.6 * 255));
  assert.equal(mapInput(input({}, { slider: 1 }), single).rt, 255);

  const split = bindingsWith({ slider: { target: 'lt_rt', deadzone: 0, antiDeadzone: 0.2 } });
  assert.deepEqual([mapInput(input({}, { slider: 0 }), split).lt, mapInput(input({}, { slider: 0 }), split).rt], [0, 0]);
  assert.deepEqual([mapInput(input({}, { slider: 0.5 }), split).lt, mapInput(input({}, { slider: 0.5 }), split).rt], [0, Math.round(0.6 * 255)]);
  assert.deepEqual([mapInput(input({}, { slider: -0.5 }), split).lt, mapInput(input({}, { slider: -0.5 }), split).rt], [Math.round(0.6 * 255), 0]);

  // Without the setting an axis maps exactly as before.
  const plain = bindingsWith({ y: { target: 'ls_y', deadzone: 0.1 } });
  assert.equal(plain.y.antiDeadzone, undefined);
  assert.equal(mapInput(input({}, { y: 0.55 }), plain).ly, Math.round(0.5 * 32767));
});

test('anti-deadzone is clamped, dropped at zero, and not kept for button-style outputs', () => {
  assert.equal(sanitizeBinding('x', { target: 'ls_x', antiDeadzone: 0.9 }).antiDeadzone, 0.5);
  assert.equal('antiDeadzone' in sanitizeBinding('x', { target: 'ls_x', antiDeadzone: 0 }), false);
  assert.equal('antiDeadzone' in sanitizeBinding('x', { target: 'ls_x', antiDeadzone: 'lots' }), false);
  assert.equal('antiDeadzone' in sanitizeBinding('rz', { target: 'lb_rb', antiDeadzone: 0.2 }), false);
  assert.equal('antiDeadzone' in sanitizeBinding('x', { target: null, antiDeadzone: 0.2 }), false);
  // It survives a save / export round trip.
  const p = { name: 'P', bindings: bindingsWith({ x: { target: 'ls_x', antiDeadzone: 0.2 } }) };
  assert.equal(fromExport(toExport(p)).bindings.x.antiDeadzone, 0.2);
});

test('invert flips an axis', () => {
  const p = bindingsWith({ y: { target: 'ls_y', invert: true } });
  assert.equal(mapInput(input({}, { y: 1 }), p).ly, -32767);
});

test('throttle split drives LT on the back half and RT on the front half', () => {
  const p = bindingsWith({ slider: { target: 'lt_rt', deadzone: 0 } });
  assert.deepEqual([mapInput(input({}, { slider: -1 }), p).lt, mapInput(input({}, { slider: -1 }), p).rt], [255, 0]);
  assert.deepEqual([mapInput(input({}, { slider: 1 }), p).lt, mapInput(input({}, { slider: 1 }), p).rt], [0, 255]);
  assert.equal(mapInput(input({}, { slider: 0 }), p).rt, 0);
});

test('an axis on a single trigger uses its full travel', () => {
  const p = bindingsWith({ slider: { target: 'rt', deadzone: 0 } });
  assert.equal(mapInput(input({}, { slider: -1 }), p).rt, 0);
  assert.equal(mapInput(input({}, { slider: 0 }), p).rt, 128);
  assert.equal(mapInput(input({}, { slider: 1 }), p).rt, 255);
});

test('twist past halfway presses a bumper', () => {
  const p = bindingsWith({ rz: { target: 'lb_rb' } });
  assert.equal(mapInput(input({}, { rz: 0.3 }), p).buttons, 0);
  assert.equal(mapInput(input({}, { rz: 0.9 }), p).buttons, XUSB.RIGHT_SHOULDER);
  assert.equal(mapInput(input({}, { rz: -0.9 }), p).buttons, XUSB.LEFT_SHOULDER);
});

test('L3 + R3 presses both stick clicks from one button', () => {
  const p = bindingsWith({ btn6: { target: 'ls_rs_click' } });
  assert.equal(mapInput(input({ btn6: true }), p).buttons, XUSB.LEFT_THUMB | XUSB.RIGHT_THUMB);
  assert.equal(mapInput(input({ btn6: false }), p).buttons, 0);
  assert.equal(presetBindings('ace-combat-8').btn2.target, 'ls_rs_click');
});

test('LT + RT pulls both triggers fully from one button', () => {
  const p = bindingsWith({ btn6: { target: 'lt_rt_both' } });
  const pressed = mapInput(input({ btn6: true }), p);
  assert.deepEqual([pressed.lt, pressed.rt], [255, 255]);
  const released = mapInput(input({ btn6: false }), p);
  assert.deepEqual([released.lt, released.rt], [0, 0]);
  // Axes can't drive it: it is a button-only combo.
  assert.equal(normalizeBindings({ slider: { target: 'lt_rt_both' } }).slider, undefined);
});

test('LB + RB presses both bumpers from one button', () => {
  const p = bindingsWith({ btn6: { target: 'lb_rb_both' } });
  assert.equal(mapInput(input({ btn6: true }), p).buttons, XUSB.LEFT_SHOULDER | XUSB.RIGHT_SHOULDER);
  assert.equal(mapInput(input({ btn6: false }), p).buttons, 0);
  assert.equal(normalizeBindings({ slider: { target: 'lb_rb_both' } }).slider, undefined);
});

test('the Ace Combat 8 preset keeps every binding and matches the controls window', () => {
  const preset = PRESETS.find((p) => p.id === 'ace-combat-8');
  // Nothing is dropped by validation.
  assert.deepEqual(Object.keys(presetBindings('ace-combat-8')).sort(), Object.keys(preset.bindings).sort());

  const b = presetBindings('ace-combat-8');
  // Squad commands are on the D-pad buttons; the hat is the camera (right stick).
  assert.deepEqual(
    [b.btn7, b.btn8, b.btn9, b.btn10].map((x) => x.target),
    ['dpad_up', 'dpad_down', 'dpad_left', 'dpad_right'],
  );
  assert.deepEqual(
    [b.hat1_up, b.hat1_right, b.hat1_down, b.hat1_left].map((x) => x.target),
    ['rs_up', 'rs_right', 'rs_down', 'rs_left'],
  );

  const ac8 = GAMES.find((g) => g.id === 'ace-combat-8');
  const rows = Object.fromEntries(ac8.sections.flatMap((s) => s.controls).map((c) => [c.action, c.target]));
  assert.deepEqual(
    [rows['Camera up'], rows['Camera left'], rows['Camera down'], rows['Camera right']],
    ['rs_up', 'rs_left', 'rs_down', 'rs_right'],
  );
  assert.deepEqual(
    [rows['Forward attack'], rows['Disp. atk.'], rows['SP weapons on/off'], rows['Cover']],
    ['dpad_up', 'dpad_left', 'dpad_right', 'dpad_down'],
  );
});

test('every controls-window row points at a real Xbox output', () => {
  for (const game of GAMES) {
    for (const section of game.sections) {
      assert.ok(section.title && section.controls.length, `${game.id}: empty section`);
      for (const { action, target } of section.controls) assert.ok(TARGET_BY_ID[target], `${action} → ${target}`);
    }
  }
});

test('opposite D-pad directions cancel out', () => {
  const p = bindingsWith({ btn7: { target: 'dpad_up' }, btn8: { target: 'dpad_down' } });
  assert.equal(mapInput(input({ btn7: true, btn8: true }), p).buttons, 0);
});

test('bindings for controls a stick lacks are simply ignored', () => {
  const p = bindingsWith({ btn30: { target: 'a' }, dial: { target: 'rs_x' } });
  assert.deepEqual(mapInput(input({ btn1: true }, { x: 1 }), p), mapInput(NEUTRAL_INPUT, {}));
});

test('bindings are validated against the control kind', () => {
  assert.equal(sanitizeBinding('btn1', { target: 'ls_x' }), null);
  assert.equal(sanitizeBinding('btn1', { target: 'nope' }), null);
  assert.equal(sanitizeBinding('Bad Id!', { target: 'a' }), null);
  assert.deepEqual(sanitizeBinding('btn1', { target: 'lt' }), { target: 'lt' });
  assert.deepEqual(sanitizeBinding('hat2_left', { target: 'dpad_left' }), { target: 'dpad_left' });
  assert.deepEqual(sanitizeBinding('slider', { target: 'lt', invert: 'yes', deadzone: 9 }), {
    target: 'lt',
    invert: false,
    deadzone: 0.5,
  });
});

test('damaged bindings fall back to unmapped, keeping valid entries', () => {
  assert.deepEqual(normalizeBindings('garbage'), emptyBindings());
  const b = normalizeBindings({ btn1: { target: 'a' }, btn2: { target: 'ls_x' }, 'no good': { target: 'a' } });
  assert.deepEqual(Object.keys(b), ['btn1']);
});

// ─── Profiles ─────────────────────────────────────────────────────────────────

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
  assert.equal(getProfile(lib, id).bindings.slider.target, 'lt_rt');
  assert.equal(getProfile(lib, id).bindings.rz.target, 'lb_rb');

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

test('profiles saved before universal support are migrated to generic control IDs', () => {
  const lib = normalizeLibrary({
    version: 2,
    active: 'p-1',
    profiles: [
      {
        id: 'p-1',
        name: 'AC8',
        bindings: {
          trigger: { target: 'b' },
          b6: { target: 'rs_click' },
          hat_up: { target: 'rs_up' },
          pitch: { target: 'ls_y', invert: false, deadzone: 0.04 },
          throttle: { target: 'lt_rt', invert: false, deadzone: 0.02 },
          thumb: { target: null },
        },
      },
    ],
  });
  assert.equal(lib.active, 'p-1');
  assert.deepEqual(getProfile(lib, 'p-1').bindings, {
    btn1: { target: 'b' },
    btn6: { target: 'rs_click' },
    hat1_up: { target: 'rs_up' },
    y: { target: 'ls_y', invert: false, deadzone: 0.04 },
    slider: { target: 'lt_rt', invert: false, deadzone: 0.02 },
  });
});

test('export → import round-trips a profile, migrates old files and rejects others', () => {
  const { library, id } = addProfile(normalizeLibrary(null), 'AC8', presetBindings('ace-combat-8'));
  const file = JSON.parse(JSON.stringify(toExport(getProfile(library, id))));
  const back = fromExport(file);
  assert.equal(back.name, 'AC8');
  assert.deepEqual(back.bindings, getProfile(library, id).bindings);

  const old = fromExport({ format: 'joystick-mapper/profile', version: 1, name: 'Old', bindings: { trigger: { target: 'a' } } });
  assert.deepEqual(old.bindings, { btn1: { target: 'a' } });

  assert.equal(fromExport({ bindings: {} }), null);
  assert.equal(fromExport('nope'), null);
});

test('a damaged library on disk keeps the good profiles', () => {
  const lib = normalizeLibrary({
    version: 3,
    active: 'p-2',
    profiles: [{ id: 'p-1', name: 'Good', bindings: {} }, { id: 'bad id!', name: 'x' }, { id: 'p-3', name: '' }, 'junk'],
  });
  assert.deepEqual(
    lib.profiles.map((p) => p.id),
    ['p-1'],
  );
  assert.equal(lib.active, DEFAULT_PROFILE_ID); // p-2 doesn't exist
});

// ─── Updates ──────────────────────────────────────────────────────────────────

test('versions compare numerically, with or without the leading v', () => {
  assert.deepEqual(parseVersion('v0.2.5'), [0, 2, 5]);
  assert.deepEqual(parseVersion('1.10.0'), [1, 10, 0]);
  assert.equal(parseVersion('0.2'), null);
  assert.equal(parseVersion('v1.0.0-beta.1'), null);
  assert.equal(isNewer('v0.2.6', '0.2.5'), true);
  assert.equal(isNewer('0.10.0', '0.9.9'), true);
  assert.equal(isNewer('1.0.0', '0.99.99'), true);
  assert.equal(isNewer('0.2.5', '0.2.5'), false);
  assert.equal(isNewer('0.2.4', '0.2.5'), false);
  assert.equal(isNewer('nonsense', '0.2.5'), false);
});

test('an update is offered only for a newer, published release', () => {
  assert.deepEqual(updateFromRelease({ tag_name: 'v0.2.6' }, '0.2.5'), {
    version: '0.2.6',
    url: 'https://github.com/Alphonsvds/joystick-mapper/releases/tag/v0.2.6',
  });
  assert.equal(updateFromRelease({ tag_name: 'v0.2.5' }, '0.2.5'), null);
  assert.equal(updateFromRelease({ tag_name: 'v0.2.4' }, '0.2.5'), null);
  assert.equal(updateFromRelease({ tag_name: 'v0.3.0', prerelease: true }, '0.2.5'), null);
  assert.equal(updateFromRelease({ tag_name: 'v0.3.0', draft: true }, '0.2.5'), null);
  // A rate-limit or error body, or no body at all, is simply "no update".
  assert.equal(updateFromRelease({ message: 'API rate limit exceeded' }, '0.2.5'), null);
  assert.equal(updateFromRelease(null, '0.2.5'), null);
  // The link never comes from the response.
  const odd = updateFromRelease({ tag_name: 'v0.2.6', html_url: 'https://example.com/evil' }, '0.2.5');
  assert.equal(odd.url, 'https://github.com/Alphonsvds/joystick-mapper/releases/tag/v0.2.6');
});
