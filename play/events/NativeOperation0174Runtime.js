export function createNativeOperation0174SemanticHandlers({
  writeNativeOperation0174GlobalDword,
} = {}) {
  return {
    "native-operation-0174-global-dword-write": async ({
      context,
      readArgument,
    }) => {
      const mode = readArgument(0);
      const value = readArgument(1);
      if (mode !== 1 || (value !== 0 && value !== 1)) {
        return {
          status: "stopped",
          reason: "native-operation-0174-arguments-unproved",
        };
      }
      const write = writeNativeOperation0174GlobalDword
        || context.writeNativeOperation0174GlobalDword;
      if (typeof write !== "function") {
        return {
          status: "stopped",
          reason: "native-operation-0174-global-dword-writer-missing",
        };
      }
      const previous = await write(value);
      return {
        status: "continued",
        mutation: { previous, value },
      };
    },
  };
}
