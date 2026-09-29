// Hand-written reader for the Logitech Extreme 3D Pro (USB 046D:C215), used where
// Windows' HID parser isn't available (macOS / Linux). On Windows every stick,
// this one included, is read through src/main/hidp.js.
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

export const EXTREME_3D_PRO_IDS = Object.freeze({ vendorId: 0x046d, productId: 0xc215 });

// Same shape as HidParser.layout, in the order Windows reports the fields.
const LAYOUT = Object.freeze({
  reportLength: 8,
  values: [
    { page: 1, usage: 0x31, min: 0, max: 1023 },
    { page: 1, usage: 0x30, min: 0, max: 1023 },
    { page: 1, usage: 0x39, min: 0, max: 7 },
    { page: 1, usage: 0x35, min: 0, max: 255 },
    { page: 1, usage: 0x36, min: 0, max: 255 },
  ],
  buttonCount: 12,
  buttonReportIds: [0],
});

export class Extreme3DProParser {
  constructor() {
    this.layout = LAYOUT;
    this.values = [null, null, null, null, null];
    this.buttons = new Set();
  }

  decode(report) {
    let r = report;
    if (r.length === 8 && r[0] === 0) r = r.subarray(1);
    if (r.length < 7) return { values: this.values, buttons: this.buttons };
    const bits = r[4] | ((r[6] & 0x0f) << 8);
    this.buttons = new Set();
    for (let i = 0; i < 12; i++) if (bits & (1 << i)) this.buttons.add(i + 1);
    this.values = [
      (r[1] >> 2) | ((r[2] & 0x0f) << 6), // Y
      r[0] | ((r[1] & 0x03) << 8), // X
      (r[2] >> 4) & 0x0f, // hat (8 = centred, outside 0..7)
      r[3], // Rz
      r[5], // slider
    ];
    return { values: this.values, buttons: this.buttons };
  }

  close() {}
}
