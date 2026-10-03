// Turns a joystick's self-described layout (see src/main/hidp.js) into the controls the
// app maps: axes, hat directions and numbered buttons, with sensible defaults per axis
// type. Pure and shared, so it's unit-tested with layouts from sticks we don't own.
import { ROLES } from './controls.js';

const PAGE_GENERIC = 0x01;
const PAGE_SIMULATION = 0x02;
const USAGE_HAT = 0x39;

// Known axis usages. `centered`: springs back to the middle (calibrated, centre-zero).
// `invert`: flips raw direction so forward / right read as positive, like a gamepad.
const AXIS_USAGES = {
  [`${PAGE_GENERIC}:${0x30}`]: { id: 'x', name: 'X Axis', hint: 'Usually roll', centered: true },
  [`${PAGE_GENERIC}:${0x31}`]: { id: 'y', name: 'Y Axis', hint: 'Usually pitch', centered: true, invert: true },
  [`${PAGE_GENERIC}:${0x32}`]: { id: 'z', name: 'Z Axis', hint: 'Often a throttle or twist', centered: false, invert: true },
  [`${PAGE_GENERIC}:${0x33}`]: { id: 'rx', name: 'X Rotation', centered: true },
  [`${PAGE_GENERIC}:${0x34}`]: { id: 'ry', name: 'Y Rotation', centered: true, invert: true },
  [`${PAGE_GENERIC}:${0x35}`]: { id: 'rz', name: 'Twist (Rz)', hint: 'Usually yaw', centered: true, deadzone: 0.1 },
  [`${PAGE_GENERIC}:${0x36}`]: { id: 'slider', name: 'Slider', hint: 'Usually throttle', centered: false, invert: true },
  [`${PAGE_GENERIC}:${0x37}`]: { id: 'dial', name: 'Dial', centered: false, invert: true },
  [`${PAGE_GENERIC}:${0x38}`]: { id: 'wheel', name: 'Wheel', centered: false },
  [`${PAGE_SIMULATION}:${0xb0}`]: { id: 'aileron', name: 'Aileron', centered: true },
  [`${PAGE_SIMULATION}:${0xb8}`]: { id: 'elevator', name: 'Elevator', centered: true, invert: true },
  [`${PAGE_SIMULATION}:${0xba}`]: { id: 'rudder', name: 'Rudder', centered: true, deadzone: 0.08 },
  [`${PAGE_SIMULATION}:${0xbb}`]: { id: 'throttle', name: 'Throttle', centered: false },
  [`${PAGE_SIMULATION}:${0xc4}`]: { id: 'accelerator', name: 'Accelerator', centered: false },
  [`${PAGE_SIMULATION}:${0xc5}`]: { id: 'brake', name: 'Brake', centered: false },
  [`${PAGE_SIMULATION}:${0xc8}`]: { id: 'steering', name: 'Steering', centered: true },
};

// A hat that reports as five plain buttons: `first` is its "up" button.
const buttonHat = (name, first) =>
  Object.fromEntries(['Up', 'Right', 'Down', 'Left', 'Push'].map((dir, i) => [`btn${first + i}`, `${name} ${dir}`]));

// The same hat with its push first: `push`, then up, right, down, left.
const pushHat = (name, push) =>
  Object.fromEntries(['Push', 'Up', 'Right', 'Down', 'Left'].map((dir, i) => [`btn${push + i}`, `${name} ${dir}`]));

// `count` buttons in a row from `first`, named by their place in it: numbered(3, 5, (n) => `Rotary ${n}`).
const numbered = (first, count, name) => Object.fromEntries(Array.from({ length: count }, (_, i) => [`btn${first + i}`, name(i + 1)]));

// A switch or knob whose positions are buttons in a row from `first`: positions(86, 'Roll Switch', 'Up', 'Middle', 'Down').
const positions = (first, name, ...places) => Object.fromEntries(places.map((place, i) => [`btn${first + i}`, `${name} ${place}`]));

// How well a stick is known, shown next to its name:
//   full          photo layout and names, checked against the real stick
//   beta          photo layout and names that owners are still confirming
//   experimental  everything else: the generic layout, built from what the stick reports
export const SUPPORT_LABELS = Object.freeze({ full: 'Fully supported', beta: 'Beta', experimental: 'Experimental' });

