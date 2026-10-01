// Shared definitions used by both the Electron main process and the renderer:
// the joystick control IDs, the Xbox 360 outputs they can drive, and the binding
// format that ties them together.

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

// Joystick controls are identified generically so bindings work on any stick:
//   btn1…btnN               buttons, numbered as the stick reports them
//   hat1_up / _right / …    hat directions (they behave like buttons)
//   x, y, rz, slider, …     axes, named after their HID usage (see shared/devices.js)
// Axis values are normalised to -1..1 with a "gamepad" sense: right, forward and
// throttle-forward are positive.
//
// A HOTAS is several devices feeding one virtual pad, each with a role. The stick's
// controls keep the plain IDs above, so profiles made for one stick are unchanged; the
// other devices' controls carry their role: throttle.z, pedals.rz, extra.btn4.
export const ROLES = Object.freeze(['stick', 'throttle', 'pedals', 'extra']);
export const ROLE_NAMES = Object.freeze({ stick: 'Stick', throttle: 'Throttle', pedals: 'Pedals', extra: 'Extra' });

const BUTTON_ID = /^btn\d{1,3}$/;
const HAT_ID = /^hat\d_(up|right|down|left)$/;
const AXIS_ID = /^[a-z][a-z0-9]{0,15}$/;
const ROLE_ID = /^(throttle|pedals|extra)\.(.+)$/;

export const rolePrefix = (role) => (role === 'stick' ? '' : `${role}.`);

// "throttle.z" -> { role: 'throttle', local: 'z' }; "btn1" -> { role: 'stick', local: 'btn1' }.
export function splitControlId(id) {
  const match = ROLE_ID.exec(id);
  return match ? { role: match[1], local: match[2] } : { role: 'stick', local: id };
}

export function controlKind(id) {
  if (typeof id !== 'string') return null;
  const { local } = splitControlId(id);
  if (BUTTON_ID.test(local) || HAT_ID.test(local)) return 'button';
  if (AXIS_ID.test(local)) return 'axis';
  return null;
}

// Control IDs used before joysticks were detected generically (Extreme 3D Pro only).
export const LEGACY_CONTROL_IDS = Object.freeze({
  trigger: 'btn1',
  thumb: 'btn2',
  ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`b${i + 3}`, `btn${i + 3}`])),
  hat_up: 'hat1_up',
  hat_right: 'hat1_right',
  hat_down: 'hat1_down',
  hat_left: 'hat1_left',
  roll: 'x',
  pitch: 'y',
  yaw: 'rz',
  throttle: 'slider',
});

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
  {
    id: 'lb_rb_both',
    name: 'LB + RB',
    accepts: ['button'],
    bit: XUSB.LEFT_SHOULDER | XUSB.RIGHT_SHOULDER,
    hint: 'Presses both bumpers at once',
  },
  { id: 'lt_rt_both', name: 'LT + RT', accepts: ['button'], hint: 'Pulls both triggers at once' },
  { id: 'view', name: 'View', accepts: ['button'], bit: XUSB.BACK, hint: 'Back on Xbox 360 pads' },
  { id: 'menu', name: 'Menu', accepts: ['button'], bit: XUSB.START, hint: 'Start on Xbox 360 pads' },
  { id: 'ls_x', name: 'Left Stick X', accepts: ['axis'], hint: 'Left stick, left ↔ right' },
  { id: 'ls_y', name: 'Left Stick Y', accepts: ['axis'], hint: 'Left stick, down ↔ up' },
  { id: 'rs_x', name: 'Right Stick X', accepts: ['axis'], hint: 'Right stick, left ↔ right' },
  { id: 'rs_y', name: 'Right Stick Y', accepts: ['axis'], hint: 'Right stick, down ↔ up' },
  { id: 'lt_rt', name: 'LT / RT Split', accepts: ['axis'], hint: 'Back half → LT, forward half → RT' },
  // `digital`: the axis only presses buttons, so there is no analog output to shape.
  { id: 'lb_rb', name: 'LB / RB Split', accepts: ['axis'], digital: true, hint: 'Past halfway: left → LB, right → RB' },
  { id: 'dpad_x', name: 'D-Pad Left / Right', accepts: ['axis'], digital: true, hint: 'Past halfway: left / right on the D-pad' },
  { id: 'dpad_y', name: 'D-Pad Down / Up', accepts: ['axis'], digital: true, hint: 'Past halfway: down / up on the D-pad' },
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
    { title: 'Combos', items: ['ls_rs_click', 'lb_rb_both', 'lt_rt_both'] },
  ],
  axis: [
    { title: 'Stick axes', items: ['ls_x', 'ls_y', 'rs_x', 'rs_y'] },
    { title: 'Triggers', items: ['lt', 'rt', 'lt_rt'] },
    { title: 'Digital', items: ['lb_rb', 'dpad_x', 'dpad_y'] },
  ],
});

export const MAX_DEADZONE = 0.5;
export const DEFAULT_DEADZONE = 0.04;
// Anti-deadzone: where an axis's output starts once it moves, to cancel a deadzone the
// game applies to the Xbox stick or trigger itself. Off (0) unless the user sets it.
export const MAX_ANTI_DEADZONE = 0.5;

// Bindings are sparse ({ [controlId]: binding }): a stick's controls vary, and a
// profile keeps working on another stick for the controls they share.
export function emptyBindings() {
  return {};
}

// The binding for `controlId`, or an unmapped one.
export function bindingFor(bindings, controlId, deadzone = DEFAULT_DEADZONE) {
  const found = bindings[controlId];
  if (found) return found;
  return controlKind(controlId) === 'axis' ? { target: null, invert: false, deadzone } : { target: null };
}

// Returns a clean binding for `controlId`, or null when `raw` isn't a valid one.
export function sanitizeBinding(controlId, raw) {
  const kind = controlKind(controlId);
  if (!kind || !raw || typeof raw !== 'object') return null;
  const target = raw.target ?? null;
  const def = target === null ? null : TARGET_BY_ID[target];
  if (target !== null && (!def || !def.accepts.includes(kind))) return null;
  if (kind !== 'axis') return { target };
  const dz = Number(raw.deadzone);
  const clean = {
    target,
    invert: raw.invert === true,
    deadzone: Number.isFinite(dz) ? Math.min(MAX_DEADZONE, Math.max(0, dz)) : DEFAULT_DEADZONE,
  };
  // Kept only when it's in use, so bindings saved before it existed are unchanged.
  const anti = Number(raw.antiDeadzone);
  if (def && !def.digital && anti > 0) clean.antiDeadzone = Math.min(MAX_ANTI_DEADZONE, anti);
  return clean;
}

// Accepts anything (read from disk, imported, a preset) and returns valid bindings;
// invalid or unmapped entries are dropped.
export function normalizeBindings(raw) {
  const bindings = {};
  if (!raw || typeof raw !== 'object') return bindings;
  for (const [id, value] of Object.entries(raw)) {
    const clean = sanitizeBinding(id, value);
    if (clean && clean.target !== null) bindings[id] = clean;
  }
  return bindings;
}

// Renames pre-universal (Extreme 3D Pro only) control IDs.
export function migrateLegacyBindings(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  return Object.fromEntries(Object.entries(raw).map(([id, value]) => [LEGACY_CONTROL_IDS[id] ?? id, value]));
}
