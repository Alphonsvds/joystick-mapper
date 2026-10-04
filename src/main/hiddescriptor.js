// Reads any HID joystick on Linux from its report descriptor: the self-description every
// stick sends when it's plugged in, which Linux shares in sysfs. The Linux counterpart of
// hidp.js (Windows' own parser): it produces the same layout, listed in the order Windows
// lists it, so photo layouts, profiles and button numbers carry over between the two.
//
// `parseDescriptor` describes the device's controls; `decode` pulls the current values
// out of each raw input report.
import fs from 'node:fs';
import path from 'node:path';

const PAGE_GENERIC = 0x01;
const PAGE_BUTTON = 0x09;
// Top-level collections read as a joystick: Joystick, Game Pad and Multi-axis Controller
// (joystick.js decides which gamepads are opened at all). A device's other collections (a
// keyboard, LEDs…) are left out, as they are on Windows, where each collection is a device
// of its own.
const JOYSTICK_USAGES = new Set([0x04, 0x05, 0x08]);

// Item types and tags (HID 1.11, section 6.2.2).
const MAIN = 0;
const GLOBAL = 1;
const LOCAL = 2;
const INPUT = 0x8;
const COLLECTION = 0xa;
const END_COLLECTION = 0xc;
const LONG_ITEM = 0xfe;

// Input item flags.
const CONSTANT = 0x01;
const VARIABLE = 0x02;
const NULL_STATE = 0x40;

// Array items list up to this many usages (a button array is rarely more than 128).
const MAX_ARRAY_USAGES = 1024;

// The descriptor's short items as { type, tag, size, udata, sdata }. Long items carry
// nothing a joystick uses and are skipped.
function* items(bytes) {
  let i = 0;
  while (i < bytes.length) {
    const prefix = bytes[i];
    if (prefix === LONG_ITEM) {
      i += 3 + (bytes[i + 1] ?? 0);
      continue;
    }
    const size = [0, 1, 2, 4][prefix & 3];
    if (i + 1 + size > bytes.length) return;
    let udata = 0;
    for (let b = 0; b < size; b++) udata += bytes[i + 1 + b] * 2 ** (8 * b);
    const sdata = size && udata >= 2 ** (8 * size - 1) ? udata - 2 ** (8 * size) : udata;
    yield { type: (prefix >> 2) & 3, tag: prefix >> 4, size, udata, sdata };
    i += 1 + size;
  }
}

// A local usage with its page: a 4-byte usage carries its own page, a shorter one takes
// the Usage Page in force when the main item arrives (as Windows and Linux both do).
const usageOf = (entry, page) => ({ page: entry.extended ? Math.floor(entry.value / 0x10000) : page, usage: entry.value & 0xffff });

