const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { scan, validateTrash, inside } = require('../src/scanner.cjs');
function fixture(t) { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'entree-test-')); t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root; }
test('real file sizes, nested aggregation, empty folders and dot-file exclusion', t => {
  const root = fixture(t); fs.mkdirSync(path.join(root, 'src')); fs.mkdirSync(path.join(root, 'empty'));
  fs.writeFileSync(path.join(root, 'src', 'app.js'), '12345'); fs.writeFileSync(path.join(root, '.hidden'), '123'); fs.writeFileSync(path.join(root, 'zero'), '');
  const result = scan(root, { hidden: true });
  assert.equal(result.tree.size, 8); assert.equal(result.tree.files, 3); assert.equal(result.stats.folders, 3);
  assert.equal(result.tree.children.find(n => n.name === 'src').category, 'code');
  assert.equal(scan(root, { hidden: false }).tree.size, 5);
});
test('hard-linked files count once', t => {
  const root = fixture(t); const file = path.join(root, 'a'); fs.writeFileSync(file, '123456'); fs.linkSync(file, path.join(root, 'b'));
  assert.equal(scan(root).tree.size, 6); assert.equal(scan(root).tree.files, 1);
});
test('directory links are skipped and linked parents cannot be recycled', t => {
  const root = fixture(t); fs.mkdirSync(path.join(root, 'folder')); fs.mkdirSync(path.join(root, 'actual'));
  fs.writeFileSync(path.join(root, 'actual', 'file'), '123');
  fs.symlinkSync(path.join(root, 'actual'), path.join(root, 'folder', 'link'), process.platform === 'win32' ? 'junction' : 'dir');
  const result = scan(root); assert.equal(result.stats.links, 1); assert.equal(result.tree.size, 3);
  assert.throws(() => validateTrash(result.tree.path, path.join(root, 'folder'), new Map(result.manifest)), /links/);
});
test('entry limits are explicit partial results and unsafe to recycle', t => {
  const root = fixture(t); for (let i = 0; i < 10; i++) fs.writeFileSync(path.join(root, `${i}`), 'x');
  const result = scan(root, { maxEntries: 3 }); assert.equal(result.stats.truncated, true); assert.equal(result.tree.incomplete, true);
});
test('trash validates scanned identity, changed files, root and outside paths', t => {
  const root = fixture(t); const file = path.join(root, 'test.txt'); fs.writeFileSync(file, '123');
  const result = scan(root); const manifest = new Map(result.manifest);
  assert.equal(validateTrash(result.tree.path, file, manifest), file);
  assert.throws(() => validateTrash(root, root, manifest), /scan root/);
  assert.throws(() => validateTrash(root, path.dirname(root), manifest), /outside/);
  fs.writeFileSync(file, '123456'); assert.throws(() => validateTrash(root, file, manifest), /changed/);
});
test('a scanned path replaced by a junction is rejected', t => {
  const root = fixture(t); const folder = path.join(root, 'folder'); const outside = path.join(root, 'elsewhere');
  fs.mkdirSync(folder); fs.mkdirSync(outside); const result = scan(root);
  fs.rmdirSync(folder); fs.symlinkSync(outside, folder, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => validateTrash(root, folder, new Map(result.manifest)), /Linked/);
});
test('home directory protection and strict containment', t => {
  const root = fixture(t); const home = path.join(root, 'home'); fs.mkdirSync(home); const result = scan(root);
  assert.throws(() => validateTrash(root, home, new Map(result.manifest), home), /home directory/);
  assert.equal(inside(root, `${root}-sibling`), false); assert.equal(inside(root, path.join(root, 'child')), true);
});
test('Windows system paths are protected regardless of casing', { skip: process.platform !== 'win32' }, () => {
  const drive = path.parse(process.env.WINDIR).root;
  assert.throws(() => validateTrash(drive, process.env.WINDIR.toUpperCase(), new Map()), /system location/);
});
test('excluded hidden contents prevent recycling their containing folder', t => {
  const root = fixture(t); const folder = path.join(root, 'folder'); fs.mkdirSync(folder); fs.writeFileSync(path.join(folder, '.secret'), '123');
  const result = scan(root, { hidden: false });
  assert.throws(() => validateTrash(root, folder, new Map(result.manifest)), /excluded entries/);
});
test('a changed descendant is rejected even if its parent directory is unchanged', t => {
  const root = fixture(t); const folder = path.join(root, 'folder'); fs.mkdirSync(folder); const file = path.join(folder, 'file'); fs.writeFileSync(file, '123');
  const result = scan(root); fs.writeFileSync(file, '123456789');
  assert.throws(() => validateTrash(root, folder, new Map(result.manifest)), /contents changed/);
});
test('allocated storage and descendant folder counts aggregate correctly', t => {
  const root = fixture(t); fs.mkdirSync(path.join(root, 'folder')); fs.writeFileSync(path.join(root, 'folder', 'file'), Buffer.alloc(8192));
  const result = scan(root); assert.equal(result.tree.folders, 1); assert.equal(typeof result.tree.allocated, 'number'); assert.ok(result.tree.allocated >= 0);
});
