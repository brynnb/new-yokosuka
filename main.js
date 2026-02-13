import * as BABYLON from "@babylonjs/core";
import "@babylonjs/loaders";
import { Mt5Loader } from "./src/Mt5Loader.js";
import state from "./src/state.js";
import { createScene } from "./src/scene.js";
import { createLights } from "./src/lighting.js";
import { loadCatalog, initToggleButtons } from "./src/catalog.js";
import { initExportHandlers } from "./src/exports.js";
import { initUIHandlers } from "./src/ui.js";
import { initLightingPanel } from "./src/lightingPanel.js";

// Initialize engine and state
const canvas = document.getElementById("renderCanvas");
const engine = new BABYLON.Engine(canvas, true);

// Wire up shared state
state.canvas = canvas;
state.engine = engine;
state.loader = new Mt5Loader(null);

// Create scene with camera and FPS controls
const scene = createScene();
state.scene = scene;
state.loader.scene = scene;

// Create lights
createLights(scene);

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

// Load catalog and populate sidebar
loadCatalog();