// Sticks with a photo layout (see renderer/layout.js) and friendly names. `axes` says how
// an axis behaves when the descriptor can't: { [id]: { centered, invert, deadzone } }.
// A skin without a photo layout still fixes its names and axes, and shows as the list.
// Everything else gets the generic layout and is marked experimental until someone
// confirms it.
export const SKINS = Object.freeze({
  // WINWING Orion 2 joystick base with the F-16EX grip and its left extension (reports as
  // "WINWING Orion Joystick Base 2 + JGRIP-F16"). The grip's two levers rest at the bottom
  // of their axes (GitHub issue #7): the one beside the trigger is on Rz, which would read
  // as a twist held hard over, and the paddle is on Slider, which would read as squeezed.
  // Button numbers are from the Joystick Diagrams template for this grip. Each lever also
  // presses buttons along its travel, one of them while it rests; the order of the top
  // lever's five is inferred from that template, and so is which way the side hat points.
  // Beta until an owner has confirmed every label.
  '4098:bea8': {
    id: 'orion2f16ex',
    name: 'WINWING Orion 2 F-16EX',
    support: 'beta',
    names: {
      btn1: 'Top Lever Forward',
      btn2: 'Top Lever Rest',
      btn3: 'Top Lever Full',
      btn4: 'Trigger Stage 1',
      btn5: 'Trigger Stage 2',
      btn6: 'Pinky Button',
      btn7: 'Paddle Rest',
      btn8: 'Paddle Full',
      ...pushHat('Thumb Hat', 9),
      btn14: 'Side Hat Push',
      btn15: 'Side Hat Right',
      btn16: 'Side Hat Down',
      btn17: 'Side Hat Left',
      btn18: 'Side Hat Up',
      btn19: 'Trim Hat Push',
      btn20: 'Weapon Release',
      ...pushHat('Left Hat', 21),
      ...pushHat('Ministick', 26),
      ...pushHat('Centre Hat', 31),
      ...pushHat('Right Hat', 36),
      btn41: 'Top Lever Stage 1',
      btn42: 'Top Lever Stage 2',
      hat1: 'Trim Hat',
      x: 'Roll',
      y: 'Pitch',
      rx: 'Ministick X',
      ry: 'Ministick Y',
      rz: 'Top Lever',
      slider: 'Paddle',
    },
    hints: {
      x: 'Stick left / right',
      y: 'Stick forward / back',
      rx: 'Ministick in analog mode',
      ry: 'Ministick in analog mode',
      rz: 'Lever beside the trigger',
      slider: 'Lever at the foot of the grip',
    },
    axes: {
      rz: { centered: false, invert: false, deadzone: 0.02 },
      slider: { invert: false },
    },
  },
  // WINWING Orion 2 throttle base with the F-15EX handles (reports as "WINWING Orion
  // Throttle Base II + F15EX HANDLE L + F15EX HANDLE R"). Its throttle levers are the Rx
  // (right) and Ry (left) axes, which would read as a second stick (GitHub issue #7): Ry
  // reversed next to Rx, and wherever the levers sat at startup taken as their middle. The
  // sprung wheel on Z would read as a lever, and the antenna knob on Rz as a twist.
  // Button numbers are from the Joystick Diagrams template for this base and these
  // handles. The base's numbers are the same whichever handles are fitted; the handles'
  // are not (an F/A-18 map doesn't apply). The handle controls are named for how they look,
  // not for what they do in an F-15. Two buttons on the left handle, and the buttons the
  // wheel and the knob can also send, keep their generic names.
  // Not confirmed: which way the levers run (forward reads low, as for Slider and Dial),
  // and which end of each three-way switch is up; their middles are, from an owner's report.
  // Beta until an owner has confirmed every label.
  '4098:bd64': {
    id: 'orion2throttle',
    name: 'WINWING Orion 2 Throttle',
    support: 'beta',
    names: {
      btn1: 'Right Throttle Off',
      btn2: 'Left Throttle Off',
      ...positions(3, 'Paddle Switch', 'Up', 'Middle', 'Down'),
      ...buttonHat('Ribbed Hat', 6),
      btn11: 'Side Button',
      ...buttonHat('Cone Hat', 12),
      ...buttonHat('Inner Hat', 17),
      ...positions(22, 'Slide Switch', 'Up', 'Middle', 'Down'),
      btn25: 'Encoder Up',
      btn26: 'Encoder Push',
      btn27: 'Encoder Down',
      btn28: 'Front Hat Up',
      btn29: 'Front Hat Right',
      btn30: 'Right Throttle Idle',
      btn31: 'Left Throttle Idle',
      btn32: 'Front Hat Down',
      btn33: 'Front Hat Left',
      btn34: 'Front Hat Push',
      ...pushHat('TDC', 35),
      btn43: 'Encoder Far Up',
      btn44: 'Encoder Far Down',
      ...buttonHat('Left Hat', 51),
      ...positions(57, 'Lever Switch', 'Up', 'Middle', 'Down'),
      ...positions(65, 'Launch Bar', 'Retract', 'Extend'),
      ...positions(67, 'Hook', 'Up', 'Down'),
      ...positions(69, 'Wing', 'Fold', 'Hold', 'Spread'),
      btn72: 'Wing Fold Push',
      ...positions(73, 'Gear', 'Up', 'Down'),
      ...positions(75, 'Park Brake', 'On', 'Off'),
      ...positions(77, 'Flap', 'Auto', 'Half', 'Full'),
      btn80: 'Red Button',
      btn81: 'A/G Button',
      btn82: 'A/A Button',
      ...positions(83, 'HMD Knob', 'Left', 'Right', 'Push'),
      ...positions(86, 'Roll Switch', 'Up', 'Middle', 'Down'),
      ...positions(89, 'Pitch Switch', 'Up', 'Middle', 'Down'),
      btn92: 'ADV Mode Button',
      ...positions(93, 'Master', 'Arm', 'Safe', 'Sim'),
      btn96: 'Jettison Button',
      ...positions(97, 'HDG Knob', 'Left', 'Right', 'Push'),
      ...positions(100, 'CRS Knob', 'Left', 'Right', 'Push'),
      ...positions(103, 'Lights Knob', 'Left', 'Right', 'Push'),
      ...positions(106, 'Slider Lever', 'Forward', 'Middle', 'Back'),
      ...positions(109, 'Dial Lever', 'Forward', 'Middle', 'Back'),
      btn112: 'Right Finger Lift',
      btn113: 'Left Finger Lift',
      x: 'TDC X',
      y: 'TDC Y',
      z: 'Slew Wheel',
      rx: 'Right Throttle',
      ry: 'Left Throttle',
      rz: 'Antenna Knob',
      slider: 'Slider Lever',
      dial: 'Dial Lever',
    },
    hints: {
      x: 'Ministick on the right handle',
      y: 'Ministick on the right handle',
      z: 'Wheel on the right handle',
      rx: 'Throttle lever',
      ry: 'Throttle lever',
      rz: 'Knob on the left handle',
      slider: 'Lever marked Slider',
      dial: 'Lever marked Dial',
    },
    axes: {
      z: { centered: true },
      rx: { centered: false, invert: true },
      ry: { centered: false, invert: true },
      rz: { centered: false, deadzone: 0.02 },
    },
  },
  // Virpil ACE-Torq rudder pedals (reports as "VPC ACE-Torq Rudder"). The rudder is on Z,
  // which would read as a reversed throttle lever (GitHub issue #7). The pedals have no
  // toe brakes but still report an X and a Y, parked at the bottom of their range: read as
  // a stick they would be held hard over, and keep the rudder from centring itself.
  // No photo layout yet, so it shows as the list. Beta until an owner has confirmed that
  // the right pedal reads right.
  '3344:01f9': {
    id: 'acetorq',
    name: 'Virpil ACE-Torq Rudder',
    support: 'beta',
    names: { z: 'Rudder', x: 'Spare X', y: 'Spare Y' },
    hints: { z: 'Push a pedal forward', x: 'Unused', y: 'Unused' },
    axes: {
      z: { centered: true, invert: false },
      x: { centered: false, invert: false },
      y: { centered: false, invert: false },
    },
  },
  // VKB STECS Modern Throttle Mk.II Standard: twin grips, base and STEM module (reports as
  // "S-TECS MODERN THROTTLE STANDARD STEM"). Its two throttle levers are the 12-bit X and
  // Y axes, which would read as a stick (GitHub issue #2): Y reversed next to X, drawn as
  // a crosshair, and Recenter would take the idle position as the middle.
  // Button numbers are from an owner's filled-in VKB template. It left out 19, 55 and 56,
  // the ministick and the analog wheel, so those keep their generic names. Beta until an
  // owner has confirmed every label against the throttle.
  '231d:012d': {
    id: 'stecsstandard',
    name: 'VKB STECS Standard',
    support: 'beta',
    names: {
      btn1: 'Dot Button',
      btn2: 'Red Start',
      ...numbered(3, 5, (n) => `Rotary ${n}`),
      btn8: 'Left Trigger Rear',
      btn9: 'Left Trigger Front',
      btn10: 'Red Button',
      btn11: 'RST Button',
      btn12: 'Centre Wheel Back',
      btn13: 'Centre Wheel Forward',
      btn14: 'End Wheel Forward',
      btn15: 'End Wheel Back',
      btn16: 'Right Trigger Rear',
      btn17: 'Right Trigger Front',
      btn18: 'ENT Button',
      btn20: 'Thumb Hat Push',
      btn21: 'Front Hat Push',
      btn22: 'Rocker Push',
      btn23: 'Front Grey Button',
      btn24: 'Thumb Grey Button',
      btn25: 'Thumb Hat Up',
      btn26: 'Thumb Hat Down',
      btn27: 'Thumb Hat Forward',
      btn28: 'Thumb Hat Back',
      btn29: 'Front Hat Left',
      btn30: 'Front Hat Right',
      btn31: 'Front Hat Down',
      btn32: 'Front Hat Up',
      btn33: 'Rocker Down',
      btn34: 'Rocker Up',
      btn35: 'A1 Button',
      btn36: 'A2 Button',
      btn37: 'C1 Button',
      ...numbered(38, 5, (n) => `B${n} Button`),
      btn43: 'SW1 Up',
      btn44: 'SW1 Push',
      btn45: 'SW1 Down',
      btn46: 'SW2 Up',
      btn47: 'SW2 Push',
      btn48: 'SW2 Down',
      btn49: 'Toggle Up',
      btn50: 'Toggle Down',
      btn51: 'EN1 Left',
      btn52: 'EN1 Right',
      btn53: 'EN2 Left',
      btn54: 'EN2 Right',
      btn57: 'Flip Switch Up',
      btn58: 'Flip Switch Down',
      x: 'Throttle 1',
      y: 'Throttle 2',
    },
    hints: { x: 'Throttle lever', y: 'Throttle lever' },
    axes: { x: { centered: false, invert: false }, y: { centered: false, invert: false } },
  },
  // Turtle Beach VelocityOne Flightstick, in its default right-hand orientation (the
  // left-hand setting swaps the two button columns and the levers). Its axes aren't where
  // the generic defaults expect them (GitHub issue #3): the twist is on Z, which would
  // read as a reversed throttle, the left lever is on Rz, which would read as a twist,
  // and the right lever on Dial would run the opposite way to the left one.
  // Axis roles and button numbers are from the game defaults for this stick and Turtle
  // Beach's control list. Those leave out 15, 20, 22 and 24, so the touchpad click and the
  // Xbox and Share buttons keep their generic names. 13 and 14 are the trim wheel when it
  // is set to "Digital Buttons". Beta until an owner has confirmed every label.
  '10f5:7055': {
    id: 'velocityoneflightstick',
    name: 'VelocityOne Flightstick',
    support: 'beta',
    names: {
      btn1: 'Left A Button',
      btn2: 'Left B Button',
      btn3: 'Left X Button',
      btn4: 'Left Y Button',
      btn5: 'Right A Button',
      btn6: 'Right B Button',
      btn7: 'Right X Button',
      btn8: 'Right Y Button',
      btn9: 'Left Lever Top',
      btn10: 'Left Lever Bottom',
      btn11: 'Right Lever Top',
      btn12: 'Right Lever Bottom',
      btn13: 'Trim Wheel Down',
      btn14: 'Trim Wheel Up',
      btn16: 'B16 Button',
      btn17: 'B17 Button',
      btn18: 'Trigger',
      btn19: 'H2 Push',
      btn21: 'View Button',
      btn23: 'Menu Button',
      hat1: 'H1 Hat',
      x: 'Roll',
      y: 'Pitch',
      z: 'Yaw',
      rx: 'H2 Stick X',
      ry: 'H2 Stick Y',
      rz: 'Left Lever',
      dial: 'Right Lever',
      slider: 'Trim Wheel',
    },
    hints: {
      x: 'Stick left / right',
      y: 'Stick forward / back',
      z: 'Twist the stick',
      rx: 'H2 ministick',
      ry: 'H2 ministick',
      rz: 'Lever on the left of the base',
      dial: 'Lever on the right of the base',
      slider: 'Wheel under the touchpad',
    },
    axes: {
      z: { centered: true, invert: false, deadzone: 0.1 },
      rz: { centered: false, invert: false, deadzone: 0.02 },
      dial: { invert: false },
    },
  },
  // VKB Gladiator NXT EVO, right hand (reports as "VKBsim Gladiator EVO R"), with the
  // Premium / Space Combat grip. Button numbers are VKB's factory profile; the stick
  // advertises 128 buttons and two spare axes (Slider, Dial) that it doesn't use.
  // An owner has confirmed the labels against the stick (GitHub issue #1).
  '231d:0200': {
    id: 'gladiatorevo',
    name: 'VKB Gladiator NXT EVO',
    names: {
      btn1: 'Trigger Stage 1',
      btn2: 'Trigger Stage 2',
      btn3: 'A2 Button',
      btn4: 'B1 Button',
      btn5: 'D1 Button',
      ...buttonHat('A3', 6),
      ...buttonHat('A4', 11),
      ...buttonHat('C1', 16),
      btn21: 'Rapid Fire Forward',
      btn22: 'Rapid Fire Back',
      btn23: 'En1 Up',
      btn24: 'En1 Down',
      btn25: 'Sw1 Up',
      btn26: 'Sw1 Down',
      btn27: 'F1',
      btn28: 'F2',
      btn29: 'F3',
      hat1: 'A1 Hat',
      x: 'Roll',
      y: 'Pitch',
      rz: 'Yaw',
      z: 'Throttle',
      rx: 'A1 Stick X',
      ry: 'A1 Stick Y',
    },
    hints: {
      x: 'Stick left / right',
      y: 'Stick forward / back',
      rz: 'Twist the stick',
      z: 'Lever on the base',
      rx: 'A1 ministick in analog mode',
      ry: 'A1 ministick in analog mode',
    },
  },
  '046d:c215': {
    id: 'extreme3dpro',
    name: 'Logitech Extreme 3D Pro',
    names: {
      btn1: 'Trigger',
      btn2: 'Thumb Button',
      hat1: 'Hat Switch',
      x: 'Roll',
      y: 'Pitch',
      rz: 'Yaw',
      slider: 'Throttle',
    },
    hints: {
      x: 'Stick left / right',
      y: 'Stick forward / back',
      rz: 'Twist the stick',
      slider: 'Slider on the base',
    },
  },
});

