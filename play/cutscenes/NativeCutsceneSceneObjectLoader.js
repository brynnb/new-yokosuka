import { getStandaloneTexturePack, getTexturePack } from "../../src/assetLoader.js";
import { Mt5Loader } from "../../src/Mt5Loader.js";
import { configureMt5TexturePack } from "../assets/configureMt5TexturePack.js";

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
  return async ({ assetPath, browserFilename, textureAssetPath }) => {
    const [modelBuffer, configuredTexturePack] = await Promise.all([
      loadAsset(assetPath),
      textureAssetPath ? loadAsset(textureAssetPath) : Promise.resolve(null),
    ]);
    const texturePack = configuredTexturePack || await getStandaloneTexturePack(
      browserFilename,
      modelBuffer,
      await getTexturePack(browserFilename),
    );
    const loader = new Mt5Loader(scene);
    configureMt5TexturePack(loader, texturePack);
    const roots = await loader.load(modelBuffer, texturePack);
    for (const root of roots) root._filename = browserFilename;
    return roots;
  };
}
