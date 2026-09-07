import * as BABYLON from "@babylonjs/core";

export class InteractionManager {
  constructor({
    drawers,
    doors,
    clocks,
    inspectables,
    vending,
    authMovement,
    getActorPosition,
    autoCloseDistance = 5,
  }) {
    this.drawers = drawers;
    this.doors = doors;
    this.clocks = clocks;
    this.inspectables = inspectables;
    this.vending = vending;
    this.authMovement = authMovement;
    this.getActorPosition = getActorPosition;
    this.autoCloseDistance = autoCloseDistance;
  }

  clear() {
    this.drawers.clear();
    this.doors.clear();
    this.clocks.clear();
    this.inspectables.clear();
    this.vending.clear();
    this.authMovement.clear();
  }

  update(deltaSeconds) {
    this.autoCloseDistant();
    this.drawers.update(deltaSeconds);
    this.doors.update(deltaSeconds);
    this.clocks.update(deltaSeconds);
    this.authMovement.update(deltaSeconds);
    this.inspectables.update(deltaSeconds);
  }

  autoCloseDistant() {
    const actorPosition = this.getActorPosition();
    for (const interactive of [
      ...this.drawers.entries,
      ...this.doors.entries,
    ]) {
      if (
        interactive.openedByPlayer
        && interactive.state === "open"
        && BABYLON.Vector3.Distance(
          actorPosition,
          interactive.root.getAbsolutePosition(),
        ) > this.autoCloseDistance
      ) {
        interactive.state = "closing";
        interactive.elapsed = 0;
      }
    }
  }
}
