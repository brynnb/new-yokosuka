import * as BABYLON from "@babylonjs/core";
import { fetchAsset, getTexturePack } from "../../src/assetLoader.js";
import { Mt5Loader } from "../../src/Mt5Loader.js";
import { RYO_RUNTIME_RIG } from "../../src/ShenmueRuntimeRig.js";
import {
  applyNpcControllerFamily,
  npcControllerFamilyForModel,
} from "./NpcControllerFamilies.js";
import {
  configureMt5TexturePack,
} from "../assets/configureMt5TexturePack.js";
import {
  prepareNativeClothModelSurfaces,
} from "./NativeClothModel.js";
import {
  nativeClothStateForModel,
} from "./NativeClothBabylonPresentation.js";

const FORKLIFT_ARM_RENDER_KEYS = Object.freeze([5, 6, 10, 11]);
const HUMANOID_ROOT_RENDER_KEY = 1;
const OPPOSITE_ARM_RENDER_KEY = new Map([
  [5, 10],
  [6, 11],
  [10, 5],
  [11, 6],
]);

function oppositeArmRenderKey(renderKey) {
  return OPPOSITE_ARM_RENDER_KEY.get(renderKey) ?? renderKey;
}

function nativeCharacterModelCode(character) {
  if (character?.modelCode) return character.modelCode;
  const match = String(character?.model || "")
    .toUpperCase()
    .match(/([A-Z0-9]{3}_[ML])(?=\.(?:CHRM|MT5)$)/u);
  return match?.[1] || null;
}

export class CharacterRuntime {
  constructor({
    scene,
    renderMatrixByKey,
    fetchArrayBuffer,
  }) {
    this.scene = scene;
    this.renderMatrixByKey = renderMatrixByKey;
    this.fetchArrayBuffer = fetchArrayBuffer;
    this.referenceBindByRenderKey = null;
    this.referenceParentByRenderKey = null;
    this.referenceLoader = null;
    this.referenceRoot = null;
    this.activeRetargetByRenderKey = new Map();
    this.activeForkliftArmRetargetProfile = null;
    this.presentationModels = new WeakMap();
    this.nativeClothStates = new WeakMap();
  }

  signedRenderKey(node) {
    const low16 = node.flag & 0xffff;
    return low16 >= 0x8000 ? low16 - 0x10000 : low16;
  }

  validateRenderRoutes(root, character) {
    const keys = new Set(
      (root?._mt5Nodes || []).map((node) => this.signedRenderKey(node)),
    );
    const missing = [...this.renderMatrixByKey.keys()].filter(
      (renderKey) => !keys.has(renderKey),
    );
    if (missing.length > 0 && !character.allowPartialRenderRoutes) {
      throw new Error(
        `${character.label} is missing playable render routes: ${
          missing.join(", ")
        }`,
      );
    }
  }

  hasRenderRoutes(root) {
    const keys = new Set(
      (root?._mt5Nodes || []).map((node) => this.signedRenderKey(node)),
    );
    return [...this.renderMatrixByKey.keys()].every(
      (renderKey) => keys.has(renderKey),
    );
  }

  renderMatrixRoutesForRoot(
    root,
    renderMatrixByKey = this.renderMatrixByKey,
  ) {
    const keys = new Set(
      (root?._mt5Nodes || []).map((node) => this.signedRenderKey(node)),
    );
    return new Map(
      [...renderMatrixByKey].filter(([renderKey]) => (
        keys.has(renderKey)
      )),
    );
  }

  nodeForRenderKey(root, renderKey) {
    const candidates = (root?._mt5Nodes || []).filter(
      (node) => this.signedRenderKey(node) === renderKey,
    );
    return candidates.find((node) => node.parentAddr) || candidates[0] || null;
  }

  captureBindMatrices(
    loader,
    root,
    renderMatrixByKey = this.renderMatrixByKey,
  ) {
    return new Map([...renderMatrixByKey.keys()].map((renderKey) => {
      const node = this.nodeForRenderKey(root, renderKey);
      if (!node) throw new Error(`Missing bind node for render key ${renderKey}`);
      return [renderKey, [...loader.sourceWorldMatrixForNode(node)]];
    }));
  }

