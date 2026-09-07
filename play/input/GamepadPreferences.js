export const GAMEPAD_PREFERENCES_STORAGE_KEY =
  "new-yokosuka.gamepad-preferences.v1";

export const DEFAULT_GAMEPAD_PREFERENCES = Object.freeze({
  enabled: false,
  selectedGamepadId: null,
  movementDeadzone: 0.22,
  lookDeadzone: 0.16,
  lookSensitivity: 1,
  invertLookY: true,
  lookXAxis: 2,
  lookYAxis: 3,
  lookXAxisSign: 1,
  lookYAxisSign: 1,
});

function clamp(value, minimum, maximum, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, number));
}

function axisIndex(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 15
    ? number
    : fallback;
}

function axisSign(value) {
  return Number(value) === -1 ? -1 : 1;
}

function readState(storage) {
  try {
    const saved = JSON.parse(
      storage?.getItem(GAMEPAD_PREFERENCES_STORAGE_KEY),
    );
    return {
      enabled: typeof saved?.enabled === "boolean"
        ? saved.enabled
        : DEFAULT_GAMEPAD_PREFERENCES.enabled,
      selectedGamepadId: typeof saved?.selectedGamepadId === "string"
        && saved.selectedGamepadId.trim()
        ? saved.selectedGamepadId.trim()
        : null,
      movementDeadzone: clamp(
        saved?.movementDeadzone,
        0.05,
        0.5,
        DEFAULT_GAMEPAD_PREFERENCES.movementDeadzone,
      ),
      lookDeadzone: clamp(
        saved?.lookDeadzone,
        0.05,
        0.5,
        DEFAULT_GAMEPAD_PREFERENCES.lookDeadzone,
      ),
      lookSensitivity: clamp(
        saved?.lookSensitivity,
        0.25,
        2,
        DEFAULT_GAMEPAD_PREFERENCES.lookSensitivity,
      ),
      invertLookY: typeof saved?.invertLookY === "boolean"
        ? saved.invertLookY
        : DEFAULT_GAMEPAD_PREFERENCES.invertLookY,
      lookXAxis: axisIndex(
        saved?.lookXAxis,
        DEFAULT_GAMEPAD_PREFERENCES.lookXAxis,
      ),
      lookYAxis: axisIndex(
        saved?.lookYAxis,
        DEFAULT_GAMEPAD_PREFERENCES.lookYAxis,
      ),
      lookXAxisSign: axisSign(saved?.lookXAxisSign),
      lookYAxisSign: axisSign(saved?.lookYAxisSign),
    };
  } catch {
    return { ...DEFAULT_GAMEPAD_PREFERENCES };
  }
}

export class GamepadPreferences {
  constructor({ storage = globalThis.localStorage } = {}) {
    this.storage = storage;
    Object.assign(this, readState(storage));
    this.listeners = new Set();
  }

  getState() {
    return {
      enabled: this.enabled,
      selectedGamepadId: this.selectedGamepadId,
      movementDeadzone: this.movementDeadzone,
      lookDeadzone: this.lookDeadzone,
      lookSensitivity: this.lookSensitivity,
      invertLookY: this.invertLookY,
      lookXAxis: this.lookXAxis,
      lookYAxis: this.lookYAxis,
      lookXAxisSign: this.lookXAxisSign,
      lookYAxisSign: this.lookYAxisSign,
    };
  }

  setEnabled(value) {
    this.enabled = Boolean(value);
    this.#changed();
  }

  setSelectedGamepadId(value) {
    this.selectedGamepadId = typeof value === "string" && value.trim()
      ? value.trim()
      : null;
    this.#changed();
  }

  setMovementDeadzone(value) {
    this.movementDeadzone = clamp(
      value,
      0.05,
      0.5,
      DEFAULT_GAMEPAD_PREFERENCES.movementDeadzone,
    );
    this.#changed();
  }

  setLookDeadzone(value) {
    this.lookDeadzone = clamp(
      value,
      0.05,
      0.5,
      DEFAULT_GAMEPAD_PREFERENCES.lookDeadzone,
    );
    this.#changed();
  }

  setLookSensitivity(value) {
    this.lookSensitivity = clamp(
      value,
      0.25,
      2,
      DEFAULT_GAMEPAD_PREFERENCES.lookSensitivity,
    );
    this.#changed();
  }

  setInvertLookY(value) {
    this.invertLookY = Boolean(value);
    this.#changed();
  }

  setLookAxisBinding({ xAxis, yAxis, xSign = 1, ySign = 1 }) {
    const nextX = axisIndex(xAxis, this.lookXAxis);
    const nextY = axisIndex(yAxis, this.lookYAxis);
    if (nextX === nextY) return false;
    this.lookXAxis = nextX;
    this.lookYAxis = nextY;
    this.lookXAxisSign = axisSign(xSign);
    this.lookYAxisSign = axisSign(ySign);
    this.#changed();
    return true;
  }

  reset() {
    Object.assign(this, DEFAULT_GAMEPAD_PREFERENCES);
    this.#changed();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  #changed() {
    const state = this.getState();
    try {
      this.storage?.setItem(
        GAMEPAD_PREFERENCES_STORAGE_KEY,
        JSON.stringify(state),
      );
    } catch {
      // Preferences remain active when storage is unavailable.
    }
    for (const listener of this.listeners) listener(state);
  }
}

export const gamepadPreferences = new GamepadPreferences();
