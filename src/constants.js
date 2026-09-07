// Time-of-day presets based on real Shenmue footage:
// Day = normal daylight, Sunset = orange sky but windows still unlit,
// Evening = dark sky + lit windows/lanterns/signs,
// Night = same dark sky as evening.
export const timeOfDayPresets = [
  {
    name: "Day",
    texture: "/textures/sky/air00.png",
    clearColor: [0.4, 0.6, 0.9, 1],
    lighting: null, // Use default scene lighting
  },
  {
    name: "Sunset",
    texture: "/textures/sky/air18.png",
    clearColor: [0.8, 0.4, 0.2, 1],
    lighting: {
      ambientColor: [1, 0.882, 0.075],
      hemiIntensity: 0.65,
      hemiDiffuse: [1, 0.914, 0.553],
      hemiGround: [0.78, 0.678, 0.459],
      hemiDirY: 0.4,
      skyIntensity: 0.3,
      skyDiffuse: [0.067, 0, 1],
      dirIntensity: 0,
      dirDiffuse: [1, 1, 1],
      dirDirection: [-1, -2, -1],
      fillIntensity: 0.25,
      fillDiffuse: [1, 1, 1],
      emissive: [0, 0, 0],
    },
  },
  {
    name: "Evening",
    texture: "/textures/sky/air25.png",
    clearColor: [0.05, 0.03, 0.1, 1],
    lighting: {
      ambientColor: [0.051, 0.125, 1],
      hemiIntensity: 0.2,
      hemiDiffuse: [1, 0.914, 0.553],
      hemiGround: [0.78, 0.678, 0.459],
      hemiDirY: 0.7,
      skyIntensity: 0.2,
      skyDiffuse: [0.235, 0.22, 0.224],
      dirIntensity: 0.15,
      dirDiffuse: [1, 1, 1],
      dirDirection: [-1, -2, -1],
      fillIntensity: 0.25,
      fillDiffuse: [0, 0.18, 1],
      emissive: [0, 0, 0],
    },
  },
  {
    name: "Night",
    texture: "/textures/sky/air25.png",
    clearColor: [0.01, 0.01, 0.05, 1],
    lighting: {
      ambientColor: [0.875, 0.871, 1],
      hemiIntensity: 0.1,
      hemiDiffuse: [1, 0.914, 0.553],
      hemiGround: [0.78, 0.678, 0.459],
      hemiDirY: 0.7,
      skyIntensity: 0.2,
      skyDiffuse: [0.235, 0.22, 0.224],
      dirIntensity: 0.15,
      dirDiffuse: [1, 1, 1],
      dirDirection: [-1, -2, -1],
      fillIntensity: 0.25,
      fillDiffuse: [0.047, 0.106, 0.416],
      emissive: [0, 0, 0],
    },
  },
];

// Default lighting values (Day preset) — used to restore when switching back to Day
export const DEFAULT_LIGHTING = {
  ambientColor: [0.3, 0.3, 0.3],
  hemiIntensity: 1.2,
  hemiDiffuse: [1, 1, 1],
  hemiGround: [0.1, 0.1, 0.15],
  hemiDirY: 1,
  skyIntensity: 1.5,
  skyDiffuse: [1, 1, 1],
  dirIntensity: 1.0,
  dirDiffuse: [1, 1, 1],
  dirDirection: [-1, -2, -1],
  fillIntensity: 0.8,
  fillDiffuse: [1, 1, 1],
  emissive: [0.08, 0.08, 0.08],
};

// Map time-of-day preset index to MAP texture pack index
// 0=Day, 1=Sunset (afternoon), 2=Evening, 3=Night
export const timeToMapIndex = {
  0: 0, // Day
  1: 1, // Sunset -> Afternoon
  2: 2, // Evening
  3: 3, // Night
};

export const seasonPresets = [
  { name: "Summer", index: 0 },
  { name: "Winter", index: 1 },
];

export const weatherPresets = [
  { name: "Clear", id: "clear", index: 0 },
  { name: "Overcast", id: "overcast", index: 1 },
  { name: "Rain", id: "rain", index: 2 },
  { name: "Snow", id: "snow", index: 3 },
];

// Compatibility export for the viewer and existing callers. The canonical
// definitions now live with each source in data/scene-compositions.json.
export { SCENE_VARIANT_PROFILES as ZONE_VARIANTS } from "./SceneCompositions.js";

// Interior scene codes (no exterior sky visible)
export const INTERIOR_SCENES = [
  "JOMO",
  "DCBN",
  "DGCT",
  "DAZA",
  "DMAJ",
  "DSLT",
  "DPIZ",
  "DBYO",
  "DSLI",
  "DRME",
  "DJAZ",
  "DBHB",
  "DKPA",
  "DRHT",
  "DTKY",
  "MS08",
  "MO99",
  "MS8A",
  "MS8S",
  "MKYU", // Warehouses, harbor interiors
];

// Asset Resolution Logic
export const R2_URL = import.meta.env?.VITE_ASSET_URL
  || (import.meta.env?.DEV
    ? "/r2-assets"
    : "https://pub-c3aa1dfd53424ee9af1b87ad19954589.r2.dev");
export const R2_PREFIX = "shenmue";
export const DIALOGUE_VOICE_URL =
  import.meta.env?.VITE_DIALOGUE_VOICE_URL
  || `${R2_URL}/dialogue/voices/v1`;
export const OFFLINE_MODE = import.meta.env?.VITE_OFFLINE_ASSETS === "true";
