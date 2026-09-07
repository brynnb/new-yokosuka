import * as BABYLON from "@babylonjs/core";
import { mapTransitionForDoor } from "../../src/MapTransitions.js";
import {
  pickScheduledActorDebugIdentity,
  pickScheduledActorSelection,
} from "../characters/ScheduledActorRuntime.js";
import { FORKLIFT_INTERACTION_DISTANCE } from "../config/forklifts.js";
import { paddleReactionIndexForMesh } from "../arcade/PaddleReactionRuntime.js";
import { isDirectShenmue2DoorPick } from "../world/Shenmue2NativeDoors.js";
import { isNativeLayerDoorBlocker } from "../world/TimedTransitionAccess.js";
import { logicalDoorScriptObject } from "./DoorInteractions.js";

const INTERACTION_DISTANCE = 10;

function horizontalDistance(left, right) {
  return Math.hypot(left.x - right.x, left.z - right.z);
}

export class WorldInteractionDispatcher {
  constructor({
    arcade,
    camera,
    debug,
    forklift,
    getActorPosition,
    getReady,
    getWorld,
    interactions,
    openPoolChooser,
    playUi,
    poolRuntime,
    scene,
    scriptedInteractions,
    travelTransitions,
    worldMapLayerState,
  }) {
    Object.assign(this, {
      arcade,
      camera,
      debug,
      forklift,
      getActorPosition,
      getReady,
      getWorld,
      interactions,
      openPoolChooser,
      playUi,
      poolRuntime,
      scene,
      scriptedInteractions,
      travelTransitions,
      worldMapLayerState,
    });
    this.observer = null;
  }

  start() {
    if (this.observer) return;
    this.observer = this.scene.onPointerObservable.add(
      pointerInfo => this.handle(pointerInfo),
    );
  }

  dispose() {
    if (!this.observer) return;
    this.scene.onPointerObservable.remove(this.observer);
    this.observer = null;
  }

  handle(pointerInfo) {
    if (
      !this.getReady()
      || this.travelTransitions.pending
      || pointerInfo.type !== BABYLON.PointerEventTypes.POINTERPICK
      || pointerInfo.event?.button !== 0
      || this.poolRuntime.active
    ) return;
    if (this.handleDebugPick(pointerInfo)) return;
    // Presentation-owned actors and cameras may still be inspected by debug
    // tools, but cannot start ordinary world interactions.
    if (!this.scriptedInteractions.canStart()) return;
    const npcSelection = pickScheduledActorSelection(
      this.scene,
      this.camera,
      this.scene.pointerX,
      this.scene.pointerY,
      pointerInfo.pickInfo,
    );
    if (npcSelection) {
      void this.scriptedInteractions.startNpc(npcSelection);
      return;
    }
    if (this.handleActiveArcadeGame()) return;
    this.handleWorldObject(pointerInfo);
  }

  handleDebugPick(pointerInfo) {
    const { collisionPicker, debugPanel, enabled, lightDebugger, trianglePicker } =
      this.debug;
    if (trianglePicker.active) {
      const pick = trianglePicker.pick(
        this.scene.pointerX,
        this.scene.pointerY,
        this.camera,
      );
      trianglePicker.toggleFace(pick);
      return true;
    }
    if (collisionPicker.active) {
      const directPick = pointerInfo.pickInfo;
      const pick = collisionPicker.canSelect(directPick?.pickedMesh)
        ? directPick
        : this.scene.pick(
          this.scene.pointerX,
          this.scene.pointerY,
          mesh => collisionPicker.canSelect(mesh),
          false,
          this.camera,
        );
      collisionPicker.toggleFace(pick);
      return true;
    }
    if (enabled && this.debug.showLights()) {
      const lightPick = this.scene.pick(
        this.scene.pointerX,
        this.scene.pointerY,
        mesh => Boolean(
          mesh.metadata?.lightDebug && mesh.metadata?.sourceLightRef,
        ),
        false,
        this.camera,
      );
      const pickedLight = lightPick?.pickedMesh?.metadata?.sourceLightRef;
      if (pickedLight) {
        lightDebugger.select(pickedLight);
        return true;
      }
    }
    if (enabled) {
      const npcIdentity = pickScheduledActorDebugIdentity(
        this.scene,
        this.camera,
        this.scene.pointerX,
        this.scene.pointerY,
        pointerInfo.pickInfo,
      );
      if (npcIdentity) debugPanel.showNpc(npcIdentity);
    }
    return false;
  }

