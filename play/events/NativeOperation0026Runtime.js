export const NATIVE_OPERATION_0026_GLOBAL_ADDRESS = 0x0c20c3e0;
export const NATIVE_CURRENT_SCENE_GLOBAL_ADDRESS = 0x0c20c3d8;

export function createNativeOperation0026SemanticHandlers({
  readNativeFixedGlobalDword,
} = {}) {
  const query = address => async ({ context }) => {
    const read = readNativeFixedGlobalDword
      || context.readNativeFixedGlobalDword;
    if (typeof read !== "function") {
      return { status: "stopped", reason: "native-fixed-global-dword-reader-missing" };
    }
    const value = await read({ address });
    if (!Number.isInteger(value)) {
      return { status: "stopped", reason: "native-fixed-global-dword-unavailable" };
    }
    return { result: value | 0 };
  };
  return {
    "native-fixed-global-dword-query": query(NATIVE_OPERATION_0026_GLOBAL_ADDRESS),
    "current-scene-query": query(NATIVE_CURRENT_SCENE_GLOBAL_ADDRESS),
  };
}
