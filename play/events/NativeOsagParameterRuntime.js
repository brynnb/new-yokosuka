function requireFourcc(value) {
  const tag = String(value || "");
  if (!/^[\x20-\x7e]{4}$/.test(tag)) {
    throw new TypeError(
      "native OSAG object must be a four-character identifier",
    );
  }
  return tag;
}

function requireWord(value, label) {
  if (!Number.isInteger(value) || value < -0x80000000 || value > 0xffffffff) {
    throw new RangeError(`${label} must be a 32-bit word`);
  }
  return value >>> 0;
}

function objectTagArgument(action, readArgument) {
  const operand = action.arguments?.[0];
  if (operand?.kind === "constant" && typeof operand.ascii === "string") {
    return requireFourcc(operand.ascii);
  }
  const value = readArgument(0);
  if (typeof value === "string") return requireFourcc(value);
  const word = requireWord(value, "native OSAG object tag");
  return requireFourcc(String.fromCharCode(
    word & 0xff,
    (word >>> 8) & 0xff,
    (word >>> 16) & 0xff,
    (word >>> 24) & 0xff,
  ));
}

export class NativeOsagParameterState {
  constructor() {
    this.records = new Map();
  }

  configureRecord({
    objectTag,
    objectAvailable,
    recordAvailable,
    floatWord1e8 = 0,
  }) {
    if (
      typeof objectAvailable !== "boolean"
      || typeof recordAvailable !== "boolean"
    ) {
      throw new TypeError("native OSAG availability must be Boolean");
    }
    const tag = requireFourcc(objectTag);
    this.records.set(tag, {
      objectAvailable,
      recordAvailable,
      floatWord1e8: requireWord(
        floatWord1e8,
        "native OSAG float word +0x01e8",
      ),
    });
    return this.read(tag);
  }

  writeFloatWord1e8(objectTag, value) {
    const tag = requireFourcc(objectTag);
    const record = this.records.get(tag);
    if (!record) {
      return { applied: false, reason: "osag-object-state-unavailable" };
    }
    if (!record.objectAvailable) {
      return { applied: false, nativeNoOp: true, reason: "object-missing" };
    }
    if (!record.recordAvailable) {
      return {
        applied: false,
        nativeNoOp: true,
        reason: "associated-osag-record-missing",
      };
    }
    const previous = record.floatWord1e8;
    record.floatWord1e8 = requireWord(
      value,
      "native OSAG float word +0x01e8",
    );
    return {
      applied: true,
      objectTag: tag,
      componentTag: "OSAG",
      fieldOffset: 0x01e8,
      previous,
      floatWord1e8: record.floatWord1e8,
    };
  }

  read(objectTag) {
    const record = this.records.get(requireFourcc(objectTag));
    return record ? { ...record } : undefined;
  }
}

export function createNativeOsagParameterSemanticHandlers() {
  return {
    "resolved-object-osag-float-word-write": async ({
      action,
      context,
      readArgument,
    }) => {
      const state = context.nativeOsagParameterState;
      if (!state) {
        return {
          status: "stopped",
          reason: "native-osag-parameter-state-missing",
        };
      }
      try {
        const mutation = state.writeFloatWord1e8(
          objectTagArgument(action, readArgument),
          readArgument(1),
        );
        return mutation.reason === "osag-object-state-unavailable"
          ? { status: "stopped", reason: mutation.reason }
          : { status: "continued", mutation };
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
    },
  };
}

export function createNativeOsagParameterState() {
  return new NativeOsagParameterState();
}
