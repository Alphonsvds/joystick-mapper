// Electron main process: owns the joystick, the mapping engine and the virtual
// Xbox controller, and streams live state to the UI. Everything that matters for
// the game happens here, so it keeps working with the window in the background.
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, net, shell } from 'electron';
import electronUpdater from 'electron-updater';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JoystickManager } from './joystick.js';
import { createVirtualPad, VIGEM_DOWNLOAD_URL } from './vigem.js';
import { readJson, writeJsonAtomic } from './store.js';
import { emptyBindings, sanitizeBinding } from '../shared/controls.js';
import { isCentered } from '../shared/devices.js';
import { NEUTRAL_INPUT, NEUTRAL_OUTPUT, mapInput, sameOutput } from '../shared/mapper.js';
import { PRESETS } from '../shared/presets.js';
import { LATEST_RELEASE_API, updateFromRelease } from '../shared/updates.js';
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
const NEW_ISSUE_URL = 'https://github.com/Alphonsvds/joystick-mapper/issues/new?template=joystick-support.yml';
const LEGACY_EXTREME_KEY = '046d:c215';
const UPDATE_CHECK_MS = 6 * 60 * 60 * 1000;
// JOYMAP_VERSION pretends to be another version, to see the update button (e.g. 0.1.0).
const currentVersion = () => process.env.JOYMAP_VERSION || app.getVersion();
// The installed Windows app can download a release's installer and run it. Anywhere else
// (from source, macOS) the update button opens the release page instead.
// JOYMAP_UPDATE_FEED points the updater at a folder of build output served over HTTP,
// to try an update without publishing a release.
const { autoUpdater } = electronUpdater;
const canSelfUpdate = () => app.isPackaged && process.platform === 'win32';

// JOYMAP_GENERIC=1 shows even known sticks with the generic layout (tests that path).
const joystick = new JoystickManager({ ignoreSkins: process.env.JOYMAP_GENERIC === '1' });
const pad = createVirtualPad();

let win = null;
let library = emptyLibrary();
let working = getProfile(library, library.active).bindings; // unsaved edits to the active profile
// Per-stick settings: { selected, devices: { [key]: { calibration: {axisId: centre}, centered: {axisId: bool} } } }
let deviceSettings = { selected: null, devices: {} };
let paused = false; // emulation switched off while a game profile is active
// Once a newer release has been seen: { version, url, inApp, state, progress }.
// inApp: it can be installed from here. state: available | downloading | installing.
let update = null;
let input = NEUTRAL_INPUT;
let output = NEUTRAL_OUTPUT;
let frameDirty = true;

const profilesFile = () => path.join(app.getPath('userData'), 'profiles.json');
const devicesFile = () => path.join(app.getPath('userData'), 'devices.json');
const legacyCalibrationFile = () => path.join(app.getPath('userData'), 'calibration.json');
// Shipped inside the installer (see package.json extraResources).
const bundledDriver = () => path.join(process.resourcesPath, 'vigembus', 'ViGEmBus_Setup.exe');

const activeProfile = () => getProfile(library, library.active);
const locked = () => isLocked(library.active);
const dirty = () => !locked() && JSON.stringify(working) !== JSON.stringify(activeProfile().bindings);
const emulating = () => !locked() && !paused;
const windowAlive = () => win !== null && !win.isDestroyed();
const settingsFor = (key) => deviceSettings.devices[key] ?? {};

function status() {
  const profile = activeProfile();
  const key = joystick.model?.key;
  return {
    joystick: { ...joystick.status, settings: key ? settingsFor(key) : {} },
    pad: pad.status,
    profile: { id: profile.id, name: profile.name, locked: profile.locked },
    emulation: emulating(),
    dirty: dirty(),
    update: update && { version: update.version, inApp: update.inApp, state: update.state, progress: update.progress },
  };
}

function snapshot() {
  return { profiles: listProfiles(library), activeId: library.active, bindings: working, status: status() };
}

function sendStatus() {
  if (windowAlive()) win.webContents.send('joymap:status', status());
}

function setupUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  if (process.env.JOYMAP_UPDATE_FEED) autoUpdater.setFeedURL({ provider: 'generic', url: process.env.JOYMAP_UPDATE_FEED });
  autoUpdater.on('download-progress', ({ percent }) => {
    const progress = Math.round(percent);
    if (update?.state !== 'downloading' || update.progress === progress) return;
    update = { ...update, progress };
    sendStatus();
  });
  // Failures are handled where the updater is called; this keeps them from being unhandled.
  autoUpdater.on('error', () => {});
}

// The release the updater can install, if it's newer: it has the files the updater needs.
async function findInstallableUpdate() {
  const result = await autoUpdater.checkForUpdates();
  if (!result?.isUpdateAvailable) return null;
  const found = updateFromRelease({ tag_name: result.updateInfo.version }, app.getVersion());
  return found && { ...found, inApp: true };
}

// GitHub's latest release, if it's newer. Only its page can be opened.
async function findReleasePage() {
  const response = await net.fetch(LATEST_RELEASE_API, { headers: { Accept: 'application/vnd.github+json' } });
  if (!response.ok) return null;
  const found = updateFromRelease(await response.json(), currentVersion());
  return found && { ...found, inApp: false };
}

// Looks for a newer release and tells the UI. Nothing is downloaded until the button is
// clicked; being offline (or rate limited) just means no button.
async function checkForUpdate() {
  if (update && update.state !== 'available') return; // mid-download or installing
  let found = null;
  try {
    // A release without the updater's files makes the first lookup throw; its page still works.
    found = canSelfUpdate() ? await findInstallableUpdate().catch(findReleasePage) : await findReleasePage();
  } catch {
    return; // Try again at the next check.
  }
  if (update && update.state !== 'available') return;
  if (found?.version === update?.version && found?.inApp === update?.inApp) return;
  update = found && { ...found, state: 'available', progress: 0 };
  sendStatus();
}

function setUpdateState(state, progress = 0) {
  update = { ...update, state, progress };
  sendStatus();
}

