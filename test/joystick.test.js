import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { JoystickManager } from '../src/main/joystick.js';
import { findPadSlot } from '../src/main/vigem.js';

// ─── A pretend HID layer ──────────────────────────────────────────────────────
// Devices are plain listings; a "report" is already { values, buttons }.

const AXES = { values: [{ page: 1, usage: 0x30, min: 0, max: 1023 }, { page: 1, usage: 0x32, min: 0, max: 1023 }], buttonCount: 4 };

const device = (path, vendorId, productId, product, extra = {}) => ({
  path,
  vendorId,
  productId,
  product,
  manufacturer: '',
  usagePage: 1,
  usage: 4,
  layout: AXES,
  ...extra,
});

const STICK = device('usb-1', 0x046d, 0xc215, 'Logitech Extreme 3D');
const THROTTLE = device('usb-2', 0x044f, 0xb687, 'TWCS Throttle');
const GAMEPAD = device('usb-9', 0x045e, 0x02ea, 'Xbox pad', { usage: 5 });
const DUALSENSE = device('usb-7', 0x054c, 0x0ce6, 'DualSense Wireless Controller', { usage: 5, manufacturer: 'Sony Interactive Entertainment' });

function rig(...listing) {
  const handles = new Map();
  const backend = {
    listing,
    list: async () => backend.listing,
    open: async (path) => {
      const handle = Object.assign(new EventEmitter(), { close() {} });
      handles.set(path, handle);
      return handle;
    },
    createParser: (info) => ({ layout: info.layout, decode: (report) => report, close() {} }),
  };
  const manager = new JoystickManager({ backend });
  const seen = { state: null, statuses: 0 };
  manager.on('state', (state) => (seen.state = state));
  manager.on('status', () => seen.statuses++);
  manager.stopped = false;
  const report = (dev, values, buttons = []) => handles.get(dev.path).emit('data', { values, buttons: new Set(buttons) });
  return { backend, manager, seen, report, handles };
}

const roleOf = (manager, id) => manager.status.devices.find((d) => d.id === id)?.role;

test('a stick and a throttle are read together, each under its role', async () => {
  const { manager, seen, report } = rig(STICK, THROTTLE, GAMEPAD);
  await manager.scan();
  assert.equal(manager.status.state, 'connected');
  assert.deepEqual(manager.status.devices.map((d) => [d.id, d.role]), [
    ['046d:c215', 'stick'],
    ['044f:b687', 'throttle'],
  ]);
  // The screen starts on the stick.
  assert.equal(manager.status.device.id, '046d:c215');
  assert.equal(manager.status.device.role, 'stick');

  report(STICK, [1023, 0], [1]);
  assert.equal(seen.state.axes.x, 1);
  assert.equal(seen.state.buttons.btn1, true);
  assert.equal('throttle.z' in seen.state.axes, false); // the throttle hasn't said anything yet

  report(THROTTLE, [512, 0], [3]);
  assert.equal(seen.state.axes['throttle.z'], 1); // Z reads forward-positive
  assert.equal(seen.state.buttons['throttle.btn3'], true);
  assert.equal(seen.state.axes.x, 1); // the stick is still where it was
  assert.equal(seen.state.buttons.btn3, false);
  await manager.stop();
});

test('a PlayStation controller is read, as an extra beside a stick and as the stick on its own', async () => {
  const { backend, manager, seen, report } = rig(DUALSENSE, STICK, GAMEPAD);
  await manager.scan();
  assert.deepEqual(manager.status.devices.map((d) => [d.id, d.role, d.skin]), [
    ['054c:0ce6', 'extra', 'dualsense'],
    ['046d:c215', 'stick', 'extreme3dpro'],
  ]);
  assert.equal(manager.status.device.id, '046d:c215'); // the screen still starts on the stick
  report(DUALSENSE, [1023, 0], [2]);
  assert.equal(seen.state.buttons['extra.btn2'], true);
  assert.equal('btn2' in seen.state.buttons, false);

  backend.listing = [DUALSENSE];
  manager.savedRoles = {};
  await manager.scan();
  assert.deepEqual(manager.status.devices.map((d) => [d.id, d.role]), [['054c:0ce6', 'stick']]);
  assert.equal(manager.status.device.name, 'DualSense');
  await manager.stop();
});

