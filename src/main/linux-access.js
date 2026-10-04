// Linux: lets the signed-in user read their joysticks and create the virtual controller.
//
// Out of the box only root may open raw HID devices (/dev/hidraw*) and /dev/uinput. The
// Allow access button installs a udev rule that hands them to whoever is signed in at the
// screen (udev's "uaccess" tag), after one password prompt (pkexec). It's the Linux
// stand-in for installing ViGEmBus on Windows. The rule names the joysticks plugged in
// when the button is clicked (plus any allowed before), never every HID device, so
// keyboards stay private.
import { spawn } from 'node:child_process';
import fs from 'node:fs';

export const RULES_FILE = '/etc/udev/rules.d/70-joystick-mapper.rules';

const UINPUT_RULE = 'KERNEL=="uinput", SUBSYSTEM=="misc", OPTIONS+="static_node=uinput", TAG+="uaccess"';
// HID devices are named BUS:VENDOR:PRODUCT.N in sysfs, whatever the bus (USB, Bluetooth…).
const DEVICE_RULE = /^SUBSYSTEM=="hidraw", KERNELS=="\*:([0-9A-F]{4}):([0-9A-F]{4})\.\*", TAG\+="uaccess"$/gm;

const hex4 = (n) => n.toString(16).toUpperCase().padStart(4, '0');
const isId = (n) => Number.isInteger(n) && n >= 0 && n <= 0xffff;

// The devices an existing rules file already allows, as "VVVV:PPPP".
export function allowedDevices(text) {
  return [...String(text ?? '').matchAll(DEVICE_RULE)].map((m) => `${m[1]}:${m[2]}`);
}

// The rules file allowing `devices` ({ vendorId, productId }) and everything `existing`
// already allowed.
export function accessRules(devices, existing = '') {
  const keys = new Set(allowedDevices(existing));
  for (const d of devices) {
    if (isId(d.vendorId) && isId(d.productId)) keys.add(`${hex4(d.vendorId)}:${hex4(d.productId)}`);
  }
  return [
    '# Written by Joystick Mapper (its Allow access button). Delete this file to undo.',
    '',
    '# The virtual Xbox controller.',
    UINPUT_RULE,
    '',
    '# Joysticks, throttles and pedals, read over raw HID.',
    ...[...keys].sort().map((key) => {
      const [vendor, product] = key.split(':');
      return `SUBSYSTEM=="hidraw", KERNELS=="*:${vendor}:${product}.*", TAG+="uaccess"`;
    }),
    '',
  ].join('\n');
}

// Runs as root through pkexec. The rules arrive on stdin, so nothing from the app is
// pasted into the command itself. Re-triggering udev applies them to what's plugged in.
const SCRIPT = `set -e
cat > ${RULES_FILE}.new
mv ${RULES_FILE}.new ${RULES_FILE}
modprobe uinput 2>/dev/null || true
udevadm control --reload-rules
udevadm trigger --action=change --subsystem-match=hidraw
udevadm trigger --action=change --subsystem-match=misc --sysname-match=uinput
udevadm settle --timeout=10 || true`;

// Asks for the password and installs the rule. Resolves to 'granted', 'cancelled' (the
// prompt was dismissed) or 'failed' (no pkexec, no password agent, or the script failed).
export function grantAccess(devices) {
  let existing = '';
  try {
    existing = fs.readFileSync(RULES_FILE, 'utf8');
  } catch {
    // First time.
  }
  const rules = accessRules(devices, existing);
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn('pkexec', ['/bin/sh', '-c', SCRIPT], { stdio: ['pipe', 'ignore', 'ignore'] });
    } catch {
      resolve('failed');
      return;
    }
    child.on('error', () => resolve('failed'));
    child.on('close', (code) => resolve(code === 0 ? 'granted' : code === 126 ? 'cancelled' : 'failed'));
    child.stdin.on('error', () => {});
    child.stdin.end(rules);
  });
}
