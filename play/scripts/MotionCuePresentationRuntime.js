function deferred() {
  let resolve;
  const promise = new Promise(resolve_ => { resolve = resolve_; });
  return { promise, resolve };
}

function float32FromWord(word) {
  const view = new DataView(new ArrayBuffer(4));
  view.setUint32(0, word >>> 0, true);
  return view.getFloat32(0, true);
}

function validAlignmentRoute(route) {
  return Array.isArray(route?.target)
    && route.target.length === 3
    && route.target.every(Number.isFinite)
    && Number.isInteger(route.requestWord)
    && Number.isInteger(route.requestDword);
}

function validAlignment(alignment) {
  if (!alignment || alignment.stateSelector !== 0) return false;
  if (validAlignmentRoute(alignment)) return true;
  const selector = alignment.selector;
  return selector?.kind === "native-actor-axis-threshold"
    && selector.actorCode === "AKIR"
    && selector.axis === "x"
    && selector.comparison === "greater-than"
    && Number.isFinite(selector.threshold)
    && validAlignmentRoute(selector.whenTrue)
    && validAlignmentRoute(selector.whenFalse);
}

function validStart(sequence) {
  return sequence?.kind === "actor-motion-cue-start"
    && sequence.area === "D000"
    && sequence.actorCode === "AKIR"
    && validAlignment(sequence.alignment)
    && (
      (
        Number.isInteger(sequence.motion?.request)
        && Array.isArray(sequence.motion.parameters)
        && sequence.motion.parameters.length === 4
        && sequence.motion.parameters.every(Number.isFinite)
        && Number.isFinite(sequence.dialoguePhase)
      )
      || (
        sequence.timing?.kind === "post-alignment-ticks"
        && Number.isFinite(sequence.timing.tickRate)
        && sequence.timing.tickRate > 0
        && Number.isFinite(sequence.timing.dialogueTick)
        && sequence.timing.dialogueTick >= 0
      )
    )
    && Array.isArray(sequence.cues)
    && sequence.cues.every(cue => (
      Number.isFinite(sequence.motion ? cue.phase : cue.tick)
      && typeof cue.commandHex === "string"
      && cue.commandHex.length === 8
    ));
}

function resolveAlignment(sequence, playerXmptRuntime) {
  const alignment = sequence.alignment;
  if (validAlignmentRoute(alignment)) return alignment;
  const selector = alignment.selector;
  const transform = playerXmptRuntime.currentTransform();
  if (
    !transform
    || !Array.isArray(transform.position)
    || !Number.isFinite(transform.position[0])
  ) return null;
  return transform.position[0] > selector.threshold
    ? selector.whenTrue
    : selector.whenFalse;
}

// Runs an authored XMPT alignment and MOMT-phase sound timeline as one owned
// presentation. Durable state and branch selection remain on the server.
export class MotionCuePresentationRuntime {
  constructor({
    xmptState,
    playerXmptRuntime,
    playerMotionRuntime,
    playSound,
  } = {}) {
    if (
      typeof xmptState?.requestActorXmpt !== "function"
      || typeof xmptState?.readActorXmptState !== "function"
      || typeof xmptState?.updateActorXmpt !== "function"
      || typeof playerXmptRuntime?.update !== "function"
      || typeof playerXmptRuntime?.controller !== "function"
      || typeof playerXmptRuntime?.currentTransform !== "function"
      || typeof playerMotionRuntime?.requestMotion !== "function"
      || typeof playerMotionRuntime?.readMomtNumericWords !== "function"
      || typeof playerMotionRuntime?.readMotionStatus !== "function"
      || typeof playSound !== "function"
    ) {
      throw new TypeError("motion-cue presentation requires complete native adapters");
    }
    this.xmptState = xmptState;
    this.playerXmptRuntime = playerXmptRuntime;
    this.playerMotionRuntime = playerMotionRuntime;
    this.playSound = playSound;
    this.active = null;
  }

  play(sequence, owner) {
    if (sequence?.kind === "actor-motion-cue-start") {
      return this.start(sequence, owner);
    }
    if (sequence?.kind === "actor-motion-cue-finish") {
      return this.finish(sequence, owner);
    }
    return false;
  }