  captureRenderParents(
    root,
    renderMatrixByKey = this.renderMatrixByKey,
  ) {
    const nodes = root?._mt5Nodes || [];
    const byAddress = new Map(nodes.map((node) => [node.addr, node]));
    const routedKeys = new Set(renderMatrixByKey.keys());
    return new Map([...routedKeys].map((renderKey) => {
      const node = this.nodeForRenderKey(root, renderKey);
      let parent = node ? byAddress.get(node.parentAddr) : null;
      while (parent) {
        const parentKey = this.signedRenderKey(parent);
        if (routedKeys.has(parentKey)) return [renderKey, parentKey];
        parent = byAddress.get(parent.parentAddr);
      }
      return [renderKey, null];
    }));
  }

  setReferenceBind(loader, root) {
    this.referenceLoader = loader;
    this.referenceRoot = root;
    this.referenceBindByRenderKey = this.captureBindMatrices(loader, root);
    this.referenceParentByRenderKey = this.captureRenderParents(root);
    return this.referenceBindByRenderKey;
  }

  authoredNodeLength(root, renderKey) {
    const node = this.nodeForRenderKey(root, renderKey);
    return node
      ? Math.hypot(node.pos.x, node.pos.y, node.pos.z)
      : null;
  }

  bindSpanLength(loader, root, renderKey, parentRenderKey) {
    const node = this.nodeForRenderKey(root, renderKey);
    const parent = this.nodeForRenderKey(root, parentRenderKey);
    if (!node || !parent) return null;
    const local = this.localMatrix(
      loader.sourceWorldMatrixForNode(node),
      loader.sourceWorldMatrixForNode(parent),
    );
    const { translation } = this.rotationFromMatrix(local);
    return translation.length();
  }

  buildHumanoidControlRig(
    loader,
    root,
    {
      modelCode = null,
      controllerFamily = null,
    } = {},
  ) {
    const family = controllerFamily
      || npcControllerFamilyForModel(modelCode);
    // Archive-local cutscene bodies can begin before a free-roam avatar has
    // supplied the proportional reference bind. Their embedded controller
    // family is still exact native data, and its own default positions are a
    // complete rig. Do not silently suppress authored motion (and the cloth
    // / secondary-motion inputs that consume it) merely because a gameplay
    // player has not yet been constructed.
    if (!this.referenceLoader || !this.referenceRoot) {
      if (!family) return null;
      const native = applyNpcControllerFamily(
        RYO_RUNTIME_RIG,
        this.renderMatrixByKey,
        family,
      );
      const signature = native.rig
        .map((control) => control.defaultPosition
          .map((value) => value.toFixed(5))
          .join(","))
        .join("|");
      return {
        rig: native.rig,
        renderMatrixByKey: native.renderMatrixByKey,
        signature: `${family.id}:authored-unscaled:${signature}`,
        controllerFamily: family.id,
        proportions: Object.freeze({
          overall: 1,
          torso: 1,
          rightHip: 1,
          leftHip: 1,
          rightThigh: 1,
          leftThigh: 1,
          rightShin: 1,
          leftShin: 1,
          rightUpperArm: 1,
          leftUpperArm: 1,
          rightForearm: 1,
          leftForearm: 1,
        }),
      };
    }

    const ratios = new Map();
    const safeRatio = (target, reference, fallback = 1) => (
      Number.isFinite(target)
      && Number.isFinite(reference)
      && target > 1e-6
      && reference > 1e-6
        ? target / reference
        : fallback
    );
    const nodeRatio = (renderKey, fallback = 1) => safeRatio(
      this.authoredNodeLength(root, renderKey),
      this.authoredNodeLength(this.referenceRoot, renderKey),
      fallback,
    );
    const spanRatio = (renderKey, parentRenderKey, fallback = 1) => safeRatio(
      this.bindSpanLength(loader, root, renderKey, parentRenderKey),
      this.bindSpanLength(
        this.referenceLoader,
        this.referenceRoot,
        renderKey,
        parentRenderKey,
      ),
      fallback,
    );

    const rightHip = spanRatio(16, 14);
    const leftHip = spanRatio(21, 14, rightHip);
    const rightThigh = nodeRatio(17);
    const leftThigh = nodeRatio(22, rightThigh);
    const rightShin = nodeRatio(18, rightThigh);
    const leftShin = nodeRatio(23, rightShin);
    const rightFoot = nodeRatio(19, rightShin);
    const leftFoot = nodeRatio(24, leftShin);
    const leftShoulder = spanRatio(10, 1);
    const rightShoulder = spanRatio(5, 1, leftShoulder);
    const leftUpperArm = nodeRatio(11);
    const rightUpperArm = nodeRatio(6, leftUpperArm);
    const leftForearm = spanRatio(-66, 11, leftUpperArm);
    const rightForearm = spanRatio(-65, 6, rightUpperArm);
    const torso = spanRatio(-67, 1);
    const overall = (
      rightHip
      + leftHip
      + rightThigh
      + leftThigh
      + rightShin
      + leftShin
      + torso
    ) / 7;

    for (const index of [4, 5]) ratios.set(index, rightHip);
    for (const index of [11, 12]) ratios.set(index, leftHip);
    ratios.set(7, rightThigh);
    ratios.set(8, rightShin);
    ratios.set(10, rightFoot);
    ratios.set(14, leftThigh);
    ratios.set(15, leftShin);
    ratios.set(17, leftFoot);
    ratios.set(20, torso);
    ratios.set(23, torso);
    for (const index of [25, 26]) ratios.set(index, leftShoulder);
    ratios.set(28, leftUpperArm);
    ratios.set(29, leftForearm);
    for (const index of [31, 32]) ratios.set(index, rightShoulder);
    ratios.set(34, rightUpperArm);
    ratios.set(35, rightForearm);
    ratios.set(0, overall);
    ratios.set(3, overall);

    const rig = RYO_RUNTIME_RIG.map((template) => {
      const ratio = ratios.get(template.index) ?? 1;
      return Object.freeze({
        ...template,
        defaultPosition: Object.freeze(
          template.defaultPosition.map((value) => value * ratio),
        ),
      });
    });
    const native = applyNpcControllerFamily(
      Object.freeze(rig),
      this.renderMatrixByKey,
      family,
    );
    const signature = native.rig
      .map((control) => control.defaultPosition
        .map((value) => value.toFixed(5))
        .join(","))
      .join("|");
    return {
      rig: native.rig,
      renderMatrixByKey: native.renderMatrixByKey,
      signature: `${family?.id || "canonical"}:${signature}`,
      controllerFamily: family?.id || null,
      proportions: Object.freeze({
        overall,
        torso,
        rightHip,
        leftHip,
        rightThigh,
        leftThigh,
        rightShin,
        leftShin,
        rightUpperArm,
        leftUpperArm,
        rightForearm,
        leftForearm,
      }),
    };
  }

