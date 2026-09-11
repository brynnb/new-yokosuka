export const ARCADE_KEY_DETAILS = Object.freeze({
  KeyW: Object.freeze({ key: "w", keyCode: 87 }),
  KeyA: Object.freeze({ key: "a", keyCode: 65 }),
  KeyS: Object.freeze({ key: "s", keyCode: 83 }),
  KeyD: Object.freeze({ key: "d", keyCode: 68 }),
  KeyC: Object.freeze({ key: "c", keyCode: 67 }),
  KeyV: Object.freeze({ key: "v", keyCode: 86 }),
  KeyX: Object.freeze({ key: "x", keyCode: 88 }),
  Space: Object.freeze({ key: " ", keyCode: 32 }),
  Enter: Object.freeze({ key: "Enter", keyCode: 13 }),
});

export function migrateHangOnPedalSettings(storage) {
  // EmulatorJS 4.2.3 stores controls under game ID, core family, and ROM name.
  // Repair only the previously shipped bindings; preserve custom mappings and
  // all other preferences, save data, and games' settings.
  const key = "ejs-new-yokosuka-hangon-arcade-hangon-settings";
  const raw = storage.getItem(key);
  if (!raw) return false;
  const settings = JSON.parse(raw);
  const controls = settings?.controlSettings?.[0];
  if (!controls) return false;
  let changed = false;
  for (const [oldId, newId, letter, code, oldButton, newButton] of [
    [0, 13, "w", 87, "BUTTON_2", "RIGHT_BOTTOM_SHOULDER"],
    [8, 12, "s", 83, "BUTTON_1", "LEFT_BOTTOM_SHOULDER"],
  ]) {
    const binding = controls[oldId];
    if (!binding || controls[newId] != null
      || ![letter, code].includes(binding.value) || binding.value2 !== oldButton) continue;
    controls[newId] = { ...binding, value2: newButton };
    delete controls[oldId];
    changed = true;
  }
  if (changed) storage.setItem(key, JSON.stringify(settings));
  return changed;
}

export function dispatchArcadeEmulatorKey({
  emulator,
  fallbackTarget,
  code,
  pressed,
  KeyboardEventConstructor = globalThis.KeyboardEvent,
}) {
  const details = ARCADE_KEY_DETAILS[code];
  const target = emulator?.elements?.parent || fallbackTarget;
  if (
    !details
    || typeof target?.dispatchEvent !== "function"
    || typeof KeyboardEventConstructor !== "function"
  ) return false;

  const event = new KeyboardEventConstructor(pressed ? "keydown" : "keyup", {
    key: details.key,
    code,
    bubbles: true,
    cancelable: true,
  });
  // EmulatorJS 4.2.3 maps keyboard input through legacy numeric fields.
  // Firefox does not populate them from the KeyboardEvent constructor.
  Object.defineProperties(event, {
    keyCode: {
      configurable: true,
      value: details.keyCode,
    },
    which: {
      configurable: true,
      value: details.keyCode,
    },
  });
  target.dispatchEvent(event);
  return true;
}
