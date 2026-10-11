// Downloads the official HidHide installer so electron-builder can bundle it (see
// "extraResources" in package.json). The app runs it only when "Hide joysticks from games"
// is first switched on. The checksum is pinned: a tampered or changed download fails the
// build instead of shipping.
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '1.5.230';
const INSTALLER_URL = `https://github.com/nefarius/HidHide/releases/download/v${VERSION}.0/HidHide_${VERSION}_x64.exe`;
const INSTALLER_SHA256 = 'f4bbbcb82e6258641b887c74bc81c4c5f66e4aa811808dfc304347687b7605f6';
const LICENSE_URL = `https://raw.githubusercontent.com/nefarius/HidHide/v${VERSION}.0/LICENSE`;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'build', 'hidhide');
const installer = path.join(dir, 'HidHide_Setup.exe');
const license = path.join(dir, 'HidHide-LICENSE.txt');

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

await fs.mkdir(dir, { recursive: true });

const existing = await fs.readFile(installer).catch(() => null);
if (existing && sha256(existing) === INSTALLER_SHA256) {
  console.log(`HidHide ${VERSION} installer already present`);
} else {
  const bytes = await download(INSTALLER_URL);
  const actual = sha256(bytes);
  if (actual !== INSTALLER_SHA256) {
    throw new Error(`HidHide installer checksum mismatch: expected ${INSTALLER_SHA256}, got ${actual}`);
  }
  await fs.writeFile(installer, bytes);
  console.log(`Downloaded HidHide ${VERSION} installer (${(bytes.length / 1048576).toFixed(1)} MB), checksum verified`);
}

// The MIT licence asks that it travels with redistributed copies.
if (!(await fs.stat(license).catch(() => null))) {
  await fs.writeFile(license, await download(LICENSE_URL));
  console.log('Saved HidHide licence');
}