  buildLocalRetargetProfile(loader, root) {
    if (!this.referenceBindByRenderKey || !this.referenceParentByRenderKey) {
      return null;
    }
    return {
      targetBindByRenderKey: this.captureBindMatrices(loader, root),
      targetParentByRenderKey: this.captureRenderParents(root),
    };
  }

  buildMirroredForkliftArmRetargetProfile(loader, root) {
    const targetProfile = this.buildLocalRetargetProfile(loader, root);
    if (!targetProfile) return null;
    const sourceBindByRenderKey = new Map();
    const sourceParentByRenderKey = new Map();
    for (const renderKey of targetProfile.targetBindByRenderKey.keys()) {
      const sourceKey = oppositeArmRenderKey(renderKey);
      sourceBindByRenderKey.set(
        renderKey,
        this.referenceBindByRenderKey.get(sourceKey),
      );
      const sourceParent = this.referenceParentByRenderKey.get(sourceKey);
      sourceParentByRenderKey.set(
        renderKey,
        sourceParent === null ? null : oppositeArmRenderKey(sourceParent),
      );
    }
    return {
      ...targetProfile,
      sourceBindByRenderKey,
      sourceParentByRenderKey,
    };
  }

  buildHumanoidRetargetProfile(
    loader,
    root,
    runtimeRig,
    renderMatrixByKey = this.renderMatrixByKey,
  ) {
    if (!runtimeRig) return null;
    const targetBindByRenderKey = this.captureBindMatrices(
      loader,
      root,
      renderMatrixByKey,
    );
    const targetParentByRenderKey = this.captureRenderParents(
      root,
      renderMatrixByKey,
    );
    return {
      // NPC MOTN controls use the same signed render-key contract as CHRM.
      // Interpret their local rotation output against this actor's authored
      // bind pose, then retain the same pose's translations and scale.
      sourceBindByRenderKey: targetBindByRenderKey,
      sourceParentByRenderKey: targetParentByRenderKey,
      targetBindByRenderKey,
      targetParentByRenderKey,
    };
  }

  inverseAffineRow(matrix) {
    return [...BABYLON.Matrix.FromArray(matrix).invert().asArray()];
  }

