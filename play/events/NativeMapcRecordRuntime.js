function objectTag(argument, readArgument) {
  if (
    argument?.kind === "constant"
    && typeof argument.ascii === "string"
  ) {
    return argument.ascii;
  }
  const value = readArgument(0);
  if (typeof value === "string" && value.length === 4) return value;
  if (!Number.isInteger(value)) {
    throw new TypeError("native MAPC object tag is unavailable");
  }
  return String.fromCharCode(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
}

function requireTag(value) {
  const tag = String(value || "");
  if (tag.length !== 4) {
    throw new TypeError("native MAPC object tag must contain four characters");
  }
  return tag;
}

export class NativeMapcRecordState {
  constructor() {
    this.objects = new Map();
  }

  configure({
    objectTag: tag,
    objectAvailable,
    recordAvailable,
    controlWord = 0,
    objectFloatWord48,
  }) {
    if (
      typeof objectAvailable !== "boolean"
      || typeof recordAvailable !== "boolean"
    ) {
      throw new TypeError("native object and MAPC availability must be boolean");
    }
    if (!Number.isInteger(controlWord)) {
      throw new TypeError("native MAPC control word must be an integer");
    }
    if (
      objectFloatWord48 !== undefined
      && !Number.isInteger(objectFloatWord48)
    ) {
      throw new TypeError("native object +0x48 float word must be an integer");
    }
    const key = requireTag(tag);
    this.objects.set(key, {
      objectAvailable,
      recordAvailable,
      controlWord: controlWord >>> 0,
      objectFloatWord48: objectFloatWord48 === undefined
        ? undefined
        : objectFloatWord48 >>> 0,
    });
    return this.read(key);
  }

  apply({ objectTag: tag, rawValue }) {
    if (!Number.isInteger(rawValue)) {
      throw new TypeError("native MAPC control value must be an integer");
    }
    const key = requireTag(tag);
    const state = this.objects.get(key);
    if (!state) return undefined;
    if (!state.objectAvailable) {
      return {
        applied: false,
        nativeNoOp: true,
        reason: "resolved-object-missing",
        objectTag: key,
      };
    }
    const priorActive = state.recordAvailable
      ? (state.controlWord & 1) !== 0
      : false;
    if (state.recordAvailable) {
      state.controlWord = rawValue === 0
        ? (state.controlWord & ~1) >>> 0
        : (state.controlWord | 1) >>> 0;
    }
    if (rawValue === 0) {
      state.objectFloatWord48 = 0x3f800000;
    }
    return {
      applied: state.recordAvailable || rawValue === 0,
      objectTag: key,
      recordTag: "MAPC",
      priorActive,
      state: this.read(key),
    };
  }

  read(tag) {
    const state = this.objects.get(requireTag(tag));
    return state ? { ...state } : undefined;
  }
}

export function createNativeMapcRecordState() {
  return new NativeMapcRecordState();
}

export function createNativeMapcRecordSemanticHandlers({
  applyResolvedObjectMapcControl,
} = {}) {
  return {
    "resolved-object-mapc-bit-control": async ({
      action,
      context,
      readArgument,
    }) => {
      const applyControl = (
        applyResolvedObjectMapcControl
        || context.applyResolvedObjectMapcControl
      );
      if (typeof applyControl !== "function") {
        return {
          status: "stopped",
          reason: "resolved-object-mapc-control-adapter-missing",
        };
      }
      let tag;
      let rawValue;
      try {
        tag = objectTag(action.arguments?.[0], readArgument);
        rawValue = readArgument(1);
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
      if (!Number.isInteger(rawValue) || (rawValue !== 0 && rawValue !== 1)) {
        return {
          status: "stopped",
          reason: "resolved-object-mapc-control-value-unproved",
        };
      }
      const mutation = await applyControl({
        objectTag: tag,
        recordTag: "MAPC",
        rawValue,
        enabled: rawValue !== 0,
        setObjectFloatWord48: rawValue === 0 ? 0x3f800000 : undefined,
        source: {
          functionFileOffset: context.location?.functionId,
          callFileOffset: action.callFileOffset,
        },
      });
      if (mutation === undefined) {
        return {
          status: "stopped",
          reason: "resolved-object-mapc-state-unavailable",
        };
      }
      return { status: "continued", mutation };
    },
  };
}
