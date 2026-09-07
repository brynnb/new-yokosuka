import { SHENMUE_II_NATIVE_UV_ANIMATIONS } from "./Shenmue2UvAnimations.generated.js";

const SHENMUE_II_NATIVE_UPDATES_PER_SECOND = 30;
const REPEAT_SAMPLER = Object.freeze({
  addressU: "repeat",
  addressV: "repeat",
});

// The MT7 decoder swaps the ordinary twiddled texture axes. Native source V
// therefore becomes Babylon U, while native source U becomes Babylon V.
const MT7_MAP_EFFECTS = Object.freeze(
  SHENMUE_II_NATIVE_UV_ANIMATIONS.map((animation) => Object.freeze({
    ...animation,
    id: [
      "s2",
      animation.roomId.toLowerCase(),
      `map${String(animation.modelIndex).padStart(2, "0")}`,
      "native-uv-scroll",
    ].join("-"),
    sampler: REPEAT_SAMPLER,
    scrollUPerSecond: (
      animation.sourceVPerUpdate * SHENMUE_II_NATIVE_UPDATES_PER_SECOND
    ),
    scrollVPerSecond: (
      animation.sourceUPerUpdate * SHENMUE_II_NATIVE_UPDATES_PER_SECOND
    ),
  })),
);

function effectFor(roomId, modelIndex) {
  return MT7_MAP_EFFECTS.find(
    (effect) => effect.roomId === roomId && effect.modelIndex === modelIndex,
  );
}

// Kept as named exports for callers and focused fountain tests.
export const WORKERS_PIER_FOUNTAIN_JETS_EFFECT = effectFor("AR02", 17);
export const WORKERS_PIER_FOUNTAIN_EFFECT = effectFor("AR02", 18);

function basename(filename) {
  return String(filename || "").split(/[\\/]/).pop();
}

export function mt7MapEffectDefinition(sourceFilename, model) {
  const filename = basename(sourceFilename).toUpperCase();
  const match = filename.match(
    /^S2DC_D\d+_([A-Z0-9]{4})_MPK\d+_MAP(\d*)\.MT7$/,
  );
  if (!match || !model) return null;
  const roomId = match[1];
  const modelIndex = match[2] === "" ? 0 : Number.parseInt(match[2], 10);
  return effectFor(roomId, modelIndex) || null;
}

export function mt7MapEffectMaterialState(effect, textureId, state) {
  if (!effect) return state;
  return {
    ...state,
    ...effect.sampler,
  };
}
