const RECORD_COUNT = 4;

const FIELD_READERS = Object.freeze([
  record => record.word4,
  record => record.word8,
  record => record.wordA,
  record => record.byteC,
  record => record.byteD,
  record => record.byteE,
  record => record.byteF,
  record => record.word12,
]);

function requireIndex(value) {
  if (!Number.isInteger(value) || value < 0 || value >= RECORD_COUNT) {
    throw new RangeError("native controller index must be 0 through 3");
  }
  return value;
}

function requireSelector(value) {
  if (!Number.isInteger(value) || value < 0 || value >= FIELD_READERS.length) {
    throw new RangeError("native controller field selector must be 0 through 7");
  }
  return value;
}

function word(value) {
  if (!Number.isInteger(value)) throw new TypeError("controller word is invalid");
  return value & 0xffff;
}

function byte(value) {
  if (!Number.isInteger(value)) throw new TypeError("controller byte is invalid");
  return value & 0xff;
}

function emptyRecord() {
  return Object.freeze({
    word4: 0,
    word8: 0,
    wordA: 0,
    byteC: 0,
    byteD: 0,
    byteE: 0,
    byteF: 0,
    word12: 0,
  });
}

export class NativeControllerInputState {
  constructor() {
    this.clear();
  }

  clear() {
    this.records = Array.from({ length: RECORD_COUNT }, emptyRecord);
  }

  write(index, values = {}) {
    const selected = requireIndex(index);
    const previous = this.records[selected];
    const current = Object.freeze({
      word4: word(values.word4 ?? previous.word4),
      word8: word(values.word8 ?? previous.word8),
      wordA: word(values.wordA ?? previous.wordA),
      byteC: byte(values.byteC ?? previous.byteC),
      byteD: byte(values.byteD ?? previous.byteD),
      byteE: byte(values.byteE ?? previous.byteE),
      byteF: byte(values.byteF ?? previous.byteF),
      word12: word(values.word12 ?? previous.word12),
    });
    this.records[selected] = current;
    return { previous: { ...previous }, current: { ...current } };
  }

  read(index, selector) {
    return FIELD_READERS[requireSelector(selector)](
      this.records[requireIndex(index)],
    );
  }
}

export function createNativeControllerInputSemanticHandlers() {
  return {
    "native-controller-input-field-query": async ({ context, readArgument }) => {
      const state = context.nativeControllerInputState;
      if (!state) {
        return {
          status: "stopped",
          reason: "native-controller-input-state-missing",
        };
      }
      try {
        return { result: state.read(readArgument(0), readArgument(1)) };
      } catch (error) {
        return {
          status: "stopped",
          reason: {
            kind: "native-controller-input-contract-failed",
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }
    },
  };
}

export function createNativeControllerInputState() {
  return new NativeControllerInputState();
}
