import * as BABYLON from "@babylonjs/core";
import state from "./state.js";
import {
  timeOfDayPresets,
  DEFAULT_LIGHTING,
  seasonPresets,
} from "./constants.js";
import {
  interpolateClearColors,
  interpolateLightingPresets,
} from "./LightingInterpolation.js";

const SKY_VERTEX_SHADER = `
  precision highp float;
  attribute vec3 position;
  attribute vec2 uv;
  uniform mat4 worldViewProjection;
  varying vec2 vUV;

  void main(void) {
    gl_Position = worldViewProjection * vec4(position, 1.0);
    vUV = uv;
  }
`;

const SKY_FRAGMENT_SHADER = `
  precision highp float;
  varying vec2 vUV;
  uniform sampler2D fromTexture;
  uniform sampler2D toTexture;
  uniform float blendAmount;

  void main(void) {
    vec4 fromColor = texture2D(fromTexture, vUV);
    vec4 toColor = texture2D(toTexture, vUV);
    gl_FragColor = mix(fromColor, toColor, blendAmount);
  }
`;

const skyTextureCache = new Map();

const WEATHER_LIGHT_FACTORS = Object.freeze({
  clear: Object.freeze({ hemi: 1, sky: 1, direct: 1, fill: 1 }),
  overcast: Object.freeze({ hemi: 0.82, sky: 0.62, direct: 0.52, fill: 0.78 }),
  rain: Object.freeze({ hemi: 0.72, sky: 0.5, direct: 0.38, fill: 0.7 }),
  snow: Object.freeze({ hemi: 0.88, sky: 0.7, direct: 0.58, fill: 0.82 }),
});

function weatherLightFactors() {
  return WEATHER_LIGHT_FACTORS[state.currentWeather]
    || WEATHER_LIGHT_FACTORS.clear;
}

export function skyTextureForPreset(
  presetIndex,
  seasonIndex = state.currentSeason,
) {
  const preset = timeOfDayPresets[presetIndex];
  if (!preset) return null;
  const isWinter = seasonPresets[seasonIndex]?.index === 1;
  if (isWinter && presetIndex === 0) {
    return "/textures/sky/air07.png";
  }
  return preset.texture;
}

export function clearColorForPreset(
  presetIndex,
  seasonIndex = state.currentSeason,
) {
  const preset = timeOfDayPresets[presetIndex];
  if (!preset) return null;
  const isWinter = seasonPresets[seasonIndex]?.index === 1;
  return isWinter && presetIndex === 0
    ? [0.5, 0.55, 0.65, 1]
    : preset.clearColor;
}

function cachedSkyTexture(url) {
  if (!url) return null;
  let texture = skyTextureCache.get(url);
  if (!texture || texture.isDisposed) {
    texture = new BABYLON.Texture(url, state.scene);
    texture.vScale = 1;
    skyTextureCache.set(url, texture);
  }
  return texture;
}

function disposeSkyDome() {
  if (!state.currentSkybox) return;
  const material = state.currentSkybox.material;
  state.currentSkybox.dispose(false, false);
  material?.dispose?.();
  state.currentSkybox = null;
}

function ensureSkyDome() {
  if (state.isInteriorScene) {
    disposeSkyDome();
    return null;
  }
  if (state.currentSkybox?.metadata?.blendedSkyDome) {
    return state.currentSkybox;
  }

  if (state.currentSkybox) {
    state.currentSkybox.dispose(false, true);
    state.currentSkybox = null;
  }
  const skyDome = BABYLON.MeshBuilder.CreateSphere(
    "skyDome",
    {
      // The dome follows the camera, so it only needs to surround the visible
      // world and must remain inside /play's tightened far clip plane.
      diameter: 8000,
      slice: 0.5,
      sideOrientation: BABYLON.Mesh.BACKSIDE,
    },
    state.scene,
  );
  const material = new BABYLON.ShaderMaterial(
    "skyBlendMaterial",
    state.scene,
    {
      vertexSource: SKY_VERTEX_SHADER,
      fragmentSource: SKY_FRAGMENT_SHADER,
    },
    {
      attributes: ["position", "uv"],
      uniforms: ["worldViewProjection", "blendAmount"],
      samplers: ["fromTexture", "toTexture"],
    },
  );
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  skyDome.material = material;
  skyDome.renderingGroupId = 0;
  skyDome.infiniteDistance = true;
  skyDome.rotation.y = Math.PI;
  skyDome.metadata = {
    ...(skyDome.metadata || {}),
    blendedSkyDome: true,
  };
  state.currentSkybox = skyDome;
  return skyDome;
}