export const deviceKey = (vendorId, productId) =>
  `${vendorId.toString(16).padStart(4, '0')}:${productId.toString(16).padStart(4, '0')}`;

export const defaultDeadzone = (axis, centered) => axis.deadzone ?? (centered ? 0.04 : 0.02);

// Windows calls throttles and pedals joysticks too, so the name is the only clue.
const ROLE_HINTS = [
  ['pedals', /pedal|rudder|tfrp|crosswind/i],
  ['throttle', /throttle|twcs|quadrant|collective/i],
];

export const guessRole = (name) => ROLE_HINTS.find(([, hint]) => hint.test(name ?? ''))?.[0] ?? null;

// Gives each plugged-in device a role (see shared/controls.js). `devices` is
// [{ id, name }] in a stable order; `saved` is { [id]: role } as remembered or chosen
// before. A device on its own is the stick unless it was given another role, so a
// single stick maps exactly as it did before HOTAS support. With several, names decide
// what they can and the rest fill the free roles in order.
// Returns { [id]: role }; devices beyond the last role get none.
export function assignRoles(devices, saved = {}) {
  const roles = {};
  const free = new Set(ROLES);
  const give = (device, role) => {
    roles[device.id] = role;
    free.delete(role);
  };
  for (const d of devices) if (free.has(saved[d.id])) give(d, saved[d.id]);
  if (devices.length > 1) {
    for (const d of devices) {
      const guess = guessRole(d.name);
      if (!roles[d.id] && free.has(guess)) give(d, guess);
    }
  }
  for (const d of devices) if (!roles[d.id] && free.size) give(d, ROLES.find((role) => free.has(role)));
  return roles;
}

