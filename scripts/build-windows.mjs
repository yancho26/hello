#!/usr/bin/env node
/* Сглобява инсталатора за Windows:
 *
 *   dist/DetskaKonsultacia-Setup-<версия>.exe
 *
 * Стъпки:
 *   1. esbuild събира desktop/main.js и сървъра в един CommonJS файл;
 *   2. Node.js го превръща в „SEA blob“ заедно с всички файлове от public/;
 *   3. взима се официалният node.exe (Node.js 24 LTS за Windows x64),
 *      сменят се иконата и данните за версията, премахва се подписът на
 *      Node.js (вече не съответства), вгражда се blob-ът (postject) и
 *      програмата се отбелязва като графична — без черен прозорец;
 *   4. NSIS (makensis) прави инсталатора от installer/installer.nsi.
 *
 * Работи под Linux, macOS и Windows. Нужни са: npm install (esbuild, postject,
 * resedit) и NSIS — `apt install nsis`, `brew install makensis` или
 * `choco install nsis`.
 *
 * Аргументи:
 *   --exe-only     без инсталатор, само build/win/DetskaKonsultacia.exe
 *   --console      с конзолен прозорец (за отстраняване на проблеми)
 *   --linux-test   допълнително build/linux/detska-konsultacia от същия
 *                  blob — за проверка под Linux (само на Linux x64)
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const NODE_VERSION = '24.21.0';
const SEA_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
const EXE_NAME = 'DetskaKonsultacia.exe';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BUILD = path.join(ROOT, 'build');
const CACHE = path.join(BUILD, 'cache');
const DIST = path.join(ROOT, 'dist');
const args = new Set(process.argv.slice(2));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VERSION = pkg.version;

const step = (text) => console.log(`\n▸ ${text}`);
const rel = (p) => path.relative(ROOT, p);
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/* ------------------------------ сваляне ---------------------------------- */

async function download(url, target) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()));
  } catch (err) {
    // fetch не ползва прокси от обкръжението; curl го ползва.
    console.log(`  fetch: ${err.message}; опит с curl…`);
    execFileSync('curl', ['-sSfL', '-o', target, url], { stdio: 'inherit' });
  }
}

async function nodeDist(file) {
  fs.mkdirSync(CACHE, { recursive: true });
  const base = `https://nodejs.org/dist/v${NODE_VERSION}/`;
  const sums = path.join(CACHE, `SHASUMS256-${NODE_VERSION}.txt`);
  if (!fs.existsSync(sums)) await download(base + 'SHASUMS256.txt', sums);
  const expected = fs.readFileSync(sums, 'utf8').split('\n')
    .map(l => l.trim().split(/\s+/)).find(([, name]) => name === file)?.[0];
  if (!expected) throw new Error(`${file} липсва в SHASUMS256.txt`);

  const target = path.join(CACHE, file);
  if (!fs.existsSync(target) || sha256(fs.readFileSync(target)) !== expected) {
    console.log(`  сваляне на ${file}…`);
    await download(base + file, target);
  }
  const actual = sha256(fs.readFileSync(target));
  if (actual !== expected) throw new Error(`Контролната сума на ${file} не съвпада — файлът е повреден.`);
  return target;
}

/* ------------------------------ ZIP (само четене) ------------------------ */

