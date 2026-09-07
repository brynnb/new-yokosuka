function requireFourcc(value) {
  const fourcc = String(value || "");
  if (fourcc.length !== 4) {
    throw new TypeError("native look-point actor tag must have four bytes");
  }
  return fourcc;
}

function requireDword(value, name) {
  if (!Number.isInteger(value)) {
    throw new TypeError(`native look-point ${name} must be an integer`);
  }
  return value >>> 0;
}

const LOOK_POINT_SELECTOR_WORDS = Object.freeze([
  0x1000,
  0x0800,
  0x0200,
  0x0080,
  0x0040,
  0x0020,
  0x1000,
  0x0800,
  0x8002,
  0x8003,
  0x8004,
  0x8006,
  0x8008,
  0x800a,
  0x0800,
  0x8066,
  0x8068,
  0x806c,
  0x0800,
  0x0800,
  0x8065,
  0x0800,
]);

function selectorWord(selector) {
  const index = selector === -1 ? 12 : Math.abs(selector);
  if (!Number.isSafeInteger(index) || index >= LOOK_POINT_SELECTOR_WORDS.length) {
    return undefined;
  }
  return LOOK_POINT_SELECTOR_WORDS[index];
}

function requireVector(value, name = "vector") {
  if (
    !Array.isArray(value)
    || value.length !== 3
    || value.some(word => !Number.isInteger(word))
  ) {
    throw new TypeError(
      `native look-point ${name} must contain three words`,
    );
  }
  return value.map(word => word >>> 0);
}

function cloneRecord(record) {
  if (!record) return null;
  return {
    available: record.available,
    vector: [...record.vector],
    selectorWord12: record.selectorWord12,
    selectorWord14: record.selectorWord14,
    activeDword: record.activeDword,
    auxiliaryDword: record.auxiliaryDword,
  };
}

function cloneState(state) {
  if (!state) return undefined;
  return {
    actorAvailable: state.actorAvailable,
    controllerAvailable: state.controllerAvailable,
    terminalStateDword: state.terminalStateDword,
    actorFlagsDword: state.actorFlagsDword,
    controllerFlagsDword: state.controllerFlagsDword,
    controlWord80: state.controlWord80,
    selectorWord: state.selectorWord,
    defaultVector: [...state.defaultVector],
    record: cloneRecord(state.record),
  };
}

