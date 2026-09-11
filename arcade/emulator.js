import { ARCADE_ROM_URLS } from "../src/ArcadeRomUrls.js";
import { dispatchArcadeEmulatorKey, migrateHangOnPedalSettings } from "../src/ArcadeEmulatorInput.js";
import { readAudioPreferences } from "../play/audio/AudioPreferences.js";

const ARCADE_CONFIGS = Object.freeze({
  hangon: Object.freeze({
    title: "Hang-On",
    gameName: "hangon",
    romUrl: ARCADE_ROM_URLS.hangon,
    controls: Object.freeze({
      0: Object.freeze({
        // FBNeo maps Hang-On's analog pedals to RetroPad R2/L2, not B/A.
        // Keyboard presses supply full throttle/brake through these inputs.
        13: Object.freeze({ value: "w", value2: "RIGHT_BOTTOM_SHOULDER" }),
        2: Object.freeze({ value: "v", value2: "SELECT" }),
        3: Object.freeze({ value: "enter", value2: "START" }),
        12: Object.freeze({ value: "s", value2: "LEFT_BOTTOM_SHOULDER" }),
        16: Object.freeze({ value: "d", value2: "LEFT_STICK_X:+1" }),
        17: Object.freeze({ value: "a", value2: "LEFT_STICK_X:-1" }),
      }),
      1: Object.freeze({}),
      2: Object.freeze({}),
      3: Object.freeze({}),
    }),
  }),
  harrier: Object.freeze({
    title: "Space Harrier",
    gameName: "sharrier",
    romUrl: ARCADE_ROM_URLS.harrier,
    controls: Object.freeze({
      0: Object.freeze({
        0: Object.freeze({ value: "space", value2: "BUTTON_2" }),
        1: Object.freeze({ value: "c", value2: "BUTTON_4" }),
        2: Object.freeze({ value: "v", value2: "SELECT" }),
        3: Object.freeze({ value: "enter", value2: "START" }),
        8: Object.freeze({ value: "x", value2: "BUTTON_1" }),
        16: Object.freeze({ value: "d", value2: "LEFT_STICK_X:+1" }),
        17: Object.freeze({ value: "a", value2: "LEFT_STICK_X:-1" }),
        18: Object.freeze({ value: "s", value2: "LEFT_STICK_Y:+1" }),
        19: Object.freeze({ value: "w", value2: "LEFT_STICK_Y:-1" }),
      }),
      1: Object.freeze({}),
      2: Object.freeze({}),
      3: Object.freeze({}),
    }),
  }),
  astrob: Object.freeze({
    title: "Astro Blaster",
    core: "mame2003_plus",
    gameName: "astrob2",
    romUrl: ARCADE_ROM_URLS.astrob,
    defaultOptions: Object.freeze({
      "mame2003-plus_skip_disclaimer": "enabled",
      "mame2003-plus_skip_warnings": "enabled",
    }),
    controls: Object.freeze({
      0: Object.freeze({
        0: Object.freeze({ value: "space", value2: "BUTTON_2" }),
        1: Object.freeze({ value: "c", value2: "BUTTON_4" }),
        2: Object.freeze({ value: "v", value2: "SELECT" }),
        3: Object.freeze({ value: "enter", value2: "START" }),
        16: Object.freeze({ value: "d", value2: "LEFT_STICK_X:+1" }),
        17: Object.freeze({ value: "a", value2: "LEFT_STICK_X:-1" }),
      }),
      1: Object.freeze({}),
      2: Object.freeze({}),
      3: Object.freeze({}),
    }),
  }),
  pacman: Object.freeze({
    title: "Pac-Man",
    gameName: "pacman",
    romUrl: ARCADE_ROM_URLS.pacman,
    controls: Object.freeze({
      0: Object.freeze({
        2: Object.freeze({ value: "v", value2: "SELECT" }),
        3: Object.freeze({ value: "enter", value2: "START" }),
        16: Object.freeze({ value: "d", value2: "LEFT_STICK_X:+1" }),
        17: Object.freeze({ value: "a", value2: "LEFT_STICK_X:-1" }),
        18: Object.freeze({ value: "s", value2: "LEFT_STICK_Y:+1" }),
        19: Object.freeze({ value: "w", value2: "LEFT_STICK_Y:-1" }),
      }),
      1: Object.freeze({}),
      2: Object.freeze({}),
      3: Object.freeze({}),
    }),
  }),
  invaders: Object.freeze({
    title: "Space Invaders",
    gameName: "invaders",
    romUrl: ARCADE_ROM_URLS.invaders,
    controls: Object.freeze({
      0: Object.freeze({
        0: Object.freeze({ value: "space", value2: "BUTTON_2" }),
        2: Object.freeze({ value: "v", value2: "SELECT" }),
        3: Object.freeze({ value: "enter", value2: "START" }),
        16: Object.freeze({ value: "d", value2: "LEFT_STICK_X:+1" }),
        17: Object.freeze({ value: "a", value2: "LEFT_STICK_X:-1" }),
      }),
      1: Object.freeze({}),
      2: Object.freeze({}),
      3: Object.freeze({}),
    }),
  }),
});

