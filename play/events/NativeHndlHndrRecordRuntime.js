const VECTOR_SLOT_COUNT = 71;
const SOURCE_VECTOR_COUNT = 19;
const INSTALLED_SLOT_INDICES = Object.freeze([
  31, 30, 29, 35, 34, 33, 32, 39, 38, 37,
  36, 43, 42, 41, 40, 47, 46, 45, 44,
]);

function requireFourcc(value) {
  const fourcc = String(value || "");
  if (fourcc.length !== 4) {
    throw new TypeError("native HNDL/HNDR object tag must have four bytes");
  }
  return fourcc;
}

function requireRecordTag(value) {
  if (value !== "HNDL" && value !== "HNDR") {
    throw new Error("native associated record must use HNDL or HNDR");
  }
  return value;
}

function requirePointer(value) {
  if (!Number.isInteger(value)) {
    throw new TypeError("native HNDL/HNDR vector-table pointer is required");
  }
  return value >>> 0;
}

function requireVector(value) {
  if (
    !Array.isArray(value)
    || value.length !== 3
    || value.some(word => !Number.isInteger(word))
  ) {
    throw new TypeError("native HNDL/HNDR vector must contain three words");
  }
  return value.map(word => word >>> 0);
}

function rawWordAdd(left, right) {
  return ((left >>> 0) + (right >>> 0)) >>> 0;
}

function requireVectorTable(vectors) {
  if (!Array.isArray(vectors) || vectors.length !== SOURCE_VECTOR_COUNT) {
    throw new TypeError(
      `native HNDL/HNDR source table must contain ${SOURCE_VECTOR_COUNT} vectors`,
    );
  }
  return vectors.map(requireVector);
}

function recordKey(objectTag, recordTag) {
  return `${requireFourcc(objectTag)}:${requireRecordTag(recordTag)}`;
}

function nativeDurationWord(value) {
  if (!Number.isInteger(value)) {
    throw new TypeError("native HNDL/HNDR duration must be an integer");
  }
  const lowWord = value & 0xffff;
  const signedWord = (lowWord << 16) >> 16;
  return signedWord >= 1 ? lowWord : 1;
}

function signedByte(value) {
  if (!Number.isInteger(value)) {
    throw new TypeError("native HNDL/HNDR byte value must be an integer");
  }
  return (value << 24) >> 24;
}

function signedWord(value) {
  if (!Number.isInteger(value)) {
    throw new TypeError("native HNDL/HNDR word value must be an integer");
  }
  return (value << 16) >> 16;
}

function floatFromWord(value) {
  if (!Number.isInteger(value)) {
    throw new TypeError("native HNDL/HNDR float word must be an integer");
  }
  const view = new DataView(new ArrayBuffer(4));
  view.setUint32(0, value >>> 0, true);
  return view.getFloat32(0, true);
}

function floatWordFromSignedInteger(value) {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, Math.fround(value), true);
  return view.getUint32(0, true);
}

function requireIntegerFields(fields) {
  for (const [name, value] of Object.entries(fields)) {
    if (!Number.isInteger(value)) {
      throw new TypeError(`native HNDL/HNDR ${name} must be an integer`);
    }
  }
}

function cloneRecord(record) {
  if (!record) return undefined;
  const controller = record.controller
    ? Object.fromEntries(
        Object.entries(record.controller).filter(
          ([name]) => name !== "selectorResults",
        ),
      )
    : null;
  return {
    activeByte: record.activeByte,
    durationWord: record.durationWord,
    sourcePointer: record.sourcePointer,
    pointer10Present: record.pointer10Present,
    pointer10Vector: record.pointer10Vector
      ? [...record.pointer10Vector]
      : undefined,
    vectorSlots: record.vectorSlots.map(
      vector => (vector ? [...vector] : null),
    ),
    ...(controller ? {
      controller: {
        ...controller,
        primaryControlDwords: [
          ...controller.primaryControlDwords,
        ],
      },
    } : {}),
  };
}