function readZipEntry(zip, wanted) {
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Невалиден ZIP файл.');
  let count = zip.readUInt16LE(eocd + 10);
  let offset = zip.readUInt32LE(eocd + 16);
  if (offset === 0xffffffff || count === 0xffff) {
    const loc = eocd - 20;
    if (zip.readUInt32LE(loc) !== 0x07064b50) throw new Error('Липсва ZIP64 указател.');
    const z64 = Number(zip.readBigUInt64LE(loc + 8));
    count = Number(zip.readBigUInt64LE(z64 + 32));
    offset = Number(zip.readBigUInt64LE(z64 + 48));
  }
  for (let i = 0, p = offset; i < count; i++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error('Повредена централна директория на ZIP.');
    const method = zip.readUInt16LE(p + 10);
    let compSize = zip.readUInt32LE(p + 20);
    let size = zip.readUInt32LE(p + 24);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    let local = zip.readUInt32LE(p + 42);
    const name = zip.toString('utf8', p + 46, p + 46 + nameLen);
    if (name === wanted) {
      // ZIP64: истинските размери са в допълнителното поле 0x0001.
      let e = p + 46 + nameLen;
      const end = e + extraLen;
      while (e + 4 <= end) {
        const id = zip.readUInt16LE(e);
        const len = zip.readUInt16LE(e + 2);
        if (id === 1) {
          let q = e + 4;
          if (size === 0xffffffff) { size = Number(zip.readBigUInt64LE(q)); q += 8; }
          if (compSize === 0xffffffff) { compSize = Number(zip.readBigUInt64LE(q)); q += 8; }
          if (local === 0xffffffff) { local = Number(zip.readBigUInt64LE(q)); }
        }
        e += 4 + len;
      }
      const dataStart = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const raw = zip.subarray(dataStart, dataStart + compSize);
      const out = method === 0 ? Buffer.from(raw) : zlib.inflateRawSync(raw);
      if (out.length !== size) throw new Error(`Размерът на ${name} не съвпада.`);
      return out;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`${wanted} липсва в архива.`);
}

/* ------------------------------ PE помощни ------------------------------- */

function peOffsets(buf) {
  const pe = buf.readUInt32LE(0x3c);
  if (buf.readUInt32LE(pe) !== 0x00004550) throw new Error('Не е PE файл.');
  const opt = pe + 24;
  const magic = buf.readUInt16LE(opt);
  const dataDirs = opt + (magic === 0x20b ? 112 : 96);
  return { opt, subsystem: opt + 68, securityDir: dataDirs + 4 * 8 };
}

/** Премахва подписа на Node.js (равносилно на `signtool remove /s`).
 *  След вграждането той така или иначе би бил невалиден. */
function stripSignature(buf) {
  const { securityDir } = peOffsets(buf);
  const offset = buf.readUInt32LE(securityDir);
  const size = buf.readUInt32LE(securityDir + 4);
  if (!size) return buf;
  if (offset + size < buf.length - 8) throw new Error('Подписът не е в края на файла — неочаквана структура.');
  const out = Buffer.from(buf.subarray(0, offset));
  out.writeUInt32LE(0, securityDir);
  out.writeUInt32LE(0, securityDir + 4);
  return out;
}

/* --------------------------------- стъпки --------------------------------- */

async function hostNode() {
  if (process.version === `v${NODE_VERSION}`) return process.execPath;
  const plat = process.platform;
  const arch = process.arch;
  const dir = path.join(CACHE, `node-v${NODE_VERSION}-${plat}-${arch}`);
  if (plat === 'win32') {
    const exe = path.join(dir, 'node.exe');
    if (!fs.existsSync(exe)) {
      const zip = fs.readFileSync(await nodeDist(`node-v${NODE_VERSION}-win-${arch}.zip`));
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(exe, readZipEntry(zip, `node-v${NODE_VERSION}-win-${arch}/node.exe`));
    }
    return exe;
  }
  const bin = path.join(dir, 'bin', 'node');
  if (!fs.existsSync(bin)) {
    const ext = plat === 'darwin' ? 'tar.gz' : 'tar.xz';
    const tarball = await nodeDist(`node-v${NODE_VERSION}-${plat}-${arch}.${ext}`);
    execFileSync('tar', ['-xf', tarball, '-C', CACHE, `node-v${NODE_VERSION}-${plat}-${arch}/bin/node`]);
  }
  return bin;
}

async function bundle(outDir) {
  step('Събиране на сървъра (esbuild)');
  const esbuild = await import('esbuild');
  const outfile = path.join(outDir, 'main.cjs');
  await esbuild.build({
    entryPoints: [path.join(ROOT, 'desktop', 'main.js')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node24',
    outfile,
    define: { __APP_VERSION__: JSON.stringify(VERSION) },
    legalComments: 'none',
    logLevel: 'warning',
  });
  console.log(`  ${rel(outfile)} (${(fs.statSync(outfile).size / 1024).toFixed(0)} KB)`);
  return outfile;
}

function listFiles(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? listFiles(full, base) : [path.relative(base, full).split(path.sep).join('/')];
  });
}

