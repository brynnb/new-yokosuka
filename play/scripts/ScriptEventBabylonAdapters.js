function finitePosition(value) {
  return Array.isArray(value)
    && value.length === 3
    && value.every(Number.isFinite);
}

export class ScriptEventBabylonAdapters {
  constructor({
    cameraRuntime,
    playerMotionRuntime,
    playerXmptRuntime = null,
    scheduledActors,
    getArea,
    getPlayerPosition,
    beginCameraPresentation,
    abortCameraPresentation,
    getMovementLocked,
    setMovementLocked,
    startActivity,
    cancelActivity,
    telephoneRuntime = null,
    motionCueRuntime = null,
  } = {}) {
    if (
      typeof cameraRuntime?.beginTransaction !== "function"
      || typeof playerMotionRuntime?.beginTransaction !== "function"
      || typeof scheduledActors?.dialogueActor !== "function"
      || typeof getArea !== "function"
      || typeof getPlayerPosition !== "function"
      || typeof beginCameraPresentation !== "function"
      || typeof abortCameraPresentation !== "function"
      || typeof getMovementLocked !== "function"
      || typeof setMovementLocked !== "function"
      || typeof startActivity !== "function"
      || typeof cancelActivity !== "function"
    ) {
      throw new TypeError("Babylon script adapters require runtime ownership hooks");
    }
    this.cameraRuntime = cameraRuntime;
    this.playerMotionRuntime = playerMotionRuntime;
    if (
      playerXmptRuntime
      && (
        typeof playerXmptRuntime.beginTransaction !== "function"
        || typeof playerXmptRuntime.commitTransaction !== "function"
        || typeof playerXmptRuntime.rollbackTransaction !== "function"
      )
    ) {
      throw new TypeError("Babylon script adapters received an incomplete player XMPT runtime");
    }
    this.playerXmptRuntime = playerXmptRuntime;
    this.scheduledActors = scheduledActors;
    this.getArea = getArea;
    this.getPlayerPosition = getPlayerPosition;
    this.beginCameraPresentation = beginCameraPresentation;
    this.abortCameraPresentation = abortCameraPresentation;
    this.getMovementLocked = getMovementLocked;
    this.setMovementLocked = setMovementLocked;
    this.startActivityAdapter = startActivity;
    this.cancelActivityAdapter = cancelActivity;
    if (
      telephoneRuntime
      && (
        typeof telephoneRuntime.play !== "function"
        || typeof telephoneRuntime.update !== "function"
        || typeof telephoneRuntime.cancel !== "function"
        || typeof telephoneRuntime.assertSettled !== "function"
      )
    ) {
      throw new TypeError("Babylon script adapters received an incomplete telephone runtime");
    }
    this.telephoneRuntime = telephoneRuntime;
    if (
      motionCueRuntime
      && (
        typeof motionCueRuntime.play !== "function"
        || typeof motionCueRuntime.update !== "function"
        || typeof motionCueRuntime.cancel !== "function"
        || typeof motionCueRuntime.assertSettled !== "function"
      )
    ) {
      throw new TypeError("Babylon script adapters received an incomplete motion-cue runtime");
    }
    this.motionCueRuntime = motionCueRuntime;
  }

  adapter() {
    return {
      begin: context => this.begin(context),
      startCamera: (camera, transaction) => (
        this.startCamera(camera, transaction)
      ),
      stopCamera: transaction => this.stopCamera(transaction),
      playPlayerMotion: (motion, transaction) => (
        this.playPlayerMotion(motion, transaction)
      ),
      lookAtActor: (request, transaction) => (
        this.lookAtActor(request, transaction)
      ),
      clearActorLook: (request, transaction) => (
        this.clearActorLook(request, transaction)
      ),
      playSequence: (sequence, transaction) => (
        this.playSequence(sequence, transaction)
      ),
      startActivity: (activity, transaction) => (
        this.startActivity(activity, transaction)
      ),
      update: (transaction, deltaSeconds) => (
        this.update(transaction, deltaSeconds)
      ),
      commit: transaction => this.commit(transaction),
      rollback: (transaction, reason) => this.rollback(transaction, reason),
    };
  }

