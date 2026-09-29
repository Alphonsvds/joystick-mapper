// Finds and reads joysticks over raw HID. Any stick is understood through Windows' HID
// parser (hidp.js), so sticks we've never seen work without per-model code. Runs in the
// main process so input keeps flowing while a game has focus.
import { EventEmitter } from 'node:events';
import HID from 'node-hid';
import { deviceKey, describeDevice, isCentered, normalizeInput } from '../shared/devices.js';
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

// close() may throw or reject when the device has already vanished.
const closeQuietly = (hid) => Promise.resolve().then(() => hid.close()).catch(() => {});

function createParser(info) {
  if (process.platform === 'win32') return HidParser.open(info.path);
  if (info.vendorId === EXTREME_3D_PRO_IDS.vendorId && info.productId === EXTREME_3D_PRO_IDS.productId) {
    return new Extreme3DProParser();
  }
  throw new Error('Only the Logitech Extreme 3D Pro is supported on this OS so far');
}

export class JoystickManager extends EventEmitter {
  constructor({ ignoreSkins = false } = {}) {
    super();
    this.ignoreSkins = ignoreSkins;
    this.devices = []; // candidates currently plugged in
    this.preferredKey = null;
    this.settings = {}; // per-device { centered, calibration }, owned by main.js
    this.current = null; // { info, hid, parser, model }
    this.lastRaw = null;
    this.lastReport = null;
    this.timer = null;
    this.stopped = true;
    this.status = { state: 'searching', message: '', device: null, devices: [] };
  }

  start() {
    this.stopped = false;
    this.scan();
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.closeCurrent();
  }

  get model() {
    return this.current?.model ?? null;
  }

  settingsFor(key) {
    return this.settings[key] ?? {};
  }

  setSettings(all) {
    this.settings = all;
  }

  setStatus(state, message = '') {
    this.status = {
      state,
      message,
      device: this.current?.model ?? null,
      devices: this.devices.map(({ key, name }) => ({ key, name })),
    };
    this.emit('status', this.status);
  }

  scheduleScan() {
    clearTimeout(this.timer);
    if (!this.stopped) this.timer = setTimeout(() => this.scan(), RESCAN_MS);
  }

  async scan() {
    if (this.stopped) return;
    try {
      const seen = new Set();
      const devices = [];
      for (const d of await HID.devicesAsync()) {
        if (!isJoystick(d) || seen.has(d.path)) continue;
        seen.add(d.path);
        devices.push({ ...d, key: deviceKey(d.vendorId, d.productId), name: displayName(d) });
      }
      const listChanged = devices.map((d) => d.path).join('|') !== this.devices.map((d) => d.path).join('|');
      this.devices = devices;

      if (!this.current) {
        const pick = devices.find((d) => d.key === this.preferredKey) ?? devices[0];
        if (pick) await this.open(pick);
        else this.setStatus('searching');
      } else if (listChanged) {
        this.setStatus(this.status.state, this.status.message);
      }
    } catch (err) {
      this.setStatus('error', err.message);
    }
    this.scheduleScan();
  }

  async open(info) {
    let parser;
    try {
      parser = createParser(info);
    } catch (err) {
      this.setStatus('unsupported', `${info.name}: ${err.message}`);
      return;
    }
    const model = describeDevice(parser.layout, {
      vendorId: info.vendorId,
      productId: info.productId,
      name: info.name,
      ignoreSkin: this.ignoreSkins,
    });
    let hid;
    try {
      hid = await HID.HIDAsync.open(info.path);
    } catch (err) {
      parser.close();
      this.setStatus('error', `${info.name}: ${err.message}`);
      return;
    }
    if (this.stopped) {
      parser.close();
      await closeQuietly(hid);
      return;
    }
    const current = { info, hid, parser, model };
    this.current = current;
    this.lastRaw = null;
    hid.on('data', (report) => {
      if (this.current !== current) return;
      const decoded = parser.decode(report);
      this.lastReport = report;
      this.lastRaw = decoded.values.slice();
      this.emit('raw', this.lastRaw);
      this.emit('state', normalizeInput(decoded, model, this.settingsFor(model.key)));
    });
    hid.on('error', (err) => this.lost(current, err));
    this.setStatus('connected');
  }

  async closeCurrent() {
    const current = this.current;
    this.current = null;
    this.lastRaw = null;
    if (!current) return;
    current.parser.close();
    await closeQuietly(current.hid);
  }

  lost(current, err) {
    if (this.current !== current) return;
    this.closeCurrent();
    this.emit('lost');
    this.setStatus('searching', err?.message ?? '');
    this.scheduleScan();
  }

  // Switch to another plugged-in stick (by device key).
  async select(key) {
    this.preferredKey = key;
    if (this.current?.model.key === key) return;
    const info = this.devices.find((d) => d.key === key);
    if (!info) return;
    await this.closeCurrent();
    this.emit('lost');
    await this.open(info);
  }

  // Averages the spring-centred axes over `ms`. A still stick may send no reports at
  // all (they only arrive on change), so the last known position counts as a sample.
  measureCenter(ms = 600) {
    const model = this.model;
    if (!model) return Promise.resolve(null);
    const axes = model.axes.filter((a) => isCentered(a, this.settingsFor(model.key)));
    const samples = this.lastRaw ? [this.lastRaw] : [];
    const onRaw = (raw) => samples.push(raw);
    this.on('raw', onRaw);
    return new Promise((resolve) => {
      setTimeout(() => {
        this.off('raw', onRaw);
        if (samples.length === 0 || this.model !== model) return resolve(null);
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

  // Everything needed to add support for this stick, for pasting into a GitHub issue.
  deviceReport() {
    const current = this.current;
    if (!current) return null;
    const { info, parser, model } = current;
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
      },
      layout: parser.layout,
      controls: {
        axes: model.axes.map(({ id, name, min, max, centered, invert }) => ({ id, name, min, max, centered, invert })),
        hats: model.hats.map(({ id, min, max }) => ({ id, min, max })),
        buttons: model.buttons,
      },
      lastReport: this.lastReport ? Buffer.from(this.lastReport).toString('hex') : null,
    };
  }
}
