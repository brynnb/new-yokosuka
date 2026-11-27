// Shared asset resolution, coordinate conversion and root ownership for
// gameplay, offline preparation and read-only scene assembly.
import { Tools } from "@babylonjs/core/Misc/tools.js";
import { fetchAsset, getStandaloneTexturePack, getTexturePack } from "../assetLoader.js";
import { fetchAssetBuffer } from "../AssetCache.js";
import { Mt5Loader } from "../Mt5Loader.js";
import { runtimeAssetGroup } from "../RuntimeAssets.js";
import { jomoObjectBehavior } from "../JomoObjectRegistry.js";
import { mapTransitionForObject } from "../MapTransitions.js";
import { configureMt5TexturePack } from "../../play/assets/configureMt5TexturePack.js";

// The offline scenery compiler uses the same source coordinate conversion as
// gameplay, without installing gameplay callbacks on its disposable scene.
export function applyPlacementTransform(root, placement) {
  root._filename = placement.model;
  root._runtimePlacement = true;
  root._runtimePlacementRecord = placement;
  root.position.set(...placement.position);
  if (placement.rotationDegrees) {
    root.rotationQuaternion = Mt5Loader.sourceOrderQuaternion(
      ...placement.rotationDegrees.map(Tools.ToRadians),
    );
  }
  if (placement.scale) root.scaling.set(...placement.scale);
}

const defaultModels = runtimeAssetGroup("play/assets/dobuita/*.CHRM");
const defaultTextures = runtimeAssetGroup("play/assets/dobuita/*_textures.bin");

export async function readPlacementModelAssets(model, modelPlacements, signal, {
  bundledModels = defaultModels, bundledTextures = defaultTextures, fetchArrayBuffer = fetchAssetBuffer,
} = {}) {
  const assetFile = modelPlacements[0]?.assetFile;
  const texturePackFile = modelPlacements[0]?.texturePackFile;
  const modelUrl = assetFile
    ? bundledModels[`play/assets/dobuita/${assetFile}`]
    : null;
  const texturePackUrl = texturePackFile
    ? bundledTextures[`play/assets/dobuita/${texturePackFile}`]
    : null;
  if (assetFile && !modelUrl) {
    throw new Error(`Missing bundled Dobuita asset ${assetFile}.`);
  }
  if (texturePackFile && !texturePackUrl) {
    throw new Error(
      `Missing bundled Dobuita texture pack ${texturePackFile}.`,
    );
  }
  const [modelBuffer, primaryTexturePack] = await Promise.all([
    modelUrl ? fetchArrayBuffer(modelUrl, {signal})
      : fetchAsset(model).then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${model}`);
        return response.arrayBuffer();
      }),
    texturePackUrl
      ? fetchArrayBuffer(texturePackUrl, {signal})
      : getTexturePack(modelPlacements[0]?.texturePackModel || model),
  ]);
  const texturePack = await getStandaloneTexturePack(
    model,
    modelBuffer,
    primaryTexturePack,
  );
  signal?.throwIfAborted();
  return {modelBuffer, texturePack};
}

export function createPlacementModelLoader(scene, texturePack) {
  const loader = new Mt5Loader(scene);
  configureMt5TexturePack(loader, texturePack);
  return loader;
}

export function groupWorldPlacements(placements = []) {
  const groups = new Map();
  for (const placement of placements) {
    const rows = groups.get(placement.model) || [];
    rows.push(placement);
    groups.set(placement.model, rows);
  }
  return [...groups];
}

export function preparePlacementRoots(roots, placement, index, state) {
  // Register ownership before any consumer-specific callbacks can fail.
  state.currentMeshes.push(...roots);
  for (const root of roots) {
    root.name = `${root.name}_${placement.model}_${index}`;
    applyPlacementTransform(root, placement);
  }
  return roots;
}

export function placementInitiallyEnabled(placement, worldId, behavior = jomoObjectBehavior(
  placement.model, placement.runtime?.objectTag, placement.runtime,
)) {
  return behavior.initiallyEnabled !== false || Boolean(mapTransitionForObject({
    worldId, objectTag: placement.runtime?.objectTag, model: placement.model,
  }));
}
