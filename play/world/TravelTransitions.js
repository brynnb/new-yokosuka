import { BoundaryTransitionDetector } from "../../src/BoundaryTransitions.js";

export class TravelTransitions {
  constructor({
    worlds,
    doorInteractions,
    getController,
    isSwitchingWorld,
    selectWorld,
    persistPlayerLocation,
    authorizeTransition = null,
    commitTransition = null,
    onTransitionDenied = () => {},
  }) {
    this.worlds = worlds;
    this.doorInteractions = doorInteractions;
    this.getController = getController;
    this.isSwitchingWorld = isSwitchingWorld;
    this.selectWorld = selectWorld;
    this.persistPlayerLocation = persistPlayerLocation;
    this.authorizeTransition = authorizeTransition;
    this.commitTransition = commitTransition;
    this.onTransitionDenied = onTransitionDenied;
    this.boundaryDetector = new BoundaryTransitionDetector();
    this.pending = null;
  }

  resetBoundary(worldId, position) {
    this.boundaryDetector.reset(worldId, position);
  }

  beginDoor(door, transition) {
    if (!door || !transition || this.pending || this.isSwitchingWorld()) {
      return false;
    }
    const destinationWorld = this.worlds[transition.destination.worldId];
    if (!destinationWorld) return false;

    const controller = this.getController();
    const requiresAuthorization = (
      transition.authorization?.kind === "server-timed-transition"
    );
    const pending = {
      door,
      transition,
      destinationWorld,
      controllerState: controller?.captureTravelState() || null,
      phase: requiresAuthorization ? "authorizing" : "animating",
      authorization: null,
    };
    this.pending = pending;
    controller?.setMovementLocked(true);
    if (requiresAuthorization) {
      if (!this.authorizeTransition) {
        this.denyDoor(pending, {
          reason: "server_unavailable",
          message: "This entrance requires a server connection.",
        });
        return true;
      }
      void Promise.resolve()
        .then(() => this.authorizeTransition(transition))
        .then((authorization) => {
          if (this.pending !== pending) return;
          if (!authorization?.authorized) {
            this.denyDoor(pending, authorization);
            return;
          }
          pending.authorization = authorization;
          this.startDoorAnimation(pending);
        })
        .catch((error) => {
          this.denyDoor(pending, {
            reason: "server_unavailable",
            message: error?.message || "The entrance could not be checked.",
          });
        });
      return true;
    }
    this.startDoorAnimation(pending);
    return true;
  }

  startDoorAnimation(pending) {
    if (this.pending !== pending) return false;
    const { door } = pending;
    pending.phase = "animating";
    if (door.state !== "closed") {
      this.doorInteractions.setPose(door, { progress: 0 });
      door.state = "closed";
      door.elapsed = 0;
      door.openedByPlayer = false;
    }
    this.doorInteractions.toggle(door);
    return true;
  }

  denyDoor(pending, denial = {}) {
    if (this.pending !== pending) return false;
    this.pending = null;
    const { door } = pending;
    if (door.state === "open") {
      this.doorInteractions.toggle(door);
    } else if (door.state !== "closed") {
      this.doorInteractions.setPose(door, { progress: 0 });
      door.state = "closed";
      door.elapsed = 0;
      door.openedByPlayer = false;
      this.doorInteractions.syncCollisionStates?.();
    }
    this.getController()?.setMovementLocked(false);
    this.onTransitionDenied({
      reason: denial?.reason || "denied",
      message: denial?.message || "This entrance is unavailable.",
      transition: pending.transition,
    });
    return true;
  }

  completeDoor(pending, serverDepartureCommitted = false) {
    if (this.pending !== pending) return false;
    const {
      transition,
      destinationWorld,
      controllerState,
    } = pending;
    this.pending = null;
    const options = {
      transition,
      controllerState,
    };
    if (serverDepartureCommitted) options.serverDepartureCommitted = true;
    void this.selectWorld(destinationWorld, options).finally(() => {
      this.getController()?.setMovementLocked(false);
      this.persistPlayerLocation();
    });
    return true;
  }

  finishDoor() {
    const pending = this.pending;
    if (!pending) return false;
    const { door } = pending;
    if (door.state !== "open") return false;
    if (!pending.authorization) return this.completeDoor(pending);
    if (pending.phase !== "animating") return false;
    pending.phase = "committing";
    if (!this.commitTransition) {
      return this.denyDoor(pending, {
        reason: "server_unavailable",
        message: "The multiplayer connection was lost before travel.",
      });
    }
    void Promise.resolve()
      .then(() => this.commitTransition(pending.authorization))
      .then((result) => {
        if (this.pending !== pending) return;
        if (!result?.committed) {
          this.denyDoor(pending, result);
          return;
        }
        this.completeDoor(pending, true);
      })
      .catch((error) => {
        this.denyDoor(pending, {
          reason: "server_unavailable",
          message: error?.message || "Travel could not be committed.",
        });
      });
    return true;
  }

  beginBoundary(transition) {
    const controller = this.getController();
    if (
      !transition
      || this.isSwitchingWorld()
      || this.pending
      || !controller
    ) {
      return false;
    }
    const destinationWorld = this.worlds[transition.destination.worldId];
    if (!destinationWorld) return false;

    const controllerState = controller.captureTravelState();
    controller.setMovementLocked(true);
    void this.selectWorld(destinationWorld, {
      transition,
      controllerState,
    }).finally(() => {
      this.getController()?.setMovementLocked(false);
      this.persistPlayerLocation();
    });
    return true;
  }

  updateBoundary(worldId, position) {
    return this.beginBoundary(
      this.boundaryDetector.update(worldId, position),
    );
  }
}
