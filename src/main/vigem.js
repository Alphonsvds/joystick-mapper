// Virtual Xbox 360 controller via the ViGEmBus driver (Windows only).
//
// Talks to the bus driver directly with DeviceIoControl through koffi (a prebuilt FFI,
// so no C++ toolchain is needed). The IOCTL codes and structs mirror ViGEmClient's
// include/ViGEm/km/BusShared.h; the call sequence mirrors ViGEmClient.cpp:
// check version -> plug in a target on a free serial -> wait until ready -> submit reports.
// Closing the handle makes the driver unplug our target, so a crash never leaves a ghost pad.
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { VirtualUinputPad } from './uinput.js';
import { readXboxSlots } from './xinput.js';

export const VIGEM_DOWNLOAD_URL = 'https://github.com/nefarius/ViGEmBus/releases/latest';

const RETRY_MS = 3000;
const MAX_SERIAL = 16;

// CTL_CODE(FILE_DEVICE_BUS_EXTENDER, fn, METHOD_BUFFERED, FILE_WRITE_DATA)
const ioctl = (fn) => ((0x2a << 16) | (0x0002 << 14) | (fn << 2)) >>> 0;
const IOCTL_VIGEM_PLUGIN_TARGET = ioctl(0x801);
const IOCTL_VIGEM_UNPLUG_TARGET = ioctl(0x802);
const IOCTL_VIGEM_CHECK_VERSION = ioctl(0x803);
const IOCTL_VIGEM_WAIT_DEVICE_READY = ioctl(0x804);
const IOCTL_XUSB_SUBMIT_REPORT = ioctl(0x801 + 0x201);

// Finding the pad's XInput slot (see findPadSlot). The marks are stick positions a few
// steps off centre, out of 32767: far inside any deadzone, and nothing a real controller
// sends twice running.
const SLOT_MARKS = [
  { lx: 3, ly: -5, rx: 7, ry: -2 },
  { lx: -6, ly: 4, rx: -1, ry: 8 },
];
const SLOT_TRIES = 10; // two seconds at most: the stick's reports wait meanwhile
const SLOT_SETTLE_MS = 40; // for a report to show up in XInput
const SLOT_RETRY_MS = 120; // Windows gives a new pad its slot a moment after it is plugged in
// How long a pad that was just unplugged may still be listed by XInput.
const SLOT_LINGER_MS = 3000;
const AT_REST = Object.freeze({ buttons: 0, lt: 0, rt: 0, lx: 0, ly: 0, rx: 0, ry: 0 });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Finds which XInput slot a newly plugged-in virtual pad was given, before anything else
// is sent through it: shows each mark in turn and looks for the one slot that repeats
// them all. The driver has a request for this, but ViGEmBus 1.21 answers it with nothing,
// and a wrong answer would have the app read its own pad back as a real controller; this
// needs no answer from the driver.
//   send(report)  submits a report to the pad
//   read()        what each XInput slot holds now (see readXboxSlots), null for an empty
//                 one, or null altogether when there is no XInput to look in
//   there()       false once the pad has been unplugged, which ends the search
// Resolves to the slot, or null if XInput never shows the pad (or shows it twice). The
// pad is left at rest.
export async function findPadSlot({ send, read, there = () => true, wait = sleep, tries = SLOT_TRIES }) {
  let found = null;
  if (!read()) return found;
  for (let attempt = 0; attempt < tries && found === null && there(); attempt++) {
    let slots = [0, 1, 2, 3];
    for (const mark of SLOT_MARKS) {
      send({ ...AT_REST, ...mark });
      await wait(SLOT_SETTLE_MS);
      if (!there()) return null;
      const shown = read() ?? [];
      slots = slots.filter((slot) => {
        const s = shown[slot];
        return s && s.buttons === 0 && s.lt === 0 && s.rt === 0 && s.lx === mark.lx && s.ly === mark.ly && s.rx === mark.rx && s.ry === mark.ry;
      });
      if (slots.length === 0) break;
    }
    if (slots.length === 1) found = slots[0];
    else await wait(SLOT_RETRY_MS);
  }
  if (there()) send(AT_REST);
  return found;
}

