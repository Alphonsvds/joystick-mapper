// Virtual Xbox 360 controller on Linux, through the kernel's uinput module (Linux only).
//
// The Linux counterpart of vigem.js, with the same status states and submit(out) call. It
// creates an input device that introduces itself as Microsoft's wired Xbox 360 pad
// (045E:028E) and reports the way the kernel's own xpad driver does, so games see an
// ordinary Xbox 360 controller: native ones through SDL, Windows ones through Proton/Wine.
// There's nothing to install, since uinput is part of the kernel; it only needs
// permission, which the Allow access button grants (see linux-access.js). Closing the
// file removes the pad, so a crash never leaves a ghost controller.
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { XUSB } from '../shared/controls.js';

const RETRY_MS = 3000;
const DEVICE_PATHS = ['/dev/uinput', '/dev/input/uinput'];

// <linux/input-event-codes.h>
const EV_SYN = 0x00;
const EV_KEY = 0x01;
const EV_ABS = 0x03;
const SYN_REPORT = 0;
const ABS_X = 0x00;
const ABS_Y = 0x01;
const ABS_Z = 0x02;
const ABS_RX = 0x03;
const ABS_RY = 0x04;
const ABS_RZ = 0x05;
const ABS_HAT0X = 0x10;
const ABS_HAT0Y = 0x11;

// XUSB button -> the key xpad reports for it.
const BUTTON_KEYS = [
  [XUSB.A, 0x130], // BTN_A
  [XUSB.B, 0x131], // BTN_B
  [XUSB.X, 0x133], // BTN_X
  [XUSB.Y, 0x134], // BTN_Y
  [XUSB.LEFT_SHOULDER, 0x136], // BTN_TL
  [XUSB.RIGHT_SHOULDER, 0x137], // BTN_TR
  [XUSB.BACK, 0x13a], // BTN_SELECT
  [XUSB.START, 0x13b], // BTN_START
  [XUSB.GUIDE, 0x13c], // BTN_MODE
  [XUSB.LEFT_THUMB, 0x13d], // BTN_THUMBL
  [XUSB.RIGHT_THUMB, 0x13e], // BTN_THUMBR
];

// [code, min, max]. No fuzz or flat: the app applies its own deadzones, and SDL would
// otherwise add one of its own from `flat`.
const AXES = [
  [ABS_X, -32768, 32767],
  [ABS_Y, -32768, 32767],
  [ABS_RX, -32768, 32767],
  [ABS_RY, -32768, 32767],
  [ABS_Z, 0, 255],
  [ABS_RZ, 0, 255],
  [ABS_HAT0X, -1, 1],
  [ABS_HAT0Y, -1, 1],
];

// <linux/uinput.h>: _IO('U', nr) and _IOW('U', nr, size).
const ioc = (write, nr, size) => (((write ? 1 : 0) << 30) | (size << 16) | (0x55 << 8) | nr) >>> 0;
export const UI_DEV_CREATE = ioc(false, 1, 0);
export const UI_DEV_DESTROY = ioc(false, 2, 0);
export const UI_DEV_SETUP = ioc(true, 3, 92); // struct uinput_setup
export const UI_ABS_SETUP = ioc(true, 4, 28); // struct uinput_abs_setup
export const UI_SET_EVBIT = ioc(true, 100, 4);
export const UI_SET_KEYBIT = ioc(true, 101, 4);
export const UI_SET_ABSBIT = ioc(true, 103, 4);

const BUS_USB = 0x03;
const X360_VENDOR_ID = 0x045e;
const X360_PRODUCT_ID = 0x028e;
const X360_VERSION = 0x0114;
const X360_NAME = 'Microsoft X-Box 360 pad'; // what xpad calls it

// struct uinput_setup { struct input_id id; char name[80]; __u32 ff_effects_max; }
function deviceSetup() {
  const buf = Buffer.alloc(92);
  buf.writeUInt16LE(BUS_USB, 0);
  buf.writeUInt16LE(X360_VENDOR_ID, 2);
  buf.writeUInt16LE(X360_PRODUCT_ID, 4);
  buf.writeUInt16LE(X360_VERSION, 6);
  buf.write(X360_NAME, 8, 79, 'latin1');
  return buf;
}

// struct uinput_abs_setup { __u16 code; struct input_absinfo absinfo; } (absinfo at 4)
function absSetup(code, min, max) {
  const buf = Buffer.alloc(28);
  buf.writeUInt16LE(code, 0);
  buf.writeInt32LE(min, 8);
  buf.writeInt32LE(max, 12);
  return buf;
}

// One XUSB report as input events, ending with the SYN_REPORT that delivers them. The
// kernel drops values that didn't change, so the whole state can go every time.
export function padEvents(out) {
  const on = (bit) => (out.buttons & bit ? 1 : 0);
  return [
    ...BUTTON_KEYS.map(([bit, code]) => [EV_KEY, code, on(bit)]),
    [EV_ABS, ABS_X, out.lx],
    [EV_ABS, ABS_Y, ~out.ly], // xpad flips Y: down is positive on Linux
    [EV_ABS, ABS_RX, out.rx],
    [EV_ABS, ABS_RY, ~out.ry],
    [EV_ABS, ABS_Z, out.lt],
    [EV_ABS, ABS_RZ, out.rt],
    [EV_ABS, ABS_HAT0X, on(XUSB.DPAD_RIGHT) - on(XUSB.DPAD_LEFT)],
    [EV_ABS, ABS_HAT0Y, on(XUSB.DPAD_DOWN) - on(XUSB.DPAD_UP)],
    [EV_SYN, SYN_REPORT, 0],
  ];
}