  begin(context = {}) {
    const area = String(context.area || "");
    if (!area || area !== this.getArea()) {
      throw new Error(`script presentation area ${area || "missing"} is not active`);
    }
    const actor = context.actorCode
      ? this.scheduledActors.dialogueActor(
        context.actorCode,
        context.actorInstanceId || null,
      )
      : null;
    if (context.actorCode && !actor) {
      throw new Error(`script actor ${context.actorCode} is not uniquely available`);
    }
    const transaction = {
      area,
      actor,
      actorFacingState: actor
        ? this.scheduledActors.dialogueFacingState(actor.instanceId)
        : null,
      actorFacingRestored: false,
      movementLocked: this.getMovementLocked(),
      cameraToken: null,
      playerMotionToken: null,
      playerXmptToken: null,
      pendingMotion: null,
      telephoneMotion: null,
      pendingActivity: null,
      context: { ...context },
    };
    this.setMovementLocked(true);
    return transaction;
  }

  startCamera(camera, transaction) {
    if (camera.area !== transaction.area) return false;
    this.ensureCameraOwnership(transaction);
    return this.cameraRuntime.requestCamera({
      cameraNumber: camera.cameraNumber,
      actorReferences: [null, null],
      mode: 6,
      source: { kind: "database-script" },
    });
  }

  stopCamera(transaction) {
    if (!transaction.cameraToken) return false;
    return this.cameraRuntime.selectMode({ mode: 0 });
  }

  playPlayerMotion(motion, transaction) {
    if (transaction.pendingMotion) return false;
    this.ensurePlayerMotionOwnership(transaction);
    if (!this.playerMotionRuntime.requestMotion({
      ...motion,
      source: { kind: "database-script" },
    })) return false;
    return new Promise(resolve => {
      transaction.pendingMotion = { actorCode: motion.actorCode, resolve };
    });
  }

  lookAtActor(request, transaction) {
    const actor = transaction.actor;
    if (
      !actor
      || request.actorCode !== actor.actorCode
      || request.targetActorCode !== "AKIR"
    ) return false;
    const target = this.getPlayerPosition();
    if (!finitePosition(target)) return false;
    return this.scheduledActors.setDialogueFacingTarget(
      actor.instanceId,
      target,
      {
        activate: true,
        source: { kind: "database-script", targetActorCode: "AKIR" },
      },
    );
  }

  clearActorLook(request, transaction) {
    const actor = transaction.actor;
    if (!actor || request.actorCode !== actor.actorCode) return false;
    this.restoreActorFacing(transaction);
    return true;
  }

  playSequence(sequence, transaction) {
    if (
      sequence.kind === "actor-motion-cue-start"
      || sequence.kind === "actor-motion-cue-finish"
    ) {
      if (
        !this.motionCueRuntime
        || !this.playerXmptRuntime
        || sequence.area !== transaction.area
      ) {
        return false;
      }
      this.ensurePlayerMotionOwnership(transaction);
      if (!transaction.playerXmptToken) {
        transaction.playerXmptToken = this.playerXmptRuntime.beginTransaction();
      }
      return this.motionCueRuntime.play(sequence, transaction);
    }
    if (!this.telephoneRuntime || sequence.area !== transaction.area) {
      return false;
    }
    if (sequence.kind === "telephone-call-start") {
      if (transaction.pendingMotion || transaction.telephoneMotion) return false;
      this.ensurePlayerMotionOwnership(transaction);
      if (!this.playerMotionRuntime.requestMotion({
        ...sequence.motion,
        source: { kind: "database-script", sequence: sequence.callId },
      })) return false;
      transaction.telephoneMotion = {
        actorCode: sequence.motion.actorCode,
        request: sequence.motion.request,
      };
    }
    return this.telephoneRuntime.play(sequence, transaction);
  }