export class NativeHndlHndrRecordState {
  constructor() {
    this.records = new Map();
    this.vectorTables = new Map();
  }

  createRecord() {
    return {
      activeByte: 0,
      durationWord: 0,
      sourcePointer: undefined,
      pointer10Present: undefined,
      pointer10Vector: undefined,
      vectorSlots: Array(VECTOR_SLOT_COUNT).fill(null),
      controller: undefined,
    };
  }

  configureRecord({
    objectTag,
    recordTag,
    available,
    pointer10Present,
    pointer10Vector,
  }) {
    if (typeof available !== "boolean") {
      throw new TypeError("native HNDL/HNDR availability must be boolean");
    }
    const key = recordKey(objectTag, recordTag);
    if (!available) {
      this.records.delete(key);
      return;
    }
    if (!this.records.has(key)) this.records.set(key, this.createRecord());
    const record = this.records.get(key);
    if (pointer10Present !== undefined) {
      if (typeof pointer10Present !== "boolean") {
        throw new TypeError(
          "native HNDL/HNDR record +0x10 presence must be boolean",
        );
      }
      if (pointer10Present && pointer10Vector === undefined) {
        throw new TypeError(
          "native HNDL/HNDR record +0x10 vector is required",
        );
      }
      if (!pointer10Present && pointer10Vector !== undefined) {
        throw new TypeError(
          "null native HNDL/HNDR record +0x10 cannot have a vector",
        );
      }
      record.pointer10Present = pointer10Present;
      record.pointer10Vector = pointer10Present
        ? requireVector(pointer10Vector)
        : undefined;
    } else if (pointer10Vector !== undefined) {
      throw new TypeError(
        "native HNDL/HNDR record +0x10 presence is required",
      );
    }
  }

  configureControllerRecord({
    objectTag,
    recordTag,
    available,
    primaryControllerAvailable,
    secondaryControllerAvailable,
    primaryControlDwords = [0, 0, 0],
    selectorResults = [],
  }) {
    if (
      typeof primaryControllerAvailable !== "boolean"
      || typeof secondaryControllerAvailable !== "boolean"
    ) {
      throw new TypeError(
        "native HNDL/HNDR controller availability must be boolean",
      );
    }
    if (
      !Array.isArray(primaryControlDwords)
      || primaryControlDwords.length !== 3
    ) {
      throw new TypeError(
        "native HNDL/HNDR primary controller needs three dwords",
      );
    }
    requireIntegerFields(Object.fromEntries(
      primaryControlDwords.map((value, index) => [index, value]),
    ));
    this.configureRecord({ objectTag, recordTag, available });
    if (!available) return;
    const record = this.records.get(recordKey(objectTag, recordTag));
    const configuredResults = new Map();
    for (const result of selectorResults) {
      if (!result || typeof result.matched !== "boolean") {
        throw new TypeError(
          "native HNDL/HNDR selector result requires matched state",
        );
      }
      requireIntegerFields({ selector: result.selector });
      const selector = signedWord(result.selector);
      if (configuredResults.has(selector)) {
        throw new Error(
          `native HNDL/HNDR selector ${selector} is duplicated`,
        );
      }
      const fields = result.matched
        ? {
            selectedConfigPointer: result.selectedConfigPointer,
            lengthDword: result.lengthDword,
            secondaryDword: result.secondaryDword,
          }
        : {
            selectedConfigPointer: 0,
            lengthDword: 0,
            secondaryDword: 0,
          };
      requireIntegerFields(fields);
      configuredResults.set(selector, {
        matched: result.matched,
        ...fields,
      });
    }
    record.controller = {
      primaryControllerAvailable,
      secondaryControllerAvailable,
      primaryControlDwords: primaryControlDwords.map(
        value => value >>> 0,
      ),
      selectorResults: configuredResults,
      modeByte: undefined,
      enabledByte: undefined,
      selectedConfigPointer: undefined,
      lengthDword: undefined,
      continuationPointer: undefined,
      secondaryWord: undefined,
      startIndexWord: undefined,
      endIndexWord: undefined,
      currentIndexWord: undefined,
      previousIndexWord: undefined,
      currentIndexFloatWord: undefined,
      stepFloatWord: undefined,
      terminalStateDword: undefined,
      motionSelectorWord: undefined,
      flagByte: undefined,
      transitionStateByte: undefined,
      transitionDurationWord: undefined,
    };
  }

