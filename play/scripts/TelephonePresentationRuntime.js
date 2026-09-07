function accepted(value) {
  return value === true;
}

function deferred() {
  let resolve;
  const promise = new Promise(resolve_ => { resolve = resolve_; });
  return { promise, resolve };
}

function validTick(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function reached(elapsedTicks, targetTick) {
  return elapsedTicks + Number.EPSILON * Math.max(1, targetTick) * 8
    >= targetTick;
}

function validateStart(sequence) {
  if (
    !sequence?.callId
    || sequence.tickRate !== 30
    || !validTick(sequence.answer?.tick)
    || !validTick(sequence.hangup?.tick)
    || !validTick(sequence.dialogueLeadInTicks)
    || sequence.answer.tick >= sequence.dialogueLeadInTicks
    || sequence.dialogueLeadInTicks >= sequence.hangup.tick
  ) {
    throw new Error("telephone call sequence has an invalid native timeline");
  }
}

// Owns the timing relationship between the native main, answer, and hang-up
// coroutines. It is deliberately presentation-only: durable story effects stay
// in the server event transaction.
export class TelephonePresentationRuntime {
  constructor({
    playSound,
    attachReceiver,
    updateReceiver,
    detachReceiver,
  } = {}) {
    if (
      typeof playSound !== "function"
      || typeof attachReceiver !== "function"
      || typeof updateReceiver !== "function"
      || typeof detachReceiver !== "function"
    ) {
      throw new TypeError("telephone presentation requires complete typed adapters");
    }
    this.playSound = playSound;
    this.attachReceiver = attachReceiver;
    this.updateReceiver = updateReceiver;
    this.detachReceiver = detachReceiver;
    this.active = null;
  }

  play(sequence, owner) {
    switch (sequence?.kind) {
    case "telephone-ring":
      return this.startRing(sequence, owner);
    case "telephone-call-start":
      return this.startCall(sequence, owner);
    case "telephone-call-finish":
      return this.finishCall(sequence, owner);
    default:
      return false;
    }
  }

  startRing(sequence, owner) {
    if (
      this.active
      || sequence.tickRate !== 30
      || sequence.cues?.length !== 2
      || sequence.cues[0]?.tick !== 0
      || !validTick(sequence.cues[1]?.tick)
    ) return false;
    if (!accepted(this.playSound(sequence.cues[0], owner))) return false;
    const completion = deferred();
    this.active = {
      kind: "ring",
      owner,
      sequence,
      elapsedTicks: 0,
      completion,
    };
    return completion.promise;
  }

  startCall(sequence, owner) {
    if (this.active) return false;
    validateStart(sequence);
    const leadIn = deferred();
    this.active = {
      kind: "call",
      callId: sequence.callId,
      owner,
      sequence,
      elapsedTicks: 0,
      receiverAttached: false,
      hungUp: false,
      leadIn,
      finish: null,
    };
    return leadIn.promise;
  }

  finishCall(sequence, owner) {
    const active = this.active;
    if (
      active?.kind !== "call"
      || active.owner !== owner
      || active.callId !== sequence.callId
    ) return false;
    if (active.hungUp) {
      this.active = null;
      return true;
    }
    if (active.finish) return false;
    active.finish = deferred();
    return active.finish.promise;
  }

  update(owner, deltaSeconds) {
    const active = this.active;
    if (!active || active.owner !== owner) return true;
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) return false;
    active.elapsedTicks += deltaSeconds * active.sequence.tickRate;
    if (active.kind === "ring") return this.updateRing(active);
    return this.updateCall(active);
  }

  updateRing(active) {
    const cue = active.sequence.cues[1];
    if (!reached(active.elapsedTicks, cue.tick)) return true;
    const result = accepted(this.playSound(cue, active.owner));
    this.active = null;
    active.completion.resolve(result);
    return result;
  }

  updateCall(active) {
    const { sequence } = active;
    if (!active.receiverAttached && reached(active.elapsedTicks, sequence.answer.tick)) {
      if (!accepted(this.playSound(sequence.answer.sound, active.owner))) {
        return this.fail(active);
      }
      if (!accepted(this.attachReceiver(sequence.answer.receiver, active.owner))) {
        return this.fail(active);
      }
      active.receiverAttached = true;
    }
    if (
      active.receiverAttached
      && !accepted(this.updateReceiver(sequence.answer.receiver, active.owner))
    ) {
      return this.fail(active);
    }
    if (reached(active.elapsedTicks, sequence.dialogueLeadInTicks) && active.leadIn) {
      active.leadIn.resolve(true);
      active.leadIn = null;
    }
    if (!active.hungUp && reached(active.elapsedTicks, sequence.hangup.tick)) {
      if (!accepted(this.playSound(sequence.hangup.sound, active.owner))) {
        return this.fail(active);
      }
      if (!accepted(this.detachReceiver(sequence.answer.receiver, active.owner))) {
        return this.fail(active);
      }
      active.receiverAttached = false;
      active.hungUp = true;
      if (active.finish) {
        this.active = null;
        active.finish.resolve(true);
      }
    }
    return true;
  }

  cancel(owner) {
    const active = this.active;
    if (!active || active.owner !== owner) return false;
    this.active = null;
    let cleaned = true;
    if (active.kind === "ring") {
      active.completion.resolve(false);
      return true;
    }
    if (active.receiverAttached) {
      cleaned = accepted(this.detachReceiver(
        active.sequence.answer.receiver,
        active.owner,
      ));
    }
    active.leadIn?.resolve(false);
    active.finish?.resolve(false);
    return cleaned;
  }

  assertSettled(owner) {
    if (this.active?.owner === owner) {
      throw new Error("telephone presentation committed before its timeline settled");
    }
    return true;
  }

  fail(active) {
    if (this.active !== active) return false;
    this.active = null;
    if (active.receiverAttached) {
      this.detachReceiver(active.sequence.answer.receiver, active.owner);
    }
    active.leadIn?.resolve(false);
    active.finish?.resolve(false);
    return false;
  }
}

export function createTelephonePresentationRuntime(options) {
  return new TelephonePresentationRuntime(options);
}
