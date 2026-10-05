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

// The Thrustmaster Sol-R's two sticks (reporting as "Sol-R [R] Flightstick" and "Sol-R [L]
// Flightstick", GitHub issue #8) are the same hardware apart from the grip, so they share
// these names. Button numbers are from a community Star Citizen chart for the pair and the
// numbers printed on the sticks. The chart leaves out 25, taken to be the trigger's second
// stage.
// The axes are where the generic defaults expect them, so they need names only: an owner
// has checked each one (GitHub issue #10). The thrust lever is on Z, the ministick on Rx
// and Ry, the twist on Rz. Slider and Dial are spares.
// The two hats are each a push and four directions, 30–34 on the left and 40–44 on the
// right, but the hat on the outer side of each stick sends its directions as the POV hat
// instead (see solR below).
const SOL_R = {
  names: {
    ...positions(1, 'Left Switch 1', 'Up', 'Down'),
    ...positions(3, 'Left Switch 2', 'Up', 'Down'),
    btn5: 'Left Pad Top Left',
    btn6: 'Left Pad Top Right',
    btn7: 'Left Pad Bottom Left',
    btn8: 'Left Pad Bottom Right',
    btn9: 'Left Knob Clockwise',
    btn10: 'Left Knob Counter-clockwise',
    btn11: 'Left Knob Push',
    btn12: 'Right Switch 2 Up',
    btn13: 'Right Switch 2 Down',
    btn14: 'Right Switch 1 Up',
    btn15: 'Right Switch 1 Down',
    btn16: 'Right Pad Top Right',
    btn17: 'Right Pad Top Left',
    btn18: 'Right Pad Bottom Right',
    btn19: 'Right Pad Bottom Left',
    ...numbered(20, 4, (n) => `Rotary ${n}`),
    btn24: 'Trigger Stage 1',
    btn25: 'Trigger Stage 2',
    btn26: 'Lever Left',
    btn27: 'Lever Right',
    btn28: 'Grip Button',
    btn29: 'Ministick Push',
    btn30: 'Left Hat Push',
    btn35: 'Left Orange Button',
    btn36: 'Scroll Push',
    btn37: 'Scroll Up',
    btn38: 'Scroll Down',
    btn39: 'Right Orange Button',
    btn40: 'Right Hat Push',
    x: 'Stick X',
    y: 'Stick Y',
    z: 'Thrust',
    rx: 'Ministick X',
    ry: 'Ministick Y',
    rz: 'Twist',
  },
  hints: {
    x: 'Stick left / right',
    y: 'Stick forward / back',
    z: 'Lever on the base',
    rx: 'Ministick',
    ry: 'Ministick',
    rz: 'Twist the stick',
    slider: '',
    dial: '',
  },
};

// The VKB STECS base and its STEM module, which every STECS Standard throttle is built on.
// Button numbers are from an owner's filled-in VKB template for the Modern Throttle (GitHub
// issue #2). It left out 55 and 56, so those keep their generic names.
const STECS_BASE_AND_STEM = {
  btn1: 'Dot Button',
  btn2: 'Red Start',
  ...numbered(3, 5, (n) => `Rotary ${n}`),
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
};

// The VKB Gladiator NXT EVO with the Premium / Space Combat grip. Button numbers are VKB's
// factory profile, the same on the right- and left-hand sticks and on the Omni Throttles.
const GLADIATOR_EVO = {
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
};

// The same stick as an Omni Throttle: the grip itself is the throttle.
const GLADIATOR_OMNI = {
  names: { ...GLADIATOR_EVO.names, x: 'Sideways', y: 'Throttle', rz: 'Twist', z: 'Base Wheel' },
  hints: { ...GLADIATOR_EVO.hints, x: 'Grip left / right', y: 'Grip forward / back', rz: 'Twist the grip', z: 'Wheel on the base' },
};

