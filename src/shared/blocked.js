// Windows can refuse to load koffi, the prebuilt native file every Windows call the app
// makes goes through: Smart App Control, or a company's application policy, blocks files
// that carry no signature (GitHub issue #38). No joystick can be read then and no virtual
// pad made, and what Windows says about it gives a user nothing to act on.
export const BLOCKED_MESSAGE = 'Windows blocked part of Joystick Mapper';
export const BLOCKED_HELP_URL = 'https://github.com/Alphonsvds/joystick-mapper/blob/main/docs/blocked-by-windows.md';

// Node's code for a native file the system wouldn't load.
export const isBlocked = (err) => err?.code === 'ERR_DLOPEN_FAILED';
