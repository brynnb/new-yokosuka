function requireSceneActor(sceneActor) {
  const instanceId = sceneActor?.id;
  const actorCode = sceneActor?.actorCode;
  if (typeof instanceId !== "string" || !instanceId) {
    throw new TypeError("native dialogue scene actor requires an instance ID");
  }
  if (typeof actorCode !== "string" || actorCode.length !== 4) {
    throw new TypeError(
      "native dialogue scene actor requires a four-character actor code",
    );
  }
  return { instanceId, actorCode };
}

export function nativeDialogueBrowserFacingTarget(scenePosition) {
  if (
    !Array.isArray(scenePosition)
    || scenePosition.length !== 3
    || !scenePosition.every(Number.isFinite)
  ) {
    throw new TypeError(
      "native dialogue FACE target must contain three finite coordinates",
    );
  }
  return [-scenePosition[0], scenePosition[1], scenePosition[2]];
}

export function nativeDialogueBrowserVector(nativeVector) {
  if (
    !Array.isArray(nativeVector)
    || nativeVector.length !== 3
    || !nativeVector.every(Number.isFinite)
  ) {
    throw new TypeError(
      "native dialogue vector must contain three finite coordinates",
    );
  }
  return [-nativeVector[0], nativeVector[1], nativeVector[2]];
}

export class NativeDialogueSceneStaging {
  constructor({ scheduledActors }) {
    if (
      typeof scheduledActors?.setDialogueFacingTarget !== "function"
      || typeof scheduledActors?.setDialogueFacingOffset !== "function"
      || typeof scheduledActors?.clearDialogueFacingTarget !== "function"
    ) {
      throw new TypeError(
        "native dialogue scene staging requires scheduled actor FACE control",
      );
    }
    this.scheduledActors = scheduledActors;
    this.sceneActor = null;
  }

  begin(sceneActor) {
    this.end();
    this.sceneActor = requireSceneActor(sceneActor);
    return { ...this.sceneActor };
  }

  handleNativeCommand(dispatch) {
    const facingTarget = dispatch?.facingTarget;
    const participantRoute = dispatch?.participantRoute;
    if (!this.sceneActor) {
      return { status: "ignored", reason: "no-active-scene-actor" };
    }
    const descriptorActorCode = dispatch?.actor?.actorCode;
    if (
      typeof descriptorActorCode === "string"
      && descriptorActorCode !== this.sceneActor.actorCode
    ) {
      return { status: "ignored", reason: "scene-actor-mismatch" };
    }
    if (!facingTarget) {
      return this.handleParticipantControl(dispatch, participantRoute);
    }
    const browserTarget = nativeDialogueBrowserFacingTarget(
      facingTarget.scenePosition,
    );
    const applied = this.scheduledActors.setDialogueFacingTarget(
      this.sceneActor.instanceId,
      browserTarget,
      {
        activate: facingTarget.appliesControlStateTransition === true,
        source: {
          commandWord: dispatch.command?.commandWord,
          targetIndex: facingTarget.index,
          handlerAddress: facingTarget.handlerAddress,
        },
      },
    );
    return {
      status: applied ? "applied" : "unavailable",
      instanceId: this.sceneActor.instanceId,
      actorCode: this.sceneActor.actorCode,
      browserTarget,
      activated: facingTarget.appliesControlStateTransition === true,
    };
  }

  handleParticipantControl(dispatch, participantRoute) {
    if (
      participantRoute?.behavior !== "participantControlDispatch"
      || !participantRoute.motionPoint
    ) {
      return { status: "ignored", reason: "no-active-staging-command" };
    }
    if (participantRoute.participantCode !== this.sceneActor.actorCode) {
      return {
        status: "ignored",
        reason: "participant-scene-actor-mismatch",
      };
    }
    const browserOffset = nativeDialogueBrowserVector(
      participantRoute.motionPoint.nativeOffset,
    );
    const applied = this.scheduledActors.setDialogueFacingOffset(
      this.sceneActor.instanceId,
      browserOffset,
      {
        activate: true,
        source: {
          commandWord: dispatch.command?.commandWord,
          participantIndex: participantRoute.index,
          handlerAddress: participantRoute.handlerAddress,
          motionRequestAddress: (
            participantRoute.motionPoint.requestAddress
          ),
        },
      },
    );
    return {
      status: applied ? "applied" : "unavailable",
      instanceId: this.sceneActor.instanceId,
      actorCode: this.sceneActor.actorCode,
      browserOffset,
      activated: true,
    };
  }

  end() {
    if (!this.sceneActor) return false;
    this.scheduledActors.clearDialogueFacingTarget(
      this.sceneActor.instanceId,
    );
    this.sceneActor = null;
    return true;
  }
}

export function createNativeDialogueSceneStaging(options) {
  return new NativeDialogueSceneStaging(options);
}
