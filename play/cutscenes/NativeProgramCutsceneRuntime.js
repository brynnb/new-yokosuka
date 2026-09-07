function requireFunction(value, label) {
  if (typeof value !== "function") throw new TypeError(`${label} is required`);
  return value;
}

function requireIdentifier(value, label) {
  const identifier = String(value || "").trim();
  if (!identifier) throw new TypeError(`${label} is required`);
  return identifier;
}

function requireNativeRuntime(value) {
  if (
    !value
    || typeof value.program !== "function"
    || typeof value.startProgram !== "function"
    || typeof value.onSettled !== "function"
    || typeof value.cancel !== "function"
  ) {
    throw new TypeError("native scripted event runtime is incomplete");
  }
  return value;
}

function reviewedEntries(program) {
  return new Set([
    program.entryFunction,
    ...(Array.isArray(program.directEntries) ? program.directEntries : []),
  ]);
}

function stoppedReason(kind, result) {
  const nested = nestedStopReason(result?.result);
  if (nested !== null) return nested;
  return result?.reason ?? result?.status ?? kind;
}

function nestedStopReason(reason) {
  let current = reason;
  let deepest = null;
  while (current && typeof current === "object") {
    if (current.reason !== undefined) deepest = current.reason;
    current = current.result;
  }
  return deepest;
}

function startFailureError(cutsceneId, reason) {
  if (reason instanceof Error) return reason;
  const nestedReason = nestedStopReason(reason?.result) ?? reason;
  const nestedKind = typeof nestedReason?.kind === "string"
    ? nestedReason.kind
    : typeof nestedReason === "string"
      ? nestedReason
      : typeof reason?.result?.status === "string"
        ? reason.result.status
        : null;
  const nestedDetail = nestedReason?.detail;
  const nestedOperation = [
    nestedReason?.semanticId,
    typeof nestedDetail === "string" ? nestedDetail : null,
    nestedDetail?.kind,
    nestedDetail?.message,
    nestedReason?.branchFileOffset,
  ].filter(Boolean).join(":");
  const kind = typeof reason?.kind === "string"
    ? [...new Set([reason.kind, nestedKind, nestedOperation].filter(Boolean))].join(":")
    : typeof reason === "string"
      ? reason
      : "native-program-start-stopped";
  const detail = typeof reason?.message === "string" && reason.message
    ? `: ${reason.message}`
    : "";
  const error = new Error(`Cutscene ${cutsceneId} ${kind}${detail}`);
  error.nativeReason = reason;
  return error;
}

/**
 * Adapts an exact reviewed NativeScriptedEventRuntime program entry to the
 * playback contract used by the cutscene director. The scripted runtime is
 * resolved only when playback starts so construction does not depend on the
 * room-script runtime's initialization order.
 */
export class NativeProgramCutsceneRuntime {
  constructor({
    getNativeRuntime,
    getArea,
    getWorldId,
    activateArea = null,
    restoreArea = null,
    createContext = () => ({}),
    onComplete,
    onStopped,
  } = {}) {
    this.getNativeRuntime = requireFunction(
      getNativeRuntime,
      "native scripted event runtime resolver",
    );
    this.getArea = requireFunction(
      getArea,
      "native program cutscene area resolver",
    );
    this.getWorldId = requireFunction(
      getWorldId,
      "native program cutscene world resolver",
    );
    this.activateArea = activateArea === null
      ? null
      : requireFunction(activateArea, "native program area activation adapter");
    this.restoreArea = restoreArea === null
      ? null
      : requireFunction(restoreArea, "native program area restoration adapter");
    this.createContext = requireFunction(
      createContext,
      "native program cutscene context factory",
    );
    this.onComplete = requireFunction(
      onComplete,
      "native program cutscene completion adapter",
    );
    this.onStopped = requireFunction(
      onStopped,
      "native program cutscene stop adapter",
    );
    this.owner = null;
  }

