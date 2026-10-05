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
import {
  SKINS,
  XBOX_ELITE_PAD,
  XBOX_LAYOUT,
  XBOX_PAD,
  assignRoles,
  describeDevice,
  deviceKey,
  guessRole,
  hatDirections,
  isKnownGamepad,
  mergeInputs,
  normalizeInput,
} from '../src/shared/devices.js';
import { HidDescriptorParser, parseDescriptor } from '../src/main/hiddescriptor.js';
import { logicalMax, sharedUsages } from '../src/main/hidp.js';
import { XboxPadParser, isEliteProduct } from '../src/main/xinput.js';
import { GAMES } from '../src/shared/games.js';
import { ALTERNATES, LAYOUTS } from '../src/renderer/layout.js';
import { NEUTRAL_INPUT, mapInput } from '../src/shared/mapper.js';
import { PRESETS } from '../src/shared/presets.js';
import { MIN_PRESS_MS, pressHolder } from '../src/shared/pulses.js';
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
// The left-hand stick, from an owner's "Copy device info" on 2026-10-04 (GitHub issue #17):
// the same layout. Theirs is fitted with VKB's Omni Throttle adapter.
const GLADIATOR_LEFT = { vendorId: 0x231d, productId: 0x0201, name: 'VKB-Sim (C) Alex Oz 2023 VKBsim Gladiator EVO L' };
// A right-hand Omni Throttle as VKB sells it, from an owner's on 2026-10-02 (GitHub issue
// #5): no Slider or Dial, and a 12-bit ministick. The left-hand one is taken to match.
const OMNI_LAYOUT = {
  values: [
    { page: 1, usage: 0x30, min: 0, max: 4095 },
    { page: 1, usage: 0x31, min: 0, max: 4095 },
    { page: 1, usage: 0x35, min: 0, max: 2047 },
    { page: 1, usage: 0x32, min: 0, max: 2047 },
    { page: 1, usage: 0x33, min: 0, max: 4095 },
    { page: 1, usage: 0x34, min: 0, max: 4095 },
    { page: 0, usage: 0, min: 0, max: 2047 },
    { page: 0, usage: 0, min: 0, max: 2047 },
    { page: 1, usage: 0x39, min: 0, max: 7 },
  ],
  buttonCount: 128,
};
const OMNI_RIGHT = { vendorId: 0x231d, productId: 0x3200, name: 'VKB-Sim (C) Alex Oz 2023 VKBsim Gladiator EVO OT R' };
const OMNI_LEFT = { vendorId: 0x231d, productId: 0x3201, name: 'VKB-Sim (C) Alex Oz 2023 VKBsim Gladiator EVO OT L' };
const OMNI_REST = [2048, 2048, 1024, 1111, 2048, 2048, 0, 0, null];

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
// The Max, from an owner's on 2026-10-03 (GitHub issue #9): the same throttle with an ATEM
// module added, reporting a Dial where the Standard has a second Slider.
const STECS_MAX_LAYOUT = { ...STECS_LAYOUT, values: STECS_LAYOUT.values.map((field, i) => (i === 7 ? { ...field, usage: 0x37 } : field)) };
const STECS_MAX = { vendorId: 0x231d, productId: 0x012e, name: 'VKB-Sim (C) Alex Oz 2023 S-TECS MODERN THROTTLE MAX STEM' };
const STECS_MAX_REST = [1898, 1898, 0, 512, 512, 512, 512, 510, null];

// VKB STECS Space Throttle Standard, left hand (STEM), from an owner's "Copy device info" on
// 2026-10-03 (GitHub issue #11): the same base and STEM under a single Space grip.
// STECS_SPACE_REST is the axis part of its last report. Another owner's (issue #4) reports
// no Rz or Slider, and rested as STECS_SPACE_REST_2.
const STECS_SPACE_LAYOUT = {
  values: [
    { page: 1, usage: 0x32, min: 0, max: 4095 },
    { page: 1, usage: 0x30, min: 0, max: 4095 },
    { page: 1, usage: 0x31, min: 0, max: 4095 },
    { page: 1, usage: 0x33, min: 0, max: 1023 },
    { page: 1, usage: 0x34, min: 0, max: 1023 },
    { page: 1, usage: 0x35, min: 0, max: 1023 },
    { page: 1, usage: 0x36, min: 0, max: 1023 },
    { page: 0, usage: 0, min: 0, max: 1023 },
    { page: 1, usage: 0x39, min: 0, max: 7 },
  ],
  buttonCount: 128,
};
const STECS_SPACE = { vendorId: 0x231d, productId: 0x0138, name: 'VKB-Sim (C) Alex Oz 2023 S-TECS SPACE-L THROTTLE STANDARD  STEM' };
const STECS_SPACE_REST = [2042, 2048, 2036, 0, 839, 497, 512, 0, null];
const STECS_SPACE_LAYOUT_2 = {
  ...STECS_SPACE_LAYOUT,
  values: STECS_SPACE_LAYOUT.values.map((field, i) => (i === 5 || i === 6 ? { ...field, page: 0, usage: 0 } : field)),
};
const STECS_SPACE_REST_2 = [2771, 2048, 2048, 0, 1023, 0, 0, 0, null];

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

// Turtle Beach VelocityOne Flightstick II, from an owner's "Copy device info" (GitHub issue
// #13), exactly as Windows handed it over: X and Y with a range of 0 to -1. The twist is on
// Z; the levers are on Rz (left) and Slider (right). FLIGHTSTICK_2_REST is the axis part of
// its last report: everything centred, both levers part way along.
const FLIGHTSTICK_2_REPORTED = {
  values: [
    { page: 1, usage: 0x30, bits: 16, min: 0, max: -1 },
    { page: 1, usage: 0x31, bits: 16, min: 0, max: -1 },
    { page: 1, usage: 0x37, bits: 16, min: 0, max: 65535 },
    { page: 1, usage: 0x36, bits: 16, min: 0, max: 65535 },
    { page: 1, usage: 0x35, bits: 16, min: 0, max: 65535 },
    { page: 1, usage: 0x34, bits: 16, min: 0, max: 65535 },
    { page: 1, usage: 0x33, bits: 16, min: 0, max: 65535 },
    { page: 1, usage: 0x32, bits: 16, min: 0, max: 65535 },
    { page: 1, usage: 0x39, bits: 8, min: 1, max: 8 },
    { page: 255, usage: 33, bits: 8, min: 0, max: 255 },
  ],
  buttonCount: 54,
};
// The same layout as the app now reads it.
const FLIGHTSTICK_2_LAYOUT = {
  ...FLIGHTSTICK_2_REPORTED,
  values: FLIGHTSTICK_2_REPORTED.values.map((v) => ({ ...v, max: logicalMax(v.min, v.max, v.bits) })),
};
const FLIGHTSTICK_2 = { vendorId: 0x10f5, productId: 0x7150, name: 'Turtle Beach VelocityOne Flightstick II' };
// x, y, dial, slider, rz, ry, rx, z, hat, vendor byte
const FLIGHTSTICK_2_REST = [0x7fff, 0x7fff, 0x7fff, 0xb640, 0x6d00, 0x7fff, 0x7fff, 0x7fff, 0, 0];

// A Turtle Beach VelocityOne Flightdeck stick and throttle, from one owner's "Copy device
// info" (GitHub issues #14 and #15). Each *_REST is the axis part of that device's last
// report and *_HELD the buttons it had down, taking the report to pack the axes X, Y, Z,
// Rx, Ry, Rz, Slider, Dial, with the buttons after the hats (stick) or the axes (throttle).
// Stick: x, y, dial, slider, rz, ry, rx, z, three hats, two vendor bytes. The pinkie lever
// on Rz rests at 0; the gear lever and the rotary knob each hold a button.
const FLIGHTDECK_STICK_LAYOUT = {
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
    { page: 1, usage: 0x39, min: 1, max: 8 },
    { page: 1, usage: 0x39, min: 1, max: 8 },
    { page: 255, usage: 2, min: 0, max: 255 },
    { page: 255, usage: 33, min: 0, max: 255 },
  ],
  buttonCount: 40,
};
const FLIGHTDECK_STICK = { vendorId: 0x10f5, productId: 0x7084, name: 'Turtle Beach Flightdeck Stick' };
const FLIGHTDECK_STICK_REST = [0x7fff, 0x7fff, 0, 0x813f, 0, 0x7fff, 0x7fff, 0x7fff, 0, 0, 0, 0, 0];
const FLIGHTDECK_STICK_HELD = [24, 26];

// Throttle: hat, x, y, dial, slider, rz, ry, rx, z, vendor byte. Both throttle levers are
// at the bottom of X and Y, holding their Min and Back buttons, and the flap lever is at
// the top of Slider, holding its Forward button.
const FLIGHTDECK_THROTTLE_LAYOUT = {
  values: [
    { page: 1, usage: 0x39, min: 1, max: 8 },
    { page: 1, usage: 0x30, min: 0, max: 65535 },
    { page: 1, usage: 0x31, min: 0, max: 65535 },
    { page: 1, usage: 0x37, min: 0, max: 65535 },
    { page: 1, usage: 0x36, min: 0, max: 65535 },
    { page: 1, usage: 0x35, min: 0, max: 65535 },
    { page: 1, usage: 0x34, min: 0, max: 65535 },
    { page: 1, usage: 0x33, min: 0, max: 65535 },
    { page: 1, usage: 0x32, min: 0, max: 65535 },
    { page: 65281, usage: 40, min: 0, max: 255 },
  ],
  buttonCount: 47,
};
const FLIGHTDECK_THROTTLE = { vendorId: 0x10f5, productId: 0x7085, name: 'Turtle Beach Flightdeck Throttle' };
const FLIGHTDECK_THROTTLE_REST = [0, 0, 0, 0x77ff, 0xffff, 0x7fff, 0x7fff, 0x7fff, 0x7fff, 0];
const FLIGHTDECK_THROTTLE_HELD = [16, 20, 22, 36, 39];

// A Turtle Beach VelocityOne Dual Throttle, from an owner's "Copy device info" (GitHub
// issue #23): two hats that report alike, then x, y, dial, slider, rz, ry, rx, z and a
// vendor byte. DUAL_THROTTLE_REST is the axis part of its last report, taking it to pack
// the axes as the Flightdeck throttle's does: both levers four fifths of the way up X and
// Y, the small lever a third of the way up Z, nothing held.
const DUAL_THROTTLE_LAYOUT = {
  values: [
    { page: 1, usage: 0x39, link: 0, min: 1, max: 8 },
    { page: 1, usage: 0x39, link: 0, min: 1, max: 8 },
    { page: 1, usage: 0x30, link: 1, min: 0, max: 65535 },
    { page: 1, usage: 0x31, link: 1, min: 0, max: 65535 },
    { page: 1, usage: 0x37, link: 0, min: 0, max: 65535 },
    { page: 1, usage: 0x36, link: 0, min: 0, max: 65535 },
    { page: 1, usage: 0x35, link: 0, min: 0, max: 65535 },
    { page: 1, usage: 0x34, link: 0, min: 0, max: 65535 },
    { page: 1, usage: 0x33, link: 0, min: 0, max: 65535 },
    { page: 1, usage: 0x32, link: 0, min: 0, max: 65535 },
    { page: 65281, usage: 40, link: 2, min: 0, max: 255 },
  ],
  buttonCount: 47,
};
const DUAL_THROTTLE = { vendorId: 0x10f5, productId: 0x7154, name: 'Turtle Beach VelocityOne Dual Throttle' };
const DUAL_THROTTLE_REST = [0, 0, 0xcce0, 0xcce0, 0x80ff, 0, 0x7fff, 0x7fff, 0x7fff, 0x5600, 0];

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

