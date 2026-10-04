// Finds and reads joysticks over raw HID. Any stick is understood from its own
// description, through Windows' HID parser (hidp.js) or, on Linux, ours
// (hiddescriptor.js), so sticks we've never seen work without per-model code. Every
// joystick plugged in is read at once (a stick, a throttle, pedals…) and they are merged
// into one input, each under its role. Runs in the main process so input keeps flowing
// while a game has focus.
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import HID from 'node-hid';
import { ROLES, rolePrefix } from '../shared/controls.js';
import { assignRoles, deviceKey, describeDevice, isCentered, mergeInputs, normalizeInput } from '../shared/devices.js';
import { HidDescriptorParser } from './hiddescriptor.js';
import { HidParser } from './hidp.js';
import { EXTREME_3D_PRO_IDS, Extreme3DProParser } from './devices/extreme3dpro.js';

const RESCAN_MS = 1500;
const USAGE_PAGE_GENERIC = 0x01;
const USAGE_JOYSTICK = 0x04;
const USAGE_MULTI_AXIS = 0x08;
const VIRTUAL_PAD = { vendorId: 0x045e, productId: 0x028e }; // our own ViGEm Xbox 360 pad

// Flight sticks, throttles and pedals — not gamepads. XInput pads (like the virtual pad
// this app creates) show up with "&IG_" in their path; reading them would loop.
function isJoystick(d) {
  if (d.usagePage !== USAGE_PAGE_GENERIC || (d.usage !== USAGE_JOYSTICK && d.usage !== USAGE_MULTI_AXIS)) return false;
  if (/&ig_/i.test(d.path ?? '')) return false;
  return !(d.vendorId === VIRTUAL_PAD.vendorId && d.productId === VIRTUAL_PAD.productId);
}

// "Logitech" + "Logitech Extreme 3D" -> "Logitech Extreme 3D" (many sticks repeat their maker).
function displayName(d) {
  const maker = (d.manufacturer ?? '').trim();
  const product = (d.product ?? '').trim();
  const name = maker && !product.toLowerCase().startsWith(maker.toLowerCase()) ? `${maker} ${product}` : product || maker;
  return name.trim() || deviceKey(d.vendorId, d.productId);
}

// The joysticks in a HID listing. `key` is vendor:product; `id` is unique among them: the
// key, or key#2… for another device of the same model.
function identify(listing) {
  const seen = new Set();
  const count = {};
  const devices = [];
  for (const d of listing) {
    if (!isJoystick(d) || seen.has(d.path)) continue;
    seen.add(d.path);
    const key = deviceKey(d.vendorId, d.productId);
    count[key] = (count[key] ?? 0) + 1;
    devices.push({ ...d, key, id: count[key] === 1 ? key : `${key}#${count[key]}`, name: displayName(d) });
  }
  return devices;
}

// close() may throw or reject when the device has already vanished.
const closeQuietly = (hid) => Promise.resolve().then(() => hid.close()).catch(() => {});

function createParser(info) {
  if (process.platform === 'win32') return HidParser.open(info.path);
  if (process.platform === 'linux') return HidDescriptorParser.open(info.path);
  if (info.vendorId === EXTREME_3D_PRO_IDS.vendorId && info.productId === EXTREME_3D_PRO_IDS.productId) {
    return new Extreme3DProParser();
  }
  throw new Error('Only the Logitech Extreme 3D Pro is supported on this OS so far');
}

// On Linux a joystick opens only once the Allow access rule covers it (see
// linux-access.js). hidapi's own error doesn't say why, so check first.
function openHid(path) {
  if (process.platform === 'linux') {
    try {
      fs.accessSync(path, fs.constants.R_OK | fs.constants.W_OK);
    } catch {
      throw Object.assign(new Error('click Allow access to use it'), { code: 'EACCES' });
    }
  }
  return HID.HIDAsync.open(path);
}

// How devices are listed, opened and understood. Tests swap in a fake.
const hidBackend = {
  list: () => HID.devicesAsync(),
  open: openHid,
  createParser,
};

export class JoystickManager extends EventEmitter {
  constructor({ ignoreSkins = false, backend = hidBackend } = {}) {
    super();
    this.ignoreSkins = ignoreSkins;
    this.backend = backend;
    this.devices = []; // joysticks currently plugged in
    this.roles = {}; // their roles: { [id]: role }
    this.savedRoles = {}; // roles remembered or chosen before, owned by main.js
    this.preferredId = null; // the device the UI shows, while it's plugged in
    this.settings = {}; // per-device { centered, calibration }, owned by main.js
    // id -> { info, hid, parser, model, role, lastRaw, lastButtons, lastReport, state }
    this.open = new Map();
    this.problems = new Map(); // id -> { state, message } for devices that couldn't be opened
    this.fault = null; // { state, message } when the devices couldn't even be listed
    this.busy = Promise.resolve();
    this.timer = null;
    this.stopped = true;
    this.published = '';
    this.status = { state: 'searching', message: '', device: null, devices: [] };
  }

