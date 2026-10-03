import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Extreme3DProParser } from '../src/main/devices/extreme3dpro.js';
import {
  TARGET_BY_ID,
  XUSB,
  controlKind,
  emptyBindings,
  normalizeBindings,
  sanitizeBinding,
  splitControlId,
} from '../src/shared/controls.js';
import { SKINS, assignRoles, describeDevice, deviceKey, guessRole, hatDirections, mergeInputs, normalizeInput } from '../src/shared/devices.js';
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

// VKB STECS Modern Throttle Standard (STEM), from an owner's "Copy device info" on
// 2026-10-02 (GitHub issue #2). The two throttle levers are the 12-bit X and Y axes.
// STECS_REST is the axis part of its last report, both levers at idle.
const STECS_LAYOUT = {
  values: [
    { page: 1, usage: 0x30, min: 0, max: 4095 },
    { page: 1, usage: 0x31, min: 0, max: 4095 },
    { page: 1, usage: 0x32, min: 0, max: 1023 },
    { page: 1, usage: 0x33, min: 0, max: 1023 },
    { page: 1, usage: 0x34, min: 0, max: 1023 },
    { page: 1, usage: 0x35, min: 0, max: 1023 },
    { page: 1, usage: 0x36, min: 0, max: 1023 },
    { page: 1, usage: 0x36, min: 0, max: 1023 },
    { page: 1, usage: 0x39, min: 0, max: 7 },
  ],
  buttonCount: 128,
};
const STECS = { vendorId: 0x231d, productId: 0x012d, name: 'VKB-Sim (C) Alex Oz 2023 S-TECS MODERN THROTTLE STANDARD STEM' };
const STECS_REST = [0, 0, 0, 512, 512, 512, 512, 511, null];

// Turtle Beach VelocityOne Flightstick, from an owner's "Copy device info" on 2026-10-02
// (GitHub issue #3). The twist is on Z; the levers are on Rz (left) and Dial (right).
// FLIGHTSTICK_REST is the axis part of its last report, taking the report to pack them
// X, Y, Z, Rx, Ry, Rz, Slider, Dial: stick and ministick centred, left lever part way up.
const FLIGHTSTICK_LAYOUT = {
  values: [
    { page: 1, usage: 0x30, min: 0, max: 65535 },
    { page: 1, usage: 0x31, min: 0, max: 65535 },
    { page: 1, usage: 0x37, min: 0, max: 65535 },
    { page: 1, usage: 0x36, min: 0, max: 65535 },
    { page: 1, usage: 0x35, min: 0, max: 65535 },
    { page: 1, usage: 0x34, min: 0, max: 65535 },
    { page: 1, usage: 0x33, min: 0, max: 65535 },
    { page: 1, usage: 0x32, min: 0, max: 65535 },
    { page: 1, usage: 0x39, min: 1, max: 8 },
    { page: 255, usage: 2, min: 0, max: 255 },
  ],
  buttonCount: 24,
};
const FLIGHTSTICK = { vendorId: 0x10f5, productId: 0x7055, name: 'Turtle Beach VelocityOne Flightstick' };
// x, y, dial, slider, rz, ry, rx, z, hat, vendor byte
const FLIGHTSTICK_REST = [0x8000, 0x8000, 0, 0, 0x98c0, 0x7fff, 0x7fff, 0x8000, 0, 0];

// A WINWING Orion 2 stick and throttle and Virpil ACE-Torq pedals, from one owner's "Copy
// device info" (GitHub issue #7). Each *_REST is the axis part of that device's last
// report and *_HELD the buttons it had down, taking the report to pack them in this order.
// Stick: hat, x, y, rx, ry, rz, slider, vendor byte. Both levers on the grip rest at 0.
const ORION_STICK_LAYOUT = {
  values: [
    { page: 1, usage: 0x39, min: 0, max: 7 },
    { page: 1, usage: 0x30, min: 0, max: 65535 },
    { page: 1, usage: 0x31, min: 0, max: 65535 },
    { page: 1, usage: 0x33, min: 0, max: 4095 },
    { page: 1, usage: 0x34, min: 0, max: 4095 },
    { page: 1, usage: 0x35, min: 0, max: 4095 },
    { page: 1, usage: 0x36, min: 0, max: 4095 },
    { page: 255, usage: 1, min: 0, max: 255 },
  ],
  buttonCount: 42,
};
const ORION_STICK = { vendorId: 0x4098, productId: 0xbea8, name: 'WINWING Orion Joystick Base 2 + JGRIP-F16' };
const ORION_STICK_REST = [15, 0x8000, 0x8000, 0x800, 0x800, 0, 0, 0];
const ORION_STICK_HELD = [2, 7];

