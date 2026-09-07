function requireWord(value, label) {
  if (!Number.isInteger(value)) {
    throw new TypeError(`native area request ${label} must be a 32-bit word`);
  }
  return value >>> 0;
}

export class NativeAreaRequestState {
  constructor() {
    this.clear();
  }

  clear() {
    this.record = Object.freeze({
      flagsCc: 0,
      wordD0: 0,
      wordD4: 0,
      wordD8: 0,
      wordDc: 0,
    });
  }

  write({ wordDc, wordD4, wordD0, wordD8 }) {
    const previous = this.read();
    this.record = Object.freeze({
      flagsCc: (previous.flagsCc | 1) >>> 0,
      wordD0: requireWord(wordD0, "word +0xd0"),
      wordD4: requireWord(wordD4, "word +0xd4"),
      wordD8: requireWord(wordD8, "word +0xd8"),
      wordDc: requireWord(wordDc, "word +0xdc"),
    });
    return { previous, current: this.read() };
  }

  read() {
    return { ...this.record };
  }
}

export function createNativeAreaRequestSemanticHandlers() {
  return {
    "native-area-request-record-write": async ({ context, readArgument }) => {
      const state = context.nativeAreaRequestState;
      if (!state) {
        return {
          status: "stopped",
          reason: "native-area-request-state-missing",
        };
      }
      try {
        return {
          status: "continued",
          mutation: state.write({
            wordDc: readArgument(0),
            wordD4: readArgument(1),
            wordD0: readArgument(2),
            wordD8: readArgument(3),
          }),
        };
      } catch (error) {
        return {
          status: "stopped",
          reason: {
            kind: "native-area-request-contract-failed",
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }
    },
  };
}

export function createNativeAreaRequestState() {
  return new NativeAreaRequestState();
}
