// Reads the physical joystick over raw HID. Runs in the main process so input keeps
// flowing while the game has focus (or the mapper window is minimised).
import { EventEmitter } from 'node:events';
import HID from 'node-hid';
import { normalizeAxes } from './devices/extreme3dpro.js';

const RESCAN_MS = 1500;

// close() may throw or reject when the device has already vanished.
const closeQuietly = (hid) => Promise.resolve().then(() => hid.close()).catch(() => {});

export class JoystickReader extends EventEmitter {
  constructor(device) {
    super();
    this.device = device;
    this.calibration = null;
    this.hid = null;
    this.timer = null;
    this.stopped = true;
    this.lastRaw = null;
    this.status = { state: 'searching', name: device.name, message: '' };
  }

  start() {
    this.stopped = false;
    this.scan();
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    const hid = this.hid;
    this.hid = null;
    if (hid) await closeQuietly(hid);
  }

  setCalibration(calibration) {
    this.calibration = calibration;
  }

  // Averages the spring-centred axes over `ms`. A perfectly still stick may send no
  // reports at all, so the last known position counts as a sample too.
  measureCenter(ms = 600) {
    const centred = Object.keys(this.device.axes).filter((id) => this.device.axes[id].center !== undefined);
    const samples = this.lastRaw ? [this.lastRaw] : [];
    const onRaw = (raw) => samples.push(raw);
    this.on('raw', onRaw);
    return new Promise((resolve) => {
      setTimeout(() => {
        this.off('raw', onRaw);
        if (samples.length === 0) return resolve(null);
        const result = {};
        for (const id of centred) {
          const values = samples.map((s) => s[id]);
          const { min, max } = this.device.axes[id];
          result[id] = {
            mean: values.reduce((a, b) => a + b, 0) / values.length,
            // Spread as a fraction of the axis range, to judge whether the stick was at rest.
            spread: (Math.max(...values) - Math.min(...values)) / (max - min),
          };
        }
        resolve(result);
      }, ms);
    });
  }

  setStatus(state, message = '') {
    if (this.status.state === state && this.status.message === message) return;
    this.status = { state, name: this.device.name, message };
    this.emit('status', this.status);
  }

  scheduleScan() {
    clearTimeout(this.timer);
    if (!this.stopped) this.timer = setTimeout(() => this.scan(), RESCAN_MS);
  }

  async scan() {
    if (this.stopped || this.hid) return;
    try {
      const { vendorId, productId } = this.device;
      const matches = (await HID.devicesAsync()).filter((d) => d.vendorId === vendorId && d.productId === productId);
      // Prefer the joystick collection (usage page 1, usage 4) if the OS reports several.
      const info = matches.find((d) => d.usagePage === 1 && d.usage === 4) ?? matches[0];
      if (info) {
        await this.open(info.path);
        return;
      }
      this.setStatus('searching');
    } catch (err) {
      this.setStatus('error', err.message);
    }
    this.scheduleScan();
  }

  async open(path) {
    const hid = await HID.HIDAsync.open(path);
    if (this.stopped) {
      await closeQuietly(hid);
      return;
    }
    this.hid = hid;
    hid.on('data', (report) => {
      const parsed = this.device.parse(report);
      if (!parsed) return;
      this.lastRaw = parsed.raw;
      this.emit('raw', parsed.raw);
      this.emit('state', {
        buttons: parsed.buttons,
        axes: normalizeAxes(this.device, parsed.raw, this.calibration),
      });
    });
    hid.on('error', (err) => this.lost(hid, err));
    this.setStatus('connected');
  }

  lost(hid, err) {
    if (this.hid !== hid) return;
    this.hid = null;
    this.lastRaw = null;
    closeQuietly(hid);
    this.emit('lost');
    this.setStatus('searching', err?.message ?? '');
    this.scheduleScan();
  }
}
