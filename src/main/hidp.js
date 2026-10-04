// Reads any HID joystick through Windows' own HID parser (hid.dll), so a stick is
// understood from its self-description instead of a hand-written, per-model report
// layout. The same parser powers Windows' Game Controllers panel.
//
// Windows only. `readLayout` describes the device's controls; `decode` pulls the
// current values out of each raw input report.
import { createRequire } from 'node:module';

const HIDP_STATUS_SUCCESS = 0x00110000;
const HIDP_INPUT = 0;
const PAGE_BUTTON = 0x09;
const OPEN_EXISTING = 3;
const FILE_SHARE_READ_WRITE = 0x3;

// Offsets inside HIDP_CAPS and HIDP_VALUE_CAPS / HIDP_BUTTON_CAPS (72 bytes each).
const CAPS_SIZE = 64;
const CAP_SIZE = 72;

let api = null;
function load() {
  if (api) return api;
  const koffi = createRequire(import.meta.url)('koffi');
  const hid = koffi.load('hid.dll');
  const kernel32 = koffi.load('kernel32.dll');
  api = {
    CreateFileW: kernel32.func(
      'intptr_t __stdcall CreateFileW(const char16_t *name, uint32_t access, uint32_t share, void *sa, uint32_t disposition, uint32_t flags, intptr_t tmpl)',
    ),
    CloseHandle: kernel32.func('int __stdcall CloseHandle(intptr_t h)'),
    HidD_GetPreparsedData: hid.func('int __stdcall HidD_GetPreparsedData(intptr_t h, void *pp)'),
    HidD_FreePreparsedData: hid.func('int __stdcall HidD_FreePreparsedData(intptr_t pp)'),
    HidP_GetCaps: hid.func('int32_t __stdcall HidP_GetCaps(intptr_t pp, void *caps)'),
    HidP_GetValueCaps: hid.func('int32_t __stdcall HidP_GetValueCaps(int32_t type, void *caps, void *len, intptr_t pp)'),
    HidP_GetButtonCaps: hid.func('int32_t __stdcall HidP_GetButtonCaps(int32_t type, void *caps, void *len, intptr_t pp)'),
    HidP_GetUsageValue: hid.func(
      'int32_t __stdcall HidP_GetUsageValue(int32_t type, uint16_t page, uint16_t link, uint16_t usage, void *value, intptr_t pp, void *report, uint32_t len)',
    ),
    HidP_GetUsages: hid.func(
      'int32_t __stdcall HidP_GetUsages(int32_t type, uint16_t page, uint16_t link, void *list, void *len, intptr_t pp, void *report, uint32_t reportLen)',
    ),
  };
  return api;
}

const ok = (status) => status >>> 0 === HIDP_STATUS_SUCCESS;

// Windows hands back a field's logical range as two signed numbers, however the stick
// wrote them. A maximum written unsigned with its top bit set (0 to 65535 as `26 FF FF`)
// comes back as -1 (GitHub issue #13): a range of 0 to -1, which reads as no range at all,
// so the axis was dropped. A maximum below a minimum that isn't negative is such a number:
// it is read as unsigned again, at the widest size (1, 2 or 4 bytes) the field can hold.
export function logicalMax(min, max, bits) {
  if (min < 0 || max >= min) return max;
  const largest = 2 ** bits - 1;
  const fits = [8, 16, 32].map((width) => max + 2 ** width).filter((value) => value > min && value <= largest);
  return fits.length ? Math.max(...fits) : largest;
}

