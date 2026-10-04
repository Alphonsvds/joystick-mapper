import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Extreme3DProParser } from '../src/main/devices/extreme3dpro.js';
import { HidDescriptorParser, parseDescriptor } from '../src/main/hiddescriptor.js';
import { RULES_FILE, accessRules, allowedDevices } from '../src/main/linux-access.js';
import {
  UI_ABS_SETUP,
  UI_DEV_CREATE,
  UI_DEV_DESTROY,
  UI_DEV_SETUP,
  UI_SET_ABSBIT,
  UI_SET_EVBIT,
  UI_SET_KEYBIT,
  VirtualUinputPad,
  encodeEvents,
  padEvents,
} from '../src/main/uinput.js';
import { describeDevice } from '../src/shared/devices.js';
import { NEUTRAL_OUTPUT } from '../src/shared/mapper.js';
import { XUSB } from '../src/shared/controls.js';

// ─── Reading sticks from their report descriptor ─────────────────────────────

// The Extreme 3D Pro's report, as a descriptor: X and Y (10 bits each, in one item), the
// hat, twist, buttons 1-8, the throttle slider, buttons 9-12 and padding, then a vendor
// feature report. Bit for bit what extreme3dpro.js reads (checked against Windows).
const EXTREME_DESCRIPTOR = Buffer.from([
  0x05, 0x01, // Usage Page (Generic Desktop)
  0x09, 0x04, // Usage (Joystick)
  0xa1, 0x01, // Collection (Application)
  0xa1, 0x02, //   Collection (Logical)
  0x75, 0x0a, //     Report Size (10)
  0x95, 0x02, //     Report Count (2)
  0x15, 0x00, //     Logical Minimum (0)
  0x26, 0xff, 0x03, // Logical Maximum (1023)
  0x09, 0x30, //     Usage (X)
  0x09, 0x31, //     Usage (Y)
  0x81, 0x02, //     Input (Data, Variable, Absolute)
  0x75, 0x04, //     Report Size (4)
  0x95, 0x01, //     Report Count (1)
  0x25, 0x07, //     Logical Maximum (7)
  0x09, 0x39, //     Usage (Hat switch)
  0x81, 0x42, //     Input (Data, Variable, Absolute, Null State)
  0x75, 0x08, //     Report Size (8)
  0x26, 0xff, 0x00, // Logical Maximum (255)
  0x09, 0x35, //     Usage (Rz)
  0x81, 0x02, //     Input
  0x05, 0x09, //     Usage Page (Button)
  0x19, 0x01, //     Usage Minimum (1)
  0x29, 0x08, //     Usage Maximum (8)
  0x75, 0x01, //     Report Size (1)
  0x95, 0x08, //     Report Count (8)
  0x25, 0x01, //     Logical Maximum (1)
  0x81, 0x02, //     Input
  0x05, 0x01, //     Usage Page (Generic Desktop)
  0x09, 0x36, //     Usage (Slider)
  0x75, 0x08, //     Report Size (8)
  0x95, 0x01, //     Report Count (1)
  0x26, 0xff, 0x00, // Logical Maximum (255)
  0x81, 0x02, //     Input
  0x05, 0x09, //     Usage Page (Button)
  0x19, 0x09, //     Usage Minimum (9)
  0x29, 0x0c, //     Usage Maximum (12)
  0x75, 0x01, //     Report Size (1)
  0x95, 0x04, //     Report Count (4)
  0x25, 0x01, //     Logical Maximum (1)
  0x81, 0x02, //     Input
  0x95, 0x04, //     Report Count (4)
  0x81, 0x01, //     Input (Constant): padding
  0xc0, //         End Collection
  0xa1, 0x02, //   Collection (Logical)
  0x06, 0x00, 0xff, // Usage Page (Vendor)
  0x09, 0x01, //     Usage (1)
  0x75, 0x08, //     Report Size (8)
  0x95, 0x04, //     Report Count (4)
  0xb1, 0x02, //     Feature
  0xc0, //         End Collection
  0xc0, //       End Collection
]);

const EXTREME = { vendorId: 0x046d, productId: 0xc215, name: 'Logitech Extreme 3D' };

const pick = (values) => values.map(({ page, usage, min, max }) => ({ page, usage, min, max }));
const sorted = (set) => [...set].sort((a, b) => a - b);