// A WINCTRL URSA MINOR Combat stick and throttle, from one owner's "Copy device info"
// (GitHub issues #24 and #25). Each *_REST is the axis part of that device's last report
// and *_HELD the buttons it had down, taking the report to pack them in this order.
// Stick: hat, x, y, z, rx, ry, slider, vendor byte. The hat reports 15 when let go, the
// twist rests part way to the left and the slider at MAX; nothing is held.
const URSA_STICK_LAYOUT = {
  values: [
    { page: 1, usage: 0x39, min: 0, max: 7 },
    { page: 1, usage: 0x30, min: 0, max: 65535 },
    { page: 1, usage: 0x31, min: 0, max: 65535 },
    { page: 1, usage: 0x32, min: 0, max: 65535 },
    { page: 1, usage: 0x33, min: 0, max: 4095 },
    { page: 1, usage: 0x34, min: 0, max: 4095 },
    { page: 1, usage: 0x36, min: 0, max: 4095 },
    { page: 255, usage: 1, min: 0, max: 255 },
  ],
  buttonCount: 128,
};
const URSA_STICK = { vendorId: 0x4098, productId: 0xbc2a, name: 'Winwing WINCTRL URSA MINOR Combat Joystick R' };
const URSA_STICK_REST = [15, 0x8000, 0x8000, 0xb1d4, 0x800, 0x800, 0, 0];

// Throttle: x, y, z, rx, ry, rz, slider, dial and four vendor bytes. X and Y rest at the
// bottom of their range and Rx and Ry at the top; the finger wheel and the knob sit in
// the middle, and the ministick, sending buttons, leaves Slider and Dial at 0.
const URSA_THROTTLE_LAYOUT = {
  values: [
    { page: 1, usage: 0x30, min: 0, max: 65535 },
    { page: 1, usage: 0x31, min: 0, max: 65535 },
    { page: 1, usage: 0x32, min: 0, max: 65535 },
    { page: 1, usage: 0x33, min: 0, max: 65535 },
    { page: 1, usage: 0x34, min: 0, max: 65535 },
    { page: 1, usage: 0x35, min: 0, max: 65535 },
    { page: 1, usage: 0x36, min: 0, max: 65535 },
    { page: 1, usage: 0x37, min: 0, max: 65535 },
    { page: 255, usage: 1, min: 0, max: 255 },
    { page: 255, usage: 209, min: 0, max: 255 },
    { page: 255, usage: 208, min: 0, max: 255 },
    { page: 255, usage: 3, min: 0, max: 255 },
  ],
  buttonCount: 90,
};
const URSA_THROTTLE = { vendorId: 0x4098, productId: 0xb970, name: 'WINCTRL URSA MINOR Combat Throttle Metal.EX' };
const URSA_THROTTLE_REST = [0, 0, 0x8000, 0xffff, 0xffff, 0x8000, 0, 0, 0, 0, 0, 0];
const URSA_THROTTLE_HELD = [9, 16, 20, 31, 34, 57, 61, 64, 67, 76, 79, 81];

// A Thrustmaster Sol-R pair, from one owner's "Copy device info" (GitHub issues #8 and
// #10): two sticks with the same 44 buttons and the same axes, in this order: hat, dial,
// slider, rx, ry, rz, z, y, x, vendor byte. SOL_R_REST is the right stick at rest:
// everything on the middle but the thrust lever on Z, part way along (the left stick's
// lever was at 0), and the base's rotary on its first position (button 20).
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
const SOL_R_REST = [8, 0x8000, 0x7fff, 0x8000, 0x8000, 0x8000, 0x9653, 0x8000, 0x8000, 0];
const SOL_R_HELD = [20];

// A Logitech X56 throttle, from an owner's "Copy device info" (GitHub issue #16): two
// 10-bit levers on X and Y and six 8-bit axes, in this order: y, x, dial, slider, ry, rz,
// rx, z. In its last report both levers read 0 and button 34 (the MODE switch) was held.
const X56_THROTTLE_LAYOUT = {
  values: [
    { page: 1, usage: 0x31, min: 0, max: 1023 },
    { page: 1, usage: 0x30, min: 0, max: 1023 },
    { page: 1, usage: 0x37, min: 0, max: 255 },
    { page: 1, usage: 0x36, min: 0, max: 255 },
    { page: 1, usage: 0x34, min: 0, max: 255 },
    { page: 1, usage: 0x35, min: 0, max: 255 },
    { page: 1, usage: 0x33, min: 0, max: 255 },
    { page: 1, usage: 0x32, min: 0, max: 255 },
  ],
  buttonCount: 36,
};
const X56_THROTTLE = { vendorId: 0x0738, productId: 0xa221, name: 'Mad Catz Saitek Pro Flight X-56 Rhino Throttle' };
// The X56 stick, from its published control list (not a captured device).
const X56_STICK_LAYOUT = {
  values: [
    { page: 1, usage: 0x30, min: 0, max: 65535 },
    { page: 1, usage: 0x31, min: 0, max: 65535 },
    { page: 1, usage: 0x35, min: 0, max: 4095 },
    { page: 1, usage: 0x39, min: 0, max: 7 },
    { page: 1, usage: 0x33, min: 0, max: 255 },
    { page: 1, usage: 0x34, min: 0, max: 255 },
  ],
  buttonCount: 17,
};
const X56_STICK = { vendorId: 0x0738, productId: 0x2221, name: 'Mad Catz Saitek Pro Flight X-56 Rhino Stick' };

// The two PlayStation controllers' input reports, from their published descriptors (not
// captured devices), read with the app's own descriptor parser, which lists a layout as
// Windows does. DualShock 4: both sticks, the hat, 14 buttons, a counter, then the
// triggers. DualSense: both sticks and the triggers together, a counter, the hat, 15
// buttons.
const descriptor = (hex) => Buffer.from(hex.replace(/\s+/g, ''), 'hex');
const DUALSHOCK_4_DESCRIPTOR = descriptor(`
  05 01 09 05 a1 01 85 01
  09 30 09 31 09 32 09 35 15 00 26 ff 00 75 08 95 04 81 02
  09 39 15 00 25 07 35 00 46 3b 01 65 14 75 04 95 01 81 42
  65 00 05 09 19 01 29 0e 15 00 25 01 75 01 95 0e 81 02
  06 00 ff 09 20 75 06 95 01 15 00 25 7f 81 02
  05 01 09 33 09 34 15 00 26 ff 00 75 08 95 02 81 02
  06 00 ff 09 21 95 36 81 02
  c0`);
const DUALSENSE_DESCRIPTOR = descriptor(`
  05 01 09 05 a1 01 85 01
  09 30 09 31 09 32 09 35 09 33 09 34 15 00 26 ff 00 75 08 95 06 81 02
  06 00 ff 09 20 95 01 81 02
  05 01 09 39 15 00 25 07 35 00 46 3b 01 65 14 75 04 81 42
  65 00 05 09 19 01 29 0f 15 00 25 01 75 01 95 0f 81 02
  06 00 ff 09 21 95 0d 81 02
  06 00 ff 09 22 15 00 26 ff 00 75 08 95 34 81 02
  c0`);
const DUALSHOCK_4 = { vendorId: 0x054c, productId: 0x09cc, name: 'Sony Interactive Entertainment Wireless Controller' };
const DUALSENSE = { vendorId: 0x054c, productId: 0x0ce6, name: 'Sony Interactive Entertainment DualSense Wireless Controller' };

// A 64-byte report from either controller. `face` holds the hat in its low four bits (8
// is centred) and Square, Cross, Circle, Triangle above them; `shoulder` is L1, R1, L2, R2,
// Share / Create, Options, L3, R3; `system` is PS, the touchpad and, on a DualSense, mute.
function playstationReport(model, { lx = 128, ly = 128, rx = 128, ry = 128, l2 = 0, r2 = 0, face = 8, shoulder = 0, system = 0 }) {
  const b = Buffer.alloc(64);
  b[0] = 1;
  if (model === 'dualshock4') b.set([lx, ly, rx, ry, face, shoulder, system, l2, r2], 1);
  else b.set([lx, ly, rx, ry, l2, r2, 0, face, shoulder, system], 1);
  return b;
}

// An XINPUT_GAMEPAD, as XInput hands an Xbox controller's state over.
function xboxState({ buttons = 0, lt = 0, rt = 0, lx = 0, ly = 0, rx = 0, ry = 0 }) {
  const b = Buffer.alloc(12);
  b.writeUInt16LE(buttons, 0);
  b.writeUInt8(lt, 2);
  b.writeUInt8(rt, 3);
  b.writeInt16LE(lx, 4);
  b.writeInt16LE(ly, 6);
  b.writeInt16LE(rx, 8);
  b.writeInt16LE(ry, 10);
  return b;
}

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

