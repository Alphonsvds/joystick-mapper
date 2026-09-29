// Starting points for new profiles. Control IDs are generic (see shared/controls.js):
// on nearly every flight stick button 1 is the trigger and button 2 the thumb button.

export const PRESETS = Object.freeze([
  { id: 'blank', name: 'Blank', description: 'Everything unmapped', bindings: {} },
  {
    id: 'ace-combat-8',
    name: 'Ace Combat 8',
    description: 'Matches the in-game default gamepad layout',
    bindings: {
      // Flight: stick = left stick, twist = yaw on the bumpers, throttle = LT / RT.
      y: { target: 'ls_y', deadzone: 0.04 },
      x: { target: 'ls_x', deadzone: 0.04 },
      rz: { target: 'lb_rb', deadzone: 0.1 }, // Yaw left LB · Yaw right RB
      // Wide neutral band so the throttle can sit at cruise without accelerating or braking.
      slider: { target: 'lt_rt', deadzone: 0.12 }, // Decelerate LT · Accelerate RT
      // Weapons & targeting.
      btn1: { target: 'b' }, // Fire missile or weapon
      btn2: { target: 'a' }, // Fire machine gun
      btn3: { target: 'x' }, // Change weapon / next weapon
      btn4: { target: 'y' }, // Change target
      btn5: { target: 'view' }, // Switch radar map
      btn6: { target: 'ls_rs_click' }, // Deploy flares (both stick clicks)
      // Hat looks around (camera is on the right stick).
      hat1_up: { target: 'rs_up' },
      hat1_right: { target: 'rs_right' },
      hat1_down: { target: 'rs_down' },
      hat1_left: { target: 'rs_left' },
    },
  },
]);

export const PRESET_BY_ID = Object.freeze(Object.fromEntries(PRESETS.map((p) => [p.id, p])));
