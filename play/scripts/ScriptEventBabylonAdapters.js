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
    acquireMovementLock,
    startActivity,
    cancelActivity,
    telephoneRuntime = null,
    motionCueRuntime = null,
    sceneStagingRuntime = null,
    combatRuntime = null,
    navigationRuntime = null,
    vehicleChallengeRuntime = null,
  } = {}) {
    if (
      typeof cameraRuntime?.beginTransaction !== "function"
      || typeof playerMotionRuntime?.beginTransaction !== "function"
      || typeof scheduledActors?.dialogueActor !== "function"
      || typeof getArea !== "function"
      || typeof getPlayerPosition !== "function"
      || typeof beginCameraPresentation !== "function"
      || typeof abortCameraPresentation !== "function"
      || typeof acquireMovementLock !== "function"
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
    this.acquireMovementLock = acquireMovementLock;
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
    this.sceneStagingRuntime = sceneStagingRuntime;
    this.combatRuntime=combatRuntime;
    this.navigationRuntime=navigationRuntime;
    this.vehicleChallengeRuntime=vehicleChallengeRuntime;
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
      showCombat:(view,transaction)=>this.combatRuntime.show(view,transaction),
      endCombat:transaction=>this.combatRuntime.finish(transaction),
      showNavigation:(prompt,transaction)=>this.navigationRuntime.show(prompt,transaction),
      endNavigation:transaction=>this.navigationRuntime.finish(transaction),
      showForkliftChallenge:(prompt,transaction)=>this.vehicleChallengeRuntime.show(prompt,transaction),
      endForkliftChallenge:transaction=>this.vehicleChallengeRuntime.finish(transaction),
      ownsPlayerPresentation: transaction => Boolean(transaction.cameraToken || this.combatRuntime?.active?.transaction===transaction
        || this.navigationRuntime?.active?.transaction===transaction
        || this.sceneStagingRuntime?.active?.transaction === transaction),
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
      actorFacingStates: new Map(),
      releaseMovementLock: this.acquireMovementLock(),
      cameraToken: null,
      playerMotionToken: null,
      playerXmptToken: null,
      pendingMotion: null,
      telephoneMotion: null,
      pendingActivity: null,
      context: { ...context },
    };
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
    const actor = transaction.actor?.actorCode === request.actorCode
      ? transaction.actor
      : this.scheduledActors.dialogueActor(request.actorCode);
    if (
      !actor
      || request.actorCode !== actor.actorCode
      || request.targetActorCode !== "AKIR"
    ) return false;
    const target = this.getPlayerPosition();
    if (!finitePosition(target)) return false;
    // Each participant retains its own prior facing. Restaurant and barber
    // conversations can address both spouses; cancellation restores both.
    if (!transaction.actorFacingStates.has(actor.instanceId)) {
      transaction.actorFacingStates.set(actor.instanceId,
        this.scheduledActors.dialogueFacingState(actor.instanceId));
    }
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
    const actor = transaction.actor?.actorCode === request.actorCode
      ? transaction.actor
      : this.scheduledActors.dialogueActor(request.actorCode);
    if (!actor || request.actorCode !== actor.actorCode) return false;
    return this.restoreActorFacing(transaction, actor.instanceId);
  }

  playSequence(sequence, transaction) {
    if (sequence.kind === "scene-staging-start" || sequence.kind === "scene-staging-transition" || sequence.kind === "scene-staging-finish") {
      return this.sceneStagingRuntime?.play(sequence, transaction) ?? false;
    }
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
    if(this.combatRuntime?.update(transaction,deltaSeconds)===false)return false;
    if(this.navigationRuntime?.update(transaction,deltaSeconds)===false)return false;
    if(this.vehicleChallengeRuntime?.update(transaction,deltaSeconds)===false)return false;
    if (this.sceneStagingRuntime?.update(transaction, deltaSeconds) === false) return false;
    if (transaction.cameraToken) this.cameraRuntime.update(deltaSeconds);
    if (
      this.telephoneRuntime
      && this.telephoneRuntime.update(transaction, deltaSeconds) !== true
    ) return false;
    if (
      this.motionCueRuntime
      && this.motionCueRuntime.update(transaction, deltaSeconds) !== true
    ) return false;
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
    if(this.combatRuntime?.active?.transaction===transaction)throw new Error("Combat presentation has not released ownership");
    if(this.navigationRuntime?.active?.transaction===transaction)throw new Error("Navigation presentation has not released ownership");
    if(this.vehicleChallengeRuntime?.active?.transaction===transaction)throw new Error("Forklift challenge has not released ownership");
    if (transaction.pendingMotion || transaction.pendingActivity) {
      throw new Error("script presentation committed during an unfinished operation");
    }
    this.telephoneRuntime?.assertSettled(transaction);
    this.motionCueRuntime?.assertSettled(transaction);
    if (this.sceneStagingRuntime?.active?.transaction === transaction) {
      throw new Error("script presentation committed before scene staging cleanup");
    }
    try {
      this.restoreActorFacing(transaction);
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
      transaction.releaseMovementLock();
    }
  }

  rollback(transaction) {
    try {
      return this.rollbackOwnedPresentation(transaction);
    } finally {
      transaction.releaseMovementLock();
    }
  }

  rollbackOwnedPresentation(transaction) {
    let sceneCleanupError = null;
    try { this.combatRuntime?.finish(transaction); }
    catch (error) { sceneCleanupError = error; }
    try { this.navigationRuntime?.finish(transaction); }
    catch (error) { sceneCleanupError ||= error; }
    try { this.vehicleChallengeRuntime?.finish(transaction); }
    catch (error) { sceneCleanupError ||= error; }
    try { this.sceneStagingRuntime?.cancel(transaction); }
    catch (error) { sceneCleanupError ||= error; }
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
    }
    if (sceneCleanupError) throw sceneCleanupError;
    return true;
  }

  restoreActorFacing(transaction, instanceId = null) {
    let restored = false;
    for (const [id, state] of transaction.actorFacingStates) {
      if (instanceId && id !== instanceId) continue;
      this.scheduledActors.restoreDialogueFacingState(id, state);
      transaction.actorFacingStates.delete(id);
      restored = true;
    }
    return restored;
  }
}

export function createScriptEventBabylonAdapters(options) {
  return new ScriptEventBabylonAdapters(options).adapter();
}