// Throttle: x, y, z, rx, ry, rz, slider, dial, vendor byte. The throttle levers are on Rx
// (right) and Ry (left), side by side part way up; every switch on the base holds a button.
const ORION_THROTTLE_LAYOUT = {
  values: [
    { page: 1, usage: 0x30, min: 0, max: 4095 },
    { page: 1, usage: 0x31, min: 0, max: 4095 },
    { page: 1, usage: 0x32, min: 0, max: 4095 },
    { page: 1, usage: 0x33, min: 0, max: 65535 },
    { page: 1, usage: 0x34, min: 0, max: 65535 },
    { page: 1, usage: 0x35, min: 0, max: 65535 },
    { page: 1, usage: 0x36, min: 0, max: 65535 },
    { page: 1, usage: 0x37, min: 0, max: 65535 },
    { page: 255, usage: 1, min: 0, max: 255 },
  ],
  buttonCount: 128,
};
const ORION_THROTTLE = { vendorId: 0x4098, productId: 0xbd64, name: 'WINWING Orion Throttle Base II + F15EX HANDLE L + F15EX HANDLE R' };
const ORION_THROTTLE_REST = [2035, 1856, 2048, 29211, 30015, 37929, 59154, 65535, 0];
const ORION_THROTTLE_HELD = [4, 23, 30, 31, 58, 66, 67, 69, 73, 76, 78, 87, 90, 94];

// Pedals: z, x, y. The rudder is on Z; X and Y are not connected and sit at 0.
const ACE_TORQ_LAYOUT = {
  values: [
    { page: 1, usage: 0x32, min: 0, max: 60000 },
    { page: 1, usage: 0x30, min: 0, max: 60000 },
    { page: 1, usage: 0x31, min: 0, max: 60000 },
  ],
  buttonCount: 0,
};
const ACE_TORQ = { vendorId: 0x3344, productId: 0x01f9, name: 'VIRPIL Controls 20220720 VPC ACE-Torq Rudder' };
const ACE_TORQ_REST = [0x7656, 0, 0];

// A Thrustmaster Sol-R pair, from one owner's "Copy device info" (GitHub issue #8): two
// sticks with the same 44 buttons and the same axes, in this order: hat, dial, slider, rx,
// ry, rz, z, y, x, vendor byte. SOL_R_REST is the right stick's last report: everything on
// the middle but the thrust lever on Rx, part way up (the left stick's lever was at 0), and
// the base's rotary on its first position (button 20).
const SOL_R_LAYOUT = {
  values: [
    { page: 1, usage: 0x39, min: 0, max: 7 },
    { page: 1, usage: 0x37, min: 0, max: 65535 },
    { page: 1, usage: 0x36, min: 0, max: 65535 },
    { page: 1, usage: 0x33, min: 0, max: 65535 },
    { page: 1, usage: 0x34, min: 0, max: 65535 },
    { page: 1, usage: 0x35, min: 0, max: 65535 },
    { page: 1, usage: 0x32, min: 0, max: 65535 },
    { page: 1, usage: 0x31, min: 0, max: 65535 },
    { page: 1, usage: 0x30, min: 0, max: 65535 },
    { page: 1, usage: 0x50, min: 0, max: 255 },
  ],
  buttonCount: 44,
};
const SOL_R_RIGHT = { vendorId: 0x044f, productId: 0x0422, name: 'Thrustmaster Sol-R [R] Flightstick' };
const SOL_R_LEFT = { vendorId: 0x044f, productId: 0x042a, name: 'Thrustmaster Sol-R [L] Flightstick' };
const SOL_R_REST = [8, 0x8000, 0x8000, 0x9653, 0x8000, 0x8000, 0x8000, 0x7fff, 0x8000, 0];
const SOL_R_HELD = [20];

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
  assert.equal(model.support, 'full'); // an owner confirmed every label (GitHub issue #1)
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

test('the STECS Standard reads its throttle levers on X and Y as levers, not as a stick', () => {
  const model = describeDevice(STECS_LAYOUT, STECS);
  assert.equal(model.key, '231d:012d');
  assert.equal(model.skin, 'stecsstandard');
  assert.equal(model.support, 'beta'); // until an owner has confirmed every label
  assert.equal(model.name, 'VKB STECS Standard');
  const [x, y] = model.axes;
  assert.deepEqual([x.name, x.centered, x.invert], ['Throttle 1', false, false]);
  assert.deepEqual([y.name, y.centered, y.invert], ['Throttle 2', false, false]);
  assert.equal(model.buttonNames.btn2, 'Red Start');
  assert.equal(model.buttonNames.btn7, 'Rotary 5');
  assert.equal(model.buttonNames.btn42, 'B5 Button');
  assert.equal(model.buttonNames.btn58, 'Flip Switch Down');
  assert.equal(model.buttonNames.btn19, 'Button 19'); // not on the owner’s button map
  // The other axes keep the generic defaults, including the two sliders.
  assert.deepEqual(model.axes.map((a) => a.id), ['x', 'y', 'z', 'rx', 'ry', 'rz', 'slider', 'slider2']);
  assert.deepEqual(model.axes.filter((a) => a.centered).map((a) => a.id), ['rx', 'ry', 'rz']);
});

