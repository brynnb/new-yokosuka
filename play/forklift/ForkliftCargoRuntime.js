import * as BABYLON from "@babylonjs/core";
import { fetchAsset, getTexturePack } from "../../src/assetLoader.js";
import { ForkliftCargoPhysics } from "../../src/ForkliftCargoPhysics.js";
import { Mt5Loader } from "../../src/Mt5Loader.js";
import {
  FORKLIFT_CRATE_MODEL,
  FORKLIFT_CRATE_SCALE,
  FORKLIFT_PLAYGROUND_CARGO_SPAWN,
} from "../config/forklifts.js";
import {
  configureMt5TexturePack,
} from "../assets/configureMt5TexturePack.js";

export class ForkliftCargoRuntime {
  constructor({
    scene,
    state,
    getWorld,
    getMultiplayerClient,
    quaternionFromNetworkState,
    pickWithRay = null,
  }) {
    this.scene = scene;
    this.state = state;
    this.getWorld = getWorld;
    this.getMultiplayerClient = getMultiplayerClient;
    this.quaternionFromNetworkState = quaternionFromNetworkState;
    this.pickWithRay = pickWithRay
      || ((...args) => this.scene.pickWithRay(...args));
    this.physics = null;
    this.asset = null;
    this.entryLoads = new Map();
    this.serverStates = new Map();
    this.removedIds = new Set();
    this.snapshotWorldId = null;
    this.snapshotIds = new Set();
  }

  async getAsset() {
    if (this.asset) return this.asset;
    const [response, texturePack] = await Promise.all([
      fetchAsset(FORKLIFT_CRATE_MODEL),
      getTexturePack(FORKLIFT_CRATE_MODEL),
    ]);
    this.asset = {
      buffer: await response.arrayBuffer(),
      texturePack,
    };
    return this.asset;
  }

  async instantiate(cargoState) {
    const cargoId = cargoState?.id;
    if (!cargoId || !this.physics || this.removedIds.has(cargoId)) {
      return null;
    }
    if (this.physics.entries.has(cargoId)) {
      this.physics.applyServerState(cargoState);
      return this.physics.entries.get(cargoId);
    }
    if (this.entryLoads.has(cargoId)) return this.entryLoads.get(cargoId);
    const manager = this.physics;
    const load = this.loadEntry(manager, cargoId, cargoState).finally(() => {
      this.entryLoads.delete(cargoId);
    });
    this.entryLoads.set(cargoId, load);
    return load;
  }

  async loadEntry(manager, cargoId, cargoState) {
    const { buffer, texturePack } = await this.getAsset();
    const loader = new Mt5Loader(this.scene);
    configureMt5TexturePack(loader, texturePack);
    const [root] = await loader.load(buffer.slice(0), texturePack);
    if (!root) {
      throw new Error(`${FORKLIFT_CRATE_MODEL} did not produce a crate.`);
    }
    if (this.physics !== manager || this.removedIds.has(cargoId)) {
      root.dispose(false, true);
      return null;
    }
    root.name = `forklift_job_crate_${cargoId}`;
    root._filename = FORKLIFT_CRATE_MODEL;
    root.scaling.setAll(FORKLIFT_CRATE_SCALE);
    const latestState = this.serverStates.get(cargoId) || cargoState;
    const world = this.getWorld();
    const cargoSpawn = world.cargoSpawn
      || world.spawn
      || FORKLIFT_PLAYGROUND_CARGO_SPAWN;
    const x = Number.isFinite(latestState?.x)
      ? latestState.x
      : cargoSpawn.x;
    const z = Number.isFinite(latestState?.z)
      ? latestState.z
      : cargoSpawn.z;
    const terrainHit = this.pickWithRay(
      new BABYLON.Ray(
        new BABYLON.Vector3(x, cargoSpawn.y + 10, z),
        BABYLON.Vector3.Down(),
        30,
      ),
      (mesh) => mesh.isEnabled() && mesh.metadata?.terrain === true,
    );
    const groundY = terrainHit?.pickedPoint?.y ?? cargoSpawn.y;
    root.position.setAll(0);
    root.rotationQuaternion = BABYLON.Quaternion.Identity();
    root.computeWorldMatrix(true);
    const neutralBounds = root.getHierarchyBoundingVectors(true);
    const dimensions = neutralBounds.max.subtract(neutralBounds.min);
    root.position.set(
      x,
      Number.isFinite(latestState?.y)
        ? latestState.y
        : groundY + dimensions.y / 2,
      z,
    );
    root.rotationQuaternion = this.quaternionFromNetworkState(latestState);
    for (const node of [root, ...root.getDescendants(false)]) {
      if (
        typeof node.getTotalVertices !== "function"
        || node.getTotalVertices() <= 0
      ) {
        continue;
      }
      node.isPickable = true;
      node.checkCollisions = false;
      node.metadata = {
        ...(node.metadata || {}),
        cameraBlocker: true,
        forkliftCargo: true,
        sourceModel: FORKLIFT_CRATE_MODEL,
      };
    }
    this.state.currentMeshes.push(root);
    const entry = manager.addCargo({
      id: cargoId,
      visualRoot: root,
      dimensions,
      position: root.position.clone(),
      orientation: root.rotationQuaternion.clone(),
      state: latestState,
    });
    manager.applyServerState(this.serverStates.get(cargoId) || latestState);
    return entry;
  }

