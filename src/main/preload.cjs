// The only bridge between the sandboxed UI and the main process.
const { contextBridge, ipcRenderer } = require('electron');

const subscribe = (channel) => (callback) => {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('joymap', {
  init: () => ipcRenderer.invoke('joymap:init'),
  setBinding: (controlId, binding) => ipcRenderer.invoke('joymap:set-binding', controlId, binding),
  save: () => ipcRenderer.invoke('joymap:save'),
  selectProfile: (id) => ipcRenderer.invoke('joymap:select-profile', id),
  createProfile: (options) => ipcRenderer.invoke('joymap:create-profile', options),
  renameProfile: (id, name) => ipcRenderer.invoke('joymap:rename-profile', id, name),
  resetProfile: (id) => ipcRenderer.invoke('joymap:reset-profile', id),
  deleteProfile: (id) => ipcRenderer.invoke('joymap:delete-profile', id),
  exportProfile: (id) => ipcRenderer.invoke('joymap:export-profile', id),
  importProfile: () => ipcRenderer.invoke('joymap:import-profile'),
  setEmulation: (on) => ipcRenderer.invoke('joymap:set-emulation', on),
  openControls: () => ipcRenderer.invoke('joymap:open-controls'),
  selectDevice: (key) => ipcRenderer.invoke('joymap:select-device', key),
  setAxisCentered: (axisId, centered) => ipcRenderer.invoke('joymap:set-axis-centered', axisId, centered),
  copyDeviceInfo: () => ipcRenderer.invoke('joymap:copy-device-info'),
  reportDevice: () => ipcRenderer.invoke('joymap:report-device'),
  recenter: () => ipcRenderer.invoke('joymap:recenter'),
  installDriver: () => ipcRenderer.invoke('joymap:install-driver'),
  installUpdate: () => ipcRenderer.invoke('joymap:install-update'),
  onFrame: subscribe('joymap:frame'),
  onStatus: subscribe('joymap:status'),
});