test('STECS levers read end to end, both the same way, even after a Recenter at idle', () => {
  const model = describeDevice(STECS_LAYOUT, STECS);
  const read = (x, y, settings = {}) => normalizeInput(decoded([x, y, 0, 512, 512, 512, 512, 511, null]), model, settings).axes;
  assert.deepEqual([read(0, 0).x, read(0, 0).y], [-1, -1]); // idle
  assert.ok(Math.abs(read(2047.5, 2047.5).x) < 1e-9); // halfway
  assert.deepEqual([read(4095, 4095).x, read(4095, 4095).y], [1, 1]); // full forward
  // A centre measured at idle (what the Recenter button saves) no longer matters...
  assert.equal(read(0, 0, { calibration: { x: 0, y: 0 } }).x, -1);
  // ...where it used to leave the lever with half its travel, idle reading as the middle.
  assert.equal(read(0, 0, { calibration: { x: 0, y: 0 }, centered: { x: true } }).x, 0);
  const { axes } = normalizeInput({ values: STECS_REST, buttons: new Set() }, model);
  for (const id of ['rx', 'ry', 'rz']) assert.ok(Math.abs(axes[id]) < 0.01, `${id} = ${axes[id]}`);
});

test('the VelocityOne Flightstick twists on Z and reads its levers on Rz and Dial', () => {
  const model = describeDevice(FLIGHTSTICK_LAYOUT, FLIGHTSTICK);
  assert.equal(model.key, '10f5:7055');
  assert.equal(model.skin, 'velocityoneflightstick');
  assert.equal(model.support, 'beta'); // until an owner has confirmed every label
  assert.deepEqual(model.axes.map((a) => a.id), ['x', 'y', 'dial', 'slider', 'rz', 'ry', 'rx', 'z']);
  const axis = Object.fromEntries(model.axes.map((a) => [a.id, [a.name, a.centered, a.invert, a.deadzone]]));
  assert.deepEqual(axis.z, ['Yaw', true, false, 0.1]);
  assert.deepEqual(axis.rz, ['Left Lever', false, false, 0.02]);
  assert.deepEqual(axis.dial, ['Right Lever', false, false, undefined]);
  assert.deepEqual(axis.slider, ['Trim Wheel', false, true, undefined]); // generic defaults
  assert.deepEqual(model.axes.filter((a) => a.centered).map((a) => a.id), ['x', 'y', 'ry', 'rx', 'z']);
  assert.deepEqual(model.hats.map((h) => h.name), ['H1 Hat']);
  assert.equal(model.buttons, 24);
  assert.equal(model.buttonNames.btn18, 'Trigger');
  assert.equal(model.buttonNames.btn15, 'Button 15'); // not on any published button list
  // Without the skin, Z read as a reversed throttle: what the owner reported.
  const generic = describeDevice(FLIGHTSTICK_LAYOUT, { ...FLIGHTSTICK, ignoreSkin: true }).axes.find((a) => a.id === 'z');
  assert.deepEqual([generic.centered, generic.invert], [false, true]);
});

test('a Flightstick at rest reads centred; twisting right and pushing a lever forward read positive', () => {
  const model = describeDevice(FLIGHTSTICK_LAYOUT, FLIGHTSTICK);
  const rest = normalizeInput(decoded(FLIGHTSTICK_REST), model, {});
  for (const id of ['x', 'y', 'rx', 'ry', 'z']) assert.ok(Math.abs(rest.axes[id]) < 0.001, `${id} = ${rest.axes[id]}`);
  assert.equal(Object.values(rest.buttons).some(Boolean), false); // the hat rests at 0, outside 1–8
  // x, y, dial, slider, rz, ry, rx, z
  const read = (values) => normalizeInput(decoded([...values, 0, 0]), model, {}).axes;
  const low = read([0x8000, 0x8000, 0, 0, 0, 0x7fff, 0x7fff, 0]);
  const high = read([0x8000, 0x8000, 65535, 0, 65535, 0x7fff, 0x7fff, 65535]);
  assert.deepEqual([low.z, low.rz, low.dial], [-1, -1, -1]);
  assert.deepEqual([high.z, high.rz, high.dial], [1, 1, 1]);
  // The left lever keeps its whole travel whatever centre a Recenter saved for it.
  assert.equal(normalizeInput(decoded(FLIGHTSTICK_REST), model, { calibration: { rz: 0x98c0 } }).axes.rz, rest.axes.rz);
  const up = normalizeInput(decoded([0x8000, 0x8000, 0, 0, 0, 0x7fff, 0x7fff, 0x8000, 1, 0]), model, {}).buttons;
  assert.deepEqual([up.hat1_up, up.hat1_right, up.hat1_down, up.hat1_left], [true, false, false, false]);
});

