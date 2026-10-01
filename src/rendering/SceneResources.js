import { Mt5Loader } from "../Mt5Loader.js";
import { Mt7Loader } from "../Mt7Loader.js";
import overlayManifest from "../../play/data/mt5-overlay-manifest.json" with { type: "json" };

// Material/texture policy is shared by full worlds and individual inspection.
// Cameras and application controls never enter this module.
export function createSceneLoaders(scene, { generateMipMaps = () => true } = {}) {
  return {
    loader: new Mt5Loader(scene, { overlayManifest, textureAddressMode: "repeat", generateMipMaps }),
    mt7Loader: new Mt7Loader(scene, { generateMipMaps }),
  };
}

export function freezeSceneRoots(roots) {
  // Freeze static transforms, not materials. Original model parts share
  // materials but still need per-mesh binding. Freezing them made unbatched
  // MT7 rooms render only the clear color after an MT5-to-MT7 scene switch.
  // Keep the same policy for both consumers; batching is a separate choice.
  for (const root of roots) {
    if (root._mt5CharacterRig || root._mt7CharacterGpuRig) continue;
    for (const node of [root, ...root.getDescendants(false)]) {
      node.computeWorldMatrix?.(true);
      node.freezeWorldMatrix?.();
    }
  }
}

export function clearWorldSceneAssets(state) {
  const materials = new Set();
  const textures = new Set(state.loader?.textureCache?.values?.() || []);
  const scenes = new Set();
  const visitMaterial = (material, visit) => {
    if (!material) return;
    visit(material);
    for (const child of material.subMaterials || []) visitMaterial(child, visit);
  };
  for (const root of state.currentMeshes) {
    if (root.getScene) scenes.add(root.getScene());
    for (const node of [root, ...(root.getDescendants?.(false) || [])]) {
      visitMaterial(node.material, material => {
        materials.add(material);
        for (const texture of material.getActiveTextures?.() || []) {
          if (!texture.isRenderTarget) textures.add(texture);
        }
      });
    }
    root.dispose(false, false);
  }
  state.currentMeshes = [];
  // This cleanup also handles a cancelled single-actor/model load. Materials
  // (notably NPC query materials) and textures can still belong to other live
  // roots. Release them only after their last mesh owner has gone, including
  // disabled models that are cached for a later schedule phase.
  for (const scene of scenes) {
    for (const mesh of scene.meshes) {
      visitMaterial(mesh.material, material => {
        materials.delete(material);
        for (const texture of material.getActiveTextures?.() || []) {
          textures.delete(texture);
        }
      });
    }
  }
  // MT5 resets its per-model caches between parses, so the last cache alone
  // cannot release a multi-model scene. Collect ownership from every root.
  for (const material of materials) material.dispose(false, false);
  for (const texture of textures) texture.dispose();
  state.loader?.textureCache?.clear?.();
  state.loader?.materialCache?.clear?.();
  state.mt7Loader?.clearCaches();
  // Geometry must be removed before clustered lights: Babylon otherwise
  // invalidates every remaining material once per light during teardown.
  state.sceneEnvironment?.clear();
}

export function clearWorldSceneBeforeLighting(state, nativeSceneLighting) {
  clearWorldSceneAssets(state);
  nativeSceneLighting.clear();
}
