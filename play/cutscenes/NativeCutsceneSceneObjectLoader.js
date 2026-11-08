import { getStandaloneTexturePack, getTexturePack } from "../../src/assetLoader.js";
import { Mt5Loader } from "../../src/Mt5Loader.js";
import { Color3, Constants, TransformNode } from "@babylonjs/core";
import { configureMt5TexturePack } from "../assets/configureMt5TexturePack.js";

// Some original translucent effects are light overlays rather than surfaces
// illuminated by the world. Their original blend controller is not decoded;
// this explicit package-owned style is a reviewed visual approximation.
export function configureNativeSceneObjectEffect(roots, style) {
  if (style == null) return;
  if (style !== "unlit-additive") throw new Error(`Unknown scene object visual style ${style}`);
  for (const root of roots) for (const mesh of root.getChildMeshes()) {
    const material = mesh.material;
    if (!material) continue;
    material.disableLighting = true;
    material.emissiveColor = Color3.White();
    material.alphaMode = Constants.ALPHA_ADD;
    material.disableDepthWrite = true;
  }
}

/**
 * Instantiates package-owned scene objects through the same MT5 texture
 * resolution path as ordinary standalone world props. Package ownership is
 * explicit: these roots are disposed when the cutscene package releases the
 * world and never enter global placement state.
 */
export function createNativeCutsceneSceneObjectLoader({ scene, loadAsset } = {}) {
  if (!scene || typeof loadAsset !== "function") {
    throw new TypeError("cutscene scene-object loader dependencies are incomplete");
  }
  return async ({ actorTag, referenceOnly, assetPath, browserFilename, textureAssetPath, includeUntexturedGeometry, visualStyle }) => {
    // Explicit non-rendered references still need owned transforms for AUTH
    // movement/camera cues. This is an authored choice, never a missing-asset fallback.
    if (referenceOnly) {
      const root = new TransformNode(`auth-reference-${actorTag}`, scene);
      root._filename = browserFilename;
      return [root];
    }
    const [modelBuffer, configuredTexturePack] = await Promise.all([
      loadAsset(assetPath),
      textureAssetPath ? loadAsset(textureAssetPath) : Promise.resolve(null),
    ]);
    const texturePack = configuredTexturePack || await getStandaloneTexturePack(
      browserFilename,
      modelBuffer,
      await getTexturePack(browserFilename),
    );
    const loader = new Mt5Loader(scene, { includeUntexturedGeometry });
    configureMt5TexturePack(loader, texturePack);
    const roots = await loader.load(modelBuffer, texturePack);
    configureNativeSceneObjectEffect(roots, visualStyle);
    for (const root of roots) root._filename = browserFilename;
    return roots;
  };
}
