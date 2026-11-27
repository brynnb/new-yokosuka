import { jomoObjectBehavior } from "../../src/JomoObjectRegistry.js";
import {
  mapTransitionForDoor,
  mapTransitionForObject,
} from "../../src/MapTransitions.js";
import {
  auditRuntimePlacementRoots,
  summarizeRuntimePlacementAudit,
} from "../../src/RuntimePlacementAudit.js";
import { readPlacementModelAssets, createPlacementModelLoader,
  groupWorldPlacements, preparePlacementRoots, placementInitiallyEnabled,
} from "../../src/rendering/WorldPlacementAssets.js";

function freezePlacedRoot(root, freezeWorldMatrices = true) {
  for (const node of [root, ...root.getDescendants(false)]) {
    node.computeWorldMatrix?.(true);
    if (freezeWorldMatrices) node.freezeWorldMatrix?.();
    // Prepared copies share materials (including with scenery). Binding must
    // still update for each copy's transform, lights and visibility.
    if (!root._preparedModelTemplate) node.material?.freeze?.();
  }
}

export { applyPlacementTransform } from "../../src/rendering/WorldPlacementAssets.js";

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

  async load(placements, onModelLoaded = null, worldId = null, {signal, preparedModels} = {}) {
    if (!placements?.length) return;
    const placedRoots = [];
    const placementAuditRecords = [];
    const groups = groupWorldPlacements(placements);
    let nextGroup = 0;
    const loadNextGroup = async () => {
      while (nextGroup < groups.length) {
        signal?.throwIfAborted();
        const [model, modelPlacements] = groups[nextGroup++];
        await this.loadModelGroup({
          model,
          modelPlacements,
          worldId,
          placedRoots,
          placementAuditRecords,
          signal, preparedModels,
        });
        onModelLoaded?.();
      }
    };
    const results = await Promise.allSettled(
      Array.from(
        { length: Math.min(6, groups.length) },
        () => loadNextGroup(),
      ),
    );
    // Drain all started assembly before the world owner can dispose resources.
    const failed = results.find(result => result.status === "rejected");
    if (failed) throw failed.reason;
    signal?.throwIfAborted();
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
    return readPlacementModelAssets(model, modelPlacements, signal, {
      bundledModels: this.bundledModels, bundledTextures: this.bundledTextures,
      fetchArrayBuffer: this.fetchArrayBuffer,
    });
  }

  async loadModelGroup({model, modelPlacements, worldId, placedRoots, placementAuditRecords, signal, preparedModels}) {
    const prepared = preparedModels?.hasModel(model);
    let modelBuffer, texturePack, placementLoader;
    if (!prepared) {
      ({modelBuffer, texturePack} = await this.readModelAssets(model, modelPlacements, signal));
      placementLoader = createPlacementModelLoader(this.scene, texturePack);
    }

    for (const [index, placement] of modelPlacements.entries()) {
      signal?.throwIfAborted();
      const roots = prepared ? preparedModels.instantiate(model) : await placementLoader.load(modelBuffer, texturePack);
      // Track ownership before registration so failed/cancelled assembly is
      // included in the normal world teardown too.
      preparePlacementRoots(roots, placement, index, this.state);
      signal?.throwIfAborted();
      const configuredRoots = [];
      for (const root of roots) {
        placedRoots.push(root);
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
        const doorTransition = mapTransitionForDoor({
          worldId,
          objectTag: placement.runtime?.objectTag,
          model,
          doorSelector: placement.runtime?.doorSelector,
        });
        if (placement.runtime?.nativeStaticTransition === true && !doorTransition) {
          throw new Error(
            `Missing static transition route for ${worldId}:${model}.`,
          );
        }
        if (doorTransition) {
          // Verified physical-door destinations apply to ordinary animated
          // doors too. Requiring the proxy-only flag sends those entrances
          // into old closed-check scripts whose dispatcher numbers are not
          // physical selectors (Russiya/selector 1 exposed this mismatch).
          this.setMetadata(root, "interactiveMapTransition", {
            root,
            transition: doorTransition,
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
        configuredRoots.push({ root, behavior, objectTransition });
      }

      placementAuditRecords.push(
        ...auditRuntimePlacementRoots(placement, roots),
      );
      for (const { root, behavior, objectTransition } of configuredRoots) {
        // A world travel target remains available during exploration even if
        // its model also participates in an authored cutscene (the harbor bus).
        // Cutscene-only props still follow their native initial visibility.
        if (!placementInitiallyEnabled(placement, worldId, behavior)) root.setEnabled(false);
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
      if (prepared) await new Promise(resolve => setTimeout(resolve, 0));
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
