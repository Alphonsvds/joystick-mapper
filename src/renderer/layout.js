// Composition of the single screen. Everything is laid out on a fixed 1600×1000
// stage that is scaled to fit the window, so lines always land on the same pixels.

export const STAGE = { width: 1600, height: 1000 };

// The joystick photo (background removed) and where it sits on the stage.
export const IMAGE = { src: 'assets/joystick.png', width: 516, height: 513, x: 413, y: 92, scale: 1.5 };

export const toStage = ([x, y]) => [IMAGE.x + x * IMAGE.scale, IMAGE.y + y * IMAGE.scale];

// Label columns. Leader lines leave the label horizontally, bend at the elbow,
// then run straight to the hotspot.
export const COLUMNS = {
  left: { edge: 372, anchor: 386, elbow: 470 },
  right: { edge: 1228, anchor: 1214, elbow: 1130 },
};

// One entry per label. `y` is the label row on the stage, `at` the hotspot in photo
// pixels, `via` optional stage waypoints that steer a line around neighbouring hotspots.
export const CALLOUTS = [
  { id: 'trigger', side: 'left', y: 150, at: [261, 24] },
  { id: 'b5', side: 'left', y: 222, at: [223, 131] },
  { id: 'b3', side: 'left', y: 294, at: [241, 163], via: [[742, 304]] },
  { id: 'thumb', side: 'left', y: 366, at: [205, 160] },
  { id: 'b7', side: 'left', y: 438, at: [168, 177] },
  { id: 'b8', side: 'left', y: 510, at: [186, 203] },
  { id: 'b9', side: 'left', y: 582, at: [126, 240] },
  { id: 'b10', side: 'left', y: 654, at: [156, 246] },
  { id: 'b11', side: 'left', y: 726, at: [124, 312] },
  { id: 'b12', side: 'left', y: 798, at: [154, 302] },

  { id: 'pitch', side: 'right', y: 150, at: [261, 62], tag: 'Y AXIS' },
  {
    id: 'hat',
    side: 'right',
    y: 222,
    at: [261, 125],
    tag: 'POV',
    name: 'Hat Switch',
    via: [[832, 224]],
    group: [
      { id: 'hat_up', dir: 'up' },
      { id: 'hat_right', dir: 'right' },
      { id: 'hat_down', dir: 'down' },
      { id: 'hat_left', dir: 'left' },
    ],
  },
  { id: 'b6', side: 'right', y: 430, at: [299, 131] },
  { id: 'b4', side: 'right', y: 502, at: [282, 163] },
  { id: 'roll', side: 'right', y: 574, at: [292, 236], tag: 'X AXIS' },
  { id: 'yaw', side: 'right', y: 646, at: [304, 300], tag: 'TWIST' },
  { id: 'throttle', side: 'right', y: 798, at: [228, 424], tag: 'SLIDER' },
];

// Motion guides drawn over the stick for each axis. A dot rides along the guide to
// show the live value; `point(v)` maps -1..1 to a stage position.
export const AXIS_GUIDES = {
  roll: {
    path: 'M 700 84 L 910 84',
    arrows: [
      [700, 84, 180],
      [910, 84, 0],
    ],
    point: (v) => [805 + v * 105, 84],
  },
  pitch: {
    path: 'M 948 170 L 948 360',
    arrows: [
      [948, 170, -90],
      [948, 360, 90],
    ],
    point: (v) => [948, 265 - v * 95],
  },
  // An arc around the rubber collar; its ends stop short of the ellipse's sides so the
  // arrowheads angle along the curve.
  yaw: {
    path: 'M 672.4 558.9 A 142 44 0 0 0 947.6 558.9',
    arrows: [
      [672.4, 558.9, -129.5],
      [947.6, 558.9, -50.5],
    ],
    point: (v) => {
      const a = Math.PI / 2 - v * (Math.PI / 2 - 0.25);
      return [810 + 142 * Math.cos(a), 548 + 44 * Math.sin(a)];
    },
  },
  throttle: {
    path: 'M 700 690 L 700 770',
    arrows: [
      [700, 690, -90],
      [700, 770, 90],
    ],
    point: (v) => [700, 730 - v * 40],
  },
};
