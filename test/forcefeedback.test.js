// The parts of vibration that can be checked without a force feedback stick: which
// sticks get the setting, how hard each motor shakes, and the structs DirectInput is
// handed, byte for byte as 64-bit Windows lays them out.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MOTORS, axesFormat, guidBuffer, magnitudeFor, productCode, sineEffect, ForceFeedback } from '../src/main/forcefeedback.js';
import { canVibrate } from '../src/shared/devices.js';

// Stands in for koffi.address: each buffer gets a made-up address, to be looked up again.
function addresses() {
  const known = new Map();
  const address = (buffer) => {
    if (!known.has(buffer)) known.set(buffer, BigInt(0x1000 * (known.size + 1)));
    return known.get(buffer);
  };
  const at = (value) => [...known].find(([, a]) => a === value)?.[0];
  return { address, at };
}

test('only the SideWinder Force Feedback 2 gets the vibration setting', () => {
  assert.equal(canVibrate(0x045e, 0x001b), true);
  assert.equal(canVibrate(0x046d, 0xc215), false); // Extreme 3D Pro: no motors
  assert.equal(canVibrate(0x046d, 0xc286), false); // Force 3D Pro: has them, but nobody has asked
  assert.equal(canVibrate(0x045e, 0x028e), false);
  assert.equal(canVibrate(0x1234, 0x5678), false);
});

test('a motor at full speed gets its share of the stick’s force, and none at rest', () => {
  assert.equal(magnitudeFor('large', 0), 0);
  assert.equal(magnitudeFor('small', 0), 0);
  assert.equal(magnitudeFor('large', 255), 6000);
  assert.equal(magnitudeFor('small', 255), 4000);
  assert.equal(magnitudeFor('large', 128), Math.round((128 / 255) * 6000));
  // Never past full force, whatever comes in.
  assert.equal(magnitudeFor('large', 999), 6000);
  assert.equal(magnitudeFor('large', -5), 0);
  assert.equal(magnitudeFor('large', undefined), 0);
  for (const motor of Object.values(MOTORS)) assert.ok(motor.strength > 0 && motor.strength <= 1);
});

test('a stick is found by the USB IDs at the start of its product GUID', () => {
  assert.equal(productCode(0x045e, 0x001b), 0x001b045e);
  assert.equal(productCode(0x046d, 0xc215), 0xc215046d); // stays unsigned
  assert.deepEqual([...guidBuffer('13541C23-8E33-11D0-9AD0-00A0C9A06E35')], [0x23, 0x1c, 0x54, 0x13, 0x33, 0x8e, 0xd0, 0x11, 0x9a, 0xd0, 0x00, 0xa0, 0xc9, 0xa0, 0x6e, 0x35]);
});

test('the data format names X and Y at the offsets the effects use', () => {
  const { address, at } = addresses();
  const { format, keep } = axesFormat(address);
  assert.equal(format.length, 32);
  assert.deepEqual([format.readUInt32LE(0), format.readUInt32LE(4), format.readUInt32LE(8), format.readUInt32LE(12), format.readUInt32LE(16)], [32, 24, 1, 8, 2]);
  const objects = at(format.readBigUInt64LE(24));
  assert.equal(objects.length, 48);
  assert.ok(keep.includes(objects));
  const axis = (i) => ({ guid: at(objects.readBigUInt64LE(i * 24)), offset: objects.readUInt32LE(i * 24 + 8), type: objects.readUInt32LE(i * 24 + 12) });
  assert.deepEqual(axis(0).guid, guidBuffer('A36D02E0-C9F3-11CF-BFC7-444553540000'));
  assert.deepEqual(axis(1).guid, guidBuffer('A36D02E1-C9F3-11CF-BFC7-444553540000'));
  assert.deepEqual([axis(0).offset, axis(1).offset], [0, 4]);
  assert.deepEqual([axis(0).type, axis(1).type], [0x80ffff03, 0x80ffff03]);
  // Everything the struct points at is kept alive with it.
  for (const guid of [axis(0).guid, axis(1).guid]) assert.ok(keep.includes(guid));
});

test('a motor’s effect is a sine wave on both axes that plays until stopped', () => {
  const { address, at } = addresses();
  const { effect, periodic, keep } = sineEffect(address, MOTORS.large);
  assert.equal(effect.length, 80);
  assert.equal(effect.readUInt32LE(0), 80); // dwSize
  assert.equal(effect.readUInt32LE(4), 0x12); // Cartesian, axes by offset
  assert.equal(effect.readUInt32LE(8), 0xffffffff); // no end
  assert.equal(effect.readUInt32LE(16), 10000); // full gain: the magnitude does the scaling
  assert.equal(effect.readUInt32LE(20), 0xffffffff); // no trigger button
  assert.equal(effect.readUInt32LE(28), 2);
  const axes = at(effect.readBigUInt64LE(32));
  const direction = at(effect.readBigUInt64LE(40));
  assert.deepEqual([axes.readUInt32LE(0), axes.readUInt32LE(4)], [0, 4]);
  assert.deepEqual([direction.readInt32LE(0), direction.readInt32LE(4)], MOTORS.large.direction);
  assert.equal(effect.readBigUInt64LE(48), 0n); // no envelope
  assert.equal(effect.readUInt32LE(56), 16);
  assert.equal(at(effect.readBigUInt64LE(64)), periodic);
  assert.equal(effect.readUInt32LE(72), 0);
  assert.ok(keep.includes(axes) && keep.includes(direction));
  // It starts silent; the period is the motor's.
  assert.deepEqual([periodic.readUInt32LE(0), periodic.readInt32LE(4), periodic.readUInt32LE(8), periodic.readUInt32LE(12)], [0, 0, 0, MOTORS.large.period]);
  // The small motor is the faster of the two, and shakes the other way.
  assert.ok(MOTORS.small.period < MOTORS.large.period);
  assert.notDeepEqual(MOTORS.small.direction, MOTORS.large.direction);
});

test('with no stick taken, setting the motors and closing do nothing', () => {
  const shaker = new ForceFeedback();
  const before = shaker.status.state;
  assert.ok(['off', 'unsupported'].includes(before));
  assert.equal(shaker.open, false);
  shaker.set(255, 255);
  shaker.set(0, 0);
  shaker.close();
  assert.equal(shaker.status.state, before);
});