// A STECS Modern Throttle: the base and STEM under twin grips.
const STECS_MODERN = {
  names: {
    ...STECS_BASE_AND_STEM,
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
    x: 'Throttle 1',
    y: 'Throttle 2',
  },
  hints: { x: 'Throttle lever', y: 'Throttle lever' },
  axes: { x: { centered: false, invert: false }, y: { centered: false, invert: false } },
};

// One Sol-R stick. `pov` is the side its POV hat is on: the right on the right stick and
// the left on the left one, from an owner's report of which hat lights what (GitHub issue
// #10). The other hat's directions are buttons: 41–44 on the left stick, as on the chart,
// and so 31–34 on the right stick, whose order is taken to match. The four numbers a stick
// doesn't send keep their generic names.
const solR = (pov) => ({
  names: {
    ...SOL_R.names,
    ...(pov === 'left' ? pushHat('Right Hat', 40) : pushHat('Left Hat', 30)),
    hat1: pov === 'left' ? 'Left Hat' : 'Right Hat',
  },
  hints: SOL_R.hints,
});

// An Xbox controller is read through XInput (see main/xinput.js), not HID, where it would
// report both triggers as one shared axis. XInput has no self-description, so this is the
// layout the app gives every controller it finds there: the D-pad as a hat, the two
// sticks, the triggers on Z and Rz, and the ten buttons in the order HID lists them.
// Stick values go down and right, as on a HID stick.
export const XBOX_PAD = Object.freeze({ vendorId: 0x045e, productId: 0x028e, name: 'Xbox Controller' });
export const XBOX_LAYOUT = Object.freeze({
  values: Object.freeze([
    { page: PAGE_GENERIC, usage: USAGE_HAT, min: 0, max: 7 },
    { page: PAGE_GENERIC, usage: 0x30, min: -32768, max: 32767 },
    { page: PAGE_GENERIC, usage: 0x31, min: -32768, max: 32767 },
    { page: PAGE_GENERIC, usage: 0x33, min: -32768, max: 32767 },
    { page: PAGE_GENERIC, usage: 0x34, min: -32768, max: 32767 },
    { page: PAGE_GENERIC, usage: 0x32, min: 0, max: 255 },
    { page: PAGE_GENERIC, usage: 0x35, min: 0, max: 255 },
  ]),
  buttonCount: 10,
});
// An Elite controller is the same to XInput, which is asked which one sits in each slot.
// Its paddles aren't there to read: the controller sends each one as a copy of whichever
// ordinary button it is set to, in the Xbox Accessories app.
export const XBOX_ELITE_PAD = Object.freeze({ vendorId: 0x045e, productId: 0x0b00, name: 'Xbox Elite Controller' });

// What every Xbox controller shares. The triggers rest at the bottom of Z and Rz, which
// would read as a reversed lever and a twist held over. The Xbox button isn't included:
// Windows keeps it for itself.
const XBOX = {
  names: {
    btn1: 'A Button',
    btn2: 'B Button',
    btn3: 'X Button',
    btn4: 'Y Button',
    btn5: 'Left Bumper',
    btn6: 'Right Bumper',
    btn7: 'View Button',
    btn8: 'Menu Button',
    btn9: 'Left Stick Click',
    btn10: 'Right Stick Click',
    hat1: 'D-Pad',
    x: 'Left Stick X',
    y: 'Left Stick Y',
    rx: 'Right Stick X',
    ry: 'Right Stick Y',
    z: 'Left Trigger',
    rz: 'Right Trigger',
  },
  hints: { x: '', y: '', rx: '', ry: '', z: '', rz: '' },
  axes: {
    z: { centered: false, invert: false, deadzone: 0 },
    rz: { centered: false, invert: false, deadzone: 0 },
  },
};

