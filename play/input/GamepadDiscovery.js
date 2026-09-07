export function connectedGamepads(
  getGamepads = () => globalThis.navigator?.getGamepads?.() || [],
) {
  const byId = new Map();
  for (const gamepad of Array.from(getGamepads?.() || [])) {
    if (
      !gamepad
      || gamepad.connected === false
      || typeof gamepad.id !== "string"
      || !gamepad.id.trim()
      || byId.has(gamepad.id)
    ) {
      continue;
    }
    byId.set(gamepad.id, gamepad);
  }
  return Array.from(byId.values());
}