  start() {
    this.stopped = false;
    this.scan();
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.serial(() => Promise.all([...this.open.keys()].map((id) => this.close(id))));
  }

  // The device the UI shows: the chosen one while it's plugged in, otherwise the stick.
  get view() {
    const open = [...this.open.values()];
    return this.open.get(this.preferredId) ?? ROLES.map((role) => open.find((d) => d.role === role)).find(Boolean) ?? null;
  }

  get model() {
    return this.view?.model ?? null;
  }

  get models() {
    return [...this.open.values()].map((d) => d.model);
  }

  settingsFor(id) {
    return this.settings[id] ?? {};
  }

  setSettings(all) {
    this.settings = all;
  }

  // Every open device's state as one input (see mergeInputs).
  input() {
    return mergeInputs([...this.open.values()].map((d) => d.state).filter(Boolean));
  }

  // Tells main.js (and through it the UI) what is plugged in, whenever that changes.
  publish() {
    const view = this.view;
    const problem = this.fault ?? this.problems.values().next().value;
    this.status = {
      state: this.open.size ? 'connected' : (problem?.state ?? 'searching'),
      message: this.open.size ? '' : (problem?.message ?? ''),
      // Linux: a device is waiting for the Allow access button.
      needsAccess: [...this.problems.values()].some((p) => p.state === 'needs-access'),
      device: view ? { ...view.model, role: view.role } : null,
      devices: this.devices.map((d) => {
        const model = this.open.get(d.id)?.model;
        return {
          id: d.id,
          key: d.key,
          name: model?.name ?? d.name,
          role: this.roles[d.id] ?? null,
          skin: model?.skin ?? null,
          support: model?.support ?? null,
          problem: this.problems.get(d.id)?.message ?? '',
        };
      }),
    };
    const signature = JSON.stringify(this.status);
    if (signature === this.published) return;
    this.published = signature;
    this.emit('status', this.status);
  }

  scheduleScan() {
    clearTimeout(this.timer);
    if (!this.stopped) this.timer = setTimeout(() => this.scan(), RESCAN_MS);
  }

  // Scans and role changes both open and close devices, so they take turns.
  serial(task) {
    const run = this.busy.then(task);
    this.busy = run.catch(() => {});
    return run;
  }

  async scan() {
    if (this.stopped) return;
    try {
      const devices = identify(await this.backend.list());
      this.fault = null;
      await this.serial(() => this.sync(devices));
    } catch (err) {
      this.fault = { state: 'error', message: err.message };
      this.publish();
    }
    this.scheduleScan();
  }

  // Brings the open devices in line with what is plugged in and the roles they have:
  // opens every device with a role, closes the ones that were unplugged or lost theirs.
  async sync(devices = this.devices) {
    if (this.stopped) return;
    this.devices = devices;
    this.roles = assignRoles(devices, this.savedRoles);
    let changed = false;
    for (const [id, dev] of [...this.open]) {
      const role = this.roles[id];
      if (!role || devices.find((d) => d.id === id).path !== dev.info.path) {
        await this.close(id);
      } else if (role !== dev.role) {
        dev.role = role;
        dev.state = this.normalize(dev);
      } else continue;
      changed = true;
    }
    for (const info of devices) {
      if (this.roles[info.id] && !this.open.has(info.id)) await this.openDevice(info, this.roles[info.id]);
    }
    for (const id of [...this.problems.keys()]) if (!this.roles[id]) this.problems.delete(id);
    if (changed) this.emit('state', this.input());
    this.publish();
  }

  // A device's last report as normalised input, under its current role and settings.
  normalize(dev) {
    if (!dev.lastRaw) return null;
    const decoded = { values: dev.lastRaw, buttons: dev.lastButtons };
    return normalizeInput(decoded, dev.model, this.settingsFor(dev.model.id), rolePrefix(dev.role));
  }