// layout: { values: [{ page, usage, min, max, … }], buttonCount } from HidParser.
// Returns a serialisable model the main process and the UI share.
// `ignoreSkin` shows a known stick with the generic layout (for testing that path).
export function describeDevice(layout, { vendorId, productId, name, ignoreSkin = false }) {
  const key = deviceKey(vendorId, productId);
  const skin = ignoreSkin ? null : (SKINS[key] ?? null);
  const axes = [];
  const hats = [];
  const taken = new Set();

  layout.values.forEach((field, index) => {
    if (field.page === PAGE_GENERIC && field.usage === USAGE_HAT) {
      const id = `hat${hats.length + 1}`;
      hats.push({ id, name: skin?.names[id] ?? (hats.length ? `Hat ${hats.length + 1}` : 'Hat Switch'), index, min: field.min, max: field.max });
      return;
    }
    const known = AXIS_USAGES[`${field.page}:${field.usage}`];
    if (!known || field.max <= field.min) return; // vendor data, LEDs, counters…
    let id = known.id;
    let label = known.name;
    for (let n = 2; taken.has(id); n++) {
      id = `${known.id}${n}`;
      label = `${known.name} ${n}`;
    }
    taken.add(id);
    const quirk = skin?.axes?.[id];
    axes.push({
      id,
      name: skin?.names[id] ?? label,
      hint: skin?.hints?.[id] ?? known.hint ?? '',
      index,
      min: field.min,
      max: field.max,
      centered: quirk?.centered ?? known.centered,
      invert: quirk?.invert ?? known.invert === true,
      deadzone: quirk?.deadzone ?? known.deadzone,
    });
  });

  const buttons = Math.min(layout.buttonCount, 128);
  return {
    key,
    name: skin?.name ?? name ?? `Joystick ${key}`,
    skin: skin?.id ?? null,
    support: skin ? (skin.support ?? 'full') : 'experimental',
    axes,
    hats,
    buttons,
    buttonNames: Object.fromEntries(
      Array.from({ length: buttons }, (_, i) => [`btn${i + 1}`, skin?.names[`btn${i + 1}`] ?? `Button ${i + 1}`]),
    ),
  };
}