const VIGEM_COMMON_VERSION = 0x0001;
const XBOX360_WIRED = 0;
const X360_VENDOR_ID = 0x045e;
const X360_PRODUCT_ID = 0x028e;

const GENERIC_READ_WRITE = 0xc0000000;
const FILE_SHARE_READ_WRITE = 0x3;
const OPEN_EXISTING = 3;
const FILE_ATTRIBUTE_NORMAL = 0x80;
const FILE_FLAG_NO_BUFFERING = 0x20000000;
const FILE_FLAG_WRITE_THROUGH = 0x80000000;

// {96E42B22-F5E9-42F8-B043-ED0F932F014F}
const GUID_DEVINTERFACE_BUSENUM_VIGEM = guidBuffer('96E42B22-F5E9-42F8-B043-ED0F932F014F');

function guidBuffer(text) {
  const [d1, d2, d3, d4, d5] = text.split('-');
  const buf = Buffer.alloc(16);
  buf.writeUInt32LE(parseInt(d1, 16), 0);
  buf.writeUInt16LE(parseInt(d2, 16), 4);
  buf.writeUInt16LE(parseInt(d3, 16), 6);
  Buffer.from(d4 + d5, 'hex').copy(buf, 8);
  return buf;
}

let win32 = null;
function loadWin32() {
  if (win32) return win32;
  const koffi = createRequire(import.meta.url)('koffi');
  const kernel32 = koffi.load('kernel32.dll');
  const cfgmgr32 = koffi.load('cfgmgr32.dll');
  win32 = {
    CM_Get_Device_Interface_List_SizeW: cfgmgr32.func(
      'uint32_t __stdcall CM_Get_Device_Interface_List_SizeW(void *pulLen, void *InterfaceClassGuid, void *pDeviceID, uint32_t ulFlags)',
    ),
    CM_Get_Device_Interface_ListW: cfgmgr32.func(
      'uint32_t __stdcall CM_Get_Device_Interface_ListW(void *InterfaceClassGuid, void *pDeviceID, void *Buffer, uint32_t BufferLen, uint32_t ulFlags)',
    ),
    CreateFileW: kernel32.func(
      'intptr_t __stdcall CreateFileW(const char16_t *lpFileName, uint32_t dwDesiredAccess, uint32_t dwShareMode, void *lpSecurityAttributes, uint32_t dwCreationDisposition, uint32_t dwFlagsAndAttributes, intptr_t hTemplateFile)',
    ),
    DeviceIoControl: kernel32.func(
      'int __stdcall DeviceIoControl(intptr_t hDevice, uint32_t dwIoControlCode, void *lpInBuffer, uint32_t nInBufferSize, void *lpOutBuffer, uint32_t nOutBufferSize, void *lpBytesReturned, void *lpOverlapped)',
    ),
    CloseHandle: kernel32.func('int __stdcall CloseHandle(intptr_t hObject)'),
  };
  return win32;
}

// First present ViGEmBus device interface path, or null if the driver isn't installed.
function findBusPath(api) {
  const size = Buffer.alloc(4);
  if (api.CM_Get_Device_Interface_List_SizeW(size, GUID_DEVINTERFACE_BUSENUM_VIGEM, null, 0) !== 0) return null;
  const chars = size.readUInt32LE(0);
  if (chars <= 1) return null;
  const list = Buffer.alloc(chars * 2);
  if (api.CM_Get_Device_Interface_ListW(GUID_DEVINTERFACE_BUSENUM_VIGEM, null, list, chars, 0) !== 0) return null;
  return list.toString('utf16le').split('\0').find(Boolean) ?? null;
}

function sizedStruct(size, serial) {
  const buf = Buffer.alloc(size);
  buf.writeUInt32LE(size, 0);
  buf.writeUInt32LE(serial, 4);
  return buf;
}

function isValidHandle(h) {
  const n = Number(h);
  return n !== -1 && n !== 0;
}

