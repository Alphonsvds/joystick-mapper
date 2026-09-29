// Electron main process: owns the joystick, the mapping engine and the virtual
// Xbox controller, and streams live state to the UI. Everything that matters for
// the game happens here, so it keeps working with the window in the background.
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXTREME_3D_PRO } from './devices/extreme3dpro.js';
import { JoystickReader } from './joystick.js';
import { createVirtualPad, VIGEM_DOWNLOAD_URL } from './vigem.js';
import { readJson, writeJsonAtomic } from './store.js';
import { CONTROL_BY_ID, emptyBindings, sanitizeBinding } from '../shared/controls.js';
import { NEUTRAL_INPUT, NEUTRAL_OUTPUT, mapInput, sameOutput } from '../shared/mapper.js';
import { PRESETS } from '../shared/presets.js';
import {
  addProfile,
  emptyLibrary,
  fromExport,
  getProfile,
  isLocked,
  listProfiles,
  normalizeLibrary,
  presetBindings,
  removeProfile,
  renameProfile,
  setActive,
  setBindings,
  toExport,
} from '../shared/profiles.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FRAME_MS = 16;
// Auto-centring on first connect only trusts a stick that is clearly at rest.
const AUTO_CENTER_MAX_SPREAD = 0.04;
const AUTO_CENTER_MAX_OFFSET = 0.15;
const FILE_FILTERS = [{ name: 'Joystick Mapper profile', extensions: ['json'] }];

const joystick = new JoystickReader(EXTREME_3D_PRO);
const pad = createVirtualPad();

let win = null;
let library = emptyLibrary();
let working = getProfile(library, library.active).bindings; // unsaved edits to the active profile
let calibration = null;
let paused = false; // emulation switched off while a game profile is active
let input = NEUTRAL_INPUT;
let output = NEUTRAL_OUTPUT;
let frameDirty = true;

const profilesFile = () => path.join(app.getPath('userData'), 'profiles.json');
const calibrationFile = () => path.join(app.getPath('userData'), 'calibration.json');
// Shipped inside the installer (see package.json extraResources).
const bundledDriver = () => path.join(process.resourcesPath, 'vigembus', 'ViGEmBus_Setup.exe');

const activeProfile = () => getProfile(library, library.active);
const locked = () => isLocked(library.active);
const dirty = () => !locked() && JSON.stringify(working) !== JSON.stringify(activeProfile().bindings);
const emulating = () => !locked() && !paused;
const windowAlive = () => win !== null && !win.isDestroyed();

function status() {
  const profile = activeProfile();
  return {
    joystick: joystick.status,
    pad: pad.status,
    profile: { id: profile.id, name: profile.name, locked: profile.locked },
    emulation: emulating(),
    calibrated: calibration !== null,
    dirty: dirty(),
  };
}

function snapshot() {
  return { profiles: listProfiles(library), activeId: library.active, bindings: working, status: status() };
}

function sendStatus() {
  if (windowAlive()) win.webContents.send('joymap:status', status());
}

// Recompute the Xbox report and send it to the driver only when it changes.
function pump() {
  const live = emulating() && joystick.status.state === 'connected';
  const next = live ? mapInput(input, working) : NEUTRAL_OUTPUT;
  if (!sameOutput(next, output)) {
    output = next;
    pad.submit(output);
  }
  frameDirty = true;
}

function sendFrame() {
  if (!frameDirty || !windowAlive() || win.isMinimized()) return;
  frameDirty = false;
  win.webContents.send('joymap:frame', { input, output });
}

function persistLibrary() {
  writeJsonAtomic(profilesFile(), library);
}

// Load the active profile's bindings and plug the virtual pad in or out to match.
// Default never has a virtual controller, so games that support the stick natively
// (e.g. Flight Simulator) see exactly what they would without this app.
function activate(id) {
  library = setActive(library, id);
  working = activeProfile().bindings;
  paused = false;
  persistLibrary();
  syncPad();
}

// The virtual controller exists only while a game profile is active and not paused.
function syncPad() {
  if (emulating()) pad.connect();
  else pad.disconnect();
  pump();
  sendStatus();
}

