function objectTag(action, readArgument, index) {
  const operand = action.arguments?.[index];
  if (operand?.kind === "constant" && typeof operand.ascii === "string") {
    return operand.ascii;
  }
  const value = readArgument(index);
  if (typeof value === "string" && value.length === 4) return value;
  if (!Number.isInteger(value)) {
    throw new TypeError(`operation 0x0199 object ${index} is unavailable`);
  }
  return String.fromCharCode(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
}

export function createNativeOperation0199SemanticHandlers({
  applyNativeOperation0199ModeZero,
  writeNativeOperation0199ControlDword,
  readNativeOperation0199StatusByte,
} = {}) {
  return {
    "native-operation-0199-mode-zero": async ({
      action,
      context,
      readArgument,
    }) => {
      const applyModeZero = (
        applyNativeOperation0199ModeZero
        || context.applyNativeOperation0199ModeZero
      );
      if (typeof applyModeZero !== "function") {
        return {
          status: "stopped",
          reason: "native-operation-0199-mode-zero-adapter-missing",
        };
      }
      let detail;
      try {
        if (readArgument(0) !== 0) {
          return {
            status: "stopped",
            reason: "native-operation-0199-mode-unproved",
          };
        }
        detail = {
          mode: 0,
          controlWord: readArgument(1),
          firstObjectTag: objectTag(action, readArgument, 2),
          secondObjectTag: objectTag(action, readArgument, 3),
          firstFloatWord: readArgument(4) >>> 0,
          secondFloatWord: readArgument(5) >>> 0,
          source: {
            functionFileOffset: context.location?.functionId,
            callFileOffset: action.callFileOffset,
          },
        };
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
      const mutation = await applyModeZero(detail);
      if (mutation === undefined) {
        return {
          status: "stopped",
          reason: "native-operation-0199-mode-zero-result-unavailable",
        };
      }
      return { status: "continued", mutation };
    },
    "native-operation-0199-control-dword-write": async ({
      context,
      readArgument,
    }) => {
      if (readArgument(0) !== 1) {
        return {
          status: "stopped",
          reason: "native-operation-0199-mode-unproved",
        };
      }
      const value = readArgument(1);
      if (!Number.isInteger(value)) {
        return {
          status: "stopped",
          reason: "native-operation-0199-control-dword-unavailable",
        };
      }
      const write = writeNativeOperation0199ControlDword
        || context.writeNativeOperation0199ControlDword;
      if (typeof write !== "function") {
        return {
          status: "stopped",
          reason: "native-operation-0199-control-dword-writer-missing",
        };
      }
      const previous = await write(value >>> 0);
      return {
        status: "continued",
        mutation: { previous, value: value >>> 0 },
      };
    },
    "native-operation-0199-status-byte-query": async ({
      context,
      readArgument,
    }) => {
      if (readArgument(0) !== 2) {
        return {
          status: "stopped",
          reason: "native-operation-0199-mode-unproved",
        };
      }
      const read = readNativeOperation0199StatusByte
        || context.readNativeOperation0199StatusByte;
      if (typeof read !== "function") {
        return {
          status: "stopped",
          reason: "native-operation-0199-status-byte-reader-missing",
        };
      }
      const value = await read();
      if (!Number.isInteger(value) || value < 0 || value > 0xff) {
        return {
          status: "stopped",
          reason: "native-operation-0199-status-byte-unavailable",
        };
      }
      return { result: (value << 24) >> 24 };
    },
  };
}
