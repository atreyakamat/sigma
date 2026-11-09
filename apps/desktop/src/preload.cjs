// Minimal, read-mostly bridge for the web client running inside the desktop window.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sigmaDesktop', {
  getStatus: () => ipcRenderer.invoke('sigma:status'),
  setSharing: (on) => ipcRenderer.invoke('sigma:set-sharing', !!on),
});