test('the Orion 2 F-16EX stick reads its two levers from rest, not as a twist held over', () => {
  const model = describeDevice(ORION_STICK_LAYOUT, ORION_STICK);
  assert.equal(model.key, '4098:bea8');
  assert.equal(model.skin, 'orion2f16ex');
  assert.equal(model.support, 'beta'); // until an owner has confirmed every label
  assert.equal(model.name, 'WINWING Orion 2 F-16EX');
  assert.deepEqual(model.axes.map((a) => a.id), ['x', 'y', 'rx', 'ry', 'rz', 'slider']);
  const axis = Object.fromEntries(model.axes.map((a) => [a.id, [a.name, a.centered, a.invert, a.deadzone]]));
  assert.deepEqual(axis.rz, ['Top Lever', false, false, 0.02]);
  assert.deepEqual(axis.slider, ['Paddle', false, false, undefined]);
  assert.deepEqual(model.axes.filter((a) => a.centered).map((a) => a.id), ['x', 'y', 'rx', 'ry']);
  assert.deepEqual(model.hats.map((h) => h.name), ['Trim Hat']);
  assert.equal(model.buttons, 42);
  assert.equal(model.buttonNames.btn20, 'Weapon Release');
  assert.equal(model.buttonNames.btn36, 'Right Hat Push');
  assert.equal(model.buttonNames.btn40, 'Right Hat Left');
  assert.equal(model.buttonNames.btn18, 'Side Hat Up');
  assert.equal(model.buttonNames.btn42, 'Top Lever Stage 2');

  const rest = normalizeInput(decoded(ORION_STICK_REST, ORION_STICK_HELD), model, {});
  for (const id of ['x', 'y', 'rx', 'ry']) assert.ok(Math.abs(rest.axes[id]) < 0.001, `${id} = ${rest.axes[id]}`);
  assert.deepEqual([rest.axes.rz, rest.axes.slider], [-1, -1]); // both levers let go
  // Each lever holds a button while it rests; the hat reports 15, outside 0–7, when let go.
  assert.deepEqual(Object.keys(rest.buttons).filter((id) => rest.buttons[id]), ['btn2', 'btn7']);
  const squeezed = normalizeInput(decoded([15, 0x8000, 0x8000, 0x800, 0x800, 4095, 4095, 0]), model, {});
  assert.deepEqual([squeezed.axes.rz, squeezed.axes.slider], [1, 1]);
  // Without the skin the paddle read as fully squeezed, and the top lever as a twist that
  // rests hard over: too far off centre for the stick ever to centre itself.
  const generic = describeDevice(ORION_STICK_LAYOUT, { ...ORION_STICK, ignoreSkin: true });
  assert.equal(generic.axes.find((a) => a.id === 'rz').centered, true);
  assert.equal(normalizeInput(decoded(ORION_STICK_REST), generic, {}).axes.slider, 1);
});

test('the Orion 2 throttle reads its levers on Rx and Ry as levers, both the same way', () => {
  const model = describeDevice(ORION_THROTTLE_LAYOUT, ORION_THROTTLE);
  assert.equal(model.key, '4098:bd64');
  assert.equal(model.skin, 'orion2throttle');
  assert.equal(model.support, 'beta'); // until an owner has confirmed every label
  assert.equal(model.name, 'WINWING Orion 2 Throttle');
  const axis = Object.fromEntries(model.axes.map((a) => [a.id, [a.name, a.centered, a.invert, a.deadzone]]));
  assert.deepEqual(axis.rx, ['Right Throttle', false, true, undefined]);
  assert.deepEqual(axis.ry, ['Left Throttle', false, true, undefined]);
  assert.deepEqual(axis.z, ['Slew Wheel', true, true, undefined]);
  assert.deepEqual(axis.rz, ['Antenna Knob', false, false, 0.02]);
  assert.deepEqual(axis.slider, ['Slider Lever', false, true, undefined]); // generic defaults
  assert.deepEqual(axis.dial, ['Dial Lever', false, true, undefined]);
  assert.deepEqual(model.axes.filter((a) => a.centered).map((a) => a.id), ['x', 'y', 'z']);
  assert.equal(model.buttonNames.btn1, 'Right Throttle Off');
  assert.equal(model.buttonNames.btn31, 'Left Throttle Idle');
  assert.equal(model.buttonNames.btn36, 'TDC Up');
  assert.equal(model.buttonNames.btn72, 'Wing Fold Push');
  assert.equal(model.buttonNames.btn85, 'HMD Knob Push');
  assert.equal(model.buttonNames.btn111, 'Dial Lever Back');
  assert.equal(model.buttonNames.btn113, 'Left Finger Lift');
  assert.equal(model.buttonNames.btn12, 'Cone Hat Up');
  assert.equal(model.buttonNames.btn10, 'Ribbed Hat Push');
  assert.equal(model.buttonNames.btn33, 'Front Hat Left'); // 30 and 31, in between, are the base's idle detents
  assert.equal(model.buttonNames.btn44, 'Encoder Far Down');
  assert.equal(model.buttonNames.btn50, 'Button 50'); // which of the left handle's two buttons it is isn't known
  assert.equal(model.buttonNames.btn41, 'Button 41'); // the wheel's own buttons, off unless switched on

  // x, y, z, rx, ry, rz, slider, dial, vendor byte
  const read = (rx, ry, settings = {}) => normalizeInput(decoded([2048, 2048, 2048, rx, ry, 0, 0, 0, 0]), model, settings).axes;
  assert.deepEqual([read(0, 0).rx, read(0, 0).ry], [1, 1]);
  assert.deepEqual([read(65535, 65535).rx, read(65535, 65535).ry], [-1, -1]);
  // Whatever centre was saved while they read as a stick no longer matters.
  assert.equal(read(29211, 30015, { calibration: { rx: 29211, ry: 30015 } }).rx, read(29211, 30015).rx);

  const rest = normalizeInput(decoded(ORION_THROTTLE_REST, ORION_THROTTLE_HELD), model, {});
  assert.ok(rest.axes.rx > 0 && rest.axes.ry > 0 && Math.abs(rest.axes.rx - rest.axes.ry) < 0.05, `${rest.axes.rx} / ${rest.axes.ry}`);
  assert.ok(Math.abs(rest.axes.z) < 0.001); // the sprung wheel, let go
  // Without the skin the two levers, side by side, read opposite ways.
  const generic = describeDevice(ORION_THROTTLE_LAYOUT, { ...ORION_THROTTLE, ignoreSkin: true });
  const apart = normalizeInput(decoded(ORION_THROTTLE_REST), generic, {}).axes;
  assert.ok(apart.rx < 0 && apart.ry > 0);
  // Everything the owner's throttle was holding is a switch resting in a named position:
  // the three three-way switches on the handles on their middles, like those on the base.
  const held = ORION_THROTTLE_HELD.map((b) => model.buttonNames[`btn${b}`]);
  assert.deepEqual(held.slice(0, 3), ['Paddle Switch Middle', 'Slide Switch Middle', 'Right Throttle Idle']);
  assert.deepEqual(held.slice(3), [
    'Left Throttle Idle',
    'Lever Switch Middle',
    'Launch Bar Extend',
    'Hook Up',
    'Wing Fold',
    'Gear Up',
    'Park Brake Off',
    'Flap Half',
    'Roll Switch Middle',
    'Pitch Switch Middle',
    'Master Safe',
  ]);
});

