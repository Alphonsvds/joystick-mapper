import fs from 'node:fs';
import path from 'node:path';

// Returns parsed JSON, or null if the file is missing. A corrupt file is moved aside
// (not deleted) so a bad write never silently loses someone's mapping.
export function readJson(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    try {
      fs.renameSync(file, `${file}.corrupt-${Date.now()}`);
    } catch {
      // Leave it in place; we'll overwrite it on the next save.
    }
    return null;
  }
}

// Write to a temp file then rename, so a crash mid-write can't truncate the real file.
export function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}
