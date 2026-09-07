import * as BABYLON from "@babylonjs/core";
import {
  fetchAsset,
  getStandaloneTexturePack,
  getTexturePack,
} from "../../src/assetLoader.js";
import { jomoObjectBehavior } from "../../src/JomoObjectRegistry.js";
import {
  mapTransitionForDoor,
  mapTransitionForObject,
} from "../../src/MapTransitions.js";
import { Mt5Loader } from "../../src/Mt5Loader.js";
import {
  auditRuntimePlacementRoots,
  summarizeRuntimePlacementAudit,
} from "../../src/RuntimePlacementAudit.js";
import {
  configureMt5TexturePack,
} from "../assets/configureMt5TexturePack.js";

function freezePlacedRoot(root, freezeWorldMatrices = true) {
  for (const node of [root, ...root.getDescendants(false)]) {
    node.computeWorldMatrix?.(true);
    if (freezeWorldMatrices) node.freezeWorldMatrix?.();
    node.material?.freeze?.();
  }
}

export class PlacementRuntime {
  constructor({
    scene,
    state,
    bundledModels,
    bundledTextures,
    fetchArrayBuffer,
    setMetadata,
    drawerInteractions,
    doorInteractions,
    clockInteractions,
    inspectableInteractions,
    vendingInteractions,
    authMovementRuntime,
    preparePlacedRoots,
    localDebug = false,
  }) {
    this.scene = scene;
    this.state = state;
    this.bundledModels = bundledModels;
    this.bundledTextures = bundledTextures;
    this.fetchArrayBuffer = fetchArrayBuffer;
    this.setMetadata = setMetadata;
    this.drawerInteractions = drawerInteractions;
    this.doorInteractions = doorInteractions;
    this.clockInteractions = clockInteractions;
    this.inspectableInteractions = inspectableInteractions;
    this.vendingInteractions = vendingInteractions;
    this.authMovementRuntime = authMovementRuntime;
    this.preparePlacedRoots = preparePlacedRoots;
    this.localDebug = localDebug;
  }

