// Finding out whether a newer release exists. Pure, so it's unit-tested; the request
// itself is made by the main process (see checkForUpdate in main/main.js).

const REPO = 'Alphonsvds/joystick-mapper';

// GitHub's "latest release" endpoint: the newest release that isn't a draft or pre-release.
export const LATEST_RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;

const VERSION = /^v?(\d{1,5})\.(\d{1,5})\.(\d{1,5})$/;

// "v0.2.5" or "0.2.5" -> [0, 2, 5]; anything else -> null.
export function parseVersion(text) {
  const match = VERSION.exec(String(text ?? '').trim());
  return match ? match.slice(1).map(Number) : null;
}

export function isNewer(candidate, current) {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

// GitHub's release payload -> { version, url } when it's newer than `current`, else null.
// The link is built here from the checked version, never taken from the response.
export function updateFromRelease(release, current) {
  const parsed = parseVersion(release?.tag_name);
  if (!parsed || release.draft === true || release.prerelease === true) return null;
  const version = parsed.join('.');
  if (!isNewer(version, current)) return null;
  return { version, url: `https://github.com/${REPO}/releases/tag/v${version}` };
}