test('ACE-Torq pedals read the rudder on Z, centred, with the two unused axes parked', () => {
  const model = describeDevice(ACE_TORQ_LAYOUT, ACE_TORQ);
  assert.equal(model.key, '3344:01f9');
  assert.equal(model.skin, 'acetorq');
  assert.equal(model.support, 'beta'); // until an owner has confirmed which way it reads
  assert.equal(model.name, 'Virpil ACE-Torq Rudder');
  assert.equal(LAYOUTS.acetorq, undefined); // no photo yet: it shows as the list
  assert.deepEqual(
    model.axes.map((a) => [a.id, a.name, a.centered, a.invert]),
    [
      ['z', 'Rudder', true, false],
      ['x', 'Spare X', false, false],
      ['y', 'Spare Y', false, false],
    ],
  );
  const rest = normalizeInput(decoded(ACE_TORQ_REST), model, {});
  assert.ok(Math.abs(rest.axes.z) < 0.02, `z = ${rest.axes.z}`);
  assert.deepEqual([rest.axes.x, rest.axes.y], [-1, -1]);
  assert.equal(normalizeInput(decoded([60000, 0, 0]), model, {}).axes.z, 1);
  assert.equal(normalizeInput(decoded([0, 0, 0]), model, {}).axes.z, -1);
  // Without the skin the rudder read as a throttle lever, and X and Y as a stick held over.
  const generic = describeDevice(ACE_TORQ_LAYOUT, { ...ACE_TORQ, ignoreSkin: true });
  assert.deepEqual(generic.axes.map((a) => a.centered), [false, true, true]);
  assert.deepEqual(guessRole(ACE_TORQ.name), 'pedals');
  assert.deepEqual(guessRole(ORION_THROTTLE.name), 'throttle');
});

