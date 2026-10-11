// Hides the real joysticks from games while the virtual Xbox controller stands in for
// them, with HidHide (https://github.com/nefarius/HidHide). A game that reads the stick
// itself otherwise gets every press twice, once from the stick and once from the virtual
// controller, and its own idea of the buttons wins (GitHub issues #36 and #41).
//
// HidHide is a driver that keeps two lists: the devices to hide, and the programs that may
// still see them. This talks to it through its own command-line tool, and takes off its
// device list only what it put there: never an entry the user, or another program, added.
// Windows only.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const HIDHIDE_DOWNLOAD_URL = 'https://github.com/nefarius/HidHide/releases/latest';

const CLI = 'HidHideCLI.exe';
const REGISTRY_KEY = 'HKLM\\SOFTWARE\\Nefarius Software Solutions e.U.\\HidHide';
const CALL_TIMEOUT_MS = 8000;
// Windows' own error number for "access denied": HidHide lets one program talk to it at a
// time, so this is what its tool exits with while its settings window is open.
const ERROR_ACCESS_DENIED = 5;

// The name HidHide knows a joystick by, from the path it is opened with:
// \\?\HID#VID_044F&PID_B10A#7&2a2d0f4e&0&0000#{4d1e55b2-…} -> HID\VID_044F&PID_B10A\7&2A2D0F4E&0&0000
// (HidHide compares them without regard to case). Null for anything that isn't such a
// path: an Xbox controller read through XInput, or a device on Linux.
export function instancePath(devicePath) {
  const match = /^\\\\[?.]\\(HID#.+?)(?:#\{[0-9a-f-]+\}(?:\\.*)?)?$/i.exec(devicePath ?? '');
  return match ? match[1].replaceAll('#', '\\').toUpperCase() : null;
}

// Where HidHide's installer says it put itself, for an install outside Program Files.
function registryFolder() {
  try {
    const out = execFileSync('reg.exe', ['query', REGISTRY_KEY, '/v', 'Path'], { windowsHide: true, encoding: 'utf8', timeout: 4000 });
    return /REG_SZ\s+(.+?)\s*$/m.exec(out)?.[1] ?? null;
  } catch {
    return null;
  }
}

// HidHide's command-line tool, or null when HidHide isn't installed. Its folder has moved
// between versions: under an "x64" folder up to 1.5, beside the driver after that.
export function findCli({ env = process.env, exists = fs.existsSync, registry = registryFolder } = {}) {
  const programs = [...new Set([env.ProgramW6432, env.ProgramFiles, 'C:\\Program Files'].filter(Boolean))];
  const folders = programs.flatMap((root) =>
    ['Nefarius Software Solutions', 'Nefarius Software Solutions e.U'].map((maker) => path.win32.join(root, maker, 'HidHide')),
  );
  const candidates = (folder) => [path.win32.join(folder, 'x64', CLI), path.win32.join(folder, CLI)];
  return folders.flatMap(candidates).find(exists) ?? [registry()].filter(Boolean).flatMap(candidates).find(exists) ?? null;
}

// The tool writes wide text, which arrives as plain bytes or as UTF-16 depending on its version.
function decode(bytes) {
  const wide = bytes.length > 1 && bytes[1] === 0;
  return bytes.toString(wide ? 'utf16le' : 'latin1');
}

// Runs the tool with `args` and resolves to { code, out, err }; code is null when it
// couldn't be started. Its input must not be a pipe: it would wait on one for more commands.
function runCli(cli, args) {
  return new Promise((resolve) => {
    const out = [];
    const err = [];
    let child;
    try {
      child = spawn(cli, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], timeout: CALL_TIMEOUT_MS });
    } catch {
      return resolve({ code: null, out: '', err: '' });
    }
    child.stdout.on('data', (chunk) => out.push(chunk));
    child.stderr.on('data', (chunk) => err.push(chunk));
    child.on('error', () => resolve({ code: null, out: '', err: '' }));
    child.on('close', (code) => resolve({ code, out: decode(Buffer.concat(out)), err: decode(Buffer.concat(err)) }));
  });
}

