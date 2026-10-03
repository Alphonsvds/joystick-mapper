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
//   folded    true for a stick with more controls than there is room to show dropdowns
//             for: each label is its heading alone, and opens when clicked (see FOLDED)

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

// ─── VKB STECS Modern Throttle Mk.II Standard (twin grips, base and STEM) ────

// Controls that share a label, each with its own short text.
const labelled = (...pairs) => pairs.map(([id, label]) => ({ id, label }));

// The left column mirrors each pair so its first control sits nearest the stick. Where
// the order is the point (L before R, A1 before A2), this lists them to read left to right.
const leftToRight = (items) => items.flatMap((item, i) => (i % 2 ? [] : [items[i + 1], item].filter(Boolean)));

// Seen from behind and to the right: the pilot sits bottom left and forward is to the
// right. The grips' front faces are out of sight, so their controls point at the top edge
// of the grip, as near to where they sit as the photo allows. The ministick, the analog
// wheel and both encoder pushes aren't labelled: the owner's button map left them blank.
const STECS_STANDARD = {
  alt: 'VKB STECS Modern Throttle Standard with its STEM module, seen from behind',
  dense: true,
  image: { src: 'assets/stecs-standard.png', width: 998, height: 784, x: 471, y: 212, scale: 0.66 },
  columns: {
    left: { edge: 450, anchor: 464, elbow: 520 },
    right: { edge: 1150, anchor: 1136, elbow: 1080 },
  },
  callouts: [
    ...stack('left', 92, [
      { id: 'centrewheel', name: 'Centre Wheel', tag: 'FRONT', at: [527, 74], columns: 2, group: labelled(['btn13', 'Fwd'], ['btn12', 'Back']) },
      { id: 'endwheel', name: 'End Wheel', tag: 'FRONT', at: [432, 84], columns: 2, group: labelled(['btn14', 'Fwd'], ['btn15', 'Back']) },
      { id: 'reartriggers', name: 'Rear Triggers', at: [512, 206], columns: 2, group: leftToRight(labelled(['btn8', 'L'], ['btn16', 'R'])) },
      {
        id: 'toggle',
        name: 'Toggle',
        tag: 'TGL',
        at: [309, 412],
        columns: 2,
        group: [
          { id: 'btn49', dir: 'up' },
          { id: 'btn50', dir: 'down' },
        ],
      },
      {
        id: 'en1',
        name: 'EN1',
        tag: 'ENCODER',
        at: [323, 454],
        columns: 2,
        group: [
          { id: 'btn51', dir: 'left' },
          { id: 'btn52', dir: 'right' },
        ],
      },
      {
        id: 'flip',
        name: 'Flip Switch',
        at: [178, 432],
        columns: 2,
        group: [
          { id: 'btn57', dir: 'up' },
          { id: 'btn58', dir: 'down' },
        ],
      },
      {
        id: 'en2',
        name: 'EN2',
        tag: 'ENCODER',
        at: [192, 492],
        columns: 2,
        group: [
          { id: 'btn53', dir: 'left' },
          { id: 'btn54', dir: 'right' },
        ],
      },
      {
        id: 'sw',
        name: 'SW1 · SW2',
        tag: 'ROCKERS',
        at: [404, 506],
        columns: 2,
        group: leftToRight(
          labelled(['btn43', '1 Up'], ['btn46', '2 Up'], ['btn44', '1 In'], ['btn47', '2 In'], ['btn45', '1 Dn'], ['btn48', '2 Dn']),
        ),
      },
      {
        id: 'stembuttons',
        name: 'STEM Buttons',
        at: [362, 552],
        columns: 2,
        group: leftToRight(
          labelled(
            ['btn35', 'A1'],
            ['btn36', 'A2'],
            ['btn37', 'C1'],
            ['btn38', 'B1'],
            ['btn39', 'B2'],
            ['btn40', 'B3'],
            ['btn41', 'B4'],
            ['btn42', 'B5'],
          ),
        ),
      },
    ]),
    ...stack('right', 92, [
      { id: 'fronttriggers', name: 'Front Triggers', at: [565, 62], columns: 2, group: labelled(['btn9', 'L'], ['btn17', 'R']) },
      {
        id: 'frontbuttons',
        name: 'Front Buttons',
        at: [640, 43],
        columns: 2,
        group: labelled(['btn10', 'Red'], ['btn11', 'RST'], ['btn18', 'ENT'], ['btn23', 'Grey']),
      },
      {
        id: 'fronthat',
        name: 'Front Hat',
        at: [826, 100],
        columns: 2,
        group: [
          { id: 'btn32', dir: 'up' },
          { id: 'btn30', dir: 'right' },
          { id: 'btn31', dir: 'down' },
          { id: 'btn29', dir: 'left' },
          { id: 'btn21', dir: 'push' },
        ],
      },
      {
        id: 'rocker',
        name: 'Rocker',
        tag: 'THUMB',
        at: [704, 116],
        columns: 2,
        group: [
          { id: 'btn34', dir: 'up' },
          { id: 'btn33', dir: 'down' },
          { id: 'btn22', dir: 'push' },
        ],
      },
      {
        id: 'thumbhat',
        name: 'Thumb Hat',
        at: [756, 176],
        columns: 2,
        group: labelled(['btn25', 'Up'], ['btn26', 'Down'], ['btn27', 'Fwd'], ['btn28', 'Back'], ['btn20', 'Push']),
      },
      { id: 'btn24', at: [711, 238] },
      {
        id: 'base',
        name: 'Base',
        tag: 'ROTARY 1–5',
        at: [770, 420],
        columns: 2,
        group: labelled(['btn1', 'Dot'], ['btn2', 'Red'], ['btn3', '1'], ['btn4', '2'], ['btn5', '3'], ['btn6', '4'], ['btn7', '5']),
      },
      {
        id: 'throttle',
        name: 'Throttle',
        tag: 'LEVERS',
        at: [660, 372],
        columns: 2,
        group: [
          { id: 'x', label: '1', wide: true },
          { id: 'y', label: '2', wide: true },
        ],
      },
    ]),
  ],
  // Along the scales beside each lever's slot; forward is up and to the right.
  guides: {
    x: {
      path: 'M 781 486 L 817 455',
      arrows: [
        [781, 486, 139],
        [817, 455, -41],
      ],
      point: (v) => [799 + v * 18, 470.5 - v * 15.5],
    },
    y: {
      path: 'M 838 492 L 874 461',
      arrows: [
        [838, 492, 139],
        [874, 461, -41],
      ],
      point: (v) => [856 + v * 18, 476.5 - v * 15.5],
    },
  },
};