// Resolves true if it's OK to leave the active profile (saved, discarded or clean).
async function settleUnsaved() {
  if (!dirty()) return true;
  const { response } = await dialog.showMessageBox(win, {
    type: 'question',
    buttons: ['Save', "Don't save", 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
    message: `Save changes to "${activeProfile().name}"?`,
    detail: "Your mapping changes will be lost if you don't save them.",
  });
  if (response === 2) return false;
  if (response === 0) saveWorking();
  else working = activeProfile().bindings;
  return true;
}

function saveWorking() {
  if (locked()) return;
  library = setBindings(library, library.active, working);
  working = activeProfile().bindings;
  persistLibrary();
  sendStatus();
}

function loadCalibration() {
  const raw = readJson(calibrationFile());
  if (!raw || typeof raw !== 'object') return null;
  const clean = {};
  for (const [id, spec] of Object.entries(EXTREME_3D_PRO.axes)) {
    if (spec.center === undefined) continue;
    const v = Number(raw[id]);
    if (!Number.isFinite(v) || v < spec.min || v > spec.max) return null;
    clean[id] = v;
  }
  return clean;
}

function applyCalibration(next) {
  calibration = next;
  joystick.setCalibration(next);
  writeJsonAtomic(calibrationFile(), next);
  sendStatus();
}

// Until the stick has a saved centre, keep trying whenever it's left at rest. The stick
// only reports changes (and ignores "send your current state" requests), so right after
// connecting there may be nothing to measure yet, or someone may still be holding it.
let autoCenterTimer = null;
let autoCentering = false;
function autoCenter() {
  if (autoCentering || calibration !== null || joystick.status.state !== 'connected') return;
  clearTimeout(autoCenterTimer);
  autoCentering = true;
  recenter({ onlyIfResting: true })
    .then((ok) => {
      if (!ok) autoCenterTimer = setTimeout(autoCenter, 2000);
    })
    .catch((err) => console.error('Auto-centre failed:', err))
    .finally(() => {
      autoCentering = false;
    });
}

async function recenter({ onlyIfResting }) {
  const measured = await joystick.measureCenter(onlyIfResting ? 800 : 500);
  if (!measured) return false;
  if (onlyIfResting) {
    for (const [id, m] of Object.entries(measured)) {
      const { min, max, center } = EXTREME_3D_PRO.axes[id];
      if (m.spread > AUTO_CENTER_MAX_SPREAD) return false;
      if (Math.abs(m.mean - center) / (max - min) > AUTO_CENTER_MAX_OFFSET) return false;
    }
  }
  applyCalibration(Object.fromEntries(Object.entries(measured).map(([id, m]) => [id, m.mean])));
  return true;
}

function registerIpc() {
  ipcMain.handle('joymap:init', () => ({
    ...snapshot(),
    presets: PRESETS.map(({ id, name, description }) => ({ id, name, description })),
    platform: process.platform,
  }));

  ipcMain.handle('joymap:set-binding', (_event, controlId, binding) => {
    if (locked()) throw new Error('The Default profile can’t be changed');
    const clean = sanitizeBinding(CONTROL_BY_ID[controlId], binding);
    if (!clean) throw new Error(`Invalid binding for ${controlId}`);
    working = { ...working, [controlId]: clean };
    pump();
    sendStatus();
    return snapshot();
  });

  ipcMain.handle('joymap:save', () => {
    saveWorking();
    return snapshot();
  });

  ipcMain.handle('joymap:select-profile', async (_event, id) => {
    if (id !== library.active && getProfile(library, id) && (await settleUnsaved())) activate(id);
    return snapshot();
  });

  ipcMain.handle('joymap:create-profile', async (_event, { name, presetId } = {}) => {
    if (!(await settleUnsaved())) return snapshot();
    const created = addProfile(library, name, presetBindings(presetId));
    library = created.library;
    activate(created.id);
    return snapshot();
  });

  ipcMain.handle('joymap:rename-profile', (_event, id, name) => {
    library = renameProfile(library, id, name);
    persistLibrary();
    sendStatus();
    return snapshot();
  });

  ipcMain.handle('joymap:reset-profile', async (_event, id) => {
    const profile = getProfile(library, id);
    if (!profile || profile.locked) return snapshot();
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['Reset', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
      message: `Reset "${profile.name}"?`,
      detail: 'Every control goes back to Not mapped, the joystick’s default. This can’t be undone.',
    });
    if (response !== 0) return snapshot();
    library = setBindings(library, id, emptyBindings());
    if (id === library.active) working = activeProfile().bindings;
    persistLibrary();
    pump();
    sendStatus();
    return snapshot();
  });

  ipcMain.handle('joymap:delete-profile', async (_event, id) => {
    const profile = getProfile(library, id);
    if (!profile || profile.locked) return snapshot();
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['Delete', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
      message: `Delete "${profile.name}"?`,
      detail: 'Export it first if you might want it back.',
    });
    if (response !== 0) return snapshot();
    const wasActive = id === library.active;
    library = removeProfile(library, id);
    if (wasActive) activate(library.active);
    else persistLibrary();
    return snapshot();
  });

  ipcMain.handle('joymap:export-profile', async (_event, id) => {
    const profile = getProfile(library, id);
    if (!profile || profile.locked) return false;
    // Export what's on screen, including unsaved edits.
    const bindings = id === library.active ? working : profile.bindings;
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Export profile',
      defaultPath: path.join(app.getPath('documents'), `${profile.name.replace(/[\\/:*?"<>|]/g, '')}.joymap.json`),
      filters: FILE_FILTERS,
    });
    if (canceled || !filePath) return false;
    writeJsonAtomic(filePath, toExport({ ...profile, bindings }));
    return true;
  });

  ipcMain.handle('joymap:import-profile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Import profile',
      properties: ['openFile'],
      filters: FILE_FILTERS,
    });
    if (canceled || !filePaths?.length) return snapshot();
    const imported = fromExport(readJson(filePaths[0]));
    if (!imported) throw new Error('That file isn’t a Joystick Mapper profile');
    if (!(await settleUnsaved())) return snapshot();
    const created = addProfile(library, imported.name, imported.bindings);
    library = created.library;
    activate(created.id);
    return snapshot();
  });

  ipcMain.handle('joymap:set-emulation', (_event, on) => {
    if (!locked()) {
      paused = on !== true;
      syncPad();
    }
    return snapshot();
  });

  ipcMain.handle('joymap:open-controls', () => openControlsWindow());

  ipcMain.handle('joymap:recenter', () => recenter({ onlyIfResting: false }));

  ipcMain.handle('joymap:install-driver', async () => {
    // The installed app carries the official ViGEmBus installer; Windows asks for admin.
    if (app.isPackaged && fs.existsSync(bundledDriver())) {
      const error = await shell.openPath(bundledDriver());
      if (!error) return 'launched';
    }
    await shell.openExternal(VIGEM_DOWNLOAD_URL);
    return 'website';
  });
}

