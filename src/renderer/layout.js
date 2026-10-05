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

// Moves a whole layout `dy` px down the stage: the photo, its labels, their lines and the
// motion guides together. For a layout drawn high, to centre it between the top bar and
// the readout under it.
function lower(dy, layout) {
  const down = ([x, y, ...rest]) => [x, y + dy, ...rest];
  // Guide paths are absolute M, L and A commands, each ending on a point's y.
  const downPath = (path) =>
    path
      .replace(/([MLA])([^MLA]+)/g, (_, command, args) => {
        const numbers = args.trim().split(/\s+/).map(Number);
        numbers[numbers.length - 1] += dy;
        return `${command} ${numbers.join(' ')} `;
      })
      .trim();
  return {
    ...layout,
    image: { ...layout.image, y: layout.image.y + dy },
    callouts: layout.callouts.map((c) => ({ ...c, y: c.y + dy, ...(c.via && { via: c.via.map(down) }) })),
    guides: Object.fromEntries(
      Object.entries(layout.guides).map(([axis, guide]) => [
        axis,
        { ...guide, path: downPath(guide.path), arrows: guide.arrows.map(down), point: (v) => down(guide.point(v)) },
      ]),
    ),
  };
}

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

const GLADIATOR_EVO = lower(14, {
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
});

// ─── VKB Gladiator NXT EVO: the left-hand stick and the Omni Throttles ───────

// Motion guides: a straight run for a stick or lever axis, and the arc of a twist collar.
const across = (x0, x1, y) => ({
  path: `M ${x0} ${y} L ${x1} ${y}`,
  arrows: [
    [x0, y, 180],
    [x1, y, 0],
  ],
  point: (v) => [(x0 + x1) / 2 + (v * (x1 - x0)) / 2, y],
});
const upDown = (x, y0, y1) => ({
  path: `M ${x} ${y0} L ${x} ${y1}`,
  arrows: [
    [x, y0, -90],
    [x, y1, 90],
  ],
  point: (v) => [x, (y0 + y1) / 2 - (v * (y1 - y0)) / 2],
});
const COLLAR = { rx: 92, ry: 28, end: 0.25 };
const collar = (cx, cy) => {
  const dx = COLLAR.rx * Math.cos(COLLAR.end);
  const y = cy + COLLAR.ry * Math.sin(COLLAR.end);
  return {
    path: `M ${cx - dx} ${y} A ${COLLAR.rx} ${COLLAR.ry} 0 0 0 ${cx + dx} ${y}`,
    arrows: [
      [cx - dx, y, -129.5],
      [cx + dx, y, -50.5],
    ],
    point: (v) => {
      const a = Math.PI / 2 - v * (Math.PI / 2 - COLLAR.end);
      return [cx + COLLAR.rx * Math.cos(a), cy + COLLAR.ry * Math.sin(a)];
    },
  };
};

// The right-hand stick's labels, for the other photos of the same controls.
const GLADIATOR_LABELS = Object.fromEntries(GLADIATOR_EVO.callouts.map(({ side, y, at, ...label }) => [label.id, label]));

// Another photo of the Gladiator. `sides` lists the labels down each side of the stage,
// `at` gives each one's hotspot, and `relabel` renames the axes that mean something else
// when the grip is a throttle.
function gladiatorPhoto({ alt, image, top = 120, sides, at, relabel = {}, guides }) {
  const place = (ids) => ids.map((id) => ({ ...GLADIATOR_LABELS[id], ...relabel[id], at: at[id] }));
  return {
    alt,
    dense: true,
    image,
    columns: GLADIATOR_EVO.columns,
    callouts: [...stack('left', top, place(sides.left)), ...stack('right', top, place(sides.right))],
    guides,
  };
}

// The left-hand stick, from the same angle as the right-hand one: the same base under a
// mirrored grip, so the trigger, B1 and the rapid-fire switch are in view on the left.
const GLADIATOR_EVO_LEFT = gladiatorPhoto({
  alt: 'VKB Gladiator NXT EVO, left hand, seen from behind',
  image: { src: 'assets/gladiator-evo-left.png', width: 794, height: 1028, x: 506, y: 104, scale: 0.68 },
  sides: {
    left: ['a4', 'btn4', 'rapid', 'trigger', 'y', 'x', 'btn5', 'rz'],
    right: ['a1', 'btn3', 'a3', 'c1', 'fx', 'en1', 'z', 'sw1'],
  },
  at: {
    a4: [240, 78],
    btn4: [90, 168],
    rapid: [178, 208],
    trigger: [203, 262],
    y: [330, 330],
    x: [360, 440],
    btn5: [298, 492],
    rz: [420, 585],
    a1: [320, 70],
    btn3: [347, 152],
    a3: [303, 142],
    c1: [410, 300],
    fx: [541, 712],
    en1: [664, 787],
    z: [634, 850],
    sw1: [541, 835],
  },
  guides: { x: across(575, 745, 90), y: upDown(800, 140, 300), rz: collar(778, 505), z: upDown(920, 628, 690) },
});

// The Omni Throttle: the same grip laid over on VKB's adapter, so pushing it forward is
// the throttle. The trigger, B1 and the rapid-fire switch are on the far side of the head:
// their lines stop at its edge. The left-hand one, seen from its right.
const OMNI_AXES = { y: { name: 'Throttle' }, x: { name: 'Sideways' }, rz: { name: 'Twist', tag: 'RZ AXIS' }, z: { name: 'Base Wheel' } };

const GLADIATOR_OT_LEFT = gladiatorPhoto({
  alt: 'VKB Gladiator NXT EVO Omni Throttle, left hand',
  image: { src: 'assets/gladiator-ot-left.png', width: 818, height: 967, x: 514, y: 144, scale: 0.7 },
  top: 124,
  relabel: OMNI_AXES,
  sides: {
    left: ['btn4', 'rapid', 'trigger', 'y', 'x', 'rz', 'fx', 'sw1', 'z', 'en1'],
    right: ['a4', 'a3', 'a1', 'btn3', 'c1', 'btn5'],
  },
  at: {
    btn4: [596, 26],
    rapid: [584, 86],
    trigger: [566, 112],
    y: [400, 220],
    x: [330, 285],
    rz: [268, 352],
    fx: [220, 652],
    sw1: [118, 700],
    z: [150, 745],
    en1: [195, 785],
    a4: [624, 58],
    a3: [567, 157],
    a1: [625, 187],
    btn3: [575, 247],
    c1: [427, 305],
    btn5: [432, 368],
  },
  guides: {},
});

// The right-hand one, seen from its left: the same photo the other way round.
const GLADIATOR_OT_RIGHT = gladiatorPhoto({
  alt: 'VKB Gladiator NXT EVO Omni Throttle, right hand',
  image: { src: 'assets/gladiator-ot-right.png', width: 831, height: 967, x: 509, y: 144, scale: 0.7 },
  top: 124,
  relabel: OMNI_AXES,
  sides: {
    left: ['a4', 'a3', 'a1', 'btn3', 'c1', 'btn5'],
    right: ['btn4', 'rapid', 'trigger', 'y', 'x', 'rz', 'fx', 'en1', 'z', 'sw1'],
  },
  at: {
    a4: [138, 58],
    a3: [200, 160],
    a1: [130, 187],
    btn3: [190, 247],
    c1: [350, 300],
    btn5: [400, 370],
    btn4: [176, 26],
    rapid: [193, 86],
    trigger: [215, 112],
    y: [400, 205],
    x: [470, 265],
    rz: [545, 352],
    fx: [577, 640],
    en1: [702, 715],
    z: [655, 745],
    sw1: [592, 775],
  },
  guides: {},
});

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

// ─── VKB STECS Space Throttle Standard (Space grip, base and STEM) ───────────

