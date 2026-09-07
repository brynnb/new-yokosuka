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