  configureVectorTable({ pointer, vectors }) {
    this.vectorTables.set(
      requirePointer(pointer),
      requireVectorTable(vectors),
    );
  }

  applyVectorInstall({
    objectTag,
    recordTag,
    sourcePointer,
    duration,
  }) {
    const record = this.records.get(recordKey(objectTag, recordTag));
    if (!record) {
      return {
        applied: false,
        reason: "hndl-hndr-record-missing",
      };
    }
    const pointer = requirePointer(sourcePointer);
    const vectors = this.vectorTables.get(pointer);
    if (!vectors) {
      return {
        applied: false,
        reason: "hndl-hndr-vector-table-unavailable",
      };
    }
    record.activeByte = 1;
    record.durationWord = nativeDurationWord(duration);
    record.sourcePointer = pointer;
    record.vectorSlots = Array(VECTOR_SLOT_COUNT).fill(null);
    INSTALLED_SLOT_INDICES.forEach((slotIndex, sourceIndex) => {
      record.vectorSlots[slotIndex] = [...vectors[sourceIndex]];
    });
    return {
      applied: true,
      recordTag,
      installedSlotIndices: [...INSTALLED_SLOT_INDICES],
      state: cloneRecord(record),
    };
  }

  planPointer10VectorWrite({
    objectTag,
    recordTag,
    componentMask,
  }) {
    if (!Number.isInteger(componentMask)) {
      throw new TypeError(
        "native HNDL/HNDR component mask must be an integer",
      );
    }
    const key = recordKey(objectTag, recordTag);
    const record = this.records.get(key);
    if (!record) {
      return {
        applicable: false,
        nativeNoOp: true,
        reason: "hndl-hndr-record-missing",
      };
    }
    if (record.pointer10Present === undefined) {
      return {
        applicable: false,
        reason: "hndl-hndr-pointer-10-state-unavailable",
      };
    }
    return {
      applicable: true,
      objectTag: requireFourcc(objectTag),
      recordTag: requireRecordTag(recordTag),
      componentMask: componentMask >>> 0,
      pointer10Present: record.pointer10Present,
      pointer10Vector: record.pointer10Vector
        ? [...record.pointer10Vector]
        : undefined,
    };
  }

  commitPointer10VectorWrite(plan, sourceVector) {
    if (!plan?.applicable) {
      throw new TypeError(
        "native HNDL/HNDR component-write plan is required",
      );
    }
    const supplied = requireVector(sourceVector);
    const record = this.records.get(recordKey(
      plan.objectTag,
      plan.recordTag,
    ));
    if (!record) {
      return {
        applied: false,
        reason: "hndl-hndr-record-state-changed",
      };
    }
    if (
      record.pointer10Present !== plan.pointer10Present
      || (
        record.pointer10Present
        && record.pointer10Vector.some(
          (word, index) => word !== plan.pointer10Vector[index],
        )
      )
    ) {
      return {
        applied: false,
        reason: "hndl-hndr-pointer-10-state-changed",
      };
    }
    if (!record.pointer10Present) {
      return {
        applied: false,
        nativeNoOp: true,
        reason: "hndl-hndr-pointer-10-null",
      };
    }
    const next = [...record.pointer10Vector];
    const mask = plan.componentMask >>> 0;
    const replaceMasks = [0x01, 0x04, 0x10];
    const addMasks = [0x02, 0x08, 0x20];
    replaceMasks.forEach((componentMask, index) => {
      if (mask & componentMask) next[index] = supplied[index];
    });
    addMasks.forEach((componentMask, index) => {
      if (mask & componentMask) {
        next[index] = rawWordAdd(next[index], supplied[index]);
      }
    });
    record.pointer10Vector = next;
    return {
      applied: true,
      recordTag: plan.recordTag,
      componentMask: mask,
      pointer10Vector: [...next],
    };
  }

