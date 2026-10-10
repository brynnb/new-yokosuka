import inventory from "../assets/introduction/op00/asset-inventory.generated.json" with {type: "json"};
import mail from "../assets/introduction/op00-mail/manifest.json" with {type: "json"};
import dream from "../assets/introduction/op00-dream/manifest.json" with {type: "json"};
import vision from "../assets/introduction/op02/manifest.json" with {type: "json"};

// Both playback and offline scenery preparation consume these same generated
// owners. A new scene-object or geometry mask must not silently become scenery.
export const INTRODUCTION_ENVIRONMENTS = Object.freeze({
  "op00-opening": Object.freeze({sceneObjects: inventory.sceneObjects,
    mapLayers: inventory.mapVisibilityModels, attachedObjects: inventory.attachedObjects}),
  "op00-mail": Object.freeze({packageActors: mail.packageActors,
    sceneObjects: mail.sceneObjects, mapLayers: mail.mapLayers}),
  "op00-dream": Object.freeze({packageActors: dream.packageActors,
    sceneObjects: dream.sceneObjects, mapLayers: dream.mapLayers}),
  "op02-opening": Object.freeze({packageActors: vision.packageActors, mapLayers: vision.mapLayers,
    mapGeometryMasks: vision.mapGeometryMasks, scrollSprites: vision.scrollSprites}),
});

export function introductionSceneryOwnership(worldId, filenames) {
  const environments = Object.entries(INTRODUCTION_ENVIRONMENTS)
    .filter(([id]) => id.startsWith(`${worldId}-`));
  if (!environments.length) return null;
  const controlled = new Set();
  for (const [, environment] of environments) {
    for (const kind of ["sceneObjects", "attachedObjects", "packageActors", "mapGeometryMasks"]) {
      for (const value of Object.values(environment[kind] || {})) {
        if (value.browserFilename) controlled.add(value.browserFilename);
      }
    }
  }
  // Whole-layer visibility survives batching. Native node selectors and
  // moving props need hierarchy; seasonal surfaces are protected individually
  // by the shared variant owner, so the rest of their map can still batch.
  return {environments: Object.fromEntries(environments),
    hierarchyFilenames: filenames.filter(filename => controlled.has(filename)).sort()};
}