  localMatrix(world, parentWorld) {
    return parentWorld
      ? Mt5Loader.rowMultiply(world, this.inverseAffineRow(parentWorld))
      : [...world];
  }

  rotationFromMatrix(matrix) {
    const scaling = BABYLON.Vector3.One();
    const rotation = BABYLON.Quaternion.Identity();
    const translation = BABYLON.Vector3.Zero();
    BABYLON.Matrix.FromArray(matrix).decompose(
      scaling,
      rotation,
      translation,
    );
    return { scaling, rotation, translation };
  }

  retargetLocally(
    routedMatrices,
    profile,
    { preserveRootTranslation = false } = {},
  ) {
    if (!profile) return new Map();
    const output = new Map();
    const visiting = new Set();
    const build = (renderKey) => {
      if (output.has(renderKey)) return output.get(renderKey);
      if (visiting.has(renderKey)) {
        throw new Error(`Cyclic character render route at ${renderKey}.`);
      }
      visiting.add(renderKey);

      const sourceAnimatedWorld = routedMatrices.get(renderKey);
      const sourceBindWorld = (
        profile.sourceBindByRenderKey
        || this.referenceBindByRenderKey
      )?.get(renderKey);
      const targetBindWorld = profile.targetBindByRenderKey.get(renderKey);
      if (!sourceAnimatedWorld || !sourceBindWorld || !targetBindWorld) {
        visiting.delete(renderKey);
        return null;
      }

      const sourceParentKey = (
        profile.sourceParentByRenderKey
        || this.referenceParentByRenderKey
      )?.get(renderKey);
      const targetParentKey = profile.targetParentByRenderKey.get(renderKey);
      const sourceAnimatedParent = sourceParentKey === null
        ? null
        : routedMatrices.get(sourceParentKey);
      const sourceBindParent = sourceParentKey === null
        ? null
        : (
          profile.sourceBindByRenderKey
          || this.referenceBindByRenderKey
        )?.get(sourceParentKey);
      const targetBindParent = targetParentKey === null
        ? null
        : profile.targetBindByRenderKey.get(targetParentKey);
      const targetAnimatedParent = targetParentKey === null
        ? null
        : build(targetParentKey);

      const sourceAnimatedLocal = this.localMatrix(
        sourceAnimatedWorld,
        sourceAnimatedParent,
      );
      const sourceBindLocal = this.localMatrix(
        sourceBindWorld,
        sourceBindParent,
      );
      const targetBindLocal = this.localMatrix(
        targetBindWorld,
        targetBindParent,
      );
      const sourceAnimated = this.rotationFromMatrix(sourceAnimatedLocal);
      const sourceBind = this.rotationFromMatrix(sourceBindLocal);
      const targetBind = this.rotationFromMatrix(targetBindLocal);

      // Transfer only the rotation delta. The target CHRM's local translation
      // and scale are its authored bone lengths; replacing them with Ryo's
      // world-space joint positions is what stretches dissimilar NPC rigs.
      const rotationDelta = sourceAnimated.rotation.multiply(
        sourceBind.rotation.conjugate(),
      );
      const targetRotation = rotationDelta.multiply(targetBind.rotation);
      const targetTranslation = (
        preserveRootTranslation
        && targetParentKey === null
      )
        ? targetBind.translation.add(
          sourceAnimated.translation.subtract(sourceBind.translation),
        )
        : targetBind.translation;
      const targetAnimatedLocal = [
        ...BABYLON.Matrix.Compose(
          targetBind.scaling,
          targetRotation,
          targetTranslation,
        ).asArray(),
      ];
      const targetAnimatedWorld = targetAnimatedParent
        ? Mt5Loader.rowMultiply(
          targetAnimatedLocal,
          targetAnimatedParent,
        )
        : targetAnimatedLocal;
      output.set(renderKey, targetAnimatedWorld);
      visiting.delete(renderKey);
      return targetAnimatedWorld;
    };

    for (const renderKey of profile.targetBindByRenderKey.keys()) {
      build(renderKey);
    }
    return output;
  }

  buildRetargetMatrices(loader, root) {
    if (!this.referenceBindByRenderKey) return new Map();
    const authoredRoutes = this.renderMatrixRoutesForRoot(root);
    const targetBind = this.captureBindMatrices(
      loader,
      root,
      authoredRoutes,
    );
    return new Map([...authoredRoutes.keys()].map((renderKey) => {
      const reference = this.referenceBindByRenderKey.get(renderKey);
      const target = targetBind.get(renderKey);
      return [
        renderKey,
        Mt5Loader.rowMultiply(Mt5Loader.inverseRigidRow(reference), target),
      ];
    }));
  }

