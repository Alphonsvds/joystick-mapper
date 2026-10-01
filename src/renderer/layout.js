// Photo layouts ("skins"): a cut-out photo of the stick with a line to every control.
// Sticks without one use the generic layout in generic.js. Everything is laid out on a
// fixed 1600×1000 stage that is scaled to fit the window, so lines always land on the
// same pixels.

export const STAGE = { width: 1600, height: 1000 };

// Each layout has:
//   image     the photo (background removed) and where it sits on the stage
//   columns   label columns. Leader lines leave the label horizontally, bend at the
//             elbow, then run straight to the hotspot
//   callouts  one entry per label. `y` is the label row on the stage, `at` the hotspot
//             in photo pixels, `via` optional stage waypoints that steer a line around
//             neighbouring hotspots. `group` lists several controls under one label (a
//             hat's directions, a two-stage trigger); `columns: 2` packs them in pairs
//   dense     true to pack the labels tighter (see DENSE below)
//   guides    motion guides drawn over the stick for each axis. A dot rides along the
//             guide to show the live value; `point(v)` maps -1..1 to a stage position

const HAT_DIRECTIONS = ['up', 'right', 'down', 'left'];

// ─── Logitech Extreme 3D Pro ─────────────────────────────────────────────────

const EXTREME_3D_PRO = {
  alt: 'Logitech Extreme 3D Pro, seen from above',
  image: { src: 'assets/joystick.png', width: 516, height: 513, x: 413, y: 92, scale: 1.5 },
  columns: {
    left: { edge: 372, anchor: 386, elbow: 470 },
    right: { edge: 1228, anchor: 1214, elbow: 1130 },
  },
  callouts: [
    { id: 'btn1', side: 'left', y: 150, at: [261, 24] },
    { id: 'btn5', side: 'left', y: 222, at: [223, 131] },
    { id: 'btn3', side: 'left', y: 294, at: [241, 163], via: [[742, 304]] },
    { id: 'btn2', side: 'left', y: 366, at: [205, 160] },
    { id: 'btn7', side: 'left', y: 438, at: [168, 177] },
    { id: 'btn8', side: 'left', y: 510, at: [186, 203] },
    { id: 'btn9', side: 'left', y: 582, at: [126, 240] },
    { id: 'btn10', side: 'left', y: 654, at: [156, 246] },
    { id: 'btn11', side: 'left', y: 726, at: [124, 312] },
    { id: 'btn12', side: 'left', y: 798, at: [154, 302] },

    { id: 'y', side: 'right', y: 150, at: [261, 62], tag: 'Y AXIS' },
    {
      id: 'hat1',
      side: 'right',
      y: 222,
      at: [261, 125],
      tag: 'POV',
      via: [[832, 224]],
      group: HAT_DIRECTIONS.map((dir) => ({ id: `hat1_${dir}`, dir, label: dir })),
    },
    { id: 'btn6', side: 'right', y: 430, at: [299, 131] },
    { id: 'btn4', side: 'right', y: 502, at: [282, 163] },
    { id: 'x', side: 'right', y: 574, at: [292, 236], tag: 'X AXIS' },
    { id: 'rz', side: 'right', y: 646, at: [304, 300], tag: 'TWIST' },
    { id: 'slider', side: 'right', y: 798, at: [228, 424], tag: 'SLIDER' },
  ],
  guides: {
    x: {
      path: 'M 700 84 L 910 84',
      arrows: [
        [700, 84, 180],
        [910, 84, 0],
      ],
      point: (v) => [805 + v * 105, 84],
    },
    y: {
      path: 'M 948 170 L 948 360',
      arrows: [
        [948, 170, -90],
        [948, 360, 90],
      ],
      point: (v) => [948, 265 - v * 95],
    },
    // An arc around the rubber collar; its ends stop short of the ellipse's sides so the
    // arrowheads angle along the curve.
    rz: {
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
    slider: {
      path: 'M 700 690 L 700 770',
      arrows: [
        [700, 690, -90],
        [700, 770, 90],
      ],
      point: (v) => [700, 730 - v * 40],
    },
  },
};

// ─── VKB Gladiator NXT EVO (right hand, Premium / Space Combat grip) ─────────

// A hat that reports as five buttons, `first` being "up" (see SKINS in shared/devices.js).
const buttonHat = (first) => [
  ...HAT_DIRECTIONS.map((dir, i) => ({ id: `btn${first + i}`, dir })),
  { id: `btn${first + 4}`, dir: 'push' },
];

// This stick has 39 controls, so its labels are packed tighter than the Extreme's: a
// label takes `head` px, each row of controls `row` px, and `gap` px separates labels.
// Keep in step with the [data-density='dense'] rules in styles.css.
const DENSE = { head: 23, row: 32, gap: 18 };

// Stacks callouts down one side of the stage, starting at `top`.
function stack(side, top, callouts) {
  let y = top;
  return callouts.map((c) => {
    const rows = c.group ? c.group.reduce((n, item) => n + (item.wide ? 1 : 1 / (c.columns ?? 1)), 0) : 1;
    const placed = { ...c, side, y };
    y += DENSE.head + Math.ceil(rows) * DENSE.row + DENSE.gap;
    return placed;
  });
}

const GLADIATOR_EVO = {
  alt: 'VKB Gladiator NXT EVO, seen from behind',
  dense: true,
  image: { src: 'assets/gladiator-evo.png', width: 804, height: 1036, x: 506, y: 104, scale: 0.68 },
  columns: {
    left: { edge: 450, anchor: 464, elbow: 520 },
    right: { edge: 1150, anchor: 1136, elbow: 1080 },
  },
  callouts: [
    ...stack('left', 120, [
      {
        id: 'a1',
        name: 'A1 Ministick',
        tag: 'POV · ANALOG',
        at: [213, 97],
        columns: 2,
        group: [
          ...HAT_DIRECTIONS.map((dir) => ({ id: `hat1_${dir}`, dir })),
          { id: 'rx', label: 'X', wide: true },
          { id: 'ry', label: 'Y', wide: true },
        ],
      },
      // B1 is on the front of the head, above the flip trigger: mostly hidden from this
      // angle, so the hotspot sits on the edge.
      { id: 'btn4', at: [97, 181] },
      {
        id: 'rapid',
        name: 'Rapid Fire',
        tag: 'FLIP TRIGGER',
        at: [148, 240],
        columns: 2,
        group: [
          { id: 'btn21', label: 'Fwd' },
          { id: 'btn22', label: 'Back' },
        ],
      },
      { id: 'btn3', at: [217, 187] },
      {
        id: 'trigger',
        name: 'Trigger',
        tag: 'TWO STAGE',
        at: [208, 270],
        columns: 2,
        group: [
          { id: 'btn1', label: '1st' },
          { id: 'btn2', label: '2nd' },
        ],
      },
      { id: 'c1', name: 'C1 Hat', tag: 'THUMB', at: [292, 343], columns: 2, group: buttonHat(16) },
      { id: 'btn5', at: [283, 515], tag: 'PINKY' },
      { id: 'rz', at: [372, 598], tag: 'TWIST' },
    ]),
    ...stack('right', 120, [
      { id: 'a4', name: 'A4 Hat', at: [297, 68], columns: 2, group: buttonHat(11) },
      { id: 'a3', name: 'A3 Hat', at: [272, 150], columns: 2, group: buttonHat(6) },
      { id: 'y', at: [345, 290], tag: 'Y AXIS' },
      { id: 'x', at: [370, 440], tag: 'X AXIS' },
      {
        id: 'fx',
        name: 'Base Buttons',
        at: [546, 715],
        columns: 2,
        group: [
          { id: 'btn27', label: 'F1' },
          { id: 'btn28', label: 'F2' },
          { id: 'btn29', label: 'F3' },
        ],
      },
      {
        id: 'en1',
        name: 'En1',
        tag: 'ENCODER',
        at: [668, 775],
        columns: 2,
        group: [
          { id: 'btn23', label: 'Up' },
          { id: 'btn24', label: 'Down' },
        ],
      },
      { id: 'z', at: [635, 850], tag: 'Z AXIS' },
      {
        id: 'sw1',
        name: 'Sw1',
        tag: 'SPRING SWITCH',
        at: [545, 838],
        columns: 2,
        group: [
          { id: 'btn25', label: 'Up' },
          { id: 'btn26', label: 'Down' },
        ],
      },
    ]),
  ],
  guides: {
    x: {
      path: 'M 570 90 L 740 90',
      arrows: [
        [570, 90, 180],
        [740, 90, 0],
      ],
      point: (v) => [655 + v * 85, 90],
    },
    y: {
      path: 'M 790 140 L 790 300',
      arrows: [
        [790, 140, -90],
        [790, 300, 90],
      ],
      point: (v) => [790, 220 - v * 80],
    },
    // An arc around the collar under the grip, like the Extreme's.
    rz: {
      path: 'M 672.9 524.9 A 92 28 0 0 0 851.1 524.9',
      arrows: [
        [672.9, 524.9, -129.5],
        [851.1, 524.9, -50.5],
      ],
      point: (v) => {
        const a = Math.PI / 2 - v * (Math.PI / 2 - 0.25);
        return [762 + 92 * Math.cos(a), 518 + 28 * Math.sin(a)];
      },
    },
    // Rides up and down the throttle wheel itself.
    z: {
      path: 'M 920 628 L 920 690',
      arrows: [
        [920, 628, -90],
        [920, 690, 90],
      ],
      point: (v) => [920, 659 - v * 31],
    },
  },
};

// Keyed by skin id (see SKINS in shared/devices.js).
export const LAYOUTS = { extreme3dpro: EXTREME_3D_PRO, gladiatorevo: GLADIATOR_EVO };

export const toStage = (layout, [x, y]) => [layout.image.x + x * layout.image.scale, layout.image.y + y * layout.image.scale];