// Status states: unsupported | off | connecting | connected | driver-missing | error
class VirtualX360 extends EventEmitter {
  constructor() {
    super();
    this.handle = null;
    this.serial = 0;
    this.wanted = false;
    this.generation = 0;
    this.retryTimer = null;
    this.failures = 0;
    this.report = Buffer.alloc(20);
    this.returned = Buffer.alloc(4);
    this.status = { state: 'off', message: '' };
    this.userIndex = null; // the pad's XInput slot, once it has been found
    this.lastIndex = null; // the slot of the pad that was last unplugged
    this.goneAt = 0; // when that was
    this.probing = false; // finding the slot: reports wait in `held` meanwhile
    this.held = null;
  }

  setStatus(state, message = '') {
    if (this.status.state === state && this.status.message === message) return;
    this.status = { state, message };
    this.emit('status', this.status);
  }

  // The XInput slot the virtual pad sits in, so the app never reads its own output back
  // as a real controller (see xinput.js): a number once known, 'unknown' while the pad is
  // there (or only just gone) and its slot can't be told, null when there is no pad.
  get slot() {
    if (this.handle !== null || this.status.state === 'connecting') return this.userIndex ?? 'unknown';
    return Date.now() < this.goneAt + SLOT_LINGER_MS ? (this.lastIndex ?? 'unknown') : null;
  }

  // Blocking DeviceIoControl on a koffi worker thread, so the main process stays responsive.
  call(handle, code, input) {
    const api = loadWin32();
    return new Promise((resolve) => {
      api.DeviceIoControl.async(handle, code, input, input.length, null, 0, Buffer.alloc(4), null, (err, ok) =>
        resolve(!err && ok !== 0),
      );
    });
  }

  // Finds the new pad's XInput slot (see findPadSlot). The slot stays unknown (see `slot`)
  // if XInput never shows the pad.
  async findSlot(gen) {
    const there = () => gen === this.generation && this.handle !== null;
    const slot = await findPadSlot({ send: (report) => this.send(report), read: readXboxSlots, there });
    if (there()) this.userIndex = slot;
  }

  async connect() {
    this.wanted = true;
    if (this.handle !== null || this.status.state === 'connecting') return;
    clearTimeout(this.retryTimer);
    const gen = ++this.generation;
    this.setStatus('connecting');
    try {
      await this.attach(gen);
    } catch (err) {
      // Surface FFI/driver failures in the status bar instead of crashing the main process.
      if (gen === this.generation) {
        this.setStatus('error', `Virtual controller error: ${err.message}`);
        this.scheduleRetry();
      }
    }
  }

  async attach(gen) {
    const api = loadWin32();
    const path = findBusPath(api);
    if (!path) {
      this.setStatus('driver-missing', 'ViGEmBus driver not found');
      this.scheduleRetry();
      return;
    }

    const handle = api.CreateFileW(
      path,
      GENERIC_READ_WRITE,
      FILE_SHARE_READ_WRITE,
      null,
      OPEN_EXISTING,
      (FILE_ATTRIBUTE_NORMAL | FILE_FLAG_NO_BUFFERING | FILE_FLAG_WRITE_THROUGH) >>> 0,
      0,
    );
    if (!isValidHandle(handle)) {
      this.setStatus('error', 'Could not open the ViGEmBus driver');
      this.scheduleRetry();
      return;
    }

    let closed = false;
    const abandon = (state, message) => {
      closed = true;
      api.CloseHandle(handle);
      if (gen === this.generation) {
        this.setStatus(state, message);
        this.scheduleRetry();
      }
    };

    try {
      await this.plugIn(api, handle, gen, abandon);
    } catch (err) {
      if (!closed && this.handle !== handle) api.CloseHandle(handle);
      throw err;
    }
  }

