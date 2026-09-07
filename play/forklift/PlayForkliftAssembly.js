import { DEFAULT_FORKLIFT_OPTIONS } from "../../src/ForkliftRig.js";
import { ForkliftCargoRuntime } from "./ForkliftCargoRuntime.js";
import { ForkliftController } from "./ForkliftController.js";
import { ForkliftEffects } from "./ForkliftEffects.js";
import { ForkliftFleet } from "./ForkliftFleet.js";
import { ForkliftModeRuntime } from "./ForkliftModeRuntime.js";
import { ForkliftNetworkRuntime } from "./ForkliftNetworkRuntime.js";
import {
  DEFAULT_FORKLIFT_TUNING_CONTROLS,
  forkliftPhysicsTuningFromControls,
} from "./ForkliftTuningControls.js";
import { FORKLIFT_ID_PATTERN } from "../config/forklifts.js";

export class PlayForkliftAssembly {
  constructor({
    scene,
    sceneState,
    raceWorld,
    race,
    getWorld,
    isSwitchingWorld,
    getClient,
    getRemotePlayers,
    getController,
    getMobileLiftInput,
    getInputSnapshot,
    pickWorldWithRay,
    actorRoot,
    chassisPose,
    modelOffset,
    sounds,
    syncMode,
    markPresenceDirty,
    publishPresence,
    persistLocation,
  }) {
    this.getWorld = getWorld;
    this.vehicleController = new ForkliftController({
      getController,
      getMobileLiftInput,
      getInputSnapshot,
    });
    this.effects = new ForkliftEffects(scene, { pickWithRay: pickWorldWithRay });
    this.fleetRuntime = new ForkliftFleet({
      scene,
      state: sceneState,
      effects: this.effects,
      getWorld,
      setParked: (entry, parked) => this.setParked(entry, parked),
    });
    this.fleet = this.fleetRuntime.entries;
    this.cargo = new ForkliftCargoRuntime({
      scene,
      state: sceneState,
      getWorld,
      getMultiplayerClient: getClient,
      quaternionFromNetworkState: (...args) => (
        this.quaternionFromNetworkState(...args)
      ),
      pickWithRay: pickWorldWithRay,
    });
    this.network = new ForkliftNetworkRuntime({
      fleetRuntime: this.fleetRuntime,
      idPattern: FORKLIFT_ID_PATTERN,
      getRemotePlayers,
      getClient,
      getWorldId: () => getWorld().id,
      isLocallyDriving: () => this.mode.driving,
      getActiveId: () => this.mode.activeId,
      setParked: (entry, parked) => this.setParked(entry, parked),
      pickWorldWithRay,
      modelOrientationQuaternion: (...args) => (
        this.modelOrientationQuaternion(...args)
      ),
      quaternionFromNetworkState: (...args) => (
        this.quaternionFromNetworkState(...args)
      ),
      exitLocalForklift: () => this.mode.exit(),
      onLocalOwnershipLost: () => this.mode.onLocalOwnershipLost(),
    });
    this.mode = new ForkliftModeRuntime({
      raceWorld,
      race,
      fleetRuntime: this.fleetRuntime,
      getWorld,
      isSwitchingWorld,
      getClient,
      availableForLocalEntry: entry => this.network.availableForLocalEntry(entry),
      applyServerState: state => this.network.applyServerState(state),
      network: this.network,
      setParked: (entry, parked) => this.setParked(entry, parked),
      orientationQuaternion: (...args) => this.orientationQuaternion(...args),
      physicsTuning: forkliftPhysicsTuningFromControls(
        DEFAULT_FORKLIFT_TUNING_CONTROLS,
      ),
      actorRoot,
      chassisPose,
      getCargo: () => this.cargo,
      getController,
      modelOffset,
      sounds,
      effects: this.effects,
      syncMode,
      markPresenceDirty,
      vehicleController: this.vehicleController,
      publishPresence,
      persistLocation,
    });
  }

  setParked(entry, parked) {
    for (const node of [entry.root, ...entry.root.getDescendants(false)]) {
      const renderable = (
        typeof node.getTotalVertices === "function"
        && node.getTotalVertices() > 0
      );
      node.isPickable = parked && renderable;
      node.checkCollisions = false;
      node.metadata = {
        ...(node.metadata || {}),
        playerVehicle: !parked,
        interactiveForklift: parked ? entry : null,
        forkliftId: entry.id,
      };
    }
  }

  orientationQuaternion(yaw, chassisState) {
    return this.mode.orientationFor(yaw, chassisState);
  }

  modelOrientationQuaternion(yaw, chassisState) {
    return this.mode.modelOrientationFor(yaw, chassisState);
  }

  quaternionFromNetworkState(state, yaw = 0, prefix = "") {
    return this.vehicleController.quaternionFromNetworkState(
      state,
      yaw,
      prefix,
    );
  }

  chassisTiltFromOrientation(orientation) {
    return this.vehicleController.chassisTiltFromOrientation(orientation);
  }

  modelForId(id, world = this.getWorld()) {
    return this.fleetRuntime.modelForId(id, world);
  }

  get maximumLift() {
    return DEFAULT_FORKLIFT_OPTIONS.maximumLift;
  }
}
