export const NATIVE_OPERATION_0026_GLOBAL_ADDRESS = 0x0c20c3e0;

export function createNativeOperation0026SemanticHandlers({
  readNativeFixedGlobalDword,
} = {}) {
  return {
    "native-fixed-global-dword-query": async ({ context }) => {
      const read = readNativeFixedGlobalDword
        || context.readNativeFixedGlobalDword;
      if (typeof read !== "function") {
        return {
          status: "stopped",
          reason: "native-fixed-global-dword-reader-missing",
        };
      }
      const value = await read({
        address: NATIVE_OPERATION_0026_GLOBAL_ADDRESS,
      });
      if (!Number.isInteger(value)) {
        return {
          status: "stopped",
          reason: "native-fixed-global-dword-unavailable",
        };
      }
      return { result: value | 0 };
    },
  };
}
