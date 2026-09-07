import * as BABYLON from "@babylonjs/core";
import {
  FORKLIFT_RACE_CHECKPOINTS,
  ForkliftRaceSession,
  formatRaceTime,
  readForkliftRaceBest,
  saveForkliftRaceBest,
} from "../../src/ForkliftRace.js";

export class ForkliftRaceRuntime {
  constructor({
    scene,
    dom,
    worldId = "ma00race",
    getWorldId,
    getActorPosition,
    setMovementLocked,
    addWorldMesh,
  }) {
    this.scene = scene;
    this.dom = dom;
    this.worldId = worldId;
    this.getWorldId = getWorldId;
    this.getActorPosition = getActorPosition;
    this.setMovementLocked = setMovementLocked;
    this.addWorldMesh = addWorldMesh;
    this.session = new ForkliftRaceSession();
    this.best = readForkliftRaceBest();
    this.marker = null;
  }

  prepare() {
    this.session.abort();
    this.setMovementLocked(false);
    this.marker = null;
    this.dom.raceHud.hidden = this.getWorldId() !== this.worldId;
    this.dom.raceStart.hidden = false;
    this.dom.raceTiming.hidden = true;
    this.dom.raceRestart.hidden = true;
    this.dom.raceQuit.hidden = true;
    this.dom.raceCountdown.hidden = true;
    this.dom.raceCheckpoints.replaceChildren();
    if (this.getWorldId() !== this.worldId) return;
    for (let index = 0; index < FORKLIFT_RACE_CHECKPOINTS.length; index++) {
      const indicator = document.createElement("span");
      indicator.className = "race-checkpoint";
      indicator.setAttribute("aria-label", `Checkpoint ${index + 1}`);
      this.dom.raceCheckpoints.append(indicator);
    }
    const shaft = BABYLON.MeshBuilder.CreateCylinder(
      "forklift_race_checkpoint_arrow_shaft",
      { height: 2, diameter: 0.55, tessellation: 20 },
      this.scene,
    );
    shaft.position.y = 2.5;
    const arrowHead = BABYLON.MeshBuilder.CreateCylinder(
      "forklift_race_checkpoint_arrow_head",
      {
        height: 1.5,
        diameterTop: 1.8,
        diameterBottom: 0,
        tessellation: 24,
      },
      this.scene,
    );
    arrowHead.position.y = 0.75;
    const marker = BABYLON.Mesh.MergeMeshes(
      [shaft, arrowHead],
      true,
      true,
      undefined,
      false,
      true,
    );
    if (!marker) {
      throw new Error("Could not create the forklift race checkpoint arrow.");
    }
    marker.name = "forklift_race_next_checkpoint";
    const material = new BABYLON.StandardMaterial(
      "forklift_race_checkpoint_material",
      this.scene,
    );
    material.disableLighting = true;
    material.emissiveColor = new BABYLON.Color3(1, 0.78, 0.12);
    material.alpha = 0.82;
    marker.material = material;
    this.scene.setRenderingAutoClearDepthStencil(2, false, false, false);
    marker.renderingGroupId = 2;
    marker.isPickable = false;
    marker.checkCollisions = false;
    marker.setEnabled(false);
    marker.metadata = { cameraBlocker: false, raceCheckpoint: true };
    this.marker = marker;
    this.addWorldMesh(marker);
  }

  updateHud() {
    const inRaceWorld = this.getWorldId() === this.worldId;
    const countingDown = inRaceWorld
      && this.session.status === "countdown";
    const raceActive = inRaceWorld && this.session.status !== "inactive";
    const finished = inRaceWorld && this.session.status === "finished";
    this.dom.raceHud.hidden = !inRaceWorld;
    this.dom.raceStart.hidden = raceActive;
    this.dom.raceTiming.hidden = !raceActive;
    this.dom.raceRestart.hidden = !finished;
    this.dom.raceQuit.hidden = !raceActive;
    this.dom.raceCountdown.hidden = !countingDown;
    if (countingDown) {
      this.dom.raceCountdown.textContent = String(
        Math.max(1, Math.ceil(this.session.countdownRemaining)),
      );
    }
    if (!inRaceWorld || this.session.status === "inactive") {
      this.marker?.setEnabled(false);
      return;
    }
    this.dom.raceState.textContent = finished
      ? "Finish!"
      : `Lap ${this.session.lap} / ${this.session.laps}`;
    this.dom.raceTimer.textContent = formatRaceTime(this.session.elapsedMs);
    this.dom.raceBest.textContent = this.best === null
      ? "Best --:--.---"
      : `Best ${formatRaceTime(this.best)}`;
    for (const [index, indicator] of [
      ...this.dom.raceCheckpoints.children,
    ].entries()) {
      indicator.classList.toggle(
        "complete",
        index < this.session.checkpoint,
      );
    }
    const checkpoint = this.session.nextCheckpoint;
    const showMarker = Boolean(
      checkpoint && this.session.status !== "finished",
    );
    this.marker?.setEnabled(showMarker);
    if (showMarker) {
      this.marker.position.set(checkpoint.x, 0.15, checkpoint.z);
    }
  }

  start() {
    if (this.getWorldId() !== this.worldId) return;
    this.session.start();
    this.setMovementLocked(true);
    this.updateHud();
  }

  holdVehicleUntilStart() {
    if (
      this.getWorldId() === this.worldId
      && (
        this.session.status === "inactive"
        || this.session.status === "countdown"
      )
    ) {
      this.setMovementLocked(true);
      return true;
    }
    return false;
  }

  abort() {
    this.session.abort();
    this.setMovementLocked(false);
    this.updateHud();
  }

  vehicleExited() {
    if (
      this.getWorldId() === this.worldId
      && this.session.status !== "inactive"
    ) {
      this.setMovementLocked(false);
      this.updateHud();
      return true;
    }
    this.abort();
    return false;
  }

  simulate(deltaSeconds) {
    if (
      this.getWorldId() !== this.worldId
      || this.session.status === "inactive"
    ) return;
    const previousStatus = this.session.status;
    this.session.update(this.getActorPosition(), deltaSeconds);
    if (
      previousStatus === "countdown"
      && this.session.status === "racing"
    ) this.setMovementLocked(false);
    if (this.session.justFinished) {
      this.best = saveForkliftRaceBest(this.session.elapsedMs);
    }
  }

  update(deltaSeconds) {
    this.simulate(deltaSeconds);
    this.updateHud();
  }
}