// A small deterministic random generator, so a failure always reproduces.
function random(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    return s / 2 ** 31;
  };
}

test('the descriptor parser lays out the Extreme 3D Pro exactly as Windows does', () => {
  const parser = new HidDescriptorParser(EXTREME_DESCRIPTOR);
  const windows = new Extreme3DProParser().layout;
  // Same fields in the same order (Windows lists X and Y, declared together, as Y then X).
  assert.deepEqual(pick(parser.layout.values), pick(windows.values));
  assert.equal(parser.layout.reportLength, windows.reportLength);
  assert.equal(parser.layout.buttonCount, windows.buttonCount);
  assert.deepEqual(parser.layout.buttonReportIds, windows.buttonReportIds);
  assert.equal(parser.layout.values[2].hasNull, true); // the hat
  assert.equal(parser.layout.values[0].link, 1); // inside the logical collection
});

test('the descriptor parser reads every Extreme 3D Pro report as the hand-written reader does', () => {
  const parser = new HidDescriptorParser(EXTREME_DESCRIPTOR);
  const reference = new Extreme3DProParser();
  // The report captured from a real stick (core.test.js), without the report ID byte.
  const captured = Buffer.from([0x00, 0x22, 0x87, 0x7f, 0x00, 0xff, 0x00]);
  assert.deepEqual(parser.decode(captured).values, [456, 512, 8, 127, 255]);

  const next = random(42);
  for (let i = 0; i < 500; i++) {
    const report = Buffer.from(Array.from({ length: 7 }, () => Math.floor(next() * 256)));
    const ours = parser.decode(report);
    const theirs = reference.decode(report);
    assert.deepEqual(ours.values, theirs.values, report.toString('hex'));
    assert.deepEqual(sorted(ours.buttons), sorted(theirs.buttons), report.toString('hex'));
  }
});

test('a stick read from its descriptor gets the same photo layout and controls as on Windows', () => {
  const linux = describeDevice(new HidDescriptorParser(EXTREME_DESCRIPTOR).layout, EXTREME);
  const windows = describeDevice(new Extreme3DProParser().layout, EXTREME);
  assert.equal(linux.skin, windows.skin);
  assert.ok(linux.skin);
  assert.deepEqual(linux.axes, windows.axes);
  assert.deepEqual(linux.hats, windows.hats);
  assert.deepEqual(linux.buttons, windows.buttons);
});

// A throttle that sends two reports: ID 1 with X and buttons 1-8, ID 2 with a slider and
// buttons 9-16.
const TWO_REPORTS = Buffer.from([
  0x05, 0x01, 0x09, 0x04, 0xa1, 0x01, // Generic Desktop, Joystick, Collection (Application)
  0x85, 0x01, //                         Report ID (1)
  0x09, 0x30, 0x15, 0x00, 0x27, 0xff, 0xff, 0x00, 0x00, // X, Logical Maximum 65535 (4 bytes)
  0x75, 0x10, 0x95, 0x01, 0x81, 0x02,
  0x05, 0x09, 0x19, 0x01, 0x29, 0x08, 0x25, 0x01, 0x75, 0x01, 0x95, 0x08, 0x81, 0x02,
  0x85, 0x02, //                         Report ID (2)
  0x05, 0x01, 0x09, 0x36, 0x26, 0xff, 0x00, 0x75, 0x08, 0x95, 0x01, 0x81, 0x02,
  0x05, 0x09, 0x19, 0x09, 0x29, 0x10, 0x25, 0x01, 0x75, 0x01, 0x95, 0x08, 0x81, 0x02,
  0xc0,
]);

test('reports with different IDs each update their own fields, and buttons add up', () => {
  const parser = new HidDescriptorParser(TWO_REPORTS);
  assert.deepEqual(parser.layout.buttonReportIds, [1, 2]);
  assert.equal(parser.layout.buttonCount, 16);
  assert.equal(parser.layout.reportLength, 4); // ID + 16-bit X + 8 buttons
  assert.deepEqual(pick(parser.layout.values), [
    { page: 1, usage: 0x30, min: 0, max: 0xffff },
    { page: 1, usage: 0x36, min: 0, max: 255 },
  ]);

  let state = parser.decode(Buffer.from([0x01, 0x34, 0x12, 0b0000_0101]));
  assert.deepEqual(state.values, [0x1234, null]);
  assert.deepEqual(sorted(state.buttons), [1, 3]);

  state = parser.decode(Buffer.from([0x02, 200, 0b1000_0000]));
  assert.deepEqual(state.values, [0x1234, 200]); // X kept from report 1
  assert.deepEqual(sorted(state.buttons), [1, 3, 16]);

  state = parser.decode(Buffer.from([0x01, 0x00, 0x00, 0]));
  assert.deepEqual(sorted(state.buttons), [16]);
});

