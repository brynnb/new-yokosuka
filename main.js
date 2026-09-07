import * as BABYLON from "@babylonjs/core";
import { createSceneLoaders } from "./src/rendering/SceneResources.js";
import { AssetViewerEnvironment } from "./src/AssetViewerEnvironment.js";
import { GraphicsSettingsRuntime } from "./src/rendering/GraphicsSettingsRuntime.js";
import { graphicsPreferences } from "./src/rendering/GraphicsPreferences.js";
import state from "./src/state.js";
import { createScene } from "./src/scene.js";
import { createLights } from "./src/lighting.js";
import {
  initToggleButtons,
  loadAudioCatalog,
  loadCatalog,
  loadShenmue2Catalog,
} from "./src/catalog.js";
import { initExportHandlers } from "./src/exports.js";
import { initUIHandlers } from "./src/ui.js";
import { initLightingPanel } from "./src/lightingPanel.js";

// Initialize engine and state
const canvas = document.getElementById("renderCanvas");
const engine = new BABYLON.Engine(canvas, false);

// Wire up shared state
state.canvas = canvas;
state.engine = engine;

// Create scene with camera and FPS controls
const scene = createScene();
state.scene = scene;
Object.assign(state, createSceneLoaders(scene, {
  generateMipMaps: () => graphicsPreferences.getState().mipmaps,
}));
const graphics = new GraphicsSettingsRuntime({
  engine, scene, camera: scene.activeCamera, preferences: graphicsPreferences,
});
scene.onDisposeObservable.addOnce(() => graphics.dispose());

// Create lights
createLights(scene);
state.sceneEnvironment = new AssetViewerEnvironment(state);

console.log("[Viewer] Initialized v1.2.0");

// Render loop
engine.runRenderLoop(() => {
  if (scene) {
    if (state.currentSkybox && scene.activeCamera) {
      state.currentSkybox.position.copyFrom(scene.activeCamera.position);
    }
    scene.render();
  }
});

window.addEventListener("resize", () => {
  setTimeout(() => {
    engine.resize();
  }, 0);
});

// Initialize all UI handlers
initUIHandlers();
initExportHandlers();
initToggleButtons();
initLightingPanel();

// Load catalog and populate sidebar. A direct Shenmue II URL is useful for
// reproducible renderer checks without changing the normal default library.
const params = new URLSearchParams(window.location.search);
const initialMode = params.get("mode") || params.get("game");
if (initialMode === "shenmue2") {
  loadShenmue2Catalog();
} else if (initialMode === "audio") {
  loadAudioCatalog();
} else {
  loadCatalog();
}
