export const GRAPHICS_PREFERENCES_STORAGE_KEY =
  "new-yokosuka.graphics-preferences.v1";

export const DEFAULT_GRAPHICS_PREFERENCES = Object.freeze({
  antiAliasing: "msaa4",
  textureFiltering: "high",
  mipmaps: true,
  dynamicResolution: true,
  renderResolution: "highDpi",
});

const ANTI_ALIASING_VALUES = new Set([
  "off",
  "fxaa",
  "msaa2",
  "msaa4",
]);
const TEXTURE_FILTERING_VALUES = new Set([
  "performance",
  "balanced",
  "high",
]);
const RENDER_RESOLUTION_VALUES = new Set([
  "highDpi",
  "standard",
  "low",
]);

export function renderPixelRatioCap(value) {
  if (value === "standard") return 1;
  if (value === "low") return 0.8;
  return 2;
}

function allowed(value, choices, fallback) {
  return choices.has(value) ? value : fallback;
}

function readStoredState(storage) {
  try {
    const saved = JSON.parse(
      storage?.getItem(GRAPHICS_PREFERENCES_STORAGE_KEY),
    );
    return {
      antiAliasing: allowed(
        saved?.antiAliasing,
        ANTI_ALIASING_VALUES,
        DEFAULT_GRAPHICS_PREFERENCES.antiAliasing,
      ),
      textureFiltering: allowed(
        saved?.textureFiltering,
        TEXTURE_FILTERING_VALUES,
        DEFAULT_GRAPHICS_PREFERENCES.textureFiltering,
      ),
      mipmaps: saved?.mipmaps !== false,
      dynamicResolution: saved?.dynamicResolution !== false,
      renderResolution: allowed(
        saved?.renderResolution,
        RENDER_RESOLUTION_VALUES,
        DEFAULT_GRAPHICS_PREFERENCES.renderResolution,
      ),
    };
  } catch {
    return { ...DEFAULT_GRAPHICS_PREFERENCES };
  }
}

export class GraphicsPreferences {
  constructor({ storage = globalThis.localStorage } = {}) {
    this.storage = storage;
    this.state = readStoredState(storage);
    this.listeners = new Set();
  }

  getState() {
    return { ...this.state };
  }

  setAntiAliasing(value) {
    this.#set("antiAliasing", value, ANTI_ALIASING_VALUES);
  }

  setTextureFiltering(value) {
    this.#set("textureFiltering", value, TEXTURE_FILTERING_VALUES);
  }

  setMipmaps(enabled) {
    this.#setBoolean("mipmaps", enabled);
  }

  setDynamicResolution(enabled) {
    this.#setBoolean("dynamicResolution", enabled);
  }

  setRenderResolution(value) {
    this.#set("renderResolution", value, RENDER_RESOLUTION_VALUES);
  }

  reset() {
    this.state = { ...DEFAULT_GRAPHICS_PREFERENCES };
    this.#changed();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  #set(key, value, choices) {
    if (!choices.has(value) || this.state[key] === value) return;
    this.state = { ...this.state, [key]: value };
    this.#changed();
  }

  #setBoolean(key, enabled) {
    const value = Boolean(enabled);
    if (this.state[key] === value) return;
    this.state = { ...this.state, [key]: value };
    this.#changed();
  }

  #changed() {
    const state = this.getState();
    try {
      this.storage?.setItem(
        GRAPHICS_PREFERENCES_STORAGE_KEY,
        JSON.stringify(state),
      );
    } catch {
      // Preferences remain active for this page when storage is unavailable.
    }
    for (const listener of this.listeners) listener(state);
  }
}

export const graphicsPreferences = new GraphicsPreferences();
