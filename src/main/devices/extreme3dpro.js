// Logitech Extreme 3D Pro (USB 046D:C215).
//
// Input report (7 bytes; 8 on Windows' raw HID API, which prefixes report ID 0).
// Verified against Windows' HID parser (HidP_GetUsageValue) on a real stick:
//   bits  0-9   X      (roll)      0..1023, left = 0
//   bits 10-19  Y      (pitch)     0..1023, forward = 0
//   bits 20-23  hat                0..7 clockwise from up, 8 = centred
//   bits 24-31  Rz     (twist)     0..255, left = 0
//   byte 4      buttons 1-8
//   byte 5      slider (throttle)  0..255, forward (+) = 0
//   byte 6      buttons 9-12 in the low nibble

const BUTTON_IDS = ['trigger', 'thumb', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9', 'b10', 'b11', 'b12'];

// Hat position -> [up, right, down, left]; diagonals press two directions.
const HAT_DIRECTIONS = [
  [1, 0, 0, 0],
  [1, 1, 0, 0],
  [0, 1, 0, 0],
  [0, 1, 1, 0],
  [0, 0, 1, 0],
  [0, 0, 1, 1],
  [0, 0, 0, 1],
  [1, 0, 0, 1],
];

export const EXTREME_3D_PRO = Object.freeze({
  name: 'Logitech Extreme 3D Pro',
  vendorId: 0x046d,
  productId: 0xc215,

  // Raw ranges. Spring-centred axes have a `center`, which drifts on worn sticks and
  // can be recalibrated. `invert` flips raw direction into the gamepad sense
  // (forward / right = positive).
  axes: Object.freeze({
    roll: { min: 0, max: 1023, center: 511.5, invert: false },
    pitch: { min: 0, max: 1023, center: 511.5, invert: true },
    yaw: { min: 0, max: 255, center: 127.5, invert: false },
    throttle: { min: 0, max: 255, invert: true },
  }),

  // Returns { buttons, raw } or null if the report isn't one we understand.
  parse(report) {
    let r = report;
    if (r.length === 8 && r[0] === 0) r = r.subarray(1);
    if (r.length < 7) return null;

    const bits = r[4] | ((r[6] & 0x0f) << 8);
    const buttons = {};
    BUTTON_IDS.forEach((id, i) => {
      buttons[id] = (bits & (1 << i)) !== 0;
    });
    const [up, right, down, left] = HAT_DIRECTIONS[(r[2] >> 4) & 0x0f] ?? [0, 0, 0, 0];
    buttons.hat_up = up === 1;
    buttons.hat_right = right === 1;
    buttons.hat_down = down === 1;
    buttons.hat_left = left === 1;

    return {
      buttons,
      raw: {
        roll: r[0] | ((r[1] & 0x03) << 8),
        pitch: (r[1] >> 2) | ((r[2] & 0x0f) << 6),
        yaw: r[3],
        throttle: r[5],
      },
    };
  },
});

// Raw axis values -> -1..1. Centred axes scale each side separately around the
// (calibrated) centre so both ends still reach full deflection.
export function normalizeAxes(device, raw, calibration) {
  const axes = {};
  for (const [id, spec] of Object.entries(device.axes)) {
    const v = raw[id];
    let n;
    if (spec.center === undefined) {
      n = ((v - spec.min) / (spec.max - spec.min)) * 2 - 1;
    } else {
      const c = calibration?.[id] ?? spec.center;
      n = v >= c ? (v - c) / Math.max(1, spec.max - c) : (v - c) / Math.max(1, c - spec.min);
    }
    n = Math.min(1, Math.max(-1, n));
    axes[id] = spec.invert ? -n || 0 : n; // `|| 0` avoids -0 at rest
  }
  return axes;
}