test('the list of devices is asked to leave out the virtual pad, and whatever cannot be told from it', async () => {
  const { backend, manager } = rig(STICK);
  let skip = null;
  backend.list = async (skipPad) => {
    skip = skipPad;
    return backend.listing;
  };
  manager.padSlot = () => 1;
  await manager.scan();
  assert.deepEqual([0, 1, 2, 3].map((slot) => skip(slot)), [false, true, false, false]);
  manager.padSlot = () => null;
  assert.deepEqual([0, 1, 2, 3].map((slot) => skip(slot)), [false, false, false, false]);
  // Slot not known yet: only a controller that was already being read is kept.
  manager.padSlot = () => 'unknown';
  assert.deepEqual([0, 1, 2, 3].map((slot) => skip(slot)), [true, true, true, true]);
  manager.open.set('045e:028e', { info: { path: 'xinput:2' }, parser: { close() {} }, hid: { close() {} }, model: { id: '045e:028e' } });
  assert.deepEqual([0, 1, 2, 3].map((slot) => skip(slot)), [true, true, false, true]);
  manager.open.delete('045e:028e');
  await manager.stop();
});

test('unplugging the throttle leaves the stick working, and plugging it back restores it', async () => {
  const { backend, manager, seen, report } = rig(STICK, THROTTLE);
  await manager.scan();
  report(STICK, [0, 0], [2]);
  report(THROTTLE, [512, 0], [3]);

  backend.listing = [STICK];
  await manager.scan();
  assert.deepEqual(manager.status.devices.map((d) => d.id), ['046d:c215']);
  assert.equal(seen.state.buttons.btn2, true);
  assert.equal('throttle.z' in seen.state.axes, false);
  assert.equal('throttle.btn3' in seen.state.buttons, false);

  backend.listing = [STICK, THROTTLE];
  await manager.scan();
  assert.equal(roleOf(manager, '044f:b687'), 'throttle');
  report(THROTTLE, [512, 1023], []);
  assert.equal(seen.state.axes['throttle.z'], -1);
  await manager.stop();
});

test('a device that stops answering drops out without waiting for the next scan', async () => {
  const { manager, seen, report, handles } = rig(STICK, THROTTLE);
  await manager.scan();
  report(STICK, [1023, 0], []);
  report(THROTTLE, [512, 0], []);
  handles.get(THROTTLE.path).emit('error', new Error('gone'));
  assert.equal('throttle.z' in seen.state.axes, false);
  assert.equal(seen.state.axes.x, 1);
  assert.equal(manager.status.state, 'connected');
  await manager.stop();
});

test('swapping roles moves each device’s controls at once', async () => {
  const { manager, seen, report } = rig(STICK, THROTTLE);
  await manager.scan();
  report(STICK, [1023, 0], [1]);
  report(THROTTLE, [512, 0], [3]);

  await manager.setRoles({ '046d:c215': 'throttle', '044f:b687': 'stick' });
  assert.equal(roleOf(manager, '046d:c215'), 'throttle');
  assert.equal(roleOf(manager, '044f:b687'), 'stick');
  // No new reports were needed: the last ones are re-read under the new roles.
  assert.equal(seen.state.buttons['throttle.btn1'], true);
  assert.equal(seen.state.axes['throttle.x'], 1);
  assert.equal(seen.state.buttons.btn3, true);
  assert.equal(seen.state.buttons.btn1, false);
  await manager.stop();
});

test('the screen follows the chosen device while it is plugged in', async () => {
  const { backend, manager } = rig(STICK, THROTTLE);
  manager.preferredId = '044f:b687';
  await manager.scan();
  assert.equal(manager.status.device.id, '044f:b687');
  assert.equal(manager.status.device.role, 'throttle');
  manager.select('046d:c215');
  assert.equal(manager.status.device.id, '046d:c215');

  manager.select('044f:b687');
  backend.listing = [STICK];
  await manager.scan();
  assert.equal(manager.status.device.id, '046d:c215'); // back to the stick
  await manager.stop();
});

test('two of the same model are told apart, and status is only sent when it changes', async () => {
  const { manager, seen, report } = rig(STICK, { ...STICK, path: 'usb-3' });
  await manager.scan();
  assert.deepEqual(manager.status.devices.map((d) => [d.id, d.key, d.role]), [
    ['046d:c215', '046d:c215', 'stick'],
    ['046d:c215#2', '046d:c215', 'throttle'],
  ]);
  report({ path: 'usb-3' }, [0, 0], [4]);
  assert.equal(seen.state.buttons['throttle.btn4'], true);

  const sent = seen.statuses;
  await manager.scan();
  await manager.scan();
  assert.equal(seen.statuses, sent);
  await manager.stop();
});

test('a device that cannot be opened is reported, and the others still work', async () => {
  const { backend, manager, seen, report } = rig(STICK, THROTTLE);
  const open = backend.open;
  backend.open = async (path) => {
    if (path === THROTTLE.path) throw new Error('in use');
    return open(path);
  };
  await manager.scan();
  assert.equal(manager.status.state, 'connected');
  assert.match(manager.status.devices[1].problem, /in use/);
  report(STICK, [1023, 0], []);
  assert.equal(seen.state.axes.x, 1);

  // Nothing at all opening is an error state with the reason.
  backend.listing = [THROTTLE];
  await manager.scan();
  assert.equal(manager.status.state, 'error');
  assert.match(manager.status.message, /in use/);
  assert.equal(manager.status.device, null);
  await manager.stop();
});

