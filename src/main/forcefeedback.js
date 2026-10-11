// Plays the game's rumble on a force feedback joystick (Windows only).
//
// A game rumbles the virtual Xbox controller (see vigem.js); this turns its two motor
// speeds into two vibrations on the stick, through DirectInput, whose driver for the
// stick turns them into whatever its motors need. DirectInput is COM, which koffi has no
// words for, so every call goes through the object's table of functions by number, in
// the order dinput.h lists them. The structs are laid out by hand for 64-bit Windows.
//
// Nothing here has run against a real force feedback stick: every step reports how it
// went (see `status`), so an owner can say where it stopped.
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';

const DIRECTINPUT_VERSION = 0x0800;
const DI8DEVCLASS_GAMECTRL = 4;
const DIEDFL_ATTACHEDONLY = 0x1;
const DIEDFL_FORCEFEEDBACK = 0x100;
const DIENUM_STOP = 0;
const DIENUM_CONTINUE = 1;
const DISCL_EXCLUSIVE = 0x1; // force feedback needs the device to itself
const DISCL_BACKGROUND = 0x8; // and has to keep it while the game has the screen
const DIDF_ABSAXIS = 0x1;
const DIDFT_OPTIONAL_AXIS = 0x80ffff03; // DIDFT_OPTIONAL | DIDFT_ANYINSTANCE | DIDFT_AXIS
const DIEFF_OBJECTOFFSETS = 0x2;
const DIEFF_CARTESIAN = 0x10;
const DIEP_TYPESPECIFICPARAMS = 0x100;
const DIEP_START = 0x20000000;
const INFINITE = 0xffffffff;
const DIEB_NOTRIGGER = 0xffffffff;
const DI_FFNOMINALMAX = 10000;
// Another program took the stick, or it was unplugged and put back: acquiring it again
// is the cure for all three.
const LOST = [0x8007001e, 0x8007000c, 0x80040205]; // DIERR_INPUTLOST, _NOTACQUIRED, _NOTEXCLUSIVEACQUIRED

// IDirectInput8W, IDirectInputDevice8W and IDirectInputEffect, after IUnknown's three.
const RELEASE = 2;
const DI_CREATE_DEVICE = 3;
const DI_ENUM_DEVICES = 4;
const DEVICE_ACQUIRE = 7;
const DEVICE_UNACQUIRE = 8;
const DEVICE_SET_DATA_FORMAT = 11;
const DEVICE_SET_COOPERATIVE_LEVEL = 13;
const DEVICE_CREATE_EFFECT = 18;
const EFFECT_SET_PARAMETERS = 6;
const EFFECT_START = 7;
const EFFECT_STOP = 8;

const IID_IDirectInput8W = 'BF798031-483A-4DA2-AA99-5D64ED369700';
const GUID_XAxis = 'A36D02E0-C9F3-11CF-BFC7-444553540000';
const GUID_YAxis = 'A36D02E1-C9F3-11CF-BFC7-444553540000';
const GUID_Sine = '13541C23-8E33-11D0-9AD0-00A0C9A06E35';

// The two motors of an Xbox controller as two sine waves on the stick: the big, slow
// motor shakes it forward and back, the small, fast one side to side. `strength` is how
// much of the stick's full force a motor at full speed gets; `period` is in microseconds.
export const MOTORS = Object.freeze({
  large: Object.freeze({ period: 50000, direction: [0, 1], strength: 0.6 }),
  small: Object.freeze({ period: 14000, direction: [1, 0], strength: 0.4 }),
});
// The stick isn't told more often than this: each change is a message to its motors.
const UPDATE_MS = 30;

// A motor speed (0 to 255) as a force (0 to DI_FFNOMINALMAX).
export const magnitudeFor = (motor, speed) =>
  Math.round(Math.min(1, Math.max(0, (Number(speed) || 0) / 255)) * MOTORS[motor].strength * DI_FFNOMINALMAX);

export function guidBuffer(text) {
  const [d1, d2, d3, d4, d5] = text.split('-');
  const buf = Buffer.alloc(16);
  buf.writeUInt32LE(parseInt(d1, 16), 0);
  buf.writeUInt16LE(parseInt(d2, 16), 4);
  buf.writeUInt16LE(parseInt(d3, 16), 6);
  Buffer.from(d4 + d5, 'hex').copy(buf, 8);
  return buf;
}

// The first four bytes of the "product GUID" DirectInput gives a HID device: its USB IDs.
export const productCode = (vendorId, productId) => ((productId << 16) | vendorId) >>> 0;