  applyControllerRequest({
    objectTag,
    recordTag,
    mode,
    selector,
  }) {
    const record = this.records.get(recordKey(objectTag, recordTag));
    if (!record) {
      return {
        applied: false,
        reason: "hndl-hndr-record-missing",
      };
    }
    const controller = record.controller;
    if (!controller) {
      return {
        applied: false,
        reason: "hndl-hndr-controller-state-unavailable",
      };
    }
    const signedMode = signedByte(mode);
    const admitted = (
      (
        controller.primaryControllerAvailable
        && signedMode >= 0
      )
      || (
        controller.secondaryControllerAvailable
        && signedMode <= 0
      )
    );
    const signedSelector = signedWord(selector);
    const selected = admitted
      ? controller.selectorResults.get(signedSelector)
      : null;
    if (admitted && !selected) {
      return {
        applied: false,
        reason: "hndl-hndr-controller-selector-unavailable",
      };
    }
    if (admitted) {
      controller.modeByte = mode & 0xff;
      controller.enabledByte = 1;
      controller.selectedConfigPointer = (
        selected.selectedConfigPointer >>> 0
      );
      controller.lengthDword = selected.lengthDword >>> 0;
      controller.continuationPointer = selected.matched
        ? (selected.selectedConfigPointer + 40) >>> 0
        : 0;
      controller.secondaryWord = selected.secondaryDword & 0xffff;
      let endWord = 0xffff;
      if (-1 < (selected.lengthDword | 0)) {
        endWord = (selected.lengthDword - 1) & 0xffff;
      }
      if (0 > signedWord(endWord)) endWord = 0;
      controller.startIndexWord = 0;
      controller.endIndexWord = endWord;
      controller.currentIndexWord = 0;
      controller.previousIndexWord = 0;
      controller.currentIndexFloatWord = 0;
      controller.stepFloatWord = 0x3f800000;
      controller.terminalStateDword = 0;
      record.activeByte = 0;
      record.durationWord = 0;
    }
    if (controller.primaryControllerAvailable) {
      controller.primaryControlDwords = [0, 0, 0];
    }
    return {
      applied: admitted || controller.primaryControllerAvailable,
      admitted,
      primaryControllerCleared: controller.primaryControllerAvailable,
      recordTag,
      state: cloneRecord(record),
    };
  }