// Seen from the front left corner: the STEM is nearest, the base behind it, and the grip's
// thumb controls face right. Nobody has published the grip's button numbers, so its
// buttons are listed by number under one label, with the POV hat: press one and its row
// lights. Where the brake and the laser sit on the grip isn't known either, so they share
// a label with its tilt. The STEM's 55 and 56 aren't labelled, as on the Modern Throttle,
// nor are the Rz and Slider that only some of these throttles report.
const STECS_SPACE = {
  alt: 'VKB STECS Space Throttle Standard with its STEM module, seen from the front left',
  dense: true,
  image: { src: 'assets/stecs-space.png', width: 953, height: 1079, x: 495, y: 140, scale: 0.64 },
  columns: {
    left: { edge: 450, anchor: 464, elbow: 520 },
    right: { edge: 1150, anchor: 1136, elbow: 1080 },
  },
  callouts: [
    ...stack('left', 92, [
      {
        id: 'gripaxes',
        name: 'Grip Axes',
        at: [450, 160],
        columns: 2,
        group: [
          { id: 'x', label: 'X', wide: true },
          { id: 'y', label: 'Y', wide: true },
          { id: 'rx', label: 'Brake', wide: true },
          { id: 'ry', label: 'Laser', wide: true },
        ],
      },
      { id: 'z', at: [465, 440], tag: 'LEVER' },
      {
        id: 'toggle',
        name: 'Toggle',
        tag: 'TGL',
        at: [272, 548],
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
        at: [312, 608],
        columns: 2,
        group: [
          { id: 'btn51', dir: 'left' },
          { id: 'btn52', dir: 'right' },
        ],
      },
      {
        id: 'flip',
        name: 'Flip Switch',
        at: [148, 605],
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
        at: [195, 696],
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
        at: [427, 688],
        columns: 2,
        group: leftToRight(
          labelled(['btn43', '1 Up'], ['btn46', '2 Up'], ['btn44', '1 In'], ['btn47', '2 In'], ['btn45', '1 Dn'], ['btn48', '2 Dn']),
        ),
      },
    ]),
    ...stack('right', 92, [
      {
        id: 'grip',
        name: 'Grip Buttons',
        tag: 'POV · B8–B34',
        at: [754, 152],
        columns: 2,
        group: [
          ...HAT_DIRECTIONS.map((dir) => ({ id: `hat1_${dir}`, dir })),
          ...Array.from({ length: 27 }, (_, i) => ({ id: `btn${i + 8}`, label: String(i + 8) })),
        ],
      },
      {
        id: 'base',
        name: 'Base',
        tag: 'ROTARY 1–5',
        at: [742, 505],
        columns: 2,
        group: labelled(['btn1', 'Dot'], ['btn2', 'Red'], ['btn3', '1'], ['btn4', '2'], ['btn5', '3'], ['btn6', '4'], ['btn7', '5']),
      },
      {
        id: 'stembuttons',
        name: 'STEM Buttons',
        at: [482, 782],
        columns: 2,
        group: labelled(
          ['btn35', 'A1'],
          ['btn36', 'A2'],
          ['btn37', 'C1'],
          ['btn38', 'B1'],
          ['btn39', 'B2'],
          ['btn40', 'B3'],
          ['btn41', 'B4'],
          ['btn42', 'B5'],
        ),
      },
    ]),
  ],
  guides: {},
};

// ─── Turtle Beach VelocityOne Flightstick ────────────────────────────────────

// Seen from straight above, so everything on the base is in view. The trigger is on the
// far side of the grip's head: its line stops at the head's top edge. The touchpad click
// and the Xbox and Share buttons aren't labelled, their button numbers aren't known yet.
const VELOCITYONE_FLIGHTSTICK = lower(30, {
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
});

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
const ORION2_THROTTLE = lower(24, {
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
});

// ─── Thrustmaster Sol-R (right and left sticks) ──────────────────────────────

// The two sticks have the same controls bar the hats, so one set of labels serves both.
// `pov` is the side the stick's POV hat is on (see solR in shared/devices.js): that hat's
// directions are the POV's, with its own push button, and the other hat is five buttons.
// Each photo says where every label points and in what order they stack down the sides;
// the order keeps the lines from crossing or running over another dot. The photo is the
// pilot's view, so the trigger and the grip button are on the front of the grip, out of
// sight: their dot sits on the grip's edge, on the side the lever sticks out. The left
// column lists each pair of controls the other way round (see leftToRight above).
const solrLabels = (side, pov) => {
  const pairs = (items) => (side === 'left' ? leftToRight(items) : items);
  const hat = (name, at, push) =>
    at === pov
      ? { name, tag: 'POV', columns: 2, group: [...HAT_DIRECTIONS.map((dir) => ({ id: `hat1_${dir}`, dir })), { id: `btn${push}`, dir: 'push' }] }
      : { name, columns: 2, group: pushHat(push) };
  return {
    lefthat: hat('Left Hat', 'left', 30),
    righthat: hat('Right Hat', 'right', 40),
    ministick: {
      name: 'Ministick',
      columns: 2,
      group: [{ id: 'rx', label: 'X', wide: true }, { id: 'ry', label: 'Y', wide: true }, { id: 'btn29', dir: 'push' }],
    },
    scroll: { name: 'Scroll', columns: 2, group: [{ id: 'btn37', dir: 'up' }, { id: 'btn38', dir: 'down' }, { id: 'btn36', dir: 'push' }] },
    lever: { name: 'Lever', columns: 2, group: pairs([{ id: 'btn26', dir: 'left' }, { id: 'btn27', dir: 'right' }]) },
    trigger: { name: 'Trigger', tag: 'FRONT', columns: 2, group: pairs(labelled(['btn24', '1st'], ['btn25', '2nd'])).concat(labelled(['btn28', 'Grip'])) },
    stick: {
      name: 'Stick',
      columns: 2,
      group: [{ id: 'x', label: 'X', wide: true }, { id: 'y', label: 'Y', wide: true }, { id: 'rz', label: 'Twist', wide: true }],
    },
    leftswitches: {
      name: 'Left Switches',
      columns: 2,
      group: pairs(labelled(['btn1', '1 Up'], ['btn3', '2 Up'], ['btn2', '1 Dn'], ['btn4', '2 Dn'])),
    },
    leftpads: { name: 'Left Pads', columns: 2, group: pairs(labelled(['btn5', '5'], ['btn6', '6'], ['btn7', '7'], ['btn8', '8'])) },
    knob: { name: 'Left Knob', columns: 2, group: [{ id: 'btn9', dir: 'right' }, { id: 'btn10', dir: 'left' }, { id: 'btn11', dir: 'push' }] },
    rightswitches: {
      name: 'Right Switches',
      columns: 2,
      group: pairs(labelled(['btn14', '1 Up'], ['btn12', '2 Up'], ['btn15', '1 Dn'], ['btn13', '2 Dn'])),
    },
    rightpads: { name: 'Right Pads', columns: 2, group: pairs(labelled(['btn17', '17'], ['btn16', '16'], ['btn19', '19'], ['btn18', '18'])) },
    rotary: { name: 'Rotary', columns: 2, group: labelled(['btn20', '1'], ['btn21', '2'], ['btn22', '3'], ['btn23', '4']) },
    z: {},
  };
};

// One stick's labels stacked down one side from `top`, each as [id, where it points on the photo].
const solr = (pov) => (side, top, entries) => stack(side, top, entries.map(([id, at]) => ({ id, ...solrLabels(side, pov)[id], at })));
const solrLeft = solr('left');
const solrRight = solr('right');

const SOL_R_COLUMNS = {
  left: { edge: 470, anchor: 484, elbow: 520 },
  right: { edge: 1130, anchor: 1116, elbow: 1080 },
};

// Motion guides over a Sol-R stick, from where its head, collar and thrust slot are on
// the photo: the stick's two axes beside the head, the twist as an arc around the collar,
// and the thrust lever along the arrows printed beside its slot.
const solrGuides = (image, { head: [left, right, top], collar, slot: [slotX, slotTop, slotBottom] }) => {
  const stage = ([x, y]) => [image.x + x * image.scale, image.y + y * image.scale];
  const [cx0] = stage([(left + right) / 2, 0]);
  const [, headTop] = stage([0, top]);
  const [headRight] = stage([right, 0]);
  const round = (n) => Math.round(n * 10) / 10;

  const [cx, cy] = stage(collar);
  const [rx, ry, a] = [72, 32, 0.25];
  const [ex, ey] = [rx * Math.cos(a), cy + ry * Math.sin(a)];
  const tilt = (Math.atan2(-ry * Math.cos(a), rx * Math.sin(a)) * 180) / Math.PI;
  const [tx, t0] = stage([slotX, slotTop]);
  const [, t1] = stage([slotX, slotBottom]);
  const [x0, x1, hy] = [cx0 - 86, cx0 + 86, headTop - 16];
  const [vx, v0, v1] = [headRight + 36, headTop + 45, headTop + 175];
  return {
    x: {
      path: `M ${round(x0)} ${round(hy)} L ${round(x1)} ${round(hy)}`,
      arrows: [
        [round(x0), round(hy), 180],
        [round(x1), round(hy), 0],
      ],
      point: (v) => [cx0 + v * 86, hy],
    },
    y: {
      path: `M ${round(vx)} ${round(v0)} L ${round(vx)} ${round(v1)}`,
      arrows: [
        [round(vx), round(v0), -90],
        [round(vx), round(v1), 90],
      ],
      point: (v) => [vx, (v0 + v1) / 2 - (v * (v1 - v0)) / 2],
    },
    rz: {
      path: `M ${round(cx - ex)} ${round(ey)} A ${rx} ${ry} 0 0 0 ${round(cx + ex)} ${round(ey)}`,
      arrows: [
        [round(cx - ex), round(ey), round(-180 - tilt)],
        [round(cx + ex), round(ey), round(tilt)],
      ],
      point: (v) => {
        const t = Math.PI / 2 - v * (Math.PI / 2 - a);
        return [cx + rx * Math.cos(t), cy + ry * Math.sin(t)];
      },
    },
    z: {
      path: `M ${round(tx)} ${round(t1)} L ${round(tx)} ${round(t0)}`,
      arrows: [
        [round(tx), round(t1), 90],
        [round(tx), round(t0), -90],
      ],
      point: (v) => [tx, (t0 + t1) / 2 - (v * (t1 - t0)) / 2],
    },
  };
};

