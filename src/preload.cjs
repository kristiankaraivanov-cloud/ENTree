const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('entree', {
  drives: () => ipcRenderer.invoke('drives'),
  windowControl: action => ipcRenderer.invoke('window-control', action),
  chooseFolder: () => ipcRenderer.invoke('choose-folder'),
  scan: (root, options) => ipcRenderer.invoke('scan', root, options),
  cancel: () => ipcRenderer.invoke('cancel-scan'),
  reveal: selected => ipcRenderer.invoke('reveal', selected),
  trash: paths => ipcRenderer.invoke('trash', paths),
  onScan: callback => { const listener = (_event, data) => callback(data); ipcRenderer.on('scan-event', listener); return () => ipcRenderer.removeListener('scan-event', listener); }
});