// ─── Turtle Beach VelocityOne Flightstick ────────────────────────────────────

// Seen from straight above, so everything on the base is in view. The trigger is on the
// far side of the grip's head: its line stops at the head's top edge. The touchpad click
// and the Xbox and Share buttons aren't labelled, their button numbers aren't known yet.
const VELOCITYONE_FLIGHTSTICK = {
  alt: 'Turtle Beach VelocityOne Flightstick, seen from above',
  dense: true,
  image: { src: 'assets/velocityone-flightstick.png', width: 972, height: 744, x: 489, y: 237, scale: 0.64 },
  columns: {
    left: { edge: 450, anchor: 464, elbow: 480 },
    right: { edge: 1150, anchor: 1136, elbow: 1120 },
  },
  callouts: [
    ...stack('left', 136, [
      { id: 'btn18', at: [430, 12], tag: 'REAR' },
      { id: 'hat1', at: [436, 193], tag: 'POV', columns: 2, group: HAT_DIRECTIONS.map((dir) => ({ id: `hat1_${dir}`, dir })) },
      { id: 'btn16', at: [438, 258] },
      {
        id: 'leftlever',
        name: 'Left Lever',
        tag: 'B9 · B10',
        at: [107, 212],
        columns: 2,
        group: [
          { id: 'rz', wide: true },
          { id: 'btn9', dir: 'up' },
          { id: 'btn10', dir: 'down' },
        ],
      },
      { id: 'y', at: [452, 320], tag: 'Y AXIS' },
      { id: 'x', at: [460, 385], tag: 'X AXIS' },
      {
        id: 'leftbuttons',
        name: 'Left Buttons',
        tag: 'B1–B4',
        at: [141, 546],
        columns: 2,
        group: leftToRight(labelled(['btn1', 'A'], ['btn2', 'B'], ['btn3', 'X'], ['btn4', 'Y'])),
      },
      { id: 'btn21', at: [438, 695] },
    ]),
    ...stack('right', 136, [
      {
        id: 'h2',
        name: 'H2 Ministick',
        tag: 'ANALOG',
        at: [533, 197],
        columns: 2,
        group: [
          { id: 'rx', label: 'X', wide: true },
          { id: 'ry', label: 'Y', wide: true },
          { id: 'btn19', dir: 'push' },
        ],
      },
      { id: 'btn17', at: [537, 258] },
      {
        id: 'rightlever',
        name: 'Right Lever',
        tag: 'B11 · B12',
        at: [852, 212],
        columns: 2,
        group: [
          { id: 'dial', wide: true },
          { id: 'btn11', dir: 'up' },
          { id: 'btn12', dir: 'down' },
        ],
      },
      // Buttons 13 and 14 only fire with the wheel set to "Digital Buttons" on the stick.
      {
        id: 'trim',
        name: 'Trim Wheel',
        tag: 'AXIS OR BUTTONS',
        at: [487, 282],
        columns: 2,
        group: [
          { id: 'slider', wide: true },
          { id: 'btn14', dir: 'up' },
          { id: 'btn13', dir: 'down' },
        ],
      },
      { id: 'z', at: [505, 400], tag: 'TWIST' },
      {
        id: 'rightbuttons',
        name: 'Right Buttons',
        tag: 'B5–B8',
        at: [831, 546],
        columns: 2,
        group: labelled(['btn5', 'A'], ['btn6', 'B'], ['btn7', 'X'], ['btn8', 'Y']),
      },
      { id: 'btn23', at: [534, 695] },
    ]),
  ],
  guides: {
    x: {
      path: 'M 715 202 L 885 202',
      arrows: [
        [715, 202, 180],
        [885, 202, 0],
      ],
      point: (v) => [800 + v * 85, 202],
    },
    y: {
      path: 'M 902 262 L 902 382',
      arrows: [
        [902, 262, -90],
        [902, 382, 90],
      ],
      point: (v) => [902, 322 - v * 60],
    },
    // An arc under the ring around the stick's base.
    z: {
      path: 'M 707.5 567.6 A 132 132 0 0 0 887.5 567.6',
      arrows: [
        [707.5, 567.6, -137],
        [887.5, 567.6, -43],
      ],
      point: (v) => {
        const a = Math.PI / 2 - v * 0.75;
        return [797.5 + 132 * Math.cos(a), 471 + 132 * Math.sin(a)];
      },
    },
    // Along the scale printed beside each lever's slot; forward is up.
    rz: {
      path: 'M 613 334 L 613 412',
      arrows: [
        [613, 334, -90],
        [613, 412, 90],
      ],
      point: (v) => [613, 373 - v * 39],
    },
    dial: {
      path: 'M 988 334 L 988 412',
      arrows: [
        [988, 334, -90],
        [988, 412, 90],
      ],
      point: (v) => [988, 373 - v * 39],
    },
  },
};