const gameId = new URLSearchParams(window.location.search).get("game");
const config = ARCADE_CONFIGS[gameId];
const gameElement = document.getElementById("game");
let started = false;
let failureReported = false;
window.__newYokosukaArcadeErrors = [];

// Inputs are supplied by the parent game's keyboard/touch controls. Prevent
// EmulatorJS from calling the iframe-blocked Gamepad API every 10 ms.
try {
  Object.defineProperty(window.navigator, "getGamepads", {
    configurable: true,
    value: () => [],
  });
  if ("webkitGetGamepads" in window.navigator) {
    Object.defineProperty(window.navigator, "webkitGetGamepads", {
      configurable: true,
      value: () => [],
    });
  }
} catch {
  // Older browsers without an overridable Gamepad API already fall back to
  // EmulatorJS's empty-controller behavior.
}

// Firefox suspends Web Audio until a user gesture. Keep one context for the
// isolated emulator frame so a gesture relayed synchronously by the parent can
// unlock it whether FBNeo created the context before or after that gesture.
const NativeAudioContext = window.AudioContext || window.webkitAudioContext;
let arcadeAudioContext = null;
let arcadeAudioPreferences = readAudioPreferences();
if (NativeAudioContext) {
  function ArcadeAudioContext(options) {
    if (!arcadeAudioContext || arcadeAudioContext.state === "closed") {
      arcadeAudioContext = new NativeAudioContext(options);
    }
    return arcadeAudioContext;
  }
  ArcadeAudioContext.prototype = NativeAudioContext.prototype;
  Object.setPrototypeOf(ArcadeAudioContext, NativeAudioContext);
  window.AudioContext = ArcadeAudioContext;
  if (window.webkitAudioContext) {
    window.webkitAudioContext = ArcadeAudioContext;
  }
}

window.__newYokosukaActivateArcadeAudio = () => {
  if (!NativeAudioContext) return Promise.resolve(false);
  if (!arcadeAudioContext || arcadeAudioContext.state === "closed") {
    arcadeAudioContext = new window.AudioContext();
  }
  window.EJS_emulator?.setVolume?.(
    arcadeAudioPreferences.masterMuted
      ? 0
      : arcadeAudioPreferences.effectsVolume
        * arcadeAudioPreferences.overallVolume,
  );
  if (arcadeAudioContext.state !== "suspended") {
    return Promise.resolve(true);
  }
  return arcadeAudioContext.resume().then(() => true, () => false);
};

window.__newYokosukaSetArcadeAudioPreferences = (state = {}) => {
  arcadeAudioPreferences = {
    effectsVolume: Number.isFinite(Number(state.effectsVolume))
      ? Math.min(1, Math.max(0, Number(state.effectsVolume)))
      : arcadeAudioPreferences.effectsVolume,
    overallVolume: Number.isFinite(Number(state.overallVolume))
      ? Math.min(1, Math.max(0, Number(state.overallVolume)))
      : arcadeAudioPreferences.overallVolume,
    masterMuted: Boolean(state.masterMuted),
  };
  const volume = arcadeAudioPreferences.masterMuted
    ? 0
    : arcadeAudioPreferences.effectsVolume
      * arcadeAudioPreferences.overallVolume;
  window.EJS_volume = volume;
  window.EJS_emulator?.setVolume?.(volume);
};

// EmulatorJS 4.2.3 generates retroarch.cfg internally after its GameManager
// class loads. Disable audio-clock synchronization before that happens so
// Firefox's autoplay-blocked AudioContext cannot freeze video on frame one.
// A later user gesture still resumes the same context and restores sound.
Object.defineProperty(window, "EJS_GameManager", {
  configurable: true,
  set(GameManager) {
    const nativeGetRetroArchCfg = GameManager?.prototype?.getRetroArchCfg;
    if (typeof nativeGetRetroArchCfg === "function") {
      GameManager.prototype.getRetroArchCfg = function getArcadeRetroArchCfg() {
        const config = nativeGetRetroArchCfg.call(this);
        if (/(^|\n)audio_sync\s*=/.test(config)) {
          return config.replace(
            /(^|\n)audio_sync\s*=.*(?=\n|$)/,
            "$1audio_sync = false",
          );
        }
        return `${config}audio_sync = false\n`;
      };
    }
    Object.defineProperty(window, "EJS_GameManager", {
      configurable: true,
      writable: true,
      value: GameManager,
    });
  },
});

