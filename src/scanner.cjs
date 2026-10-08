const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { parentPort, workerData } = require('node:worker_threads');
let allocatedWindows = () => null;
if (process.platform === 'win32') {
  try {
    const koffi = require('koffi');
    const kernel = koffi.load('kernel32.dll');
    const getSize = kernel.func('uint32_t __stdcall GetCompressedFileSizeW(str16 filename, _Out_ uint32_t *high)');
    const getError = kernel.func('uint32_t __stdcall GetLastError()');
    const clearError = kernel.func('void __stdcall SetLastError(uint32_t error)');
    allocatedWindows = filename => { const high = [0]; clearError(0); const low = getSize(filename, high); return low === 0xffffffff && getError() !== 0 ? null : high[0] * 4294967296 + low; };
  } catch { /* Allocated column stays unavailable if the native bridge is missing. */ }
}

function category(name, inherited = 'other') {
  if (/^(node_modules|\.cache|cache|caches|target|dist|build|tmp|temp)$/i.test(name)) return 'cache';
  if (/^(\.git|\.svn)$/i.test(name)) return 'git';
  if (/\.(mp4|mkv|mov|mp3|wav|flac|jpg|png|webp|heic|svg)$/i.test(name) || /^(pictures|music|videos|media)$/i.test(name)) return 'media';
  if (/\.(pdf|docx?|xlsx?|pptx?|txt|md|csv)$/i.test(name) || /^(documents|notes)$/i.test(name)) return 'documents';
  if (/\.(zip|gz|7z|tar|rar|exe|msi|dmg)$/i.test(name) || /^downloads$/i.test(name)) return 'downloads';
  if (/\.(js|ts|tsx|jsx|py|rs|go|html|css|json|c|cpp)$/i.test(name) || /^(src|projects|code|repos)$/i.test(name)) return 'code';
  return inherited;
}

function scan(root, options = {}, progress = () => {}) {
  root = fs.realpathSync(root);
  if (!fs.statSync(root).isDirectory()) throw new Error('Choose a directory to scan.');
  const maxEntries = options.maxEntries || 250000;
  const manifest = new Map();
  const seen = new Set();
  let files = 0, folders = 0, unreadable = 0, links = 0, entries = 0, truncated = false;
  function make(p, name, parentCategory) {
    const s = fs.lstatSync(p);
    const node = { path: p, name, directory: s.isDirectory(), size: 0, allocated: s.isDirectory() ? 0 : s.isFile() ? (process.platform === 'win32' ? allocatedWindows(p) : Number.isFinite(s.blocks) ? s.blocks * 512 : null) : null, folders: 0, files: 0, modified: s.mtimeMs, category: category(name, parentCategory), children: [] };
    manifest.set(p, { dev: s.dev, ino: s.ino, mtimeMs: s.mtimeMs, size: s.size, directory: s.isDirectory() });
    return { node, stat: s };
  }
  const first = make(root, path.basename(root) || root, 'other');
  const stack = [{ ...first, depth: 0 }];
  const order = [];
  while (stack.length) {
    const current = stack.pop();
    const { node, stat, depth } = current;
    entries++;
    order.push(node);
    if (!node.directory) {
      const key = `${stat.dev}:${stat.ino}`;
      if (!stat.ino || !seen.has(key)) { node.size = stat.size; node.files = 1; seen.add(key); files++; }
      else node.allocated = 0;
      continue;
    }
    folders++;
    if (depth >= 256 || entries + stack.length >= maxEntries) { node.incomplete = true; truncated = true; continue; }
    try {
      const children = fs.readdirSync(node.path, { withFileTypes: true });
      for (const entry of children) {
        if (!options.hidden && entry.name.startsWith('.')) { node.hasExcluded = true; continue; }
        if (entries + stack.length >= maxEntries) { node.incomplete = true; truncated = true; break; }
        const p = path.join(node.path, entry.name);
        try {
          const child = make(p, entry.name, node.category);
          if (child.stat.isSymbolicLink()) { manifest.delete(p); links++; node.hasLinks = true; continue; }
          if (!child.stat.isFile() && !child.stat.isDirectory()) { manifest.delete(p); continue; }
          // Do not cross filesystems. Windows junctions are symbolic links in lstat.
          if (child.stat.dev !== first.stat.dev) { manifest.delete(p); links++; node.hasLinks = true; continue; }
          node.children.push(child.node);
          stack.push({ ...child, depth: depth + 1 });
        } catch { unreadable++; node.incomplete = true; }
      }
    } catch { unreadable++; node.incomplete = true; }
    if (entries % 200 === 0) progress({ entries, files, folders });
  }
  for (let i = order.length - 1; i >= 0; i--) {
    const n = order[i];
    if (n.directory) {
      for (const c of n.children) { n.size += c.size; n.files += c.files; n.folders += c.folders + (c.directory ? 1 : 0); n.allocated = n.allocated === null || c.allocated === null ? null : n.allocated + c.allocated; if (c.incomplete) n.incomplete = true; if (c.hasLinks) n.hasLinks = true; if (c.hasExcluded) n.hasExcluded = true; }
      n.children.sort((a, b) => b.size - a.size || a.name.localeCompare(b.name));
    }
  }
  for (const n of order) { const record = manifest.get(n.path); record.incomplete = !!n.incomplete; record.hasLinks = !!n.hasLinks; record.hasExcluded = !!n.hasExcluded; }
  let volume = null;
  try { const v = fs.statfsSync(root); volume = { total: v.blocks * v.bsize, free: v.bavail * v.bsize }; } catch {}
  return { tree: first.node, manifest: [...manifest], stats: { files, folders, unreadable, links, truncated, entries }, volume };
}

