import * as BABYLON from "@babylonjs/core";
import {
  fetchAsset,
  getStandaloneTexturePack,
  getTexturePack,
} from "../../src/assetLoader.js";
import {
  loadNativeCharacterModel,
  nativeCharacterGroundOffset,
  nativeCharacterModelScale,
} from "../characters/NativeCharacterModelLoader.js";

/** Instantiates one archive-local character variant with normal actor shape. */
export function createNativeCutsceneCharacterLoader({ scene, loadAsset } = {}) {
  if (!scene || typeof loadAsset !== "function") {
    throw new TypeError("cutscene character loader dependencies are incomplete");
  }
  return async (definition) => {
    const [modelBuffer, configuredTexturePack] = await Promise.all([
      definition.assetPath
        ? loadAsset(definition.assetPath)
        : fetchAsset(definition.browserFilename).then(response => response.arrayBuffer()),
      definition.textureAssetPath
        ? loadAsset(definition.textureAssetPath)
        : Promise.resolve(null),
    ]);
    const texturePack = configuredTexturePack || await getStandaloneTexturePack(
      definition.browserFilename,
      modelBuffer,
      await getTexturePack(definition.browserFilename),
    );
    const { loader, renderRoot } = await loadNativeCharacterModel({
      scene,
      modelBuffer,
      texturePack,
      sourceFilename: definition.browserFilename,
      assetFormat: definition.assetFormat,
    });
    const scale = (
      nativeCharacterModelScale(definition.modelCode)
      * definition.characterScale
    );
    const root = new BABYLON.TransformNode(
      `native_cutscene_actor_${definition.actorTag}`,
      scene,
    );
    renderRoot.parent = root;
    root.scaling.setAll(scale);
    root._filename = definition.browserFilename;
    root.metadata = {
      nativeCutsceneActor: definition.actorTag,
      nativeCutsceneActorLabel: definition.label,
      nativeCutsceneActorModelCode: definition.modelCode,
      scheduledActorGroundOffset: nativeCharacterGroundOffset(renderRoot) * scale,
    };
    for (const node of root.getDescendants(false)) {
      node.isPickable = false;
      node.checkCollisions = false;
      node.metadata = {
        ...(node.metadata || {}),
        cameraBlocker: false,
        nativeCutsceneActor: definition.actorTag,
      };
    }
    root.setEnabled(false);
    return Object.freeze({
      actorCode: definition.actorTag,
      root,
      model: {
        actorCode: definition.actorTag,
        modelCode: definition.modelCode,
        modelVariantIndex: 0,
        loader,
        root,
        renderRoot,
        standingRenderPosition: renderRoot.position.clone(),
        localRetargetProfile: null,
        renderMeshes: renderRoot.getChildMeshes(false),
        skeletalAnimation: true,
        characterAssetFormat: definition.assetFormat,
        nativeClothRuntimeMode: definition.nativeClothRuntimeMode,
        nativeSecondaryMotionRuntimeMode:
          definition.nativeSecondaryMotionRuntimeMode,
        animatedScale: 1,
        motionTranslationScale: 1,
      },
    });
  };
}