test('only the joystick collection is read, not a keyboard sharing the device', () => {
  const descriptor = Buffer.from([
    // A keyboard collection (report ID 1): 8 modifier bits and a 6-key array.
    0x05, 0x01, 0x09, 0x06, 0xa1, 0x01, 0x85, 0x01,
    0x05, 0x07, 0x19, 0xe0, 0x29, 0xe7, 0x15, 0x00, 0x25, 0x01, 0x75, 0x01, 0x95, 0x08, 0x81, 0x02,
    0x19, 0x00, 0x29, 0xff, 0x26, 0xff, 0x00, 0x75, 0x08, 0x95, 0x06, 0x81, 0x00,
    0xc0,
    // A joystick collection (report ID 2): Y and 4 buttons.
    0x05, 0x01, 0x09, 0x04, 0xa1, 0x01, 0x85, 0x02,
    0x09, 0x31, 0x15, 0x00, 0x26, 0xff, 0x00, 0x75, 0x08, 0x95, 0x01, 0x81, 0x02,
    0x05, 0x09, 0x19, 0x01, 0x29, 0x04, 0x25, 0x01, 0x75, 0x01, 0x95, 0x04, 0x81, 0x02,
    0x95, 0x04, 0x81, 0x03,
    0xc0,
  ]);
  const parser = new HidDescriptorParser(descriptor);
  assert.deepEqual(pick(parser.layout.values), [{ page: 1, usage: 0x31, min: 0, max: 255 }]);
  assert.equal(parser.layout.buttonCount, 4);
  assert.deepEqual(parser.layout.buttonReportIds, [2]);
  assert.equal(parser.layout.reportLength, 3);

  parser.decode(Buffer.from([0x01, 0xff, 4, 5, 6, 0, 0, 0])); // a keypress: ignored
  const state = parser.decode(Buffer.from([0x02, 77, 0b0010]));
  assert.deepEqual(state.values, [77]);
  assert.deepEqual(sorted(state.buttons), [2]);
});

test('signed axes read negative, and 0..255 written as 25 FF still means 255', () => {
  const descriptor = Buffer.from([
    0x05, 0x01, 0x09, 0x08, 0xa1, 0x01, // Multi-axis Controller
    0x09, 0x30, 0x15, 0x81, 0x25, 0x7f, 0x75, 0x08, 0x95, 0x01, 0x81, 0x02, // X: -127..127
    0x09, 0x32, 0x15, 0x00, 0x25, 0xff, 0x75, 0x08, 0x95, 0x01, 0x81, 0x02, // Z: 0..FF
    0x09, 0x35, 0x16, 0x00, 0x80, 0x26, 0xff, 0x7f, 0x75, 0x10, 0x95, 0x01, 0x81, 0x02, // Rz: -32768..32767
    0xc0,
  ]);
  const parser = new HidDescriptorParser(descriptor);
  assert.deepEqual(pick(parser.layout.values), [
    { page: 1, usage: 0x30, min: -127, max: 127 },
    { page: 1, usage: 0x32, min: 0, max: 255 },
    { page: 1, usage: 0x35, min: -32768, max: 32767 },
  ]);
  assert.deepEqual(parser.decode(Buffer.from([0xff, 0xff, 0x00, 0x80])).values, [-1, 255, -32768]);
  assert.deepEqual(parser.decode(Buffer.from([0x7f, 0x00, 0xff, 0x7f])).values, [127, 0, 32767]);
});

