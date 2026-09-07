function requireFourcc(value) {
  const fourcc = String(value || "");
  if (fourcc.length !== 4) {
    throw new TypeError("native FACE/CLIP actor requires a four-character ID");
  }
  return fourcc;
}

function requireBoolean(value, name) {
  if (typeof value !== "boolean") {
    throw new TypeError(`native FACE/CLIP ${name} must be boolean`);
  }
  return value;
}

function requireByte(value, name) {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new RangeError(`native FACE/CLIP ${name} must be a byte`);
  }
  return value;
}

function requireWord(value, name) {
  if (!Number.isInteger(value)) {
    throw new TypeError(`native FACE/CLIP ${name} must be an integer word`);
  }
  return value & 0xffff;
}

function signedByte(value) {
  return (value << 24) >> 24;
}

function signedWord(value) {
  return (value << 16) >> 16;
}

function clone(value) {
  return value ? { ...value } : undefined;
}

function actorTagArgument(action, readArgument) {
  const operand = action.arguments?.[0];
  if (operand?.kind === "constant" && typeof operand.ascii === "string") {
    return operand.ascii;
  }
  const value = readArgument(0);
  if (typeof value === "string") return value;
  if (!Number.isInteger(value)) {
    throw new TypeError("native FACE/CLIP actor tag is unavailable");
  }
  return String.fromCharCode(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
}

export class NativeFaceClipControlState {
  constructor() {
    this.actors = new Map();
  }

  configureActor({
    actorTag,
    actorAvailable,
    momtAvailable,
    faceAvailable,
    clipAvailable,
    faceStateByte47 = 0,
    faceActivityByte45 = 0,
    faceScaledWord2c = 0,
    faceMinimumWord2e = 0,
    faceConditionalWord4a = 0,
    clipModeByte10 = 0,
    clipMinimumWord16 = 0,
    clipParameterWord1c = 0,
  }) {
    const key = requireFourcc(actorTag);
    const state = {
      actorAvailable: requireBoolean(actorAvailable, "actor availability"),
      momtAvailable: requireBoolean(momtAvailable, "MOMT availability"),
      faceAvailable: requireBoolean(faceAvailable, "FACE availability"),
      clipAvailable: requireBoolean(clipAvailable, "CLIP availability"),
      faceStateByte47: requireByte(faceStateByte47, "FACE +0x47"),
      faceActivityByte45: requireByte(faceActivityByte45, "FACE +0x45"),
      faceScaledWord2c: requireWord(faceScaledWord2c, "FACE +0x2c"),
      faceMinimumWord2e: requireWord(faceMinimumWord2e, "FACE +0x2e"),
      faceConditionalWord4a: requireWord(
        faceConditionalWord4a,
        "FACE +0x4a",
      ),
      clipModeByte10: requireByte(clipModeByte10, "CLIP +0x10"),
      clipMinimumWord16: requireWord(clipMinimumWord16, "CLIP +0x16"),
      clipParameterWord1c: requireWord(
        clipParameterWord1c,
        "CLIP +0x1c",
      ),
      revision: 0,
    };
    this.actors.set(key, state);
    return this.readActor(key);
  }

  planControl({
    actorTag,
    scaledSourceWord,
    clipParameterWord,
    minimumWord,
  }) {
    const key = requireFourcc(actorTag);
    const state = this.actors.get(key);
    if (!state) {
      return {
        applied: false,
        reason: "actor-face-clip-control-state-unavailable",
      };
    }
    for (const [available, reason] of [
      [state.actorAvailable, "actor-missing"],
      [state.momtAvailable, "momt-record-missing"],
      [state.faceAvailable, "face-record-missing"],
      [state.clipAvailable, "clip-record-missing"],
    ]) {
      if (!available) return { applied: false, reason, actorTag: key };
    }

    const rawScaledSource = requireWord(scaledSourceWord, "scaled source");
    const rawClipParameter = requireWord(clipParameterWord, "CLIP parameter");
    const rawMinimum = requireWord(minimumWord, "minimum");
    const clampedMinimum = signedWord(rawMinimum) < 1 ? 1 : rawMinimum;
    const next = {
      ...state,
      faceScaledWord2c: Math.imul(rawScaledSource, 6) & 0xffff,
      faceMinimumWord2e: clampedMinimum,
      clipModeByte10: signedWord(rawClipParameter) === -1 ? 1 : 2,
      clipMinimumWord16: clampedMinimum,
      clipParameterWord1c: rawClipParameter,
    };
    if (signedByte(state.faceStateByte47) <= 1) {
      if (state.faceActivityByte45 === 0) {
        next.faceConditionalWord4a = clampedMinimum;
      }
      next.faceActivityByte45 = 1;
    }
    return {
      applied: true,
      actorTag: key,
      expectedRevision: state.revision,
      next,
    };
  }

  commitControl(plan) {
    if (!plan?.applied) return;
    const state = this.actors.get(plan.actorTag);
    if (!state || state.revision !== plan.expectedRevision) {
      throw new Error("native FACE/CLIP control state changed before commit");
    }
    this.actors.set(plan.actorTag, {
      ...plan.next,
      revision: state.revision + 1,
    });
  }

  readActor(actorTag) {
    const state = clone(this.actors.get(requireFourcc(actorTag)));
    if (!state) return undefined;
    delete state.revision;
    return state;
  }
}

export function createNativeFaceClipControlState() {
  return new NativeFaceClipControlState();
}

export function createNativeFaceClipControlSemanticHandlers({
  planControl,
  commitControl,
} = {}) {
  return {
    "actor-face-clip-control-write": async ({
      action,
      context,
      readArgument,
    }) => {
      const planWrite = planControl || context.planActorFaceClipControl;
      const commitWrite = commitControl || context.commitActorFaceClipControl;
      if (
        typeof planWrite !== "function"
        || typeof commitWrite !== "function"
      ) {
        return {
          status: "stopped",
          reason: "actor-face-clip-control-state-missing",
        };
      }
      let plan;
      try {
        plan = await planWrite({
          actorTag: actorTagArgument(action, readArgument),
          scaledSourceWord: readArgument(1),
          clipParameterWord: readArgument(2),
          minimumWord: readArgument(3),
        });
        if (plan.reason === "actor-face-clip-control-state-unavailable") {
          return { status: "stopped", reason: plan.reason };
        }
        if (plan.applied) await commitWrite(plan);
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
      return { status: "continued", mutation: plan };
    },
  };
}
