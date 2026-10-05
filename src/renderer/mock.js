// Stand-in for the Electron bridge when the UI is opened in a plain browser.
// Simulated sticks: the Extreme 3D Pro, the VKB Gladiator NXT EVO right- and left-hand
// sticks and Omni Throttles, the VKB STECS Standard, Max and Space throttles, the Turtle
// Beach VelocityOne Flightstick and the WINWING Orion 2 stick and throttle, the
// Thrustmaster Sol-R right and left sticks, the Logitech X56 stick and throttle, the Turtle
// Beach VelocityOne Flightstick II, Dual Throttle and Flightdeck stick and throttle, an
// Xbox controller, an Xbox Elite, a DualShock 4 and a DualSense, the WINCTRL URSA MINOR
// Combat stick and throttle (photo layouts), the Virpil ACE-Torq pedals (named, no photo),
// and a Thrustmaster T.16000M built from its published layout (universal layout).
// Add ?device=gladiator, ?device=gladiatorleft, ?device=omnileft, ?device=omniright,
// ?device=stecs, ?device=stecsmax, ?device=stecsspace, ?device=flightstick,
// ?device=orionstick, ?device=orionthrottle, ?device=solrright, ?device=solrleft,
// ?device=x56stick, ?device=x56throttle, ?device=flightdeckstick,
// ?device=flightdeckthrottle, ?device=xbox, ?device=elite, ?device=dualshock4,
// ?device=dualsense, ?device=acetorq, ?device=flightstick2, ?device=dualthrottle,
// ?device=ursastick, ?device=ursathrottle or ?device=t16000m to plug in one of the others.
// ?device=hotas plugs in a stick, a throttle and pedals together, ?device=winwing the rig
// from GitHub issue #7, ?device=solr the pair from issue #8, ?device=x56 the pair from
// issue #16, ?device=flightdeck the pair from issues #14 and #15, ?device=velocityone the
// pair from issues #13 and #23, ?device=ursaminor the pair from issues #24 and #25; any
// comma-separated list works too (?device=gladiator,twcs).
// Add ?update=9.9.9 to see the "Update available" button (clicking it plays a pretend download).
// The keyboard drives whichever device is on screen:
//   W/S pitch · A/D roll · Q/E twist · R/F throttle · arrows = hat
//   Space = button 1 · V = button 2 · 3–9, 0 = buttons 3–10 · - = = buttons 11–12
import { ROLES, sanitizeBinding, emptyBindings, rolePrefix } from '../shared/controls.js';
import { XBOX_ELITE_PAD, XBOX_LAYOUT, XBOX_PAD, assignRoles, describeDevice, mergeInputs } from '../shared/devices.js';
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
// A Sol-R stick as reported by a real pair (GitHub issues #8 and #10): the thrust lever is
// on Z, and every other axis rests at its midpoint.
const SOL_R_LAYOUT = {
  values: [
    hat,
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
  // The left-hand stick, as reported by a real one (GitHub issue #17): the same layout.
  {
    vendorId: 0x231d,
    productId: 0x0201,
    name: 'VKBsim Gladiator EVO L',
    alias: 'gladiatorleft',
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
  // The Omni Throttle, as reported by a real right-hand one (GitHub issue #5): no spare
  // axes, and a 12-bit ministick. The left-hand one is taken to report the same.
  ...[
    [0x3200, 'VKBsim Gladiator EVO OT R', 'omniright'],
    [0x3201, 'VKBsim Gladiator EVO OT L', 'omnileft'],
  ].map(([productId, name, alias]) => ({
    vendorId: 0x231d,
    productId,
    name,
    alias,
    throttle: 'z',
    layout: {
      values: [
        { page: 1, usage: 0x30, min: 0, max: 4095 },
        { page: 1, usage: 0x31, min: 0, max: 4095 },
        { page: 1, usage: 0x35, min: 0, max: 2047 },
        { page: 1, usage: 0x32, min: 0, max: 2047 },
        { page: 1, usage: 0x33, min: 0, max: 4095 },
        { page: 1, usage: 0x34, min: 0, max: 4095 },
        { page: 0, usage: 0, min: 0, max: 2047 },
        { page: 0, usage: 0, min: 0, max: 2047 },
        hat,
      ],
      buttonCount: 128,
    },
  })),
  // As reported by a real STECS Standard (GitHub issue #2): both throttle levers are
  // 12-bit axes on X and Y. R / F move both.
  {
    vendorId: 0x231d,
    productId: 0x012d,
    name: 'VKB-Sim (C) Alex Oz 2023 S-TECS MODERN THROTTLE STANDARD STEM',
    alias: 'stecs',
    throttle: ['x', 'y'],
    layout: {
      values: [
        { page: 1, usage: 0x30, min: 0, max: 4095 },
        { page: 1, usage: 0x31, min: 0, max: 4095 },
        { page: 1, usage: 0x32, min: 0, max: 1023 },
        { page: 1, usage: 0x33, min: 0, max: 1023 },
        { page: 1, usage: 0x34, min: 0, max: 1023 },
        { page: 1, usage: 0x35, min: 0, max: 1023 },
        { page: 1, usage: 0x36, min: 0, max: 1023 },
        { page: 1, usage: 0x36, min: 0, max: 1023 },
        hat,
      ],
      buttonCount: 128,
    },
  },
  // The STECS Max, as reported by a real one (GitHub issue #9): the same, with a Dial
  // where the Standard has a second Slider.
  {
    vendorId: 0x231d,
    productId: 0x012e,
    name: 'VKB-Sim (C) Alex Oz 2023 S-TECS MODERN THROTTLE MAX STEM',
    alias: 'stecsmax',
    throttle: ['x', 'y'],
    layout: {
      values: [
        { page: 1, usage: 0x30, min: 0, max: 4095 },
        { page: 1, usage: 0x31, min: 0, max: 4095 },
        { page: 1, usage: 0x32, min: 0, max: 1023 },
        { page: 1, usage: 0x33, min: 0, max: 1023 },
        { page: 1, usage: 0x34, min: 0, max: 1023 },
        { page: 1, usage: 0x35, min: 0, max: 1023 },
        { page: 1, usage: 0x36, min: 0, max: 1023 },
        { page: 1, usage: 0x37, min: 0, max: 1023 },
        hat,
      ],
      buttonCount: 128,
    },
  },
  // As reported by a real STECS Space Throttle Standard (GitHub issue #11): the throttle
  // is on Z, the grip's tilt on X and Y. R / F move the throttle.
  {
    vendorId: 0x231d,
    productId: 0x0138,
    name: 'VKB-Sim (C) Alex Oz 2023 S-TECS SPACE-L THROTTLE STANDARD  STEM',
    alias: 'stecsspace',
    throttle: 'z',
    layout: {
      values: [
        { page: 1, usage: 0x32, min: 0, max: 4095 },
        { page: 1, usage: 0x30, min: 0, max: 4095 },
        { page: 1, usage: 0x31, min: 0, max: 4095 },
        { page: 1, usage: 0x33, min: 0, max: 1023 },
        { page: 1, usage: 0x34, min: 0, max: 1023 },
        { page: 1, usage: 0x35, min: 0, max: 1023 },
        { page: 1, usage: 0x36, min: 0, max: 1023 },
        { page: 0, usage: 0, min: 0, max: 1023 },
        hat,
      ],
      buttonCount: 128,
    },
  },
  // As reported by a real VelocityOne Flightstick (GitHub issue #3): the twist is on Z and
  // the two levers are on Rz and Dial. R / F move both levers.
  {
    vendorId: 0x10f5,
    productId: 0x7055,
    name: 'Turtle Beach VelocityOne Flightstick',
    alias: 'flightstick',
    throttle: ['rz', 'dial'],
    twist: 'z',
    layout: {
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
    },
  },
  // As reported by a real rig (GitHub issue #7): a WINWING Orion 2 stick with the F-16EX
  // grip, whose two levers are on Rz and Slider; the Orion 2 throttle, whose throttle
  // levers are on Rx and Ry; and Virpil ACE-Torq pedals, whose rudder is on Z beside two
  // unused axes. R / F move the levers, Q / E the rudder.
  {
    vendorId: 0x4098,
    productId: 0xbea8,
    name: 'WINWING Orion Joystick Base 2 + JGRIP-F16',
    alias: 'orionstick',
    throttle: ['rz', 'slider'],
    layout: {
      values: [
        hat,
        { page: 1, usage: 0x30, min: 0, max: 65535 },
        { page: 1, usage: 0x31, min: 0, max: 65535 },
        { page: 1, usage: 0x33, min: 0, max: 4095 },
        { page: 1, usage: 0x34, min: 0, max: 4095 },
        { page: 1, usage: 0x35, min: 0, max: 4095 },
        { page: 1, usage: 0x36, min: 0, max: 4095 },
        { page: 255, usage: 1, min: 0, max: 255 },
      ],
      buttonCount: 42,
    },
  },
  {
    vendorId: 0x4098,
    productId: 0xbd64,
    name: 'WINWING Orion Throttle Base II + F15EX HANDLE L + F15EX HANDLE R',
    alias: 'orionthrottle',
    throttle: ['rx', 'ry', 'slider', 'dial'],
    layout: {
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
    },
  },
  {
    vendorId: 0x3344,
    productId: 0x01f9,
    name: 'VIRPIL Controls 20220720 VPC ACE-Torq Rudder',
    alias: 'acetorq',
    throttle: ['x', 'y'],
    twist: 'z',
    layout: {
      values: [
        { page: 1, usage: 0x32, min: 0, max: 60000 },
        { page: 1, usage: 0x30, min: 0, max: 60000 },
        { page: 1, usage: 0x31, min: 0, max: 60000 },
      ],
      buttonCount: 0,
    },
  },
  // The Thrustmaster Sol-R pair from GitHub issue #8: R / F move the thrust lever, Q / E the twist.
  {
    vendorId: 0x044f,
    productId: 0x0422,
    name: 'Thrustmaster Sol-R [R] Flightstick',
    alias: 'solrright',
    throttle: 'z',
    layout: SOL_R_LAYOUT,
  },
  {
    vendorId: 0x044f,
    productId: 0x042a,
    name: 'Thrustmaster Sol-R [L] Flightstick',
    alias: 'solrleft',
    throttle: 'z',
    layout: SOL_R_LAYOUT,
  },
  // The Logitech X56 pair from GitHub issue #16. The throttle is as a real one reports: its
  // two levers are 10-bit axes on X and Y. The stick's layout is built from its published
  // control list, not captured. R / F move both levers.
  {
    vendorId: 0x0738,
    productId: 0x2221,
    name: 'Mad Catz Saitek Pro Flight X-56 Rhino Stick',
    alias: 'x56stick',
    throttle: null,
    layout: {
      values: [
        { page: 1, usage: 0x30, min: 0, max: 65535 },
        { page: 1, usage: 0x31, min: 0, max: 65535 },
        { page: 1, usage: 0x35, min: 0, max: 4095 },
        hat,
        { page: 1, usage: 0x33, min: 0, max: 255 },
        { page: 1, usage: 0x34, min: 0, max: 255 },
      ],
      buttonCount: 17,
    },
  },
  {
    vendorId: 0x0738,
    productId: 0xa221,
    name: 'Mad Catz Saitek Pro Flight X-56 Rhino Throttle',
    alias: 'x56throttle',
    throttle: ['x', 'y'],
    layout: {
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
    },
  },
  // As reported by a real VelocityOne Flightstick II (GitHub issue #13), once its X and Y
  // read 0 to 65535: the twist is on Z and the two levers are on Rz and Slider. R / F move
  // both levers.
  {
    vendorId: 0x10f5,
    productId: 0x7150,
    name: 'Turtle Beach VelocityOne Flightstick II',
    alias: 'flightstick2',
    throttle: ['rz', 'slider'],
    twist: 'z',
    layout: {
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
        { page: 255, usage: 33, min: 0, max: 255 },
      ],
      buttonCount: 54,
    },
  },
  // As reported by a real VelocityOne Dual Throttle (GitHub issue #23): two hats that
  // report alike, and its two levers on X and Y. R / F move the levers.
  {
    vendorId: 0x10f5,
    productId: 0x7154,
    name: 'Turtle Beach VelocityOne Dual Throttle',
    alias: 'dualthrottle',
    throttle: ['x', 'y', 'z'],
    layout: {
      values: [
        { page: 1, usage: 0x39, min: 1, max: 8 },
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
    },
  },
  // The WINCTRL URSA MINOR Combat pair, as real ones report (GitHub issues #24 and #25).
  // The stick twists on Z and has its throttle slider on Slider; the throttle's levers are
  // taken to be on Rx and Ry. R / F move the slider and the levers, Q / E the twist.
  {
    vendorId: 0x4098,
    productId: 0xbc2a,
    name: 'Winwing WINCTRL URSA MINOR Combat Joystick R',
    alias: 'ursastick',
    throttle: 'slider',
    twist: 'z',
    layout: {
      values: [
        hat,
        { page: 1, usage: 0x30, min: 0, max: 65535 },
        { page: 1, usage: 0x31, min: 0, max: 65535 },
        { page: 1, usage: 0x32, min: 0, max: 65535 },
        { page: 1, usage: 0x33, min: 0, max: 4095 },
        { page: 1, usage: 0x34, min: 0, max: 4095 },
        { page: 1, usage: 0x36, min: 0, max: 4095 },
        { page: 255, usage: 1, min: 0, max: 255 },
      ],
      buttonCount: 128,
    },
  },
  {
    vendorId: 0x4098,
    productId: 0xb970,
    name: 'WINCTRL URSA MINOR Combat Throttle Metal.EX',
    alias: 'ursathrottle',
    throttle: ['rx', 'ry'],
    layout: {
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
    },
  },
  // The Turtle Beach VelocityOne Flightdeck pair, as real ones report (GitHub issues #14
  // and #15). The stick twists on Z and has its pinkie lever on Rz; the throttle's two
  // levers are on X and Y. R / F move the levers, Q / E the twist.
  {
    vendorId: 0x10f5,
    productId: 0x7084,
    name: 'Turtle Beach Flightdeck Stick',
    alias: 'flightdeckstick',
    throttle: 'rz',
    twist: 'z',
    layout: {
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
    },
  },
  {
    vendorId: 0x10f5,
    productId: 0x7085,
    name: 'Turtle Beach Flightdeck Throttle',
    alias: 'flightdeckthrottle',
    throttle: ['x', 'y', 'slider'],
    layout: {
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
    },
  },
  // An Xbox controller, as the app describes the ones XInput finds. W/A/S/D move the left
  // stick, R / F pull the triggers, the arrows are the D-pad.
  { ...XBOX_PAD, alias: 'xbox', throttle: ['z', 'rz'], layout: XBOX_LAYOUT },
  { ...XBOX_ELITE_PAD, alias: 'elite', throttle: ['z', 'rz'], layout: XBOX_LAYOUT },
  // PlayStation controllers, laid out as their published descriptors read (not captured):
  // the right stick on Z and Rz, the triggers on Rx and Ry. Q / E move the right stick.
  {
    vendorId: 0x054c,
    productId: 0x09cc,
    name: 'Sony Interactive Entertainment Wireless Controller',
    alias: 'dualshock4',
    throttle: ['rx', 'ry'],
    twist: 'z',
    layout: {
      values: [
        { page: 1, usage: 0x35, min: 0, max: 255 },
        { page: 1, usage: 0x32, min: 0, max: 255 },
        { page: 1, usage: 0x31, min: 0, max: 255 },
        { page: 1, usage: 0x30, min: 0, max: 255 },
        hat,
        { page: 0xff00, usage: 0x20, min: 0, max: 127 },
        { page: 1, usage: 0x34, min: 0, max: 255 },
        { page: 1, usage: 0x33, min: 0, max: 255 },
      ],
      buttonCount: 14,
    },
  },
  {
    vendorId: 0x054c,
    productId: 0x0ce6,
    name: 'Sony Interactive Entertainment DualSense Wireless Controller',
    alias: 'dualsense',
    throttle: ['rx', 'ry'],
    twist: 'z',
    layout: {
      values: [
        { page: 1, usage: 0x34, min: 0, max: 255 },
        { page: 1, usage: 0x33, min: 0, max: 255 },
        { page: 1, usage: 0x35, min: 0, max: 255 },
        { page: 1, usage: 0x32, min: 0, max: 255 },
        { page: 1, usage: 0x31, min: 0, max: 255 },
        { page: 1, usage: 0x30, min: 0, max: 255 },
        { page: 0xff00, usage: 0x20, min: 0, max: 255 },
        hat,
      ],
      buttonCount: 15,
    },
  },
  // A throttle and pedals for trying a HOTAS. Their layouts are made up for the preview,
  // not captured from the real devices.
  {
    vendorId: 0x044f,
    productId: 0xb687,
    name: 'Thrustmaster TWCS Throttle',
    alias: 'twcs',
    throttle: 'z',
    layout: {
      values: [
        { page: 1, usage: 0x30, min: 0, max: 1023 },
        { page: 1, usage: 0x31, min: 0, max: 1023 },
        { page: 1, usage: 0x32, min: 0, max: 65535 },
        { page: 1, usage: 0x35, min: 0, max: 1023 },
        { page: 1, usage: 0x36, min: 0, max: 1023 },
        hat,
      ],
      buttonCount: 14,
    },
  },
  {
    vendorId: 0x044f,
    productId: 0xb679,
    name: 'Thrustmaster T-Rudder',
    alias: 'pedals',
    throttle: null,
    layout: {
      values: [
        { page: 1, usage: 0x30, min: 0, max: 1023 },
        { page: 1, usage: 0x31, min: 0, max: 1023 },
        { page: 1, usage: 0x35, min: 0, max: 1023 },
      ],
      buttonCount: 0,
    },
  },
].map((d) => {
  const model = describeDevice(d.layout, d);
  return { ...d, id: model.key, model: { ...model, id: model.key } };
});

const RIGS = {
  hotas: ['extreme3dpro', 'twcs', 'pedals'],
  winwing: ['orionstick', 'orionthrottle', 'acetorq'],
  solr: ['solrright', 'solrleft'],
  x56: ['x56stick', 'x56throttle'],
  flightdeck: ['flightdeckstick', 'flightdeckthrottle'],
  velocityone: ['flightstick2', 'dualthrottle'],
  ursaminor: ['ursastick', 'ursathrottle'],
};

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
  let update = /^\d+\.\d+\.\d+$/.test(query.get('update') ?? '')
    ? { version: query.get('update'), inApp: true, state: 'available', progress: 0 }
    : null;
  // What's plugged in. As in the app, every device is live and one of them is on screen.
  const names = (RIGS[wanted] ?? (wanted ?? '').split(',')).map((name) => name.trim());
  const found = names.map((name) => SIMULATED.find((d) => d.id === name || d.alias === name)).filter(Boolean);
  const plugged = found.length ? [...new Set(found)] : [SIMULATED[0]];
  let savedRoles = {};
  let preferredId = null;
  const roles = () => assignRoles(plugged, savedRoles);
  const view = () => {
    const assigned = roles();
    return plugged.find((d) => d.id === preferredId) ?? ROLES.map((role) => plugged.find((d) => assigned[d.id] === role)).find(Boolean);
  };
  const deviceSettings = {};
  const held = new Set();
  // Each device's stick position and throttle, so the ones off screen stay where they were left.
  const sims = new Map(plugged.map((d) => [d.id, { axes: { x: 0, y: 0, rz: 0 }, throttle: -1 }]));
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
    const assigned = roles();
    const device = view();
    return {
      joystick: {
        state: 'connected',
        message: '',
        device: { ...device.model, role: assigned[device.id] },
        devices: plugged.map(({ id, model }) => ({
          id,
          key: model.key,
          name: model.name,
          role: assigned[id] ?? null,
          skin: model.skin,
          support: model.support,
          problem: '',
        })),
        settings: deviceSettings[device.id] ?? {},
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
    const assigned = roles();
    const shown = view();
    const states = [];
    for (const device of plugged) {
      if (!assigned[device.id]) continue;
      const sim = sims.get(device.id);
      // Only the device on screen has hands on it; the others are let go.
      const keys = device === shown ? [...held] : [];
      const target = { x: 0, y: 0, rz: 0 };
      for (const code of keys) {
        const axis = KEY_AXES[code];
        if (axis) target[axis[0]] += axis[1];
      }
      // Springy stick: ease toward the held direction, return to centre when released.
      for (const id of ['x', 'y', 'rz']) sim.axes[id] += (target[id] - sim.axes[id]) * Math.min(1, dt * 10);
      // Throttle stays where you leave it.
      if (keys.includes('KeyR')) sim.throttle = Math.min(1, sim.throttle + dt * 1.2);
      if (keys.includes('KeyF')) sim.throttle = Math.max(-1, sim.throttle - dt * 1.2);

      const prefix = rolePrefix(assigned[device.id]);
      const state = { buttons: {}, axes: {} };
      for (const code of keys) if (KEY_BUTTONS[code]) state.buttons[prefix + KEY_BUTTONS[code]] = true;
      // Q / E twist whichever axis the device twists on (Rz unless it says otherwise).
      const twist = device.twist ?? 'rz';
      for (const { id } of device.model.axes) {
        state.axes[prefix + id] = [device.throttle].flat().includes(id) ? sim.throttle : (sim.axes[id === twist ? 'rz' : id] ?? 0);
      }
      states.push(state);
    }
    const input = mergeInputs(states);
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
    async selectDevice(id) {
      preferredId = id;
      emitStatus();
      return true;
    },
    // Whichever device had the role takes this one's in exchange.
    async setDeviceRole(id, role) {
      const current = roles();
      const next = { ...current, [id]: role };
      for (const [other, held] of Object.entries(current)) if (held === role) next[other] = current[id];
      savedRoles = next;
      emitStatus();
      return true;
    },
    async setAxisCentered(axisId, centered) {
      const { id } = view();
      deviceSettings[id] = { ...deviceSettings[id], centered: { ...deviceSettings[id]?.centered, [axisId]: centered } };
      emitStatus();
      return true;
    },
    async copyDeviceInfo() {
      const device = view();
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
    async installUpdate() {
      if (!update || update.state !== 'available') return;
      for (let progress = 0; progress <= 100; progress += 5) {
        update = { ...update, state: 'downloading', progress };
        emitStatus();
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
      update = { ...update, state: 'installing' };
      emitStatus();
      await new Promise((resolve) => setTimeout(resolve, 1500));
      update = { ...update, state: 'available', progress: 0 };
      emitStatus();
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
