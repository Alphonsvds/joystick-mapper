// Starting points for new profiles. A preset is written for one stick's button numbers
// (`skin`), so it's only offered on that stick; every other stick starts blank.
// Control IDs are generic (see shared/controls.js).

const hat = (targets) => Object.fromEntries(['up', 'right', 'down', 'left'].map((dir, i) => [`hat1_${dir}`, { target: targets[i] }]));
const DPAD = hat(['dpad_up', 'dpad_right', 'dpad_down', 'dpad_left']);

// An Xbox controller mapped to itself, as the place to start changing it from. No
// deadzones: the game applies its own.
const XBOX_BINDINGS = {
  btn1: { target: 'a' },
  btn2: { target: 'b' },
  btn3: { target: 'x' },
  btn4: { target: 'y' },
  btn5: { target: 'lb' },
  btn6: { target: 'rb' },
  btn7: { target: 'view' },
  btn8: { target: 'menu' },
  btn9: { target: 'ls_click' },
  btn10: { target: 'rs_click' },
  ...DPAD,
  x: { target: 'ls_x', deadzone: 0 },
  y: { target: 'ls_y', deadzone: 0 },
  rx: { target: 'rs_x', deadzone: 0 },
  ry: { target: 'rs_y', deadzone: 0 },
  z: { target: 'lt', deadzone: 0 },
  rz: { target: 'rt', deadzone: 0 },
};

// A PlayStation controller as the Xbox controller a game expects: each control to the one
// in the same place. The triggers go by their axes, so the buttons they also press (7 and
// 8) stay unmapped, as do the PS button and the touchpad.
const PLAYSTATION_BINDINGS = {
  btn1: { target: 'x' }, // Square
  btn2: { target: 'a' }, // Cross
  btn3: { target: 'b' }, // Circle
  btn4: { target: 'y' }, // Triangle
  btn5: { target: 'lb' },
  btn6: { target: 'rb' },
  btn9: { target: 'view' },
  btn10: { target: 'menu' },
  btn11: { target: 'ls_click' },
  btn12: { target: 'rs_click' },
  ...DPAD,
  x: { target: 'ls_x', deadzone: 0 },
  y: { target: 'ls_y', deadzone: 0 },
  z: { target: 'rs_x', deadzone: 0 },
  rz: { target: 'rs_y', deadzone: 0 },
  rx: { target: 'lt', deadzone: 0 },
  ry: { target: 'rt', deadzone: 0 },
};

export const PRESETS = Object.freeze([
  { id: 'blank', name: 'Blank', description: 'Everything unmapped', bindings: {} },
  {
    id: 'xbox-controller',
    name: 'Xbox Controller',
    description: 'Every control as it is, ready to change',
    skin: 'xboxcontroller',
    bindings: XBOX_BINDINGS,
  },
  {
    id: 'xbox-elite-controller',
    name: 'Xbox Elite Controller',
    description: 'Every control as it is, ready to change',
    skin: 'xboxelite',
    bindings: XBOX_BINDINGS,
  },
  {
    id: 'dualshock-4',
    name: 'DualShock 4',
    description: 'As an Xbox controller, ready to change',
    skin: 'dualshock4',
    bindings: PLAYSTATION_BINDINGS,
  },
  {
    id: 'dualsense',
    name: 'DualSense',
    description: 'As an Xbox controller, ready to change',
    skin: 'dualsense',
    bindings: PLAYSTATION_BINDINGS,
  },
  {
    id: 'ace-combat-8',
    name: 'Ace Combat 8',
    description: 'Flight, weapons, camera and squad commands',
    skin: 'extreme3dpro',
    bindings: {
      // Flight: stick = left stick, twist = yaw on the bumpers, throttle = LT / RT.
      y: { target: 'ls_y', deadzone: 0.04 },
      x: { target: 'ls_x', deadzone: 0.04 },
      rz: { target: 'lb_rb', deadzone: 0.1 }, // Yaw left LB · Yaw right RB
      slider: { target: 'lt_rt', deadzone: 0.02 }, // Decelerate LT · Accelerate RT
      // Weapons & targeting.
      btn1: { target: 'a' }, // Fire machine gun
      btn5: { target: 'b' }, // Fire missile or weapon
      btn3: { target: 'x' }, // Change weapon / next weapon
      btn6: { target: 'y' }, // Change target
      btn2: { target: 'ls_rs_click' }, // Deploy flares (thumb button = both stick clicks)
      btn4: { target: 'rs_click' },
      // Squad commands are on the D-pad: up forward attack, left dispersed attack,
      // right SP weapons on/off, down cover.
      btn7: { target: 'dpad_up' },
      btn8: { target: 'dpad_down' },
      btn9: { target: 'dpad_left' },
      btn10: { target: 'dpad_right' },
      btn11: { target: 'view' }, // Switch radar map
      btn12: { target: 'menu' },
      // Hat looks around (camera is on the right stick).
      hat1_up: { target: 'rs_up' },
      hat1_right: { target: 'rs_right' },
      hat1_down: { target: 'rs_down' },
      hat1_left: { target: 'rs_left' },
    },
  },
]);

export const PRESET_BY_ID = Object.freeze(Object.fromEntries(PRESETS.map((p) => [p.id, p])));