// DIDATAFORMAT for a device read as two axes, X at offset 0 and Y at offset 4: the
// offsets an effect names its axes by. `address` says where a buffer lives.
// Returns the struct and the buffers it points into, which must outlive it.
export function axesFormat(address) {
  const guids = [guidBuffer(GUID_XAxis), guidBuffer(GUID_YAxis)];
  const objects = Buffer.alloc(48); // two DIOBJECTDATAFORMAT, 24 bytes each
  guids.forEach((guid, i) => {
    objects.writeBigUInt64LE(address(guid), i * 24); // pguid
    objects.writeUInt32LE(i * 4, i * 24 + 8); // dwOfs
    objects.writeUInt32LE(DIDFT_OPTIONAL_AXIS, i * 24 + 12); // dwType
    objects.writeUInt32LE(0, i * 24 + 16); // dwFlags
  });
  const format = Buffer.alloc(32);
  format.writeUInt32LE(32, 0); // dwSize
  format.writeUInt32LE(24, 4); // dwObjSize
  format.writeUInt32LE(DIDF_ABSAXIS, 8); // dwFlags
  format.writeUInt32LE(8, 12); // dwDataSize
  format.writeUInt32LE(2, 16); // dwNumObjs
  format.writeBigUInt64LE(address(objects), 24); // rgodf
  return { format, keep: [objects, ...guids] };
}

// DIEFFECT for a sine wave that plays until stopped, with its DIPERIODIC beside it.
// Returns both, and the buffers the struct points into.
export function sineEffect(address, { period, direction }) {
  const axes = Buffer.alloc(8);
  axes.writeUInt32LE(0, 0); // X, by its offset in axesFormat
  axes.writeUInt32LE(4, 4); // Y
  const directions = Buffer.alloc(8);
  directions.writeInt32LE(direction[0], 0);
  directions.writeInt32LE(direction[1], 4);
  const periodic = Buffer.alloc(16);
  periodic.writeUInt32LE(0, 0); // dwMagnitude, set as the motors change
  periodic.writeInt32LE(0, 4); // lOffset
  periodic.writeUInt32LE(0, 8); // dwPhase
  periodic.writeUInt32LE(period, 12); // dwPeriod
  const effect = Buffer.alloc(80);
  effect.writeUInt32LE(80, 0); // dwSize
  effect.writeUInt32LE(DIEFF_CARTESIAN | DIEFF_OBJECTOFFSETS, 4); // dwFlags
  effect.writeUInt32LE(INFINITE, 8); // dwDuration
  effect.writeUInt32LE(0, 12); // dwSamplePeriod
  effect.writeUInt32LE(DI_FFNOMINALMAX, 16); // dwGain
  effect.writeUInt32LE(DIEB_NOTRIGGER, 20); // dwTriggerButton
  effect.writeUInt32LE(0, 24); // dwTriggerRepeatInterval
  effect.writeUInt32LE(2, 28); // cAxes
  effect.writeBigUInt64LE(address(axes), 32); // rgdwAxes
  effect.writeBigUInt64LE(address(directions), 40); // rglDirection
  effect.writeBigUInt64LE(0n, 48); // lpEnvelope
  effect.writeUInt32LE(16, 56); // cbTypeSpecificParams
  effect.writeBigUInt64LE(address(periodic), 64); // lpvTypeSpecificParams
  effect.writeUInt32LE(0, 72); // dwStartDelay
  return { effect, periodic, keep: [axes, directions] };
}

let win32 = null;
function loadWin32() {
  if (win32) return win32;
  const koffi = createRequire(import.meta.url)('koffi');
  const result = 'int32_t __stdcall';
  // Named, for the EnumDevices prototype below to take a pointer to.
  koffi.proto('int __stdcall JoymapEnumDevicesCallback(void *instance, void *ref)');
  win32 = {
    koffi,
    GetModuleHandleW: koffi.load('kernel32.dll').func('intptr_t __stdcall GetModuleHandleW(void *lpModuleName)'),
    DirectInput8Create: koffi
      .load('dinput8.dll')
      .func('int32_t __stdcall DirectInput8Create(intptr_t hinst, uint32_t dwVersion, void *riidltf, void *ppvOut, void *punkOuter)'),
    proto: {
      release: koffi.proto('uint32_t __stdcall JoymapRelease(void *self)'),
      plain: koffi.proto(`${result} JoymapPlain(void *self)`),
      enumDevices: koffi.proto(`${result} JoymapEnumDevices(void *self, uint32_t dwDevType, JoymapEnumDevicesCallback *lpCallback, void *pvRef, uint32_t dwFlags)`),
      create: koffi.proto(`${result} JoymapCreate(void *self, void *guid, void *out, void *outer)`),
      createEffect: koffi.proto(`${result} JoymapCreateEffect(void *self, void *guid, void *effect, void *out, void *outer)`),
      pointer: koffi.proto(`${result} JoymapPointer(void *self, void *value)`),
      cooperative: koffi.proto(`${result} JoymapCooperative(void *self, intptr_t hwnd, uint32_t dwFlags)`),
      setParameters: koffi.proto(`${result} JoymapSetParameters(void *self, void *effect, uint32_t dwFlags)`),
      start: koffi.proto(`${result} JoymapStart(void *self, uint32_t dwIterations, uint32_t dwFlags)`),
    },
  };
  return win32;
}