function applySkyBlend(fromIndex, toIndex, progress) {
  const fromUrl = skyTextureForPreset(fromIndex);
  const toUrl = skyTextureForPreset(toIndex);
  if (!fromUrl || !toUrl || state.isInteriorScene) {
    disposeSkyDome();
    return;
  }
  const skyDome = ensureSkyDome();
  const material = skyDome?.material;
  if (!material) return;
  material.setTexture("fromTexture", cachedSkyTexture(fromUrl));
  material.setTexture("toTexture", cachedSkyTexture(toUrl));
  material.setFloat(
    "blendAmount",
    Math.min(1, Math.max(0, Number(progress) || 0)),
  );
}

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
  const weather = weatherLightFactors();

  scene.ambientColor = new BABYLON.Color3(...L.ambientColor);
  hemiLight.intensity = L.hemiIntensity * weather.hemi;
  hemiLight.diffuse = new BABYLON.Color3(...L.hemiDiffuse);
  hemiLight.groundColor = new BABYLON.Color3(...L.hemiGround);
  hemiLight.direction.y = L.hemiDirY;
  skyLight.intensity = L.skyIntensity * weather.sky;
  skyLight.diffuse = new BABYLON.Color3(...L.skyDiffuse);
  directLight.intensity = L.dirIntensity * weather.direct;
  directLight.diffuse = new BABYLON.Color3(...L.dirDiffuse);
  directLight.direction = new BABYLON.Vector3(...L.dirDirection);
  fillLight.intensity = L.fillIntensity * weather.fill;
  fillLight.diffuse = new BABYLON.Color3(...L.fillDiffuse);

  // Apply emissive to all loaded materials
  const emissive = new BABYLON.Color3(...L.emissive);
  scene.materials.forEach((m) => {
    if (m.emissiveColor && m.metadata?.preserveEmissive !== true) {
      m.emissiveColor = emissive;
    }
  });
}

export function applyTimeOfDayLighting({
  fromIndex,
  toIndex,
  progress,
}) {
  const from = timeOfDayPresets[fromIndex];
  const to = timeOfDayPresets[toIndex];
  if (!from || !to) return;
  applyLightingPreset(interpolateLightingPresets(
    from.lighting || DEFAULT_LIGHTING,
    to.lighting || DEFAULT_LIGHTING,
    progress,
  ));
  const [r, g, b, a] = interpolateClearColors(
    clearColorForPreset(fromIndex),
    clearColorForPreset(toIndex),
    progress,
  );
  state.scene.clearColor = new BABYLON.Color4(r, g, b, a);
  applySkyBlend(fromIndex, toIndex, progress);
}

// Apply sky/time-of-day preset
// NOTE: Caller is responsible for calling updateModelVisibility() after this
export function applyTimeOfDay(presetIndex) {
  const preset = timeOfDayPresets[presetIndex];

  // Apply lighting preset (or restore defaults for Day)
  applyLightingPreset(preset.lighting || DEFAULT_LIGHTING);

  const clearColor = clearColorForPreset(presetIndex);

  applySkyBlend(presetIndex, presetIndex, 0);

  // Set clear color
  const [r, g, b, a] = clearColor;
  state.scene.clearColor = new BABYLON.Color4(r, g, b, a);
}
