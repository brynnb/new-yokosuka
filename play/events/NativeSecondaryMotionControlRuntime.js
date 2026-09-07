function requireFourcc(value) {
  const tag = String(value || "");
  if (!/^[\x20-\x7e]{4}$/.test(tag)) {
    throw new TypeError(
      "native secondary-motion actor must be a four-character identifier",
    );
  }
  return tag;
}

function requireWord(value, label) {
  if (!Number.isInteger(value)) {
    throw new TypeError(`native secondary-motion ${label} must be an integer`);
  }
  return value >>> 0;
}

function actorTagArgument(action, readArgument) {
  const operand = action.arguments?.[0];
  if (operand?.kind === "constant" && typeof operand.ascii === "string") {
    return requireFourcc(operand.ascii);
  }
  const value = readArgument(0);
  if (typeof value === "string") return requireFourcc(value);
  if (!Number.isInteger(value)) {
    throw new TypeError("native secondary-motion actor is unavailable");
  }
  return requireFourcc(String.fromCharCode(
    value & 0xff,
    value >>> 8 & 0xff,
    value >>> 16 & 0xff,
    value >>> 24 & 0xff,
  ));
}

const GLOBAL_FLOAT_MODES = new Set([0, 1, 2, 3, 10, 11, 20, 21, 30, 31]);

export class NativeSecondaryMotionControlState {
  constructor() {
    this.clear();
  }

  clear() {
    this.globalFloatWords = new Map();
    this.actors = new Map();
  }

  writeGlobalFloat(mode, value) {
    if (!GLOBAL_FLOAT_MODES.has(mode)) {
      throw new RangeError(
        `native secondary-motion global float mode ${mode} is unsupported`,
      );
    }
    const word = requireWord(value, "global float word");
    this.globalFloatWords.set(mode, word);
    return { mode, word };
  }

  readGlobalFloat(mode) {
    return this.globalFloatWords.get(mode);
  }

  configureActor({
    actorTag,
    actorAvailable,
    recordAvailable,
    modeByte06 = 0,
    flagsByte00 = 0,
    initialized = false,
  }) {
    if (
      typeof actorAvailable !== "boolean"
      || typeof recordAvailable !== "boolean"
      || typeof initialized !== "boolean"
    ) {
      throw new TypeError(
        "native secondary-motion actor availability must be Boolean",
      );
    }
    const tag = requireFourcc(actorTag);
    this.actors.set(tag, {
      actorAvailable,
      recordAvailable,
      modeByte06: requireWord(modeByte06, "mode byte") & 0xff,
      flagsByte00: requireWord(flagsByte00, "flags byte") & 0xff,
      initialized,
    });
    return this.readActor(tag);
  }

  applyActorMode(actorTag, mode) {
    const tag = requireFourcc(actorTag);
    const actor = this.actors.get(tag);
    if (!actor) {
      return {
        applied: false,
        reason: "secondary-motion-actor-state-unavailable",
      };
    }
    if (!actor.actorAvailable) {
      return { applied: false, nativeNoOp: true, reason: "actor-missing" };
    }
    if (!actor.recordAvailable) {
      return {
        applied: false,
        nativeNoOp: true,
        reason: "secondary-motion-record-missing",
      };
    }
    actor.modeByte06 = requireWord(mode, "mode byte") & 0xff;
    actor.initialized = true;
    return { applied: true, actorTag: tag, state: this.readActor(tag) };
  }

  applyActorFlag(actorTag, mask, enabled) {
    const tag = requireFourcc(actorTag);
    const actor = this.actors.get(tag);
    if (!actor) {
      return {
        applied: false,
        reason: "secondary-motion-actor-state-unavailable",
      };
    }
    if (!actor.actorAvailable) {
      return { applied: false, nativeNoOp: true, reason: "actor-missing" };
    }
    if (!actor.recordAvailable) {
      return {
        applied: false,
        nativeNoOp: true,
        reason: "secondary-motion-record-missing",
      };
    }
    if (![2, 4, 8].includes(mask)) {
      throw new RangeError("native secondary-motion flag mask is unsupported");
    }
    if (enabled !== 0 && enabled !== 1) {
      throw new RangeError("native secondary-motion flag state must be 0 or 1");
    }
    actor.flagsByte00 = enabled
      ? actor.flagsByte00 | mask
      : actor.flagsByte00 & ~mask;
    return { applied: true, actorTag: tag, state: this.readActor(tag) };
  }

  readActor(actorTag) {
    const actor = this.actors.get(requireFourcc(actorTag));
    return actor ? { ...actor } : undefined;
  }
}

export function createNativeSecondaryMotionControlSemanticHandlers() {
  return {
    "native-secondary-motion-global-float-write": async ({
      context,
      readArgument,
    }) => {
      const state = context.nativeSecondaryMotionControlState;
      if (!state) {
        return {
          status: "stopped",
          reason: "native-secondary-motion-control-state-missing",
        };
      }
      try {
        return {
          status: "continued",
          mutation: state.writeGlobalFloat(
            readArgument(0),
            readArgument(1),
          ),
        };
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
    },
    "resolved-secondary-motion-mode-write": async ({
      action,
      context,
      readArgument,
    }) => {
      const state = context.nativeSecondaryMotionControlState;
      if (!state) {
        return {
          status: "stopped",
          reason: "native-secondary-motion-control-state-missing",
        };
      }
      try {
        const mutation = state.applyActorMode(
          actorTagArgument(action, readArgument),
          readArgument(1),
        );
        return mutation.reason === "secondary-motion-actor-state-unavailable"
          ? { status: "stopped", reason: mutation.reason }
          : { status: "continued", mutation };
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
    },
    "resolved-secondary-motion-flag-write": async ({
      action,
      context,
      readArgument,
    }) => {
      const state = context.nativeSecondaryMotionControlState;
      if (!state) {
        return {
          status: "stopped",
          reason: "native-secondary-motion-control-state-missing",
        };
      }
      try {
        const mutation = state.applyActorFlag(
          actorTagArgument(action, readArgument),
          readArgument(1),
          readArgument(2),
        );
        return mutation.reason === "secondary-motion-actor-state-unavailable"
          ? { status: "stopped", reason: mutation.reason }
          : { status: "continued", mutation };
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
    },
  };
}

export function createNativeSecondaryMotionControlState() {
  return new NativeSecondaryMotionControlState();
}
