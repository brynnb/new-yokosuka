import { resolveNativeAseqGazeTarget } from "./NativeAseqGazeTarget.js";
import { applyNativeActorLookPresentation, restoreNativeActorLookPresentation } from "../characters/NativeActorLookPresentation.js";

export class NativeAseqActorLookPointPresentation {
  constructor({ actors, controlActorLookPoint } = {}) {
    if (typeof actors?.componentWorldPosition !== "function") {
      throw new TypeError("AUTH actor look-point presentation requires actor components");
    }
    if (typeof controlActorLookPoint !== "function") {
      throw new TypeError("AUTH actor look-point control adapter is required");
    }
    this.actors = actors;
    this.controlActorLookPoint = controlActorLookPoint;
    this.owner = null;
    this.targets = new Map();
  }

  begin(owner) {
    if (!owner || this.owner) return false;
    this.owner = owner;
    return true;
  }

  play(owner, command) {
    if (owner !== this.owner || command?.name !== "actor-look-point") return false;
    const world = resolveNativeAseqGazeTarget(this.actors, command.target);
    const previous = this.targets.get(command.actorTag);
    this.targets.set(command.actorTag, { state: previous?.state || {}, target: command.target });
    return this.controlActorLookPoint({
      actorCode: command.actorTag,
      selector: command.selector,
      target: world === null ? null : [-world[0], world[1], world[2]],
      mode: command.mode,
      source: Object.freeze({
        kind: "native-aseq-callback",
        callFileOffset: command.callFileOffset,
      }),
    }) === true;
  }

  end(owner) {
    if (owner !== this.owner) return false;
    for (const [actorTag, record] of this.targets) {
      const model = this.actors.activeActor?.(actorTag)?.model;
      if (model) restoreNativeActorLookPresentation(model, record.state);
    }
    this.targets.clear();
    this.owner = null;
    return true;
  }

  reset() {
    return this.owner === null && this.targets.size === 0;
  }

  apply(owner) {
    if (owner !== this.owner) return false;
    for (const [actorTag, record] of this.targets) {
      const model = this.actors.activeActor(actorTag)?.model;
      const world = resolveNativeAseqGazeTarget(this.actors, record.target);
      applyNativeActorLookPresentation(model, world, record.state);
    }
    return true;
  }
}

export function createNativeAseqActorLookPointPresentation(options) {
  return new NativeAseqActorLookPointPresentation(options);
}

export function createNativeActorLookPointSceneControl({ getSceneState } = {}) {
  if (typeof getSceneState !== "function") {
    throw new TypeError("native actor look-point scene-state resolver is required");
  }
  return detail => {
    const mutation = getSceneState().applyActorLookPointControl({
      actorTag: detail.actorCode,
      selector: detail.selector,
      targetVector: detail.target === null
        ? null
        : detail.target.map(nativeFloat32Word),
      mode: detail.mode,
    });
    return mutation.applied === true || mutation.nativeNoOp === true;
  };
}
import {
  nativeFloat32Word,
} from "./NativeEventNumericRuntime.js";
