// Starting points for new profiles. A preset is written for one stick's button numbers
// (`skin`), so it's only offered on that stick; every other stick starts blank.
// Control IDs are generic (see shared/controls.js).

export const PRESETS = Object.freeze([
  { id: 'blank', name: 'Blank', description: 'Everything unmapped', bindings: {} },
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
