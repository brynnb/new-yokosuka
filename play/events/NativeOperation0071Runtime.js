const CHANNEL_ADDRESSES = Object.freeze([
  0x0c201af4,
  0x0c201af8,
  0x0c201afc,
]);

function requireWord(value) {
  if (!Number.isInteger(value) || value < -0x80000000 || value > 0xffffffff) {
    throw new RangeError("operation 0x0071 value must be a 32-bit word");
  }
  return value >>> 0;
}

export function createNativeOperation0071SemanticHandlers() {
  return {
    "fixed-three-channel-float-word-access": async ({
      context,
      readArgument,
    }) => {
      const mode = readArgument(0);
      if (!Number.isInteger(mode) || mode < 0 || mode > 4) {
        return {
          status: "stopped",
          reason: "native-operation-0071-mode-unproved",
        };
      }
      const read = context.readSceneField;
      const write = context.writeSceneField;
      if (typeof read !== "function" || typeof write !== "function") {
        return {
          status: "stopped",
          reason: "native-operation-0071-state-missing",
        };
      }
      const channel = Math.floor(mode / 2);
      const address = CHANNEL_ADDRESSES[channel];
      const descriptor = { offset: address, width: 4 };
      const previous = read(descriptor);
      if ((mode & 1) === 1) {
        return Number.isInteger(previous)
          ? { status: "continued", result: previous >>> 0 }
          : {
              status: "stopped",
              reason: "native-operation-0071-value-unavailable",
            };
      }
      let value;
      try {
        value = requireWord(readArgument(1));
      } catch (error) {
        return {
          status: "stopped",
          reason: {
            kind: "native-operation-0071-contract-failed",
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }
      write({ ...descriptor, value });
      return {
        status: "continued",
        ...(Number.isInteger(previous) ? { result: previous >>> 0 } : {}),
        mutation: {
          channel,
          address,
          previous,
          value,
        },
      };
    },
  };
}
