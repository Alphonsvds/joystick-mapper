// Pure mapping engine: joystick state + bindings -> Xbox 360 (XUSB) report.
import { TARGET_BY_ID, XUSB, controlKind } from './controls.js';

// Nothing pressed, every axis centred (missing controls read as released / 0).
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

// Axis targets that turn a half-axis into a digital press once past halfway.
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

export function mapInput(input, bindings) {
  const acc = { buttons: 0, lt: 0, rt: 0, lx: 0, ly: 0, rx: 0, ry: 0 };

  for (const [controlId, binding] of Object.entries(bindings)) {
    const target = TARGET_BY_ID[binding.target];
    if (!target) continue;

    if (controlKind(controlId) === 'button') {
      if (!input.buttons[controlId]) continue;
      if (target.bit) acc.buttons |= target.bit;
      else if (target.id === 'lt' || target.id === 'rt') acc[target.id] = 1;
      else if (STICK_PUSH[target.id]) {
        const [axis, dir] = STICK_PUSH[target.id];
        acc[axis] += dir;
      }
      continue;
    }

    let v = clamp(input.axes[controlId] ?? 0, -1, 1);
    if (binding.invert) v = -v;
    const dz = binding.deadzone;

    if (STICK_AXIS[target.id]) {
      acc[STICK_AXIS[target.id]] += applyDeadzone(v, dz);
    } else if (target.id === 'lt' || target.id === 'rt') {
      acc[target.id] = Math.max(acc[target.id], applyLowDeadzone((v + 1) / 2, dz));
    } else if (target.id === 'lt_rt') {
      const d = applyDeadzone(v, dz);
      if (d < 0) acc.lt = Math.max(acc.lt, -d);
      else acc.rt = Math.max(acc.rt, d);
    } else if (SPLIT_BUTTONS[target.id]) {
      const d = applyDeadzone(v, dz);
      const [neg, pos] = SPLIT_BUTTONS[target.id];
      if (d <= -0.5) acc.buttons |= neg;
      else if (d >= 0.5) acc.buttons |= pos;
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