const SOLR_LEFT_IMAGE = { src: 'assets/solr-left.png', width: 666, height: 948, x: 539, y: 100, scale: 0.78 };
const SOLR_LEFT = {
  alt: 'Thrustmaster Sol-R left stick, seen from behind',
  dense: true,
  image: SOLR_LEFT_IMAGE,
  columns: SOL_R_COLUMNS,
  callouts: [
    ...solrLeft('left', 88, [
      ['ministick', [335, 52]],
      ['lefthat', [267, 74]],
      ['btn35', [275, 134]],
      ['scroll', [335, 181]],
      ['leftswitches', [123, 630]],
      ['leftpads', [121, 702]],
      ['knob', [113, 744]],
      ['z', [338, 761]],
    ]),
    ...solrLeft('right', 88, [
      ['righthat', [421, 74]],
      ['btn39', [390, 134]],
      ['lever', [421, 276]],
      ['stick', [315, 356]],
      ['trigger', [392, 375]],
      ['rightswitches', [552, 633]],
      ['rightpads', [556, 704]],
      ['rotary', [564, 753]],
    ]),
  ],
  guides: solrGuides(SOLR_LEFT_IMAGE, { head: [207, 454.5, 10.5], collar: [335.3, 622.5], slot: [214.5, 745.5, 835.5] }),
};

// Its grip is the left stick's the other way round. The lower left of its base is hidden
// behind the left stick in the photo, so the cut-out borrows that corner from the left
// stick's base, which is the same.
const SOLR_RIGHT_IMAGE = { src: 'assets/solr-right.png', width: 672, height: 963, x: 538, y: 104, scale: 0.78 };
const SOLR_RIGHT = {
  alt: 'Thrustmaster Sol-R right stick, seen from behind',
  dense: true,
  image: SOLR_RIGHT_IMAGE,
  columns: SOL_R_COLUMNS,
  callouts: [
    ...solrRight('left', 88, [
      ['ministick', [333, 60]],
      ['lefthat', [247, 75]],
      ['btn35', [273, 131]],
      ['lever', [250, 278]],
      ['trigger', [276, 375]],
      ['leftswitches', [120, 630]],
      ['leftpads', [116, 702]],
      ['knob', [109, 747]],
    ]),
    ...solrRight('right', 88, [
      ['righthat', [413, 75]],
      ['btn39', [387, 131]],
      ['scroll', [331, 174]],
      ['stick', [311, 353]],
      ['rightswitches', [549, 631]],
      ['rightpads', [554, 704]],
      ['rotary', [560, 758]],
      ['z', [335, 762]],
    ]),
  ],
  guides: solrGuides(SOLR_RIGHT_IMAGE, { head: [213, 453, 3], collar: [336, 624], slot: [207, 745.5, 835.5] }),
};

// ─── Logitech X56 (stick and throttle) ───────────────────────────────────────

// A hat that reports as four buttons, clockwise from `first`, its "up".
const fourWay = (first) => HAT_DIRECTIONS.map((dir, i) => ({ id: `btn${first + i}`, dir }));

const X56_COLUMNS = {
  left: { edge: 450, anchor: 464, elbow: 520 },
  right: { edge: 1150, anchor: 1136, elbow: 1080 },
};

// Seen from the pilot's seat, a little to the left. The trigger, the D button and the
// pinkie lever are on the front of the grip, out of sight: the trigger's edge shows beside
// the grip, and the other two point at the grip's edge where they sit behind it.
const X56_STICK = lower(25, {
  alt: 'Logitech X56 stick, seen from behind',
  dense: true,
  image: { src: 'assets/x56-stick.png', width: 846, height: 1115, x: 530, y: 104, scale: 0.64 },
  columns: X56_COLUMNS,
  callouts: [
    ...stack('left', 120, [
      { id: 'btn2', at: [485, 22] },
      { id: 'hat1', tag: 'POV', columns: 2, at: [425, 75], group: HAT_DIRECTIONS.map((dir) => ({ id: `hat1_${dir}`, dir })) },
      {
        id: 'cstick',
        name: 'C Stick',
        columns: 2,
        at: [402, 265],
        group: [{ id: 'rx', label: 'X', wide: true }, { id: 'ry', label: 'Y', wide: true }, { id: 'btn4', dir: 'push' }],
      },
      {
        id: 'stick',
        name: 'Stick',
        columns: 2,
        at: [475, 320],
        group: [{ id: 'x', label: 'Roll', wide: true }, { id: 'y', label: 'Pitch', wide: true }, { id: 'rz', label: 'Yaw', wide: true }],
      },
    ]),
    ...stack('right', 120, [
      { id: 'h1', name: 'H1 Hat', columns: 2, at: [552, 42], group: fourWay(7) },
      { id: 'btn3', at: [666, 127] },
      { id: 'h2', name: 'H2 Hat', columns: 2, at: [517, 117], group: fourWay(11) },
      { id: 'btn1', tag: 'FRONT', at: [557, 245] },
      { id: 'btn5', tag: 'FRONT', at: [540, 350] },
      { id: 'btn6', tag: 'FRONT', at: [520, 450] },
    ]),
  ],
  guides: {
    x: {
      path: 'M 777 90 L 949 90',
      arrows: [
        [777, 90, 180],
        [949, 90, 0],
      ],
      point: (v) => [863 + v * 86, 90],
    },
    y: {
      path: 'M 1010 150 L 1010 280',
      arrows: [
        [1010, 150, -90],
        [1010, 280, 90],
      ],
      point: (v) => [1010, 215 - v * 65],
    },
    // An arc under the gimbal ring; its ends stop short of the ellipse's sides so the
    // arrowheads angle along the curve.
    rz: {
      path: 'M 699.4 548.4 A 110 46 0 0 0 912.6 548.4',
      arrows: [
        [699.4, 548.4, -121.5],
        [912.6, 548.4, -58.5],
      ],
      point: (v) => {
        const a = Math.PI / 2 - v * (Math.PI / 2 - 0.25);
        return [806 + 110 * Math.cos(a), 537 + 46 * Math.sin(a)];
      },
    },
  },
});

// Seen from behind and to the right, so forward is up and to the right, and the left lever
// is the far half of the handle. The H and I buttons, the K1 rocker and the scroll wheel
// are on the far side of the handle, out of sight: they point at its edge. Each toggle on
// the left of the base is two SW numbers, up then down. On the two thumb hats, right is
// forward.
const X56_THROTTLE = lower(14, {
  alt: 'Logitech X56 throttle, seen from behind',
  dense: true,
  image: { src: 'assets/x56-throttle.png', width: 970, height: 816, x: 480, y: 215, scale: 0.66 },
  columns: X56_COLUMNS,
  callouts: [
    ...stack('left', 120, [
      {
        id: 'throttles',
        name: 'Throttles',
        columns: 2,
        at: [455, 150],
        group: [{ id: 'x', label: 'Left', wide: true }, { id: 'y', label: 'Right', wide: true }],
      },
      { id: 'pinkie', name: 'Pinkie Buttons', tag: 'FRONT', columns: 2, at: [312, 180], group: leftToRight(labelled(['btn5', 'H'], ['btn4', 'I'])) },
      { id: 'k1', name: 'K1 Rocker', tag: 'FRONT', columns: 2, at: [306, 222], group: [{ id: 'btn28', dir: 'up' }, { id: 'btn29', dir: 'down' }] },
      { id: 'scroll', name: 'Scroll Wheel', tag: 'FRONT', columns: 2, at: [303, 263], group: [{ id: 'btn30', dir: 'up' }, { id: 'btn31', dir: 'down' }] },
      { id: 'btn1', at: [590, 262] },
      {
        id: 'ministick',
        name: 'Ministick',
        columns: 2,
        at: [570, 320],
        group: [{ id: 'rx', label: 'X', wide: true }, { id: 'ry', label: 'Y', wide: true }, { id: 'btn32', dir: 'push' }],
      },
      { id: 'mode', name: 'Mode', columns: 2, at: [105, 390], group: leftToRight(labelled(['btn34', 'M1'], ['btn35', 'M2'], ['btn36', 'S1'])) },
      {
        id: 'switches',
        name: 'Switches',
        columns: 2,
        at: [325, 468],
        group: leftToRight(labelled(['btn6', 'SW 1'], ['btn7', 'SW 2'], ['btn8', 'SW 3'], ['btn9', 'SW 4'], ['btn10', 'SW 5'], ['btn11', 'SW 6'])),
      },
    ]),
    ...stack('right', 88, [
      { id: 'frotary', name: 'F Rotary', columns: 2, at: [725, 45], group: [{ id: 'z', wide: true }, { id: 'btn2', dir: 'push' }] },
      { id: 'btn33', at: [648, 178] },
      { id: 'grotary', name: 'G Rotary', columns: 2, at: [735, 225], group: [{ id: 'rz', wide: true }, { id: 'btn3', dir: 'push' }] },
      { id: 'h3', name: 'H3 Hat', columns: 2, at: [672, 270], group: fourWay(20) },
      { id: 'h4', name: 'H4 Hat', columns: 2, at: [652, 328], group: fourWay(24) },
      {
        id: 'toggles',
        name: 'Toggles',
        columns: 2,
        at: [755, 398],
        group: labelled(
          ['btn12', '1 Up'],
          ['btn13', '1 Dn'],
          ['btn14', '2 Up'],
          ['btn15', '2 Dn'],
          ['btn16', '3 Up'],
          ['btn17', '3 Dn'],
          ['btn18', '4 Up'],
          ['btn19', '4 Dn'],
        ),
      },
      {
        id: 'rotaries',
        name: 'Base Rotaries',
        columns: 2,
        at: [592, 474],
        group: [{ id: 'slider', label: 'RTY 3', wide: true }, { id: 'dial', label: 'RTY 4', wide: true }],
      },
    ]),
  ],
  // Along the scales printed beside each lever's slot.
  guides: {
    x: {
      path: 'M 693.2 497.3 L 768.8 448.7',
      arrows: [
        [693.2, 497.3, 147.3],
        [768.8, 448.7, -32.7],
      ],
      point: (v) => [731 + v * 37.8, 473 - v * 24.3],
    },
    y: {
      path: 'M 751.2 518.8 L 826.8 470.2',
      arrows: [
        [751.2, 518.8, 147.3],
        [826.8, 470.2, -32.7],
      ],
      point: (v) => [789 + v * 37.8, 494.5 - v * 24.3],
    },
  },
});