// Calls function number `index` of a COM object. Results are HRESULTs, as unsigned numbers.
function invoke(object, index, proto, ...args) {
  const { koffi } = loadWin32();
  const method = koffi.decode(koffi.decode(object, 'void *'), index * 8, 'void *');
  return koffi.call(method, proto, object, ...args) >>> 0;
}

const failed = (hresult) => hresult >= 0x80000000;
const hex = (hresult) => `0x${hresult.toString(16).padStart(8, '0')}`;

// status.state: off | ready | missing (DirectInput lists no such force feedback stick) |
// error (a step failed: status.detail says which, and with what result) | unsupported
// A 'status' event says when it changes.
export class ForceFeedback extends EventEmitter {
  constructor() {
    super();
    this.status = { state: process.platform === 'win32' && process.arch === 'x64' ? 'off' : 'unsupported', detail: '' };
    this.di = null;
    this.device = null;
    this.effects = null; // { large, small }, each { object, effect, periodic, magnitude, playing }
    this.keep = []; // buffers DirectInput holds pointers into
    this.wanted = { large: 0, small: 0 };
    this.timer = null;
    this.sentAt = 0;
  }

  get open() {
    return this.device !== null;
  }

  setStatus(state, detail = '') {
    if (this.status.state === 'unsupported' || (this.status.state === state && this.status.detail === detail)) return;
    this.status = { state, detail };
    this.emit('status', this.status);
  }

  fail(step, hresult) {
    this.release();
    this.setStatus('error', hresult === undefined ? step : `${step} ${hex(hresult)}`);
    return false;
  }

  // Takes the stick with these USB IDs for force feedback. `hwnd` is the app's window, as
  // BrowserWindow.getNativeWindowHandle() gives it. `anyStick` also accepts one without
  // force feedback, to try every step short of the effects on whatever is plugged in.
  // Returns true once the stick is ready to shake.
  start({ vendorId, productId, hwnd, anyStick = false }) {
    if (this.status.state === 'unsupported') return false;
    this.release();
    try {
      return this.acquire({ vendorId, productId, hwnd, anyStick });
    } catch (err) {
      return this.fail(err.message);
    }
  }

  acquire({ vendorId, productId, hwnd, anyStick }) {
    const api = loadWin32();
    const address = (buffer) => api.koffi.address(buffer);
    const out = Buffer.alloc(8);
    const pointer = () => out.readBigUInt64LE(0);

    let hr = api.DirectInput8Create(api.GetModuleHandleW(null), DIRECTINPUT_VERSION, guidBuffer(IID_IDirectInput8W), out, null) >>> 0;
    if (failed(hr) || pointer() === 0n) return this.fail('DirectInput8Create', hr);
    this.di = pointer();

    // The stick's instance, found by the USB IDs in its product GUID.
    const wanted = productCode(vendorId, productId);
    let instance = null;
    const flags = DIEDFL_ATTACHEDONLY | (anyStick ? 0 : DIEDFL_FORCEFEEDBACK);
    hr = invoke(this.di, DI_ENUM_DEVICES, api.proto.enumDevices, DI8DEVCLASS_GAMECTRL, (found) => {
      if (api.koffi.decode(found, 20, 'uint32_t') !== wanted) return DIENUM_CONTINUE;
      instance = Buffer.from(api.koffi.decode(found, 4, api.koffi.array('uint8_t', 16)));
      return DIENUM_STOP;
    }, null, flags);
    if (failed(hr)) return this.fail('EnumDevices', hr);
    if (!instance) {
      this.release();
      this.setStatus('missing');
      return false;
    }

    out.fill(0);
    hr = invoke(this.di, DI_CREATE_DEVICE, api.proto.create, instance, out, null);
    if (failed(hr) || pointer() === 0n) return this.fail('CreateDevice', hr);
    this.device = pointer();

    const axes = axesFormat(address);
    this.keep.push(axes.format, ...axes.keep);
    hr = invoke(this.device, DEVICE_SET_DATA_FORMAT, api.proto.pointer, axes.format);
    if (failed(hr)) return this.fail('SetDataFormat', hr);
    hr = invoke(this.device, DEVICE_SET_COOPERATIVE_LEVEL, api.proto.cooperative, hwnd.readBigUInt64LE(0), DISCL_EXCLUSIVE | DISCL_BACKGROUND);
    if (failed(hr)) return this.fail('SetCooperativeLevel', hr);
    hr = invoke(this.device, DEVICE_ACQUIRE, api.proto.plain);
    if (failed(hr)) return this.fail('Acquire', hr);

    const sine = guidBuffer(GUID_Sine);
    this.effects = {}; // filled as they are made, so a failure part way releases the rest
    for (const motor of Object.keys(MOTORS)) {
      const made = sineEffect(address, MOTORS[motor]);
      this.keep.push(made.effect, made.periodic, ...made.keep);
      out.fill(0);
      hr = invoke(this.device, DEVICE_CREATE_EFFECT, api.proto.createEffect, sine, made.effect, out, null);
      if (failed(hr) || pointer() === 0n) return this.fail(`CreateEffect ${motor}`, hr);
      this.effects[motor] = { object: pointer(), effect: made.effect, periodic: made.periodic, magnitude: 0, playing: false };
    }
    this.setStatus('ready');
    return true;
  }

