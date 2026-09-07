function requireFourcc(value) {
  const tag = String(value || "");
  if (tag.length !== 4) {
    throw new TypeError("native FACE controller actor must be four characters");
  }
  return tag;
}

function requireBoolean(value, label) {
  if (typeof value !== "boolean") {
    throw new TypeError(`native FACE controller ${label} must be Boolean`);
  }
  return value;
}

function requireWord(value, label) {
  if (!Number.isInteger(value)) {
    throw new TypeError(`native FACE controller ${label} must be an integer`);
  }
  return value & 0xffff;
}

function requireByte(value, label) {
  if (!Number.isInteger(value)) {
    throw new TypeError(`native FACE controller ${label} must be an integer`);
  }
  return value & 0xff;
}

function actorTagArgument(action, readArgument) {
  const operand = action.arguments?.[0];
  if (operand?.kind === "constant" && typeof operand.ascii === "string") {
    return requireFourcc(operand.ascii);
  }
  const value = readArgument(0);
  if (typeof value === "string") return requireFourcc(value);
  if (!Number.isInteger(value)) {
    throw new TypeError("native FACE controller actor is unavailable");
  }
  return requireFourcc(String.fromCharCode(
    value & 0xff,
    value >>> 8 & 0xff,
    value >>> 16 & 0xff,
    value >>> 24 & 0xff,
  ));
}

export class NativeFaceControllerState {
  constructor() {
    this.actors = new Map();
  }

  configureActor({
    actorTag,
    actorAvailable,
    momtAvailable,
    faceAvailable,
    modeByte00 = 0,
    activeByte01 = 0,
    parameterByte03 = 0,
    elapsedWord04 = 0,
    intervalWord06 = 0,
    randomizedTimerWord08 = 0,
  }) {
    const tag = requireFourcc(actorTag);
    const record = {
      actorAvailable: requireBoolean(actorAvailable, "actor availability"),
      momtAvailable: requireBoolean(momtAvailable, "MOMT availability"),
      faceAvailable: requireBoolean(faceAvailable, "FACE availability"),
      modeByte00: requireByte(modeByte00, "mode byte"),
      activeByte01: requireByte(activeByte01, "active byte"),
      parameterByte03: requireByte(parameterByte03, "parameter byte"),
      elapsedWord04: requireWord(elapsedWord04, "elapsed word"),
      intervalWord06: requireWord(intervalWord06, "interval word"),
      randomizedTimerWord08: requireWord(
        randomizedTimerWord08,
        "randomized timer word",
      ),
    };
    this.actors.set(tag, record);
    return this.readActor(tag);
  }

  applySetup({ actorTag, mode, interval, parameter, randomWord }) {
    const tag = requireFourcc(actorTag);
    const record = this.actors.get(tag);
    if (!record) {
      return {
        applied: false,
        reason: "actor-face-controller-state-unavailable",
      };
    }
    for (const [available, reason] of [
      [record.actorAvailable, "actor-missing"],
      [record.momtAvailable, "momt-record-missing"],
      [record.faceAvailable, "face-record-missing"],
    ]) {
      if (!available) {
        return { applied: false, nativeNoOp: true, reason, actorTag: tag };
      }
    }
    const rawMode = requireByte(mode, "mode");
    const rawInterval = requireWord(interval, "interval");
    const rawParameter = requireByte(parameter, "parameter");
    const rawRandomWord = requireWord(randomWord, "random word");
    const signedInterval = rawInterval << 16 >> 16;
    record.modeByte00 = rawMode;
    record.activeByte01 = 1;
    record.parameterByte03 = rawParameter;
    record.elapsedWord04 = 0;
    record.intervalWord06 = rawMode === 0
      ? 3
      : Math.max(1, signedInterval) & 0xffff;
    record.randomizedTimerWord08 = 60 + ((rawRandomWord & 3) * 10);
    return {
      applied: true,
      actorTag: tag,
      record: this.readActor(tag),
    };
  }

  readActor(actorTag) {
    const record = this.actors.get(requireFourcc(actorTag));
    return record ? { ...record } : undefined;
  }
}

export function createNativeFaceControllerState() {
  return new NativeFaceControllerState();
}

export function createNativeFaceControllerSemanticHandlers({
  randomFloat,
} = {}) {
  return {
    "resolved-face-controller-setup": async ({
      action,
      context,
      readArgument,
    }) => {
      const state = context.nativeFaceControllerState;
      if (!state) {
        return { status: "stopped", reason: "native-face-controller-state-missing" };
      }
      let actorTag;
      try {
        actorTag = actorTagArgument(action, readArgument);
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
      const configured = state.readActor(actorTag);
      if (!configured) {
        return {
          status: "stopped",
          reason: "actor-face-controller-state-unavailable",
        };
      }
      if (
        configured.actorAvailable
        && configured.momtAvailable
        && configured.faceAvailable
        && typeof randomFloat !== "function"
      ) {
        return { status: "stopped", reason: "native-face-controller-random-missing" };
      }
      const unit = configured.actorAvailable
        && configured.momtAvailable
        && configured.faceAvailable
        ? Number(randomFloat())
        : 0;
      if (!Number.isFinite(unit) || unit < 0 || unit >= 1) {
        return { status: "stopped", reason: "native-face-controller-random-invalid" };
      }
      try {
        const mutation = state.applySetup({
          actorTag,
          mode: readArgument(1),
          interval: readArgument(2),
          parameter: readArgument(3),
          randomWord: Math.floor(unit * 0x8000),
        });
        return { status: "continued", mutation };
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
    },
  };
}