  async load(placements, onModelLoaded = null, worldId = null) {
    if (!placements?.length) return;
    const placedRoots = [];
    const placementAuditRecords = [];
    const placementsByModel = new Map();
    for (const placement of placements) {
      const modelPlacements = placementsByModel.get(placement.model) || [];
      modelPlacements.push(placement);
      placementsByModel.set(placement.model, modelPlacements);
    }

    const groups = [...placementsByModel];
    let nextGroup = 0;
    const loadNextGroup = async () => {
      while (nextGroup < groups.length) {
        const [model, modelPlacements] = groups[nextGroup++];
        await this.loadModelGroup({
          model,
          modelPlacements,
          worldId,
          placedRoots,
          placementAuditRecords,
        });
        onModelLoaded?.();
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(6, groups.length) },
        () => loadNextGroup(),
      ),
    );
    this.doorInteractions.resolvePairedSlidingPanels();
    await this.authMovementRuntime.register(placedRoots);
    const placementAudit = summarizeRuntimePlacementAudit(
      placements,
      placementAuditRecords,
    );
    if (this.localDebug) {
      window.__NEW_YOKOSUKA_PLACEMENT_AUDIT__ = placementAudit;
    }
    if (placementAudit.status !== "verified") {
      console.error("Runtime placement audit failed.", placementAudit);
      throw new Error(
        `Failed to instantiate ${placementAudit.failedRecordCount} `
        + "placed object(s).",
      );
    }
    await this.preparePlacedRoots(placedRoots);
    this.drawerInteractions.attachContainedObjects(placedRoots);
  }

  async prefetch(placements, signal) {
    const models = new Map((placements || []).map(row => [row.model, row]));
    await Promise.all([...models].map(([model, row]) => (
      this.readModelAssets(model, [row], signal)
    )));
  }

  async readModelAssets(model, modelPlacements, signal) {
    const assetFile = modelPlacements[0]?.assetFile;
    const texturePackFile = modelPlacements[0]?.texturePackFile;
    const modelUrl = assetFile
      ? this.bundledModels[`play/assets/dobuita/${assetFile}`]
      : null;
    const texturePackUrl = texturePackFile
      ? this.bundledTextures[`play/assets/dobuita/${texturePackFile}`]
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
      modelUrl ? this.fetchArrayBuffer(modelUrl, {signal})
        : fetchAsset(model).then(response => response.arrayBuffer()),
      texturePackUrl
        ? this.fetchArrayBuffer(texturePackUrl, {signal})
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

  async loadModelGroup({model, modelPlacements, worldId, placedRoots, placementAuditRecords}) {
    const {modelBuffer, texturePack} = await this.readModelAssets(model, modelPlacements);
    const placementLoader = new Mt5Loader(this.scene);
    configureMt5TexturePack(placementLoader, texturePack);

    for (const [index, placement] of modelPlacements.entries()) {
      const roots = await placementLoader.load(modelBuffer, texturePack);
      const configuredRoots = [];
      for (const root of roots) {
        root.name = `${root.name}_${model}_${index}`;
        root._filename = model;
        root._runtimePlacement = true;
        root._runtimePlacementRecord = placement;
        placedRoots.push(root);
        root.position.set(...placement.position);
        if (placement.rotationDegrees) {
          root.rotationQuaternion = Mt5Loader.sourceOrderQuaternion(
            ...placement.rotationDegrees.map(BABYLON.Tools.ToRadians),
          );
        }
        if (placement.scale) root.scaling.set(...placement.scale);
        this.setMetadata(root, "runtimeObject", {
          root,
          model,
          objectTag: placement.runtime?.objectTag || null,
          callbackAddress: placement.runtime?.callbackAddress || null,
        });
        const objectTransition = mapTransitionForObject({
          worldId,
          objectTag: placement.runtime?.objectTag,
          model,
        });
        if (objectTransition) {
          this.setMetadata(root, "interactiveMapTransition", {
            root,
            transition: objectTransition,
          });
        }
        if (placement.runtime?.nativeStaticTransition === true) {
          const staticDoorTransition = mapTransitionForDoor({
            worldId,
            objectTag: placement.runtime?.objectTag,
            model,
            doorSelector: placement.runtime?.doorSelector,
          });
          if (!staticDoorTransition) {
            throw new Error(
              `Missing static transition route for ${worldId}:${model}.`,
            );
          }
          this.setMetadata(root, "interactiveMapTransition", {
            root,
            transition: staticDoorTransition,
          });
        }
        const behavior = jomoObjectBehavior(
          model,
          placement.runtime?.objectTag,
          placement.runtime,
        );
        const registeredBehavior = this.registerBehavior(
          root,
          placement,
          behavior,
          worldId,
        );
        if (
          behavior.kind !== "none"
          && behavior.kind !== "passive-anchor"
          && behavior.kind !== "passive-transition-anchor"
          && behavior.kind !== "passive-scenery"
          && behavior.kind !== "state-dependent-cutscene-prop"
          && !registeredBehavior
        ) {
          throw new Error(
            `${model} could not register ${behavior.kind} behavior.`,
          );
        }
        this.inspectableInteractions.registerAmbient(root, behavior);
        configuredRoots.push({ root, behavior });
      }

      placementAuditRecords.push(
        ...auditRuntimePlacementRoots(placement, roots),
      );
      for (const { root, behavior } of configuredRoots) {
        if (behavior.initiallyEnabled === false) root.setEnabled(false);
        freezePlacedRoot(
          root,
          (
            behavior.kind === "none"
            || behavior.kind === "passive-anchor"
            || behavior.kind === "passive-scenery"
            || behavior.kind === "state-dependent-cutscene-prop"
          )
            && !placement.runtime?.authoredMovementFile,
        );
      }
      this.state.currentMeshes.push(...roots);
    }
  }

  registerBehavior(root, placement, behavior, worldId) {
    switch (behavior.kind) {
      case "drawer":
        return this.drawerInteractions.register(
          root,
          placement,
          behavior.travel,
        );
      case "hinged-door":
        return this.doorInteractions.registerHinged(root, placement);
      case "paired-sliding-panel":
        return this.doorInteractions.registerPairedSlidingPanel(
          root,
          placement,
          behavior,
        );
      case "sliding-door":
        return this.doorInteractions.registerSliding(root, placement);
      case "exterior-transition-door":
        return this.doorInteractions.registerExteriorTransition(
          root,
          placement,
          behavior,
        );
      case "d000-door":
        return this.doorInteractions.registerD000(root, placement, behavior);
      case "swing-door":
        return this.doorInteractions.registerSwing(root, placement, behavior);
      case "alarm-clock":
        return this.clockInteractions.register(root, placement);
      case "inspect":
        return this.inspectableInteractions.register(
          root,
          placement,
          behavior.label,
          behavior.interactionEmoteId,
        );
      case "vending-machine":
        return this.vendingInteractions.register(root, placement, worldId);
      default:
        return null;
    }
  }
}
