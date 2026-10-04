// Reads Xbox controllers through XInput (Windows only). Over HID an Xbox controller
// reports both triggers as one shared axis, so the HID path the flight sticks use can't
// tell them apart; XInput can. Each controller it finds is handed to the joystick manager
// as a device that lists, opens and decodes like a HID one, with the layout in
// shared/devices.js (XBOX_LAYOUT).
//
// The virtual controller this app creates shows up in XInput too. Reading it back would
// feed the app its own output, so `listXboxPads` is told which slot to leave out.
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { XUSB } from '../shared/controls.js';
import { XBOX_ELITE_PAD, XBOX_LAYOUT, XBOX_PAD } from '../shared/devices.js';

const SLOTS = 4;
const POLL_MS = 4;
const ERROR_SUCCESS = 0;
const STATE_SIZE = 16; // XINPUT_STATE: a packet number, then the 12-byte XINPUT_GAMEPAD
const CAPABILITIES_EX_ORDINAL = 108;
const CAPABILITIES_EX_SIZE = 36; // XINPUT_CAPABILITIES (20 bytes), then vendor and product IDs
const PATH = /^xinput:([0-3])$/;

// Buttons 1–10, in the order an Xbox controller lists them over HID.
const BUTTON_BITS = [
  XUSB.A,
  XUSB.B,
  XUSB.X,
  XUSB.Y,
  XUSB.LEFT_SHOULDER,
  XUSB.RIGHT_SHOULDER,
  XUSB.BACK,
  XUSB.START,
  XUSB.LEFT_THUMB,
  XUSB.RIGHT_THUMB,
];

// D-pad as a hat: 0–7 clockwise from up, indexed by [up − down + 1][right − left + 1].
// 8 is off the scale, which reads as centred.
const HAT_POSITIONS = [
  [5, 4, 3],
  [6, 8, 2],
  [7, 0, 1],
];

let api; // undefined until tried, null when XInput isn't there
function load() {
  if (api !== undefined) return api;
  api = null;
  if (process.platform !== 'win32') return api;
  const koffi = createRequire(import.meta.url)('koffi');
  for (const dll of ['xinput1_4.dll', 'xinput9_1_0.dll']) {
    try {
      const lib = koffi.load(dll);
      api = { XInputGetState: lib.func('uint32_t __stdcall XInputGetState(uint32_t index, void *state)') };
      try {
        // XInputGetCapabilitiesEx: exported by number only, and the one call that says
        // which controller sits in a slot (SDL uses it the same way).
        api.capabilitiesEx = lib.func('__stdcall', CAPABILITIES_EX_ORDINAL, 'uint32_t', ['uint32_t', 'uint32_t', 'uint32_t', 'void *']);
      } catch {
        // The older DLL lacks it: every controller is then a plain Xbox controller.
      }
      break;
    } catch {
      // Try the older DLL; without either there are simply no Xbox controllers.
    }
  }
  return api;
}

export const isXboxPad = (info) => PATH.test(info?.path ?? '');

// USB product IDs of the Elite (Series 1, then Series 2 by cable and by Bluetooth).
export const isEliteProduct = (vendorId, productId) => vendorId === XBOX_PAD.vendorId && [0x02e3, 0x0b00, 0x0b05, 0x0b22].includes(productId);

// Which controller sits in `slot`: an Elite gets its own photo, anything else is a plain
// Xbox controller.
function identity(xinput, slot) {
  if (!xinput.capabilitiesEx) return XBOX_PAD;
  const caps = Buffer.alloc(CAPABILITIES_EX_SIZE);
  if (xinput.capabilitiesEx(1, slot, 0, caps) !== ERROR_SUCCESS) return XBOX_PAD;
  return isEliteProduct(caps.readUInt16LE(20), caps.readUInt16LE(22)) ? XBOX_ELITE_PAD : XBOX_PAD;
}

// The Xbox controllers plugged in, as device listings. `skip(slot)` says which slots to
// leave out (see the top of this file).
export function listXboxPads(skip = () => false) {
  const xinput = load();
  if (!xinput) return [];
  const state = Buffer.alloc(STATE_SIZE);
  const pads = [];
  for (let slot = 0; slot < SLOTS; slot++) {
    if (skip(slot) || xinput.XInputGetState(slot, state) !== ERROR_SUCCESS) continue;
    const pad = identity(xinput, slot);
    pads.push({ ...pad, path: `xinput:${slot}`, usagePage: 1, usage: 5, manufacturer: '', product: pad.name });
  }
  return pads;
}

// What each of the four slots holds right now, or null for an empty one. Lets vigem.js
// find which slot its own virtual pad was given. Null altogether without XInput.
export function readXboxSlots() {
  const xinput = load();
  if (!xinput) return null;
  const state = Buffer.alloc(STATE_SIZE);
  return Array.from({ length: SLOTS }, (_, slot) => {
    if (xinput.XInputGetState(slot, state) !== ERROR_SUCCESS) return null;
    return {
      buttons: state.readUInt16LE(4),
      lt: state.readUInt8(6),
      rt: state.readUInt8(7),
      lx: state.readInt16LE(8),
      ly: state.readInt16LE(10),
      rx: state.readInt16LE(12),
      ry: state.readInt16LE(14),
    };
  });
}

// Stands in for a HID handle: 'data' carries the controller's state whenever it changes
// (and once at the start), 'error' says it was unplugged.
class XboxPadReader extends EventEmitter {
  constructor(xinput, slot) {
    super();
    this.xinput = xinput;
    this.slot = slot;
    this.state = Buffer.alloc(STATE_SIZE);
    this.packet = null;
    this.timer = setInterval(() => this.poll(), POLL_MS);
  }

  poll() {
    if (this.xinput.XInputGetState(this.slot, this.state) !== ERROR_SUCCESS) {
      this.close();
      this.emit('error', new Error('The controller was unplugged'));
      return;
    }
    const packet = this.state.readUInt32LE(0);
    if (packet === this.packet) return;
    this.packet = packet;
    this.emit('data', Buffer.from(this.state.subarray(4)));
  }

  close() {
    clearInterval(this.timer);
    this.timer = null;
  }
}

export function openXboxPad(path) {
  const xinput = load();
  const slot = PATH.exec(path)?.[1];
  if (!xinput || slot === undefined) throw new Error('Not an Xbox controller');
  return new XboxPadReader(xinput, Number(slot));
}

// Turns an XINPUT_GAMEPAD into the values and buttons of XBOX_LAYOUT.
export class XboxPadParser {
  constructor() {
    this.layout = XBOX_LAYOUT;
  }

  // Returns { values: [raw, …] (same order as layout.values), buttons: Set<buttonNumber> }.
  decode(data) {
    const bits = data.readUInt16LE(0);
    const pressed = (bit) => (bits & bit ? 1 : 0);
    const hat = HAT_POSITIONS[pressed(XUSB.DPAD_UP) - pressed(XUSB.DPAD_DOWN) + 1][pressed(XUSB.DPAD_RIGHT) - pressed(XUSB.DPAD_LEFT) + 1];
    const buttons = new Set();
    BUTTON_BITS.forEach((bit, i) => {
      if (bits & bit) buttons.add(i + 1);
    });
    // XInput's sticks read up as positive; ~v turns that over without leaving the range.
    const values = [hat, data.readInt16LE(4), ~data.readInt16LE(6), data.readInt16LE(8), ~data.readInt16LE(10), data.readUInt8(2), data.readUInt8(3)];
    return { values, buttons };
  }

  close() {}
}