// Downloads the release's installer, then quits and runs it (Windows asks for permission,
// as it did on first install). Profiles and calibration are untouched. If anything goes
// wrong the release page opens instead, which is also what happens when inApp is false.
async function installUpdate() {
  if (!update || update.state !== 'available') return;
  if (!update.inApp) {
    shell.openExternal(update.url);
    return;
  }
  try {
    setUpdateState('downloading');
    await autoUpdater.downloadUpdate();
    if (!(await settleUnsaved())) return setUpdateState('available');
    setUpdateState('installing');
    autoUpdater.quitAndInstall(true, true);
  } catch {
    update = { ...update, inApp: false, state: 'available', progress: 0 };
    sendStatus();
    shell.openExternal(update.url);
    throw new Error('Couldn’t update from here, so the download page was opened');
  }
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

// Reads devices.json, folding in the pre-universal calibration.json (Extreme 3D Pro only).
function loadDeviceSettings() {
  const raw = readJson(devicesFile());
  const settings = { selected: null, devices: {} };
  if (raw && typeof raw === 'object') {
    if (typeof raw.selected === 'string') settings.selected = raw.selected;
    for (const [key, value] of Object.entries(raw.devices ?? {})) {
      if (!/^[0-9a-f]{4}:[0-9a-f]{4}$/.test(key) || !value || typeof value !== 'object') continue;
      const clean = {};
      for (const field of ['calibration', 'centered']) {
        if (value[field] && typeof value[field] === 'object') {
          clean[field] = Object.fromEntries(
            Object.entries(value[field]).filter(([, v]) => (field === 'centered' ? typeof v === 'boolean' : Number.isFinite(v))),
          );
        }
      }
      settings.devices[key] = clean;
    }
  }
  const legacy = readJson(legacyCalibrationFile());
  if (legacy && !settings.devices[LEGACY_EXTREME_KEY]?.calibration) {
    const calibration = { x: Number(legacy.roll), y: Number(legacy.pitch), rz: Number(legacy.yaw) };
    if (Object.values(calibration).every(Number.isFinite)) {
      settings.devices[LEGACY_EXTREME_KEY] = { ...settings.devices[LEGACY_EXTREME_KEY], calibration };
    }
  }
  return settings;
}

function updateDeviceSettings(key, change) {
  deviceSettings = {
    ...deviceSettings,
    devices: { ...deviceSettings.devices, [key]: change(settingsFor(key)) },
  };
  joystick.setSettings(deviceSettings.devices);
  writeJsonAtomic(devicesFile(), deviceSettings);
  sendStatus();
}

function applyCalibration(key, centres) {
  updateDeviceSettings(key, (s) => ({ ...s, calibration: { ...s.calibration, ...centres } }));
}

// Spring-centred axes of the current stick that don't have a measured centre yet.
function uncalibratedAxes() {
  const model = joystick.model;
  if (!model) return [];
  const s = settingsFor(model.key);
  return model.axes.filter((a) => isCentered(a, s) && !Number.isFinite(s.calibration?.[a.id]));
}

// Until the stick's centred axes have a saved centre, keep trying whenever it's left at
// rest. Sticks only report changes (many ignore "send your current state" requests), so
// right after connecting there may be nothing to measure yet, or someone may be holding it.
let autoCenterTimer = null;
let autoCentering = false;
function autoCenter() {
  if (autoCentering || uncalibratedAxes().length === 0 || joystick.status.state !== 'connected') return;
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
  const key = joystick.model?.key;
  const measured = await joystick.measureCenter(onlyIfResting ? 800 : 500);
  if (!measured || !key || joystick.model?.key !== key || Object.keys(measured).length === 0) return false;
  if (onlyIfResting) {
    for (const m of Object.values(measured)) {
      const [min, max] = m.range;
      if (m.spread > AUTO_CENTER_MAX_SPREAD) return false;
      if (Math.abs(m.mean - (min + max) / 2) / (max - min) > AUTO_CENTER_MAX_OFFSET) return false;
    }
  }
  applyCalibration(key, Object.fromEntries(Object.entries(measured).map(([id, m]) => [id, m.mean])));
  return true;
}

function registerIpc() {
  ipcMain.handle('joymap:init', () => ({
    ...snapshot(),
    presets: PRESETS.map(({ id, name, description, skin }) => ({ id, name, description, skin })),
    platform: process.platform,
  }));

  ipcMain.handle('joymap:set-binding', (_event, controlId, binding) => {
    if (locked()) throw new Error('The Default profile can’t be changed');
    const clean = sanitizeBinding(controlId, binding);
    if (!clean) throw new Error(`Invalid binding for ${controlId}`);
    const { [controlId]: _previous, ...rest } = working;
    working = clean.target === null ? rest : { ...rest, [controlId]: clean };
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

  ipcMain.handle('joymap:select-device', async (_event, key) => {
    if (typeof key !== 'string') return false;
    deviceSettings = { ...deviceSettings, selected: key };
    writeJsonAtomic(devicesFile(), deviceSettings);
    await joystick.select(key);
    return true;
  });

  // Throttle-style axes read end to end; spring-centred ones read from a calibrated middle.
  ipcMain.handle('joymap:set-axis-centered', (_event, axisId, centered) => {
    const key = joystick.model?.key;
    if (!key || !joystick.model.axes.some((a) => a.id === axisId)) return false;
    updateDeviceSettings(key, (s) => ({ ...s, centered: { ...s.centered, [axisId]: centered === true } }));
    autoCenter();
    return true;
  });

  ipcMain.handle('joymap:copy-device-info', () => {
    const report = joystick.deviceReport();
    if (!report) return false;
    const info = { app: `${app.getName()} ${app.getVersion()}`, os: `${process.platform} ${os.release()}`, ...report };
    clipboard.writeText(JSON.stringify(info, null, 2));
    return true;
  });

  ipcMain.handle('joymap:report-device', () => shell.openExternal(NEW_ISSUE_URL));

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

  ipcMain.handle('joymap:install-update', () => installUpdate());
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
    deviceSettings = loadDeviceSettings();
    joystick.setSettings(deviceSettings.devices);
    joystick.preferredKey = deviceSettings.selected;

    joystick.on('state', (state) => {
      input = state;
      pump();
      if (uncalibratedAxes().length) autoCenter(); // the first report is the first chance to measure
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

    setupUpdater();
    checkForUpdate();
    setInterval(checkForUpdate, UPDATE_CHECK_MS);
  });

  app.on('window-all-closed', () => app.quit());

  app.on('will-quit', () => {
    pad.disconnect();
    joystick.stop();
  });
}