test('the Sol-R sticks read their thrust lever as a lever and everything else from the middle', () => {
  for (const [stick, skin, name] of [
    [SOL_R_RIGHT, 'solrright', 'Sol-R Right Stick'],
    [SOL_R_LEFT, 'solrleft', 'Sol-R Left Stick'],
  ]) {
    const model = describeDevice(SOL_R_LAYOUT, stick);
    assert.equal(model.skin, skin);
    assert.equal(model.support, 'experimental'); // until an owner has confirmed which axis is which
    assert.equal(model.name, name);
    assert.equal(model.buttons, 44);
    assert.deepEqual(model.axes.map((a) => a.id), ['dial', 'slider', 'rx', 'ry', 'rz', 'z', 'y', 'x']); // the vendor byte isn't one
    const axis = Object.fromEntries(model.axes.map((a) => [a.id, [a.name, a.centered, a.invert, a.deadzone]]));
    assert.deepEqual(axis.rx, ['Thrust', false, false, undefined]);
    assert.deepEqual(axis.z, ['Twist', true, false, 0.1]);
    assert.deepEqual(axis.ry, ['Ministick X', true, false, undefined]);
    assert.deepEqual(axis.rz, ['Ministick Y', true, true, 0.04]);
    assert.deepEqual(axis.slider, ['Slider', false, true, undefined]); // the two spares keep their generic ones
    assert.deepEqual(model.axes.filter((a) => a.centered).map((a) => a.id), ['ry', 'rz', 'z', 'y', 'x']);
    assert.equal(model.axes.find((a) => a.id === 'slider').hint, '');
    assert.deepEqual(model.hats.map((h) => h.name), ['Left Hat']);
    assert.equal(model.buttonNames.btn20, 'Rotary 1');
    assert.equal(model.buttonNames.btn25, 'Trigger Stage 2');
    assert.equal(model.buttonNames.btn30, 'Left Hat Push');
    assert.equal(model.buttonNames.btn40, 'Right Hat Push'); // push first, from the "40" printed beside its push symbol
    assert.equal(model.buttonNames.btn44, 'Right Hat Left');
    assert.equal(model.buttonNames.btn17, 'Right Pad Top Left'); // 17 is above 19, and left of 16
    assert.equal(model.buttonNames.btn31, 'Button 31'); // the chart leaves out 31–34

    // At rest only the thrust lever and the rotary's first position stand out.
    const rest = normalizeInput(decoded(SOL_R_REST, SOL_R_HELD), model, {});
    for (const id of ['x', 'y', 'z', 'ry', 'rz', 'slider', 'dial']) assert.ok(Math.abs(rest.axes[id]) < 0.01, `${id} = ${rest.axes[id]}`);
    assert.ok(rest.axes.rx > 0.17 && rest.axes.rx < 0.18, `rx = ${rest.axes.rx}`);
    assert.deepEqual(Object.keys(rest.buttons).filter((id) => rest.buttons[id]), ['btn20']);
    const idle = normalizeInput(decoded([8, 0x8000, 0x8000, 0, 0x8000, 0x8000, 0x8000, 0x7fff, 0x8000, 0]), model, {});
    assert.equal(idle.axes.rx, -1);
    // Without the skin the lever read as a centred axis half way over, which is more than
    // the stick will accept as at rest, so it never centred itself.
    const generic = describeDevice(SOL_R_LAYOUT, { ...stick, ignoreSkin: true });
    assert.equal(generic.axes.find((a) => a.id === 'rx').centered, true);
    assert.ok(Math.abs(normalizeInput(decoded(SOL_R_REST), generic, {}).axes.rx) > 0.1);
  }
});

test('the two Sol-R sticks take the stick and throttle roles whichever order they are found in', () => {
  const [right, left] = [SOL_R_RIGHT, SOL_R_LEFT].map((d) => ({ id: deviceKey(d.vendorId, d.productId), name: d.name }));
  assert.equal(guessRole(left.name), 'throttle');
  assert.equal(guessRole(right.name), null);
  const roles = { [right.id]: 'stick', [left.id]: 'throttle' };
  assert.deepEqual(assignRoles([right, left]), roles);
  assert.deepEqual(assignRoles([left, right]), roles);
  assert.deepEqual(assignRoles([left]), { [left.id]: 'stick' }); // on its own it is the stick, as for any other
});

// first..last, inclusive.
const range =(first, last) => Array.from({ length: last - first + 1 }, (_, i) => first + i);

// The control IDs a set of labels points at.
const shownBy = (callouts) => callouts.flatMap((c) => (c.group ? c.group.map((item) => item.id) : [c.id]));