test('the left-hand Gladiator and the Omni Throttles are the right-hand stick under other names', () => {
  const right = describeDevice(GLADIATOR_LAYOUT, GLADIATOR);
  assert.deepEqual([right.skin, right.support, right.name], ['gladiatorevo', 'full', 'VKB Gladiator NXT EVO']);
  const behaviour = (m) => m.axes.map((a) => [a.id, a.centered, a.invert, a.deadzone]);

  const left = describeDevice(GLADIATOR_LAYOUT, GLADIATOR_LEFT);
  assert.deepEqual([left.key, left.skin, left.support, left.name], ['231d:0201', 'gladiatorevoleft', 'beta', 'VKB Gladiator EVO Left']);
  assert.deepEqual(left.buttonNames, right.buttonNames);
  assert.deepEqual(left.axes, right.axes);
  assert.deepEqual(left.hats, right.hats);

  for (const [device, key, skin, name] of [
    [OMNI_RIGHT, '231d:3200', 'gladiatorotright', 'VKB Omni Throttle Right'],
    [OMNI_LEFT, '231d:3201', 'gladiatorotleft', 'VKB Omni Throttle Left'],
  ]) {
    const omni = describeDevice(OMNI_LAYOUT, device);
    assert.deepEqual([omni.key, omni.skin, omni.support, omni.name], [key, skin, 'beta', name]);
    assert.deepEqual(omni.buttonNames, right.buttonNames);
    // The grip is the throttle, so the wheel on the base is no longer called that.
    assert.deepEqual(omni.axes.map((a) => [a.id, a.name]), [
      ['x', 'Sideways'],
      ['y', 'Throttle'],
      ['rz', 'Twist'],
      ['z', 'Base Wheel'],
      ['rx', 'A1 Stick X'],
      ['ry', 'A1 Stick Y'],
    ]);
    // Whether it springs back is its owner's setup: every axis behaves as on a stick.
    assert.deepEqual(behaviour(omni), behaviour(describeDevice(OMNI_LAYOUT, { ...device, ignoreSkin: true })));
    const rest = normalizeInput(decoded(OMNI_REST), omni, {});
    for (const id of ['x', 'y', 'rz', 'rx', 'ry']) assert.ok(Math.abs(rest.axes[id]) < 0.01, `${id} = ${rest.axes[id]}`);
  }
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

test('the STECS Max is the Standard with an ATEM whose buttons are not named yet', () => {
  const standard = describeDevice(STECS_LAYOUT, STECS);
  const max = describeDevice(STECS_MAX_LAYOUT, STECS_MAX);
  assert.deepEqual([max.key, max.skin, max.support, max.name], ['231d:012e', 'stecsmax', 'beta', 'VKB STECS Max']);
  assert.equal(guessRole(STECS_MAX.name), 'throttle');
  assert.deepEqual(max.buttonNames, standard.buttonNames);
  for (let b = 59; b <= 71; b++) assert.equal(max.buttonNames[`btn${b}`], `Button ${b}`);
  // Its levers are levers too, where the generic defaults would make a stick of them.
  assert.deepEqual(max.axes.map((a) => a.id), ['x', 'y', 'z', 'rx', 'ry', 'rz', 'slider', 'dial']);
  assert.deepEqual(max.axes.slice(0, 2).map((a) => [a.name, a.centered, a.invert]), [['Throttle 1', false, false], ['Throttle 2', false, false]]);
  const generic = describeDevice(STECS_MAX_LAYOUT, { ...STECS_MAX, ignoreSkin: true });
  assert.deepEqual(generic.axes.slice(0, 2).map((a) => [a.centered, a.invert]), [[true, false], [true, true]]);
  // The owner's levers sat together a little short of halfway, and read together.
  const rest = normalizeInput(decoded(STECS_MAX_REST, [5]), max, {});
  assert.equal(rest.axes.x, rest.axes.y);
  assert.ok(rest.axes.x > -0.1 && rest.axes.x < 0);
  const apart = normalizeInput(decoded(STECS_MAX_REST, [5]), generic, {});
  assert.ok(apart.axes.x < 0 && apart.axes.y > 0);
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

test('the STECS Space names its base, its STEM and its axes, and leaves its grip buttons numbered', () => {
  const model = describeDevice(STECS_SPACE_LAYOUT, STECS_SPACE);
  assert.equal(model.key, '231d:0138');
  assert.equal(model.skin, 'stecsspace');
  assert.equal(model.support, 'beta'); // until an owner has confirmed every label
  assert.equal(model.name, 'VKB STECS Space');
  assert.equal(guessRole(STECS_SPACE.name), 'throttle');
  // The base and the STEM are the Modern Throttle's, name for name.
  const modern = describeDevice(STECS_LAYOUT, STECS);
  // Nobody has said which number each control on the grip sends, so 8 to 34 aren't named.
  for (let b = 1; b <= 58; b++) {
    const name = b >= 8 && b <= 34 ? `Button ${b}` : modern.buttonNames[`btn${b}`];
    assert.equal(model.buttonNames[`btn${b}`], name, `btn${b}`);
  }
  assert.equal(model.buttonNames.btn2, 'Red Start');
  assert.equal(model.buttonNames.btn58, 'Flip Switch Down');
  assert.deepEqual(model.axes.map((a) => [a.id, a.name]), [
    ['z', 'Throttle'],
    ['x', 'Grip X'],
    ['y', 'Grip Y'],
    ['rx', 'Brake'],
    ['ry', 'Laser'],
    ['rz', 'Twist (Rz)'],
    ['slider', 'Slider'],
  ]);
  assert.deepEqual(model.hats.map((h) => h.name), ['Hat Switch']);
  // Only the brake and the laser behave differently from the generic defaults: both rest
  // at an end on two owners' throttles, so neither springs back to a middle.
  const generic = describeDevice(STECS_SPACE_LAYOUT, { ...STECS_SPACE, ignoreSkin: true });
  const behaviour = (m) => m.axes.map((a) => [a.id, a.centered, a.invert, a.deadzone]);
  assert.deepEqual(behaviour(model), behaviour(generic).map(([id, centered, ...rest]) => [id, id === 'rx' || id === 'ry' ? false : centered, ...rest]));
  assert.deepEqual(model.axes.filter((a) => a.centered).map((a) => a.id), ['x', 'y', 'rz']);
  // Both owners' throttles at rest: the grip upright, the brake released. Their throttle
  // levers sat in different places.
  const first = normalizeInput(decoded(STECS_SPACE_REST, [3]), model, {});
  const other = describeDevice(STECS_SPACE_LAYOUT_2, STECS_SPACE);
  const second = normalizeInput(decoded(STECS_SPACE_REST_2, [3]), other, {});
  assert.deepEqual(other.axes.map((a) => a.id), ['z', 'x', 'y', 'rx', 'ry']);
  for (const { axes } of [first, second]) {
    for (const id of ['x', 'y']) assert.ok(Math.abs(axes[id]) < 0.01, `${id} = ${axes[id]}`);
    assert.equal(axes.rx, -1);
  }
  assert.ok(Math.abs(first.axes.z) < 0.01 && Math.abs(second.axes.z) > 0.3);
  assert.equal(first.buttons.btn3, true);
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

test('a range Windows hands back as 0 to -1 is read as the unsigned range the stick wrote', () => {
  assert.equal(logicalMax(0, -1, 16), 65535); // 26 FF FF
  assert.equal(logicalMax(0, -1, 8), 255); // 25 FF
  assert.equal(logicalMax(0, -32768, 16), 32768); // 26 00 80
  assert.equal(logicalMax(0, -1, 32), 4294967295);
  assert.equal(logicalMax(0, -1, 12), 255); // a 12-bit field can't hold 65535: it was one byte
  assert.equal(logicalMax(0, -1, 4), 15); // no size fits: the whole field
  // Ranges that already read true are left alone, signed ones included.
  assert.equal(logicalMax(0, 65535, 16), 65535);
  assert.equal(logicalMax(0, 1023, 16), 1023);
  assert.equal(logicalMax(1, 8, 8), 8);
  assert.equal(logicalMax(-32768, 32767, 16), 32767);
  assert.equal(logicalMax(-127, -1, 8), -1);
});

test('values that share a usage are picked out, to be read by their place in the report', () => {
  // The Dual Throttle's two hats (GitHub issue #23) and the Flightdeck stick's three.
  assert.deepEqual(sharedUsages(DUAL_THROTTLE_LAYOUT.values), [0, 1]);
  assert.deepEqual(sharedUsages(FLIGHTDECK_STICK_LAYOUT.values), [8, 9, 10]);
  assert.deepEqual(sharedUsages(FLIGHTDECK_THROTTLE_LAYOUT.values), []);
  assert.deepEqual(sharedUsages(EXTREME_LAYOUT.values), []);
  // The same usage in another collection, or on another page, is a value of its own.
  assert.deepEqual(sharedUsages([{ page: 1, usage: 0x30, link: 1 }, { page: 1, usage: 0x30, link: 2 }, { page: 2, usage: 0x30, link: 1 }]), []);
});

test('the VelocityOne Flightstick II keeps its X and Y, which Windows reports as 0 to -1', () => {
  // As reported, both read as having no range and were dropped: six axes, no stick.
  const before = describeDevice(FLIGHTSTICK_2_REPORTED, { ...FLIGHTSTICK_2, ignoreSkin: true });
  assert.deepEqual(before.axes.map((a) => a.id), ['dial', 'slider', 'rz', 'ry', 'rx', 'z']);
  const model = describeDevice(FLIGHTSTICK_2_LAYOUT, FLIGHTSTICK_2);
  assert.deepEqual(model.axes.map((a) => a.id), ['x', 'y', 'dial', 'slider', 'rz', 'ry', 'rx', 'z']);
  assert.deepEqual(model.axes.slice(0, 2).map((a) => [a.min, a.max]), [[0, 65535], [0, 65535]]);
  const read = (x, y) => normalizeInput(decoded([x, y, ...FLIGHTSTICK_2_REST.slice(2)]), model, {}).axes;
  assert.deepEqual([read(0, 65535).x, read(0, 65535).y], [-1, -1]); // left, and pulled back
  assert.deepEqual([read(65535, 0).x, read(65535, 0).y], [1, 1]);
});

test('the VelocityOne Flightstick II twists on Z and reads its levers on Rz and Slider', () => {
  const model = describeDevice(FLIGHTSTICK_2_LAYOUT, FLIGHTSTICK_2);
  assert.equal(model.key, '10f5:7150');
  assert.equal(model.skin, 'velocityoneflightstick2');
  assert.equal(model.support, 'beta'); // until an owner has confirmed every label
  assert.equal(model.name, 'VelocityOne Flightstick II');
  const axis = Object.fromEntries(model.axes.map((a) => [a.id, [a.name, a.centered, a.invert, a.deadzone]]));
  assert.deepEqual(axis.z, ['Yaw', true, false, 0.1]);
  assert.deepEqual(axis.rz, ['Left Lever', false, false, 0.02]);
  assert.deepEqual(axis.slider, ['Right Lever', false, false, undefined]);
  assert.deepEqual(axis.dial, ['Scroll Wheel', false, true, undefined]); // generic defaults
  assert.deepEqual(model.axes.filter((a) => a.centered).map((a) => a.id), ['x', 'y', 'ry', 'rx', 'z']);
  assert.deepEqual(model.hats.map((h) => h.name), ['Hat 1']);
  assert.equal(model.buttons, 54);
  assert.deepEqual([1, 5, 8, 9, 17, 18, 21, 22, 25, 26, 27, 34, 35].map((b) => model.buttonNames[`btn${b}`]), [
    'B1 Button',
    'Left Lever Top',
    'Right Lever Bottom',
    'Dial Mode 1 Up',
    'Dial Mode 3 Select',
    'POV Push',
    'Scroll Wheel Push',
    'Bumper',
    'Middle Stick Button',
    'Trigger',
    'A Button',
    'Menu Button',
    'Button 35', // not on Turtle Beach's control list
  ]);
  // The owner's last report: everything centred, and both levers read the same way.
  const rest = normalizeInput(decoded(FLIGHTSTICK_2_REST), model, {});
  for (const id of ['x', 'y', 'z', 'rx', 'ry']) assert.ok(Math.abs(rest.axes[id]) < 0.001, `${id} = ${rest.axes[id]}`);
  assert.ok(rest.axes.rz < 0 && rest.axes.slider > 0, 'the left lever below halfway, the right one above');
  const high = normalizeInput(decoded([0x7fff, 0x7fff, 0x7fff, 65535, 65535, 0x7fff, 0x7fff, 65535, 0, 0]), model, {}).axes;
  assert.deepEqual([high.z, high.rz, high.slider], [1, 1, 1]);
  // Without the skin the twist read as a reversed throttle and the levers ran opposite ways.
  const generic = describeDevice(FLIGHTSTICK_2_LAYOUT, { ...FLIGHTSTICK_2, ignoreSkin: true });
  const loose = Object.fromEntries(generic.axes.map((a) => [a.id, [a.centered, a.invert]]));
  assert.deepEqual([loose.z, loose.rz, loose.slider], [[false, true], [true, false], [false, true]]);
  assert.equal(guessRole(FLIGHTSTICK_2.name), null);
});

test('the Flightdeck stick twists on Z and reads its pinkie lever from rest on Rz', () => {
  const model = describeDevice(FLIGHTDECK_STICK_LAYOUT, FLIGHTDECK_STICK);
  assert.equal(model.key, '10f5:7084');
  assert.equal(model.skin, 'flightdeckstick');
  assert.equal(model.support, 'beta'); // until an owner has confirmed every label
  assert.equal(model.name, 'Flightdeck Stick');
  assert.deepEqual(model.axes.map((a) => a.id), ['x', 'y', 'dial', 'slider', 'rz', 'ry', 'rx', 'z']);
  const axis = Object.fromEntries(model.axes.map((a) => [a.id, [a.name, a.centered, a.invert, a.deadzone]]));
  assert.deepEqual(axis.z, ['Yaw', true, false, 0.1]);
  assert.deepEqual(axis.rz, ['Pinkie Lever', false, false, 0.02]);
  assert.deepEqual(axis.slider, ['Thumb Wheel', false, true, undefined]); // generic defaults
  assert.deepEqual(axis.dial, ['Dial', false, true, undefined]); // not on Turtle Beach's control list
  assert.deepEqual(model.axes.filter((a) => a.centered).map((a) => a.id), ['x', 'y', 'ry', 'rx', 'z']);
  assert.deepEqual(model.hats.map((h) => h.name), ['Hat 1', 'Hat 2', 'Hat 3']);
  assert.equal(model.buttons, 40);
  assert.deepEqual([1, 2, 3, 4, 7, 8, 9, 10, 11, 15, 16, 21, 22, 23, 24, 26, 27, 28, 30, 33, 34].map((b) => model.buttonNames[`btn${b}`]), [
    'Fire Button',
    'Trigger Stage 2',
    'Analog POV Push',
    'D-Pad Up',
    'D-Pad Left',
    'Thumb Wheel Push',
    'Shaft Button',
    'Pinkie Lever Full',
    'B11 Button',
    'B15 Button',
    'Left Switch Forward',
    'Right Switch Back',
    'B22 Button',
    'Gear Lever Forward',
    'Gear Lever Back',
    'Rotary Knob Right',
    'Rotary Knob Down',
    'Trigger Stage 1',
    'Thumb Wheel Down',
    'B33 Button',
    'Button 34', // not on Turtle Beach's control list
  ]);

  // The owner's last report: stick, twist and analog POV centred, the pinkie lever let go,
  // the gear lever back and the rotary knob on its right position.
  const rest = normalizeInput(decoded(FLIGHTDECK_STICK_REST, FLIGHTDECK_STICK_HELD), model, {});
  for (const id of ['x', 'y', 'z', 'rx', 'ry']) assert.ok(Math.abs(rest.axes[id]) < 0.001, `${id} = ${rest.axes[id]}`);
  assert.equal(rest.axes.rz, -1);
  assert.deepEqual(Object.keys(rest.buttons).filter((id) => rest.buttons[id]), ['btn24', 'btn26']); // all three hats rest at 0, outside 1–8
  const squeezed = normalizeInput(decoded([0x7fff, 0x7fff, 0, 0x813f, 65535, 0x7fff, 0x7fff, 65535, 1, 3, 0, 0, 0]), model, {});
  assert.deepEqual([squeezed.axes.rz, squeezed.axes.z], [1, 1]);
  assert.deepEqual([squeezed.buttons.hat1_up, squeezed.buttons.hat2_right, squeezed.buttons.hat2_up], [true, true, false]);
  // Without the skin the pinkie lever read as a twist held hard over, and the twist as a lever.
  const generic = describeDevice(FLIGHTDECK_STICK_LAYOUT, { ...FLIGHTDECK_STICK, ignoreSkin: true });
  assert.deepEqual(generic.axes.filter((a) => a.centered).map((a) => a.id), ['x', 'y', 'rz', 'ry', 'rx']);
  assert.equal(normalizeInput(decoded(FLIGHTDECK_STICK_REST), generic, {}).axes.rz, -1);
});

test('the Flightdeck throttle reads its two levers and its flap lever as levers, forward reading high', () => {
  const model = describeDevice(FLIGHTDECK_THROTTLE_LAYOUT, FLIGHTDECK_THROTTLE);
  assert.equal(model.key, '10f5:7085');
  assert.equal(model.skin, 'flightdeckthrottle');
  assert.equal(model.support, 'beta'); // until an owner has confirmed every label
  assert.equal(model.name, 'Flightdeck Throttle');
  assert.deepEqual(model.axes.map((a) => a.id), ['x', 'y', 'dial', 'slider', 'rz', 'ry', 'rx', 'z']);
  const axis = Object.fromEntries(model.axes.map((a) => [a.id, [a.name, a.centered, a.invert, a.deadzone]]));
  assert.deepEqual(axis.x, ['Left Throttle', false, false, undefined]);
  assert.deepEqual(axis.y, ['Right Throttle', false, false, undefined]);
  assert.deepEqual(axis.slider, ['Flap Lever', false, false, undefined]);
  // The two wheels and the knob's dial keep the generic settings.
  assert.deepEqual(axis.rz, ['Thumb Wheel', true, false, 0.1]);
  assert.deepEqual(axis.dial, ['Finger Wheel', false, true, undefined]);
  assert.deepEqual(axis.z, ['Upper Knob', false, true, undefined]);
  assert.deepEqual(model.axes.filter((a) => a.centered).map((a) => a.id), ['rz', 'ry', 'rx']);
  assert.deepEqual(model.hats.map((h) => h.name), ['Thumb Hat']);
  assert.equal(model.buttons, 47);
  assert.deepEqual([1, 2, 4, 5, 6, 7, 10, 11, 12, 15, 16, 17, 18, 19, 20, 22, 23, 24, 27, 28, 30, 31, 33, 34, 36, 39, 40, 41, 42].map((b) => model.buttonNames[`btn${b}`]), [
    'Analog POV Push',
    'Upper Side Button',
    'Lower Side Button',
    'Slide Switch Left',
    'Slide Switch Right',
    'Front Hat Up',
    'Front Hat Left',
    'Front Button',
    'Rocker 1 Up',
    'Rocker 2 Down',
    'Flap Lever Forward',
    'Flap Lever Back',
    'Red Button',
    'Left Throttle Max',
    'Left Throttle Min',
    'Right Throttle Min',
    'Upper Knob Push',
    'Upper Knob Outer Left',
    'Upper Knob Inner Right',
    'Middle Knob Push',
    'Middle Knob Right',
    'Lower Knob Push',
    'Lower Knob Right',
    'Left Throttle Forward',
    'Left Throttle Back',
    'Right Throttle Back',
    'Finger Wheel Up',
    'Finger Wheel Down',
    'Button 42', // not on Turtle Beach's control list
  ]);

  // The owner's last report: both throttles right back, on their Min and Back buttons, and
  // the flap lever right forward, on its Forward button.
  const rest = normalizeInput(decoded(FLIGHTDECK_THROTTLE_REST, FLIGHTDECK_THROTTLE_HELD), model, {});
  assert.deepEqual([rest.axes.x, rest.axes.y, rest.axes.slider], [-1, -1, 1]);
  for (const id of ['rx', 'ry', 'rz']) assert.ok(Math.abs(rest.axes[id]) < 0.001, `${id} = ${rest.axes[id]}`);
  assert.deepEqual(
    Object.keys(rest.buttons).filter((id) => rest.buttons[id]).map((id) => model.buttonNames[id]),
    ['Flap Lever Forward', 'Left Throttle Min', 'Right Throttle Min', 'Left Throttle Back', 'Right Throttle Back'],
  );
  const forward = normalizeInput(decoded([0, 65535, 65535, 0x77ff, 0, 0x7fff, 0x7fff, 0x7fff, 0x7fff, 0]), model, {}).axes;
  assert.deepEqual([forward.x, forward.y, forward.slider], [1, 1, -1]);
  // A Recenter with the levers back leaves them their whole travel.
  assert.equal(normalizeInput(decoded(FLIGHTDECK_THROTTLE_REST), model, { calibration: { x: 0, y: 0 } }).axes.x, -1);
  // Without the skin they read as a stick held in a corner, each lever the other way.
  const generic = describeDevice(FLIGHTDECK_THROTTLE_LAYOUT, { ...FLIGHTDECK_THROTTLE, ignoreSkin: true });
  const loose = normalizeInput(decoded(FLIGHTDECK_THROTTLE_REST), generic, {});
  assert.deepEqual([loose.axes.x, loose.axes.y], [-1, 1]);
});

test('the Dual Throttle reads its levers as levers, forward reading high, and names its two hats', () => {
  const model = describeDevice(DUAL_THROTTLE_LAYOUT, DUAL_THROTTLE);
  assert.equal(model.key, '10f5:7154');
  assert.equal(model.skin, 'velocityonedualthrottle');
  assert.equal(model.support, 'beta'); // until an owner has confirmed every label
  assert.equal(model.name, 'VelocityOne Dual Throttle');
  assert.deepEqual(model.axes.map((a) => a.id), ['x', 'y', 'dial', 'slider', 'rz', 'ry', 'rx', 'z']);
  const axis = Object.fromEntries(model.axes.map((a) => [a.id, [a.name, a.centered, a.invert, a.deadzone]]));
  assert.deepEqual(axis.x, ['Left Throttle', false, false, undefined]);
  assert.deepEqual(axis.y, ['Right Throttle', false, false, undefined]);
  assert.deepEqual(axis.z, ['Small Lever', false, false, undefined]);
  // The two wheels keep the generic settings, and so does the Slider, which isn't on
  // Turtle Beach's control list.
  assert.deepEqual(axis.rz, ['Thumb Wheel', true, false, 0.1]);
  assert.deepEqual(axis.dial, ['Finger Wheel', false, true, undefined]);
  assert.deepEqual(axis.slider, ['Slider', false, true, undefined]);
  assert.deepEqual(model.axes.filter((a) => a.centered).map((a) => a.id), ['rz', 'ry', 'rx']);
  assert.deepEqual(model.hats.map((h) => [h.id, h.name, h.index]), [['hat1', 'Thumb Hat', 0], ['hat2', 'Front Hat', 1]]);
  assert.equal(model.buttons, 47);
  assert.deepEqual([1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 18, 20, 21, 22, 23, 24, 25, 26, 27, 28].map((b) => model.buttonNames[`btn${b}`]), [
    'Analog POV Push',
    'B2 Button',
    'B4 Button',
    'Finger Wheel Up',
    'Finger Wheel Down',
    'Finger Wheel Push',
    'Ring Finger Button',
    'Pinkie Button',
    'Small Lever Up',
    'Small Lever Down',
    'B12 Button',
    'B14 Button',
    'Toggle 1 Up',
    'Toggle 2 Down',
    'Toggle 3 Down',
    'Dial Up',
    'Dial Down',
    'Dial Push',
    'Left Throttle Detent Up',
    'Left Throttle Detent Down',
    'Right Throttle Detent Up',
    'Right Throttle Detent Down',
    'Button 28', // not on Turtle Beach's control list
  ]);

  // The owner's last report: both levers four fifths of the way forward, nothing held.
  const rest = normalizeInput(decoded(DUAL_THROTTLE_REST), model, {});
  for (const [id, value] of [['x', 0.6006], ['y', 0.6006], ['z', -0.3281]]) assert.ok(Math.abs(rest.axes[id] - value) < 0.001, `${id} = ${rest.axes[id]}`);
  for (const id of ['rx', 'ry', 'rz']) assert.ok(Math.abs(rest.axes[id]) < 0.001, `${id} = ${rest.axes[id]}`);
  assert.deepEqual(Object.keys(rest.buttons).filter((id) => rest.buttons[id]), []);
  const forward = normalizeInput(decoded([0, 0, 65535, 65535, 0x80ff, 0, 0x7fff, 0x7fff, 0x7fff, 65535, 0]), model, {}).axes;
  assert.deepEqual([forward.x, forward.y, forward.z], [1, 1, 1]);
  // A Recenter with the levers anywhere leaves them their whole travel.
  assert.equal(normalizeInput(decoded(DUAL_THROTTLE_REST), model, { calibration: { x: 0xcce0, y: 0xcce0 } }).axes.x, rest.axes.x);
  // Each hat presses its own directions: the thumb hat up, the front hat down.
  const hats = normalizeInput(decoded([1, 5, ...DUAL_THROTTLE_REST.slice(2)]), model, {}).buttons;
  assert.deepEqual(['hat1_up', 'hat1_down', 'hat2_up', 'hat2_down'].map((id) => hats[id]), [true, false, false, true]);
  // Without the skin the levers read as a stick, the right one the other way to the left.
  const generic = describeDevice(DUAL_THROTTLE_LAYOUT, { ...DUAL_THROTTLE, ignoreSkin: true });
  const loose = normalizeInput(decoded(DUAL_THROTTLE_REST), generic, {});
  assert.ok(loose.axes.x > 0.6 && loose.axes.y < -0.6, `${loose.axes.x}, ${loose.axes.y}`);
  assert.deepEqual(generic.hats.map((h) => h.name), ['Hat Switch', 'Hat 2']);
});

test('the Flightstick II and the Dual Throttle take the stick and throttle roles whichever order they are found in', () => {
  const stick = { id: '10f5:7150', name: FLIGHTSTICK_2.name };
  const throttle = { id: '10f5:7154', name: DUAL_THROTTLE.name };
  const roles = { [stick.id]: 'stick', [throttle.id]: 'throttle' };
  assert.deepEqual(assignRoles([stick, throttle]), roles);
  assert.deepEqual(assignRoles([throttle, stick]), roles);
});

test('the Flightdeck pair take the stick and throttle roles whichever order they are found in', () => {
  const stick = { id: '10f5:7084', name: FLIGHTDECK_STICK.name };
  const throttle = { id: '10f5:7085', name: FLIGHTDECK_THROTTLE.name };
  const roles = { [stick.id]: 'stick', [throttle.id]: 'throttle' };
  assert.deepEqual(assignRoles([stick, throttle]), roles);
  assert.deepEqual(assignRoles([throttle, stick]), roles);
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

test('the URSA MINOR Combat stick reads its twist on Z as a twist, right reading positive', () => {
  const model = describeDevice(URSA_STICK_LAYOUT, URSA_STICK);
  assert.equal(model.key, '4098:bc2a');
  assert.equal(model.skin, 'ursaminorcombatstick');
  assert.equal(model.support, 'beta'); // until an owner has confirmed every label
  assert.equal(model.name, 'URSA MINOR Combat Stick');
  assert.deepEqual(model.axes.map((a) => a.id), ['x', 'y', 'z', 'rx', 'ry', 'slider']);
  const axis = Object.fromEntries(model.axes.map((a) => [a.id, [a.name, a.centered, a.invert, a.deadzone]]));
  assert.deepEqual(axis.z, ['Yaw', true, true, 0.1]);
  // The rest are where the generic defaults expect them.
  assert.deepEqual(axis.x, ['Roll', true, false, undefined]);
  assert.deepEqual(axis.y, ['Pitch', true, true, undefined]);
  assert.deepEqual(axis.rx, ['Ministick X', true, false, undefined]);
  assert.deepEqual(axis.ry, ['Ministick Y', true, true, undefined]);
  assert.deepEqual(axis.slider, ['Throttle', false, true, undefined]);
  assert.deepEqual(model.hats.map((h) => h.name), ['POV Hat']);
  assert.equal(model.buttons, 128);
  assert.deepEqual([1, 7, 8, 14, 15, 20, 22, 23, 24, 27, 28, 29, 30, 33, 34, 35, 36, 37, 38, 39, 40, 41, 43, 45, 48, 49].map((b) => model.buttonNames[`btn${b}`]), [
    'Base Button 1',
    'Base Button 7',
    'Base Button 8',
    'Base Button 14',
    'Button 15', // not on WINWING's diagram
    'Red Button',
    'Upper Grey Button',
    'Side Hat Push',
    'Side Hat Right',
    'Side Hat Up',
    'Lower Grey Button',
    'Lower Hat Push',
    'Lower Hat Up',
    'Lower Hat Left',
    'Ministick Push',
    'Paddle Up',
    'Paddle Down',
    'Trigger Stage 1',
    'Trigger Stage 2',
    'Pinkie Button',
    'Grip Hat Push',
    'Grip Hat Down',
    'Grip Hat Up',
    'Ministick Up',
    'Ministick Left',
    'Button 49',
  ]);

  // The owner's last report: the stick, the ministick and the hat let go, the slider at
  // MAX, and the twist part way to the left.
  const rest = normalizeInput(decoded(URSA_STICK_REST), model, {});
  for (const id of ['x', 'y', 'rx', 'ry']) assert.ok(Math.abs(rest.axes[id]) < 0.001, `${id} = ${rest.axes[id]}`);
  assert.equal(rest.axes.slider, 1);
  assert.ok(Math.abs(rest.axes.z + 0.389) < 0.001, `z = ${rest.axes.z}`);
  assert.deepEqual(Object.keys(rest.buttons).filter((id) => rest.buttons[id]), []);
  // A Recenter takes wherever the twist rests as its middle.
  assert.equal(normalizeInput(decoded(URSA_STICK_REST), model, { calibration: { z: 0xb1d4 } }).axes.z, 0);
  // WINWING's diagram has the twist reading 65535 to the left and 0 to the right.
  const twist = (z) => normalizeInput(decoded([15, 0x8000, 0x8000, z, 0x800, 0x800, 0, 0]), model, {}).axes.z;
  assert.deepEqual([twist(0), twist(65535)], [1, -1]);
  // Without the skin the twist read as a throttle lever, the slider's other half.
  const generic = describeDevice(URSA_STICK_LAYOUT, { ...URSA_STICK, ignoreSkin: true });
  assert.equal(generic.axes.find((a) => a.id === 'z').centered, false);
});

test('the URSA MINOR Combat throttle reads its levers as levers, and its finger wheel and ministick as centred', () => {
  const model = describeDevice(URSA_THROTTLE_LAYOUT, URSA_THROTTLE);
  assert.equal(model.key, '4098:b970');
  assert.equal(model.skin, 'ursaminorcombatthrottle');
  assert.equal(model.support, 'beta'); // until an owner has confirmed every label
  assert.equal(model.name, 'URSA MINOR Combat Throttle');
  const axis = Object.fromEntries(model.axes.map((a) => [a.id, [a.name, a.centered, a.invert, a.deadzone]]));
  assert.deepEqual(axis.rx, ['Right Throttle', false, true, undefined]);
  assert.deepEqual(axis.ry, ['Left Throttle', false, true, undefined]);
  // Which of X / Y and Rx / Ry are the levers isn't known: neither pair springs back.
  assert.deepEqual(axis.x, ['X Axis', false, false, undefined]);
  assert.deepEqual(axis.y, ['Y Axis', false, false, undefined]);
  assert.deepEqual(axis.z, ['Finger Wheel', true, true, undefined]);
  assert.deepEqual(axis.rz, ['Knob', false, false, 0.02]);
  assert.deepEqual(axis.slider, ['Ministick X', true, false, undefined]);
  assert.deepEqual(axis.dial, ['Ministick Y', true, true, undefined]);
  assert.deepEqual(model.axes.filter((a) => a.centered).map((a) => a.id), ['z', 'slider', 'dial']);
  assert.deepEqual(model.hats, []);
  assert.equal(model.buttons, 90);
  assert.deepEqual([1, 26, 27, 28, 29, 30, 31, 33, 34, 36, 40, 41, 42, 45, 46, 47, 50, 51, 52, 55, 56, 57, 58, 59, 60, 61, 62].map((b) => model.buttonNames[`btn${b}`]), [
    'Button 1', // the base isn't on WINWING's diagram
    'Button 26',
    'Thumb Button',
    'Inner Finger Button',
    'Outer Finger Button',
    'Thumb Switch Up',
    'Thumb Switch Middle',
    'Toggle Up',
    'Toggle Middle',
    'Rear Hat Up',
    'Rear Hat Push',
    'Front Hat Left',
    'Front Hat Up',
    'Front Hat Push',
    'Top Hat Left',
    'Top Hat Up',
    'Top Hat Push',
    'Ministick Push',
    'Ministick Up',
    'Ministick Left',
    'Knob Push',
    'Finger Wheel Middle',
    'Finger Wheel Up',
    'Finger Wheel Down',
    'Slide Switch Left',
    'Slide Switch Right',
    'Button 62', // nor is the EX module
  ]);

  // The owner's last report: all four of X, Y, Rx and Ry read as pulled right back, and
  // the finger wheel and the knob as in the middle.
  const rest = normalizeInput(decoded(URSA_THROTTLE_REST, URSA_THROTTLE_HELD), model, {});
  assert.deepEqual(['x', 'y', 'rx', 'ry'].map((id) => rest.axes[id]), [-1, -1, -1, -1]);
  for (const id of ['z', 'rz']) assert.ok(Math.abs(rest.axes[id]) < 0.001, `${id} = ${rest.axes[id]}`);
  // Pushed forward, Rx and Ry read 0.
  const forward = normalizeInput(decoded([65535, 65535, 0x8000, 0, 0, 0x8000, 0, 0, 0, 0, 0, 0]), model, {}).axes;
  assert.deepEqual(['x', 'y', 'rx', 'ry'].map((id) => forward[id]), [1, 1, 1, 1]);
  // Switched to analog, the ministick rests in the middle and reads right and up as positive.
  const ministick = (slider, dial) => {
    const { axes } = normalizeInput(decoded([0, 0, 0x8000, 0xffff, 0xffff, 0x8000, slider, dial, 0, 0, 0, 0]), model, {});
    return [axes.slider, axes.dial];
  };
  assert.ok(ministick(0x8000, 0x8000).every((v) => Math.abs(v) < 0.001));
  assert.deepEqual(ministick(65535, 0), [1, 1]);
  // Every handle control it was holding is a switch resting in a named position; the rest
  // are on the base and the EX module.
  const held = URSA_THROTTLE_HELD.map((b) => model.buttonNames[`btn${b}`]);
  assert.deepEqual(
    held.filter((name) => !name.startsWith('Button ')),
    ['Thumb Switch Middle', 'Toggle Middle', 'Finger Wheel Middle', 'Slide Switch Right'],
  );
  // Without the skin the four read as two sticks held in opposite corners, and the knob
  // as a twist.
  const generic = describeDevice(URSA_THROTTLE_LAYOUT, { ...URSA_THROTTLE, ignoreSkin: true });
  const loose = normalizeInput(decoded(URSA_THROTTLE_REST), generic, {}).axes;
  assert.deepEqual([loose.x, loose.y, loose.rx, loose.ry], [-1, 1, 1, -1]);
  assert.equal(generic.axes.find((a) => a.id === 'rz').centered, true);
});

test('the URSA MINOR Combat pair take the stick and throttle roles whichever order they are found in', () => {
  const stick = { id: '4098:bc2a', name: URSA_STICK.name };
  const throttle = { id: '4098:b970', name: URSA_THROTTLE.name };
  const roles = { [stick.id]: 'stick', [throttle.id]: 'throttle' };
  assert.deepEqual(assignRoles([stick, throttle]), roles);
  assert.deepEqual(assignRoles([throttle, stick]), roles);
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

test('the Sol-R sticks name the axes an owner found them on, and each has its POV hat on its own side', () => {
  for (const [stick, skin, name, pov] of [
    [SOL_R_RIGHT, 'solrright', 'Sol-R Right Stick', 'Right Hat'],
    [SOL_R_LEFT, 'solrleft', 'Sol-R Left Stick', 'Left Hat'],
  ]) {
    const model = describeDevice(SOL_R_LAYOUT, stick);
    assert.equal(model.skin, skin);
    assert.equal(model.support, 'beta');
    assert.equal(model.name, name);
    assert.equal(model.buttons, 44);
    assert.deepEqual(model.axes.map((a) => a.id), ['dial', 'slider', 'rx', 'ry', 'rz', 'z', 'y', 'x']); // the vendor byte isn't one
    const axis = Object.fromEntries(model.axes.map((a) => [a.id, [a.name, a.centered, a.invert, a.deadzone]]));
    assert.deepEqual(axis.z, ['Thrust', false, true, undefined]);
    assert.deepEqual(axis.rx, ['Ministick X', true, false, undefined]);
    assert.deepEqual(axis.ry, ['Ministick Y', true, true, undefined]);
    assert.deepEqual(axis.rz, ['Twist', true, false, 0.1]);
    assert.deepEqual(axis.slider, ['Slider', false, true, undefined]); // the two spares keep their generic ones
    assert.equal(model.axes.find((a) => a.id === 'slider').hint, '');
    // Named, but behaving exactly as it would without the skin: the generic defaults fit.
    const generic = describeDevice(SOL_R_LAYOUT, { ...stick, ignoreSkin: true });
    const behaviour = (m) => m.axes.map((a) => [a.id, a.centered, a.invert, a.deadzone]);
    assert.deepEqual(behaviour(model), behaviour(generic));

    assert.deepEqual(model.hats.map((h) => h.name), [pov]);
    assert.equal(model.buttonNames.btn20, 'Rotary 1');
    assert.equal(model.buttonNames.btn25, 'Trigger Stage 2');
    assert.equal(model.buttonNames.btn30, 'Left Hat Push');
    assert.equal(model.buttonNames.btn40, 'Right Hat Push');
    assert.equal(model.buttonNames.btn17, 'Right Pad Top Left'); // 17 is above 19, and left of 16

    // At rest only the thrust lever and the rotary's first position stand out.
    const rest = normalizeInput(decoded(SOL_R_REST, SOL_R_HELD), model, {});
    for (const id of ['x', 'y', 'rx', 'ry', 'rz', 'slider', 'dial']) assert.ok(Math.abs(rest.axes[id]) < 0.01, `${id} = ${rest.axes[id]}`);
    assert.ok(rest.axes.z < -0.17 && rest.axes.z > -0.18, `z = ${rest.axes.z}`);
    assert.deepEqual(Object.keys(rest.buttons).filter((id) => rest.buttons[id]), ['btn20']);
  }
  // The hat that isn't the POV sends its directions as the four buttons after its push;
  // the other hat's four are never sent, so they stay unnamed.
  const [right, left] = [SOL_R_RIGHT, SOL_R_LEFT].map((stick) => describeDevice(SOL_R_LAYOUT, stick).buttonNames);
  assert.deepEqual([31, 32, 33, 34].map((b) => right[`btn${b}`]), ['Left Hat Up', 'Left Hat Right', 'Left Hat Down', 'Left Hat Left']);
  assert.deepEqual([41, 44].map((b) => right[`btn${b}`]), ['Button 41', 'Button 44']);
  assert.deepEqual([41, 42, 43, 44].map((b) => left[`btn${b}`]), ['Right Hat Up', 'Right Hat Right', 'Right Hat Down', 'Right Hat Left']);
  assert.deepEqual([31, 34].map((b) => left[`btn${b}`]), ['Button 31', 'Button 34']);
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

test('the X56 throttle reads its two levers as levers, the same way round, and its G rotary as a knob', () => {
  const model = describeDevice(X56_THROTTLE_LAYOUT, X56_THROTTLE);
  assert.equal(model.skin, 'x56throttle');
  assert.equal(model.support, 'beta');
  assert.equal(model.name, 'Logitech X56 Throttle');
  assert.equal(model.buttons, 36);
  const axis = Object.fromEntries(model.axes.map((a) => [a.id, [a.name, a.centered, a.invert, a.deadzone]]));
  assert.deepEqual(axis.x, ['Left Throttle', false, true, undefined]);
  assert.deepEqual(axis.y, ['Right Throttle', false, true, undefined]);
  assert.deepEqual(axis.rz, ['G Rotary', false, false, 0.02]);
  assert.deepEqual(axis.z, ['F Rotary', false, true, undefined]); // as any Z: no override needed
  assert.deepEqual(axis.rx, ['Ministick X', true, false, undefined]);
  assert.deepEqual(axis.slider, ['RTY 3', false, true, undefined]);
  assert.deepEqual(model.axes.filter((a) => a.centered).map((a) => a.id), ['ry', 'rx']); // only the ministick springs back
  assert.deepEqual([1, 4, 5, 6, 11, 12, 19, 20, 27, 28, 31, 32, 33, 34, 36].map((b) => model.buttonNames[`btn${b}`]), [
    'E Button',
    'I Button',
    'H Button',
    'SW 1',
    'SW 6',
    'TGL 1 Up',
    'TGL 4 Down',
    'H3 Up',
    'H4 Back',
    'K1 Up',
    'Scroll Back',
    'Ministick Push',
    'SLD Switch',
    'Mode M1',
    'Mode S1',
  ]);

  // The owner's last report: both levers at raw 0, which reads as fully forward on both.
  const rest = normalizeInput(decoded([0, 0, 0x14, 0x71, 0x80, 0x80, 0x7f, 0x7f], [34]), model, {});
  assert.equal(rest.axes.x, 1);
  assert.equal(rest.axes.y, 1);
  assert.deepEqual(Object.keys(rest.buttons).filter((id) => rest.buttons[id]), ['btn34']);
  // Without the skin they read as a stick held in a corner, each lever the other way.
  const generic = describeDevice(X56_THROTTLE_LAYOUT, { ...X56_THROTTLE, ignoreSkin: true });
  assert.deepEqual(generic.axes.filter((a) => a.centered).map((a) => a.id), ['y', 'x', 'ry', 'rz', 'rx']);
  const loose = normalizeInput(decoded([0, 0, 0x14, 0x71, 0x80, 0x80, 0x7f, 0x7f]), generic, {});
  assert.deepEqual([loose.axes.x, loose.axes.y], [-1, 1]);
  assert.equal(guessRole(X56_THROTTLE.name), 'throttle');
  assert.equal(guessRole(X56_STICK.name), null);
});

test('the X56 stick only needs names: its axes are where any stick has them', () => {
  const model = describeDevice(X56_STICK_LAYOUT, X56_STICK);
  assert.equal(model.skin, 'x56stick');
  assert.equal(model.support, 'beta');
  assert.equal(model.name, 'Logitech X56 Stick');
  const generic = describeDevice(X56_STICK_LAYOUT, { ...X56_STICK, ignoreSkin: true });
  const behaviour = (m) => m.axes.map((a) => [a.id, a.centered, a.invert, a.deadzone]);
  assert.deepEqual(behaviour(model), behaviour(generic));
  assert.deepEqual(model.axes.map((a) => a.name), ['Roll', 'Pitch', 'Yaw', 'C Stick X', 'C Stick Y']);
  assert.deepEqual(model.hats.map((h) => h.name), ['POV Hat']);
  assert.deepEqual([1, 2, 4, 6, 7, 8, 9, 10, 11, 14, 15].map((b) => model.buttonNames[`btn${b}`]), [
    'Trigger',
    'A Button',
    'C Stick Push',
    'Pinkie Lever',
    'H1 Up',
    'H1 Right',
    'H1 Down',
    'H1 Left',
    'H2 Up',
    'H2 Left',
    'Button 15',
  ]);
});

test('an Xbox controller is decoded from XInput: every button, the D-pad as a hat, both triggers', () => {
  const parser = new XboxPadParser();
  assert.equal(parser.layout, XBOX_LAYOUT);
  const model = describeDevice(parser.layout, XBOX_PAD);
  assert.equal(model.key, '045e:028e');
  assert.equal(model.skin, 'xboxcontroller');
  assert.equal(model.name, 'Xbox Controller');
  assert.equal(model.buttons, 10);
  assert.deepEqual(model.axes.map((a) => [a.id, a.name, a.centered, a.invert]), [
    ['x', 'Left Stick X', true, false],
    ['y', 'Left Stick Y', true, true],
    ['rx', 'Right Stick X', true, false],
    ['ry', 'Right Stick Y', true, true],
    ['z', 'Left Trigger', false, false],
    ['rz', 'Right Trigger', false, false],
  ]);
  const read = (state) => normalizeInput(parser.decode(xboxState(state)), model, {});
  const held = (state) => Object.keys(read(state).buttons).filter((id) => read(state).buttons[id]);

  const rest = read({});
  assert.deepEqual(held({}), []);
  assert.deepEqual([rest.axes.z, rest.axes.rz], [-1, -1]); // a trigger at rest is at the bottom of its travel
  for (const id of ['x', 'y', 'rx', 'ry']) assert.ok(Math.abs(rest.axes[id]) < 0.001, id);

  const names = (ids) => ids.map((id) => model.buttonNames[id]);
  assert.deepEqual(names(held({ buttons: XUSB.A | XUSB.B | XUSB.X | XUSB.Y })), ['A Button', 'B Button', 'X Button', 'Y Button']);
  assert.deepEqual(names(held({ buttons: XUSB.LEFT_SHOULDER | XUSB.RIGHT_SHOULDER })), ['Left Bumper', 'Right Bumper']);
  assert.deepEqual(names(held({ buttons: XUSB.BACK | XUSB.START })), ['View Button', 'Menu Button']);
  assert.deepEqual(names(held({ buttons: XUSB.LEFT_THUMB | XUSB.RIGHT_THUMB })), ['Left Stick Click', 'Right Stick Click']);
  assert.deepEqual(held({ buttons: XUSB.DPAD_UP }), ['hat1_up']);
  assert.deepEqual(held({ buttons: XUSB.DPAD_UP | XUSB.DPAD_RIGHT }), ['hat1_up', 'hat1_right']);
  assert.deepEqual(held({ buttons: XUSB.DPAD_DOWN | XUSB.DPAD_LEFT }), ['hat1_down', 'hat1_left']);
  assert.deepEqual(held({ buttons: XUSB.GUIDE }), []); // Windows keeps the Xbox button

  // Up and right are positive, as on every stick here.
  const pushed = read({ lx: 32767, ly: 32767, rx: -32768, ry: -32768, lt: 255, rt: 0 });
  assert.deepEqual([pushed.axes.x, pushed.axes.y, pushed.axes.rx, pushed.axes.ry], [1, 1, -1, -1]);
  assert.deepEqual([pushed.axes.z, pushed.axes.rz], [1, -1]);
});

test('the Xbox Controller template maps a controller to itself', () => {
  const parser = new XboxPadParser();
  const model = describeDevice(parser.layout, XBOX_PAD);
  const bindings = presetBindings('xbox-controller');
  assert.equal(PRESETS.find((p) => p.id === 'xbox-controller').skin, 'xboxcontroller');
  const through = (state) => mapInput(normalizeInput(parser.decode(xboxState(state)), model, {}), bindings);
  const every = Object.values(XUSB).reduce((all, bit) => all | bit, 0) & ~XUSB.GUIDE;
  for (const state of [
    { buttons: 0, lt: 0, rt: 0, lx: 0, ly: 0, rx: 0, ry: 0 },
    { buttons: XUSB.A | XUSB.DPAD_LEFT | XUSB.LEFT_THUMB, lt: 255, rt: 128, lx: 32767, ly: -20000, rx: -12345, ry: 500 },
    { buttons: every & ~(XUSB.DPAD_DOWN | XUSB.DPAD_RIGHT), lt: 1, rt: 254, lx: -32767, ly: 32767, rx: 9, ry: -9 },
  ]) {
    const out = through(state);
    assert.equal(out.buttons, state.buttons);
    assert.deepEqual([out.lt, out.rt], [state.lt, state.rt]);
    // A stick's two halves aren't quite the same length, so it may come out a step or two off.
    for (const id of ['lx', 'ly', 'rx', 'ry']) assert.ok(Math.abs(out[id] - state[id]) <= 2, `${id}: ${state[id]} -> ${out[id]}`);
  }
});

test('an Elite is an Xbox controller with its own photo, told apart by its product ID', () => {
  for (const product of [0x02e3, 0x0b00, 0x0b05, 0x0b22]) assert.equal(isEliteProduct(0x045e, product), true);
  assert.equal(isEliteProduct(0x045e, 0x028e), false); // a 360 controller, and this app's virtual pad
  assert.equal(isEliteProduct(0x045e, 0x0b12), false); // an Xbox Series controller
  assert.equal(isEliteProduct(0x0e6f, 0x0b00), false);
  const elite = describeDevice(XBOX_LAYOUT, XBOX_ELITE_PAD);
  const plain = describeDevice(XBOX_LAYOUT, XBOX_PAD);
  assert.equal(elite.skin, 'xboxelite');
  assert.equal(elite.name, 'Xbox Elite Controller');
  assert.equal(elite.support, 'beta');
  // The same controls, behaving the same: the paddles aren't there to read.
  assert.deepEqual(elite.axes, plain.axes);
  assert.deepEqual(elite.buttonNames, plain.buttonNames);
  assert.deepEqual(presetBindings('xbox-elite-controller'), presetBindings('xbox-controller'));
  assert.equal(PRESETS.find((p) => p.id === 'xbox-elite-controller').skin, 'xboxelite');
  assert.equal(guessRole(XBOX_ELITE_PAD.name), 'extra');
});

test('PlayStation controllers read their right stick and triggers where they are', () => {
  for (const [bytes, device, skin, name, buttons, create] of [
    [DUALSHOCK_4_DESCRIPTOR, DUALSHOCK_4, 'dualshock4', 'DualShock 4', 14, 'Share'],
    [DUALSENSE_DESCRIPTOR, DUALSENSE, 'dualsense', 'DualSense', 15, 'Create'],
  ]) {
    const parser = new HidDescriptorParser(bytes);
    assert.equal(parser.layout.reportLength, 64);
    const model = describeDevice(parser.layout, device);
    assert.equal(model.skin, skin);
    assert.equal(model.name, name);
    assert.equal(model.support, 'beta');
    assert.equal(model.buttons, buttons);
    const axis = Object.fromEntries(model.axes.map((a) => [a.id, [a.name, a.centered, a.invert]]));
    assert.deepEqual(axis, {
      x: ['Left Stick X', true, false],
      y: ['Left Stick Y', true, true],
      z: ['Right Stick X', true, false],
      rz: ['Right Stick Y', true, true],
      rx: ['L2', false, false],
      ry: ['R2', false, false],
    });
    assert.deepEqual([1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 14].map((b) => model.buttonNames[`btn${b}`]), [
      'Square',
      'Cross',
      'Circle',
      'Triangle',
      'L1',
      'R1',
      create,
      'Options',
      'L3',
      'R3',
      'PS Button',
      'Touchpad Click',
    ]);
    assert.equal(model.buttonNames.btn15, skin === 'dualsense' ? 'Mute' : undefined);
    // Without the skin the right stick read as a lever and a twist, and the triggers as a
    // second stick held in a corner.
    const generic = describeDevice(parser.layout, { ...device, ignoreSkin: true });
    assert.deepEqual(generic.axes.filter((a) => !a.centered).map((a) => a.id), ['z']);

    const read = (state) => normalizeInput(parser.decode(playstationReport(skin, state)), model, {});
    const held = (state) => Object.keys(read(state).buttons).filter((id) => read(state).buttons[id]);
    const rest = read({});
    assert.deepEqual(held({}), []);
    assert.deepEqual([rest.axes.rx, rest.axes.ry], [-1, -1]);
    for (const id of ['x', 'y', 'z', 'rz']) assert.ok(Math.abs(rest.axes[id]) < 0.01, id);
    const pushed = read({ lx: 255, ly: 0, rx: 0, ry: 255, l2: 255, r2: 0 });
    assert.deepEqual([pushed.axes.x, pushed.axes.y, pushed.axes.z, pushed.axes.rz], [1, 1, -1, -1]); // right and up are positive
    assert.deepEqual([pushed.axes.rx, pushed.axes.ry], [1, -1]);
    assert.deepEqual(held({ face: 8 | 0x20 }).map((id) => model.buttonNames[id]), ['Cross']);
    assert.deepEqual(held({ face: 2 }), ['hat1_right']);
    assert.deepEqual(held({ shoulder: 0x01 | 0x20, system: 0x01 }).map((id) => model.buttonNames[id]), ['L1', 'Options', 'PS Button']);

    // Its template is the Xbox controller a game expects: each control to the one in its place.
    const bindings = presetBindings(skin === 'dualshock4' ? 'dualshock-4' : 'dualsense');
    const out = (state) => mapInput(read(state), bindings);
    assert.equal(out({ face: 8 | 0x10 }).buttons, XUSB.X); // Square
    assert.equal(out({ face: 8 | 0x20 }).buttons, XUSB.A); // Cross
    assert.equal(out({ face: 8 | 0x40 }).buttons, XUSB.B); // Circle
    assert.equal(out({ face: 8 | 0x80 }).buttons, XUSB.Y); // Triangle
    assert.equal(out({ face: 0 }).buttons, XUSB.DPAD_UP);
    assert.equal(out({ shoulder: 0x01 | 0x02 }).buttons, XUSB.LEFT_SHOULDER | XUSB.RIGHT_SHOULDER);
    assert.equal(out({ shoulder: 0x10 | 0x20 }).buttons, XUSB.BACK | XUSB.START);
    assert.equal(out({ shoulder: 0x40 | 0x80 }).buttons, XUSB.LEFT_THUMB | XUSB.RIGHT_THUMB);
    // A pulled trigger is its axis; the button it also presses (7 or 8) adds nothing.
    assert.deepEqual(out({ l2: 255, r2: 128, shoulder: 0x04 | 0x08 }), { ...out({}), lt: 255, rt: 128 });
    const sticks = out({ lx: 255, ly: 0, rx: 0, ry: 255 });
    assert.deepEqual([sticks.lx, sticks.ly, sticks.rx, sticks.ry], [32767, 32767, -32767, -32767]);
  }
});

test('only the gamepads with a skin of their own are read over HID, and beside a stick they are extras', () => {
  for (const product of [0x05c4, 0x09cc, 0x0ba0, 0x0ce6, 0x0df2]) assert.equal(isKnownGamepad(0x054c, product), true);
  assert.equal(SKINS['054c:05c4'].id, 'dualshock4');
  assert.equal(SKINS['054c:0ba0'].id, 'dualshock4');
  assert.equal(SKINS['054c:0df2'].id, 'dualsense');
  assert.equal(isKnownGamepad(0x045e, 0x028e), false); // Xbox controllers come through XInput instead
  assert.equal(isKnownGamepad(0x045e, 0x02ea), false);
  assert.equal(isKnownGamepad(0x046d, 0xc215), false); // a joystick needs no such leave
  assert.equal(isKnownGamepad(0x057e, 0x2009), false); // a gamepad nobody has described yet
  assert.equal(guessRole(DUALSHOCK_4.name), 'extra');
  assert.equal(guessRole(DUALSENSE.name), 'extra');
  const stick = { id: '046d:c215', name: 'Logitech Extreme 3D' };
  const pad = { id: '054c:0ce6', name: DUALSENSE.name };
  assert.deepEqual(assignRoles([pad, stick]), { [stick.id]: 'stick', [pad.id]: 'extra' });
  assert.deepEqual(assignRoles([pad]), { [pad.id]: 'stick' });
});

test('an Xbox controller beside a flight stick is an extra device, and on its own it is the stick', () => {
  const stick = { id: '046d:c215', name: 'Logitech Extreme 3D' };
  const pad = { id: deviceKey(XBOX_PAD.vendorId, XBOX_PAD.productId), name: XBOX_PAD.name };
  assert.equal(guessRole(pad.name), 'extra');
  assert.deepEqual(assignRoles([stick, pad]), { [stick.id]: 'stick', [pad.id]: 'extra' });
  assert.deepEqual(assignRoles([pad, stick]), { [stick.id]: 'stick', [pad.id]: 'extra' });
  assert.deepEqual(assignRoles([pad]), { [pad.id]: 'stick' });
  // Once it has been seen beside the stick it stays an extra, so the stick's profile never drives it.
  assert.deepEqual(assignRoles([pad], { [stick.id]: 'stick', [pad.id]: 'extra' }), { [pad.id]: 'extra' });
});

test('a press too short to see is held, and an ordinary one is left alone', () => {
  const hold = pressHolder();
  const state = (...down) => ({ buttons: { btn19: down.includes(19), btn20: down.includes(20), btn1: down.includes(1) }, axes: { x: 0.5 } });
  assert.equal(MIN_PRESS_MS, 80);

  // A scroll wheel's click: down for 4 ms. It stays down until 80 ms after it began.
  let now = 1000;
  assert.deepEqual(hold(state(19), now), { input: state(19), wait: null });
  let held = hold(state(), (now += 4));
  assert.equal(held.input.buttons.btn19, true);
  assert.equal(held.wait, 76);
  assert.deepEqual(held.input.axes, { x: 0.5 });
  assert.equal(hold(state(), now + 40).input.buttons.btn19, true);
  held = hold(state(), now + 76);
  assert.deepEqual(held, { input: state(), wait: null });

  // The trigger, held for a quarter of a second, lets go the moment it is released.
  now = 5000;
  hold(state(1), now);
  const released = state();
  assert.equal(hold(released, now + 250).input, released);

  // Clicks in a row each get their time, and the other direction is its own button.
  now = 9000;
  hold(state(19), now);
  hold(state(), now + 3);
  hold(state(19), now + 30);
  held = hold(state(20), now + 33);
  assert.deepEqual([held.input.buttons.btn19, held.input.buttons.btn20, held.wait], [true, true, 77]);
  held = hold(state(), now + 36);
  assert.deepEqual([held.input.buttons.btn19, held.input.buttons.btn20, held.wait], [true, true, 74]);
  held = hold(state(), now + 111);
  assert.deepEqual([held.input.buttons.btn19, held.input.buttons.btn20, held.wait], [false, true, 2]);
  assert.deepEqual(hold(state(), now + 113), { input: state(), wait: null });

  // A device unplugged mid-press takes its buttons with it once the hold is over.
  hold({ buttons: { 'throttle.btn3': true }, axes: {} }, 20000);
  assert.equal(hold({ buttons: {}, axes: {} }, 20002).input.buttons['throttle.btn3'], true);
  assert.deepEqual(hold({ buttons: {}, axes: {} }, 20100), { input: { buttons: {}, axes: {} }, wait: null });
});

// first..last, inclusive.
const range =(first, last) => Array.from({ length: last - first + 1 }, (_, i) => first + i);

// The control IDs a set of labels points at.
const shownBy = (callouts) => callouts.flatMap((c) => (c.group ? c.group.map((item) => item.id) : [c.id]));

test('every photo layout points only at controls its stick has, each one once', () => {
  const sticks = {
    extreme3dpro: [EXTREME_LAYOUT, EXTREME],
    gladiatorevo: [GLADIATOR_LAYOUT, GLADIATOR],
    gladiatorevoleft: [GLADIATOR_LAYOUT, GLADIATOR_LEFT],
    gladiatorotright: [OMNI_LAYOUT, OMNI_RIGHT],
    gladiatorotleft: [OMNI_LAYOUT, OMNI_LEFT],
    stecsstandard: [STECS_LAYOUT, STECS],
    stecsmax: [STECS_MAX_LAYOUT, STECS_MAX],
    stecsspace: [STECS_SPACE_LAYOUT, STECS_SPACE],
    velocityoneflightstick: [FLIGHTSTICK_LAYOUT, FLIGHTSTICK],
    velocityoneflightstick2: [FLIGHTSTICK_2_LAYOUT, FLIGHTSTICK_2],
    velocityonedualthrottle: [DUAL_THROTTLE_LAYOUT, DUAL_THROTTLE],
    flightdeckstick: [FLIGHTDECK_STICK_LAYOUT, FLIGHTDECK_STICK],
    flightdeckthrottle: [FLIGHTDECK_THROTTLE_LAYOUT, FLIGHTDECK_THROTTLE],
    orion2f16ex: [ORION_STICK_LAYOUT, ORION_STICK],
    orion2throttle: [ORION_THROTTLE_LAYOUT, ORION_THROTTLE],
    ursaminorcombatstick: [URSA_STICK_LAYOUT, URSA_STICK],
    ursaminorcombatthrottle: [URSA_THROTTLE_LAYOUT, URSA_THROTTLE],
    solrright: [SOL_R_LAYOUT, SOL_R_RIGHT],
    solrleft: [SOL_R_LAYOUT, SOL_R_LEFT],
    x56stick: [X56_STICK_LAYOUT, X56_STICK],
    x56throttle: [X56_THROTTLE_LAYOUT, X56_THROTTLE],
    xboxcontroller: [XBOX_LAYOUT, XBOX_PAD],
    xboxelite: [XBOX_LAYOUT, XBOX_ELITE_PAD],
    dualshock4: [parseDescriptor(DUALSHOCK_4_DESCRIPTOR).layout, DUALSHOCK_4],
    dualsense: [parseDescriptor(DUALSENSE_DESCRIPTOR).layout, DUALSENSE],
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
  // The left-hand stick and both Omni Throttles show exactly what the right-hand stick's
  // photo shows, under the same labels, each with a dot of its own.
  for (const skin of ['gladiatorevoleft', 'gladiatorotright', 'gladiatorotleft']) {
    assert.deepEqual([...shownBy(LAYOUTS[skin].callouts)].sort(), [...gladiator].sort(), skin);
    assert.deepEqual(LAYOUTS[skin].callouts.map((c) => c.id).sort(), LAYOUTS.gladiatorevo.callouts.map((c) => c.id).sort(), skin);
    const dots = LAYOUTS[skin].callouts.map((c) => c.at);
    for (const [i, a] of dots.entries()) {
      for (const b of dots.slice(i + 1)) assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) * LAYOUTS[skin].image.scale >= 20, `${skin}: ${a} and ${b}`);
    }
    for (const c of LAYOUTS[skin].callouts) {
      assert.ok(c.at[0] >= 0 && c.at[0] <= LAYOUTS[skin].image.width && c.at[1] >= 0 && c.at[1] <= LAYOUTS[skin].image.height, `${skin}: ${c.id}`);
    }
  }
  // A stick fitted with the Omni Throttle adapter can show that throttle's photo instead:
  // the right-hand stick the right-hand throttle, the left the left, and every label on it
  // is a control the stick has.
  assert.deepEqual(ALTERNATES, {
    gladiatorevo: { skin: 'gladiatorotright', label: 'Omni Throttle' },
    gladiatorevoleft: { skin: 'gladiatorotleft', label: 'Omni Throttle' },
  });
  for (const [skin, alternate] of Object.entries(ALTERNATES)) {
    const model = describeDevice(...sticks[skin]);
    const known = new Set([...model.axes.map((a) => a.id), 'hat1_up', 'hat1_right', 'hat1_down', 'hat1_left', ...Object.keys(model.buttonNames)]);
    assert.deepEqual(shownBy(LAYOUTS[alternate.skin].callouts).filter((id) => !known.has(id)), [], skin);
  }
  // The STECS photo covers every button on its owner’s map, and names each one.
  const stecs = shownBy(LAYOUTS.stecsstandard.callouts);
  const mapped = Array.from({ length: 58 }, (_, i) => i + 1).filter((b) => ![19, 55, 56].includes(b));
  for (const b of mapped) {
    assert.ok(stecs.includes(`btn${b}`), `btn${b}`);
    assert.ok(SKINS['231d:012d'].names[`btn${b}`], `btn${b} has a name`);
  }
  // The Max's photo covers the same buttons, each control under a folded label with a dot
  // of its own, plus the ATEM's thirteen by number.
  const max = shownBy(LAYOUTS.stecsmax.callouts);
  assert.equal(LAYOUTS.stecsmax.folded, true);
  for (const b of mapped) assert.ok(max.includes(`btn${b}`), `btn${b}`);
  for (const b of range(59, 71)) assert.ok(max.includes(`btn${b}`), `btn${b}`);
  assert.deepEqual(max.filter((id) => /^btn/.test(id)).map((id) => Number(id.slice(3))).sort((a, b) => a - b), [...mapped, ...range(59, 71)]);
  assert.ok(max.includes('x') && max.includes('y'));
  const maxDots = LAYOUTS.stecsmax.callouts.map((c) => c.at);
  for (const [i, a] of maxDots.entries()) {
    for (const b of maxDots.slice(i + 1)) assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) * LAYOUTS.stecsmax.image.scale >= 24, `${a} and ${b}`);
  }
  // The STECS Space photo has a row for every button up to the end of its STEM, bar the
  // same 55 and 56: the grip's 8 to 34 by number. It shows the hat and the five axes every
  // one of these throttles reports, so it also fits the owner's whose has no Rz or Slider.
  const space = shownBy(LAYOUTS.stecsspace.callouts);
  for (const b of range(1, 58).filter((n) => n !== 55 && n !== 56)) assert.ok(space.includes(`btn${b}`), `btn${b}`);
  assert.deepEqual(space.filter((id) => !/^btn|^hat/.test(id)).sort(), ['rx', 'ry', 'x', 'y', 'z']);
  assert.ok(space.includes('hat1_up'));
  const fewer = describeDevice(STECS_SPACE_LAYOUT_2, STECS_SPACE).axes.map((a) => a.id);
  for (const id of ['x', 'y', 'z', 'rx', 'ry']) assert.ok(fewer.includes(id), id);
  assert.deepEqual(LAYOUTS.stecsspace.guides, {}); // which way each axis runs isn't known
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
  // Both Sol-R photos show every button the stick sends and every axis it has, on labels
  // that all fit above the bottom of the stage, with a dot each clear of the others. The
  // POV is the right hat on the right stick and the left hat on the left one, each with its
  // own push button; the other hat is the four buttons after its push.
  for (const [skin, sent, povHat, povPush] of [
    ['solrright', range(1, 40), 'righthat', 'btn40'],
    ['solrleft', [...range(1, 30), ...range(35, 44)], 'lefthat', 'btn30'],
  ]) {
    const layout = LAYOUTS[skin];
    const shown = shownBy(layout.callouts);
    for (const id of ['x', 'y', 'z', 'rx', 'ry', 'rz']) assert.ok(shown.includes(id), `${skin}: ${id}`);
    const pov = layout.callouts.find((c) => c.id === povHat);
    assert.deepEqual(pov.group.map((item) => item.id), ['hat1_up', 'hat1_right', 'hat1_down', 'hat1_left', povPush], skin);
    assert.equal(pov.tag, 'POV');
    const buttons = shown.filter((id) => /^btn/.test(id)).map((id) => Number(id.slice(3))).sort((x, y) => x - y);
    assert.deepEqual(buttons, sent, skin);
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
  // The X56 throttle's photo shows all 36 buttons and all eight axes, the stick's the 14
  // buttons on its chart, its POV and its five axes, and each gamepad's everything it has.
  // The Flightstick II's, the Dual Throttle's and both Flightdeck photos show every button
  // and axis on Turtle Beach's control lists: 34 buttons, the hat and all eight axes on the
  // Flightstick II, 27 buttons, both hats and seven axes on the Dual Throttle, 33 buttons,
  // both hats and seven axes on the Flightdeck stick, 41 buttons, the hat and all eight
  // axes on its throttle. Their labels fit above the bottom of the stage too.
  for (const [skin, buttons, axes] of [
    ['x56throttle', range(1, 36), ['x', 'y', 'z', 'rx', 'ry', 'rz', 'slider', 'dial']],
    ['x56stick', range(1, 14), ['x', 'y', 'rz', 'rx', 'ry']],
    ['velocityoneflightstick2', range(1, 34), ['x', 'y', 'z', 'rx', 'ry', 'rz', 'slider', 'dial']],
    ['velocityonedualthrottle', range(1, 27), ['x', 'y', 'z', 'rx', 'ry', 'rz', 'dial']],
    ['flightdeckstick', range(1, 33), ['x', 'y', 'z', 'rx', 'ry', 'rz', 'slider']],
    ['flightdeckthrottle', range(1, 41), ['x', 'y', 'z', 'rx', 'ry', 'rz', 'slider', 'dial']],
    ['xboxcontroller', range(1, 10), ['x', 'y', 'rx', 'ry', 'z', 'rz']],
    ['xboxelite', range(1, 10), ['x', 'y', 'rx', 'ry', 'z', 'rz']],
    // The triggers are shown as axes: the buttons they also press (7 and 8) are left out.
    ['dualshock4', [...range(1, 6), ...range(9, 14)], ['x', 'y', 'z', 'rz', 'rx', 'ry']],
    ['dualsense', [...range(1, 6), ...range(9, 15)], ['x', 'y', 'z', 'rz', 'rx', 'ry']],
  ]) {
    const layout = LAYOUTS[skin];
    const shown = shownBy(layout.callouts);
    assert.deepEqual(shown.filter((id) => /^btn/.test(id)).map((id) => Number(id.slice(3))).sort((x, y) => x - y), buttons, skin);
    for (const id of axes) assert.ok(shown.includes(id), `${skin}: ${id}`);
    if (skin !== 'x56throttle') for (const dir of ['up', 'right', 'down', 'left']) assert.ok(shown.includes(`hat1_${dir}`), `${skin}: hat1_${dir}`);
    const rows = (c) => Math.ceil(c.group ? c.group.reduce((n, item) => n + (item.wide ? 1 : 1 / (c.columns ?? 1)), 0) : 1);
    for (const side of ['left', 'right']) {
      const last = layout.callouts.filter((c) => c.side === side).at(-1);
      assert.ok(last.y + 23 + rows(last) * 32 <= (side === 'left' ? 915 : 985), `${skin}: the ${side} labels run off the stage`);
    }
  }
  // The Flightdeck stick's and the Dual Throttle's second hats are on their photos too,
  // every control these four photos' skins name is shown, and each line has its own dot,
  // clear of the others.
  for (const skin of ['flightdeckstick', 'velocityonedualthrottle']) {
    for (const dir of ['up', 'right', 'down', 'left']) assert.ok(shownBy(LAYOUTS[skin].callouts).includes(`hat2_${dir}`), `${skin}: hat2_${dir}`);
  }
  for (const [key, skin] of [
    ['10f5:7150', 'velocityoneflightstick2'],
    ['10f5:7154', 'velocityonedualthrottle'],
    ['10f5:7084', 'flightdeckstick'],
    ['10f5:7085', 'flightdeckthrottle'],
  ]) {
    const shown = shownBy(LAYOUTS[skin].callouts);
    for (const id of Object.keys(SKINS[key].names)) assert.ok(/^hat/.test(id) ? shown.includes(`${id}_up`) : shown.includes(id), `${skin}: ${id}`);
    assert.equal(LAYOUTS[skin].folded, undefined);
    const spots = LAYOUTS[skin].callouts.map((c) => c.at);
    for (const [i, a] of spots.entries()) {
      for (const b of spots.slice(i + 1)) assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) * LAYOUTS[skin].image.scale >= 24, `${skin}: ${a} and ${b}`);
    }
  }
  // Both URSA MINOR photos show every control WINWING's diagrams number, each one named:
  // on the stick its 14 base buttons, 20 and 22 to 48, the hat and all six axes; on the
  // throttle the handles' 27 to 61, and the levers and the four axes the diagram gives.
  // Their labels fit above the bottom of the stage, each with a dot clear of the others.
  for (const [key, skin, buttons, axes] of [
    ['4098:bc2a', 'ursaminorcombatstick', [...range(1, 14), 20, ...range(22, 48)], ['rx', 'ry', 'slider', 'x', 'y', 'z']],
    ['4098:b970', 'ursaminorcombatthrottle', range(27, 61), ['dial', 'rx', 'ry', 'rz', 'slider', 'z']],
  ]) {
    const layout = LAYOUTS[skin];
    const shown = shownBy(layout.callouts);
    assert.deepEqual(numbers(shown), buttons, skin);
    assert.deepEqual(shown.filter((id) => !/^btn|^hat/.test(id)).sort(), axes, skin);
    for (const id of shown) assert.ok(SKINS[key].names[id.replace(/_.*/, '')], `${skin}: ${id} has a name`);
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
  assert.ok(shownBy(LAYOUTS.ursaminorcombatstick.callouts).includes('hat1_up'));
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

test('sensitivity bends the curve but keeps rest and full travel', () => {
  const ly = (sensitivity, y) => mapInput(input({}, { y }), bindingsWith({ y: { target: 'ls_y', deadzone: 0, sensitivity } })).ly;
  for (const s of [-1, -0.4, 0.4, 1]) {
    assert.equal(ly(s, 0), 0);
    assert.equal(ly(s, 1), 32767);
    assert.equal(ly(s, -1), -32767);
    assert.equal(ly(s, -0.25), -ly(s, 0.25));
  }
  // Above 0 a small movement does more, below 0 it does less.
  assert.ok(ly(0.4, 0.25) > Math.round(0.25 * 32767));
  assert.ok(ly(-0.4, 0.25) < Math.round(0.25 * 32767));
  // At the ends the curve is a cube root or a cube.
  assert.equal(ly(1, 0.125), Math.round(0.5 * 32767));
  assert.equal(ly(-1, 0.5), Math.round(0.125 * 32767));

  // The deadzone comes first, so drift stays swallowed and the curve starts at its edge.
  const p = bindingsWith({ y: { target: 'ls_y', deadzone: 0.1, sensitivity: -1 } });
  assert.equal(mapInput(input({}, { y: 0.08 }), p).ly, 0);
  assert.equal(mapInput(input({}, { y: 0.55 }), p).ly, Math.round(0.125 * 32767));
});

test('sensitivity shapes triggers and the split, before the anti-deadzone', () => {
  const rt = (raw, slider) => mapInput(input({}, { slider }), bindingsWith({ slider: { target: 'rt', deadzone: 0, ...raw } })).rt;
  assert.equal(rt({ sensitivity: -1 }, -1), 0);
  assert.equal(rt({ sensitivity: -1 }, 0), Math.round(0.125 * 255));
  assert.equal(rt({ sensitivity: -1 }, 1), 255);
  // The anti-deadzone lifts the curved value, so the output still starts at its floor.
  assert.equal(rt({ sensitivity: -1, antiDeadzone: 0.2 }, 0), Math.round((0.2 + 0.8 * 0.125) * 255));

  const split = bindingsWith({ slider: { target: 'lt_rt', deadzone: 0, sensitivity: 1 } });
  const out = mapInput(input({}, { slider: -0.125 }), split);
  assert.deepEqual([out.lt, out.rt], [Math.round(0.5 * 255), 0]);

  // Without the setting an axis maps exactly as before.
  const plain = bindingsWith({ y: { target: 'ls_y', deadzone: 0.1 } });
  assert.equal(plain.y.sensitivity, undefined);
  assert.equal(mapInput(input({}, { y: 0.55 }), plain).ly, Math.round(0.5 * 32767));
});

test('sensitivity is clamped, dropped at zero, and not kept for button-style outputs', () => {
  assert.equal(sanitizeBinding('x', { target: 'ls_x', sensitivity: 3 }).sensitivity, 1);
  assert.equal(sanitizeBinding('x', { target: 'ls_x', sensitivity: -3 }).sensitivity, -1);
  assert.equal(sanitizeBinding('x', { target: 'ls_x', sensitivity: -0.3 }).sensitivity, -0.3);
  assert.equal('sensitivity' in sanitizeBinding('x', { target: 'ls_x', sensitivity: 0 }), false);
  assert.equal('sensitivity' in sanitizeBinding('x', { target: 'ls_x', sensitivity: 'lots' }), false);
  assert.equal('sensitivity' in sanitizeBinding('rz', { target: 'dpad_x', sensitivity: 0.5 }), false);
  assert.equal('sensitivity' in sanitizeBinding('x', { target: null, sensitivity: 0.5 }), false);
  // It survives a save / export round trip.
  const p = { name: 'P', bindings: bindingsWith({ x: { target: 'ls_x', sensitivity: -0.4 } }) };
  assert.equal(fromExport(toExport(p)).bindings.x.sensitivity, -0.4);
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
