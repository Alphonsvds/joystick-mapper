// Pure mapping engine: joystick state + bindings -> Xbox 360 (XUSB) report.
import { DEFAULT_PRESS_POINT, TARGET_BY_ID, XUSB, controlKind } from './controls.js';

// Nothing pressed and no axis reporting (missing controls read as released / at rest).
export const NEUTRAL_INPUT = Object.freeze({ buttons: Object.freeze({}), axes: Object.freeze({}) });

export const NEUTRAL_OUTPUT = Object.freeze({ buttons: 0, lt: 0, rt: 0, lx: 0, ly: 0, rx: 0, ry: 0 });

// Button-style targets that push a stick fully in one direction.
const STICK_PUSH = {
  ls_up: ['ly', 1],
  ls_down: ['ly', -1],
  ls_left: ['lx', -1],
  ls_right: ['lx', 1],
  rs_up: ['ry', 1],
  rs_down: ['ry', -1],
  rs_left: ['rx', -1],
  rs_right: ['rx', 1],
};

const STICK_AXIS = { ls_x: 'lx', ls_y: 'ly', rs_x: 'rx', rs_y: 'ry' };

// Axis targets that turn a half-axis into a digital press once past its press point
// (halfway unless set).
const SPLIT_BUTTONS = {
  lb_rb: [XUSB.LEFT_SHOULDER, XUSB.RIGHT_SHOULDER],
  dpad_x: [XUSB.DPAD_LEFT, XUSB.DPAD_RIGHT],
  dpad_y: [XUSB.DPAD_DOWN, XUSB.DPAD_UP],
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Centred deadzone that rescales so the output still reaches ±1.
export function applyDeadzone(v, dz) {
  const mag = Math.abs(v);
  if (mag <= dz) return 0;
  return Math.sign(v) * Math.min(1, (mag - dz) / (1 - dz));
}

// Deadzone at the low end of a 0..1 range (a trigger resting at zero).
function applyLowDeadzone(t, dz) {
  if (t <= dz) return 0;
  return Math.min(1, (t - dz) / (1 - dz));
}

// Anti-deadzone: any movement (a magnitude above 0) starts at `floor` instead of zero and
// still reaches 1, so the output clears a deadzone the game applies on its side.
export function applyAntiDeadzone(mag, floor) {
  return mag > 0 ? floor + (1 - floor) * mag : 0;
}

// Sensitivity bends a 0..1 magnitude into a curve that still runs from 0 to 1: above 0
// small movements do more, below 0 they do less (finer control near rest). At ±1 the
// curve is a cube root or a cube; at 0 it's a straight line.
const SENSITIVITY_CURVE = 3;
export function applySensitivity(mag, sensitivity) {
  return sensitivity ? mag ** (SENSITIVITY_CURVE ** -sensitivity) : mag;
}

// Everything after the deadzone, on a 0..1 magnitude: the curve, then the anti-deadzone
// lift (so the lift stays where it's set whatever the curve).
function shape(mag, binding) {
  return applyAntiDeadzone(applySensitivity(mag, binding.sensitivity ?? 0), binding.antiDeadzone ?? 0);
}

export function mapInput(input, bindings) {
  const acc = { buttons: 0, lt: 0, rt: 0, lx: 0, ly: 0, rx: 0, ry: 0 };

  for (const [controlId, binding] of Object.entries(bindings)) {
    const target = TARGET_BY_ID[binding.target];
    if (!target) continue;

    if (controlKind(controlId) === 'button') {
      if (!input.buttons[controlId]) continue;
      if (target.bit) acc.buttons |= target.bit;
      else if (target.id === 'lt' || target.id === 'rt') acc[target.id] = 1;
      else if (target.id === 'lt_rt_both') acc.lt = acc.rt = 1;
      else if (STICK_PUSH[target.id]) {
        const [axis, dir] = STICK_PUSH[target.id];
        acc[axis] += dir;
      }
      continue;
    }

    // An axis nothing is reporting (its device is unplugged, or the stick lacks it) is
    // left out: read as 0 it would hold a trigger halfway.
    const raw = input.axes[controlId];
    if (raw === undefined) continue;
    let v = clamp(raw, -1, 1);
    if (binding.invert) v = -v;
    const dz = binding.deadzone;

    if (STICK_AXIS[target.id]) {
      const d = applyDeadzone(v, dz);
      acc[STICK_AXIS[target.id]] += Math.sign(d) * shape(Math.abs(d), binding);
    } else if (target.id === 'lt' || target.id === 'rt') {
      acc[target.id] = Math.max(acc[target.id], shape(applyLowDeadzone((v + 1) / 2, dz), binding));
    } else if (target.id === 'lt_rt') {
      const d = applyDeadzone(v, dz);
      const pull = shape(Math.abs(d), binding);
      if (d < 0) acc.lt = Math.max(acc.lt, pull);
      else acc.rt = Math.max(acc.rt, pull);
    } else if (SPLIT_BUTTONS[target.id]) {
      const d = applyDeadzone(v, dz);
      const [neg, pos] = SPLIT_BUTTONS[target.id];
      const point = binding.pressPoint ?? DEFAULT_PRESS_POINT;
      if (d <= -point) acc.buttons |= neg;
      else if (d >= point) acc.buttons |= pos;
    }
  }

  // A real D-pad can't press opposite directions together; some games misbehave if it does.
  if (acc.buttons & XUSB.DPAD_UP && acc.buttons & XUSB.DPAD_DOWN) acc.buttons &= ~(XUSB.DPAD_UP | XUSB.DPAD_DOWN);
  if (acc.buttons & XUSB.DPAD_LEFT && acc.buttons & XUSB.DPAD_RIGHT) acc.buttons &= ~(XUSB.DPAD_LEFT | XUSB.DPAD_RIGHT);

  const toShort = (v) => Math.round(clamp(v, -1, 1) * 32767);
  const toByte = (t) => Math.round(clamp(t, 0, 1) * 255);
  return {
    buttons: acc.buttons,
    lt: toByte(acc.lt),
    rt: toByte(acc.rt),
    lx: toShort(acc.lx),
    ly: toShort(acc.ly),
    rx: toShort(acc.rx),
    ry: toShort(acc.ry),
  };
}

export function sameOutput(a, b) {
  return (
    a.buttons === b.buttons &&
    a.lt === b.lt &&
    a.rt === b.rt &&
    a.lx === b.lx &&
    a.ly === b.ly &&
    a.rx === b.rx &&
    a.ry === b.ry
  );
}
