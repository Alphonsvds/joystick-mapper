// Turns a joystick's self-described layout (see src/main/hidp.js) into the controls the
// app maps: axes, hat directions and numbered buttons, with sensible defaults per axis
// type. Pure and shared, so it's unit-tested with layouts from sticks we don't own.

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

// How well a stick is known, shown next to its name:
//   full          photo layout and names, checked against the real stick
//   beta          photo layout and names that owners are still confirming
//   experimental  everything else: the generic layout, built from what the stick reports
export const SUPPORT_LABELS = Object.freeze({ full: 'Fully supported', beta: 'Beta', experimental: 'Experimental' });

// Sticks with a photo layout and friendly names. Everything else gets the generic
// layout and is marked experimental until someone confirms it.
export const SKINS = Object.freeze({
  // VKB Gladiator NXT EVO, right hand (reports as "VKBsim Gladiator EVO R"), with the
  // Premium / Space Combat grip. Button numbers are VKB's factory profile; the stick
  // advertises 128 buttons and two spare axes (Slider, Dial) that it doesn't use.
  // Beta until an owner has confirmed every label against the stick.
  '231d:0200': {
    id: 'gladiatorevo',
    name: 'VKB Gladiator NXT EVO',
    support: 'beta',
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
    axes.push({
      id,
      name: skin?.names[id] ?? label,
      hint: skin?.hints?.[id] ?? known.hint ?? '',
      index,
      min: field.min,
      max: field.max,
      centered: known.centered,
      invert: known.invert === true,
      deadzone: known.deadzone,
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
export function normalizeInput(decoded, model, settings) {
  const axes = {};
  for (const axis of model.axes) {
    const raw = decoded.values[axis.index];
    if (raw === null || raw === undefined) {
      axes[axis.id] = 0;
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
    axes[axis.id] = axis.invert ? -n || 0 : n; // `|| 0` avoids -0 at rest
  }

  const buttons = {};
  for (let b = 1; b <= model.buttons; b++) buttons[`btn${b}`] = decoded.buttons.has(b);
  for (const hat of model.hats) {
    const [up, right, down, left] = hatDirections(decoded.values[hat.index], hat.min, hat.max);
    buttons[`${hat.id}_up`] = up;
    buttons[`${hat.id}_right`] = right;
    buttons[`${hat.id}_down`] = down;
    buttons[`${hat.id}_left`] = left;
  }
  return { buttons, axes };
}