test('buttons sent as an array of pressed button numbers are read', () => {
  const descriptor = Buffer.from([
    0x05, 0x01, 0x09, 0x04, 0xa1, 0x01,
    0x05, 0x09, 0x19, 0x01, 0x29, 0x20, 0x15, 0x01, 0x25, 0x20, // Buttons 1-32, values 1..32
    0x75, 0x08, 0x95, 0x02, 0x81, 0x00, //                         two slots (Array)
    0xc0,
  ]);
  const parser = new HidDescriptorParser(descriptor);
  assert.equal(parser.layout.buttonCount, 32);
  assert.deepEqual(parser.layout.values, []);
  assert.deepEqual(sorted(parser.decode(Buffer.from([0, 0])).buttons), []);
  assert.deepEqual(sorted(parser.decode(Buffer.from([3, 0])).buttons), [3]);
  assert.deepEqual(sorted(parser.decode(Buffer.from([32, 5])).buttons), [5, 32]);
});

test('Push and Pop, 4-byte usages and usage ranges are understood', () => {
  const descriptor = Buffer.from([
    0x05, 0x01, 0x09, 0x04, 0xa1, 0x01,
    0x15, 0x00, 0x26, 0xff, 0x00, 0x75, 0x08, 0x95, 0x01,
    0xa4, //                               Push
    0x75, 0x10, 0x26, 0xff, 0x0f, //       Report Size (16), Logical Maximum (4095)
    0x19, 0x30, 0x29, 0x32, 0x95, 0x03, // Usage X..Z, Report Count (3)
    0x81, 0x02,
    0xb4, //                               Pop: back to 8 bits, 0..255, count 1
    0x05, 0x09, //                         Usage Page (Button)…
    0x0b, 0x36, 0x00, 0x01, 0x00, //       …but a 4-byte Usage (Generic Desktop: Slider)
    0x81, 0x02,
    0xc0,
  ]);
  const parser = new HidDescriptorParser(descriptor);
  // A range stays in ascending order.
  assert.deepEqual(pick(parser.layout.values), [
    { page: 1, usage: 0x30, min: 0, max: 4095 },
    { page: 1, usage: 0x31, min: 0, max: 4095 },
    { page: 1, usage: 0x32, min: 0, max: 4095 },
    { page: 1, usage: 0x36, min: 0, max: 255 },
  ]);
  const report = Buffer.from([0x01, 0x00, 0x02, 0x00, 0xff, 0x0f, 0x80]);
  assert.deepEqual(parser.decode(report).values, [1, 2, 4095, 128]);
});

test('a 4-byte usage range on a vendor page stays on that page', () => {
  const descriptor = Buffer.from([
    0x05, 0x01, 0x09, 0x04, 0xa1, 0x01,
    0x1b, 0x01, 0x00, 0x00, 0xff, // Usage Minimum (vendor page FF00, usage 1)
    0x29, 0x02, //                   Usage Maximum (2)
    0x15, 0x00, 0x26, 0xff, 0x00, 0x75, 0x08, 0x95, 0x02, 0x81, 0x02,
    0xc0,
  ]);
  assert.deepEqual(pick(new HidDescriptorParser(descriptor).layout.values), [
    { page: 0xff00, usage: 1, min: 0, max: 255 },
    { page: 0xff00, usage: 2, min: 0, max: 255 },
  ]);
});

test('a report too short for a field leaves that field as it was', () => {
  const parser = new HidDescriptorParser(EXTREME_DESCRIPTOR);
  parser.decode(Buffer.from([0x00, 0x22, 0x87, 0x7f, 0x00, 0xff, 0x00]));
  const { values } = parser.decode(Buffer.from([0xff, 0x03]));
  assert.deepEqual(values, [456, 1023, 8, 127, 255]); // only X fits
});

test('a stick with no joystick collection describes nothing rather than failing', () => {
  const { layout } = parseDescriptor(Buffer.from([0x05, 0x0c, 0x09, 0x01, 0xa1, 0x01, 0x09, 0xe9, 0x75, 0x08, 0x95, 0x01, 0x81, 0x02, 0xc0]));
  assert.deepEqual(layout, { reportLength: 1, values: [], buttonCount: 0, buttonReportIds: [] });
});

// ─── The virtual Xbox controller (uinput) ────────────────────────────────────

const EV_KEY = 1;
const EV_ABS = 3;
const eventValue = (events, type, code) => events.find(([t, c]) => t === type && c === code)?.[2];

test('uinput requests match <linux/uinput.h>', () => {
  assert.equal(UI_DEV_CREATE, 0x5501);
  assert.equal(UI_DEV_DESTROY, 0x5502);
  assert.equal(UI_DEV_SETUP, 0x405c5503);
  assert.equal(UI_ABS_SETUP, 0x401c5504);
  assert.equal(UI_SET_EVBIT, 0x40045564);
  assert.equal(UI_SET_KEYBIT, 0x40045565);
  assert.equal(UI_SET_ABSBIT, 0x40045567);
});