  modelForwardYawOffset(retargetByRenderKey) {
    const rootCorrection = retargetByRenderKey.get(HUMANOID_ROOT_RENDER_KEY);
    if (!rootCorrection) return 0;
    const [forwardX, , forwardZ] = Mt5Loader.transformRowVector(
      [0, 0, 1],
      rootCorrection,
    );
    if (
      !Number.isFinite(forwardX)
      || !Number.isFinite(forwardZ)
      || Math.hypot(forwardX, forwardZ) < 1e-6
    ) {
      return 0;
    }
    // Some native CHRM skeletons are authored with their humanoid root facing
    // opposite Ryo. Derive that basis difference from the same bind-pose
    // correction used for animation retargeting, rather than maintaining a
    // model-specific orientation exception list.
    return Math.atan2(forwardX, forwardZ);
  }

  retargetWithMap(routedMatrices, retargetByRenderKey) {
    if (retargetByRenderKey.size === 0) return routedMatrices;
    return new Map([...routedMatrices].map(([renderKey, matrix]) => {
      const correction = retargetByRenderKey.get(renderKey);
      return [
        renderKey,
        correction ? Mt5Loader.rowMultiply(matrix, correction) : matrix,
      ];
    }));
  }

  retarget(routedMatrices) {
    return this.retargetWithMap(
      routedMatrices,
      this.activeRetargetByRenderKey,
    );
  }

  retargetMirroredForkliftArms(
    routedMatrices,
    retargetByRenderKey = this.activeRetargetByRenderKey,
    profile = this.activeForkliftArmRetargetProfile,
  ) {
    const retargeted = this.retargetWithMap(
      routedMatrices,
      retargetByRenderKey,
    );
    if (!profile) return retargeted;
    const mirroredRoutes = new Map([...routedMatrices].map(
      ([renderKey, matrix]) => [
        renderKey,
        routedMatrices.get(oppositeArmRenderKey(renderKey)) || matrix,
      ],
    ));
    const locallyRetargeted = this.retargetLocally(mirroredRoutes, profile);
    for (const renderKey of FORKLIFT_ARM_RENDER_KEYS) {
      const matrix = locallyRetargeted.get(renderKey);
      if (matrix) retargeted.set(renderKey, matrix);
    }
    return retargeted;
  }

  suppressDetachedVariants(root, character) {
    const hiddenRootKeys = new Set(character.hiddenRootRenderKeys || []);
    const hiddenKeys = new Set(character.hiddenRenderKeys || []);
    if (hiddenRootKeys.size === 0 && hiddenKeys.size === 0) return;
    for (const node of root?._mt5Nodes || []) {
      const renderKey = this.signedRenderKey(node);
      if (
        hiddenKeys.has(renderKey)
        || (!node.parentAddr && hiddenRootKeys.has(renderKey))
      ) {
        node.mesh?.setEnabled(false);
      }
    }
  }

  isolateRenderKeys(root, renderKeys) {
    const visibleKeys = new Set(renderKeys || []);
    for (const node of root?._mt5Nodes || []) {
      node.mesh?.setEnabled(visibleKeys.has(this.signedRenderKey(node)));
    }
  }

  setOutdoorFootwear(root, enabled) {
    const footwear = root?._mt5OutdoorFootwear;
    if (!footwear) return false;
    const footwearKeys = new Set(footwear.renderKeys);
    for (const node of root._mt5Nodes || []) {
      if (footwearKeys.has(this.signedRenderKey(node))) {
        node.mesh?.setEnabled(!enabled);
      }
    }
    footwear.root.setEnabled(enabled);
    return true;
  }

  applyCharacterRigWorldMatrices(loader, root, routedMatrices) {
    loader.applyCharacterRigWorldMatrices(root, routedMatrices);
    const footwear = root?._mt5OutdoorFootwear;
    if (footwear) {
      footwear.loader.applyCharacterRigWorldMatrices(
        footwear.root,
        routedMatrices,
      );
    }
  }

  presentationModel(loader, renderRoot, actorRoot = renderRoot) {
    const model = this.presentationModels.get(renderRoot);
    if (!model || model.loader !== loader) return null;
    model.root = actorRoot;
    return model;
  }

