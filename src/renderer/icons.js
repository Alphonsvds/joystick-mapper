// Inline SVG icons for Xbox controller outputs. Neutral strokes use currentColor so
// they follow hover/selection colour; face buttons keep their Xbox colours.

export const FACE_COLORS = { a: '#6cbf4b', b: '#e5483d', x: '#3b8fe8', y: '#f0c233' };

const svg = (body) => `<svg class="icon" viewBox="0 0 32 32" aria-hidden="true">${body}</svg>`;
const label = (text, x, y, size = 7.5, fill = 'currentColor') =>
  `<text x="${x}" y="${y}" font-size="${size}" text-anchor="middle" fill="${fill}">${text}</text>`;

function face(letter, color) {
  return svg(
    `<circle cx="16" cy="16" r="12.2" fill="#0d0d0d" stroke="${color}" stroke-width="1.6"/>` +
      label(letter, 16, 20.6, 13, color),
  );
}

const BUMPER_PATH = 'M4 22 C4 15.5 7.5 11 13.5 11 H23 C26.5 11 28 13.2 28 16.5 V22 Z';
function bumper(text, mirror) {
  const flip = mirror ? ' transform="matrix(-1 0 0 1 32 0)"' : '';
  return svg(
    `<path d="${BUMPER_PATH}"${flip} fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>` +
      label(text, 16, 19.6),
  );
}

function trigger(text) {
  return svg(
    `<path d="M10 28 V13 C10 7.5 12.6 4.5 16 4.5 C19.4 4.5 22 7.5 22 13 V28 Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>` +
      label(text, 16, 22),
  );
}

const DPAD_ARMS = {
  up: [12.5, 3.5, 7, 9.5],
  down: [12.5, 19, 7, 9.5],
  left: [3.5, 12.5, 9.5, 7],
  right: [19, 12.5, 9.5, 7],
};
function dpad(active, pushed = false) {
  const arms = Object.entries(DPAD_ARMS)
    .map(([dir, [x, y, w, h]]) =>
      active.includes(dir)
        ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.6" fill="currentColor"/>`
        : `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.6" fill="none" stroke="currentColor" stroke-opacity=".35"/>`,
    )
    .join('');
  return svg(arms + `<rect x="12.5" y="12.5" width="7" height="7" fill="currentColor" fill-opacity="${pushed ? 1 : 0.35}"/>`);
}

// A direction of a hat on the stick itself; `push` is its centre click.
export function hatIcon(dir) {
  return dir === 'push' ? dpad([], true) : dpad([dir]);
}

// Small triangles just inside the stick ring, pointing outward.
const STICK_ARROWS = {
  up: 'M16 5.2 L19 8.8 H13 Z',
  down: 'M16 26.8 L19 23.2 H13 Z',
  left: 'M5.2 16 L8.8 13 V19 Z',
  right: 'M26.8 16 L23.2 13 V19 Z',
};
function stick(letter, dirs, pressed = false) {
  const ring = '<circle cx="16" cy="16" r="12.5" fill="none" stroke="currentColor" stroke-width="1.5"/>';
  if (pressed) {
    return svg(ring + '<circle cx="16" cy="16" r="8" fill="currentColor"/>' + label(letter, 16, 19.3, 9, '#000'));
  }
  const arrows = dirs.map((d) => `<path d="${STICK_ARROWS[d]}" fill="currentColor"/>`).join('');
  return svg(ring + arrows + label(letter, 16, 19.3, 9));
}

function menuButton(kind) {
  const ring = '<circle cx="16" cy="16" r="12.5" fill="none" stroke="currentColor" stroke-width="1.5"/>';
  const glyph =
    kind === 'view'
      ? '<rect x="10" y="11" width="8.5" height="6.5" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="13.5" y="14.5" width="8.5" height="6.5" rx="1.2" fill="currentColor"/>'
      : '<path d="M11 12 H21 M11 16 H21 M11 20 H21" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>';
  return svg(ring + glyph);
}

// Both stick clicks pressed together.
function bothSticks() {
  const click = (cx, letter) =>
    `<circle cx="${cx}" cy="16" r="7.2" fill="currentColor"/>` + label(letter, cx, 19.1, 8, '#000');
  return svg(click(8.5, 'L') + click(23.5, 'R'));
}

