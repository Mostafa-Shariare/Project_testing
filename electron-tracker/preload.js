const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  startTracking: (config) => ipcRenderer.send('start-tracking', config),
  stopTracking: () => ipcRenderer.send('stop-tracking'),
  togglePause: (paused) => ipcRenderer.send('toggle-pause', paused),
  updateHud: (toggles) => ipcRenderer.send('update-hud', toggles),
  openStudentApp: (url) => ipcRenderer.send('open-student-app', url),
  loadConfig: () => ipcRenderer.invoke('load-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),

  // Event listeners
  onEngineData: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('engine-data', handler);
    return () => ipcRenderer.removeListener('engine-data', handler);
  },
  onEngineStatus: (callback) => {
    const handler = (_event, status) => callback(status);
    ipcRenderer.on('engine-status', handler);
    return () => ipcRenderer.removeListener('engine-status', handler);
  },
  onEngineError: (callback) => {
    const handler = (_event, err) => callback(err);
    ipcRenderer.on('engine-error', handler);
    return () => ipcRenderer.removeListener('engine-error', handler);
  },
});
