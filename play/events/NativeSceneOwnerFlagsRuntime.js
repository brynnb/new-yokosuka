const OWNER_FLAGS_OFFSET = 0x00e0;

function requireWord(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new RangeError(`${label} must be a 32-bit unsigned word`);
  }
  return value >>> 0;
}

function requireBitIndex(value) {
  if (!Number.isInteger(value) || value < 0 || value > 31) {
    throw new RangeError("native scene-owner flag index must be from 0 through 31");
  }
  return value;
}

/** The flags dword at +0xe0 of the current scene-owner target. */
export class NativeSceneOwnerFlagsState {
  constructor({ flagsWord = 0 } = {}) {
    this.flagsWord = requireWord(flagsWord, "native scene-owner flags");
  }

  writeBit(bitIndex, set) {
    const index = requireBitIndex(bitIndex);
    const previousWord = this.flagsWord;
    const mask = (1 << index) >>> 0;
    this.flagsWord = set
      ? (previousWord | mask) >>> 0
      : (previousWord & ~mask) >>> 0;
    return Object.freeze({
      ownerFieldOffset: OWNER_FLAGS_OFFSET,
      bitIndex: index,
      set: Boolean(set),
      mask,
      previousWord,
      flagsWord: this.flagsWord,
    });
  }

  read() {
    return this.flagsWord;
  }

  clear() {
    this.flagsWord = 0;
  }
}

export function createNativeSceneOwnerFlagsState(options) {
  return new NativeSceneOwnerFlagsState(options);
}

export function createNativeSceneOwnerFlagsSemanticHandlers() {
  return {
    "native-scene-owner-flag-bit-control": async ({
      context,
      readArgument,
    }) => {
      const state = context.nativeSceneOwnerFlagsState;
      if (!(state instanceof NativeSceneOwnerFlagsState)) {
        return {
          status: "stopped",
          reason: "native-scene-owner-flags-state-missing",
        };
      }
      try {
        const bitIndex = readArgument(0);
        const value = requireWord(
          readArgument(1),
          "native scene-owner flag value",
        );
        return {
          status: "continued",
          mutation: state.writeBit(bitIndex, value !== 0),
        };
      } catch (error) {
        return {
          status: "stopped",
          reason: {
            kind: "native-scene-owner-flag-contract-failed",
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }
    },
  };
}