  async load() {
    const world = this.getWorld();
    const cargoSpawn = world.cargoSpawn
      || world.spawn
      || FORKLIFT_PLAYGROUND_CARGO_SPAWN;
    const terrainHit = this.pickWithRay(
      new BABYLON.Ray(
        new BABYLON.Vector3(
          cargoSpawn.x,
          cargoSpawn.y + 10,
          cargoSpawn.z,
        ),
        BABYLON.Vector3.Down(),
        30,
      ),
      (mesh) => mesh.isEnabled() && mesh.metadata?.terrain === true,
    );
    const groundY = terrainHit?.pickedPoint?.y ?? cargoSpawn.y;
    this.physics = await ForkliftCargoPhysics.create(this.scene, {
      groundY,
      pickWithRay: this.pickWithRay,
      localPlayerId: () => (
        this.getMultiplayerClient()?.identity?.id || null
      ),
      onClaim: (id) => (
        this.getMultiplayerClient()?.claimCargo(id) || false
      ),
      onUpdate: (cargoState, options) => (
        this.getMultiplayerClient()?.sendCargoUpdate(cargoState, options)
        || false
      ),
    });
    this.physics.addStaticTerrain(
      this.scene.meshes.filter((mesh) => (
        mesh.metadata?.terrain === true
        || (
          mesh.checkCollisions
          && mesh.metadata?.playerVehicle !== true
          && mesh.metadata?.controllerCollider !== true
        )
      )),
    );
    if (world.cargoEnabled === false) return;
  }

  applyServerState(cargo) {
    const worldId = this.getWorld().id;
    if (
      !cargo?.id
      || cargo.worldId !== worldId
      || this.snapshotWorldId !== worldId
    ) return;
    this.snapshotIds.add(cargo.id);
    this.removedIds.delete(cargo.id);
    this.serverStates.set(cargo.id, cargo);
    if (this.physics?.applyServerState(cargo)) return;
    if (this.physics && cargo.worldId === this.getWorld().id) {
      this.instantiate(cargo).catch((error) => {
        console.error(`[Cargo] ${cargo.id} could not be loaded.`, error);
      });
    }
  }

  removeServerCargo(cargoId) {
    if (!cargoId) return;
    this.snapshotIds.delete(cargoId);
    this.removedIds.add(cargoId);
    this.serverStates.delete(cargoId);
    this.entryLoads.delete(cargoId);
    const entry = this.physics?.removeCargo(cargoId);
    if (entry?.visualRoot) {
      this.state.currentMeshes = this.state.currentMeshes.filter(
        (mesh) => mesh !== entry.visualRoot,
      );
    }
  }

  replaceServerSnapshot(cargoStates) {
    const worldId = this.getWorld().id;
    const acceptedStates = (cargoStates || []).filter(
      (cargo) => cargo?.id && cargo.worldId === worldId,
    );
    const nextIds = new Set(acceptedStates.map(({ id }) => id));
    this.snapshotWorldId = worldId;
    this.snapshotIds = nextIds;
    for (const [id, state] of [...this.serverStates.entries()]) {
      if (state.worldId === worldId && !nextIds.has(id)) {
        this.removeServerCargo(id);
      }
    }
    for (const cargo of acceptedStates) this.applyServerState(cargo);
  }

  clearWorld() {
    this.entryLoads.clear();
    this.physics?.dispose();
    this.physics = null;
    // Havok remains compiled and attached for instant reuse, but an
    // interrupted/world-changing client must never leave the empty physics
    // world stepping until the next gameplay tick.
    if (this.scene) this.scene.physicsEnabled = false;
    this.snapshotWorldId = null;
    this.snapshotIds.clear();
  }

  handleDisconnect() {
    this.snapshotWorldId = null;
    this.snapshotIds.clear();
    this.physics?.handleDisconnect();
  }
}