// ─── Turtle Beach VelocityOne Flightdeck (stick and throttle) ────────────────

// One of a stick's hat switches: `hat` is hat1, hat2…
const hatSwitch = (hat) => HAT_DIRECTIONS.map((dir) => ({ id: `${hat}_${dir}`, dir }));

// A knob that sends a button when pushed, then one each way it turns: `push`, left, right.
const pushKnob = (push) => [
  { id: `btn${push + 1}`, dir: 'left' },
  { id: `btn${push + 2}`, dir: 'right' },
  { id: `btn${push}`, dir: 'push' },
];

// Seen from behind, above and to the right. The trigger, the shaft button and the pinkie
// lever are on the front of the grip, out of sight: each points at the grip's left edge
// where it sits behind it. The Fire button's touchpad is a mouse, and the small switch
// beside it and the HUD NAV button aren't reported, so none of them has a label.
const FLIGHTDECK_STICK = lower(10, {
  alt: 'Turtle Beach VelocityOne Flightdeck stick, seen from behind',
  dense: true,
  image: { src: 'assets/flightdeck-stick.png', width: 1018, height: 1258, x: 490, y: 108, scale: 0.61 },
  columns: X56_COLUMNS,
  callouts: [
    ...stack('left', 88, [
      { id: 'trigger', name: 'Trigger', tag: 'FRONT', at: [486, 168], columns: 2, group: leftToRight(labelled(['btn28', '1st'], ['btn2', '2nd'])) },
      {
        id: 'pov',
        name: 'Analog POV',
        at: [512, 222],
        columns: 2,
        group: [{ id: 'rx', label: 'X', wide: true }, { id: 'ry', label: 'Y', wide: true }, { id: 'btn3', dir: 'push' }],
      },
      { id: 'dpad', name: 'D-Pad', at: [460, 345], columns: 2, group: fourWay(4) },
      { id: 'btn9', tag: 'FRONT', at: [428, 475] },
      { id: 'gear', name: 'Gear Lever', at: [365, 600], columns: 2, group: leftToRight(labelled(['btn23', 'Fwd'], ['btn24', 'Back'])) },
      { id: 'pinkie', name: 'Pinkie Lever', tag: 'FRONT', at: [458, 610], columns: 2, group: [{ id: 'rz', wide: true }, { id: 'btn10', label: 'Full' }] },
      {
        id: 'switches',
        name: 'Switches',
        at: [198, 940],
        columns: 2,
        group: leftToRight(labelled(['btn16', '1 Up'], ['btn17', '1 Dn'], ['btn18', '2 Up'], ['btn19', '2 Dn'], ['btn20', '3 Up'], ['btn21', '3 Dn'])),
      },
      {
        id: 'shortcuts',
        name: 'Front Buttons',
        at: [330, 1105],
        columns: 2,
        group: leftToRight(labelled(['btn22', 'B22'], ['btn31', 'B31'], ['btn32', 'B32'], ['btn33', 'B33'])),
      },
    ]),
    ...stack('right', 88, [
      { id: 'hat1', tag: 'POV', at: [575, 172], columns: 2, group: hatSwitch('hat1') },
      { id: 'hat2', at: [612, 250], columns: 2, group: hatSwitch('hat2') },
      { id: 'btn1', at: [542, 315] },
      {
        id: 'wheel',
        name: 'Thumb Wheel',
        at: [525, 398],
        columns: 2,
        group: [{ id: 'slider', wide: true }, { id: 'btn29', dir: 'up' }, { id: 'btn30', dir: 'down' }, { id: 'btn8', dir: 'push' }],
      },
      {
        id: 'stick',
        name: 'Stick',
        at: [530, 560],
        columns: 2,
        group: [{ id: 'x', label: 'Roll', wide: true }, { id: 'y', label: 'Pitch', wide: true }, { id: 'z', label: 'Yaw', wide: true }],
      },
      { id: 'knob', name: 'Rotary Knob', at: [848, 735], columns: 2, group: [{ id: 'btn25', dir: 'left' }, { id: 'btn26', dir: 'right' }, { id: 'btn27', dir: 'down' }] },
      {
        id: 'bank',
        name: 'Button Bank',
        at: [590, 1045],
        columns: 2,
        group: labelled(['btn11', 'B11'], ['btn12', 'B12'], ['btn13', 'B13'], ['btn14', 'B14'], ['btn15', 'B15']),
      },
    ]),
  ],
  guides: {
    x: {
      path: 'M 771 90 L 941 90',
      arrows: [
        [771, 90, 180],
        [941, 90, 0],
      ],
      point: (v) => [856 + v * 85, 90],
    },
    y: {
      path: 'M 1000 150 L 1000 280',
      arrows: [
        [1000, 150, -90],
        [1000, 280, 90],
      ],
      point: (v) => [1000, 215 - v * 65],
    },
    // An arc under the lit ring around the gimbal.
    z: {
      path: 'M 683.7 652.1 A 118 54 0 0 0 912.3 652.1',
      arrows: [
        [683.7, 652.1, -119.2],
        [912.3, 652.1, -60.8],
      ],
      point: (v) => {
        const a = Math.PI / 2 - v * (Math.PI / 2 - 0.25);
        return [798 + 118 * Math.cos(a), 638.7 + 54 * Math.sin(a)];
      },
    },
  },
});

// The buttons a throttle lever presses along its travel, from the front of it to the
// back: `max` and the next are its two ends, `forward` and the next two the detents between.
const detents = (max, forward) =>
  labelled([`btn${max}`, 'Max'], [`btn${forward}`, 'Fwd'], [`btn${forward + 1}`, 'Mid'], [`btn${forward + 2}`, 'Back'], [`btn${max + 1}`, 'Min']);