test('an Xbox report becomes the events the xpad driver would send', () => {
  const rest = padEvents(NEUTRAL_OUTPUT);
  assert.equal(eventValue(rest, EV_KEY, 0x130), 0);
  assert.equal(eventValue(rest, EV_ABS, 0x00), 0);
  assert.equal(eventValue(rest, EV_ABS, 0x10), 0);
  assert.deepEqual(rest.at(-1), [0, 0, 0]); // SYN_REPORT last

  const out = {
    buttons: XUSB.A | XUSB.RIGHT_SHOULDER | XUSB.START | XUSB.DPAD_UP | XUSB.DPAD_RIGHT,
    lt: 0,
    rt: 255,
    lx: -32768,
    ly: 32767, // pushed up (XInput: up is positive)
    rx: 32767,
    ry: -32768,
  };
  const events = padEvents(out);
  assert.equal(eventValue(events, EV_KEY, 0x130), 1); // BTN_A
  assert.equal(eventValue(events, EV_KEY, 0x131), 0); // BTN_B
  assert.equal(eventValue(events, EV_KEY, 0x137), 1); // BTN_TR
  assert.equal(eventValue(events, EV_KEY, 0x13b), 1); // BTN_START
  assert.equal(eventValue(events, EV_ABS, 0x00), -32768); // ABS_X
  assert.equal(eventValue(events, EV_ABS, 0x01), -32768); // ABS_Y: up is negative on Linux
  assert.equal(eventValue(events, EV_ABS, 0x03), 32767); // ABS_RX
  assert.equal(eventValue(events, EV_ABS, 0x04), 32767); // ABS_RY
  assert.equal(eventValue(events, EV_ABS, 0x02), 0); // ABS_Z (LT)
  assert.equal(eventValue(events, EV_ABS, 0x05), 255); // ABS_RZ (RT)
  assert.equal(eventValue(events, EV_ABS, 0x10), 1); // ABS_HAT0X: right
  assert.equal(eventValue(events, EV_ABS, 0x11), -1); // ABS_HAT0Y: up
});

test('events are written as 24-byte input_event records', () => {
  const buf = encodeEvents([
    [EV_ABS, 0x01, -32768],
    [0, 0, 0],
  ]);
  assert.equal(buf.length, 48);
  assert.equal(buf.readUInt16LE(16), EV_ABS);
  assert.equal(buf.readUInt16LE(18), 0x01);
  assert.equal(buf.readInt32LE(20), -32768);
  assert.ok(buf.subarray(0, 16).every((b) => b === 0)); // the kernel stamps the time
});

// A pretend /dev/uinput that records what the pad asks of it.
function fakeUinput({ openError = {}, failOn = null } = {}) {
  const calls = [];
  const system = {
    calls,
    writes: [],
    closed: [],
    open(file) {
      calls.push(['open', file]);
      if (openError[file]) throw Object.assign(new Error(openError[file]), { code: openError[file] });
      return 7;
    },
    ioctl(fd, request, arg) {
      calls.push(['ioctl', request, arg]);
      if (request === failOn) throw Object.assign(new Error('refused'), { errno: 22 });
    },
    write(fd, buffer) {
      if (system.failWrites) throw new Error('ENODEV');
      system.writes.push(buffer);
    },
    close(fd) {
      system.closed.push(fd);
    },
  };
  return system;
}