  async plugIn(api, handle, gen, abandon) {
    const version = Buffer.alloc(8);
    version.writeUInt32LE(8, 0);
    version.writeUInt32LE(VIGEM_COMMON_VERSION, 4);
    if (!(await this.call(handle, IOCTL_VIGEM_CHECK_VERSION, version))) {
      return abandon('error', 'ViGEmBus version mismatch — install the latest driver');
    }
    if (gen !== this.generation) return abandon('off');

    for (let serial = 1; serial <= MAX_SERIAL; serial++) {
      const plugin = sizedStruct(16, serial);
      plugin.writeUInt32LE(XBOX360_WIRED, 8);
      plugin.writeUInt16LE(X360_VENDOR_ID, 12);
      plugin.writeUInt16LE(X360_PRODUCT_ID, 14);
      if (!(await this.call(handle, IOCTL_VIGEM_PLUGIN_TARGET, plugin))) continue; // serial taken; try the next

      // Older bus versions don't support this; ViGEmClient treats that as success too.
      await this.call(handle, IOCTL_VIGEM_WAIT_DEVICE_READY, sizedStruct(8, serial));

      if (gen !== this.generation) {
        api.DeviceIoControl(handle, IOCTL_VIGEM_UNPLUG_TARGET, sizedStruct(8, serial), 8, null, 0, this.returned, null);
        return abandon('off');
      }
      this.handle = handle;
      this.serial = serial;
      this.failures = 0;
      this.probing = true;
      await this.findSlot(gen).catch(() => {});
      this.probing = false;
      if (gen !== this.generation || this.handle !== handle) return; // unplugged meanwhile
      this.setStatus('connected');
      if (this.userIndex !== null) this.emit('slot', this.userIndex);
      if (this.held) this.submit(this.held);
      return;
    }
    return abandon('error', 'ViGEmBus refused to create a virtual controller');
  }

  scheduleRetry() {
    clearTimeout(this.retryTimer);
    if (this.wanted) this.retryTimer = setTimeout(() => this.connect(), RETRY_MS);
  }

  submit(out) {
    if (this.handle === null) return;
    this.held = this.probing ? out : null;
    if (!this.probing) this.send(out);
  }

  send(out) {
    const r = this.report;
    r.writeUInt32LE(20, 0);
    r.writeUInt32LE(this.serial, 4);
    r.writeUInt16LE(out.buttons & 0xffff, 8);
    r.writeUInt8(out.lt, 10);
    r.writeUInt8(out.rt, 11);
    r.writeInt16LE(out.lx, 12);
    r.writeInt16LE(out.ly, 14);
    r.writeInt16LE(out.rx, 16);
    r.writeInt16LE(out.ry, 18);
    let ok = false;
    try {
      ok = loadWin32().DeviceIoControl(this.handle, IOCTL_XUSB_SUBMIT_REPORT, r, 20, null, 0, this.returned, null) !== 0;
    } catch {
      ok = false;
    }
    if (ok) {
      this.failures = 0;
      return;
    }
    if (++this.failures >= 5) {
      this.teardown();
      this.setStatus('error', 'Lost the virtual controller — reconnecting');
      this.scheduleRetry();
    }
  }

  teardown() {
    if (this.handle === null) return;
    const api = loadWin32();
    api.DeviceIoControl(this.handle, IOCTL_VIGEM_UNPLUG_TARGET, sizedStruct(8, this.serial), 8, null, 0, this.returned, null);
    api.CloseHandle(this.handle);
    this.handle = null;
    this.serial = 0;
    this.lastIndex = this.userIndex;
    this.userIndex = null;
    this.held = null;
    this.goneAt = Date.now();
  }

  disconnect() {
    this.wanted = false;
    this.generation++;
    clearTimeout(this.retryTimer);
    if (this.status.state === 'connecting') this.goneAt = Date.now(); // a pad may be half plugged in
    this.teardown();
    this.setStatus('off');
  }
}

class UnsupportedPad extends EventEmitter {
  constructor() {
    super();
    this.status = { state: 'unsupported', message: 'Virtual Xbox controllers need Windows (ViGEmBus) or Linux (uinput)' };
    this.slot = null;
  }
  connect() {}
  submit() {}
  disconnect() {}
}

export function createVirtualPad() {
  if (process.platform === 'win32') return new VirtualX360();
  if (process.platform === 'linux') return new VirtualUinputPad();
  return new UnsupportedPad();
}
