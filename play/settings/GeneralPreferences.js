export const GENERAL_PREFERENCES_STORAGE_KEY =
  "new-yokosuka.general-preferences.v1";
export const CONTROL_BINDINGS_VERSION = 3;

export const DEFAULT_CONTROL_BINDINGS = Object.freeze({
  moveForward: "KeyW",
  moveLeft: "KeyA",
  moveBackward: "KeyS",
  moveRight: "KeyD",
  run: "ShiftLeft",
  autoRun: "KeyQ",
  noClip: "KeyZ",
  cameraMode: "KeyR",
  forkliftLower: "KeyF",
  forkliftRaise: "KeyE",
  forkliftHorn: "KeyH",
  cancel: "KeyX",
  dialogueAdvance: "Space",
  combatHand: "KeyJ",
  combatLeg: "KeyK",
  combatThrow: "KeyL",
  combatGuard: "KeyI",
});

export const CONTROL_BINDING_GROUPS = Object.freeze([
  {
    label: "Movement",
    controls: [
      ["moveForward", "Move Forward"],
      ["moveLeft", "Move Left"],
      ["moveBackward", "Move Backward"],
      ["moveRight", "Move Right"],
      ["run", "Run / Dash"],
      ["autoRun", "Toggle Auto-run"],
      ["noClip", "Toggle No-clip"],
      ["cameraMode", "1st / 3rd Person"],
    ],
  },
  {
    label: "Actions",
    controls: [
      ["dialogueAdvance", "Next Dialogue Line"],
      ["cancel", "Cancel / Exit"],
      ["forkliftLower", "Lower Forklift"],
      ["forkliftRaise", "Raise Forklift"],
      ["forkliftHorn", "Forklift Horn"],
    ],
  },
  {
    label: "Combat",
    controls: [
      ["combatHand", "Hand"],
      ["combatLeg", "Leg"],
      ["combatThrow", "Throw"],
      ["combatGuard", "Guard"],
    ],
  },
]);

const DEFAULT_STATE = Object.freeze({
  dialogueCaptions: true,
  dialogueAudio: true,
  mouseSensitivity: 1,
});

function clampSensitivity(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_STATE.mouseSensitivity;
  return Math.min(2, Math.max(0.25, number));
}

function normalizeBinding(code, fallback) {
  if (typeof code !== "string" || !code) return fallback;
  if (code === "ShiftRight") return "ShiftLeft";
  return code;
}

function readStoredState(storage) {
  try {
    const saved = JSON.parse(
      storage?.getItem(GENERAL_PREFERENCES_STORAGE_KEY),
    );
    const bindingVersion = Number(saved?.controlBindingsVersion) || 1;
    const usesOldForkliftDefaults = (
      bindingVersion < CONTROL_BINDINGS_VERSION
      && saved?.bindings?.forkliftLower === "KeyE"
      && saved?.bindings?.forkliftRaise === "KeyF"
    );
    const storedBinding = (action) => {
      if (usesOldForkliftDefaults && action === "forkliftLower") {
        return "KeyF";
      }
      if (usesOldForkliftDefaults && action === "forkliftRaise") {
        return "KeyE";
      }
      if (
        action === "forkliftRaise"
        && bindingVersion < CONTROL_BINDINGS_VERSION
        && saved?.bindings?.[action] === "KeyR"
      ) {
        return "KeyE";
      }
      return saved?.bindings?.[action];
    };
    return {
      dialogueCaptions: saved?.dialogueCaptions !== false,
      dialogueAudio: saved?.dialogueAudio !== false,
      mouseSensitivity: clampSensitivity(saved?.mouseSensitivity),
      bindings: Object.fromEntries(
        Object.entries(DEFAULT_CONTROL_BINDINGS).map(([action, fallback]) => [
          action,
          normalizeBinding(
            storedBinding(action),
            fallback,
          ),
        ]),
      ),
    };
  } catch {
    return {
      ...DEFAULT_STATE,
      bindings: { ...DEFAULT_CONTROL_BINDINGS },
    };
  }
}

export function formatControlBinding(code) {
  if (!code) return "Unbound";
  const labels = {
    Space: "Space",
    ShiftLeft: "Shift",
    ControlLeft: "Ctrl",
    AltLeft: "Alt",
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    Backspace: "Backspace",
    Enter: "Enter",
  };
  if (labels[code]) return labels[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `Numpad ${code.slice(6)}`;
  return code;
}

export class GeneralPreferences {
  constructor({ storage = globalThis.localStorage } = {}) {
    const saved = readStoredState(storage);
    this.storage = storage;
    this.dialogueCaptions = saved.dialogueCaptions;
    this.dialogueAudio = saved.dialogueAudio;
    this.mouseSensitivity = saved.mouseSensitivity;
    this.bindings = saved.bindings;
    this.listeners = new Set();
  }

  getState() {
    return {
      controlBindingsVersion: CONTROL_BINDINGS_VERSION,
      dialogueCaptions: this.dialogueCaptions,
      dialogueAudio: this.dialogueAudio,
      mouseSensitivity: this.mouseSensitivity,
      bindings: { ...this.bindings },
    };
  }

  binding(action) {
    return this.bindings[action] || DEFAULT_CONTROL_BINDINGS[action] || null;
  }

  setDialogueCaptions(enabled) {
    this.dialogueCaptions = Boolean(enabled);
    this.#changed();
  }

  setDialogueAudio(enabled) {
    this.dialogueAudio = Boolean(enabled);
    this.#changed();
  }

  setMouseSensitivity(value) {
    this.mouseSensitivity = clampSensitivity(value);
    this.#changed();
  }

  setBinding(action, code) {
    if (!(action in DEFAULT_CONTROL_BINDINGS)) return false;
    this.bindings[action] = normalizeBinding(
      code,
      DEFAULT_CONTROL_BINDINGS[action],
    );
    this.#changed();
    return true;
  }

  resetGeneral() {
    this.dialogueCaptions = DEFAULT_STATE.dialogueCaptions;
    this.dialogueAudio = DEFAULT_STATE.dialogueAudio;
    this.#changed();
  }

  resetControls() {
    this.mouseSensitivity = DEFAULT_STATE.mouseSensitivity;
    for (const [action, code] of Object.entries(DEFAULT_CONTROL_BINDINGS)) {
      this.bindings[action] = code;
    }
    this.#changed();
  }

  reset() {
    this.dialogueCaptions = DEFAULT_STATE.dialogueCaptions;
    this.dialogueAudio = DEFAULT_STATE.dialogueAudio;
    this.mouseSensitivity = DEFAULT_STATE.mouseSensitivity;
    for (const [action, code] of Object.entries(DEFAULT_CONTROL_BINDINGS)) {
      this.bindings[action] = code;
    }
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
        GENERAL_PREFERENCES_STORAGE_KEY,
        JSON.stringify(state),
      );
    } catch {
      // Preferences remain active for this page when storage is unavailable.
    }
    for (const listener of this.listeners) listener(state);
  }
}

export const generalPreferences = new GeneralPreferences();
