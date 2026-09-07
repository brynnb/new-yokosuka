function nativeWorldPoint(actors, target) {
  if (target === null) return null;
  if (target?.kind === "world-point") return [...target.position];
  if (target?.kind !== "actor-component") {
    throw new Error("AUTH actor look-point target is invalid");
  }
  const position = actors.componentWorldPosition(target.actorTag, target.selector);
  if (!Array.isArray(position) || position.length !== 3) {
    throw new Error(
      `AUTH actor look-point target ${target.actorTag}:${target.selector} is unavailable`,
    );
  }
  return [
    -position[0] + target.offset[0],
    position[1] + target.offset[1],
    position[2] + target.offset[2],
  ];
}

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
  }

  begin(owner) {
    if (!owner || this.owner) return false;
    this.owner = owner;
    return true;
  }

  play(owner, command) {
    if (owner !== this.owner || command?.name !== "actor-look-point") return false;
    return this.controlActorLookPoint({
      actorCode: command.actorTag,
      selector: command.selector,
      target: nativeWorldPoint(this.actors, command.target),
      mode: command.mode,
      source: Object.freeze({
        kind: "native-aseq-callback",
        callFileOffset: command.callFileOffset,
      }),
    }) === true;
  }

  end(owner) {
    if (owner !== this.owner) return false;
    this.owner = null;
    return true;
  }

  reset() {
    return this.owner === null;
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