// Hat position -> [up, right, down, left]. Handles 4- and 8-way hats and hats that
// report degrees; anything outside the range means "centred".
export function hatDirections(raw, min, max) {
  const span = max - min;
  const pos = raw - min;
  if (raw === null || raw === undefined || pos < 0 || pos > span) return [false, false, false, false];
  const angle = span >= 300 && span <= 360 ? pos : (pos * 360) / (span + 1);
  return [
    angle < 67.5 || angle > 292.5,
    angle > 22.5 && angle < 157.5,
    angle > 112.5 && angle < 247.5,
    angle > 202.5 && angle < 337.5,
  ];
}

const clamp = (v) => Math.min(1, Math.max(-1, v));

// Axis setting overrides (per device) come from `settings`:
//   { centered: { [axisId]: bool }, calibration: { [axisId]: rawCentre } }
export const isCentered = (axis, settings) => settings?.centered?.[axis.id] ?? axis.centered;

// Decoded raw values -> { buttons: { btn1, hat1_up, … }, axes: { x: -1..1, … } }.
// `prefix` goes in front of every control ID: the device's role, when it isn't the stick.
export function normalizeInput(decoded, model, settings, prefix = '') {
  const axes = {};
  for (const axis of model.axes) {
    const id = prefix + axis.id;
    const raw = decoded.values[axis.index];
    if (raw === null || raw === undefined) {
      axes[id] = 0;
      continue;
    }
    let n;
    if (isCentered(axis, settings)) {
      const c = settings?.calibration?.[axis.id] ?? (axis.min + axis.max) / 2;
      n = raw >= c ? (raw - c) / Math.max(1e-9, axis.max - c) : (raw - c) / Math.max(1e-9, c - axis.min);
    } else {
      n = ((raw - axis.min) / (axis.max - axis.min)) * 2 - 1;
    }
    n = clamp(n);
    axes[id] = axis.invert ? -n || 0 : n; // `|| 0` avoids -0 at rest
  }

  const buttons = {};
  for (let b = 1; b <= model.buttons; b++) buttons[`${prefix}btn${b}`] = decoded.buttons.has(b);
  for (const hat of model.hats) {
    const [up, right, down, left] = hatDirections(decoded.values[hat.index], hat.min, hat.max);
    buttons[`${prefix}${hat.id}_up`] = up;
    buttons[`${prefix}${hat.id}_right`] = right;
    buttons[`${prefix}${hat.id}_down`] = down;
    buttons[`${prefix}${hat.id}_left`] = left;
  }
  return { buttons, axes };
}

// Several devices' states (each already carrying its role in the IDs) -> one input.
export function mergeInputs(states) {
  const merged = { buttons: {}, axes: {} };
  for (const state of states) {
    Object.assign(merged.buttons, state.buttons);
    Object.assign(merged.axes, state.axes);
  }
  return merged;
}
