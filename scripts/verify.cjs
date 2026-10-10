const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

module.exports = async function verify(window, getState) {
  const outputArgument = process.argv.find(a => a.startsWith('--verification-output='));
  const output = outputArgument ? path.resolve(outputArgument.slice(22)) : path.resolve(__dirname, '../docs');
  fs.mkdirSync(output, { recursive: true });
  const evaluate = script => window.webContents.executeJavaScript(script);
  const ready = async () => {
    const start = Date.now();
    while (Date.now() - start < 15000) {
      if (await evaluate("document.querySelector('#drive').options[0]?.value || ''")) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Local drives were not detected.');
  };
  await ready();
  assert.equal(await evaluate("document.querySelectorAll('#tree-rows tr').length"), 0, 'No fabricated startup files');
  assert.ok(!await evaluate("document.body.textContent.includes('DEMO DATA')"));
  const drives = await evaluate('window.entree.drives()');
  const systemRoot = path.parse(os.homedir()).root;
  const systemDrive = drives.find(d => d.path.toLowerCase() === systemRoot.toLowerCase());
  assert.ok(systemDrive && systemDrive.total > 0 && systemDrive.free >= 0, 'Real system drive capacity');
  const actualVolume = fs.statfsSync(systemRoot);
  assert.ok(Math.abs(systemDrive.total - actualVolume.blocks * actualVolume.bsize) < 1048576, 'Drive total matches filesystem');
  assert.ok(Math.abs(systemDrive.free - actualVolume.bavail * actualVolume.bsize) < 536870912, 'Drive free space matches filesystem');
  assert.equal(await evaluate("document.querySelector('#volume-total').textContent"), await evaluate(`bytes(${systemDrive.total})`));
  assert.ok(await evaluate("document.querySelector('#all-disks').textContent.includes('All local disks:')"));

  await evaluate("document.querySelector('#settings').click()");
  assert.ok(await evaluate("document.querySelector('#settings-dialog').open"));
  assert.equal(await evaluate("document.querySelector('#scanLimit').value"), '250000');
  await evaluate("document.querySelector('#theme').value='dark'; document.querySelector('#theme').dispatchEvent(new Event('input')); document.querySelector('#scanLimit').value='500000'; document.querySelector('#scanLimit').dispatchEvent(new Event('input')); document.querySelector('#settings-dialog .close-dialog').click()");
  assert.ok(await evaluate("document.body.classList.contains('dark')"));
  await window.webContents.reload();
  await new Promise(resolve => window.webContents.once('did-finish-load', resolve));
  await ready();
  assert.ok(await evaluate("document.body.classList.contains('dark')"), 'Appearance persists');
  assert.equal(await evaluate("document.querySelector('#scanLimit').value"), '500000', 'Scan limit persists');
  await evaluate("document.querySelector('#reset-settings').click()");
  assert.ok(await evaluate("document.body.classList.contains('aurora')"));
  assert.ok(await evaluate("new Promise(resolve => { const image=new Image(); image.onload=()=>resolve(image.naturalWidth>1000); image.onerror=()=>resolve(false); image.src='assets/aurora-violet.png'; })"));

  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'entree-native-'));
  try {
    fs.mkdirSync(path.join(fixture, 'Projects'));
    fs.writeFileSync(path.join(fixture, 'Projects', 'code.js'), Buffer.alloc(8192));
    fs.writeFileSync(path.join(fixture, 'note.txt'), 'ENTree');
    await evaluate(`scanFolder(${JSON.stringify(fixture)})`);
    const start = Date.now();
    while (!getState().result && Date.now() - start < 15000) await new Promise(resolve => setTimeout(resolve, 100));
    const state = getState();
    assert.ok(state.result, 'Native worker scan completed');
    assert.equal(state.result.tree.size, 8198);
    assert.equal(state.result.tree.files, 2);
    assert.ok(state.result.tree.allocated !== null);
    await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    assert.equal(await evaluate("document.querySelector('#source-badge').textContent"), 'LOCAL · PRIVATE');
    assert.equal(await evaluate("document.querySelectorAll('#extension-rows tr').length"), 2);
    assert.ok(await evaluate("document.querySelector('#tree-rows').textContent.includes('Projects')"));
    assert.ok(await evaluate("document.querySelector('#tree-rows').textContent.includes('note.txt')"));
    assert.equal(await evaluate("document.querySelector('#volume-total').textContent"), await evaluate(`bytes(${state.result.volume.total})`));
    await evaluate("document.querySelector('#file-tab').click(); document.querySelector('#largest-files').click()");
    assert.equal(await evaluate("document.querySelectorAll('#tree-rows tr').length"), 2);
    await evaluate("document.querySelector('#search').value='.txt'; document.querySelector('#search').dispatchEvent(new Event('input'))");
    assert.equal(await evaluate("document.querySelectorAll('#tree-rows tr').length"), 1);
    await evaluate("document.querySelector('#search').value=''; document.querySelector('#search').dispatchEvent(new Event('input'))");
    await evaluate("window.__summaryDownload=null; HTMLAnchorElement.prototype.click=function(){}; const create=URL.createObjectURL.bind(URL); URL.createObjectURL=blob=>{blob.text().then(text=>window.__summaryDownload=JSON.parse(text)); return create(blob)}; document.querySelector('#export-summary').click(); new Promise(resolve=>setTimeout(resolve,100))");
    assert.equal(await evaluate("window.__summaryDownload.source"), 'local scan');
    assert.equal(await evaluate("window.__summaryDownload.root"), fixture);
    assert.ok(await evaluate("window.__summaryDownload.localDisks.length >= 1"));
    const rootTrash = await evaluate(`window.entree.trash([${JSON.stringify(state.root)}]).then(()=> 'unexpected success').catch(error => error.message)`);
    assert.match(rootTrash, /scan root/);
    await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    await new Promise(resolve=>setTimeout(resolve, 150));
    fs.writeFileSync(path.join(output, 'native-scan.png'), (await window.webContents.capturePage()).toPNG());
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
  const verification = { passed: true, platform: process.platform, noFabricatedStartup: true, liveDriveCapacity: true, nativeScan: true, allocatedBytes: true, settingsPersistence: true, search: true, largestFiles: true, summaryExport: true, rootProtection: true };
  fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify(verification, null, 2));
  console.log('Native verification passed: live capacity, real files, settings, search, export and root protection.');
};