// struct input_event on 64-bit Linux: a 16-byte timestamp (uinput fills it in), then
// __u16 type, __u16 code, __s32 value.
export function encodeEvents(events) {
  const buf = Buffer.alloc(24 * events.length);
  events.forEach(([type, code, value], i) => {
    buf.writeUInt16LE(type, i * 24 + 16);
    buf.writeUInt16LE(code, i * 24 + 18);
    buf.writeInt32LE(value, i * 24 + 20);
  });
  return buf;
}

let libc = null;
function loadLibc() {
  if (libc) return libc;
  const koffi = createRequire(import.meta.url)('koffi');
  const lib = koffi.load('libc.so.6');
  libc = { koffi, ioctl: lib.func('int ioctl(int fd, unsigned long request, ...)') };
  return libc;
}

// The calls the pad makes. Tests swap in a fake.
const linux = {
  open: (file) => fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_NONBLOCK),
  // `arg` is an int, a Buffer (a struct passed by pointer) or nothing.
  ioctl(fd, request, arg) {
    const { koffi, ioctl } = loadLibc();
    let result;
    if (arg === undefined) result = ioctl(fd, request);
    else if (Buffer.isBuffer(arg)) result = ioctl(fd, request, 'void *', arg);
    else result = ioctl(fd, request, 'int', arg);
    if (result < 0) {
      const errno = koffi.errno();
      throw Object.assign(new Error(`uinput refused request 0x${request.toString(16)} (errno ${errno})`), { errno });
    }
  },
  write: (fd, buffer) => fs.writeSync(fd, buffer),
  close: (fd) => fs.closeSync(fd),
};

const NEEDS_ACCESS = new Set(['EACCES', 'EPERM', 'ENOENT']);

// Status states: off | connected | needs-access | error (as vigem.js, with needs-access
// standing in for driver-missing).
export class VirtualUinputPad extends EventEmitter {
  constructor({ system = linux } = {}) {
    super();
    this.system = system;
    this.fd = null;
    this.wanted = false;
    this.retryTimer = null;
    this.failures = 0;
    this.status = { state: 'off', message: '' };
  }

  setStatus(state, message = '') {
    if (this.status.state === state && this.status.message === message) return;
    this.status = { state, message };
    this.emit('status', this.status);
  }

  connect() {
    this.wanted = true;
    if (this.fd !== null) return;
    clearTimeout(this.retryTimer);
    try {
      this.fd = this.create();
    } catch (err) {
      if (NEEDS_ACCESS.has(err.code)) {
        // No permission yet, or uinput isn't loaded: Allow access fixes both.
        this.setStatus('needs-access', 'Click Allow access so Joystick Mapper can create the virtual controller');
      } else {
        this.setStatus('error', `Virtual controller error: ${err.message}`);
      }
      this.scheduleRetry();
      return;
    }
    this.failures = 0;
    this.setStatus('connected');
  }

  // Opens uinput and plugs in the pad; throws (with the file's error code) if it can't.
  create() {
    const sys = this.system;
    let fd = null;
    let failure = null;
    for (const file of DEVICE_PATHS) {
      try {
        fd = sys.open(file);
        break;
      } catch (err) {
        if (err.code !== 'ENOENT' || !failure) failure = err;
      }
    }
    if (fd === null) throw failure;

    try {
      sys.ioctl(fd, UI_SET_EVBIT, EV_KEY);
      for (const [, code] of BUTTON_KEYS) sys.ioctl(fd, UI_SET_KEYBIT, code);
      sys.ioctl(fd, UI_SET_EVBIT, EV_ABS);
      for (const [code, min, max] of AXES) {
        sys.ioctl(fd, UI_SET_ABSBIT, code);
        sys.ioctl(fd, UI_ABS_SETUP, absSetup(code, min, max));
      }
      sys.ioctl(fd, UI_DEV_SETUP, deviceSetup());
      sys.ioctl(fd, UI_DEV_CREATE);
    } catch (err) {
      sys.close(fd);
      throw err;
    }
    return fd;
  }

  scheduleRetry() {
    clearTimeout(this.retryTimer);
    if (this.wanted) this.retryTimer = setTimeout(() => this.connect(), RETRY_MS);
  }

  submit(out) {
    if (this.fd === null) return;
    try {
      this.system.write(this.fd, encodeEvents(padEvents(out)));
      this.failures = 0;
    } catch {
      if (++this.failures >= 5) {
        this.teardown();
        this.setStatus('error', 'Lost the virtual controller — reconnecting');
        this.scheduleRetry();
      }
    }
  }

  teardown() {
    if (this.fd === null) return;
    try {
      this.system.ioctl(this.fd, UI_DEV_DESTROY);
    } catch {
      // Closing the file removes the pad anyway.
    }
    try {
      this.system.close(this.fd);
    } catch {
      // Already gone.
    }
    this.fd = null;
  }

  disconnect() {
    this.wanted = false;
    clearTimeout(this.retryTimer);
    this.teardown();
    this.setStatus('off');
  }
}