// Parses the capability arrays into plain data: the device's layout.
function readLayout(a, pp) {
  const caps = Buffer.alloc(CAPS_SIZE);
  if (!ok(a.HidP_GetCaps(pp, caps))) throw new Error('HidP_GetCaps failed');
  const reportLength = caps.readUInt16LE(4);
  const buttonCapCount = caps.readUInt16LE(46);
  const valueCapCount = caps.readUInt16LE(48);

  const values = [];
  if (valueCapCount) {
    const buf = Buffer.alloc(CAP_SIZE * valueCapCount);
    const len = Buffer.alloc(2);
    len.writeUInt16LE(valueCapCount);
    if (!ok(a.HidP_GetValueCaps(HIDP_INPUT, buf, len, pp))) throw new Error('HidP_GetValueCaps failed');
    for (let i = 0; i < len.readUInt16LE(0); i++) {
      const o = i * CAP_SIZE;
      const isRange = buf[o + 12] !== 0;
      const usageMin = buf.readUInt16LE(o + 56);
      const usageMax = isRange ? buf.readUInt16LE(o + 58) : usageMin;
      const bits = buf.readUInt16LE(o + 18);
      const min = buf.readInt32LE(o + 40);
      const max = logicalMax(min, buf.readInt32LE(o + 44), bits);
      for (let usage = usageMin; usage <= usageMax; usage++) {
        values.push({
          page: buf.readUInt16LE(o),
          usage,
          reportId: buf[o + 2],
          link: buf.readUInt16LE(o + 6),
          hasNull: buf[o + 16] !== 0,
          bits,
          min,
          max,
        });
      }
    }
  }

  let buttonCount = 0;
  let buttonReportIds = [];
  if (buttonCapCount) {
    const buf = Buffer.alloc(CAP_SIZE * buttonCapCount);
    const len = Buffer.alloc(2);
    len.writeUInt16LE(buttonCapCount);
    if (!ok(a.HidP_GetButtonCaps(HIDP_INPUT, buf, len, pp))) throw new Error('HidP_GetButtonCaps failed');
    for (let i = 0; i < len.readUInt16LE(0); i++) {
      const o = i * CAP_SIZE;
      if (buf.readUInt16LE(o) !== PAGE_BUTTON) continue;
      const isRange = buf[o + 12] !== 0;
      const usageMax = buf.readUInt16LE(o + (isRange ? 58 : 56));
      buttonCount = Math.max(buttonCount, usageMax);
      buttonReportIds.push(buf[o + 2]);
    }
  }
  buttonReportIds = [...new Set(buttonReportIds)];

  return { reportLength, values, buttonCount, buttonReportIds };
}

export class HidParser {
  // Reads the layout for the HID interface at `path` (as listed by node-hid).
  static open(path) {
    const a = load();
    // Access 0 is enough to read the device's description; reports come via node-hid.
    const handle = a.CreateFileW(path, 0, FILE_SHARE_READ_WRITE, null, OPEN_EXISTING, 0, 0);
    if (Number(handle) === -1 || Number(handle) === 0) throw new Error('Could not open the device description');
    const out = Buffer.alloc(8);
    const got = a.HidD_GetPreparsedData(handle, out);
    a.CloseHandle(handle);
    if (!got) throw new Error('The device did not describe its controls');
    const pp = Number(out.readBigUInt64LE(0));
    try {
      return new HidParser(a, pp, readLayout(a, pp));
    } catch (err) {
      a.HidD_FreePreparsedData(pp);
      throw err;
    }
  }

  constructor(a, pp, layout) {
    this.a = a;
    this.pp = pp;
    this.layout = layout;
    this.usesReportIds = layout.values.some((v) => v.reportId !== 0) || layout.buttonReportIds.some((id) => id !== 0);
    this.report = Buffer.alloc(layout.reportLength);
    this.value = Buffer.alloc(4);
    this.usages = Buffer.alloc(2 * Math.max(1, layout.buttonCount));
    this.usageCount = Buffer.alloc(4);
    // Last known state; reports that carry other report IDs leave fields untouched.
    this.values = layout.values.map(() => null);
    this.buttons = new Set();
  }

  // Returns { values: [raw or null, …] (same order as layout.values), buttons: Set<buttonNumber> }.
  decode(data) {
    const { a, pp, report, layout } = this;
    report.fill(0);
    // hidapi drops the report-ID byte when a device doesn't use IDs; HidP wants it back.
    if (this.usesReportIds) data.copy(report, 0, 0, Math.min(data.length, report.length));
    else data.copy(report, 1, 0, Math.min(data.length, report.length - 1));
    const length = report.length;

    layout.values.forEach((field, i) => {
      if (!ok(a.HidP_GetUsageValue(HIDP_INPUT, field.page, field.link, field.usage, this.value, pp, report, length))) return;
      let raw = this.value.readUInt32LE(0);
      // HidP returns the raw bit field; sign-extend fields whose logical range is signed.
      if (field.min < 0 && field.bits < 32 && raw >= 2 ** (field.bits - 1)) raw -= 2 ** field.bits;
      this.values[i] = raw;
    });

    if (layout.buttonCount) {
      this.usageCount.writeUInt32LE(layout.buttonCount);
      if (ok(a.HidP_GetUsages(HIDP_INPUT, PAGE_BUTTON, 0, this.usages, this.usageCount, pp, report, length))) {
        this.buttons = new Set();
        for (let i = 0; i < this.usageCount.readUInt32LE(0); i++) this.buttons.add(this.usages.readUInt16LE(i * 2));
      }
    }
    return { values: this.values, buttons: this.buttons };
  }

  close() {
    if (this.pp) this.a.HidD_FreePreparsedData(this.pp);
    this.pp = 0;
  }
}
