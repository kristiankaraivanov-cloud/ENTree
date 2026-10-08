const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const { Worker } = require('node:worker_threads');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const { validateTrash, inside } = require('./scanner.cjs');
let window, worker, root, manifest = new Map(), scanResult, busy = false;
const pageURL = pathToFileURL(path.join(__dirname, 'index.html')).href;
if (process.argv.includes('--verify')) app.commandLine.appendSwitch('force-device-scale-factor', '1');

function trusted(event) {
  if (event.sender !== window.webContents || event.senderFrame?.url !== pageURL) throw new Error('Untrusted request.');
}
function startScan(chosen, options = {}) {
  if (busy) throw new Error('Wait for the recycle operation to finish.');
  if (worker) worker.terminate();
  manifest.clear(); scanResult = null;
  const current = new Worker(path.join(__dirname, 'scanner.cjs'), { workerData: { root: chosen, options: { hidden: options.hidden !== false } } });
  worker = current;
  current.on('message', msg => {
    if (worker !== current || window.isDestroyed()) return;
    if (msg.type === 'complete') {
      root = msg.result.tree.path;
      manifest = new Map(msg.result.manifest);
      scanResult = msg.result;
      delete msg.result.manifest;
      worker = null;
    } else if (msg.type === 'error') worker = null;
    window.webContents.send('scan-event', msg);
  });
  current.on('error', error => {
    if (worker !== current) return;
    worker = null;
    if (!window.isDestroyed()) window.webContents.send('scan-event', { type: 'error', message: error.message });
  });
}
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  const verifying = process.argv.includes('--verify');
  window = new BrowserWindow({ width: verifying ? 1672 : 1440, height: verifying ? 943 : 860, useContentSize: true, show: !verifying, minWidth: 860, minHeight: 620, frame: false, title: 'ENTree', backgroundColor: '#130922', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  ipcMain.handle('window-control', (event, action) => { trusted(event); if (action === 'minimize') window.minimize(); else if (action === 'maximize') window.isMaximized() ? window.unmaximize() : window.maximize(); else if (action === 'close') window.close(); });
  ipcMain.handle('drives', event => {
    trusted(event);
    if (process.platform !== 'win32') return [{ path: path.parse(os.homedir()).root, label: 'Filesystem' }, { path: os.homedir(), label: 'Home folder' }];
    return new Promise(resolve => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID,VolumeName | ConvertTo-Json -Compress'], { windowsHide: true, timeout: 10000 }, (error, output) => {
      if (error) { resolve([{ path: path.parse(os.homedir()).root, label: 'Local Disk' }]); return; }
      try { const data = JSON.parse(output); resolve([].concat(data).filter(Boolean).map(d => ({ path: `${d.DeviceID}\\`, label: `${d.VolumeName || 'Local Disk'} (${d.DeviceID})` }))); } catch { resolve([{ path: path.parse(os.homedir()).root, label: 'Local Disk' }]); }
    }));
  });
  ipcMain.handle('choose-folder', async event => {
    trusted(event);
    if (busy) throw new Error('Wait for recycling to finish.');
    const selected = await dialog.showOpenDialog(window, { properties: ['openDirectory'], title: 'Choose a folder for ENTree' });
    return selected.canceled ? null : selected.filePaths[0];
  });
  ipcMain.handle('scan', (event, chosen, options) => { trusted(event); startScan(chosen, options); });
  ipcMain.handle('cancel-scan', event => { trusted(event); if (worker) worker.terminate(); worker = null; });
  ipcMain.handle('reveal', (event, selected) => {
    trusted(event);
    if (!manifest.has(selected)) throw new Error('Scan this item first.');
    shell.showItemInFolder(selected);
  });
  ipcMain.handle('trash', async (event, paths) => {
    trusted(event);
    if (busy || worker || !scanResult) throw new Error('Finish scanning first.');
    if (!Array.isArray(paths) || !paths.length || paths.length > 1000) throw new Error('Invalid selection.');
    const unique = [...new Set(paths)];
    const candidates = unique.filter(p => !unique.some(parent => p !== parent && inside(parent, p)));
    const valid = candidates.map(p => validateTrash(root, p, manifest));
    busy = true;
    try {
      const { response } = await dialog.showMessageBox(window, { type: 'warning', title: 'Review recycling', message: `Move ${valid.length} item(s) to the Recycle Bin / Trash?`, detail: valid.join('\n'), buttons: ['Cancel', 'Move to Trash'], defaultId: 0, cancelId: 0 });
      if (response !== 1) return { canceled: true };
      const errors = []; let moved = 0;
      for (const p of valid) {
        try { validateTrash(root, p, manifest); await shell.trashItem(p); moved++; }
        catch (error) { errors.push({ path: p, message: error.message }); }
      }
      manifest.clear(); scanResult = null;
      return { moved, errors };
    } finally { busy = false; }
  });
  window.loadFile(path.join(__dirname, 'index.html')).then(() => {
    if (verifying) {
      require('../scripts/verify.cjs')(window, () => ({ result: scanResult, root })).then(() => app.quit()).catch(error => { console.error(error); app.exit(1); });
      return;
    }
    const argument = process.argv.find(a => a.startsWith('--scan='));
    if (argument && fs.existsSync(argument.slice(7))) startScan(argument.slice(7), { hidden: true });
  });
  window.on('closed', () => { if (worker) worker.terminate(); });
});
app.on('window-all-closed', () => app.quit());
