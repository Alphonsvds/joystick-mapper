// Each game's own gamepad controls, shown in the "controls" window as a reference
// while deciding where to put things on the stick.

export const GAMES = Object.freeze([
  {
    id: 'ace-combat-8',
    name: 'Ace Combat 8',
    short: 'AC8',
    source: 'In-game default gamepad controls',
    controls: [
      { action: 'Yaw left', target: 'lb' },
      { action: 'Yaw right', target: 'rb' },
      { action: 'Accelerate', target: 'rt' },
      { action: 'Decelerate', target: 'lt' },
      { action: 'Fire machine gun', target: 'a' },
      { action: 'Fire missile or weapon', target: 'b' },
      { action: 'Change weapon / Next weapon', target: 'x' },
      { action: 'Change target', target: 'y' },
      { action: 'Switch radar map', target: 'view' },
      { action: 'Deploy flares', target: 'ls_rs_click' },
    ],
  },
]);