test('every photo layout points only at controls its stick has, each one once', () => {
  const sticks = {
    extreme3dpro: [EXTREME_LAYOUT, EXTREME],
    gladiatorevo: [GLADIATOR_LAYOUT, GLADIATOR],
    stecsstandard: [STECS_LAYOUT, STECS],
    velocityoneflightstick: [FLIGHTSTICK_LAYOUT, FLIGHTSTICK],
    orion2f16ex: [ORION_STICK_LAYOUT, ORION_STICK],
    orion2throttle: [ORION_THROTTLE_LAYOUT, ORION_THROTTLE],
    solrright: [SOL_R_LAYOUT, SOL_R_RIGHT],
    solrleft: [SOL_R_LAYOUT, SOL_R_LEFT],
  };
  // Every photo belongs to a skin; the ACE-Torq is the one skin without a photo.
  const skins = Object.values(SKINS).map((s) => s.id);
  assert.deepEqual(skins.filter((id) => !LAYOUTS[id]), ['acetorq']);
  assert.deepEqual(Object.keys(LAYOUTS).filter((id) => !skins.includes(id)), []);
  for (const [skin, layout] of Object.entries(LAYOUTS)) {
    const model = describeDevice(...sticks[skin]);
    const known = new Set([
      ...model.axes.map((a) => a.id),
      ...model.hats.flatMap((h) => ['up', 'right', 'down', 'left'].map((dir) => `${h.id}_${dir}`)),
      ...Object.keys(model.buttonNames),
    ]);
    const shown = shownBy(layout.callouts);
    assert.deepEqual(shown.filter((id) => !known.has(id)), [], `${skin}: unknown controls`);
    assert.equal(new Set(shown).size, shown.length, `${skin}: a control is shown twice`);
    for (const axis of Object.keys(layout.guides)) assert.ok(shown.includes(axis), `${skin}: guide for ${axis}`);
    const labels = layout.callouts.map((c) => c.id);
    assert.equal(new Set(labels).size, labels.length, `${skin}: two labels share an id`);
  }
  // The Gladiator's photo covers everything the factory profile sends.
  const gladiator = shownBy(LAYOUTS.gladiatorevo.callouts);
  for (let b = 1; b <= 29; b++) assert.ok(gladiator.includes(`btn${b}`), `btn${b}`);
  // The STECS photo covers every button on its owner’s map, and names each one.
  const stecs = shownBy(LAYOUTS.stecsstandard.callouts);
  const mapped = Array.from({ length: 58 }, (_, i) => i + 1).filter((b) => ![19, 55, 56].includes(b));
  for (const b of mapped) {
    assert.ok(stecs.includes(`btn${b}`), `btn${b}`);
    assert.ok(SKINS['231d:012d'].names[`btn${b}`], `btn${b} has a name`);
  }
  // The Flightstick photo shows every control its skin names.
  const flightstick = shownBy(LAYOUTS.velocityoneflightstick.callouts);
  for (const id of Object.keys(SKINS['10f5:7055'].names)) {
    assert.ok(id === 'hat1' ? flightstick.includes('hat1_up') : flightstick.includes(id), id);
  }
  // So does the Orion 2 stick's, which is all 42 of its buttons.
  const orionStick = shownBy(LAYOUTS.orion2f16ex.callouts);
  for (const id of Object.keys(SKINS['4098:bea8'].names)) {
    assert.ok(id === 'hat1' ? orionStick.includes('hat1_up') : orionStick.includes(id), id);
  }
  for (let b = 1; b <= 42; b++) assert.ok(orionStick.includes(`btn${b}`), `btn${b}`);
  // The Orion 2 throttle's photo has a line to each of its 37 controls, which between them
  // are every axis and every button on the diagram for this base and these handles.
  const orionThrottle = shownBy(LAYOUTS.orion2throttle.callouts);
  assert.equal(LAYOUTS.orion2throttle.folded, true);
  assert.equal(LAYOUTS.orion2throttle.callouts.length, 37);
  for (const id of ['x', 'y', 'z', 'rx', 'ry', 'rz', 'slider', 'dial']) assert.ok(orionThrottle.includes(id), id);
  const numbers = (ids) => ids.filter((id) => /^btn/.test(id)).map((id) => Number(id.slice(3))).sort((x, y) => x - y);
  const onDiagram = [...range(1, 44), ...range(50, 62), ...range(65, 113)];
  assert.deepEqual(numbers(orionThrottle), onDiagram);
  // All of them are named, bar two buttons on the left handle and the buttons the wheel and
  // the knob can also send.
  const named = numbers(Object.keys(SKINS['4098:bd64'].names));
  assert.deepEqual(onDiagram.filter((b) => !named.includes(b)), [40, 41, 42, 50, 56, 60, 61, 62]);
  assert.deepEqual(named.filter((b) => !onDiagram.includes(b)), []);
  // Each line has its own dot: no two closer than a dot's width and a bit.
  const dots = LAYOUTS.orion2throttle.callouts.map((c) => c.at);
  for (const [i, a] of dots.entries()) {
    for (const b of dots.slice(i + 1)) assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) * LAYOUTS.orion2throttle.image.scale >= 24, `${a} and ${b}`);
  }
  // Both Sol-R photos show every button on the chart and every axis the stick has, on labels
  // that all fit above the bottom of the stage, with a dot each clear of the others.
  for (const skin of ['solrright', 'solrleft']) {
    const layout = LAYOUTS[skin];
    const shown = shownBy(layout.callouts);
    for (const id of ['x', 'y', 'z', 'rx', 'ry', 'rz']) assert.ok(shown.includes(id), `${skin}: ${id}`);
    for (const id of ['hat1_up', 'hat1_right', 'hat1_down', 'hat1_left']) assert.ok(shown.includes(id), `${skin}: ${id}`);
    const buttons = shown.filter((id) => /^btn/.test(id)).map((id) => Number(id.slice(3))).sort((x, y) => x - y);
    assert.deepEqual(buttons, [...range(1, 30), ...range(35, 44)], skin); // 31–34 aren't on the chart
    assert.equal(layout.folded, undefined);
    const rows = (c) => Math.ceil(c.group ? c.group.reduce((n, item) => n + (item.wide ? 1 : 1 / (c.columns ?? 1)), 0) : 1);
    for (const side of ['left', 'right']) {
      const last = layout.callouts.filter((c) => c.side === side).at(-1);
      assert.ok(last.y + 23 + rows(last) * 32 <= (side === 'left' ? 915 : 985), `${skin}: the ${side} labels run off the stage`);
    }
    const spots = layout.callouts.map((c) => c.at);
    for (const [i, a] of spots.entries()) {
      for (const b of spots.slice(i + 1)) assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) * layout.image.scale >= 24, `${skin}: ${a} and ${b}`);
    }
  }
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

// ─── HOTAS: several devices ───────────────────────────────────────────────────