async function makeBlob(outDir, mainFile) {
  step('Вграждане на интерфейса (SEA blob)');
  const publicDir = path.join(ROOT, 'public');
  const assets = {};
  for (const f of listFiles(publicDir)) assets[`public/${f}`] = path.join(publicDir, f);
  const blob = path.join(outDir, 'sea-prep.blob');
  const config = path.join(outDir, 'sea-config.json');
  fs.writeFileSync(config, JSON.stringify({
    main: mainFile,
    output: blob,
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: false, // blob-ът се прави на една система, а работи на друга
    assets,
  }, null, 2));
  execFileSync(await hostNode(), ['--experimental-sea-config', config], { stdio: 'inherit' });
  console.log(`  ${Object.keys(assets).length} файла, ${rel(blob)} (${(fs.statSync(blob).size / 1024).toFixed(0)} KB)`);
  return fs.readFileSync(blob);
}

async function brandExe(nodeExe) {
  step('Икона и данни за версията');
  const ResEdit = await import('resedit');
  // ignoreCert: подписът на Node.js се премахва — след промяната той е невалиден.
  const exe = ResEdit.NtExecutable.from(nodeExe, { ignoreCert: true });
  const res = ResEdit.NtExecutableResource.from(exe);

  const icon = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(ROOT, 'desktop', 'icon.ico')));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  const group = groups[0] || { id: 1, lang: 1033 };
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    res.entries, group.id, group.lang, icon.icons.map(i => i.data));

  const [major, minor, patch] = VERSION.split('.').map(Number);
  const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0] || ResEdit.Resource.VersionInfo.createEmpty();
  const lang = vi.getAllLanguagesForStringValues()[0] || { lang: 1033, codepage: 1200 };
  for (const key of ['Comments', 'PrivateBuild', 'SpecialBuild', 'LegalTrademarks']) vi.removeStringValue(lang, key);
  vi.setStringValues(lang, {
    CompanyName: 'Детска консултация',
    FileDescription: 'Детска консултация — проследяване на деца пациенти',
    ProductName: 'Детска консултация',
    InternalName: 'DetskaKonsultacia',
    OriginalFilename: EXE_NAME,
    FileVersion: VERSION,
    ProductVersion: VERSION,
    LegalCopyright: `Включва Node.js ${NODE_VERSION} (лиценз MIT)`,
  });
  vi.setFileVersion(major, minor, patch, 0, lang.lang);
  vi.setProductVersion(major, minor, patch, 0, lang.lang);
  vi.outputToResourceEntries(res.entries);
  res.outputResource(exe);
  const out = Buffer.from(exe.generate());

  const { securityDir } = peOffsets(out);
  if (out.readUInt32LE(securityDir + 4) !== 0) throw new Error('Подписът на node.exe не беше премахнат.');
  return out;
}

async function inject(file, blob) {
  const { inject: postject } = await import('postject');
  await postject(file, 'NODE_SEA_BLOB', blob, {
    sentinelFuse: SEA_FUSE,
    ...(process.platform === 'darwin' && !file.endsWith('.exe') ? { machoSegmentName: 'NODE_SEA' } : {}),
  });
}

function setGuiSubsystem(file) {
  const buf = fs.readFileSync(file);
  const { subsystem } = peOffsets(buf);
  buf.writeUInt16LE(2, subsystem); // IMAGE_SUBSYSTEM_WINDOWS_GUI — без конзолен прозорец
  fs.writeFileSync(file, buf);
}

/** Проверки на готовия файл: вграденото приложение е включено и цяло. */
function verifyExe(buf, blob) {
  const fuse = Buffer.from(`${SEA_FUSE}:1`);
  if (buf.indexOf(fuse) < 0) throw new Error('Предпазителят на SEA не е включен.');
  if (buf.indexOf(blob.subarray(0, 4096)) < 0 || buf.indexOf(blob.subarray(blob.length - 4096)) < 0) {
    throw new Error('Вграденото приложение липсва в изпълнимия файл.');
  }
  const { securityDir } = peOffsets(buf);
  if (buf.readUInt32LE(securityDir + 4) !== 0) throw new Error('Остатък от подписа на Node.js.');
}

