import * as BABYLON from "@babylonjs/core";

// Shared application state — imported by all modules
const state = {
  // DOM elements
  canvas: null,
  engine: null,
  scene: null,

  // Loader
  loader: null,

  // Meshes & loading
  currentMeshes: [],
  currentLoadId: 0,
  currentSkybox: null,

  // Time & season
  currentTimeOfDay: 0, // 0=Day, 1=Sunset, 2=Evening, 3=Night
  currentSeason: 0, // 0=Summer, 1=Winter, 2=Show All

  // Scene info
  isInteriorScene: false,
  currentZone: null,
  currentScenePrefix: null,
  singleModelMode: false,

  // Camera
  speedMultiplier: 1.0,

  // Lights (set in scene creation)
  hemiLight: null,
  skyLight: null,
  directLight: null,
  fillLight: null,

  // File catalog
  allFiles: [],
  mt5Files: [],
  mapNames: {},
  charNames: {},

  // Texture packs cache
  texturePacks: new Map(),
};

export default state;
