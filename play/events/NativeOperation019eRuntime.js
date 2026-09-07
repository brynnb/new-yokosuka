const MAX_RECORDS = 8;

function requireInteger(value, name) {
  if (!Number.isInteger(value)) {
    throw new TypeError(`native operation 0x019e ${name} must be an integer`);
  }
  return value >>> 0;
}

function fourccArgument(action, readArgument, index) {
  const operand = action.arguments?.[index];
  if (operand?.kind === "constant" && typeof operand.ascii === "string") {
    return operand.ascii;
  }
  const word = requireInteger(readArgument(index), "area tag");
  return String.fromCharCode(
    word & 0xff,
    (word >>> 8) & 0xff,
    (word >>> 16) & 0xff,
    (word >>> 24) & 0xff,
  );
}

function scheduleWords(action, readArgument) {
  const operand = action.arguments?.[4];
  if (operand?.kind === "constant" && operand.value === 0xffffffff) {
    return [];
  }
  if (operand?.kind !== "static-pointer") {
    throw new TypeError(
      "native operation 0x019e schedule descriptor is unavailable",
    );
  }
  if (!Array.isArray(operand.staticWords)) {
    throw new TypeError(
      "native operation 0x019e schedule words are unavailable",
    );
  }
  const sentinel = operand.staticWords.indexOf(0xffffffff);
  if (sentinel < 0 || sentinel > 7) {
    throw new RangeError(
      "native operation 0x019e schedule sentinel is unavailable",
    );
  }
  const words = operand.staticWords.slice(0, sentinel);
  words.forEach((word, index) => requireInteger(word, `schedule word ${index}`));
  // Preserve normal readArgument validation for the pointer-bearing operand.
  requireInteger(readArgument(4), "schedule pointer");
  return words.map(word => word >>> 0);
}

function recordKey(record) {
  return JSON.stringify([
    record.sceneIndex,
    record.areaTag,
    record.kind,
    record.scheduleWords,
    record.timeWord,
  ]);
}

function cloneRecord(record) {
  return {
    ...record,
    scheduleWords: [...record.scheduleWords],
  };
}

export class NativeOperation019eState {
  constructor() {
    this.enabled = false;
    this.records = [];
    this.revision = 0;
  }

  setEnabled(value) {
    this.enabled = value !== 0;
    this.revision += 1;
    return this.enabled ? 1 : 0;
  }

  registerRecord(record) {
    const normalized = {
      sceneIndex: requireInteger(record.sceneIndex, "scene index") & 0xff,
      areaTag: String(record.areaTag),
      kind: requireInteger(record.kind, "record kind") & 0xff,
      scheduleWords: record.scheduleWords.map((word, index) => (
        requireInteger(word, `schedule word ${index}`)
      )),
      timeWord: requireInteger(record.timeWord, "time word"),
      flags: requireInteger(record.flags, "flags") & 0xff,
    };
    const key = recordKey(normalized);
    if (this.records.some(candidate => recordKey(candidate) === key)) {
      return -1;
    }
    if (this.records.length >= MAX_RECORDS) return -1;
    const index = this.records.length;
    this.records.push(normalized);
    this.revision += 1;
    return index;
  }

  read() {
    return {
      enabled: this.enabled,
      records: this.records.map(cloneRecord),
      revision: this.revision,
    };
  }

  clear() {
    this.enabled = false;
    this.records = [];
    this.revision += 1;
  }
}

export function createNativeOperation019eState() {
  return new NativeOperation019eState();
}

export function createNativeOperation019eSemanticHandlers({ state } = {}) {
  return {
    "native-operation-019e-controller-control": async ({
      action,
      context,
      readArgument,
    }) => {
      const operationState = state || context.nativeOperation019eState;
      if (
        !operationState
        || typeof operationState.registerRecord !== "function"
      ) {
        return {
          status: "stopped",
          reason: "native-operation-019e-state-unavailable",
        };
      }
      try {
        const mode = readArgument(0);
        if (mode === 2) {
          return { result: operationState.setEnabled(readArgument(1)) };
        }
        if (mode !== 4) {
          return {
            status: "stopped",
            reason: "native-operation-019e-mode-unproved",
          };
        }
        return {
          result: operationState.registerRecord({
            sceneIndex: readArgument(1),
            areaTag: fourccArgument(action, readArgument, 2),
            kind: readArgument(3),
            scheduleWords: scheduleWords(action, readArgument),
            timeWord: readArgument(5),
            flags: readArgument(6),
          }),
        };
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
    },
  };
}