// ─── WINWING Orion 2 with the F-16EX grip ────────────────────────────────────

// A hat that reports as five buttons with its push first: `push`, then up, right, down, left.
const pushHat = (push) => [...HAT_DIRECTIONS.map((dir, i) => ({ id: `btn${push + 1 + i}`, dir })), { id: `btn${push}`, dir: 'push' }];

// Seen from behind and to the left, so forward is to the left. The top lever sits beside
// the trigger under the head, and the side hat is on the far side of it: both are out of
// sight, so their lines stop at the nearest edge. The photo is cut off below the gimbal.
const ORION2_F16EX = {
  alt: 'WINWING Orion 2 joystick with the F-16EX grip, seen from behind',
  dense: true,
  image: { src: 'assets/orion2-f16ex.png', width: 720, height: 1083, x: 545, y: 108, scale: 0.74 },
  columns: {
    left: { edge: 450, anchor: 464, elbow: 520 },
    right: { edge: 1150, anchor: 1136, elbow: 1080 },
  },
  callouts: [
    ...stack('left', 92, [
      { id: 'btn20', at: [267, 98] },
      { id: 'lefthat', name: 'Left Hat', tag: 'EXTENSION', at: [192, 125], columns: 2, group: pushHat(21) },
      {
        id: 'ministick',
        name: 'Ministick',
        tag: 'ANALOG OR BUTTONS',
        at: [229, 250],
        columns: 2,
        group: [{ id: 'rx', label: 'X', wide: true }, { id: 'ry', label: 'Y', wide: true }, ...pushHat(26)],
      },
      {
        id: 'toplever',
        name: 'Top Lever',
        tag: 'BESIDE THE TRIGGER',
        at: [167, 324],
        columns: 2,
        group: [{ id: 'rz', wide: true }, ...labelled(['btn1', 'Fwd'], ['btn2', 'Rest'], ['btn41', '1st'], ['btn42', '2nd'], ['btn3', 'Full'])],
      },
      { id: 'trigger', name: 'Trigger', tag: 'TWO STAGE', at: [231, 315], columns: 2, group: labelled(['btn4', '1st'], ['btn5', '2nd']) },
      {
        id: 'paddle',
        name: 'Paddle',
        at: [188, 530],
        columns: 2,
        group: [{ id: 'slider', wide: true }, ...labelled(['btn7', 'Rest'], ['btn8', 'Full'])],
      },
    ]),
    ...stack('right', 92, [
      {
        id: 'hat1',
        tag: 'POV',
        at: [350, 50],
        columns: 2,
        group: [...HAT_DIRECTIONS.map((dir) => ({ id: `hat1_${dir}`, dir })), { id: 'btn19', dir: 'push' }],
      },
      {
        id: 'sidehat',
        name: 'Side Hat',
        tag: 'RIGHT OF THE HEAD',
        at: [392, 119],
        columns: 2,
        group: [
          { id: 'btn18', dir: 'up' },
          { id: 'btn15', dir: 'right' },
          { id: 'btn16', dir: 'down' },
          { id: 'btn17', dir: 'left' },
          { id: 'btn14', dir: 'push' },
        ],
      },
      { id: 'righthat', name: 'Right Hat', at: [396, 167], columns: 2, group: pushHat(36) },
      { id: 'centrehat', name: 'Centre Hat', at: [310, 183], columns: 2, group: pushHat(31) },
      { id: 'thumbhat', name: 'Thumb Hat', at: [302, 379], columns: 2, group: pushHat(9) },
      {
        id: 'stick',
        name: 'Stick',
        at: [417, 479],
        columns: 2,
        group: [
          { id: 'x', label: 'X', wide: true },
          { id: 'y', label: 'Y', wide: true },
        ],
      },
      { id: 'btn6', at: [306, 583] },
    ]),
  ],
  guides: {
    x: {
      path: 'M 630 92 L 790 92',
      arrows: [
        [630, 92, 180],
        [790, 92, 0],
      ],
      point: (v) => [710 + v * 80, 92],
    },
    y: {
      path: 'M 905 150 L 905 310',
      arrows: [
        [905, 150, -90],
        [905, 310, 90],
      ],
      point: (v) => [905, 230 - v * 80],
    },
    // Above the paddle's tip, which swings in towards the grip.
    slider: {
      path: 'M 650 452 L 712 452',
      arrows: [
        [650, 452, 180],
        [712, 452, 0],
      ],
      point: (v) => [681 + v * 31, 452],
    },
  },
};

