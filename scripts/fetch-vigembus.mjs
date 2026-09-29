// Downloads the official ViGEmBus driver installer so electron-builder can bundle it
// (see "extraResources" in package.json and build/installer.nsh). The checksum is
// pinned: a tampered or changed download fails the build instead of shipping.
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '1.22.0';
const INSTALLER_URL = `https://github.com/nefarius/ViGEmBus/releases/download/v${VERSION}/ViGEmBus_${VERSION}_x64_x86_arm64.exe`;
const INSTALLER_SHA256 = '89220a7865076b342892f98865f3499fb7c4cfd673159e89d352c360fd014c6a';
const LICENSE_URL = `https://raw.githubusercontent.com/nefarius/ViGEmBus/v${VERSION}/LICENSE`;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'build', 'vigembus');
const installer = path.join(dir, 'ViGEmBus_Setup.exe');
const license = path.join(dir, 'ViGEmBus-LICENSE.txt');

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

await fs.mkdir(dir, { recursive: true });

const existing = await fs.readFile(installer).catch(() => null);
if (existing && sha256(existing) === INSTALLER_SHA256) {
  console.log(`ViGEmBus ${VERSION} installer already present`);
} else {
  const bytes = await download(INSTALLER_URL);
  const actual = sha256(bytes);
  if (actual !== INSTALLER_SHA256) {
    throw new Error(`ViGEmBus installer checksum mismatch: expected ${INSTALLER_SHA256}, got ${actual}`);
  }
  await fs.writeFile(installer, bytes);
  console.log(`Downloaded ViGEmBus ${VERSION} installer (${(bytes.length / 1048576).toFixed(1)} MB), checksum verified`);
}

// BSD-3-Clause requires the licence to travel with redistributed copies.
if (!(await fs.stat(license).catch(() => null))) {
  await fs.writeFile(license, await download(LICENSE_URL));
  console.log('Saved ViGEmBus licence');
}
