import { Mt5Loader } from "../../src/Mt5Loader.js";
import { Mt7Loader } from "../../src/Mt7Loader.js";
import { configureMt5TexturePack } from "../assets/configureMt5TexturePack.js";
import {
  prepareNativeClothModelSurfaces,
  signedMt5NodeType,
} from "./NativeClothModel.js";
import { characterModelBindScaleCorrection } from "./CharacterModelCorrections.js";

function suppressRootRenderKeys(root, renderKeys) {
  const hidden = new Set(renderKeys);
  for (const node of root?._mt5Nodes || []) {
    if (!node.parentAddr && hidden.has(signedMt5NodeType(node))) {
      node.mesh?.setEnabled(false);
    }
  }
}

export function nativeCharacterModelScale(modelCode, { animated = false } = {}) {
  return animated ? 1 : characterModelBindScaleCorrection(modelCode);
}

export function nativeCharacterMinimumWorldY(root, { refresh = true } = {}) {
  let minimumY = Infinity;
  for (const node of [root, ...root.getDescendants(false)]) {
    if (
      !node.isEnabled()
      || typeof node.getBoundingInfo !== "function"
      || typeof node.getTotalVertices !== "function"
      || node.getTotalVertices() <= 0
    ) continue;
    node.computeWorldMatrix(true);
    if (refresh) node.refreshBoundingInfo();
    node.computeWorldMatrix(true);
    minimumY = Math.min(
      minimumY,
      node.getBoundingInfo().boundingBox.minimumWorld.y,
    );
  }
  return minimumY;
}

export function nativeCharacterGroundOffset(root, clearance = 0.003) {
  const minimumY = nativeCharacterMinimumWorldY(root);
  return Number.isFinite(minimumY) ? -minimumY + clearance : 0;
}

/**
 * Loads and prepares one native HUMANS character body for GPU-rig playback.
 * Actor ownership, placement, schedule state, and package lifetime deliberately
 * remain outside this module so normal NPCs and archive-local cutscene variants
 * share the exact same mesh preparation without sharing policy.
 */
export async function loadNativeCharacterModel({
  scene,
  modelBuffer,
  texturePack,
  sourceFilename,
  assetFormat = "MT5",
} = {}) {
  if (
    !scene
    || !(modelBuffer instanceof ArrayBuffer)
    || typeof sourceFilename !== "string"
    || !sourceFilename.trim()
    || !["MT5", "MT7"].includes(assetFormat)
  ) {
    throw new TypeError("native character model loader inputs are incomplete");
  }
  const isMt7 = assetFormat === "MT7";
  const loader = isMt7
    ? new Mt7Loader(scene, { characterRigSeamMode: "weld" })
    : new Mt5Loader(scene, {
        // Native HUMANS surfaces include deliberately two-sided pieces. Cloth
        // preparation isolates exterior/lining pairs and restores their authored
        // culling after the body has loaded.
        backFaceCulling: false,
        mirrorCharacterX: true,
        nativeTwiddledRectUV: true,
        textureAddressMode: "clamp",
        characterRigMode: "gpu",
        characterRigSeamMode: "weld",
        materialSideOrientation: null,
      });
  if (!isMt7) configureMt5TexturePack(loader, texturePack);
  const [renderRoot] = await loader.load(modelBuffer, texturePack, {
    sourceFilename,
  });
  if (!renderRoot) {
    throw new Error(`${sourceFilename} did not produce a native character model`);
  }
  let clothSurfaces = Object.freeze({ preservedRenderKeys: Object.freeze([]) });
  if (isMt7) {
    loader.mergeCharacterGpuRigMeshes(renderRoot);
  } else {
    clothSurfaces = prepareNativeClothModelSurfaces(renderRoot);
    // The signed node type lives in flag's low 16 bits, not mesh metadata.
    // Detached -68 nodes are the closed/open morph sources. Hide them before
    // batching so their spare jaw geometry is not permanently merged into
    // the visible body. The attached -68 destination must remain renderable.
    suppressRootRenderKeys(renderRoot, [-0x44]);
    loader.invalidateCharacterRigSourceBounds(renderRoot);
    loader.updateCharacterGpuBoundingInfo(
      renderRoot,
      loader.characterRigBoundsForWorldMatrices(renderRoot, null),
    );
    loader.mergeCharacterGpuRigMeshes(renderRoot, {
      preserveRenderKeySubtrees: [
        -0x43,
        -0x42,
        -0x41,
        ...clothSurfaces.preservedRenderKeys,
      ],
    });
  }
  return Object.freeze({ loader, renderRoot, clothSurfaces });
}