function notify(type, message = "") {
  window.parent.postMessage({
    source: "new-yokosuka-arcade",
    type,
    message,
  }, window.location.origin);
}

function showError(message) {
  if (failureReported) return;
  failureReported = true;
  gameElement.className = "arcade-error";
  gameElement.replaceChildren();
  const paragraph = document.createElement("p");
  paragraph.textContent = message;
  gameElement.append(paragraph);
  notify("error", message);
}

async function romIsAvailable(url) {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      cache: "no-store",
    });
    if (!response.ok) return false;
    const contentType = response.headers.get("content-type") || "";
    return !contentType.toLowerCase().includes("text/html");
  } catch {
    return false;
  }
}

async function boot() {
  if (!config) {
    showError("Unknown arcade game.");
    return;
  }
  document.title = `${config.title} — New Yokosuka Arcade`;
  const romUrl = config.romUrl;
  if (!await romIsAvailable(romUrl)) {
    showError(
      `${config.title} is not installed on this server. `
      + "Add the compatible ROM ZIP using the arcade ROM configuration.",
    );
    return;
  }

  window.EJS_player = "#game";
  window.EJS_core = config.core || "fbneo";
  window.EJS_gameName = config.gameName;
  window.EJS_gameUrl = romUrl;
  window.EJS_defaultOptions = config.defaultOptions || {};
  window.EJS_pathtodata = "/emulatorjs/data/";
  window.EJS_startOnLoaded = true;
  window.EJS_threads = false;
  // Core bundles are already cacheable HTTP assets. Avoid EmulatorJS's
  // separate IndexedDB core cache, because a partially written core survives
  // refreshes and later reaches initModule without defining EJS_Runtime.
  window.EJS_disableDatabases = true;
  window.EJS_gameID = `new-yokosuka-${gameId}`;
  window.EJS_volume = arcadeAudioPreferences.masterMuted
    ? 0
    : arcadeAudioPreferences.effectsVolume
      * arcadeAudioPreferences.overallVolume;
  window.EJS_color = "#b58b42";
  // EmulatorJS 4.2.3 treats `false` as the opt-out value here.
  window.EJS_disableAutoLang = false;
  window.EJS_defaultControls = config.controls;
  if (gameId === "hangon") {
    try {
      migrateHangOnPedalSettings(window.localStorage);
    } catch {
      console.warn("[Arcade] Saved Hang-On controls could not be updated. Reset controls in the emulator if needed.");
    }
  }
  // Keep EmulatorJS's analog-style movement stick, but supply the arcade
  // controls ourselves so its generic Fast and Slow buttons are not created.
  window.EJS_VirtualGamepadSettings = [
    {
      type: "zone",
      id: "arcade-stick",
      location: "left",
      left: "50%",
      top: "50%",
      joystickInput: false,
      // FBNeo: up, down, left, right.
      inputValues: [19, 18, 17, 16],
    },
  ];
  window.EJS_onGameStart = () => {
    started = true;
    notify("started");
  };
  window.EJS_ready = () => notify("ready");

  const loader = document.createElement("script");
  loader.src = "/emulatorjs/data/loader.js";
  loader.onerror = () => {
    showError("The arcade emulator files could not be loaded.");
  };
  document.body.append(loader);

  window.setTimeout(() => {
    if (!started) {
      notify(
        "error",
        `${config.title} has not started. The ROM revision may not match its emulator core.`,
      );
    }
  }, 45000);
}

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  event.preventDefault();
  event.stopImmediatePropagation();
  notify("exit");
}, true);

function dispatchArcadeKey(code, pressed) {
  return dispatchArcadeEmulatorKey({
    emulator: window.EJS_emulator,
    fallbackTarget: gameElement,
    code,
    pressed,
  });
}

window.addEventListener("message", (event) => {
  if (
    event.origin !== window.location.origin
    || event.source !== window.parent
    || event.data?.source !== "new-yokosuka"
    || event.data?.type !== "arcade-input"
  ) return;
  dispatchArcadeKey(event.data.code, event.data.pressed);
});

window.addEventListener("error", (event) => {
  window.__newYokosukaArcadeErrors.push({
    message: event.message,
    filename: event.filename,
    line: event.lineno,
    column: event.colno,
    stack: event.error?.stack || "",
  });
  if (!started) {
    notify("error", event.message || "The arcade emulator stopped while loading.");
  }
});

window.addEventListener("unhandledrejection", (event) => {
  window.__newYokosukaArcadeErrors.push({
    message: String(event.reason?.message || event.reason || "Unhandled rejection"),
    stack: event.reason?.stack || "",
  });
  if (!started) {
    notify("error", "The arcade emulator stopped while loading.");
  }
});

boot();
