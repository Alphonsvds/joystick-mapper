// Starting points for new profiles.

export const PRESETS = Object.freeze([
  { id: 'blank', name: 'Blank', description: 'Everything unmapped', bindings: {} },
  {
    id: 'ace-combat-8',
    name: 'Ace Combat 8',
    description: 'Matches the in-game default gamepad layout',
    bindings: {
      // Flight: stick = left stick, twist = yaw on the bumpers, throttle = LT / RT.
      pitch: { target: 'ls_y', deadzone: 0.04 },
      roll: { target: 'ls_x', deadzone: 0.04 },
      yaw: { target: 'lb_rb', deadzone: 0.1 }, // Yaw left LB · Yaw right RB
      // Wide neutral band so the throttle can sit at cruise without accelerating or braking.
      throttle: { target: 'lt_rt', deadzone: 0.12 }, // Decelerate LT · Accelerate RT
      // Weapons & targeting.
      trigger: { target: 'b' }, // Fire missile or weapon
      thumb: { target: 'a' }, // Fire machine gun
      b3: { target: 'x' }, // Change weapon / next weapon
      b4: { target: 'y' }, // Change target
      b5: { target: 'view' }, // Switch radar map
      b6: { target: 'ls_rs_click' }, // Deploy flares (both stick clicks)
      // Hat looks around (camera is on the right stick).
      hat_up: { target: 'rs_up' },
      hat_right: { target: 'rs_right' },
      hat_down: { target: 'rs_down' },
      hat_left: { target: 'rs_left' },
    },
  },
]);

export const PRESET_BY_ID = Object.freeze(Object.fromEntries(PRESETS.map((p) => [p.id, p])));
