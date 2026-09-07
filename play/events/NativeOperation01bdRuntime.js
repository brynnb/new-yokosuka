export function createNativeOperation01bdSemanticHandlers({
  consumeNativeOperation01bdGlobalDword,
} = {}) {
  return {
    "native-operation-01bd-global-dword-consume": async ({ context }) => {
      const consume = consumeNativeOperation01bdGlobalDword
        || context.consumeNativeOperation01bdGlobalDword;
      if (typeof consume !== "function") {
        return {
          status: "stopped",
          reason: "native-operation-01bd-global-dword-consumer-missing",
        };
      }
      const value = await consume();
      if (!Number.isInteger(value)) {
        return {
          status: "stopped",
          reason: "native-operation-01bd-global-dword-unavailable",
        };
      }
      return { result: value | 0 };
    },
  };
}