// Seen from the pilot's left: the pilot sits bottom left and forward is up and to the
// right, so the left throttle is the far half of the handle. The front hat, the finger
// wheel, the front button and both rockers are on the front of the handle, out of sight:
// they point at its top edge, above where each one sits, and the first two lines come in
// over the handle to keep clear of the other dots. A label on the left that starts with a
// lever's own row already lists its pairs left to right. The touch display has no label.
const FLIGHTDECK_THROTTLE = {
  alt: 'Turtle Beach VelocityOne Flightdeck throttle, seen from the left',
  dense: true,
  image: { src: 'assets/flightdeck-throttle.png', width: 1025, height: 871, x: 472, y: 210, scale: 0.64 },
  columns: X56_COLUMNS,
  callouts: [
    ...stack('left', 88, [
      { id: 'fronthat', name: 'Front Hat', tag: 'FRONT', at: [710, 72], via: [[902, 188]], columns: 2, group: fourWay(7) },
      {
        id: 'fingerwheel',
        name: 'Finger Wheel',
        tag: 'FRONT',
        at: [640, 50],
        via: [[856, 200]],
        columns: 2,
        group: [{ id: 'dial', wide: true }, { id: 'btn40', dir: 'up' }, { id: 'btn41', dir: 'down' }],
      },
      {
        id: 'rockers',
        name: 'Rockers',
        tag: 'FRONT',
        at: [385, 18],
        columns: 2,
        group: leftToRight(labelled(['btn12', '1 Up'], ['btn14', '2 Up'], ['btn13', '1 Dn'], ['btn15', '2 Dn'])),
      },
      { id: 'btn11', at: [590, 36] },
      {
        id: 'flap',
        name: 'Flap Lever',
        at: [125, 478],
        columns: 2,
        group: [{ id: 'slider', wide: true }, ...labelled(['btn16', 'Fwd'], ['btn17', 'Back'])],
      },
      {
        id: 'leftthrottle',
        name: 'Left Throttle',
        at: [395, 425],
        columns: 2,
        group: [{ id: 'x', wide: true }, ...detents(19, 34)],
      },
      {
        id: 'rightthrottle',
        name: 'Right Throttle',
        at: [565, 470],
        columns: 2,
        group: [{ id: 'y', wide: true }, ...detents(21, 37)],
      },
    ]),
    ...stack('right', 88, [
      { id: 'rz', at: [785, 112] },
      {
        id: 'pov',
        name: 'Analog POV',
        at: [805, 180],
        columns: 2,
        group: [{ id: 'rx', label: 'X', wide: true }, { id: 'ry', label: 'Y', wide: true }, { id: 'btn1', dir: 'push' }],
      },
      { id: 'hat1', tag: 'POV', at: [735, 290], columns: 2, group: hatSwitch('hat1') },
      {
        id: 'side',
        name: 'Side Buttons',
        tag: 'SLIDE SWITCH · B2–B4',
        at: [692, 333],
        columns: 2,
        group: labelled(['btn5', 'SW L'], ['btn6', 'SW R'], ['btn2', 'B2'], ['btn3', 'B3'], ['btn4', 'B4']),
      },
      { id: 'btn18', at: [880, 410] },
      {
        id: 'upperknob',
        name: 'Upper Knob',
        tag: 'OUTER · INNER',
        at: [785, 495],
        columns: 2,
        group: [
          { id: 'z', wide: true },
          { id: 'btn24', dir: 'left', label: 'O' },
          { id: 'btn25', dir: 'right', label: 'O' },
          { id: 'btn26', dir: 'left', label: 'I' },
          { id: 'btn27', dir: 'right', label: 'I' },
          { id: 'btn23', dir: 'push' },
        ],
      },
      { id: 'middleknob', name: 'Middle Knob', at: [720, 590], columns: 2, group: pushKnob(28) },
      { id: 'lowerknob', name: 'Lower Knob', at: [655, 665], columns: 2, group: pushKnob(31) },
    ]),
  ],
  // Along the lit strip beside each throttle's slot, and the scale beside the flap lever's;
  // forward is up and to the right.
  guides: {
    x: {
      path: 'M 684.5 499.3 L 720.3 441.7',
      arrows: [
        [684.5, 499.3, 121.9],
        [720.3, 441.7, -58.1],
      ],
      point: (v) => [702.4 + v * 17.9, 470.5 - v * 28.8],
    },
    y: {
      path: 'M 792 525.5 L 827.2 467.3',
      arrows: [
        [792, 525.5, 121.2],
        [827.2, 467.3, -58.8],
      ],
      point: (v) => [809.6 + v * 17.6, 496.4 - v * 29.1],
    },
    slider: {
      path: 'M 561.6 594 L 598.7 544.1',
      arrows: [
        [561.6, 594, 126.6],
        [598.7, 544.1, -53.4],
      ],
      point: (v) => [580.15 + v * 18.55, 569.05 - v * 24.95],
    },
  },
};

// ─── Turtle Beach VelocityOne Flightstick II ─────────────────────────────────

// Seen from behind and to the right: the pilot sits bottom left and forward is up and to
// the right. The bumper and the trigger are on the front of the head, out of sight: they
// point at its far edge. The dial sends a different set of three buttons in each of its
// three modes: turned up, turned down and pressed. Pressing the H1 hat isn't reported.
const VELOCITYONE_FLIGHTSTICK_2 = lower(20, {
  alt: 'Turtle Beach VelocityOne Flightstick II, seen from behind',
  dense: true,
  image: { src: 'assets/velocityone-flightstick-2.png', width: 915, height: 1170, x: 510, y: 100, scale: 0.633 },
  columns: X56_COLUMNS,
  callouts: [
    ...stack('left', 88, [
      {
        id: 'pov',
        name: 'Analog POV',
        tag: 'P1',
        at: [516, 152],
        columns: 2,
        group: [{ id: 'rx', label: 'X', wide: true }, { id: 'ry', label: 'Y', wide: true }, { id: 'btn18', dir: 'push' }],
      },
      { id: 'stickbuttons', name: 'Stick Buttons', at: [539, 213], columns: 2, group: leftToRight(labelled(['btn23', 'Left'], ['btn24', 'Right'], ['btn25', 'Mid'])) },
      {
        id: 'wheel',
        name: 'Scroll Wheel',
        tag: 'AXIS OR BUTTONS',
        at: [522, 282],
        columns: 2,
        group: [{ id: 'dial', wide: true }, { id: 'btn19', dir: 'up' }, { id: 'btn20', dir: 'down' }, { id: 'btn21', dir: 'push' }],
      },
      {
        id: 'leftlever',
        name: 'Left Lever',
        tag: 'B5 · B6',
        at: [365, 563],
        columns: 2,
        group: [{ id: 'rz', wide: true }, { id: 'btn5', dir: 'up' }, { id: 'btn6', dir: 'down' }],
      },
      {
        id: 'leftbuttons',
        name: 'Left Buttons',
        at: [201, 789],
        columns: 2,
        group: leftToRight(labelled(['btn27', 'A'], ['btn28', 'B'], ['btn29', 'X'], ['btn30', 'Y'])),
      },
      {
        id: 'menubuttons',
        name: 'Menu Buttons',
        at: [114, 917],
        columns: 2,
        group: leftToRight(labelled(['btn31', 'Xbox'], ['btn32', 'View'], ['btn33', 'Share'], ['btn34', 'Menu'])),
      },
    ]),
    ...stack('right', 88, [
      { id: 'hat1', tag: 'H1', at: [591, 165], columns: 2, group: hatSwitch('hat1') },
      { id: 'btn22', tag: 'FRONT', at: [668, 158] },
      { id: 'btn26', tag: 'FRONT', at: [644, 213] },
      {
        id: 'stick',
        name: 'Stick',
        at: [492, 458],
        columns: 2,
        group: [{ id: 'x', label: 'Roll', wide: true }, { id: 'y', label: 'Pitch', wide: true }, { id: 'z', label: 'Yaw', wide: true }],
      },
      {
        id: 'rightlever',
        name: 'Right Lever',
        tag: 'B7 · B8',
        at: [816, 695],
        columns: 2,
        group: [{ id: 'slider', wide: true }, { id: 'btn7', dir: 'up' }, { id: 'btn8', dir: 'down' }],
      },
      {
        id: 'autopilot',
        name: 'Autopilot Dial',
        tag: 'MODES 1–3',
        at: [344, 896],
        columns: 2,
        group: [
          { id: 'btn9', dir: 'up', label: '1' },
          { id: 'btn10', dir: 'down', label: '1' },
          { id: 'btn12', dir: 'up', label: '2' },
          { id: 'btn13', dir: 'down', label: '2' },
          { id: 'btn15', dir: 'up', label: '3' },
          { id: 'btn16', dir: 'down', label: '3' },
          { id: 'btn11', dir: 'push', label: '1' },
          { id: 'btn14', dir: 'push', label: '2' },
          { id: 'btn17', dir: 'push', label: '3' },
        ],
      },
      { id: 'rightbuttons', name: 'Right Buttons', at: [590, 963], columns: 2, group: labelled(['btn1', 'B1'], ['btn2', 'B2'], ['btn3', 'B3'], ['btn4', 'B4']) },
    ]),
  ],
  guides: {
    x: {
      path: 'M 800 84 L 960 84',
      arrows: [
        [800, 84, 180],
        [960, 84, 0],
      ],
      point: (v) => [880 + v * 80, 84],
    },
    y: {
      path: 'M 985 130 L 985 260',
      arrows: [
        [985, 130, -90],
        [985, 260, 90],
      ],
      point: (v) => [985, 195 - v * 65],
    },
    // An arc under the light ring around the stick's base.
    z: {
      path: 'M 706.5 617.9 A 112 56 0 0 0 923.5 617.9',
      arrows: [
        [706.5, 617.9, -117],
        [923.5, 617.9, -63],
      ],
      point: (v) => {
        const a = Math.PI / 2 - v * (Math.PI / 2 - 0.25);
        return [815 + 112 * Math.cos(a), 604 + 56 * Math.sin(a)];
      },
    },
    // Along the scale printed beside each lever's slot; forward is up and to the right.
    rz: {
      path: 'M 746.5 540.8 L 782.7 508.5',
      arrows: [
        [746.5, 540.8, 138.2],
        [782.7, 508.5, -41.8],
      ],
      point: (v) => [764.6 + v * 18.1, 524.65 - v * 16.15],
    },
    slider: {
      path: 'M 946.1 592.1 L 987.9 552.2',
      arrows: [
        [946.1, 592.1, 136.3],
        [987.9, 552.2, -43.7],
      ],
      point: (v) => [967 + v * 20.9, 572.15 - v * 19.95],
    },
  },
});

