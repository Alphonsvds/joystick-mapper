// Keeps a very short button press held long enough to be seen. A scroll wheel or an
// encoder sends each click as a press a few milliseconds long: gone before the UI draws
// its next frame, and before many games look at the controller. Pure and shared, so it's
// unit-tested.

export const MIN_PRESS_MS = 80;

// Returns hold(input, now): the input with every button down for at least `minMs` from
// the moment it was pressed, and `wait`, the milliseconds until a held button is due to
// be let go (null when none is being held), so the caller can ask again then.
export function pressHolder(minMs = MIN_PRESS_MS) {
  const downAt = new Map(); // buttons down in the last input -> when each went down
  const heldUntil = new Map(); // buttons let go early -> when each may be released
  return function hold(input, now) {
    for (const [id, down] of Object.entries(input.buttons)) {
      if (!down) continue;
      if (!downAt.has(id)) downAt.set(id, now);
      heldUntil.delete(id);
    }
    for (const [id, at] of downAt) {
      if (input.buttons[id]) continue;
      downAt.delete(id);
      if (now - at < minMs) heldUntil.set(id, at + minMs);
    }
    let wait = null;
    const buttons = { ...input.buttons };
    for (const [id, until] of heldUntil) {
      if (until <= now) {
        heldUntil.delete(id);
        continue;
      }
      buttons[id] = true;
      wait = Math.min(wait ?? Infinity, until - now);
    }
    return { input: wait === null ? input : { ...input, buttons }, wait };
  };
}
