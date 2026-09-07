import * as BABYLON from "@babylonjs/core";
import {
  evaluateAuthActor,
  parseAuthMovement,
} from "../../src/AuthMovement.js";
import { setSourceOrderRotation } from "../../src/Mt5InteractionRotation.js";

export class AuthMovementRuntime {
  constructor({
    assetUrls,
    fetchArrayBuffer,
    setMetadata,
    setInteractionHint,
  }) {
    this.assetUrls = assetUrls;
    this.fetchArrayBuffer = fetchArrayBuffer;
    this.setMetadata = setMetadata;
    this.setInteractionHint = setInteractionHint;
    this.entries = [];
  }

  setActorPose(root, pose) {
    root.position.set(-pose.x, pose.y, pose.z);
    setSourceOrderRotation(root, [
      BABYLON.Tools.ToRadians(pose.rotationX),
      BABYLON.Tools.ToRadians(-pose.rotationY),
      BABYLON.Tools.ToRadians(-pose.rotationZ),
    ]);
    root.computeWorldMatrix(true);
  }

  play(movement) {
    movement.elapsed = 0;
    movement.state = "playing";
    for (const binding of movement.bindings) {
      this.setActorPose(binding.root, evaluateAuthActor(binding.actor, 0));
    }
    this.setInteractionHint(movement.label);
  }

  update(deltaSeconds) {
    for (const movement of this.entries) {
      if (movement.state !== "playing") continue;
      movement.elapsed = Math.min(
        movement.duration,
        movement.elapsed + deltaSeconds,
      );
      for (const binding of movement.bindings) {
        this.setActorPose(
          binding.root,
          evaluateAuthActor(binding.actor, movement.elapsed),
        );
      }
      if (movement.elapsed >= movement.duration) movement.state = "complete";
    }
  }

  async register(placedRoots) {
    const groups = new Map();
    for (const root of placedRoots) {
      const runtime = root._runtimePlacementRecord?.runtime;
      if (!runtime?.authoredMovementFile) continue;
      const group = groups.get(runtime.authoredMovementFile) || [];
      group.push({
        root,
        actorIndex: runtime.authoredMovementActorIndex,
      });
      groups.set(runtime.authoredMovementFile, group);
    }
    for (const [filename, roots] of groups) {
      const url = this.assetUrls[`play/assets/dobuita/${filename}`];
      if (!url) throw new Error(`Missing bundled Dobuita AUTH ${filename}.`);
      const auth = parseAuthMovement(await this.fetchArrayBuffer(url));
      const bindings = roots.map(({ root, actorIndex }) => {
        const actor = auth.actors[actorIndex];
        if (!actor) {
          throw new Error(
            `${filename} has no authored actor index ${actorIndex}.`,
          );
        }
        return { root, actor };
      });
      const movement = {
        filename,
        label: "Replay authored bus scene",
        duration: Math.max(...bindings.map(({ actor }) => actor.duration)),
        elapsed: 0,
        state: "ready",
        bindings,
      };
      for (const { root } of bindings) {
        this.setMetadata(root, "interactiveAuthMovement", movement);
      }
      this.entries.push(movement);
    }
  }

  clear() {
    this.entries.length = 0;
  }
}
