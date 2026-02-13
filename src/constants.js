// Time-of-day presets based on real Shenmue footage:
// Day = normal daylight, Sunset (~4:30pm) = orange sky but windows still unlit,
// Evening (~6:30pm) = dark sky + lit windows/lanterns/signs,
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
  { name: "Show All", index: -1 },
];

// Zone variant groups: defines which MAP files are mutually exclusive.
// Each group has a 'type' that controls which toggle drives it:
//   - "season": controlled by the Season button (Summer/Winter/Show All)
//   - "time":   controlled by the Time button (Day/Sunset/Evening/Night)
// 'variants' is an array where each entry is either:
//   - a string suffix (e.g. "MAP03") for a single file, or
//   - an array of suffixes (e.g. ["MAP17","MAP18","MAP19"]) for multi-file groups.
// The index in the variants array matches the toggle preset index.
// For "time" groups: 0=Day, 1=Sunset, 2=Evening, 3=Night.
//   If only 2 entries are provided, index 0=Day and index 1=Night (maps to presets 0-1 vs 2-3).
export const ZONE_VARIANTS = {
  BETD: {
    label: "Hazuki Residence Exterior",
    groups: [
      { name: "Ground", type: "season", variants: ["MAP03", "MAP04"] },
      { name: "Small Plants", type: "season", variants: ["MAP08", "MAP09"] },
      { name: "Trees", type: "season", variants: ["MAP10", "MAP11"] },
      { name: "Foliage", type: "season", variants: ["MAP06", "MAP07", "MAP05"] },
    ],
  },
  D000: {
    label: "Dobuita",
    groups: [
      // Background buildings: MAP02=day, MAP03=night
      { name: "Background", type: "time", variants: ["MAP02", "MAP02", "MAP03", "MAP03"] },
      // Windows: MAP17+18+19=day, MAP20+21+22=night/evening
      { name: "Windows", type: "time", variants: [
        ["MAP17", "MAP18", "MAP19"],
        ["MAP17", "MAP18", "MAP19"],
        ["MAP20", "MAP21", "MAP22"],
        ["MAP20", "MAP21", "MAP22"],
      ]},
      // Roads/foliage: MAP23=summer, MAP24=winter
      { name: "Roads", type: "season", variants: ["MAP23", "MAP24"] },
    ],
  },
};

// Interior scene codes (no exterior sky visible)
export const INTERIOR_SCENES = [
  "JOMO",
  "JD00",
  "JHD0",
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
export const R2_URL = import.meta.env.VITE_ASSET_URL;
export const R2_PREFIX = "shenmue";
export const OFFLINE_MODE = import.meta.env.VITE_OFFLINE_ASSETS === "true";