function objectTagArgument(action, readArgument) {
  const operand = action.arguments?.[0];
  if (
    operand?.kind === "constant"
    && typeof operand.ascii === "string"
  ) {
    return operand.ascii;
  }
  const value = readArgument(0);
  if (typeof value === "string") return value;
  if (!Number.isInteger(value)) {
    throw new TypeError("native look-point actor tag is unavailable");
  }
  return String.fromCharCode(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
}

export class NativeActorLookPointState {
  constructor() {
    this.actors = new Map();
  }

  configureActor({
    actorTag,
    actorAvailable,
    controllerAvailable = false,
    terminalStateDword = 0,
    actorFlagsDword = 0,
    controllerFlagsDword = 0,
    controlWord80 = 0,
    selectorWord = 0,
    defaultVector = [0, 0, 0],
    record = null,
  }) {
    if (
      typeof actorAvailable !== "boolean"
      || typeof controllerAvailable !== "boolean"
    ) {
      throw new TypeError(
        "native look-point actor/controller availability must be boolean",
      );
    }
    let configuredRecord = null;
    if (record !== null) {
      if (!record || typeof record.available !== "boolean") {
        throw new TypeError(
          "native LKPT record availability must be boolean",
        );
      }
      configuredRecord = {
        available: record.available,
        vector: requireVector(record.vector ?? [0, 0, 0]),
        selectorWord12: (
          requireDword(record.selectorWord12 ?? 0, "record word +0x0c")
          & 0xffff
        ),
        selectorWord14: (
          requireDword(record.selectorWord14 ?? 0, "record word +0x0e")
          & 0xffff
        ),
        activeDword: requireDword(
          record.activeDword ?? 0,
          "record active dword",
        ),
        auxiliaryDword: requireDword(
          record.auxiliaryDword ?? 0,
          "record auxiliary dword",
        ),
      };
    }
    this.actors.set(requireFourcc(actorTag), {
      actorAvailable,
      controllerAvailable,
      terminalStateDword: requireDword(
        terminalStateDword,
        "terminal state",
      ),
      actorFlagsDword: requireDword(actorFlagsDword, "actor flags"),
      controllerFlagsDword: requireDword(
        controllerFlagsDword,
        "controller flags",
      ),
      controlWord80: requireDword(controlWord80, "control word +0x80")
        & 0xffff,
      selectorWord: requireDword(selectorWord, "selector word") & 0xffff,
      defaultVector: requireVector(defaultVector, "default vector"),
      record: configuredRecord,
    });
  }

  applyControl({
    actorTag,
    selector,
    targetVector,
    mode,
  }) {
    const state = this.actors.get(requireFourcc(actorTag));
    if (!Number.isSafeInteger(selector)) {
      throw new TypeError("native look-point selector must be an integer");
    }
    requireDword(mode, "mode");
    if (!state || !state.actorAvailable || !state.controllerAvailable) {
      return {
        applied: false,
        nativeNoOp: true,
        reason: !state || !state.actorAvailable
          ? "actor-missing"
          : "actor-motm-controller-missing",
      };
    }
    if (state.terminalStateDword === 1) {
      return {
        applied: false,
        nativeNoOp: true,
        reason: "actor-look-point-controller-terminal",
      };
    }
    const mappedWord = selectorWord(selector);
    if (mappedWord === undefined) {
      return {
        applied: false,
        reason: "actor-look-point-selector-map-unavailable",
      };
    }

    state.actorFlagsDword &= 0xf7ffffff;
    if (!state.record) {
      state.record = {
        available: true,
        vector: [0, 0, 0],
        selectorWord12: 0,
        selectorWord14: 0,
        activeDword: 0,
        auxiliaryDword: 0,
      };
    }
    const record = state.record;
    if (!record.available) {
      return {
        applied: false,
        reason: "actor-look-point-record-unavailable",
      };
    }
    record.auxiliaryDword = 0;
    if (record.activeDword === 0) state.controlWord80 = 0;
    if (
      selector < 0
      && (
        (state.controllerFlagsDword & 0x40) !== 0
        || record.activeDword !== 1
      )
    ) {
      return {
        applied: false,
        nativeNoOp: true,
        reason: "actor-look-point-release-inactive",
        state: cloneState(state),
      };
    }

    record.vector = targetVector === null
      ? [...state.defaultVector]
      : requireVector(targetVector, "target vector");
    state.actorFlagsDword |= 0x4000;
    state.controllerFlagsDword &= 0xffffffbf;
    state.selectorWord = mappedWord;
    if (selector >= 0) {
      record.activeDword = 1;
      state.controllerFlagsDword |= 0x00200000;
      if (mode === 1) {
        state.actorFlagsDword |= 0x00400000;
        state.actorFlagsDword &= 0xff7fffff;
        state.controllerFlagsDword &= 0xfffdffff;
      } else if (mode === 2) {
        state.actorFlagsDword |= 0x00c00000;
        state.controllerFlagsDword &= 0xfffdffff;
      } else if (mode === 3) {
        state.actorFlagsDword |= 0x00c00000;
        state.controllerFlagsDword |= 0x00020000;
      } else {
        state.actorFlagsDword &= 0xff3fffff;
        state.controllerFlagsDword &= 0xfffdffff;
      }
    } else {
      record.activeDword = 0;
      state.controlWord80 = 0;
      state.controllerFlagsDword |= 0x40;
    }
    return {
      applied: true,
      path: selector >= 0
        ? "full-lkpt-install"
        : "full-lkpt-release",
      recordTag: "LKPT",
      selector,
      mappedSelectorWord: mappedWord,
      mode: mode >>> 0,
      usedDefaultVector: targetVector === null,
      state: cloneState(state),
    };
  }

  applyOptimizedUpdate({
    actorTag,
    selector,
    targetVector,
    mode,
  }) {
    const state = this.actors.get(requireFourcc(actorTag));
    if (!state) {
      return {
        applied: false,
        reason: "actor-look-point-state-unavailable",
      };
    }
    requireDword(selector, "selector");
    requireDword(mode, "mode");
    if (!state.actorAvailable || !state.controllerAvailable) {
      return {
        applied: false,
        reason: (
          !state.actorAvailable
            ? "actor-missing"
            : "actor-motm-controller-missing"
        ),
      };
    }
    if (state.terminalStateDword === 1) {
      return {
        applied: false,
        reason: "actor-look-point-controller-terminal",
      };
    }
    const record = state.record;
    if (
      !record?.available
      || record.activeDword === 0
      || (state.controllerFlagsDword & 0x40)
    ) {
      return {
        applied: false,
        reason: "actor-look-point-full-control-required",
      };
    }
    const vector = targetVector === null
      ? state.defaultVector
      : requireVector(targetVector, "target vector");
    if (targetVector !== null) {
      if (record.selectorWord14 === 0x8065) {
        record.selectorWord12 = state.selectorWord;
      }
      if (state.selectorWord !== 0x8065) {
        record.selectorWord12 = state.selectorWord;
      }
      record.selectorWord14 = state.selectorWord;
    }
    record.vector = [...vector];
    record.auxiliaryDword = 0;
    return {
      applied: true,
      path: "optimized-active-lkpt-update",
      recordTag: "LKPT",
      selector: selector >>> 0,
      mode: mode >>> 0,
      usedDefaultVector: targetVector === null,
      state: cloneState(state),
    };
  }

  readActor(actorTag) {
    return cloneState(this.actors.get(requireFourcc(actorTag)));
  }
}

export function createNativeActorLookPointSemanticHandlers({
  applyActorLookPointOptimizedUpdate,
  readNativeVector,
} = {}) {
  return {
    "actor-look-point-update-control": async ({
      action,
      context,
      readArgument,
    }) => {
      const applyUpdate = (
        applyActorLookPointOptimizedUpdate
        || context.applyActorLookPointOptimizedUpdate
      );
      const readVector = readNativeVector || context.readNativeVector;
      if (typeof applyUpdate !== "function") {
        return {
          status: "stopped",
          reason: "actor-look-point-update-adapter-missing",
        };
      }
      const targetPointer = readArgument(2);
      let targetVector = null;
      if (targetPointer !== 0) {
        if (typeof readVector !== "function") {
          return {
            status: "stopped",
            reason: "native-vector-reader-missing",
          };
        }
        targetVector = await readVector(targetPointer);
        if (!Array.isArray(targetVector) || targetVector.length !== 3) {
          return {
            status: "stopped",
            reason: "actor-look-point-target-vector-unavailable",
          };
        }
      }
      const mutation = await applyUpdate({
        actorTag: objectTagArgument(action, readArgument),
        selector: readArgument(1),
        targetPointer,
        targetVector,
        mode: readArgument(3),
        source: {
          functionFileOffset: context.location?.functionId,
          callFileOffset: action.callFileOffset,
        },
      });
      if (
        mutation?.reason === "actor-look-point-state-unavailable"
        || mutation?.reason === "actor-look-point-full-control-required"
      ) {
        return { status: "stopped", reason: mutation.reason };
      }
      return { status: "continued", mutation };
    },
  };
}

export function createNativeActorLookPointState() {
  return new NativeActorLookPointState();
}