// A PlayStation controller describes itself over HID like a stick, as a gamepad: the left
// stick on X and Y, the right stick on Z and Rz (which would read as a lever and a twist),
// and the triggers on Rx and Ry (which would read as a second stick held in a corner).
// Each trigger is also a button, 7 and 8, once it is pulled. The button order is the one
// every PlayStation controller since the DualShock 4 uses; `create` is what the left
// centre button is called, and `extra` the buttons a model adds.
// `gamepad` lets the joystick manager read it although it isn't a joystick.
const playstation = (id, name, create, extra = {}) => ({
  id,
  name,
  support: 'beta',
  gamepad: true,
  names: {
    btn1: 'Square',
    btn2: 'Cross',
    btn3: 'Circle',
    btn4: 'Triangle',
    btn5: 'L1',
    btn6: 'R1',
    btn7: 'L2 Button',
    btn8: 'R2 Button',
    btn9: create,
    btn10: 'Options',
    btn11: 'L3',
    btn12: 'R3',
    btn13: 'PS Button',
    btn14: 'Touchpad Click',
    ...extra,
    hat1: 'D-Pad',
    x: 'Left Stick X',
    y: 'Left Stick Y',
    z: 'Right Stick X',
    rz: 'Right Stick Y',
    rx: 'L2',
    ry: 'R2',
  },
  hints: { x: '', y: '', z: '', rz: '', rx: '', ry: '' },
  axes: {
    z: { centered: true, invert: false },
    rz: { centered: true, invert: true, deadzone: 0.04 },
    rx: { centered: false, invert: false, deadzone: 0 },
    ry: { centered: false, invert: false, deadzone: 0 },
  },
});
const DUALSHOCK_4 = playstation('dualshock4', 'DualShock 4', 'Share');
const DUALSENSE = playstation('dualsense', 'DualSense', 'Create', { btn15: 'Mute' });

// How well a stick is known, shown next to its name:
//   full          photo layout and names, checked against the real stick
//   beta          photo layout and names that owners are still confirming
//   experimental  everything else: the generic layout, built from what the stick reports,
//                 or a photo layout whose axes and buttons are still partly guessed
export const SUPPORT_LABELS = Object.freeze({ full: 'Fully supported', beta: 'Beta', experimental: 'Experimental' });

