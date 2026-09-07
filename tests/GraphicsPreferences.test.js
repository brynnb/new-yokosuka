import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_GRAPHICS_PREFERENCES,
  GRAPHICS_PREFERENCES_STORAGE_KEY,
  GraphicsPreferences,
  renderPixelRatioCap,
} from "../src/rendering/GraphicsPreferences.js";
import {
  anisotropyForTextureFiltering,
  antiAliasingConfiguration,
} from "../src/rendering/GraphicsSettingsRuntime.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    values,
  };
}

test("graphics preferences persist and reset", () => {
  const storage = memoryStorage();
  const preferences = new GraphicsPreferences({ storage });
  preferences.setAntiAliasing("fxaa");
  preferences.setTextureFiltering("balanced");

  assert.deepEqual(new GraphicsPreferences({ storage }).getState(), {
    antiAliasing: "fxaa",
    textureFiltering: "balanced",
    mipmaps: true,
    dynamicResolution: true,
    renderResolution: "highDpi",
  });
  assert.ok(storage.values.has(GRAPHICS_PREFERENCES_STORAGE_KEY));

  preferences.reset();
  assert.deepEqual(preferences.getState(), DEFAULT_GRAPHICS_PREFERENCES);
});

test("graphics feature switches persist and default to enabled", () => {
  const storage = memoryStorage();
  const preferences = new GraphicsPreferences({ storage });
  assert.equal(preferences.getState().mipmaps, true);
  assert.equal(preferences.getState().dynamicResolution, true);

  preferences.setMipmaps(false);
  preferences.setDynamicResolution(false);
  preferences.setRenderResolution("standard");
  assert.deepEqual(new GraphicsPreferences({ storage }).getState(), {
    antiAliasing: "msaa4",
    textureFiltering: "high",
    mipmaps: false,
    dynamicResolution: false,
    renderResolution: "standard",
  });
});

test("render resolution choices map to explicit pixel-density caps", () => {
  assert.equal(renderPixelRatioCap("highDpi"), 2);
  assert.equal(renderPixelRatioCap("standard"), 1);
  assert.equal(renderPixelRatioCap("low"), 0.8);
});

test("invalid saved graphics values fall back to defaults", () => {
  const storage = memoryStorage();
  storage.setItem(GRAPHICS_PREFERENCES_STORAGE_KEY, JSON.stringify({
    antiAliasing: "maximum",
    textureFiltering: "potato",
  }));
  assert.deepEqual(
    new GraphicsPreferences({ storage }).getState(),
    DEFAULT_GRAPHICS_PREFERENCES,
  );
});

test("graphics choices respect hardware capability limits", () => {
  assert.deepEqual(antiAliasingConfiguration("fxaa", 4), {
    fxaa: true,
    samples: 1,
  });
  assert.deepEqual(antiAliasingConfiguration("msaa4", 2), {
    fxaa: false,
    samples: 2,
  });
  assert.equal(anisotropyForTextureFiltering("high", 4), 4);
  assert.equal(anisotropyForTextureFiltering("performance", 16), 1);
});