  handleActiveArcadeGame() {
    const games = this.arcade.getGames();
    if (games?.active && games.game?.id === "paddles") {
      const paddlePick = this.scene.pick(
        this.scene.pointerX,
        this.scene.pointerY,
        mesh => paddleReactionIndexForMesh(mesh) !== null,
        false,
        this.camera,
      );
      const paddleIndex = paddleReactionIndexForMesh(paddlePick?.pickedMesh);
      if (paddleIndex !== null) this.arcade.paddleRuntime.press(paddleIndex);
      return true;
    }
    if (games?.active && games.game?.id === "darts") {
      games.press("Space");
      return true;
    }
    return false;
  }

  handleWorldObject(pointerInfo) {
    const interactionPick = this.scene.pick(
      this.scene.pointerX,
      this.scene.pointerY,
      mesh => this.isInteractiveMesh(mesh),
      false,
      this.camera,
    );
    const metadata = interactionPick?.pickedMesh?.metadata || {};
    const door = metadata.interactiveDoor;
    if (this.doorIsBlocked(interactionPick, door)) return;
    if (!isDirectShenmue2DoorPick(door, pointerInfo.pickInfo)) return;
    const targets = {
      drawer: metadata.interactiveDrawer,
      door,
      clock: metadata.interactiveClock,
      inspectable: metadata.interactiveInspectable,
      authMovement: metadata.interactiveAuthMovement,
      mapTransition: metadata.interactiveMapTransition,
      parkedForklift: metadata.interactiveForklift,
      arcade: metadata.interactiveArcade,
      pool: metadata.interactivePool,
      vendingMachine: metadata.interactiveVendingMachine,
      cinemaSeat: metadata.interactiveCinemaSeat,
    };
    if (this.handleSpecialTarget(targets)) return;
    this.handleOrdinaryTarget(targets);
  }

  isInteractiveMesh(mesh) {
    const metadata = mesh.metadata;
    return Boolean(
      metadata?.interactiveDrawer
      || metadata?.interactiveDoor
      || metadata?.interactiveClock
      || metadata?.interactiveInspectable
      || metadata?.interactiveAuthMovement
      || metadata?.interactiveMapTransition
      || metadata?.interactiveForklift
      || metadata?.interactiveArcade
      || metadata?.interactivePool
      || metadata?.interactiveVendingMachine
      || metadata?.interactiveCinemaSeat
    );
  }

  doorIsBlocked(interactionPick, door) {
    if (!interactionPick?.hit) return false;
    const blockerPick = this.scene.pick(
      this.scene.pointerX,
      this.scene.pointerY,
      mesh => this.worldMapLayerState.activeLayerForMesh(mesh) !== null,
      false,
      this.camera,
    );
    const blocker = blockerPick?.hit
      ? this.worldMapLayerState.activeLayerForMesh(blockerPick.pickedMesh)
      : null;
    if (
      !blockerPick?.hit
      || blockerPick.distance + 1e-4 >= interactionPick.distance
      || !isNativeLayerDoorBlocker(
        this.getWorld().id,
        door?.doorSelector,
        blocker,
      )
    ) return false;
    this.interactions.inspectable.showHint("This shop is closed.");
    return true;
  }