  applyMotionRequest({
    objectTag,
    recordTag,
    motionSelector,
    startIndex,
    endIndex,
    currentIndex,
    flags,
    stepFloatWord,
    transitionDuration,
  }) {
    requireIntegerFields({
      motionSelector,
      startIndex,
      endIndex,
      currentIndex,
      flags,
      stepFloatWord,
      transitionDuration,
    });
    const record = this.records.get(recordKey(objectTag, recordTag));
    if (!record) {
      return {
        applied: false,
        nativeNoOp: true,
        reason: "hndl-hndr-record-missing",
      };
    }
    const controller = record.controller;
    if (!controller) {
      return {
        applied: false,
        reason: "hndl-hndr-controller-state-unavailable",
      };
    }
    const selector = signedWord(motionSelector);
    const selected = controller.selectorResults.get(selector);
    if (!selected) {
      return {
        applied: false,
        reason: "hndl-hndr-motion-selector-unavailable",
      };
    }
    controller.motionSelectorWord = selector & 0xffff;
    controller.selectedConfigPointer = selected.matched
      ? selected.selectedConfigPointer >>> 0
      : 0;
    controller.lengthDword = selected.matched
      ? selected.lengthDword >>> 0
      : 0;
    controller.continuationPointer = selected.matched
      ? (selected.selectedConfigPointer + 40) >>> 0
      : 0;
    controller.secondaryWord = selected.matched
      ? selected.secondaryDword & 0xffff
      : 0;

    const length = controller.lengthDword | 0;
    let start = signedWord((startIndex - 1) | 0);
    if (start < 0) start = 0;
    else if (start >= length) start = (length - 1) | 0;
    let end = signedWord((endIndex - 1) | 0);
    if (end < 0 || end >= length) end = (length - 1) | 0;
    if (start > end) {
      start = 0;
      end = 0;
    }
    const flagByte = (flags & 0xf7) >>> 0;
    let current = signedWord((currentIndex - 1) | 0);
    if (current >= end || current < start) {
      current = flagByte & 2 ? end : start;
    }
    controller.startIndexWord = start & 0xffff;
    controller.endIndexWord = end & 0xffff;
    controller.currentIndexWord = current & 0xffff;
    controller.previousIndexWord = current & 0xffff;
    controller.currentIndexFloatWord = floatWordFromSignedInteger(current);
    controller.flagByte = flagByte;
    if (floatFromWord(stepFloatWord) > 0) {
      controller.stepFloatWord = stepFloatWord >>> 0;
    }
    const duration = signedWord(transitionDuration);
    controller.transitionDurationWord = duration & 0xffff;
    controller.transitionStateByte = duration > 0 ? 2 : 0;
    controller.terminalStateDword = 0;
    return {
      applied: true,
      objectTag: requireFourcc(objectTag),
      recordTag: requireRecordTag(recordTag),
      selectorMatched: selected.matched,
      state: cloneRecord(record),
    };
  }

  applyMotionControl({
    objectTag,
    recordTag,
    mode,
    value,
    mask,
  }) {
    requireIntegerFields({ mode, value });
    const record = this.records.get(recordKey(objectTag, recordTag));
    if (!record) {
      return {
        applied: false,
        nativeNoOp: true,
        reason: "hndl-hndr-record-missing",
      };
    }
    const controller = record.controller;
    if (!controller) {
      return {
        applied: false,
        reason: "hndl-hndr-controller-state-unavailable",
      };
    }
    if (mode === 1) {
      if (floatFromWord(value) > 0) {
        controller.stepFloatWord = value >>> 0;
      }
      return {
        applied: true,
        objectTag: requireFourcc(objectTag),
        recordTag: requireRecordTag(recordTag),
        mode,
        state: cloneRecord(record),
      };
    }
    if (mode !== 0) {
      return {
        applied: false,
        nativeNoOp: true,
        reason: "hndl-hndr-motion-control-mode-ignored",
      };
    }
    requireIntegerFields({ mask });
    if (
      controller.flagByte === undefined
      || controller.startIndexWord === undefined
      || controller.endIndexWord === undefined
      || controller.currentIndexWord === undefined
    ) {
      return {
        applied: false,
        reason: "hndl-hndr-motion-controller-uninitialized",
      };
    }
    const previousFlags = controller.flagByte & 0xff;
    const maskByte = mask & 0xff;
    const enabled = signedWord(value) !== 0;
    const nextFlags = enabled
      ? previousFlags | maskByte
      : previousFlags & ~maskByte;
    controller.flagByte = nextFlags & 0xff;
    const previousDirection = previousFlags & 2;
    const nextDirection = nextFlags & 2;
    let rangeAdjusted = false;
    const current = signedWord(controller.currentIndexWord);
    if (nextDirection && !previousDirection) {
      const end = signedWord(controller.endIndexWord);
      if (current <= end) {
        controller.startIndexWord = controller.endIndexWord;
        rangeAdjusted = true;
      }
    } else if (!nextDirection && previousDirection) {
      const start = signedWord(controller.startIndexWord);
      if (current >= start) {
        controller.endIndexWord = controller.startIndexWord;
        rangeAdjusted = true;
      }
    }
    if (rangeAdjusted) {
      controller.previousIndexWord = controller.currentIndexWord;
      controller.currentIndexFloatWord = floatWordFromSignedInteger(current);
    }
    return {
      applied: true,
      objectTag: requireFourcc(objectTag),
      recordTag: requireRecordTag(recordTag),
      mode,
      enabled,
      maskByte,
      rangeAdjusted,
      state: cloneRecord(record),
    };
  }