// ─── Turtle Beach VelocityOne Dual Throttle ──────────────────────────────────

// Seen from behind and to the right: the pilot sits bottom left and forward is up and to
// the right, so the left throttle is the far half of the handle. The front hat, the finger
// wheel and the two finger buttons are on the front of the handle, out of sight: they
// point at its top edge, above where each one sits. The throttle lock on the back of the
// handle isn't reported, so it has no label.
const VELOCITYONE_DUAL_THROTTLE = {
  alt: 'Turtle Beach VelocityOne Dual Throttle, seen from behind',
  dense: true,
  image: { src: 'assets/velocityone-dual-throttle.png', width: 1211, height: 902, x: 470, y: 240, scale: 0.545 },
  columns: X56_COLUMNS,
  callouts: [
    ...stack('left', 210, [
      { id: 'fingerbuttons', name: 'Finger Buttons', tag: 'FRONT', at: [535, 30], columns: 2, group: labelled(['btn8', 'B8'], ['btn9', 'B9']) },
      {
        id: 'throttles',
        name: 'Throttles',
        tag: 'DETENTS',
        at: [540, 150],
        columns: 2,
        group: [
          { id: 'x', label: 'Left', wide: true },
          { id: 'y', label: 'Right', wide: true },
          ...leftToRight(labelled(['btn24', 'L Up'], ['btn25', 'L Dn'], ['btn26', 'R Up'], ['btn27', 'R Dn'])),
        ],
      },
      {
        id: 'toggles',
        name: 'Toggles',
        at: [375, 525],
        columns: 2,
        group: leftToRight(labelled(['btn15', '1 Up'], ['btn16', '1 Dn'], ['btn17', '2 Up'], ['btn18', '2 Dn'], ['btn19', '3 Up'], ['btn20', '3 Dn'])),
      },
      { id: 'basebuttons', name: 'Base Buttons', at: [335, 590], columns: 2, group: leftToRight(labelled(['btn12', 'B12'], ['btn13', 'B13'], ['btn14', 'B14'])) },
      { id: 'basedial', name: 'Dial', at: [567, 598], columns: 2, group: [{ id: 'btn21', dir: 'up' }, { id: 'btn22', dir: 'down' }, { id: 'btn23', dir: 'push' }] },
    ]),
    ...stack('right', 121, [
      {
        id: 'fingerwheel',
        name: 'Finger Wheel',
        tag: 'FRONT',
        at: [630, 14],
        columns: 2,
        group: [{ id: 'dial', wide: true }, { id: 'btn5', dir: 'up' }, { id: 'btn6', dir: 'down' }, { id: 'btn7', dir: 'push' }],
      },
      { id: 'hat2', tag: 'FRONT', at: [700, 12], columns: 2, group: hatSwitch('hat2') },
      { id: 'rz', at: [952, 98] },
      { id: 'hat1', tag: 'H1', at: [912, 135], columns: 2, group: hatSwitch('hat1') },
      {
        id: 'pov',
        name: 'Analog POV',
        tag: 'P1',
        at: [789, 157],
        columns: 2,
        group: [{ id: 'rx', label: 'X', wide: true }, { id: 'ry', label: 'Y', wide: true }, { id: 'btn1', dir: 'push' }],
      },
      { id: 'thumbbuttons', name: 'Thumb Buttons', at: [865, 292], columns: 2, group: labelled(['btn2', 'B2'], ['btn3', 'B3'], ['btn4', 'B4']) },
      { id: 'lever', name: 'Small Lever', at: [745, 505], columns: 2, group: [{ id: 'z', wide: true }, { id: 'btn10', dir: 'up' }, { id: 'btn11', dir: 'down' }] },
    ]),
  ],
  // Along the lit strip beside each throttle's slot, and the scale beside the small lever's;
  // forward is up and to the right.
  guides: {
    x: {
      path: 'M 701.6 467.8 L 737.1 439.5',
      arrows: [
        [701.6, 467.8, 141.4],
        [737.1, 439.5, -38.6],
      ],
      point: (v) => [719.35 + v * 17.75, 453.65 - v * 14.15],
    },
    y: {
      path: 'M 818.8 491.2 L 850.4 465.6',
      arrows: [
        [818.8, 491.2, 141],
        [850.4, 465.6, -39],
      ],
      point: (v) => [834.6 + v * 15.8, 478.4 - v * 12.8],
    },
    z: {
      path: 'M 904.9 617.1 L 934.3 584.4',
      arrows: [
        [904.9, 617.1, 132],
        [934.3, 584.4, -48],
      ],
      point: (v) => [919.6 + v * 14.7, 600.75 - v * 16.35],
    },
  },
};

// ─── WINCTRL URSA MINOR Combat (joystick and throttle) ───────────────────────

// Seen from behind and to the right: the pilot sits bottom left and forward is up and to
// the right. The trigger and the paddle above it are on the front of the grip, peeking out
// beside it; the pinkie button, low on the front, is out of sight and points at the grip's
// edge. Each cluster of base buttons has one label, the left one mostly hidden behind the
// slider's hump.
const URSA_MINOR_COMBAT_STICK = {
  alt: 'WINCTRL URSA MINOR Combat Joystick, seen from behind',
  dense: true,
  image: { src: 'assets/ursa-minor-combat-stick.png', width: 943, height: 1420, x: 551, y: 100, scale: 0.53 },
  columns: X56_COLUMNS,
  callouts: [
    ...stack('left', 88, [
      { id: 'btn20', at: [466, 85] },
      {
        id: 'ministick',
        name: 'Ministick',
        tag: 'ANALOG OR BUTTONS',
        at: [436, 198],
        columns: 2,
        group: [{ id: 'rx', label: 'X', wide: true }, { id: 'ry', label: 'Y', wide: true }, ...fourWay(45), { id: 'btn34', dir: 'push' }],
      },
      { id: 'lowerhat', name: 'Lower Hat', at: [539, 222], columns: 2, group: pushHat(29) },
      {
        id: 'griphat',
        name: 'Grip Hat',
        at: [396, 435],
        columns: 2,
        group: [
          { id: 'btn43', dir: 'up' },
          { id: 'btn44', dir: 'right' },
          { id: 'btn41', dir: 'down' },
          { id: 'btn42', dir: 'left' },
          { id: 'btn40', dir: 'push' },
        ],
      },
      {
        id: 'leftbuttons',
        name: 'Base Buttons',
        tag: 'LEFT',
        at: [146, 930],
        columns: 2,
        group: leftToRight(labelled(['btn1', 'B1'], ['btn2', 'B2'], ['btn3', 'B3'], ['btn4', 'B4'], ['btn5', 'B5'], ['btn6', 'B6'], ['btn7', 'B7'])),
      },
      { id: 'slider', at: [156, 1195] },
    ]),
    ...stack('right', 88, [
      { id: 'hat1', tag: 'POV', at: [554, 98], columns: 2, group: hatSwitch('hat1') },
      { id: 'btn22', at: [654, 133] },
      {
        id: 'sidehat',
        name: 'Side Hat',
        at: [854, 208],
        columns: 2,
        group: [
          { id: 'btn27', dir: 'up' },
          { id: 'btn24', dir: 'right' },
          { id: 'btn25', dir: 'down' },
          { id: 'btn26', dir: 'left' },
          { id: 'btn23', dir: 'push' },
        ],
      },
      { id: 'btn28', at: [636, 242] },
      {
        id: 'trigger',
        name: 'Trigger',
        tag: 'TWO STAGE · PADDLE',
        at: [681, 355],
        columns: 2,
        group: [...labelled(['btn37', '1st'], ['btn38', '2nd']), { id: 'btn35', dir: 'up' }, { id: 'btn36', dir: 'down' }],
      },
      { id: 'btn39', tag: 'FRONT', at: [649, 750] },
      {
        id: 'stick',
        name: 'Stick',
        at: [481, 900],
        columns: 2,
        group: [{ id: 'x', label: 'Roll', wide: true }, { id: 'y', label: 'Pitch', wide: true }, { id: 'z', label: 'Yaw', wide: true }],
      },
      {
        id: 'rightbuttons',
        name: 'Base Buttons',
        tag: 'RIGHT',
        at: [741, 1115],
        columns: 2,
        group: labelled(['btn8', 'B8'], ['btn9', 'B9'], ['btn10', 'B10'], ['btn11', 'B11'], ['btn12', 'B12'], ['btn13', 'B13'], ['btn14', 'B14']),
      },
    ]),
  ],
  guides: {
    x: across(760, 920, 84),
    y: upDown(1010, 300, 440),
    // An arc under the grip's collar, around the lit ring.
    z: {
      path: 'M 704.5 540.4 A 112 34 0 0 0 921.5 540.4',
      arrows: [
        [704.5, 540.4, -130.1],
        [921.5, 540.4, -49.9],
      ],
      point: (v) => {
        const a = Math.PI / 2 - v * (Math.PI / 2 - 0.25);
        return [813 + 112 * Math.cos(a), 532 + 34 * Math.sin(a)];
      },
    },
    // Up the slider's slot, towards MAX.
    slider: {
      path: 'M 680.9 728.1 L 710 655.4',
      arrows: [
        [680.9, 728.1, 111.8],
        [710, 655.4, -68.2],
      ],
      point: (v) => [695.45 + v * 14.55, 691.75 - v * 36.35],
    },
  },
};

