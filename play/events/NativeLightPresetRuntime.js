const PRESET_SLOT_COUNT = 24;

function signed32(value) {
  if (!Number.isInteger(value)) {
    throw new TypeError("native light preset index must be a 32-bit word");
  }
  return value >> 0;
}

export class NativeLightPresetState {
  constructor() {
    this.clear();
  }

  clear() {
    this.selectedIndex = null;
    this.revision = 0;
  }

  select(value) {
    const index = signed32(value);
    if (index < 0 || index >= PRESET_SLOT_COUNT) {
      return { accepted: false, index, previousIndex: this.selectedIndex };
    }
    const previousIndex = this.selectedIndex;
    this.selectedIndex = index;
    this.revision += 1;
    return {
      accepted: true,
      index,
      previousIndex,
      revision: this.revision,
    };
  }

  read() {
    return Object.freeze({
      selectedIndex: this.selectedIndex,
      revision: this.revision,
    });
  }
}

export function createNativeLightPresetSemanticHandlers() {
  return {
    "native-light-preset-select": async ({ context, readArgument }) => {
      const state = context.nativeLightPresetState;
      if (!state) {
        return {
          status: "stopped",
          reason: "native-light-preset-state-missing",
        };
      }
      try {
        const mutation = state.select(readArgument(0));
        return { status: "continued", mutation };
      } catch (error) {
        return {
          status: "stopped",
          reason: {
            kind: "native-light-preset-contract-failed",
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }
    },
  };
}

export function createNativeLightPresetState() {
  return new NativeLightPresetState();
}