  async openDevice(info, role) {
    let parser;
    try {
      parser = this.backend.createParser(info);
    } catch (err) {
      this.problems.set(info.id, { state: 'unsupported', message: `${info.name}: ${err.message}` });
      return;
    }
    const described = describeDevice(parser.layout, {
      vendorId: info.vendorId,
      productId: info.productId,
      name: info.name,
      ignoreSkin: this.ignoreSkins,
    });
    let hid;
    try {
      hid = await this.backend.open(info.path);
    } catch (err) {
      parser.close();
      const state = err.code === 'EACCES' ? 'needs-access' : 'error';
      this.problems.set(info.id, { state, message: `${info.name}: ${err.message}` });
      return;
    }
    if (this.stopped) {
      parser.close();
      await closeQuietly(hid);
      return;
    }
    const model = { ...described, id: info.id };
    const dev = { info, hid, parser, model, role, lastRaw: null, lastButtons: null, lastReport: null, state: null };
    this.open.set(info.id, dev);
    this.problems.delete(info.id);
    hid.on('data', (report) => {
      if (this.open.get(info.id) !== dev) return;
      const decoded = parser.decode(report);
      dev.lastReport = report;
      dev.lastRaw = decoded.values.slice();
      dev.lastButtons = decoded.buttons;
      this.emit('raw', info.id, dev.lastRaw);
      dev.state = this.normalize(dev);
      this.emit('state', this.input());
    });
    hid.on('error', () => this.lost(dev));
  }

  async close(id) {
    const dev = this.open.get(id);
    if (!dev) return;
    this.open.delete(id);
    dev.parser.close();
    await closeQuietly(dev.hid);
  }

  // A device stopped answering (usually unplugged). The others carry on.
  lost(dev) {
    if (this.open.get(dev.info.id) !== dev) return;
    this.close(dev.info.id);
    this.emit('state', this.input());
    this.publish();
    this.scheduleScan();
  }

  // Show another plugged-in device in the UI (by device id). They all stay live.
  select(id) {
    this.preferredId = id;
    this.publish();
  }

  // Apply the roles main.js remembers, after one was chosen in the UI.
  setRoles(saved) {
    this.savedRoles = saved;
    return this.serial(() => this.sync());
  }

  // Averages a device's spring-centred axes over `ms`. A still stick may send no reports
  // at all (they only arrive on change), so the last known position counts as a sample.
  measureCenter(id, ms = 600) {
    const dev = this.open.get(id);
    if (!dev) return Promise.resolve(null);
    const axes = dev.model.axes.filter((a) => isCentered(a, this.settingsFor(id)));
    const samples = dev.lastRaw ? [dev.lastRaw] : [];
    const onRaw = (from, raw) => from === id && samples.push(raw);
    this.on('raw', onRaw);
    return new Promise((resolve) => {
      setTimeout(() => {
        this.off('raw', onRaw);
        if (samples.length === 0 || this.open.get(id) !== dev) return resolve(null);
        const result = {};
        for (const axis of axes) {
          const values = samples.map((s) => s[axis.index]).filter((v) => v !== null && v !== undefined);
          if (!values.length) continue;
          result[axis.id] = {
            mean: values.reduce((a, b) => a + b, 0) / values.length,
            // Spread and offset as fractions of the axis range, to judge "at rest".
            spread: (Math.max(...values) - Math.min(...values)) / (axis.max - axis.min),
            range: [axis.min, axis.max],
          };
        }
        resolve(result);
      }, ms);
    });
  }

  // Everything needed to add support for the device on screen, for pasting into a GitHub
  // issue, plus what is plugged in alongside it.
  deviceReport() {
    const dev = this.view;
    if (!dev) return null;
    const { info, parser, model } = dev;
    return {
      device: {
        name: info.name,
        manufacturer: info.manufacturer ?? '',
        product: info.product ?? '',
        vendorId: `0x${info.vendorId.toString(16).padStart(4, '0')}`,
        productId: `0x${info.productId.toString(16).padStart(4, '0')}`,
        usagePage: info.usagePage,
        usage: info.usage,
        support: model.support,
        role: dev.role,
      },
      layout: parser.layout,
      // Linux: the raw description, so a stick can become a test fixture as it is.
      descriptor: parser.descriptor ? Buffer.from(parser.descriptor).toString('hex') : undefined,
      controls: {
        axes: model.axes.map(({ id, name, min, max, centered, invert }) => ({ id, name, min, max, centered, invert })),
        hats: model.hats.map(({ id, min, max }) => ({ id, min, max })),
        buttons: model.buttons,
      },
      lastReport: dev.lastReport ? Buffer.from(dev.lastReport).toString('hex') : null,
      pluggedIn: this.devices.map((d) => ({ name: d.name, id: d.id, role: this.roles[d.id] ?? null })),
    };
  }
}
