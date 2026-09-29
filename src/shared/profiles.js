// The profile library: a locked built-in "Default" plus named game profiles.
// All functions are pure (they return a new library) so the main process and the
// browser preview share exactly the same rules.
import { emptyBindings, normalizeBindings } from './controls.js';
import { PRESET_BY_ID } from './presets.js';

// Default leaves the joystick alone: nothing mapped, no virtual controller.
export const DEFAULT_PROFILE_ID = 'default';
export const DEFAULT_PROFILE_NAME = 'Default';
export const MAX_NAME_LENGTH = 40;
const LIBRARY_VERSION = 2;
const EXPORT_FORMAT = 'joystick-mapper/profile';

export function emptyLibrary() {
  return { version: LIBRARY_VERSION, active: DEFAULT_PROFILE_ID, profiles: [] };
}

export function cleanName(name) {
  return String(name ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH);
}

// "Ace Combat 8" -> "Ace Combat 8 (2)" if taken. "Default" is always taken.
function uniqueName(library, name, exceptId = null) {
  const taken = new Set([DEFAULT_PROFILE_NAME.toLowerCase()]);
  for (const p of library.profiles) if (p.id !== exceptId) taken.add(p.name.toLowerCase());
  if (!taken.has(name.toLowerCase())) return name;
  for (let n = 2; ; n++) {
    const candidate = `${name.slice(0, MAX_NAME_LENGTH - 5)} (${n})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

function newId(library) {
  let id;
  do id = `p-${globalThis.crypto.randomUUID().slice(0, 8)}`;
  while (library.profiles.some((p) => p.id === id));
  return id;
}

// Accepts anything read from disk and returns a valid library.
export function normalizeLibrary(raw) {
  const library = emptyLibrary();
  const seen = new Set([DEFAULT_PROFILE_ID]);
  for (const p of Array.isArray(raw?.profiles) ? raw.profiles : []) {
    const id = typeof p?.id === 'string' && /^[\w-]{1,40}$/.test(p.id) ? p.id : null;
    const name = cleanName(p?.name);
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    library.profiles.push({ id, name: uniqueName(library, name), bindings: normalizeBindings(p.bindings) });
  }
  if (library.profiles.some((p) => p.id === raw?.active)) library.active = raw.active;
  return library;
}

export const isLocked = (id) => id === DEFAULT_PROFILE_ID;

export function getProfile(library, id) {
  if (isLocked(id)) return { id, name: DEFAULT_PROFILE_NAME, locked: true, bindings: emptyBindings() };
  const p = library.profiles.find((x) => x.id === id);
  return p ? { ...p, locked: false } : null;
}

export function listProfiles(library) {
  return [
    { id: DEFAULT_PROFILE_ID, name: DEFAULT_PROFILE_NAME, locked: true },
    ...library.profiles.map((p) => ({ id: p.id, name: p.name, locked: false })),
  ];
}

export function presetBindings(presetId) {
  return normalizeBindings(PRESET_BY_ID[presetId]?.bindings);
}

export function addProfile(library, name, bindings) {
  const clean = cleanName(name) || 'New profile';
  const id = newId(library);
  const profile = { id, name: uniqueName(library, clean), bindings: normalizeBindings(bindings) };
  return { library: { ...library, profiles: [...library.profiles, profile] }, id };
}

export function renameProfile(library, id, name) {
  const clean = cleanName(name);
  if (!clean || isLocked(id)) return library;
  return {
    ...library,
    profiles: library.profiles.map((p) => (p.id === id ? { ...p, name: uniqueName(library, clean, id) } : p)),
  };
}

export function removeProfile(library, id) {
  if (isLocked(id)) return library;
  return {
    ...library,
    active: library.active === id ? DEFAULT_PROFILE_ID : library.active,
    profiles: library.profiles.filter((p) => p.id !== id),
  };
}

export function setActive(library, id) {
  return getProfile(library, id) ? { ...library, active: id } : library;
}

export function setBindings(library, id, bindings) {
  if (isLocked(id)) return library;
  return {
    ...library,
    profiles: library.profiles.map((p) => (p.id === id ? { ...p, bindings: normalizeBindings(bindings) } : p)),
  };
}

// The shareable file format for one profile.
export function toExport(profile) {
  return {
    format: EXPORT_FORMAT,
    version: 1,
    name: profile.name,
    device: 'Logitech Extreme 3D Pro',
    bindings: profile.bindings,
  };
}

// Returns { name, bindings } or null if `raw` isn't an exported profile.
export function fromExport(raw) {
  if (!raw || typeof raw !== 'object' || raw.format !== EXPORT_FORMAT) return null;
  return { name: cleanName(raw.name) || 'Imported profile', bindings: normalizeBindings(raw.bindings) };
}