  // The motor speeds to play, each 0 to 255. Stopping is immediate; anything else waits
  // its turn, so the stick is told at most every UPDATE_MS.
  set(large, small) {
    this.wanted = { large, small };
    if (!this.effects) return;
    const wait = large === 0 && small === 0 ? 0 : this.sentAt + UPDATE_MS - Date.now();
    clearTimeout(this.timer);
    if (wait <= 0) this.apply();
    else this.timer = setTimeout(() => this.apply(), wait);
  }

  apply() {
    this.timer = null;
    if (!this.effects) return;
    this.sentAt = Date.now();
    try {
      for (const motor of Object.keys(MOTORS)) {
        const hr = this.play(this.effects[motor], magnitudeFor(motor, this.wanted[motor]));
        if (failed(hr)) return this.fail(`Play ${motor}`, hr);
      }
    } catch (err) {
      this.fail(err.message);
    }
  }

  // Brings one effect to `magnitude`: stopped at 0, started or changed otherwise. If the
  // stick was taken away meanwhile, takes it back and tries once more.
  play(entry, magnitude, retry = true) {
    if (entry.magnitude === magnitude) return 0;
    const api = loadWin32();
    let hr;
    if (magnitude === 0) {
      hr = invoke(entry.object, EFFECT_STOP, api.proto.plain);
    } else {
      entry.periodic.writeUInt32LE(magnitude, 0);
      hr = invoke(entry.object, EFFECT_SET_PARAMETERS, api.proto.setParameters, entry.effect, DIEP_TYPESPECIFICPARAMS | (entry.playing ? 0 : DIEP_START));
    }
    if (LOST.includes(hr) && retry && !failed(invoke(this.device, DEVICE_ACQUIRE, api.proto.plain))) {
      // A stick that was taken away has forgotten what it was playing.
      for (const other of Object.values(this.effects)) Object.assign(other, { magnitude: 0, playing: false });
      return this.play(entry, magnitude, false);
    }
    if (!failed(hr)) Object.assign(entry, { magnitude, playing: magnitude > 0 });
    return hr;
  }

  // Stops the stick and gives it back.
  close() {
    this.release();
    this.setStatus('off');
  }

  // The same, leaving the status as it is. Safe at any point, however far start got.
  release() {
    clearTimeout(this.timer);
    this.timer = null;
    const api = this.di === null ? null : loadWin32();
    const quietly = (object, index, proto) => {
      try {
        invoke(object, index, proto);
      } catch {
        // going away regardless
      }
    };
    for (const entry of Object.values(this.effects ?? {})) {
      quietly(entry.object, EFFECT_STOP, api.proto.plain);
      quietly(entry.object, RELEASE, api.proto.release);
    }
    this.effects = null;
    if (this.device !== null) {
      quietly(this.device, DEVICE_UNACQUIRE, api.proto.plain);
      quietly(this.device, RELEASE, api.proto.release);
    }
    this.device = null;
    if (this.di !== null) quietly(this.di, RELEASE, api.proto.release);
    this.di = null;
    this.keep = [];
    this.wanted = { large: 0, small: 0 };
  }
}
