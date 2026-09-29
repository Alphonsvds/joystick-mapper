// Shared definitions used by both the Electron main process and the renderer:
// the physical controls on the joystick, the Xbox 360 outputs they can drive,
// and the profile format that ties them together.

// XUSB (XInput) button bits, as submitted to the virtual Xbox 360 controller.
export const XUSB = Object.freeze({
  DPAD_UP: 0x0001,
  DPAD_DOWN: 0x0002,
  DPAD_LEFT: 0x0004,
  DPAD_RIGHT: 0x0008,
  START: 0x0010,
  BACK: 0x0020,
  LEFT_THUMB: 0x0040,
  RIGHT_THUMB: 0x0080,
  LEFT_SHOULDER: 0x0100,
  RIGHT_SHOULDER: 0x0200,
  GUIDE: 0x0400,
  A: 0x1000,
  B: 0x2000,
  X: 0x4000,
  Y: 0x8000,
});

// Every input on the Logitech Extreme 3D Pro. Hat directions behave like buttons.
// Axis values are normalised to -1..1 with a "gamepad" sense: roll right, pitch
// forward, twist right and throttle forward are all positive.
export const PHYSICAL_CONTROLS = Object.freeze([
  { id: 'trigger', name: 'Trigger', kind: 'button' },
  { id: 'thumb', name: 'Thumb Button', kind: 'button' },
  { id: 'b3', name: 'Button 3', kind: 'button' },
  { id: 'b4', name: 'Button 4', kind: 'button' },
  { id: 'b5', name: 'Button 5', kind: 'button' },
  { id: 'b6', name: 'Button 6', kind: 'button' },
  { id: 'b7', name: 'Button 7', kind: 'button' },
  { id: 'b8', name: 'Button 8', kind: 'button' },
  { id: 'b9', name: 'Button 9', kind: 'button' },
  { id: 'b10', name: 'Button 10', kind: 'button' },
  { id: 'b11', name: 'Button 11', kind: 'button' },
  { id: 'b12', name: 'Button 12', kind: 'button' },
  { id: 'hat_up', name: 'Hat Up', kind: 'button' },
  { id: 'hat_right', name: 'Hat Right', kind: 'button' },
  { id: 'hat_down', name: 'Hat Down', kind: 'button' },
  { id: 'hat_left', name: 'Hat Left', kind: 'button' },
  { id: 'pitch', name: 'Pitch', kind: 'axis', hint: 'Stick forward / back', defaultDeadzone: 0.04 },
  { id: 'roll', name: 'Roll', kind: 'axis', hint: 'Stick left / right', defaultDeadzone: 0.04 },
  { id: 'yaw', name: 'Yaw', kind: 'axis', hint: 'Twist the stick', defaultDeadzone: 0.1 },
  { id: 'throttle', name: 'Throttle', kind: 'axis', hint: 'Slider on the base', defaultDeadzone: 0.02 },
]);

export const CONTROL_BY_ID = Object.freeze(Object.fromEntries(PHYSICAL_CONTROLS.map((c) => [c.id, c])));