  async startActivity(activity, transaction) {
    if (transaction.pendingActivity || transaction.cameraToken || transaction.playerMotionToken) {
      return false;
    }
    const pending = { activity };
    transaction.pendingActivity = pending;
    try {
      return await this.startActivityAdapter(activity, transaction.context);
    } finally {
      if (transaction.pendingActivity === pending) transaction.pendingActivity = null;
    }
  }

  ensureCameraOwnership(transaction) {
    if (transaction.cameraToken) return transaction.cameraToken;
    this.beginCameraPresentation();
    try {
      transaction.cameraToken = this.cameraRuntime.beginTransaction({
        area: transaction.area,
      });
      return transaction.cameraToken;
    } catch (error) {
      this.abortCameraPresentation();
      throw error;
    }
  }

  ensurePlayerMotionOwnership(transaction) {
    if (!transaction.playerMotionToken) {
      transaction.playerMotionToken = this.playerMotionRuntime.beginTransaction();
    }
    return transaction.playerMotionToken;
  }

  update(transaction, deltaSeconds) {
    if (transaction.cameraToken) this.cameraRuntime.update(deltaSeconds);
    if (
      this.telephoneRuntime
      && this.telephoneRuntime.update(transaction, deltaSeconds) !== true
    ) return false;
    if (
      this.motionCueRuntime
      && this.motionCueRuntime.update(transaction, deltaSeconds) !== true
    ) return false;
    this.setMovementLocked(true);
    const pending = transaction.pendingMotion;
    if (
      pending
      && (this.playerMotionRuntime.readMotionStatus({
        actorCode: pending.actorCode,
      }) & 2) !== 0
    ) {
      transaction.pendingMotion = null;
      pending.resolve(true);
    }
    return true;
  }

  commit(transaction) {
    if (transaction.pendingMotion || transaction.pendingActivity) {
      throw new Error("script presentation committed during an unfinished operation");
    }
    this.telephoneRuntime?.assertSettled(transaction);
    this.motionCueRuntime?.assertSettled(transaction);
    this.restoreActorFacing(transaction);
    try {
      if (transaction.cameraToken) {
        this.cameraRuntime.commitTransaction(transaction.cameraToken);
      }
      if (transaction.playerXmptToken) {
        this.playerXmptRuntime.commitTransaction(transaction.playerXmptToken);
      }
      return transaction.playerMotionToken
        ? this.playerMotionRuntime.commitTransaction(transaction.playerMotionToken)
        : true;
    } finally {
      this.setMovementLocked(transaction.movementLocked);
    }
  }

  rollback(transaction) {
    this.telephoneRuntime?.cancel(transaction);
    this.motionCueRuntime?.cancel(transaction);
    if (transaction.pendingActivity) {
      this.cancelActivityAdapter(
        transaction.pendingActivity.activity,
        "database-script-rollback",
      );
      transaction.pendingActivity = null;
    }
    if (transaction.pendingMotion) {
      transaction.pendingMotion.resolve(false);
      transaction.pendingMotion = null;
    }
    this.restoreActorFacing(transaction);
    try {
      if (transaction.cameraToken) {
        this.cameraRuntime.rollbackTransaction(transaction.cameraToken);
      }
    } finally {
      try {
        if (transaction.playerXmptToken) {
          this.playerXmptRuntime.rollbackTransaction(
            transaction.playerXmptToken,
          );
        }
        if (transaction.playerMotionToken) {
        this.playerMotionRuntime.rollbackTransaction(
          transaction.playerMotionToken,
        );
        }
      } finally {
        this.setMovementLocked(transaction.movementLocked);
      }
    }
    return true;
  }

  restoreActorFacing(transaction) {
    if (!transaction.actor || transaction.actorFacingRestored) return false;
    this.scheduledActors.restoreDialogueFacingState(
      transaction.actor.instanceId,
      transaction.actorFacingState,
    );
    transaction.actorFacingRestored = true;
    return true;
  }
}

export function createScriptEventBabylonAdapters(options) {
  return new ScriptEventBabylonAdapters(options).adapter();
}
