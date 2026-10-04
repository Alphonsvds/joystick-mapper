import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { JoystickManager } from '../src/main/joystick.js';

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