// Xbox 360 outputs. `accepts` says which kind of physical control may drive it.
export const TARGETS = Object.freeze([
  { id: 'a', name: 'A Button', accepts: ['button'], bit: XUSB.A },
  { id: 'b', name: 'B Button', accepts: ['button'], bit: XUSB.B },
  { id: 'x', name: 'X Button', accepts: ['button'], bit: XUSB.X },
  { id: 'y', name: 'Y Button', accepts: ['button'], bit: XUSB.Y },
  { id: 'lb', name: 'Left Bumper', accepts: ['button'], bit: XUSB.LEFT_SHOULDER },
  { id: 'rb', name: 'Right Bumper', accepts: ['button'], bit: XUSB.RIGHT_SHOULDER },
  { id: 'lt', name: 'Left Trigger', accepts: ['button', 'axis'], hint: 'Axis: full travel = 0–100% trigger' },
  { id: 'rt', name: 'Right Trigger', accepts: ['button', 'axis'], hint: 'Axis: full travel = 0–100% trigger' },
  { id: 'dpad_up', name: 'D-Pad Up', accepts: ['button'], bit: XUSB.DPAD_UP },
  { id: 'dpad_down', name: 'D-Pad Down', accepts: ['button'], bit: XUSB.DPAD_DOWN },
  { id: 'dpad_left', name: 'D-Pad Left', accepts: ['button'], bit: XUSB.DPAD_LEFT },
  { id: 'dpad_right', name: 'D-Pad Right', accepts: ['button'], bit: XUSB.DPAD_RIGHT },
  { id: 'ls_up', name: 'Left Stick Up', accepts: ['button'] },
  { id: 'ls_down', name: 'Left Stick Down', accepts: ['button'] },
  { id: 'ls_left', name: 'Left Stick Left', accepts: ['button'] },
  { id: 'ls_right', name: 'Left Stick Right', accepts: ['button'] },
  { id: 'ls_click', name: 'Left Stick Click', accepts: ['button'], bit: XUSB.LEFT_THUMB },
  { id: 'rs_up', name: 'Right Stick Up', accepts: ['button'] },
  { id: 'rs_down', name: 'Right Stick Down', accepts: ['button'] },
  { id: 'rs_left', name: 'Right Stick Left', accepts: ['button'] },
  { id: 'rs_right', name: 'Right Stick Right', accepts: ['button'] },
  { id: 'rs_click', name: 'Right Stick Click', accepts: ['button'], bit: XUSB.RIGHT_THUMB },
  {
    id: 'ls_rs_click',
    name: 'L3 + R3',
    accepts: ['button'],
    bit: XUSB.LEFT_THUMB | XUSB.RIGHT_THUMB,
    hint: 'Clicks both sticks at once (flares in Ace Combat)',
  },
  { id: 'view', name: 'View', accepts: ['button'], bit: XUSB.BACK, hint: 'Back on Xbox 360 pads' },
  { id: 'menu', name: 'Menu', accepts: ['button'], bit: XUSB.START, hint: 'Start on Xbox 360 pads' },
  { id: 'ls_x', name: 'Left Stick X', accepts: ['axis'], hint: 'Left stick, left ↔ right' },
  { id: 'ls_y', name: 'Left Stick Y', accepts: ['axis'], hint: 'Left stick, down ↔ up' },
  { id: 'rs_x', name: 'Right Stick X', accepts: ['axis'], hint: 'Right stick, left ↔ right' },
  { id: 'rs_y', name: 'Right Stick Y', accepts: ['axis'], hint: 'Right stick, down ↔ up' },
  { id: 'lt_rt', name: 'LT / RT Split', accepts: ['axis'], hint: 'Back half → LT, forward half → RT' },
  { id: 'lb_rb', name: 'LB / RB Split', accepts: ['axis'], hint: 'Past halfway: left → LB, right → RB' },
  { id: 'dpad_x', name: 'D-Pad Left / Right', accepts: ['axis'], hint: 'Past halfway: left / right on the D-pad' },
  { id: 'dpad_y', name: 'D-Pad Down / Up', accepts: ['axis'], hint: 'Past halfway: down / up on the D-pad' },
]);

export const TARGET_BY_ID = Object.freeze(Object.fromEntries(TARGETS.map((t) => [t.id, t])));

// How the target picker groups outputs, per kind of physical control.
export const TARGET_MENUS = Object.freeze({
  button: [
    { title: 'Face buttons', items: ['a', 'b', 'x', 'y'] },
    { title: 'Bumpers & triggers', items: ['lb', 'rb', 'lt', 'rt'] },
    { title: 'D-pad', items: ['dpad_up', 'dpad_down', 'dpad_left', 'dpad_right'] },
    { title: 'Left stick', items: ['ls_up', 'ls_down', 'ls_left', 'ls_right', 'ls_click'] },
    { title: 'Right stick', items: ['rs_up', 'rs_down', 'rs_left', 'rs_right', 'rs_click'] },
    { title: 'Menu', items: ['view', 'menu'] },
    { title: 'Combos', items: ['ls_rs_click'] },
  ],
  axis: [
    { title: 'Stick axes', items: ['ls_x', 'ls_y', 'rs_x', 'rs_y'] },
    { title: 'Triggers', items: ['lt', 'rt', 'lt_rt'] },
    { title: 'Digital', items: ['lb_rb', 'dpad_x', 'dpad_y'] },
  ],
});

export const MAX_DEADZONE = 0.5;

export function unmappedBinding(control) {
  return control.kind === 'axis'
    ? { target: null, invert: false, deadzone: control.defaultDeadzone }
    : { target: null };
}

export function emptyBindings() {
  return Object.fromEntries(PHYSICAL_CONTROLS.map((c) => [c.id, unmappedBinding(c)]));
}

// Returns a clean binding for `control`, or null when `raw` isn't a valid one.
export function sanitizeBinding(control, raw) {
  if (!control || !raw || typeof raw !== 'object') return null;
  const target = raw.target ?? null;
  if (target !== null) {
    const def = TARGET_BY_ID[target];
    if (!def || !def.accepts.includes(control.kind)) return null;
  }
  if (control.kind !== 'axis') return { target };
  const dz = Number(raw.deadzone);
  return {
    target,
    invert: raw.invert === true,
    deadzone: Number.isFinite(dz) ? Math.min(MAX_DEADZONE, Math.max(0, dz)) : control.defaultDeadzone,
  };
}

// Accepts anything (read from disk, imported, a partial preset) and returns a
// complete, valid set of bindings; invalid entries fall back to unmapped.
export function normalizeBindings(raw) {
  const bindings = emptyBindings();
  if (!raw || typeof raw !== 'object') return bindings;
  for (const control of PHYSICAL_CONTROLS) {
    const clean = sanitizeBinding(control, raw[control.id]);
    if (clean) bindings[control.id] = clean;
  }
  return bindings;
}