test('the pad plugs in as a wired Xbox 360 controller and sends reports', () => {
  const system = fakeUinput();
  const pad = new VirtualUinputPad({ system });
  pad.connect();
  assert.equal(pad.status.state, 'connected');

  const requests = system.calls.filter(([kind]) => kind === 'ioctl');
  const setup = requests.find(([, request]) => request === UI_DEV_SETUP)[2];
  assert.equal(setup.readUInt16LE(0), 0x03); // USB
  assert.equal(setup.readUInt16LE(2), 0x045e);
  assert.equal(setup.readUInt16LE(4), 0x028e);
  assert.equal(setup.toString('latin1', 8, 31), 'Microsoft X-Box 360 pad');
  assert.equal(requests.at(-1)[1], UI_DEV_CREATE); // created only once fully described
  const keys = requests.filter(([, request]) => request === UI_SET_KEYBIT).map(([, , code]) => code);
  assert.ok(keys.includes(0x130) && keys.includes(0x13c));
  const sticks = requests.filter(([, request]) => request === UI_ABS_SETUP).map(([, , buf]) => [buf.readUInt16LE(0), buf.readInt32LE(8), buf.readInt32LE(12)]);
  assert.deepEqual(sticks.find(([code]) => code === 0x01), [0x01, -32768, 32767]);
  assert.deepEqual(sticks.find(([code]) => code === 0x05), [0x05, 0, 255]);

  pad.submit({ ...NEUTRAL_OUTPUT, buttons: XUSB.B });
  assert.equal(system.writes.length, 1);
  assert.deepEqual(system.writes[0], encodeEvents(padEvents({ ...NEUTRAL_OUTPUT, buttons: XUSB.B })));

  pad.disconnect();
  assert.equal(pad.status.state, 'off');
  assert.equal(system.calls.at(-1)[1], UI_DEV_DESTROY);
  assert.deepEqual(system.closed, [7]);
});

test('without permission, or without uinput loaded, the pad asks for access', () => {
  for (const openError of [
    { '/dev/uinput': 'EACCES', '/dev/input/uinput': 'ENOENT' },
    { '/dev/uinput': 'ENOENT', '/dev/input/uinput': 'ENOENT' },
    { '/dev/uinput': 'EPERM', '/dev/input/uinput': 'ENOENT' },
  ]) {
    const pad = new VirtualUinputPad({ system: fakeUinput({ openError }) });
    pad.connect();
    assert.equal(pad.status.state, 'needs-access', JSON.stringify(openError));
    assert.match(pad.status.message, /Allow access/);
    pad.disconnect();
  }
});

test('a pad uinput refuses is an error, and its file is closed', () => {
  const system = fakeUinput({ failOn: UI_DEV_CREATE });
  const pad = new VirtualUinputPad({ system });
  pad.connect();
  assert.equal(pad.status.state, 'error');
  assert.deepEqual(system.closed, [7]);
  pad.disconnect();
});

test('a pad that stops taking reports is unplugged and reconnects', () => {
  const system = fakeUinput();
  const pad = new VirtualUinputPad({ system });
  pad.connect();
  system.failWrites = true;
  for (let i = 0; i < 4; i++) pad.submit(NEUTRAL_OUTPUT);
  assert.equal(pad.status.state, 'connected');
  pad.submit(NEUTRAL_OUTPUT);
  assert.equal(pad.status.state, 'error');
  assert.equal(pad.fd, null);
  pad.disconnect();
});

// ─── Allow access (udev rule) ─────────────────────────────────────────────────

test('the access rule allows uinput and exactly the joysticks plugged in', () => {
  const rules = accessRules([
    { vendorId: 0x046d, productId: 0xc215 },
    { vendorId: 0x231d, productId: 0x0200 },
    { vendorId: 0x046d, productId: 0xc215 }, // a second one of the same model
  ]);
  assert.match(rules, /^KERNEL=="uinput", SUBSYSTEM=="misc", OPTIONS\+="static_node=uinput", TAG\+="uaccess"$/m);
  assert.deepEqual(
    rules.split('\n').filter((line) => line.startsWith('SUBSYSTEM=="hidraw"')),
    ['SUBSYSTEM=="hidraw", KERNELS=="*:046D:C215.*", TAG+="uaccess"', 'SUBSYSTEM=="hidraw", KERNELS=="*:231D:0200.*", TAG+="uaccess"'],
  );
  assert.ok(RULES_FILE.startsWith('/etc/udev/rules.d/70-'));
});

test('allowing a new device keeps the ones allowed before, and ignores bad IDs', () => {
  const before = accessRules([{ vendorId: 0x046d, productId: 0xc215 }]);
  assert.deepEqual(allowedDevices(before), ['046D:C215']);
  const after = accessRules([{ vendorId: 0x044f, productId: 0xb687 }, { vendorId: -1, productId: 2 }, { vendorId: 'x' }], before);
  assert.deepEqual(allowedDevices(after), ['044F:B687', '046D:C215']);
  assert.deepEqual(allowedDevices(''), []);
});