test('on Linux, a device without permission asks for access instead of failing', async () => {
  const { backend, manager, report } = rig(STICK, THROTTLE);
  const open = backend.open;
  let allowed = false;
  backend.open = async (path) => {
    if (path === THROTTLE.path && !allowed) throw Object.assign(new Error('click Allow access to use it'), { code: 'EACCES' });
    return open(path);
  };
  await manager.scan();
  assert.equal(manager.status.state, 'connected');
  assert.equal(manager.status.needsAccess, true);
  assert.match(manager.status.devices[1].problem, /Allow access/);

  // Only the throttle, still locked: the whole status says so.
  backend.listing = [THROTTLE];
  await manager.scan();
  assert.equal(manager.status.state, 'needs-access');

  // Access granted: the next scan opens it.
  allowed = true;
  await manager.scan();
  assert.equal(manager.status.state, 'connected');
  assert.equal(manager.status.needsAccess, false);
  report(THROTTLE, [1023, 0], []);
  await manager.stop();
});

// ─── Telling the virtual pad from real controllers ───────────────────────────

// Pretend XInput: `slots` holds what each of the four slots shows, and the virtual pad's
// reports turn up in `own` (once `after` readings have gone by, as when Windows is slow
// to list a new pad).
const AT_REST = { buttons: 0, lt: 0, rt: 0, lx: 0, ly: 0, rx: 0, ry: 0 };
function xinput(slots, own, after = 0) {
  let last = AT_REST;
  let readings = 0;
  const sent = [];
  return {
    sent,
    send: (report) => {
      sent.push(report);
      last = report;
    },
    read: () => slots.map((state, slot) => (slot === own && readings++ >= after ? { ...last } : state)),
    wait: async () => {},
  };
}

test('the virtual pad finds its own slot, whatever real controllers sit beside it', async () => {
  const idle = { ...AT_REST };
  const drifting = { ...AT_REST, lx: -3356, ly: 811 };
  // Alone, and behind one or two real controllers.
  assert.equal(await findPadSlot(xinput([null, null, null, null], 0)), 0);
  assert.equal(await findPadSlot(xinput([drifting, null, null, null], 1)), 1);
  assert.equal(await findPadSlot(xinput([idle, drifting, null, null], 2)), 2);
  // A real controller plugged in later can sit in a higher slot than the pad.
  assert.equal(await findPadSlot(xinput([null, idle, null, null], 0)), 0);
  // A controller that happens to rest on the first mark is not mistaken for the pad: it
  // doesn't follow to the second.
  const lookalike = { ...AT_REST, lx: 3, ly: -5, rx: 7, ry: -2 };
  assert.equal(await findPadSlot(xinput([lookalike, null, null, null], 1)), 1);

  // Windows can take a moment to list the pad: it is found once it shows.
  const slow = xinput([drifting, null, null, null], 1, 5);
  assert.equal(await findPadSlot(slow), 1);
  // Whatever happened, the pad is left at rest, and was only ever shown tiny stick moves.
  assert.deepEqual(slow.sent.at(-1), AT_REST);
  for (const report of slow.sent) {
    assert.deepEqual([report.buttons, report.lt, report.rt], [0, 0, 0]);
    for (const axis of ['lx', 'ly', 'rx', 'ry']) assert.ok(Math.abs(report[axis]) <= 8, `${axis} = ${report[axis]}`);
  }
});

test('a pad XInput never shows has no slot, and the search stops when the pad is unplugged', async () => {
  // All four slots already taken by real controllers: the pad gets none.
  const full = xinput([{ ...AT_REST }, { ...AT_REST }, { ...AT_REST }, { ...AT_REST }], -1);
  assert.equal(await findPadSlot({ ...full, tries: 3 }), null);
  assert.deepEqual(full.sent.at(-1), AT_REST);

  // Unplugged part-way: nothing more is sent to it.
  const gone = xinput([null, null, null, null], -1);
  let alive = true;
  const search = findPadSlot({ ...gone, there: () => alive, wait: async () => (alive = false) });
  assert.equal(await search, null);
  assert.equal(gone.sent.length, 1);

  // No XInput to look in: nothing is sent, and no time is spent looking.
  const sent = [];
  let waits = 0;
  assert.equal(await findPadSlot({ send: (report) => sent.push(report), read: () => null, wait: async () => waits++ }), null);
  assert.deepEqual([sent.length, waits], [0, 0]);
});
