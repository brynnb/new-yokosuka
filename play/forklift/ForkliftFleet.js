import * as BABYLON from "@babylonjs/core";
import { fetchAsset, getTexturePack } from "../../src/assetLoader.js";
import {
  createForkliftChassisState,
} from "../../src/ForkliftChassisDynamics.js";
import {
  ForkliftRig,
  createForkliftState,
} from "../../src/ForkliftRig.js";
import { Mt5Loader } from "../../src/Mt5Loader.js";
import {
  FORKLIFT_ID_PATTERN,
  FORKLIFT_MODEL,
} from "../config/forklifts.js";
import {
  configureMt5TexturePack,
} from "../assets/configureMt5TexturePack.js";

export class ForkliftFleet {
  constructor({
    scene,
    state,
    effects,
    getWorld,
    setParked,
  }) {
    this.scene = scene;
    this.state = state;
    this.effects = effects;
    this.getWorld = getWorld;
    this.setParked = setParked;
    this.entries = new Map();
    this.loads = new Map();
    this.snapshotWorldId = null;
    this.snapshotIds = new Set();
  }

  modelForId(id, world = this.getWorld()) {
    return world?.forkliftSpawns?.find((spawn) => spawn.id === id)?.model
      || (
        world?.id === "ma00race"
          ? world.forkliftSpawns?.at(-1)?.model
          : null
      )
      || FORKLIFT_MODEL;
  }

  createEntry({ id, root, yaw }) {
    const rig = new ForkliftRig(root);
    const entry = {
      id,
      root,
      rig,
      state: createForkliftState(),
      chassisState: createForkliftChassisState(),
      yaw,
      coasting: false,
      networkAccumulator: 0,
      fadeRemaining: 0,
      networkTarget: null,
      networkOwnerId: "",
      righting: null,
      collisionDisabledUntilMs: 0,
      exhaustSmoke: this.effects.createExhaustSmoke(
        root,
        rig,
        `forklift_${id}`,
      ),
      physicsLinearVelocity: BABYLON.Vector3.Zero(),
      physicsAngularVelocity: BABYLON.Vector3.Zero(),
    };
    rig.apply(entry.state);
    this.entries.set(id, entry);
    this.state.currentMeshes.push(root);
    return entry;
  }

  async loadModel(model, id, yaw) {
    const [response, texturePack] = await Promise.all([
      fetchAsset(model),
      getTexturePack(model),
    ]);
    const loader = new Mt5Loader(this.scene, { backFaceCulling: false });
    configureMt5TexturePack(loader, texturePack);
    const [root] = await loader.load(
      await response.arrayBuffer(),
      texturePack,
    );
    if (!root) throw new Error(`${model} did not produce a forklift.`);
    root.name = `forklift_${id}`;
    root._filename = model;
    try {
      return this.createEntry({ id, root, yaw });
    } catch (error) {
      root.dispose(false, true);
      throw error;
    }
  }

  async ensureServerEntry(serverState) {
    const world = this.getWorld();
    if (
      !FORKLIFT_ID_PATTERN.test(serverState?.id)
      || serverState.worldId !== world.id
      || this.snapshotWorldId !== world.id
      || !this.snapshotIds.has(serverState.id)
    ) {
      return null;
    }
    if (this.entries.has(serverState.id)) {
      return this.entries.get(serverState.id);
    }
    if (this.loads.has(serverState.id)) return this.loads.get(serverState.id);
    const worldAtStart = world.id;
    const promise = this.loadModel(
      this.modelForId(serverState.id, world),
      serverState.id,
      Number(serverState.yaw) || 0,
    ).then((entry) => {
      if (
        this.getWorld().id === worldAtStart
        && this.snapshotWorldId === worldAtStart
        && this.snapshotIds.has(serverState.id)
      ) {
        this.setParked(entry, true);
        return entry;
      }
      this.removeEntry(entry);
      return null;
    }).finally(() => {
      this.loads.delete(serverState.id);
    });
    this.loads.set(serverState.id, promise);
    return promise;
  }

  replaceServerSnapshot(serverStates) {
    const worldId = this.getWorld().id;
    const acceptedStates = (serverStates || []).filter((serverState) => (
      FORKLIFT_ID_PATTERN.test(serverState?.id)
      && serverState.worldId === worldId
    ));
    this.snapshotWorldId = worldId;
    this.snapshotIds = new Set(acceptedStates.map(({ id }) => id));
    for (const entry of [...this.entries.values()]) {
      if (!this.snapshotIds.has(entry.id)) this.removeEntry(entry);
    }
    return acceptedStates;
  }

  acceptServerState(serverState) {
    if (
      this.snapshotWorldId !== this.getWorld().id
      || serverState?.worldId !== this.snapshotWorldId
      || !FORKLIFT_ID_PATTERN.test(serverState.id)
    ) {
      return false;
    }
    this.snapshotIds.add(serverState.id);
    return true;
  }

  removeServerId(id) {
    this.snapshotIds.delete(id);
  }

  clearServerSnapshot() {
    this.snapshotWorldId = null;
    this.snapshotIds.clear();
  }

  removeEntry(entry) {
    if (!entry) return;
    this.state.currentMeshes = this.state.currentMeshes.filter(
      (mesh) => mesh !== entry.root,
    );
    entry.exhaustSmoke?.dispose();
    entry.root.dispose(false, true);
    this.entries.delete(entry.id);
  }

  dispose() {
    this.effects.disposeTireMarks();
    for (const entry of [...this.entries.values()]) this.removeEntry(entry);
    this.loads.clear();
    this.clearServerSnapshot();
  }
}