// Seen from behind and to the right, like the stick: the pilot sits bottom left and forward
// is up and to the right. The right handle's end, under the thumb, faces the camera. The
// ministick, the finger wheel and the two finger buttons are on the front of the handles
// and the toggle is on the left handle's far end: all out of sight, they point at the
// handles' top edge above where each one sits. The ministick and the wheel come in from
// the right, as lines from the left to that edge would cross. The labels on the right are
// in the order that keeps their lines from crossing. The base and its knobs have no
// labels: WINWING's diagram doesn't number them.
const URSA_MINOR_COMBAT_THROTTLE = {
  alt: 'WINCTRL URSA MINOR Combat Throttle, seen from behind',
  dense: true,
  image: { src: 'assets/ursa-minor-combat-throttle.png', width: 1100, height: 1101, x: 450, y: 160, scale: 0.6 },
  columns: {
    left: { edge: 430, anchor: 444, elbow: 500 },
    right: { edge: 1170, anchor: 1156, elbow: 1100 },
  },
  callouts: [
    ...stack('left', 88, [
      {
        id: 'fingerbuttons',
        name: 'Finger Buttons',
        tag: 'FRONT',
        at: [565, 68],
        columns: 2,
        group: leftToRight(labelled(['btn29', 'Outer'], ['btn28', 'Inner'])),
      },
      { id: 'toggle', name: 'Toggle', tag: 'FAR END', at: [405, 150], columns: 2, group: threeWay(33) },
      { id: 'slide', name: 'Slide Switch', at: [494, 253], columns: 2, group: leftToRight(labelled(['btn60', 'Left'], ['btn61', 'Right'])) },
      { id: 'btn27', at: [833, 316] },
      { id: 'rearhat', name: 'Rear Hat', at: [784, 379], columns: 2, group: buttonHat(36) },
      { id: 'ry', at: [529, 445] },
      { id: 'rx', at: [651, 512] },
    ]),
    ...stack('right', 88, [
      {
        id: 'fingerwheel',
        name: 'Finger Wheel',
        tag: 'FRONT',
        at: [823, 95],
        columns: 2,
        group: [{ id: 'z', wide: true }, { id: 'btn58', dir: 'up' }, { id: 'btn59', dir: 'down' }, { id: 'btn57', dir: 'push' }],
      },
      {
        id: 'ministick',
        name: 'Ministick',
        tag: 'FRONT · BUTTONS OR ANALOG',
        at: [933, 116],
        columns: 2,
        group: [{ id: 'slider', label: 'X', wide: true }, { id: 'dial', label: 'Y', wide: true }, ...pushHat(51)],
      },
      { id: 'knob', name: 'Knob', at: [1047, 141], columns: 2, group: [{ id: 'rz', wide: true }, { id: 'btn56', dir: 'push' }] },
      { id: 'thumbswitch', name: 'Thumb Switch', at: [991, 291], columns: 2, group: threeWay(30) },
      {
        id: 'tophat',
        name: 'Top Hat',
        at: [889, 239],
        columns: 2,
        group: [
          { id: 'btn47', dir: 'up' },
          { id: 'btn48', dir: 'right' },
          { id: 'btn49', dir: 'down' },
          { id: 'btn46', dir: 'left' },
          { id: 'btn50', dir: 'push' },
        ],
      },
      {
        id: 'fronthat',
        name: 'Front Hat',
        at: [907, 354],
        columns: 2,
        group: [
          { id: 'btn42', dir: 'up' },
          { id: 'btn43', dir: 'right' },
          { id: 'btn44', dir: 'down' },
          { id: 'btn41', dir: 'left' },
          { id: 'btn45', dir: 'push' },
        ],
      },
    ]),
  ],
  // Along each lever's slot; forward is up, towards the handles.
  guides: {
    ry: {
      path: 'M 733.8 485.8 L 748.8 427',
      arrows: [
        [733.8, 485.8, 104.3],
        [748.8, 427, -75.7],
      ],
      point: (v) => [741.3 + v * 7.5, 456.4 - v * 29.4],
    },
    rx: {
      path: 'M 809.4 529.6 L 822 469',
      arrows: [
        [809.4, 529.6, 101.7],
        [822, 469, -78.3],
      ],
      point: (v) => [815.7 + v * 6.3, 499.3 - v * 30.3],
    },
  },
};

// ─── Gamepads ────────────────────────────────────────────────────────────────

// All seen from above, with the triggers behind the bumpers and out of sight: each points
// at its bumper's outer end.

// An Xbox controller's labels, given where each control is on its photo. The Xbox button
// isn't labelled: Windows keeps it for itself. Nor are an Elite's paddles: the controller
// sends each one as a copy of an ordinary button.
const xboxPad = (alt, image, at) => ({
  alt,
  dense: true,
  image,
  columns: X56_COLUMNS,
  callouts: [
    ...stack('left', 230, [
      { id: 'btn5', at: at.lb },
      { id: 'z', at: at.lt },
      {
        id: 'leftstick',
        name: 'Left Stick',
        columns: 2,
        at: at.leftStick,
        group: [{ id: 'x', label: 'X', wide: true }, { id: 'y', label: 'Y', wide: true }, { id: 'btn9', dir: 'push' }],
      },
      { id: 'btn7', at: at.view },
      { id: 'hat1', columns: 2, at: at.dpad, group: HAT_DIRECTIONS.map((dir) => ({ id: `hat1_${dir}`, dir })) },
      { id: 'btn8', at: at.menu },
    ]),
    ...stack('right', 230, [
      { id: 'btn6', at: at.rb },
      { id: 'rz', at: at.rt },
      { id: 'face', name: 'Face Buttons', columns: 2, at: at.face, group: labelled(['btn4', 'Y'], ['btn2', 'B'], ['btn3', 'X'], ['btn1', 'A']) },
      {
        id: 'rightstick',
        name: 'Right Stick',
        columns: 2,
        at: at.rightStick,
        group: [{ id: 'rx', label: 'X', wide: true }, { id: 'ry', label: 'Y', wide: true }, { id: 'btn10', dir: 'push' }],
      },
    ]),
  ],
  guides: {},
});

const XBOX_CONTROLLER = xboxPad(
  'Xbox controller, seen from above',
  { src: 'assets/xbox-controller.png', width: 762, height: 540, x: 495, y: 250, scale: 0.8 },
  {
    lb: [218, 32],
    lt: [154, 49],
    leftStick: [186, 149],
    view: [324, 152],
    dpad: [279, 272],
    menu: [436, 151],
    rb: [545, 32],
    rt: [609, 49],
    face: [576, 151],
    rightStick: [481, 265],
  },
);

const XBOX_ELITE = xboxPad(
  'Xbox Elite controller, seen from above',
  { src: 'assets/xbox-elite.png', width: 762, height: 537, x: 495, y: 250, scale: 0.8 },
  {
    lb: [177, 31],
    lt: [135, 46],
    leftStick: [185, 146],
    view: [327, 152],
    dpad: [279, 275],
    menu: [437, 152],
    rb: [585, 31],
    rt: [627, 46],
    face: [578, 152],
    rightStick: [483, 265],
  },
);

// A PlayStation controller's labels, the same way. The triggers are axes; the buttons they
// also press (7 and 8) are left to the list view. `extra` adds a model's own buttons under
// the right-hand column.
const playstationPad = (alt, image, top, at, extra = []) => ({
  alt,
  dense: true,
  image,
  columns: X56_COLUMNS,
  callouts: [
    ...stack('left', top, [
      { id: 'btn5', at: at.l1 },
      { id: 'rx', at: at.l2 },
      { id: 'btn9', at: at.create },
      { id: 'hat1', columns: 2, at: at.dpad, group: HAT_DIRECTIONS.map((dir) => ({ id: `hat1_${dir}`, dir })) },
      { id: 'btn14', at: at.touchpad },
      {
        id: 'leftstick',
        name: 'Left Stick',
        columns: 2,
        at: at.leftStick,
        group: [{ id: 'x', label: 'X', wide: true }, { id: 'y', label: 'Y', wide: true }, { id: 'btn11', dir: 'push' }],
      },
      { id: 'btn13', at: at.ps },
    ]),
    ...stack('right', top, [
      { id: 'btn6', at: at.r1 },
      { id: 'ry', at: at.r2 },
      { id: 'btn10', at: at.options },
      { id: 'face', name: 'Face Buttons', columns: 2, at: at.face, group: labelled(['btn4', 'Tri'], ['btn3', 'Cir'], ['btn1', 'Sq'], ['btn2', 'Cross']) },
      {
        id: 'rightstick',
        name: 'Right Stick',
        columns: 2,
        at: at.rightStick,
        group: [{ id: 'z', label: 'X', wide: true }, { id: 'rz', label: 'Y', wide: true }, { id: 'btn12', dir: 'push' }],
      },
      ...extra,
    ]),
  ],
  guides: {},
});