// Parses a report descriptor into the same layout HidParser (hidp.js) reads from Windows:
//   { reportLength, values: [{ page, usage, reportId, link, hasNull, bits, min, max }],
//     buttonCount, buttonReportIds }
// plus, for decode(), where each value and button sits in its report.
export function parseDescriptor(bytes) {
  let global = { page: 0, logicalMin: 0, logicalMaxU: 0, logicalMaxS: 0, size: 0, count: 0, reportId: 0 };
  const globals = []; // Push / Pop
  let local = { usages: [], pendingMin: null };
  const collections = []; // open collections: { link }
  let joystick = false; // inside a top-level joystick collection
  let links = 0; // link collections numbered within the top-level one, as Windows does
  let usesReportIds = false;
  const offsets = new Map(); // report ID -> bits used so far
  const joystickReports = new Set();

  const values = [];
  const fields = []; // decode info for values[i]: { reportId, offset, bits, signed }
  const buttons = []; // { reportId, offset, usage } (1-bit variable) or { reportId, offset, size, count, min, usages } (array)
  let buttonCount = 0;
  const buttonReportIds = new Set();

  const input = (flags) => {
    const { size, count, reportId } = global;
    const start = offsets.get(reportId) ?? 0;
    offsets.set(reportId, start + size * count);
    if (!joystick) return;
    joystickReports.add(reportId);
    if (flags & CONSTANT || size === 0 || count === 0) return;
    // Logical Maximum reads as unsigned unless the minimum is negative: plenty of sticks
    // write 0..255 as 15 00 25 FF (Linux's parser makes the same allowance).
    const min = global.logicalMin;
    const max = min < 0 ? global.logicalMaxS : global.logicalMaxU;
    const link = collections.at(-1)?.link ?? 0;

    if (!(flags & VARIABLE)) {
      // An array: each slot holds the index of a pressed usage. Only button arrays matter.
      const usages = [];
      for (const entry of local.usages) {
        for (let u = entry.from; u <= entry.to && usages.length < MAX_ARRAY_USAGES; u++) {
          usages.push(usageOf({ ...entry, value: u }, global.page));
        }
      }
      const buttonUsages = usages.map((u) => (u.page === PAGE_BUTTON ? u.usage : 0));
      if (!buttonUsages.some(Boolean)) return;
      buttons.push({ reportId, offset: start, size, count, min, usages: buttonUsages });
      buttonCount = Math.max(buttonCount, ...buttonUsages);
      buttonReportIds.add(reportId);
      return;
    }

    // A variable item: one field per usage, in order; spare fields repeat the last usage.
    const expanded = [];
    local.usages.forEach((entry, group) => {
      for (let u = entry.from; u <= entry.to && expanded.length < count; u++) {
        expanded.push({ ...usageOf({ ...entry, value: u }, global.page), group });
      }
    });
    if (!expanded.length) return;

    if (size === 1) {
      // 1-bit fields are buttons (Windows lists them as button caps, not values).
      expanded.forEach((u, i) => {
        if (u.page !== PAGE_BUTTON) return;
        buttons.push({ reportId, offset: start + i, usage: u.usage });
        buttonCount = Math.max(buttonCount, u.usage);
        buttonReportIds.add(reportId);
      });
      return;
    }

    // Windows lists the usages of one item last first: Usage X, Usage Y reads as [Y, X]
    // (the Extreme 3D Pro's layout shows it). A usage range stays in ascending order.
    const groups = [...new Set(expanded.map((u) => u.group))].reverse();
    for (const group of groups) {
      expanded.forEach((u, i) => {
        if (u.group !== group) return;
        values.push({ page: u.page, usage: u.usage, reportId, link, hasNull: (flags & NULL_STATE) !== 0, bits: size, min, max });
        fields.push({ reportId, offset: start + i * size, bits: size, signed: min < 0 });
      });
    }
  };

  for (const item of items(bytes)) {
    if (item.type === MAIN) {
      if (item.tag === INPUT) input(item.udata);
      else if (item.tag === COLLECTION) {
        if (collections.length === 0) {
          const first = local.usages[0];
          const usage = first ? usageOf({ ...first, value: first.from }, global.page) : { page: 0, usage: 0 };
          joystick = usage.page === PAGE_GENERIC && JOYSTICK_USAGES.has(usage.usage);
          links = 0;
          collections.push({ link: 0 });
        } else collections.push({ link: ++links });
      } else if (item.tag === END_COLLECTION) {
        collections.pop();
        if (collections.length === 0) joystick = false;
      }
      // Output and Feature items don't take part in input reports.
      local = { usages: [], pendingMin: null };
    } else if (item.type === GLOBAL) {
      switch (item.tag) {
        case 0x0:
          global.page = item.udata;
          break;
        case 0x1:
          global.logicalMin = item.sdata;
          break;
        case 0x2:
          global.logicalMaxU = item.udata;
          global.logicalMaxS = item.sdata;
          break;
        case 0x7:
          global.size = item.udata;
          break;
        case 0x8:
          global.reportId = item.udata;
          usesReportIds = true;
          break;
        case 0x9:
          global.count = item.udata;
          break;
        case 0xa:
          globals.push({ ...global });
          break;
        case 0xb:
          if (globals.length) global = globals.pop();
          break;
      }
    } else if (item.type === LOCAL) {
      const extended = item.size === 4;
      if (item.tag === 0x0) local.usages.push({ from: item.udata, to: item.udata, extended });
      else if (item.tag === 0x1) local.pendingMin = { value: item.udata, extended };
      else if (item.tag === 0x2 && local.pendingMin) {
        const { value, extended: minExtended } = local.pendingMin;
        // A 4-byte range carries the page in both ends; count within the page.
        const to = minExtended && extended ? item.udata : Math.floor(value / 0x10000) * 0x10000 + (item.udata & 0xffff);
        local.usages.push({ from: value, to: Math.max(value, to), extended: minExtended });
        local.pendingMin = null;
      }
    }
  }

  // Windows counts the report ID byte, even for a device without IDs.
  const longest = Math.max(0, ...[...joystickReports].map((id) => offsets.get(id) ?? 0));
  return {
    layout: {
      reportLength: 1 + Math.ceil(longest / 8),
      values,
      buttonCount,
      buttonReportIds: [...buttonReportIds],
    },
    usesReportIds,
    fields,
    buttons,
  };
}

