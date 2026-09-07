import {
  fetchAsset,
  fetchShenmue2Catalog,
} from "../../src/assetLoader.js";
import {
  LoadAssetContainerAsync,
} from "@babylonjs/core/Loading/sceneLoader.js";
import { loadMt5Scene, loadMt7Scene } from "../../src/rendering/SceneAssets.js";
import { createGlobalWater } from "../../src/GlobalWater.js";
import { resolveSceneComposition } from "../../src/SceneCompositions.js";
import {
  prepareWorldCollision,
} from "./WorldCollision.js";
import {
  createNativeWorldCollision,
  loadNativeCollisionDefinitionForWorld,
} from "./NativeWorldCollision.js";
import {
  createWorldSpatialIndex,
} from "../../src/rendering/SceneSpatialIndex.js";
import { shenmue2WorldSceneRecords } from "./Shenmue2SceneRecords.js";
import { worldLoadWorkCount } from "./WorldLoadProgress.js";
import { assetContainerTopLevelNodes } from "./GlbWorld.js";
import { clearWorldSceneAssets, freezeSceneRoots } from "../../src/rendering/SceneResources.js";

export class WorldLoadCancelledError extends Error {
  constructor() {
    super("World load was superseded.");
    this.name = "WorldLoadCancelledError";
  }
}

function ensureActive(signal) {
  if (signal?.aborted) throw new WorldLoadCancelledError();
}

export class WorldLoader {
  constructor({
    scene,
    state,
    placementRuntime,
    scheduledActors,
    scheduledSceneObjects = null,
    onProgress = () => {},
    beforePlacements = () => {},
    afterPlacements = () => {},
  }) {
    this.scene = scene;
    this.state = state;
    this.placementRuntime = placementRuntime;
    this.scheduledActors = scheduledActors;
    this.scheduledSceneObjects = scheduledSceneObjects;
    this.onProgress = onProgress;
    this.beforePlacements = beforePlacements;
    this.afterPlacements = afterPlacements;
  }

  workCount(world, scheduledActorDefinitions, postLoadUnits = 1) {
    return worldLoadWorkCount(
      world,
      scheduledActorDefinitions,
      postLoadUnits,
    ) + (this.scheduledSceneObjects?.workCount(world.id) || 0);
  }

  async loadGlbScene({
    world,
    additionalProgressTotal,
    signal,
    onProgress,
  }) {
    const loadId = ++this.state.currentLoadId;
    const cancelled = () => (
      signal?.aborted || loadId !== this.state.currentLoadId
    );
    clearWorldSceneAssets(this.state);
    this.state.singleModelMode = false;
    this.state.currentZone = world.assetArea || world.id;
    this.state.currentScenePrefix = null;
    onProgress({ loaded: 0, total: additionalProgressTotal + 1 });

    await import("@babylonjs/loaders/glTF/index.js");
    ensureActive(signal);
    const container = await LoadAssetContainerAsync(
      world.assetUrl,
      this.scene,
      { pluginExtension: ".glb" },
    );
    if (cancelled()) {
      container.dispose();
      return false;
    }
    container.addAllToScene();
    // Babylon's glTF loader stores its generated `__root__` conversion node
    // in container.meshes rather than container.rootNodes. Discover roots
    // across every node collection so scale and collision metadata propagate
    // through the actual imported hierarchy.
    const roots = assetContainerTopLevelNodes(container);
    for (const root of roots) {
      if (Number.isFinite(world.assetScale) && world.assetScale > 0) {
        root.scaling.scaleInPlace(world.assetScale);
      }
      root._filename = world.assetFilename || world.assetUrl;
      root.metadata = {
        ...(root.metadata || {}),
        customWorldGeometry: true,
      };
      freezeSceneRoots([root]);
      this.state.currentMeshes.push(root);
    }
    onProgress({ loaded: 1, total: additionalProgressTotal + 1 });
    return roots.length > 0;
  }

  async loadShenmue2Scene({world, additionalProgressTotal, signal, onProgress}) {
    const catalog = await fetchShenmue2Catalog();
    ensureActive(signal);
    const records = shenmue2WorldSceneRecords(catalog, world);
    if (!records.some(record => record.kind === "MAPM")) {
      throw new Error(`${world.label} has no staged MT7 map geometry.`);
    }
    return loadMt7Scene(this.state, records, {
      additionalProgressTotal, signal, onProgress, batchStatic: true,
    });
  }