// Sticks with a photo layout (see renderer/layout.js) and friendly names. `axes` says how
// an axis behaves when the descriptor can't: { [id]: { centered, invert, deadzone } }.
// A skin without a photo layout still fixes its names and axes, and shows as the list.
// Everything else gets the generic layout and is marked experimental until someone
// confirms it.
export const SKINS = Object.freeze({
  // Any Xbox controller, as XInput reports it (see XBOX_LAYOUT above), and the Elite, which
  // differs only in its photo. Beta until they have been tried on real controllers.
  '045e:028e': { id: 'xboxcontroller', name: XBOX_PAD.name, support: 'beta', ...XBOX },
  '045e:0b00': { id: 'xboxelite', name: XBOX_ELITE_PAD.name, support: 'beta', ...XBOX },
  // Sony DualShock 4: both hardware revisions, and one on Sony's wireless USB adaptor.
  // Beta until an owner has confirmed every label.
  '054c:05c4': DUALSHOCK_4,
  '054c:09cc': DUALSHOCK_4,
  '054c:0ba0': DUALSHOCK_4,
  // Sony DualSense, and the DualSense Edge, whose extra buttons aren't in its description.
  '054c:0ce6': DUALSENSE,
  '054c:0df2': DUALSENSE,
  // Logitech X56 stick (reports as "Saitek Pro Flight X-56 Rhino Stick", GitHub issue #16).
  // Its axes are where the generic defaults expect them, so they need names only. Button
  // numbers are from EDRefCard's definition for this USB ID and a community chart, which
  // agree bar the order of H1's directions; this follows EDRefCard, as Logitech numbers
  // every hat clockwise from up. Beta until an owner has confirmed every label.
  '0738:2221': {
    id: 'x56stick',
    name: 'Logitech X56 Stick',
    support: 'beta',
    names: {
      btn1: 'Trigger',
      btn2: 'A Button',
      btn3: 'B Button',
      btn4: 'C Stick Push',
      btn5: 'D Button',
      btn6: 'Pinkie Lever',
      ...numbered(7, 4, (n) => `H1 ${['Up', 'Right', 'Down', 'Left'][n - 1]}`),
      ...numbered(11, 4, (n) => `H2 ${['Up', 'Right', 'Down', 'Left'][n - 1]}`),
      hat1: 'POV Hat',
      x: 'Roll',
      y: 'Pitch',
      rz: 'Yaw',
      rx: 'C Stick X',
      ry: 'C Stick Y',
    },
    hints: {
      x: 'Stick left / right',
      y: 'Stick forward / back',
      rz: 'Twist the stick',
      rx: 'C ministick',
      ry: 'C ministick',
    },
  },
  // Logitech X56 throttle (reports as "Saitek Pro Flight X-56 Rhino Throttle"). Its two
  // throttle levers are the 10-bit X and Y axes, which would read as a stick (GitHub issue
  // #16): Y reversed next to X, and Recenter taking wherever they sit as the middle. The G
  // rotary is on Rz, which would read as a twist with a wide deadzone.
  // Axis roles and button numbers are from EDRefCard's definition for this USB ID and a
  // community chart; SLD on 33 is from the chart alone, and the three positions of the MODE
  // switch are taken to be the three buttons after it (an owner's report has 34 held).
  // The chart numbers the two thumb hats the other way round; this follows EDRefCard and a
  // forum map of the lower hat. Not confirmed: which way the levers read (forward reads
  // low, as for Slider and Dial). Beta until an owner has confirmed every label.
  '0738:a221': {
    id: 'x56throttle',
    name: 'Logitech X56 Throttle',
    support: 'beta',
    names: {
      btn1: 'E Button',
      btn2: 'F Rotary Push',
      btn3: 'G Rotary Push',
      btn4: 'I Button',
      btn5: 'H Button',
      ...numbered(6, 6, (n) => `SW ${n}`),
      ...positions(12, 'TGL 1', 'Up', 'Down'),
      ...positions(14, 'TGL 2', 'Up', 'Down'),
      ...positions(16, 'TGL 3', 'Up', 'Down'),
      ...positions(18, 'TGL 4', 'Up', 'Down'),
      ...positions(20, 'H3', 'Up', 'Forward', 'Down', 'Back'),
      ...positions(24, 'H4', 'Up', 'Forward', 'Down', 'Back'),
      ...positions(28, 'K1', 'Up', 'Down'),
      ...positions(30, 'Scroll', 'Forward', 'Back'),
      btn32: 'Ministick Push',
      btn33: 'SLD Switch',
      ...positions(34, 'Mode', 'M1', 'M2', 'S1'),
      x: 'Left Throttle',
      y: 'Right Throttle',
      z: 'F Rotary',
      rz: 'G Rotary',
      rx: 'Ministick X',
      ry: 'Ministick Y',
      slider: 'RTY 3',
      dial: 'RTY 4',
    },
    hints: {
      x: 'Throttle lever',
      y: 'Throttle lever',
      z: 'Knob on top of the handle',
      rz: 'Knob under the SLD switch',
      rx: 'Thumb ministick',
      ry: 'Thumb ministick',
      slider: 'Knob on the base',
      dial: 'Knob on the base',
    },
    axes: {
      x: { centered: false, invert: true },
      y: { centered: false, invert: true },
      rz: { centered: false, deadzone: 0.02 },
    },
  },
  // Thrustmaster Sol-R right stick (GitHub issues #8 and #10), see SOL_R above. Beta until
  // an owner has confirmed every label.
  '044f:0422': { id: 'solrright', name: 'Sol-R Right Stick', support: 'beta', ...solR('right') },
  // Thrustmaster Sol-R left stick: the same, with its grip and its hats the other way round.
  '044f:042a': { id: 'solrleft', name: 'Sol-R Left Stick', support: 'beta', ...solR('left') },
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
  '231d:012d': { id: 'stecsstandard', name: 'VKB STECS Standard', support: 'beta', ...STECS_MODERN },
  // VKB STECS Modern Throttle Mk.II Max: the Standard with an ATEM module on the front of
  // the base (reports as "S-TECS MODERN THROTTLE MAX STEM", GitHub issue #9). Its levers
  // are on X and Y too, and read as a stick in the same way. The grips, base and STEM are
  // taken to send the Standard's numbers: no owner has checked them on this one. Nothing
  // published gives the ATEM's (four buttons, two under safety lids and a knob that turns,
  // tilts four ways and pushes: thirteen in all), so they keep their generic names; they
  // are taken to follow the STEM's, as 59 to 71.
  // Beta until an owner has confirmed every label and named the rest.
  '231d:012e': { id: 'stecsmax', name: 'VKB STECS Max', support: 'beta', ...STECS_MODERN },
  // VKB STECS Space Throttle Standard, left hand: the same base and STEM module under one
  // Space grip (reports as "S-TECS SPACE-L THROTTLE STANDARD  STEM", GitHub issues #4 and
  // #11). The base and STEM numbers are taken to be the Modern Throttle's: no owner has
  // checked them on this one. Nothing published gives the grip's button numbers, so those
  // keep their generic names.
  // The axes are named from two owners' reports and VKB's own list of five (the grip's
  // tilt, throttle, brake and laser). X and Y are 12-bit and rest in the middle on both
  // throttles: the grip's tilt. Z, the other 12-bit one, rests somewhere different on each:
  // the throttle. Rx rests at 0 on both and Ry near the top of its range, so neither
  // springs to a middle, as the generic defaults would have it; Rx is taken to be the
  // brake, resting released, and Ry the laser. Which way each one runs isn't known. One
  // owner's throttle also reports an Rz and a Slider, not named here.
  // Beta until an owner has confirmed every label and named the rest.
  '231d:0138': {
    id: 'stecsspace',
    name: 'VKB STECS Space',
    support: 'beta',
    names: { ...STECS_BASE_AND_STEM, x: 'Grip X', y: 'Grip Y', z: 'Throttle', rx: 'Brake', ry: 'Laser' },
    hints: { x: 'Tilt the grip', y: 'Tilt the grip', z: 'Throttle lever' },
    axes: { rx: { centered: false }, ry: { centered: false } },
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
  // Turtle Beach VelocityOne Flightstick II (GitHub issue #13), in its default right-hand
  // orientation (the left-hand setting swaps the levers and the B1–B4 buttons). Its axes
  // are where the first Flightstick has them, bar the right lever, which is on Slider: the
  // twist on Z would read as a reversed throttle, the left lever on Rz as a twist, and the
  // two levers would run opposite ways.
  // Axis roles and button numbers are Turtle Beach's default control list for the stick on
  // PC. The scroll wheel is the Dial axis, or buttons 19 and 20 when it is set to "Digital
  // Buttons". Not confirmed: which way the levers read (up reads high, as on the first
  // Flightstick). Beta until an owner has confirmed every label.
  '10f5:7150': {
    id: 'velocityoneflightstick2',
    name: 'VelocityOne Flightstick II',
    support: 'beta',
    names: {
      ...numbered(1, 4, (n) => `B${n} Button`),
      ...positions(5, 'Left Lever', 'Top', 'Bottom'),
      ...positions(7, 'Right Lever', 'Top', 'Bottom'),
      ...positions(9, 'Dial Mode 1', 'Up', 'Down', 'Select'),
      ...positions(12, 'Dial Mode 2', 'Up', 'Down', 'Select'),
      ...positions(15, 'Dial Mode 3', 'Up', 'Down', 'Select'),
      btn18: 'POV Push',
      ...positions(19, 'Scroll Wheel', 'Up', 'Down', 'Push'),
      btn22: 'Bumper',
      btn23: 'Left Stick Button',
      btn24: 'Right Stick Button',
      btn25: 'Middle Stick Button',
      btn26: 'Trigger',
      btn27: 'A Button',
      btn28: 'B Button',
      btn29: 'X Button',
      btn30: 'Y Button',
      btn31: 'Xbox Button',
      btn32: 'View Button',
      btn33: 'Share Button',
      btn34: 'Menu Button',
      hat1: 'Hat 1',
      x: 'Roll',
      y: 'Pitch',
      z: 'Yaw',
      rx: 'POV X',
      ry: 'POV Y',
      rz: 'Left Lever',
      slider: 'Right Lever',
      dial: 'Scroll Wheel',
    },
    hints: {
      x: 'Stick left / right',
      y: 'Stick forward / back',
      z: 'Twist the stick',
      rx: 'Analog POV',
      ry: 'Analog POV',
      rz: 'Lever on the left of the base',
      slider: 'Lever on the right of the base',
      dial: 'Wheel on the grip, in analog mode',
    },
    axes: {
      z: { centered: true, invert: false, deadzone: 0.1 },
      rz: { centered: false, invert: false, deadzone: 0.02 },
      slider: { invert: false },
    },
  },
  // Turtle Beach VelocityOne Flightdeck stick (reports as "Flightdeck Stick", GitHub issue
  // #14). Like the Flightstick it twists on Z, which would read as a reversed throttle, and
  // its pinkie lever is on Rz, which would read as a twist held hard over.
  // Axis roles and button numbers are Turtle Beach's control list for the stick. An owner's
  // report has the pinkie lever resting at the bottom of Rz, and the gear lever and the
  // rotary knob each holding a button at rest (24 and 26). The thumb wheel keeps the
  // generic settings: whether it springs back isn't known. The stick also reports a Dial
  // axis, a third hat and buttons 34 to 40, which aren't on that list and keep their
  // generic names; the touchpad on the Fire button is a mouse.
  // Beta until an owner has confirmed every label.
  '10f5:7084': {
    id: 'flightdeckstick',
    name: 'Flightdeck Stick',
    support: 'beta',
    names: {
      btn1: 'Fire Button',
      btn2: 'Trigger Stage 2',
      btn3: 'Analog POV Push',
      ...numbered(4, 4, (n) => `D-Pad ${['Up', 'Right', 'Down', 'Left'][n - 1]}`),
      btn8: 'Thumb Wheel Push',
      btn9: 'Shaft Button',
      btn10: 'Pinkie Lever Full',
      ...numbered(11, 5, (n) => `B${10 + n} Button`),
      ...positions(16, 'Left Switch', 'Forward', 'Back'),
      ...positions(18, 'Middle Switch', 'Forward', 'Back'),
      ...positions(20, 'Right Switch', 'Forward', 'Back'),
      btn22: 'B22 Button',
      ...positions(23, 'Gear Lever', 'Forward', 'Back'),
      ...positions(25, 'Rotary Knob', 'Left', 'Right', 'Down'),
      btn28: 'Trigger Stage 1',
      ...positions(29, 'Thumb Wheel', 'Up', 'Down'),
      ...numbered(31, 3, (n) => `B${30 + n} Button`),
      hat1: 'Hat 1',
      hat2: 'Hat 2',
      x: 'Roll',
      y: 'Pitch',
      z: 'Yaw',
      rx: 'Analog POV X',
      ry: 'Analog POV Y',
      rz: 'Pinkie Lever',
      slider: 'Thumb Wheel',
    },
    hints: {
      x: 'Stick left / right',
      y: 'Stick forward / back',
      z: 'Twist the stick',
      rx: 'Analog POV',
      ry: 'Analog POV',
      rz: 'Lever on the front of the grip',
      slider: 'Wheel under the Fire button',
      dial: '',
    },
    axes: {
      z: { centered: true, invert: false, deadzone: 0.1 },
      rz: { centered: false, invert: false, deadzone: 0.02 },
    },
  },
  // Turtle Beach VelocityOne Flightdeck throttle (reports as "Flightdeck Throttle", GitHub
  // issue #15). Its two throttle levers are the X and Y axes, which would read as a stick:
  // Y reversed next to X, and Recenter taking wherever they sit as the middle.
  // Axis roles and button numbers are Turtle Beach's control list for the throttle. Each
  // lever also presses buttons along its travel. An owner's report has both throttles at
  // the bottom of their axes with their Min and Back buttons held, and the flap lever at
  // the top of Slider with its Forward button held: forward reads high on all three.
  // The thumb wheel, the finger wheel and the upper knob's outer dial keep the generic
  // settings: whether they spring back isn't known. The touch display isn't on the list.
  // Beta until an owner has confirmed every label.
  '10f5:7085': {
    id: 'flightdeckthrottle',
    name: 'Flightdeck Throttle',
    support: 'beta',
    names: {
      btn1: 'Analog POV Push',
      btn2: 'Upper Side Button',
      btn3: 'Middle Side Button',
      btn4: 'Lower Side Button',
      ...positions(5, 'Slide Switch', 'Left', 'Right'),
      ...numbered(7, 4, (n) => `Front Hat ${['Up', 'Right', 'Down', 'Left'][n - 1]}`),
      btn11: 'Front Button',
      ...positions(12, 'Rocker 1', 'Up', 'Down'),
      ...positions(14, 'Rocker 2', 'Up', 'Down'),
      ...positions(16, 'Flap Lever', 'Forward', 'Back'),
      btn18: 'Red Button',
      ...positions(19, 'Left Throttle', 'Max', 'Min'),
      ...positions(21, 'Right Throttle', 'Max', 'Min'),
      btn23: 'Upper Knob Push',
      ...positions(24, 'Upper Knob Outer', 'Left', 'Right'),
      ...positions(26, 'Upper Knob Inner', 'Left', 'Right'),
      ...positions(28, 'Middle Knob', 'Push', 'Left', 'Right'),
      ...positions(31, 'Lower Knob', 'Push', 'Left', 'Right'),
      ...positions(34, 'Left Throttle', 'Forward', 'Middle', 'Back'),
      ...positions(37, 'Right Throttle', 'Forward', 'Middle', 'Back'),
      ...positions(40, 'Finger Wheel', 'Up', 'Down'),
      hat1: 'Thumb Hat',
      x: 'Left Throttle',
      y: 'Right Throttle',
      z: 'Upper Knob',
      rx: 'Analog POV X',
      ry: 'Analog POV Y',
      rz: 'Thumb Wheel',
      slider: 'Flap Lever',
      dial: 'Finger Wheel',
    },
    hints: {
      x: 'Throttle lever',
      y: 'Throttle lever',
      z: 'Outer dial of the upper knob',
      rx: 'Analog POV',
      ry: 'Analog POV',
      rz: 'Wheel beside the analog POV',
      slider: 'Lever on the left of the base',
      dial: 'Wheel on the front of the handle',
    },
    axes: {
      x: { centered: false, invert: false },
      y: { centered: false, invert: false },
      slider: { invert: false },
    },
  },
  // Turtle Beach VelocityOne Dual Throttle (GitHub issue #23). Like the Flightdeck
  // throttle its two levers are the X and Y axes, which would read as a stick: Y reversed
  // next to X, and Recenter taking wherever they sit as the middle.
  // Axis roles and button numbers are Turtle Beach's "Default functions and controls on
  // PC" list. It gives no directions: forward is taken to read high on the two levers and
  // the small one, as it does on the Flightdeck throttle. The thumb wheel (the ring around
  // the thumb hat) and the finger wheel keep the generic settings: whether they spring back
  // isn't known. The throttle also reports a Slider axis and buttons 28 to 47, which
  // aren't on that list and keep their generic names.
  // Its two hats report alike, so nothing says which comes first. While the app could
  // only read the first of them, an owner found the front hat was the one that didn't
  // show: the first is taken to be the thumb hat. Beta until an owner has confirmed every
  // label.
  '10f5:7154': {
    id: 'velocityonedualthrottle',
    name: 'VelocityOne Dual Throttle',
    support: 'beta',
    names: {
      btn1: 'Analog POV Push',
      ...numbered(2, 3, (n) => `B${n + 1} Button`),
      ...positions(5, 'Finger Wheel', 'Up', 'Down', 'Push'),
      btn8: 'Ring Finger Button',
      btn9: 'Pinkie Button',
      ...positions(10, 'Small Lever', 'Up', 'Down'),
      ...numbered(12, 3, (n) => `B${n + 11} Button`),
      ...positions(15, 'Toggle 1', 'Up', 'Down'),
      ...positions(17, 'Toggle 2', 'Up', 'Down'),
      ...positions(19, 'Toggle 3', 'Up', 'Down'),
      ...positions(21, 'Dial', 'Up', 'Down', 'Push'),
      ...positions(24, 'Left Throttle Detent', 'Up', 'Down'),
      ...positions(26, 'Right Throttle Detent', 'Up', 'Down'),
      hat1: 'Thumb Hat',
      hat2: 'Front Hat',
      x: 'Left Throttle',
      y: 'Right Throttle',
      z: 'Small Lever',
      rx: 'Analog POV X',
      ry: 'Analog POV Y',
      rz: 'Thumb Wheel',
      dial: 'Finger Wheel',
    },
    hints: {
      x: 'Throttle lever',
      y: 'Throttle lever',
      z: 'Lever on the right of the base',
      rx: 'Analog POV',
      ry: 'Analog POV',
      rz: 'Ring around the thumb hat',
      dial: 'Wheel on the front of the handle',
      slider: '',
    },
    axes: {
      x: { centered: false, invert: false },
      y: { centered: false, invert: false },
      z: { invert: false },
    },
  },
  // VKB Gladiator NXT EVO, right hand (reports as "VKBsim Gladiator EVO R"), with the
  // Premium / Space Combat grip. Button numbers are VKB's factory profile; the stick
  // advertises 128 buttons and two spare axes (Slider, Dial) that it doesn't use.
  // An owner has confirmed the labels against the stick (GitHub issue #1).
  '231d:0200': { id: 'gladiatorevo', name: 'VKB Gladiator NXT EVO', ...GLADIATOR_EVO },
  // The left-hand stick (reports as "VKBsim Gladiator EVO L"): the same base under a
  // mirrored grip, sending the same numbers (GitHub issue #17, and VKB's own chart for the
  // left-hand Omni Throttle). Beta until an owner has confirmed every label.
  '231d:0201': { id: 'gladiatorevoleft', name: 'VKB Gladiator EVO Left', support: 'beta', ...GLADIATOR_EVO },
  // VKB Gladiator NXT EVO Omni Throttle: the same stick with its grip laid over on VKB's
  // adapter, so pushing it forward is the throttle. The right-hand one reports as
  // "VKBsim Gladiator EVO OT R" (GitHub issue #5); the left-hand one's USB ID is taken to
  // follow it, as the left stick's follows the right's. A stick fitted with the adapter
  // afterwards still reports as the stick: its owner picks the throttle's photo in the
  // Joystick menu (see ALTERNATES in renderer/layout.js). Whether the throttle springs
  // back is up to how its owner set it up, so that stays as it is for a stick.
  // Beta until an owner has confirmed every label.
  '231d:3200': { id: 'gladiatorotright', name: 'VKB Omni Throttle Right', support: 'beta', ...GLADIATOR_OMNI },
  '231d:3201': { id: 'gladiatorotleft', name: 'VKB Omni Throttle Left', support: 'beta', ...GLADIATOR_OMNI },
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

// A gamepad the app reads over HID as it would a joystick (see `gamepad` on its skin).
export const isKnownGamepad = (vendorId, productId) => SKINS[deviceKey(vendorId, productId)]?.gamepad === true;

export const defaultDeadzone = (axis, centered) => axis.deadzone ?? (centered ? 0.04 : 0.02);

// Windows calls throttles and pedals joysticks too, so the name is the only clue.
const ROLE_HINTS = [
  ['pedals', /pedal|rudder|tfrp|crosswind/i],
  ['throttle', /throttle|twcs|quadrant|collective|sol-r \[l\]/i], // the left stick of a Sol-R pair
  ['extra', /^xbox( elite)? controller$|wireless controller$/i], // a gamepad beside a flight stick never takes the stick's place
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