  readRecord({ objectTag, recordTag }) {
    return cloneRecord(this.records.get(recordKey(objectTag, recordTag)));
  }
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
    throw new TypeError("native HNDL/HNDR object tag is unavailable");
  }
  return String.fromCharCode(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
}

export function createNativeHndlHndrRecordSemanticHandlers({
  applyResolvedObjectHndlHndrVectorInstall,
  applyResolvedObjectHndlHndrControllerRequest,
  planResolvedObjectHndlHndrComponentWrite,
  commitResolvedObjectHndlHndrComponentWrite,
  applyResolvedObjectHndlHndrMotionRequest,
  applyResolvedObjectHndlHndrMotionControl,
  readNativeVector,
} = {}) {
  return {
    "resolved-object-hndl-hndr-motion-request": async ({
      action,
      context,
      readArgument,
    }) => {
      const applyRequest = (
        applyResolvedObjectHndlHndrMotionRequest
        || context.applyResolvedObjectHndlHndrMotionRequest
      );
      if (typeof applyRequest !== "function") {
        return {
          status: "stopped",
          reason: "resolved-object-hndl-hndr-motion-request-adapter-missing",
        };
      }
      const sideSelector = readArgument(1);
      const mutation = await applyRequest({
        objectTag: objectTagArgument(action, readArgument),
        recordTag: sideSelector === 0 ? "HNDL" : "HNDR",
        sideSelector,
        motionSelector: readArgument(2),
        startIndex: readArgument(3),
        endIndex: readArgument(4),
        currentIndex: readArgument(5),
        flags: readArgument(6),
        stepFloatWord: readArgument(7),
        transitionDuration: readArgument(8),
        source: {
          functionFileOffset: context.location?.functionId,
          callFileOffset: action.callFileOffset,
        },
      });
      if (
        mutation?.reason === "hndl-hndr-controller-state-unavailable"
        || mutation?.reason === "hndl-hndr-motion-selector-unavailable"
      ) {
        return { status: "stopped", reason: mutation.reason };
      }
      return { status: "continued", mutation };
    },
    "resolved-object-hndl-hndr-motion-control": async ({
      action,
      context,
      readArgument,
    }) => {
      const applyControl = (
        applyResolvedObjectHndlHndrMotionControl
        || context.applyResolvedObjectHndlHndrMotionControl
      );
      if (typeof applyControl !== "function") {
        return {
          status: "stopped",
          reason: "resolved-object-hndl-hndr-motion-control-adapter-missing",
        };
      }
      const sideSelector = readArgument(1);
      const mode = readArgument(2);
      const mutation = await applyControl({
        objectTag: objectTagArgument(action, readArgument),
        recordTag: sideSelector === 0 ? "HNDL" : "HNDR",
        sideSelector,
        mode,
        value: readArgument(3),
        mask: mode === 0 ? readArgument(4) : undefined,
        source: {
          functionFileOffset: context.location?.functionId,
          callFileOffset: action.callFileOffset,
        },
      });
      if (
        mutation?.reason === "hndl-hndr-controller-state-unavailable"
        || mutation?.reason === "hndl-hndr-motion-controller-uninitialized"
      ) {
        return { status: "stopped", reason: mutation.reason };
      }
      return { status: "continued", mutation };
    },
    "resolved-object-hndl-hndr-component-write": async ({
      action,
      context,
      readArgument,
    }) => {
      const planWrite = (
        planResolvedObjectHndlHndrComponentWrite
        || context.planResolvedObjectHndlHndrComponentWrite
      );
      const commitWrite = (
        commitResolvedObjectHndlHndrComponentWrite
        || context.commitResolvedObjectHndlHndrComponentWrite
      );
      const readVector = readNativeVector || context.readNativeVector;
      if (typeof planWrite !== "function") {
        return {
          status: "stopped",
          reason: "resolved-object-hndl-hndr-component-planner-missing",
        };
      }
      if (typeof commitWrite !== "function") {
        return {
          status: "stopped",
          reason: "resolved-object-hndl-hndr-component-committer-missing",
        };
      }
      const sideSelector = readArgument(1);
      const plan = await planWrite({
        objectTag: objectTagArgument(action, readArgument),
        recordTag: sideSelector === 0 ? "HNDL" : "HNDR",
        sideSelector,
        componentMask: readArgument(2),
        source: {
          functionFileOffset: context.location?.functionId,
          callFileOffset: action.callFileOffset,
        },
      });
      if (plan?.nativeNoOp) {
        return { status: "continued", mutation: plan };
      }
      if (!plan?.applicable) {
        return {
          status: "stopped",
          reason: plan?.reason || "hndl-hndr-component-plan-invalid",
        };
      }
      if (typeof readVector !== "function") {
        return {
          status: "stopped",
          reason: "native-vector-reader-missing",
        };
      }
      const sourcePointer = readArgument(3);
      const vector = await readVector(sourcePointer);
      if (
        !Array.isArray(vector)
        || vector.length !== 3
        || vector.some(word => !Number.isInteger(word))
      ) {
        return {
          status: "stopped",
          reason: "native-vector-source-unavailable",
        };
      }
      const mutation = await commitWrite(plan, vector);
      if (mutation?.reason?.endsWith("-state-changed")) {
        return { status: "stopped", reason: mutation.reason };
      }
      return {
        status: "continued",
        mutation: {
          ...mutation,
          sourcePointer,
        },
      };
    },
    "resolved-object-hndl-hndr-vector-install": async ({
      action,
      context,
      readArgument,
    }) => {
      const applyInstall = (
        applyResolvedObjectHndlHndrVectorInstall
        || context.applyResolvedObjectHndlHndrVectorInstall
      );
      if (typeof applyInstall !== "function") {
        return {
          status: "stopped",
          reason: "resolved-object-hndl-hndr-vector-adapter-missing",
        };
      }
      const sideSelector = readArgument(1);
      const mutation = await applyInstall({
        objectTag: objectTagArgument(action, readArgument),
        recordTag: sideSelector === 0 ? "HNDL" : "HNDR",
        sideSelector,
        sourcePointer: readArgument(2),
        duration: readArgument(3),
        source: {
          functionFileOffset: context.location?.functionId,
          callFileOffset: action.callFileOffset,
        },
      });
      if (mutation?.reason === "hndl-hndr-vector-table-unavailable") {
        return { status: "stopped", reason: mutation.reason };
      }
      return { status: "continued", mutation };
    },
    "resolved-object-hndl-hndr-controller-request": async ({
      action,
      context,
      readArgument,
    }) => {
      const applyRequest = (
        applyResolvedObjectHndlHndrControllerRequest
        || context.applyResolvedObjectHndlHndrControllerRequest
      );
      if (typeof applyRequest !== "function") {
        return {
          status: "stopped",
          reason: "resolved-object-hndl-hndr-controller-adapter-missing",
        };
      }
      const sideSelector = readArgument(2);
      const mutation = await applyRequest({
        objectTag: objectTagArgument(action, readArgument),
        recordTag: sideSelector === 0 ? "HNDL" : "HNDR",
        mode: readArgument(1),
        sideSelector,
        selector: readArgument(3),
        source: {
          functionFileOffset: context.location?.functionId,
          callFileOffset: action.callFileOffset,
        },
      });
      if (
        mutation?.reason === "hndl-hndr-controller-state-unavailable"
        || mutation?.reason === "hndl-hndr-controller-selector-unavailable"
      ) {
        return { status: "stopped", reason: mutation.reason };
      }
      return { status: "continued", mutation };
    },
  };
}

export function createNativeHndlHndrRecordState() {
  return new NativeHndlHndrRecordState();
}