  get active() {
    return Boolean(this.owner);
  }

  async start(cutscene) {
    if (this.owner) {
      throw new Error("another native program cutscene is already active");
    }

    const cutsceneId = requireIdentifier(cutscene?.id, "cutscene ID");
    const worldId = requireIdentifier(
      cutscene?.worldId,
      `cutscene ${cutsceneId} world ID`,
    );
    const descriptor = cutscene?.program;
    if (!descriptor || typeof descriptor !== "object") {
      throw new TypeError(`cutscene ${cutsceneId} native program is required`);
    }
    const programId = requireIdentifier(
      descriptor.programId,
      `cutscene ${cutsceneId} native program ID`,
    );
    const entryFunction = requireIdentifier(
      descriptor.entryFunction,
      `cutscene ${cutsceneId} native program entry`,
    );

    const activeWorldId = requireIdentifier(
      this.getWorldId(),
      "active cutscene world ID",
    );
    if (activeWorldId !== worldId) {
      throw new Error(
        `cutscene ${cutsceneId} world ${worldId} is not active`,
      );
    }
    if (
      descriptor.worldId !== undefined
      && requireIdentifier(
        descriptor.worldId,
        `cutscene ${cutsceneId} native program world ID`,
      ) !== worldId
    ) {
      throw new Error(
        `cutscene ${cutsceneId} native program world does not match its world`,
      );
    }

    const nativeRuntime = requireNativeRuntime(this.getNativeRuntime());
    const program = nativeRuntime.program(programId);
    if (!program) {
      throw new Error(
        `cutscene ${cutsceneId} references unknown native program ${programId}`,
      );
    }
    if (!reviewedEntries(program).has(entryFunction)) {
      throw new Error(
        `cutscene ${cutsceneId} native program entry ${entryFunction} is not reviewed`,
      );
    }

    const programArea = requireIdentifier(
      program.area,
      `native program ${programId} area`,
    ).toUpperCase();
    if (
      descriptor.area !== undefined
      && requireIdentifier(
        descriptor.area,
        `cutscene ${cutsceneId} native program area`,
      ).toUpperCase() !== programArea
    ) {
      throw new Error(
        `cutscene ${cutsceneId} native program area does not match ${programId}`,
      );
    }
    const activeArea = requireIdentifier(
      this.getArea(),
      "active native cutscene area",
    ).toUpperCase();
    if (activeArea !== programArea) {
      if (!this.activateArea) {
        throw new Error(
          `cutscene ${cutsceneId} native area ${programArea} is not active`,
        );
      }
      await this.activateArea(programArea);
      const activatedArea = requireIdentifier(
        this.getArea(),
        "activated native cutscene area",
      ).toUpperCase();
      if (activatedArea !== programArea) {
        throw new Error(
          `cutscene ${cutsceneId} native area ${programArea} did not activate`,
        );
      }
    }

    const owner = {
      cutsceneId,
      programId,
      entryFunction,
      nativeRuntime,
      unsubscribe: null,
      started: false,
      settlement: null,
      restoreArea: activeArea === programArea ? null : activeArea,
    };
    owner.unsubscribe = nativeRuntime.onSettled(({ kind, result } = {}) => {
      if (this.owner !== owner) return;
      if (
        result?.programId !== owner.programId
        || result?.entryFunction !== owner.entryFunction
      ) return;
      if (kind === "completed") {
        this.#finish(owner, true, null);
      } else {
        this.#finish(owner, false, stoppedReason(kind, result));
      }
    });
    if (typeof owner.unsubscribe !== "function") {
      throw new TypeError(
        "native scripted event settlement subscription is invalid",
      );
    }
    this.owner = owner;

    let context;
    try {
      context = await this.createContext({ cutscene, program });
    } catch (error) {
      // A stop during asynchronous preparation is terminal. Do not turn a
      // late rejection into a second settlement for the released session.
      if (this.owner !== owner) return false;
      this.#finish(owner, false, error);
      throw error;
    }
    if (this.owner !== owner) {
      return owner.settlement === "completed";
    }
    if (!context || typeof context !== "object" || Array.isArray(context)) {
      const error = new TypeError(
        `cutscene ${cutsceneId} native program context is invalid`,
      );
      this.#finish(owner, false, error);
      throw error;
    }

    let result;
    try {
      owner.started = true;
      const invocationFields = program.entryInvocation?.initialFrameFields;
      const initialFrameFields = invocationFields
        && typeof invocationFields === "object"
        && !Array.isArray(invocationFields)
        ? Object.freeze({ ...invocationFields })
        : undefined;
      result = await nativeRuntime.startProgram({
        programId,
        entryFunction,
        area: programArea,
        context: initialFrameFields
          ? { ...context, initialFrameFields }
          : context,
      });
    } catch (error) {
      this.#finish(owner, false, error);
      throw error;
    }

    if (this.owner !== owner) {
      if (owner.settlement === "completed") return true;
      throw startFailureError(cutsceneId, owner.reason);
    }

    // Native execution normally settles through onSettled. A handful of
    // pre-execution guards return a result directly, so close ownership here
    // as a fail-safe when no settlement was emitted.
    if (this.owner === owner) {
      if (result?.status === "completed") {
        this.#finish(owner, true, null);
      } else if (
        result?.status === "stopped"
        || result?.status === "cancelled"
        || result?.status === "not-matched"
      ) {
        const reason = stoppedReason(result.status, result);
        this.#finish(
          owner,
          false,
          reason,
        );
        throw startFailureError(cutsceneId, reason);
      } else if (result?.status !== "yielded") {
        this.#finish(owner, false, "native-program-start-result-invalid");
        return false;
      }
    }
    return result?.status !== "stopped"
      && result?.status !== "cancelled"
      && result?.status !== "not-matched";
  }

  update() {
    // NativeScriptedEventRuntime is updated by the shared room-script loop.
    return false;
  }

  stop(reason = "stopped") {
    const owner = this.owner;
    if (!owner) return false;
    try {
      // Context construction can be asynchronous. Until startProgram owns the
      // shared runtime, cancelling it could terminate an unrelated event.
      if (owner.started) owner.nativeRuntime.cancel(reason);
    } catch (error) {
      this.#finish(owner, false, error);
      throw error;
    }
    if (this.owner === owner) this.#finish(owner, false, reason);
    return true;
  }

  setPaused() {
    return false;
  }

  seekBySeconds(seconds) {
    const owner = this.owner;
    if (
      !owner?.started
      || typeof owner.nativeRuntime.seekBySeconds !== "function"
    ) return false;
    return owner.nativeRuntime.seekBySeconds(seconds) === true;
  }

  transportState() {
    if (!this.owner) return Object.freeze({ active: false });
    return Object.freeze({
      active: true,
      paused: false,
      seeking: false,
    });
  }

  #finish(owner, completed, reason) {
    if (this.owner !== owner) return false;
    this.owner = null;
    owner.settlement = completed ? "completed" : "stopped";
    owner.reason = reason;
    const unsubscribe = owner.unsubscribe;
    owner.unsubscribe = null;
    try {
      unsubscribe?.();
    } catch (error) {
      console.error(
        "Native program cutscene settlement cleanup failed:",
        error,
      );
    }
    if (owner.restoreArea && this.restoreArea) {
      try {
        this.restoreArea(owner.restoreArea);
      } catch (error) {
        console.error(
          "Native program cutscene area restoration failed:",
          error,
        );
      }
    }
    if (completed) this.onComplete(owner.cutsceneId);
    else this.onStopped(reason, owner.cutsceneId);
    return true;
  }
}

export function createNativeProgramCutsceneRuntime(options) {
  return new NativeProgramCutsceneRuntime(options);
}