test('controls on a throttle, pedals or extra device carry their role', () => {
  assert.equal(controlKind('throttle.z'), 'axis');
  assert.equal(controlKind('pedals.btn3'), 'button');
  assert.equal(controlKind('extra.hat1_up'), 'button');
  assert.deepEqual(splitControlId('throttle.z'), { role: 'throttle', local: 'z' });
  // The stick's controls are the plain IDs, so older profiles are stick profiles.
  assert.deepEqual(splitControlId('btn1'), { role: 'stick', local: 'btn1' });
  assert.deepEqual(splitControlId('throttle'), { role: 'stick', local: 'throttle' }); // an axis called throttle
  for (const bad of ['stick.btn1', 'throttle.', 'throttle.Bad Id', 'wheel.x', 'throttle.pedals.x']) {
    assert.equal(controlKind(bad), null, bad);
  }
  // They bind like any other control and survive a save / export round trip.
  assert.equal(sanitizeBinding('throttle.btn2', { target: 'ls_x' }), null);
  const p = { name: 'HOTAS', bindings: bindingsWith({ x: { target: 'ls_x' }, 'throttle.z': { target: 'rt' }, 'pedals.rz': { target: 'lb_rb' } }) };
  assert.deepEqual(Object.keys(fromExport(toExport(p)).bindings), ['x', 'throttle.z', 'pedals.rz']);
});

test('a stick and a throttle merge into one input and drive one pad', () => {
  const stick = describeDevice(EXTREME_LAYOUT, EXTREME);
  const throttle = describeDevice(T16000M_LAYOUT, T16000M);
  const merged = mergeInputs([
    normalizeInput(decoded([512, 1023, 8, 128, 255], [1]), stick, {}),
    normalizeInput(decoded([8191.5, 8191.5, 127.5, 0, 8], [1, 4]), throttle, {}, 'throttle.'),
  ]);
  // Same control numbers on both devices, kept apart.
  assert.equal(merged.axes.x, 1);
  assert.equal(merged.axes['throttle.x'], 0);
  assert.equal(merged.axes.slider, -1);
  assert.equal(merged.axes['throttle.slider'], 1);
  assert.equal(merged.buttons.btn4, false);
  assert.equal(merged.buttons['throttle.btn4'], true);
  assert.equal(merged.buttons['throttle.hat1_up'], false);

  const p = bindingsWith({
    x: { target: 'ls_x' },
    btn1: { target: 'a' },
    'throttle.slider': { target: 'rt', deadzone: 0 },
    'throttle.btn4': { target: 'b' },
  });
  const out = mapInput(merged, p);
  assert.equal(out.lx, 32767);
  assert.equal(out.rt, 255);
  assert.equal(out.buttons, XUSB.A | XUSB.B);
});

test('an axis nothing reports is left out, so an unplugged throttle lets go of its trigger', () => {
  const p = bindingsWith({ 'throttle.z': { target: 'rt', deadzone: 0 }, slider: { target: 'lt', deadzone: 0 }, x: { target: 'ls_x' } });
  const out = mapInput(input({}, { x: 1 }), p); // only the stick, and it has no slider
  assert.deepEqual([out.lx, out.lt, out.rt], [32767, 0, 0]);
  assert.equal(mapInput(input({}, { x: 1, 'throttle.z': 0 }), p).rt, 128);
});

test('a device on its own is the stick; with several, names and saved choices decide', () => {
  const stick = { id: '046d:c215', name: 'Logitech Extreme 3D' };
  const throttle = { id: '044f:b687', name: 'Thrustmaster TWCS Throttle' };
  const pedals = { id: '044f:b679', name: 'T-Rudder' };
  assert.equal(guessRole(throttle.name), 'throttle');
  assert.equal(guessRole(pedals.name), 'pedals');
  assert.equal(guessRole('Saitek Pro Flight Rudder Pedals'), 'pedals');
  assert.equal(guessRole(stick.name), null);

  assert.deepEqual(assignRoles([]), {});
  // Alone, even a throttle maps as the stick, as it did before HOTAS support.
  assert.deepEqual(assignRoles([throttle]), { [throttle.id]: 'stick' });
  assert.deepEqual(assignRoles([throttle, stick, pedals]), {
    [throttle.id]: 'throttle',
    [stick.id]: 'stick',
    [pedals.id]: 'pedals',
  });
  // Once remembered, unplugging the stick doesn't promote the throttle.
  assert.deepEqual(assignRoles([throttle], { [throttle.id]: 'throttle', [stick.id]: 'stick' }), { [throttle.id]: 'throttle' });
  // A saved choice beats the name.
  assert.deepEqual(assignRoles([stick, throttle], { [throttle.id]: 'extra' }), { [stick.id]: 'stick', [throttle.id]: 'extra' });
  // Two sticks: the second fills the next free role. A fifth device gets none.
  const twin = (n) => ({ id: `231d:020${n}`, name: 'VKBsim Gladiator' });
  assert.deepEqual(Object.values(assignRoles([1, 2, 3, 4, 5].map(twin))), ['stick', 'throttle', 'pedals', 'extra']);
  // Two devices saved with the same role: the first keeps it, the other moves on.
  assert.deepEqual(assignRoles([stick, twin(1)], { [stick.id]: 'stick', [twin(1).id]: 'stick' }), {
    [stick.id]: 'stick',
    [twin(1).id]: 'throttle',
  });
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
