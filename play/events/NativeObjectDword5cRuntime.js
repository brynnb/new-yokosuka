const FLAG_MASK = 0x00000040;

function requireFourcc(value) {
  const fourcc = String(value || "");
  if (fourcc.length !== 4) {
    throw new TypeError(
      "native object dword-5c state requires a four-character ID",
    );
  }
  for (const character of fourcc) {
    if (character.codePointAt(0) > 0xff) {
      throw new TypeError(
        "native object dword-5c ID must be byte-oriented",
      );
    }
  }
  return fourcc;
}

function requireWord(value, label) {
  if (
    !Number.isInteger(value)
    || value < -0x80000000
    || value > 0xffffffff
  ) {
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
  const word = requireWord(value, "native object dword-5c object tag");
  return requireFourcc(String.fromCharCode(
    word & 0xff,
    (word >>> 8) & 0xff,
    (word >>> 16) & 0xff,
    (word >>> 24) & 0xff,
  ));
}

export class NativeObjectDword5cState {
  constructor() {
    this.records = new Map();
    this.invalidationGeneration = 0;
  }

  configureObject({ objectTag, dword5c }) {
    const key = requireFourcc(objectTag);
    if (dword5c !== null) {
      requireWord(dword5c, "native object dword +0x5c");
    }
    const previous = this.records.get(key);
    const record = {
      objectPresent: dword5c !== null,
      dword5c: dword5c === null ? null : dword5c >>> 0,
      revision: (previous?.revision ?? 0) + 1,
    };
    this.records.set(key, record);
    return this.readObject(key);
  }

  readObject(objectTag) {
    const record = this.records.get(requireFourcc(objectTag));
    if (!record) return undefined;
    return {
      objectPresent: record.objectPresent,
      dword5c: record.dword5c,
      revision: record.revision,
    };
  }

  planControl({ objectTag, command }) {
    const key = requireFourcc(objectTag);
    const commandWord = requireWord(
      command,
      "native object dword-5c command",
    );
    const record = this.records.get(key);
    if (!record) {
      return {
        available: false,
        reason: "native-object-dword-5c-state-unavailable",
      };
    }
    const result = (
      record.objectPresent && (record.dword5c & FLAG_MASK)
    ) ? 1 : 0;
    let nextDword5c = record.dword5c;
    if (record.objectPresent && commandWord === 0) {
      nextDword5c = (record.dword5c & ~FLAG_MASK) >>> 0;
    } else if (record.objectPresent && commandWord === 1) {
      nextDword5c = (record.dword5c | FLAG_MASK) >>> 0;
    }
    return {
      available: true,
      objectTag: key,
      command: commandWord,
      result,
      expectedRevision: record.revision,
      objectPresent: record.objectPresent,
      previousDword5c: record.dword5c,
      nextDword5c,
      mutates: nextDword5c !== record.dword5c,
    };
  }

  commitControl(plan) {
    if (!plan?.available) {
      throw new TypeError("native object dword-5c plan is unavailable");
    }
    const record = this.records.get(requireFourcc(plan.objectTag));
    if (!record || record.revision !== plan.expectedRevision) {
      throw new Error("native object dword-5c plan is stale");
    }
    if (plan.mutates) {
      record.dword5c = requireWord(
        plan.nextDword5c,
        "native object dword +0x5c",
      );
      record.revision += 1;
    }
    return this.readObject(plan.objectTag);
  }

  planLowFlagControl({ objectTag, command }) {
    const key = requireFourcc(objectTag);
    const commandWord = requireWord(
      command,
      "native object dword-5c low-flag command",
    );
    const record = this.records.get(key);
    if (!record) {
      return {
        available: false,
        reason: "native-object-dword-5c-state-unavailable",
      };
    }
    let nextDword5c = record.dword5c;
    if (record.objectPresent) {
      nextDword5c = commandWord === 0
        ? ((record.dword5c | 0x00000002) & ~0x00000001) >>> 0
        : (record.dword5c & ~0x00000001) >>> 0;
    }
    return {
      available: true,
      objectTag: key,
      command: commandWord,
      expectedRevision: record.revision,
      expectedInvalidationGeneration: this.invalidationGeneration,
      objectPresent: record.objectPresent,
      previousDword5c: record.dword5c,
      nextDword5c,
      mutates: nextDword5c !== record.dword5c,
    };
  }

  commitLowFlagControl(plan) {
    if (!plan?.available) {
      throw new TypeError("native object dword-5c low-flag plan is unavailable");
    }
    const record = this.records.get(requireFourcc(plan.objectTag));
    if (
      !record
      || record.revision !== plan.expectedRevision
      || this.invalidationGeneration !== plan.expectedInvalidationGeneration
    ) {
      throw new Error("native object dword-5c low-flag plan is stale");
    }
    if (plan.mutates) {
      record.dword5c = requireWord(
        plan.nextDword5c,
        "native object dword +0x5c",
      );
      record.revision += 1;
    }
    if (plan.objectPresent) this.invalidationGeneration += 1;
    return this.readObject(plan.objectTag);
  }

  readInvalidationGeneration() {
    return this.invalidationGeneration;
  }
}

export function createNativeObjectDword5cState() {
  return new NativeObjectDword5cState();
}

export function createNativeObjectDword5cSemanticHandlers() {
  return {
    "resolved-object-dword-5c-bit-6-control": async ({
      action,
      context,
      readArgument,
    }) => {
      let objectTag;
      let command;
      try {
        objectTag = objectTagArgument(action, readArgument);
        command = requireWord(
          readArgument(1),
          "native object dword-5c command",
        );
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
      const state = context.nativeObjectDword5cState;
      if (!state || typeof state.planControl !== "function") {
        return {
          status: "stopped",
          reason: "native-object-dword-5c-runtime-state-missing",
        };
      }
      const plan = state.planControl({ objectTag, command });
      if (!plan.available) {
        return { status: "stopped", reason: plan.reason };
      }
      if (typeof state.commitControl !== "function") {
        return {
          status: "stopped",
          reason: "native-object-dword-5c-commit-missing",
        };
      }
      state.commitControl(plan);
      return {
        result: plan.result,
        mutation: {
          objectTag,
          command,
          objectPresent: plan.objectPresent,
          writeRoute: command === 0
            ? "clear"
            : command === 1
              ? "set"
              : null,
          changed: plan.mutates,
        },
      };
    },
    "resolved-object-dword-5c-low-flags-control": async ({
      action,
      context,
      readArgument,
    }) => {
      let objectTag;
      let command;
      try {
        objectTag = objectTagArgument(action, readArgument);
        command = requireWord(
          readArgument(1),
          "native object dword-5c low-flag command",
        );
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
      const state = context.nativeObjectDword5cState;
      if (!state || typeof state.planLowFlagControl !== "function") {
        return {
          status: "stopped",
          reason: "native-object-dword-5c-runtime-state-missing",
        };
      }
      const plan = state.planLowFlagControl({ objectTag, command });
      if (!plan.available) {
        return { status: "stopped", reason: plan.reason };
      }
      if (typeof state.commitLowFlagControl !== "function") {
        return {
          status: "stopped",
          reason: "native-object-dword-5c-low-flag-commit-missing",
        };
      }
      state.commitLowFlagControl(plan);
      return {
        status: "continued",
        mutation: {
          objectTag,
          command,
          objectPresent: plan.objectPresent,
          previousDword5c: plan.previousDword5c,
          nextDword5c: plan.nextDword5c,
          invalidationGeneration: state.readInvalidationGeneration(),
        },
      };
    },
  };
}