function inside(root, target) {
  const relative = path.relative(root, target);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function validateTrash(root, target, manifest, home = os.homedir()) {
  if (typeof target !== 'string' || !path.isAbsolute(target)) throw new Error('Invalid path.');
  target = path.resolve(target);
  if (!inside(root, target)) throw new Error('The scan root and paths outside it cannot be recycled.');
  const protectedPaths = process.platform === 'win32'
    ? [process.env.WINDIR || 'C:\\Windows', process.env.ProgramFiles || 'C:\\Program Files', process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', process.env.ProgramData || 'C:\\ProgramData', path.dirname(home)]
    : ['/bin', '/sbin', '/usr', '/etc', '/boot', '/var/lib', '/System', '/Library', '/Applications'];
  const same = (a, b) => path.relative(a, b) === '';
  if (same(target, home) || inside(target, home)) throw new Error('Your home directory is protected.');
  for (const protectedPath of protectedPaths) {
    // The Users container is protected, but content inside the current home is allowed.
    const usersContainer = process.platform === 'win32' && protectedPath === path.dirname(home);
    if (same(target, protectedPath) || inside(target, protectedPath) || (!usersContainer && inside(protectedPath, target))) throw new Error('This system location is protected.');
    if (usersContainer && inside(protectedPath, target) && !inside(home, target)) throw new Error('Other user profiles are protected.');
  }
  if (process.platform === 'win32' && /^(\$Recycle\.Bin|System Volume Information|Recovery|Boot|pagefile\.sys|hiberfil\.sys|swapfile\.sys)$/i.test(path.relative(path.parse(target).root, target).split(path.sep)[0])) throw new Error('This system location is protected.');
  const recorded = manifest.get(target);
  if (!recorded) throw new Error('This item is not part of the current scan.');
  if (recorded.incomplete || recorded.hasLinks || recorded.hasExcluded) throw new Error('Folders with incomplete scans, excluded entries, links or mounted filesystems cannot be recycled.');
  // Re-check every component to reject a folder replaced with a junction after scanning.
  let component = target;
  while (true) {
    if (fs.lstatSync(component).isSymbolicLink()) throw new Error('Linked paths cannot be recycled.');
    const parent = path.dirname(component);
    if (parent === component) break;
    component = parent;
  }
  const s = fs.lstatSync(target);
  if (s.dev !== recorded.dev || s.ino !== recorded.ino || s.mtimeMs !== recorded.mtimeMs || s.size !== recorded.size) throw new Error('This item changed since scanning. Scan again first.');
  if (recorded.directory) {
    for (const [childPath, childRecord] of manifest) {
      if (!inside(target, childPath)) continue;
      const child = fs.lstatSync(childPath);
      if (child.isSymbolicLink() || child.dev !== childRecord.dev || child.ino !== childRecord.ino || child.mtimeMs !== childRecord.mtimeMs || child.size !== childRecord.size) throw new Error('Folder contents changed since scanning. Scan again first.');
    }
  }
  return target;
}

module.exports = { scan, inside, validateTrash, category };
if (parentPort) {
  try { parentPort.postMessage({ type: 'complete', result: scan(workerData.root, workerData.options, p => parentPort.postMessage({ type: 'progress', ...p })) }); }
  catch (error) { parentPort.postMessage({ type: 'error', message: error.message }); }
}