  handleSpecialTarget(targets) {
    const actorPosition = this.getActorPosition();
    if (targets.cinemaSeat) {
      if (horizontalDistance(actorPosition, targets.cinemaSeat.position)
        <= INTERACTION_DISTANCE) {
        this.interactions.cinemaSeat.enter(targets.cinemaSeat);
      }
      return true;
    }
    if (targets.arcade) {
      if (horizontalDistance(actorPosition, targets.arcade.root.position)
        <= INTERACTION_DISTANCE) this.activateArcade(targets.arcade);
      return true;
    }
    if (targets.pool) {
      if (horizontalDistance(actorPosition, targets.pool.root.position)
        <= INTERACTION_DISTANCE && this.openPoolChooser()) {
        this.playUi.openModal("pool-chooser");
      }
      return true;
    }
    if (targets.parkedForklift) {
      const position = targets.parkedForklift.root.getAbsolutePosition();
      if (horizontalDistance(actorPosition, position)
        <= FORKLIFT_INTERACTION_DISTANCE
        && this.forklift.network.availableForLocalEntry(targets.parkedForklift)
        && !this.forklift.mode.rightParked(targets.parkedForklift)) {
        this.forklift.mode.enter(targets.parkedForklift);
      }
      return true;
    }
    return false;
  }

  activateArcade(interaction) {
    if (!interaction.focusOnly) {
      this.arcade.getGames()?.start(interaction.gameId, { interaction });
      return;
    }
    if (this.arcade.cabinetView.focusOnly) {
      const zoomingOut = this.arcade.cabinetView.setActive(false);
      this.arcade.setMovementLocked(zoomingOut);
      return;
    }
    this.arcade.setMovementLocked(true);
    this.arcade.cabinetView.setActive(true, {
      id: interaction.gameId,
      focusOnly: true,
    });
  }

  handleOrdinaryTarget(targets) {
    const root = targets.drawer?.root
      || targets.door?.root
      || targets.clock?.root
      || targets.inspectable?.root
      || targets.vendingMachine?.root
      || targets.mapTransition?.root
      || targets.authMovement?.bindings?.[0]?.root;
    if (!root) return;
    const position = root.getAbsolutePosition?.() || root.position;
    if (horizontalDistance(this.getActorPosition(), position)
      > INTERACTION_DISTANCE) return;
    if (targets.mapTransition) {
      if (targets.door) {
        this.travelTransitions.beginDoor(
          targets.door,
          targets.mapTransition.transition,
        );
      } else {
        this.travelTransitions.beginBoundary(targets.mapTransition.transition);
      }
      return;
    }
    if (targets.vendingMachine) {
      this.interactions.vending.open(targets.vendingMachine);
      return;
    }
    if (targets.drawer) this.interactions.drawer.toggle(targets.drawer);
    if (targets.door) {
      this.activateDoor(targets.door);
      return;
    }
    if (targets.clock) this.interactions.clock.ring(targets.clock);
    if (targets.inspectable) {
      this.activateInspectable(targets.inspectable);
      return;
    }
    if (targets.authMovement) {
      this.interactions.authMovement.play(targets.authMovement);
    }
  }

  activateDoor(door) {
    const world = this.getWorld();
    const fallback = () => {
      const transition = mapTransitionForDoor({
        worldId: world.id,
        objectTag: door.objectTag,
        model: door.root?._filename,
        doorSelector: door.doorSelector,
      });
      if (transition) this.travelTransitions.beginDoor(door, transition);
      else if (door.lockedMessage) {
        this.interactions.inspectable.showHint(door.lockedMessage);
      } else this.interactions.door.toggle(door);
    };
    const objectSelector = logicalDoorScriptObject(
      world.nativeArea,
      door.doorSelector,
    );
    if (!objectSelector) {
      fallback();
      return;
    }
    void this.scriptedInteractions.startObject({
      objectSelector,
      objectTag: door.objectTag,
      root: door.root,
      fallback,
    });
  }

  activateInspectable(inspectable) {
    const objectTag = inspectable.objectTag;
    void this.scriptedInteractions.startObject({
      objectSelector: objectTag,
      objectTag,
      root: inspectable.root,
      fallback: () => {
        if (!this.scriptedInteractions.startNativeObject(
          inspectable,
          objectTag,
        )) this.interactions.inspectable.inspect(inspectable);
      },
    });
  }
}
