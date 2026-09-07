import * as BABYLON from "@babylonjs/core";

// Shared application state — imported by all modules
const state = {
  // DOM elements
  canvas: null,
  engine: null,
  scene: null,

  // Loader
  loader: null,
  mt7Loader: null,

  // Asset library
  currentGame: "shenmue",

  // Meshes & loading
  currentMeshes: [],
  currentLoadId: 0,
  currentSkybox: null,

  // Time & season
  currentTimeOfDay: 0, // 0=Day, 1=Sunset, 2=Evening, 3=Night
  currentSeason: 0, // 0=Summer, 1=Winter
  currentWeather: "clear",
  currentWeatherIndex: 0,

  // Scene info
  isInteriorScene: false,
  currentZone: null,
  currentScenePrefix: null,
  currentSceneComposition: null,
  currentVariantProfile: null,
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
  mt7Models: [],
  mapNames: {},
  charNames: {},

  // Texture packs cache
  texturePacks: new Map(),
};

export default state;