const DUALSHOCK_4 = playstationPad(
  'DualShock 4, seen from above',
  { src: 'assets/dualshock4.png', width: 732, height: 452, x: 493, y: 270, scale: 0.84 },
  200,
  {
    l1: [178, 21],
    l2: [137, 24],
    create: [233, 74],
    dpad: [159, 137],
    touchpad: [374, 104],
    leftStick: [263, 237],
    ps: [374, 239],
    r1: [554, 21],
    r2: [595, 24],
    options: [513, 74],
    face: [590, 140],
    rightStick: [485, 237],
  },
);

const DUALSENSE = playstationPad(
  'DualSense, seen from above',
  { src: 'assets/dualsense.png', width: 807, height: 558, x: 493, y: 250, scale: 0.76 },
  200,
  {
    l1: [172, 24],
    l2: [112, 34],
    create: [220, 76],
    dpad: [158, 158],
    touchpad: [404, 96],
    leftStick: [280, 264],
    ps: [404, 268],
    r1: [632, 24],
    r2: [694, 34],
    options: [586, 76],
    face: [650, 158],
    rightStick: [528, 264],
  },
  [{ id: 'btn15', at: [404, 310] }],
);

// ─── VKB STECS Modern Throttle Mk.II Max (twin grips, base, ATEM and STEM) ───

// Seen from the front right: the ATEM is nearest, on the front of the base, and the STEM
// stands on its holder to the right. With the ATEM it has more controls than there is room
// to show dropdowns for, so its labels are folded. The right grip's thumb side faces the
// camera; the fronts of both grips are in shadow, so the controls there point at about
// where they sit, and the rear triggers at the far edge. Nobody has published the ATEM's
// button numbers, so its thirteen are listed by number under one label: press one and its
// row lights. The ministick, the analog wheel, 19, 55 and 56 aren't labelled, as on the
// Standard.
const STECS_MAX = lower(54, {
  alt: 'VKB STECS Modern Throttle Max with its ATEM and STEM modules, seen from the front',
  dense: true,
  folded: true,
  image: { src: 'assets/stecs-max.png', width: 958, height: 620, x: 398, y: 190, scale: 0.84 },
  columns: {
    left: { edge: 330, anchor: 344, elbow: 400 },
    right: { edge: 1270, anchor: 1256, elbow: 1200 },
  },
  callouts: [
    ...fold('left', 170, [
      { id: 'reartriggers', name: 'Rear Triggers', at: [300, 30], columns: 2, group: leftToRight(labelled(['btn8', 'L'], ['btn16', 'R'])) },
      {
        id: 'rocker',
        name: 'Rocker',
        tag: 'THUMB',
        at: [410, 98],
        columns: 2,
        group: [
          { id: 'btn34', dir: 'up' },
          { id: 'btn33', dir: 'down' },
          { id: 'btn22', dir: 'push' },
        ],
      },
      { id: 'centrewheel', name: 'Centre Wheel', tag: 'FRONT', at: [267, 96], columns: 2, group: labelled(['btn13', 'Fwd'], ['btn12', 'Back']) },
      { id: 'endwheel', name: 'End Wheel', at: [190, 95], columns: 2, group: labelled(['btn14', 'Fwd'], ['btn15', 'Back']) },
      {
        id: 'frontbuttons',
        name: 'Front Buttons',
        tag: 'FRONT',
        at: [232, 146],
        columns: 2,
        group: leftToRight(labelled(['btn10', 'Red'], ['btn11', 'RST'], ['btn18', 'ENT'], ['btn23', 'Grey'])),
      },
      {
        id: 'fronthat',
        name: 'Front Hat',
        tag: 'FRONT',
        at: [288, 152],
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
        id: 'thumbhat',
        name: 'Thumb Hat',
        at: [460, 143],
        columns: 2,
        group: leftToRight(labelled(['btn25', 'Up'], ['btn26', 'Down'], ['btn27', 'Fwd'], ['btn28', 'Back'], ['btn20', 'Push'])),
      },
      { id: 'fronttriggers', name: 'Front Triggers', tag: 'FRONT', at: [326, 176], columns: 2, group: leftToRight(labelled(['btn9', 'L'], ['btn17', 'R'])) },
      { id: 'btn24', at: [423, 205] },
      { id: 'x', at: [228, 336], tag: 'LEVER' },
      { id: 'y', at: [295, 350], tag: 'LEVER' },
      { id: 'rotary', name: 'Rotary', tag: '1–5', at: [425, 355], columns: 2, group: leftToRight(labelled(['btn3', '1'], ['btn4', '2'], ['btn5', '3'], ['btn6', '4'], ['btn7', '5'])) },
      {
        id: 'atem',
        name: 'ATEM',
        tag: 'B59–B71',
        at: [180, 420],
        columns: 2,
        group: leftToRight(Array.from({ length: 13 }, (_, i) => ({ id: `btn${i + 59}`, label: String(i + 59) }))),
      },
      { id: 'btn2', at: [482, 352] },
      { id: 'btn1', at: [367, 395] },
    ]),
    ...fold('right', 170, [
      {
        id: 'toggle',
        name: 'Toggle',
        tag: 'TGL',
        at: [643, 80],
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
        at: [688, 120],
        columns: 2,
        group: [
          { id: 'btn51', dir: 'left' },
          { id: 'btn52', dir: 'right' },
        ],
      },
      { id: 'sw1', name: 'SW1', tag: 'ROCKER', at: [752, 130], columns: 2, group: threeWay(43) },
      { id: 'sw2', name: 'SW2', tag: 'ROCKER', at: [793, 130], columns: 2, group: threeWay(46) },
      {
        id: 'flip',
        name: 'Flip Switch',
        at: [603, 172],
        columns: 2,
        group: [
          { id: 'btn57', dir: 'up' },
          { id: 'btn58', dir: 'down' },
        ],
      },
      {
        id: 'bbuttons',
        name: 'B Buttons',
        tag: 'B1–B5',
        at: [830, 173],
        columns: 2,
        group: labelled(['btn38', 'B1'], ['btn39', 'B2'], ['btn40', 'B3'], ['btn41', 'B4'], ['btn42', 'B5']),
      },
      { id: 'btn36', at: [770, 207] },
      { id: 'btn35', at: [728, 203] },
      {
        id: 'en2',
        name: 'EN2',
        tag: 'ENCODER',
        at: [658, 210],
        columns: 2,
        group: [
          { id: 'btn53', dir: 'left' },
          { id: 'btn54', dir: 'right' },
        ],
      },
      { id: 'btn37', at: [725, 248] },
    ]),
  ],
  guides: {},
});

// Keyed by skin id (see SKINS in shared/devices.js). A skin with no entry shows as the list.
export const LAYOUTS = {
  xboxcontroller: XBOX_CONTROLLER,
  xboxelite: XBOX_ELITE,
  dualshock4: DUALSHOCK_4,
  dualsense: DUALSENSE,
  x56stick: X56_STICK,
  x56throttle: X56_THROTTLE,
  extreme3dpro: EXTREME_3D_PRO,
  gladiatorevo: GLADIATOR_EVO,
  gladiatorevoleft: GLADIATOR_EVO_LEFT,
  gladiatorotright: GLADIATOR_OT_RIGHT,
  gladiatorotleft: GLADIATOR_OT_LEFT,
  stecsstandard: STECS_STANDARD,
  stecsmax: STECS_MAX,
  stecsspace: STECS_SPACE,
  velocityoneflightstick: VELOCITYONE_FLIGHTSTICK,
  velocityoneflightstick2: VELOCITYONE_FLIGHTSTICK_2,
  velocityonedualthrottle: VELOCITYONE_DUAL_THROTTLE,
  flightdeckstick: FLIGHTDECK_STICK,
  flightdeckthrottle: FLIGHTDECK_THROTTLE,
  orion2f16ex: ORION2_F16EX,
  orion2throttle: ORION2_THROTTLE,
  ursaminorcombatstick: URSA_MINOR_COMBAT_STICK,
  ursaminorcombatthrottle: URSA_MINOR_COMBAT_THROTTLE,
  solrright: SOLR_RIGHT,
  solrleft: SOLR_LEFT,
};

// A stick that becomes another product without changing what it reports: a Gladiator
// fitted with VKB's Omni Throttle adapter. Its owner picks that photo in the Joystick menu.
export const ALTERNATES = {
  gladiatorevo: { skin: 'gladiatorotright', label: 'Omni Throttle' },
  gladiatorevoleft: { skin: 'gladiatorotleft', label: 'Omni Throttle' },
};

export const toStage = (layout, [x, y]) => [layout.image.x + x * layout.image.scale, layout.image.y + y * layout.image.scale];