  start(sequence, owner) {
    if (this.active || !validStart(sequence)) return false;
    const alignment = resolveAlignment(sequence, this.playerXmptRuntime);
    if (!alignment) return false;
    const leadIn = deferred();
    this.xmptState.requestActorXmpt({
      actorTag: sequence.actorCode,
      target: [...alignment.target],
      requestWord: alignment.requestWord,
      requestDword: alignment.requestDword,
      stateSelector: sequence.alignment.stateSelector,
    });
    this.active = {
      owner,
      sequence,
      stage: "alignment",
      cueIndex: 0,
      elapsedTicks: 0,
      leadIn,
      finish: null,
    };
    return leadIn.promise;
  }

  finish(sequence, owner) {
    const active = this.active;
    if (
      active?.owner !== owner
      || active.sequence.sequenceId !== sequence?.sequenceId
      || active.finish
    ) return false;
    if (
      active.sequence.timing?.kind === "post-alignment-ticks"
      && active.leadIn === null
    ) {
      this.active = null;
      return true;
    }
    if (active.sequence.motion && this.motionComplete(active)) {
      this.active = null;
      return true;
    }
    active.finish = deferred();
    return active.finish.promise;
  }

  update(owner, deltaSeconds) {
    const active = this.active;
    if (!active || active.owner !== owner) return true;
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) return false;
    if (active.stage === "alignment") {
      this.playerXmptRuntime.update(deltaSeconds);
      this.xmptState.updateActorXmpt(
        active.sequence.actorCode,
        this.playerXmptRuntime.controller(),
      );
      const record = this.xmptState.readActorXmptState(
        active.sequence.actorCode,
      );
      if (record?.state !== 0) return true;
      if (active.sequence.motion) {
        if (!this.playerMotionRuntime.requestMotion({
          ...active.sequence.motion,
          source: {
            kind: "database-script",
            sequence: active.sequence.sequenceId,
          },
        })) return this.fail(active);
        active.stage = "motion";
      } else {
        active.stage = "post-alignment-ticks";
        return true;
      }
    }

    if (active.stage === "post-alignment-ticks") {
      active.elapsedTicks += deltaSeconds * active.sequence.timing.tickRate;
      while (
        active.cueIndex < active.sequence.cues.length
        && active.elapsedTicks >= active.sequence.cues[active.cueIndex].tick
      ) {
        const cue = active.sequence.cues[active.cueIndex++];
        if (this.playSound(cue, owner) !== true) return this.fail(active);
      }
      if (
        active.leadIn
        && active.elapsedTicks >= active.sequence.timing.dialogueTick
      ) {
        active.leadIn.resolve(true);
        active.leadIn = null;
      }
      return true;
    }

    const words = this.playerMotionRuntime.readMomtNumericWords({
      actorCode: active.sequence.actorCode,
    });
    if (words) {
      const phase = float32FromWord(words.floatWordF0);
      while (
        active.cueIndex < active.sequence.cues.length
        && phase >= active.sequence.cues[active.cueIndex].phase
      ) {
        const cue = active.sequence.cues[active.cueIndex++];
        if (this.playSound(cue, owner) !== true) return this.fail(active);
      }
      if (active.leadIn && phase >= active.sequence.dialoguePhase) {
        active.leadIn.resolve(true);
        active.leadIn = null;
      }
    }
    if (active.sequence.motion && this.motionComplete(active) && active.finish) {
      this.active = null;
      active.finish.resolve(true);
    }
    return true;
  }

  motionComplete(active) {
    return (
      (this.playerMotionRuntime.readMotionStatus({
        actorCode: active.sequence.actorCode,
      }) ?? 0) & 2
    ) !== 0;
  }

  cancel(owner) {
    const active = this.active;
    if (!active || active.owner !== owner) return false;
    this.active = null;
    active.leadIn?.resolve(false);
    active.finish?.resolve(false);
    return true;
  }

  assertSettled(owner) {
    if (this.active?.owner === owner) {
      throw new Error("motion-cue presentation committed before its timeline settled");
    }
    return true;
  }

  fail(active) {
    if (this.active !== active) return false;
    this.active = null;
    active.leadIn?.resolve(false);
    active.finish?.resolve(false);
    return false;
  }
}

export function createMotionCuePresentationRuntime(options) {
  return new MotionCuePresentationRuntime(options);
}