const webPreferences = () => ({
  preload: path.join(here, 'preload.cjs'),
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
});

function lockDown(target) {
  target.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  target.webContents.on('will-navigate', (event) => event.preventDefault());
  target.webContents.on('before-input-event', (_event, key) => {
    if (key.type === 'keyDown' && key.key === 'F12') target.webContents.toggleDevTools();
  });
}

// A separate, movable window (e.g. for a second monitor) with the game's own controls.
let controlsWin = null;
function openControlsWindow() {
  if (controlsWin && !controlsWin.isDestroyed()) {
    if (controlsWin.isMinimized()) controlsWin.restore();
    controlsWin.focus();
    return;
  }
  const sheet = new BrowserWindow({
    width: 560,
    height: 700,
    minWidth: 460,
    minHeight: 420,
    backgroundColor: '#000000',
    title: 'Game controls',
    icon: path.join(here, '../renderer/assets/icon.png'),
    show: false,
    autoHideMenuBar: true,
    webPreferences: webPreferences(),
  });
  controlsWin = sheet;
  lockDown(sheet);
  sheet.once('ready-to-show', () => sheet.show());
  sheet.on('closed', () => {
    if (controlsWin === sheet) controlsWin = null;
  });
  sheet.loadFile(path.join(here, '../renderer/controls.html'));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: '#000000',
    title: 'Joystick Mapper',
    icon: path.join(here, '../renderer/assets/icon.png'),
    show: false,
    autoHideMenuBar: true,
    webPreferences: webPreferences(),
  });
  win.once('ready-to-show', () => win.show());
  lockDown(win);
  // Offer to save before closing with unsaved changes.
  let closing = false;
  win.on('close', (event) => {
    if (closing || !dirty()) return;
    event.preventDefault();
    settleUnsaved().then((ok) => {
      if (!ok || !windowAlive()) return;
      closing = true;
      win.close();
    });
  });
  win.on('restore', () => {
    frameDirty = true;
  });
  win.on('closed', () => {
    win = null;
    // The controls sheet belongs to the mapper; don't leave it (and the pad) running alone.
    if (controlsWin && !controlsWin.isDestroyed()) controlsWin.close();
  });
  win.loadFile(path.join(here, '../renderer/index.html'));
}

if (!app.requestSingleInstanceLock()) {
  // A second copy would plug in a second virtual controller; focus the first instead.
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!windowAlive()) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    library = normalizeLibrary(readJson(profilesFile()));
    working = activeProfile().bindings;
    calibration = loadCalibration();
    joystick.setCalibration(calibration);

    joystick.on('state', (state) => {
      input = state;
      pump();
      if (calibration === null) autoCenter(); // the first report is the first chance to measure
    });
    joystick.on('lost', () => {
      input = NEUTRAL_INPUT;
      pump();
    });
    joystick.on('status', (s) => {
      pump();
      sendStatus();
      if (s.state === 'connected') autoCenter();
    });
    pad.on('status', (s) => {
      if (s.state === 'connected') pad.submit(output);
      sendStatus();
    });

    registerIpc();
    if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
    createWindow();

    joystick.start();
    if (emulating()) pad.connect();
    setInterval(sendFrame, FRAME_MS);
  });

  app.on('window-all-closed', () => app.quit());

  app.on('will-quit', () => {
    pad.disconnect();
    joystick.stop();
  });
}