  async load({
    world,
    scheduledActorDefinitions,
    postLoadUnits = 1,
    environment = null,
    signal = null,
  }) {
    ensureActive(signal);
    // Start independent I/O while resident geometry is loading. Only the
    // existing ordered stages below may attach anything to the Babylon scene.
    // Capture rejection immediately, including if geometry fails first.
    const capture = promise => Promise.resolve(promise).then(
      value => ({value}), error => ({error}),
    );
    const prefetchController = new AbortController();
    const prefetchSignal = signal
      ? AbortSignal.any([signal, prefetchController.signal]) : prefetchController.signal;
    const placementData = capture(this.placementRuntime.prefetch?.(world.placements, prefetchSignal));
    const actorData = capture(this.scheduledActors.prefetch?.(scheduledActorDefinitions, world.id, prefetchSignal));
    const collisionData = capture(loadNativeCollisionDefinitionForWorld(world));
    try {
      if (!["MT7", "GLB"].includes(world.assetFormat)) {
        const response = await fetchAsset("models.json");
        ensureActive(signal);
        this.state.allFiles = await response.json();
        ensureActive(signal);
        this.state.mt5Files = this.state.allFiles.filter((filename) => (
          filename.toLowerCase().endsWith(".mt5")
        ));
      }

      const additionalProgressTotal = this.workCount(
        world,
        scheduledActorDefinitions,
        postLoadUnits,
      );
      const progress = {
        completed: 0,
        total: additionalProgressTotal,
        report: () => this.onProgress(progress.completed, progress.total),
        advance: (amount = 1) => {
          progress.completed += amount;
          progress.report();
        },
      };
      const composition = world.sceneComposition
        ? resolveSceneComposition(world.sceneComposition, {
          timeOfDayIndex: this.state.currentTimeOfDay,
          season: environment?.season,
          seasonIndex: environment?.seasonIndex,
          weather: environment?.weather,
          weatherIndex: environment?.weatherIndex,
        }, {
          includeInactiveVariants: (
            world.loadInactiveEnvironmentVariants !== false
          ),
        })
        : null;
      const onSceneProgress = (sceneProgress) => {
        progress.completed = sceneProgress.loaded;
        progress.total = sceneProgress.total;
        progress.report();
      };
      const sceneLoaded = world.assetFormat === "MT7"
        ? await this.loadShenmue2Scene({
            world,
            additionalProgressTotal,
            signal,
            onProgress: onSceneProgress,
          })
        : world.assetFormat === "GLB"
          ? await this.loadGlbScene({
              world,
              additionalProgressTotal,
              signal,
              onProgress: onSceneProgress,
            })
          : await loadMt5Scene(this.state, world.prefix, {
            filenames: composition?.filenames,
            includeFile: composition ? null : world.includeFile,
            includeHiddenVariants: world.loadInactiveEnvironmentVariants !== false,
            timeOfDayIndex: composition?.context?.timeOfDayIndex,
            variantProfile: composition?.variantProfile || world.variantProfile,
            variantZone: composition?.source,
            suppressStatus: true,
            additionalProgressTotal,
            signal,
            onProgress: onSceneProgress,
          });
      if (!sceneLoaded) throw new WorldLoadCancelledError();
      ensureActive(signal);
      if (this.state.currentMeshes.length === 0) {
        throw new Error(`${world.label} geometry did not load.`);
      }

      await this.beforePlacements(world, this.state.currentMeshes);
      ensureActive(signal);
      const placementResult = await placementData;
      if (placementResult.error) throw placementResult.error;
      await this.placementRuntime.load(
        world.placements,
        () => progress.advance(),
        world.id,
      );
      ensureActive(signal);
      await this.scheduledSceneObjects?.load(
        world.id,
        () => progress.advance(),
        signal,
      );
      ensureActive(signal);
      await this.afterPlacements(world, this.state.currentMeshes);
      ensureActive(signal);
      this.state.isInteriorScene = (
        world.interior === true && world.skyExposure !== "outdoor"
      );
      const actorResult = await actorData;
      if (actorResult.error) throw actorResult.error;
      await this.scheduledActors.load(
        scheduledActorDefinitions,
        () => progress.advance(),
        world.id,
        signal,
      );
      ensureActive(signal);
      const collisionResult = await collisionData;
      if (collisionResult.error) throw collisionResult.error;
      const nativeCollisionDefinition = collisionResult.value;
      if (world.requireNativeCollision && !nativeCollisionDefinition) {
        throw new Error(`${world.label} requires its Disc ${world.collisionDisc} native collision data.`);
      }
      ensureActive(signal);
      prepareWorldCollision(this.state.currentMeshes, {
        interior: world.interior === true,
        nativeHorizontalCollision: Boolean(nativeCollisionDefinition),
      });
      if (nativeCollisionDefinition) {
        createNativeWorldCollision({
          scene: this.scene,
          currentMeshes: this.state.currentMeshes,
          definition: nativeCollisionDefinition,
        });
      }
      const raycastIndex = createWorldSpatialIndex(
        this.scene,
        this.state.currentMeshes,
      );

      return {
        composition,
        progress,
        raycastIndex,
        water: Number.isFinite(world.waterHeight)
          ? createGlobalWater(this.scene, { height: world.waterHeight })
          : null,
      };
    } finally {
      prefetchController.abort();
    }
  }
}