  updateNativeCloth(renderRoot, deltaSeconds) {
    const model = this.presentationModels.get(renderRoot);
    if (!model || renderRoot?.isEnabled?.() === false) return false;
    let state = this.nativeClothStates.get(renderRoot);
    if (!state) {
      state = nativeClothStateForModel(model);
      this.nativeClothStates.set(renderRoot, state);
    }
    if (!state.active) return false;
    state.update(deltaSeconds);
    return true;
  }

  async prefetch(character, signal) {
    await Promise.all([
      character.modelUrl
        ? this.fetchArrayBuffer(character.modelUrl, {signal})
        : fetchAsset(character.model),
      character.texturePackUrl
        ? this.fetchArrayBuffer(character.texturePackUrl, {signal})
        : character.texturePackModel ? getTexturePack(character.texturePackModel) : null,
      character.outdoorFootwear
        ? this.prefetch({...character, ...character.outdoorFootwear, outdoorFootwear: null}, signal)
        : null,
    ]);
    signal?.throwIfAborted();
  }

  async createModel(character) {
    const [modelBuffer, texturePack] = await Promise.all([
      character.modelUrl
        ? this.fetchArrayBuffer(character.modelUrl)
        : fetchAsset(character.model).then(
          (response) => response.arrayBuffer(),
        ),
      character.texturePackUrl
        ? this.fetchArrayBuffer(character.texturePackUrl)
        : character.texturePackModel
          ? getTexturePack(character.texturePackModel)
          : null,
    ]);
    const loader = new Mt5Loader(this.scene, {
      backFaceCulling: character.backFaceCulling ?? false,
      ryoHeadAtlasFix: character.ryoHeadAtlasFix,
      ryoHeadAtlasMode: character.ryoHeadAtlasFix ? "obj-raw" : "native",
      mirrorCharacterX: true,
      nativeTwiddledRectUV: character.nativeTwiddledRectUV ?? false,
      // Character sheets are atlases, not tiled surfaces. Several faces and
      // Ryo's shirt reach exact 0/1 UV borders, where repeat filtering samples
      // the unrelated opposite edge and draws a vertical center seam.
      textureAddressMode: "clamp",
      characterRigMode: "baked",
      characterRigSeamMode: "weld",
      materialSideOrientation: character.clockwiseCulling
        ? BABYLON.Material.ClockWiseSideOrientation
        : null,
    });
    if (texturePack) configureMt5TexturePack(loader, texturePack);
    const [root] = await loader.load(modelBuffer, texturePack);
    if (!root) {
      throw new Error(
        `${character.label} did not produce a renderable character model.`,
      );
    }
    prepareNativeClothModelSurfaces(root);
    try {
      this.validateRenderRoutes(root, character);
      this.suppressDetachedVariants(root, character);
      if (character.outdoorFootwear) {
        const outdoorCharacter = {
          ...character,
          ...character.outdoorFootwear,
          outdoorFootwear: null,
        };
        const outdoor = await this.createModel(outdoorCharacter);
        this.isolateRenderKeys(
          outdoor.root,
          character.outdoorFootwear.renderKeys,
        );
        outdoor.root.parent = root;
        root._mt5OutdoorFootwear = {
          ...outdoor,
          renderKeys: [...character.outdoorFootwear.renderKeys],
        };
        this.setOutdoorFootwear(root, false);
      }
    } catch (error) {
      root.dispose(false, true);
      throw error;
    }
    const presentationModel = {
      root,
      loader,
      renderRoot: root,
      modelCode: nativeCharacterModelCode(character),
      characterAssetFormat: "MT5",
    };
    this.presentationModels.set(root, presentationModel);
    root.onDisposeObservable?.addOnce(() => {
      this.nativeClothStates.get(root)?.release();
      this.nativeClothStates.delete(root);
      this.presentationModels.delete(root);
    });
    return { loader, root, presentationModel };
  }

  minimumWorldY(root) {
    let minimumY = Infinity;
    for (const node of [root, ...root.getDescendants(false)]) {
      if (!node.isEnabled()) continue;
      node.computeWorldMatrix(true);
      if (
        typeof node.getBoundingInfo !== "function"
        || typeof node.getTotalVertices !== "function"
        || node.getTotalVertices() <= 0
      ) {
        continue;
      }
      node.refreshBoundingInfo();
      node.computeWorldMatrix(true);
      minimumY = Math.min(
        minimumY,
        node.getBoundingInfo().boundingBox.minimumWorld.y,
      );
    }
    return minimumY;
  }
}