// What the tool printed for "--cloak-state --inv-state --dev-list": whether hiding is
// switched on at all, whether its program list is turned round to mean "these may not
// see", and the devices hidden now.
export function parseState(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  return {
    cloak: lines.includes('--cloak-on'),
    inverse: lines.includes('--inv-on'),
    hidden: lines.map((line) => /^--dev-hide "(.+)"$/.exec(line)?.[1]).filter(Boolean),
  };
}

const same = (a, b) => a.toUpperCase() === b.toUpperCase();

// States: missing (HidHide isn't installed) | restart (installed, but its driver isn't
// answering: Windows hasn't restarted since) | busy (its own settings window is open) |
// ready.
export class HidHide {
  constructor({ locate = findCli, run = runCli, runSync = spawnSync } = {}) {
    this.locate = locate;
    this.run = run;
    this.runSync = runSync;
  }

  // { state }, and when ready also { cloak, inverse, hidden } (see parseState).
  async read() {
    const cli = this.locate();
    if (!cli) return { state: 'missing' };
    const result = await this.run(cli, ['--cloak-state', '--inv-state', '--dev-list']);
    if (result.code === null) return { state: 'missing' };
    // The tool exits cleanly even when it only printed a complaint, so look for its answer.
    if (result.code !== 0 || !/--cloak-o(n|ff)/.test(result.out)) {
      return { state: result.code === ERROR_ACCESS_DENIED ? 'busy' : 'restart', detail: result.err.trim() };
    }
    return { state: 'ready', ...parseState(result.out) };
  }

  // Hides `devices` (see instancePath) from every program but `exe`, and switches hiding
  // on. `state` is what read() returned just before. Resolves true if HidHide took it.
  async hide(state, exe, devices) {
    const cli = this.locate();
    if (!cli) return false;
    // With the program list turned round, being on it is what would shut this app out.
    const allow = [state.inverse ? '--app-unreg' : '--app-reg', exe];
    const result = await this.run(cli, [...allow, ...devices.flatMap((device) => ['--dev-hide', device]), '--cloak-on']);
    return result.code === 0 && result.err.trim() === '';
  }

  // Shows `devices` again. Hiding itself is left switched on: with nothing of ours listed
  // it does nothing, and the user may be hiding other devices with it.
  async unhide(devices) {
    const cli = this.locate();
    if (!cli || devices.length === 0) return devices.length === 0;
    const result = await this.run(cli, devices.flatMap((device) => ['--dev-unhide', device]));
    return result.code === 0 && result.err.trim() === '';
  }

  // The same, without returning until it is done: for when the app is closing.
  unhideSync(devices) {
    const cli = this.locate();
    if (!cli || devices.length === 0) return devices.length === 0;
    try {
      const result = this.runSync(cli, devices.flatMap((device) => ['--dev-unhide', device]), {
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'pipe'],
        timeout: 4000,
      });
      return result.status === 0 && decode(result.stderr ?? Buffer.alloc(0)).trim() === '';
    } catch {
      return false;
    }
  }
}

// What to do to get from what is hidden to what should be. `wanted`: the devices to hide
// now. `ours`: the ones this app hid before and hasn't shown again. `hidden`: HidHide's
// own list. A wanted device someone else already hid is left as theirs.
//   add   to hide now
//   drop  to show again
//   ours  what this app answers for once both are done
export function planHiding({ wanted, ours, hidden }) {
  const has = (list, device) => list.some((other) => same(other, device));
  const add = wanted.filter((device) => !has(hidden, device));
  const drop = ours.filter((device) => !has(wanted, device));
  const kept = ours.filter((device) => has(wanted, device) && has(hidden, device));
  return { add, drop, ours: [...kept, ...add] };
}