// Both bumpers pressed together.
function bothBumpers() {
  const one = (x, text, mirror) => {
    const flip = mirror ? ` transform="matrix(-1 0 0 1 ${2 * x} 0)"` : '';
    return (
      `<path d="M${x - 7.5} 22 C${x - 7.5} 15.5 ${x - 5} 11 ${x - 0.5} 11 H${x + 5} C${x + 7} 11 ${x + 7.5} 13.2 ${x + 7.5} 16.5 V22 Z"${flip} fill="currentColor"/>` +
      label(text, x, 19.6, 6.5, '#000')
    );
  };
  return svg(one(8.5, 'LB', false) + one(23.5, 'RB', true));
}

// Both triggers pulled together.
function bothTriggers() {
  const one = (x, text) =>
    `<path d="M${x - 4} 27 V13.5 C${x - 4} 8.5 ${x - 2} 5.5 ${x} 5.5 C${x + 2} 5.5 ${x + 4} 8.5 ${x + 4} 13.5 V27 Z" fill="currentColor"/>` +
    label(text, x, 22, 6, '#000');
  return svg(one(9, 'LT') + one(23, 'RT'));
}

// Two outputs sharing one axis, e.g. LT on the back half and RT on the front half.
function split(left, right) {
  return svg(
    label(left, 8.5, 15, 8.5) +
      label(right, 23.5, 15, 8.5) +
      '<path d="M16 7 V19" stroke="currentColor" stroke-opacity=".35"/>' +
      '<path d="M7 25.5 H25" stroke="currentColor" stroke-width="1.2"/>' +
      '<path d="M3.5 25.5 L7 23.2 V27.8 Z M28.5 25.5 L25 23.2 V27.8 Z" fill="currentColor"/>',
  );
}

const ICONS = {
  a: () => face('A', FACE_COLORS.a),
  b: () => face('B', FACE_COLORS.b),
  x: () => face('X', FACE_COLORS.x),
  y: () => face('Y', FACE_COLORS.y),
  lb: () => bumper('LB', false),
  rb: () => bumper('RB', true),
  lt: () => trigger('LT'),
  rt: () => trigger('RT'),
  dpad_up: () => dpad(['up']),
  dpad_down: () => dpad(['down']),
  dpad_left: () => dpad(['left']),
  dpad_right: () => dpad(['right']),
  dpad_x: () => dpad(['left', 'right']),
  dpad_y: () => dpad(['up', 'down']),
  ls_up: () => stick('L', ['up']),
  ls_down: () => stick('L', ['down']),
  ls_left: () => stick('L', ['left']),
  ls_right: () => stick('L', ['right']),
  ls_click: () => stick('L', [], true),
  ls_x: () => stick('L', ['left', 'right']),
  ls_y: () => stick('L', ['up', 'down']),
  rs_up: () => stick('R', ['up']),
  rs_down: () => stick('R', ['down']),
  rs_left: () => stick('R', ['left']),
  rs_right: () => stick('R', ['right']),
  rs_click: () => stick('R', [], true),
  ls_rs_click: () => bothSticks(),
  lb_rb_both: () => bothBumpers(),
  lt_rt_both: () => bothTriggers(),
  rs_x: () => stick('R', ['left', 'right']),
  rs_y: () => stick('R', ['up', 'down']),
  view: () => menuButton('view'),
  menu: () => menuButton('menu'),
  lt_rt: () => split('LT', 'RT'),
  lb_rb: () => split('LB', 'RB'),
};

export function targetIcon(id) {
  return ICONS[id]?.() ?? '';
}

// Short labels for the picker tiles (chips use the full target name).
export const TILE_LABELS = {
  a: 'A',
  b: 'B',
  x: 'X',
  y: 'Y',
  lb: 'LB',
  rb: 'RB',
  lt: 'LT',
  rt: 'RT',
  dpad_up: 'Up',
  dpad_down: 'Down',
  dpad_left: 'Left',
  dpad_right: 'Right',
  ls_up: 'Up',
  ls_down: 'Down',
  ls_left: 'Left',
  ls_right: 'Right',
  ls_click: 'Click',
  rs_up: 'Up',
  rs_down: 'Down',
  rs_left: 'Left',
  rs_right: 'Right',
  rs_click: 'Click',
  ls_rs_click: 'L3 + R3',
  lb_rb_both: 'LB + RB',
  lt_rt_both: 'LT + RT',
  view: 'View',
  menu: 'Menu',
  ls_x: 'LS  ←→',
  ls_y: 'LS  ↑↓',
  rs_x: 'RS  ←→',
  rs_y: 'RS  ↑↓',
  lt_rt: 'LT / RT',
  lb_rb: 'LB / RB',
  dpad_x: 'D-Pad ←→',
  dpad_y: 'D-Pad ↑↓',
};

export const CHEVRON =
  '<svg class="chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 L6 7.5 L9 4.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