// ─── WINWING Orion 2 throttle (F-15EX handles) ───────────────────────────────

// Folded labels are a heading each, so they stack at a fixed pitch from `top`.
const FOLDED = { pitch: 34 };
const fold = (side, top, callouts) => callouts.map((c, i) => ({ ...c, side, y: top + i * FOLDED.pitch }));

// A switch with a button for each of three positions, `first` being up and the next its middle.
const threeWay = (first) => [
  { id: `btn${first}`, dir: 'up' },
  { id: `btn${first + 2}`, dir: 'down' },
  { id: `btn${first + 1}`, dir: 'push' },
];

// A knob that sends a button each way it turns, and one when pushed: `first` is left.
const knob = (first) => [
  { id: `btn${first}`, dir: 'left' },
  { id: `btn${first + 1}`, dir: 'right' },
  { id: `btn${first + 2}`, dir: 'push' },
];

// Seen from the pilot's left: the pilot sits bottom left and forward is up and to the
// right. It has 37 controls, so every one gets its own line and a folded label; the labels
// are in the order that keeps the lines from crossing or running over another dot.
// The right handle's thumb side faces the camera, with four of its controls in view. A
// second hat and a button on that side, the launch bar switch (behind the handle), the A/G
// button (behind the Dial lever) and everything on the front of both handles are out of
// sight: their dots sit on the nearest edge, the front ones along the handles' tops.
const ORION2_THROTTLE = {
  alt: 'WINWING Orion 2 throttle, seen from the left',
  dense: true,
  folded: true,
  image: { src: 'assets/orion2-throttle.png', width: 1026, height: 943, x: 410, y: 128, scale: 0.76 },
  columns: {
    left: { edge: 330, anchor: 344, elbow: 400 },
    right: { edge: 1270, anchor: 1256, elbow: 1200 },
  },
  callouts: [
    ...fold('left', 136, [
      { id: 'lefthat', name: 'Left Hat', tag: 'FRONT', at: [240, 16], columns: 2, group: buttonHat(51) },
      {
        id: 'antenna',
        name: 'Antenna Knob',
        at: [186, 34],
        columns: 2,
        group: [{ id: 'rz', wide: true }, ...labelled(['btn60', 'B60'], ['btn61', 'B61'], ['btn62', 'B62'])],
      },
      { id: 'btn56', at: [312, 22], tag: 'FRONT' },
      { id: 'btn50', at: [274, 50], tag: 'FRONT' },
      {
        id: 'slew',
        name: 'Slew Wheel',
        tag: 'FRONT',
        at: [392, 30],
        columns: 2,
        group: [{ id: 'z', wide: true }, ...labelled(['btn40', 'B40'], ['btn41', 'B41'], ['btn42', 'B42'])],
      },
      { id: 'lever', name: 'Lever Switch', at: [146, 148], columns: 2, group: threeWay(57) },
      {
        id: 'tdc',
        name: 'TDC',
        tag: 'FRONT',
        at: [440, 30],
        columns: 2,
        group: [{ id: 'x', label: 'X', wide: true }, { id: 'y', label: 'Y', wide: true }, ...pushHat(35)],
      },
      {
        id: 'fronthat',
        name: 'Front Hat',
        at: [490, 30],
        columns: 2,
        group: [
          { id: 'btn28', dir: 'up' },
          { id: 'btn29', dir: 'right' },
          { id: 'btn32', dir: 'down' },
          { id: 'btn33', dir: 'left' },
          { id: 'btn34', dir: 'push' },
        ],
      },
      { id: 'btn11', at: [518, 236], tag: 'OUT OF VIEW' },
      {
        id: 'leftthrottle',
        name: 'Left Throttle',
        at: [332, 444],
        columns: 2,
        group: [{ id: 'ry', wide: true }, ...labelled(['btn2', 'Off'], ['btn31', 'Idle'], ['btn113', 'Lift'])],
      },
      {
        id: 'rightthrottle',
        name: 'Right Throttle',
        at: [400, 486],
        columns: 2,
        group: [{ id: 'rx', wide: true }, ...labelled(['btn1', 'Off'], ['btn30', 'Idle'], ['btn112', 'Lift'])],
      },
      { id: 'roll', name: 'Roll Switch', at: [157, 520], columns: 2, group: threeWay(86) },
      { id: 'btn92', at: [328, 540] },
      { id: 'pitch', name: 'Pitch Switch', at: [232, 560], columns: 2, group: threeWay(89) },
      { id: 'hdg', name: 'HDG Knob', at: [274, 624], columns: 2, group: knob(97) },
      { id: 'masterarm', name: 'Master Arm', at: [468, 615], columns: 2, group: labelled(['btn93', 'Arm'], ['btn94', 'Safe'], ['btn95', 'Sim']) },
      { id: 'crs', name: 'CRS Knob', at: [341, 659], columns: 2, group: knob(100) },
      { id: 'btn96', at: [521, 654] },
      { id: 'lights', name: 'Lights Knob', at: [431, 692], columns: 2, group: knob(103) },
    ]),
    ...fold('right', 150, [
      {
        id: 'encoder',
        name: 'Encoder',
        tag: 'FRONT',
        at: [540, 30],
        columns: 2,
        group: labelled(['btn25', 'Up'], ['btn27', 'Down'], ['btn43', 'Up 2'], ['btn44', 'Dn 2'], ['btn26', 'Push']),
      },
      { id: 'slide', name: 'Slide Switch', at: [587, 129], columns: 2, group: threeWay(22) },
      { id: 'conehat', name: 'Cone Hat', at: [552, 212], columns: 2, group: buttonHat(12) },
      { id: 'innerhat', name: 'Inner Hat', tag: 'OUT OF VIEW', at: [610, 232], columns: 2, group: buttonHat(17) },
      { id: 'ribbedhat', name: 'Ribbed Hat', at: [588, 271], columns: 2, group: buttonHat(6) },
      {
        id: 'hook',
        name: 'Hook',
        at: [645, 286],
        columns: 2,
        group: [
          { id: 'btn67', dir: 'up' },
          { id: 'btn68', dir: 'down' },
        ],
      },
      {
        id: 'gear',
        name: 'Gear',
        at: [791, 312],
        columns: 2,
        group: [
          { id: 'btn73', dir: 'up' },
          { id: 'btn74', dir: 'down' },
        ],
      },
      { id: 'park', name: 'Park Brake', at: [853, 345], columns: 2, group: labelled(['btn75', 'Park'], ['btn76', 'Off']) },
      { id: 'flap', name: 'Flap', at: [932, 372], columns: 2, group: labelled(['btn77', 'Auto'], ['btn78', 'Half'], ['btn79', 'Full']) },
      { id: 'wingfold', name: 'Wing Fold', at: [701, 309], columns: 2, group: labelled(['btn69', 'Fold'], ['btn70', 'Hold'], ['btn71', 'Sprd'], ['btn72', 'Push']) },
      { id: 'launchbar', name: 'Launch Bar', tag: 'OUT OF VIEW', at: [612, 305], columns: 2, group: labelled(['btn65', 'Retr'], ['btn66', 'Ext']) },
      {
        id: 'sliderlever',
        name: 'Slider Lever',
        at: [784, 405],
        columns: 2,
        group: [{ id: 'slider', wide: true }, ...labelled(['btn106', 'Fwd'], ['btn107', 'Mid'], ['btn108', 'Back'])],
      },
      { id: 'paddle', name: 'Paddle Switch', at: [573, 331], columns: 2, group: threeWay(3) },
      { id: 'btn80', at: [665, 433] },
      { id: 'hmd', name: 'HMD Knob', at: [728, 498], columns: 2, group: knob(83) },
      { id: 'btn81', at: [626, 470], tag: 'BEHIND THE LEVER' },
      { id: 'btn82', at: [658, 512] },
      {
        id: 'diallever',
        name: 'Dial Lever',
        at: [592, 530],
        columns: 2,
        group: [{ id: 'dial', wide: true }, ...labelled(['btn109', 'Fwd'], ['btn110', 'Mid'], ['btn111', 'Back'])],
      },
    ]),
  ],
  // The throttles run up and to the right, beside their slot; the two base levers ride the
  // arrows printed beside them.
  guides: {
    ry: {
      path: 'M 590.5 473.6 L 635.6 445.1',
      arrows: [
        [590.5, 473.6, 147.7],
        [635.6, 445.1, -32.3],
      ],
      point: (v) => [613.1 + v * 22.6, 459.3 - v * 14.2],
    },
    rx: {
      path: 'M 714 525.8 L 759.1 497.3',
      arrows: [
        [714, 525.8, 147.7],
        [759.1, 497.3, -32.3],
      ],
      point: (v) => [736.6 + v * 22.6, 511.6 - v * 14.2],
    },
    slider: {
      path: 'M 996.6 506.8 L 1058.4 466.4',
      arrows: [
        [996.6, 506.8, 146.8],
        [1058.4, 466.4, -33.2],
      ],
      point: (v) => [1027.5 + v * 30.9, 486.6 - v * 20.2],
    },
    dial: {
      path: 'M 851.8 604.2 L 921.8 556.7',
      arrows: [
        [851.8, 604.2, 145.9],
        [921.8, 556.7, -34.1],
      ],
      point: (v) => [886.8 + v * 35, 580.5 - v * 23.75],
    },
  },
};

// Keyed by skin id (see SKINS in shared/devices.js). A skin with no entry shows as the list.
export const LAYOUTS = {
  extreme3dpro: EXTREME_3D_PRO,
  gladiatorevo: GLADIATOR_EVO,
  stecsstandard: STECS_STANDARD,
  velocityoneflightstick: VELOCITYONE_FLIGHTSTICK,
  orion2f16ex: ORION2_F16EX,
  orion2throttle: ORION2_THROTTLE,
};

export const toStage = (layout, [x, y]) => [layout.image.x + x * layout.image.scale, layout.image.y + y * layout.image.scale];
