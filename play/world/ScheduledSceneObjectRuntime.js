import * as BABYLON from "@babylonjs/core";
import {
  fetchAsset,
  getStandaloneTexturePack,
  getTexturePack,
} from "../../src/assetLoader.js";
import { Mt5Loader } from "../../src/Mt5Loader.js";
import sceneObjectManifest from "../data/shenmue1-scheduled-scene-objects.json" with {
  type: "json",
};
import {
  configureMt5TexturePack,
} from "../assets/configureMt5TexturePack.js";
import {
  ScheduledSceneObjectCatalog,
} from "./ScheduledSceneObjectCatalog.js";
import { ScheduledSceneObjectState } from "./ScheduledSceneObjectState.js";

const MAX_PARALLEL_LOADS = 6;

function applyPosition(root, definition, value) {
  root.position[definition.motion.axis] = value;
}

function configureRoot(root, definition, value) {
  root.name = `${root.name}_${definition.code}`;
  root._filename = definition.model;
  root._scheduledSceneObject = true;
  root._scheduledSceneObjectCode = definition.code;
  root.position.set(...definition.browserPosition);
  applyPosition(root, definition, value);
  root.rotationQuaternion = Mt5Loader.sourceOrderQuaternion(
    ...definition.browserRotationDegrees.map(BABYLON.Tools.ToRadians),
  );
  root.metadata = {
    ...(root.metadata || {}),
    scheduledSceneObject: {
      code: definition.code,
      id: definition.id,
      kind: definition.kind,
      accessAuthorization: "independent",
    },
  };
  for (const node of [root, ...root.getDescendants(false)]) {
    node.isPickable = false;
    node.checkCollisions = false;
    node.material?.freeze?.();
  }
}

export class ScheduledSceneObjectRuntime {
  constructor({
    scene,
    state,
    getGameDate,
    manifest = sceneObjectManifest,
  }) {
    this.scene = scene;
    this.state = state;
    this.getGameDate = getGameDate;
    this.manifest = manifest;
    this.catalog = new ScheduledSceneObjectCatalog(manifest);
    this.machine = null;
    this.entries = new Map();
    this.loadedWorldId = null;
  }

  workCount(worldId) {
    return this.catalog.workCount(worldId);
  }

  clear() {
    this.machine = null;
    this.entries.clear();
    this.loadedWorldId = null;
  }

  async load(worldId, onModelLoaded = null, signal = null) {
    this.clear();
    const definitions = this.catalog.definitions(worldId);
    if (definitions.length === 0) return;
    if (signal?.aborted) return;
    this.loadedWorldId = worldId;
    this.machine = new ScheduledSceneObjectState(
      definitions,
    );
    this.machine.synchronize(this.getGameDate(), { snap: true });

    let next = 0;
    const loadNext = async () => {
      while (next < definitions.length) {
        if (signal?.aborted) return;
        const definition = definitions[next++];
        const loaded = await this.loadDefinition(definition, signal);
        if (!loaded) return;
        onModelLoaded?.();
      }
    };
    await Promise.all(Array.from(
      { length: Math.min(MAX_PARALLEL_LOADS, definitions.length) },
      () => loadNext(),
    ));
  }

  async loadDefinition(definition, signal) {
    const [response, primaryTexturePack] = await Promise.all([
      fetchAsset(definition.model),
      getTexturePack(definition.model),
    ]);
    if (signal?.aborted) return false;
    if (!response.ok) {
      throw new Error(`Failed to load scheduled scene object ${definition.model}`);
    }
    const modelBuffer = await response.arrayBuffer();
    const texturePack = await getStandaloneTexturePack(
      definition.model,
      modelBuffer,
      primaryTexturePack,
    );
    if (signal?.aborted) return false;
    const loader = new Mt5Loader(this.scene);
    configureMt5TexturePack(loader, texturePack);
    const roots = await loader.load(modelBuffer, texturePack);
    if (signal?.aborted) {
      roots.forEach((root) => root.dispose());
      return false;
    }
    const current = this.machine.stateFor(definition.id);
    for (const root of roots) {
      configureRoot(root, definition, current.currentValue);
      this.state.currentMeshes.push(root);
    }
    this.entries.set(definition.id, { definition, roots });
    return true;
  }

  setScheduleVariants(variantsByActor) {
    if (!this.machine) return;
    this.machine.setScheduleVariants(variantsByActor, this.getGameDate());
    this.applyPositions();
  }

  update(deltaRealSeconds) {
    if (!this.machine || !this.loadedWorldId) return;
    this.machine.update(this.getGameDate(), deltaRealSeconds);
    this.applyPositions();
  }

  applyPositions() {
    for (const [id, entry] of this.entries) {
      const current = this.machine.stateFor(id);
      if (!current) continue;
      for (const root of entry.roots) {
        applyPosition(root, entry.definition, current.currentValue);
      }
    }
  }
}