// `bits` bits from `offset` (counted from the first bit of `data`), least significant
// first, or null if the report is too short to hold them.
function readBits(data, offset, bits) {
  if (offset + bits > data.length * 8) return null;
  let value = 0;
  for (let i = 0; i < bits; ) {
    const at = offset + i;
    const shift = at & 7;
    const take = Math.min(8 - shift, bits - i);
    value += ((data[at >> 3] >> shift) & ((1 << take) - 1)) * 2 ** i;
    i += take;
  }
  return value;
}

export class HidDescriptorParser {
  // Reads the descriptor of the hidraw device at `devicePath` (as listed by node-hid, e.g.
  // /dev/hidraw3). sysfs lets anyone read it, even before the device can be opened.
  static open(devicePath) {
    const file = path.join('/sys/class/hidraw', path.basename(devicePath), 'device/report_descriptor');
    let descriptor;
    try {
      descriptor = fs.readFileSync(file);
    } catch {
      throw new Error('Could not read the device description');
    }
    return new HidDescriptorParser(descriptor);
  }

  constructor(descriptor) {
    this.descriptor = Buffer.from(descriptor);
    const parsed = parseDescriptor(this.descriptor);
    this.layout = parsed.layout;
    this.usesReportIds = parsed.usesReportIds;
    this.fields = parsed.fields;
    this.buttonFields = new Map(); // report ID -> the buttons it carries
    for (const b of parsed.buttons) this.buttonFields.set(b.reportId, [...(this.buttonFields.get(b.reportId) ?? []), b]);
    // Last known state; reports that carry other report IDs leave fields untouched.
    this.values = this.layout.values.map(() => null);
    this.pressed = new Map(); // report ID -> buttons pressed in its latest report
    this.buttons = new Set();
  }

  // Returns { values: [raw or null, …] (same order as layout.values), buttons: Set<buttonNumber> }.
  decode(data) {
    // Linux hands over the report ID byte only when the device uses IDs (like hidapi on Windows).
    const reportId = this.usesReportIds ? data[0] : 0;
    const base = this.usesReportIds ? 8 : 0;

    this.fields.forEach((field, i) => {
      if (field.reportId !== reportId) return;
      const raw = readBits(data, base + field.offset, field.bits);
      if (raw === null) return;
      this.values[i] = field.signed && raw >= 2 ** (field.bits - 1) ? raw - 2 ** field.bits : raw;
    });

    const fields = this.buttonFields.get(reportId);
    if (fields) {
      const pressed = new Set();
      for (const b of fields) {
        if (b.usages) {
          for (let slot = 0; slot < b.count; slot++) {
            const index = readBits(data, base + b.offset + slot * b.size, b.size);
            const usage = index === null ? 0 : b.usages[index - b.min];
            if (usage) pressed.add(usage);
          }
        } else if (readBits(data, base + b.offset, 1) === 1) pressed.add(b.usage);
      }
      this.pressed.set(reportId, pressed);
      this.buttons = new Set([...this.pressed.values()].flatMap((set) => [...set]));
    }
    return { values: this.values, buttons: this.buttons };
  }

  close() {}
}
