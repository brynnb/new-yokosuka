const AUTHORED_PRESET_INDICES = new Set([0, 1]);

const NATIVE_PIPELINE = Object.freeze({
  outerTag: "FOG ",
  recordPayloadOffset: 8,
  recordStrideBytes: 80,
  nestedTags: Object.freeze(["FOG ", "BACK"]),
  fogGlobalAddresses: Object.freeze([
    0x0c20bc44,
    0x0c20bc48,
    0x0c20bc4c,
    0x0c20bc50,
    0x0c20bc54,
  ]),
  backgroundIndexedWordCount: 4,
});

function requireAuthoredIndex(value) {
  if (!Number.isInteger(value) || !AUTHORED_PRESET_INDICES.has(value)) {
    throw new RangeError(
      "native environment preset index is outside the proven authored set",
    );
  }
  return value;
}

export class NativeEnvironmentPresetState {
  constructor() {
    this.clear();
  }

  clear() {
    this.selectedIndex = null;
    this.revision = 0;
  }

  select(value) {
    const index = requireAuthoredIndex(value);
    const previousIndex = this.selectedIndex;
    this.selectedIndex = index;
    this.revision += 1;
    return Object.freeze({
      index,
      previousIndex,
      revision: this.revision,
      nativePipeline: NATIVE_PIPELINE,
    });
  }

  read() {
    return Object.freeze({
      selectedIndex: this.selectedIndex,
      revision: this.revision,
    });
  }
}

export function createNativeEnvironmentPresetState() {
  return new NativeEnvironmentPresetState();
}

export function createNativeEnvironmentPresetSemanticHandlers() {
  return {
    "native-environment-preset-select": async ({ context, readArgument }) => {
      const state = context.nativeEnvironmentPresetState;
      if (!(state instanceof NativeEnvironmentPresetState)) {
        return {
          status: "stopped",
          reason: "native-environment-preset-state-missing",
        };
      }
      try {
        return {
          status: "continued",
          mutation: state.select(readArgument(0)),
        };
      } catch (error) {
        return {
          status: "stopped",
          reason: {
            kind: "native-environment-preset-contract-failed",
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }
    },
  };
}