function findMakensis() {
  const candidates = ['makensis',
    'C:\\Program Files (x86)\\NSIS\\makensis.exe', 'C:\\Program Files\\NSIS\\makensis.exe'];
  for (const c of candidates) {
    try {
      execFileSync(c, ['-VERSION'], { stdio: 'ignore' });
      return c;
    } catch { /* следващият */ }
  }
  throw new Error('NSIS (makensis) не е намерен. Инсталирайте го: apt install nsis / brew install makensis / choco install nsis.');
}

/* --------------------------------- main ---------------------------------- */

const seaDir = path.join(BUILD, 'sea');
const winDir = path.join(BUILD, 'win');
fs.rmSync(seaDir, { recursive: true, force: true });
fs.rmSync(winDir, { recursive: true, force: true });
fs.mkdirSync(seaDir, { recursive: true });
fs.mkdirSync(winDir, { recursive: true });

console.log(`Детска консултация ${VERSION} за Windows x64 · Node.js ${NODE_VERSION}`);

const mainFile = await bundle(seaDir);
const blob = await makeBlob(seaDir, mainFile);

step('Node.js за Windows');
const winZip = fs.readFileSync(await nodeDist(`node-v${NODE_VERSION}-win-x64.zip`));
const nodeExe = readZipEntry(winZip, `node-v${NODE_VERSION}-win-x64/node.exe`);
fs.writeFileSync(path.join(winDir, 'Node.js-LICENSE.txt'),
  readZipEntry(winZip, `node-v${NODE_VERSION}-win-x64/LICENSE`));
console.log(`  node.exe ${(nodeExe.length / 1048576).toFixed(1)} MB`);

// Редът е важен: postject първо (така, както е описано в документацията на
// Node.js), после иконата. Обратният ред кара postject да пренарежда
// секциите на вече променения файл.
const exePath = path.join(winDir, EXE_NAME);
fs.writeFileSync(exePath, stripSignature(nodeExe));
step('Вграждане в изпълнимия файл (postject)');
await inject(exePath, blob);
fs.writeFileSync(exePath, await brandExe(fs.readFileSync(exePath)));
if (!args.has('--console')) setGuiSubsystem(exePath);
verifyExe(fs.readFileSync(exePath), blob);
console.log(`  ${rel(exePath)} (${(fs.statSync(exePath).size / 1048576).toFixed(1)} MB)`);

if (args.has('--linux-test')) {
  if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('--linux-test работи само на Linux x64.');
  step('Проверочен изпълним файл за Linux');
  const linuxDir = path.join(BUILD, 'linux');
  fs.mkdirSync(linuxDir, { recursive: true });
  const target = path.join(linuxDir, 'detska-konsultacia');
  fs.copyFileSync(await hostNode(), target);
  fs.chmodSync(target, 0o755);
  await inject(target, blob);
  console.log(`  ${rel(target)}`);
}

if (!args.has('--exe-only')) {
  step('Инсталатор (NSIS)');
  fs.mkdirSync(DIST, { recursive: true });
  const outFile = path.join(DIST, `DetskaKonsultacia-Setup-${VERSION}.exe`);
  execFileSync(findMakensis(), [
    '-V2', '-INPUTCHARSET', 'UTF8',
    `-DVERSION=${VERSION}`,
    `-DSOURCE_DIR=${winDir}`,
    `-DICON=${path.join(ROOT, 'desktop', 'icon.ico')}`,
    `-DWELCOME=${path.join(ROOT, 'installer', 'welcome.bmp')}`,
    `-DREADME=${path.join(ROOT, 'installer', 'readme.txt')}`,
    `-DOUTFILE=${outFile}`,
    path.join(ROOT, 'installer', 'installer.nsi'),
  ], { stdio: 'inherit' });
  const data = fs.readFileSync(outFile);
  const sum = sha256(data);
  fs.writeFileSync(path.join(DIST, 'SHA256SUMS.txt'), `${sum}  ${path.basename(outFile)}\n`);
  console.log(`\n✓ ${rel(outFile)} (${(data.length / 1048576).toFixed(1)} MB)\n  SHA-256 ${sum}`);
} else {
  console.log(`\n✓ ${rel(exePath)}`);
}
