import * as BABYLON from "@babylonjs/core";
import state from "./state.js";
import {
  timeOfDayPresets,
  DEFAULT_LIGHTING,
  seasonPresets,
} from "./constants.js";

export function createLights(scene) {
  state.hemiLight = new BABYLON.HemisphericLight(
    "light",
    new BABYLON.Vector3(0, 1, 0),
    scene,
  );
  state.hemiLight.intensity = 1.2;
  state.hemiLight.groundColor = new BABYLON.Color3(0.1, 0.1, 0.15); // Slight bluish bounce

  // Primary Sunlight (Top-down)
  state.skyLight = new BABYLON.DirectionalLight(
    "skyLight",
    new BABYLON.Vector3(0, -1, 0),
    scene,
  );
  state.skyLight.intensity = 1.5;

  state.directLight = new BABYLON.DirectionalLight(
    "dirLight",
    new BABYLON.Vector3(-1, -2, -1),
    scene,
  );
  state.directLight.position = new BABYLON.Vector3(20, 60, 20);
  state.directLight.intensity = 1.0;

  // Fill light
  state.fillLight = new BABYLON.PointLight(
    "fillLight",
    new BABYLON.Vector3(-20, 20, -20),
    scene,
  );
  state.fillLight.intensity = 0.8;
}

export function applyLightingPreset(L) {
  const { hemiLight, skyLight, directLight, fillLight, scene } = state;
  if (!hemiLight || !skyLight || !directLight || !fillLight) return;

  scene.ambientColor = new BABYLON.Color3(...L.ambientColor);
  hemiLight.intensity = L.hemiIntensity;
  hemiLight.diffuse = new BABYLON.Color3(...L.hemiDiffuse);
  hemiLight.groundColor = new BABYLON.Color3(...L.hemiGround);
  hemiLight.direction.y = L.hemiDirY;
  skyLight.intensity = L.skyIntensity;
  skyLight.diffuse = new BABYLON.Color3(...L.skyDiffuse);
  directLight.intensity = L.dirIntensity;
  directLight.diffuse = new BABYLON.Color3(...L.dirDiffuse);
  directLight.direction = new BABYLON.Vector3(...L.dirDirection);
  fillLight.intensity = L.fillIntensity;
  fillLight.diffuse = new BABYLON.Color3(...L.fillDiffuse);

  // Apply emissive to all loaded materials
  const emissive = new BABYLON.Color3(...L.emissive);
  scene.materials.forEach((m) => {
    if (m.emissiveColor) m.emissiveColor = emissive;
  });
}

// Apply sky/time-of-day preset
// NOTE: Caller is responsible for calling updateModelVisibility() after this
export function applyTimeOfDay(presetIndex) {
  const preset = timeOfDayPresets[presetIndex];
  const skyBtn = document.getElementById("sky-btn");

  // Update button text
  if (state.isInteriorScene) {
    skyBtn.innerText = `Time: ${preset.name} (interior)`;
  } else {
    skyBtn.innerText = `Time: ${preset.name}`;
  }

  // Apply lighting preset (or restore defaults for Day)
  applyLightingPreset(preset.lighting || DEFAULT_LIGHTING);

  // Season-aware sky texture: winter daytime uses air07.png
  let skyTexture = preset.texture;
  let clearColor = preset.clearColor;
  const isWinter = seasonPresets[state.currentSeason]?.index === 1;
  if (isWinter && presetIndex === 0) {
    skyTexture = "/textures/sky/air07.png";
    clearColor = [0.5, 0.55, 0.65, 1]; // Slightly overcast winter sky
  }

  // Clean up existing skybox
  if (state.currentSkybox) {
    state.currentSkybox.dispose();
    state.currentSkybox = null;
  }

  // Create new skybox if not Off AND not an interior scene
  if (skyTexture && !state.isInteriorScene) {
    state.currentSkybox = BABYLON.MeshBuilder.CreateSphere(
      "skyDome",
      {
        diameter: 50000,
        slice: 0.5,
        sideOrientation: BABYLON.Mesh.BACKSIDE,
      },
      state.scene,
    );

    const skyMat = new BABYLON.StandardMaterial("skyMat", state.scene);
    skyMat.disableLighting = true;

    const tex = new BABYLON.Texture(skyTexture, state.scene);
    tex.vScale = 1;

    skyMat.emissiveTexture = tex;
    state.currentSkybox.material = skyMat;

    state.currentSkybox.renderingGroupId = 0;
    state.currentSkybox.infiniteDistance = true;
    state.currentSkybox.rotation.y = Math.PI;
  }

  // Set clear color
  const [r, g, b, a] = clearColor;
  state.scene.clearColor = new BABYLON.Color4(r, g, b, a);
}
