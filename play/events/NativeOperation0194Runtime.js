export function createNativeOperation0194SemanticHandlers({
  invokeNativeOperation0194Mode0,
  invokeNativeOperation0194Mode1,
  queryNativeOperation0194Mode2,
} = {}) {
  return {
    "native-operation-0194-control": async ({
      context,
      readArgument,
    }) => {
      let mode;
      let padding;
      try {
        mode = readArgument(0);
        padding = readArgument(1);
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
      if (padding !== 0) {
        return {
          status: "stopped",
          reason: "native-operation-0194-padding-unproved",
        };
      }

      if (mode === 0) {
        const invoke = (
          invokeNativeOperation0194Mode0
          || context.invokeNativeOperation0194Mode0
        );
        if (typeof invoke !== "function") {
          return {
            status: "stopped",
            reason: "native-operation-0194-mode-0-adapter-missing",
          };
        }
        await invoke(padding);
        return {
          status: "continued",
          mutation: { mode, forwardedValue: padding },
        };
      }

      if (mode === 1) {
        const invoke = (
          invokeNativeOperation0194Mode1
          || context.invokeNativeOperation0194Mode1
        );
        if (typeof invoke !== "function") {
          return {
            status: "stopped",
            reason: "native-operation-0194-mode-1-adapter-missing",
          };
        }
        await invoke();
        return { status: "continued", mutation: { mode } };
      }

      if (mode === 2) {
        const query = (
          queryNativeOperation0194Mode2
          || context.queryNativeOperation0194Mode2
        );
        if (typeof query !== "function") {
          return {
            status: "stopped",
            reason: "native-operation-0194-mode-2-adapter-missing",
          };
        }
        const result = await query();
        if (!Number.isInteger(result)) {
          return {
            status: "stopped",
            reason: "native-operation-0194-mode-2-result-invalid",
          };
        }
        return { result: result & 0xff };
      }

      return {
        status: "stopped",
        reason: "native-operation-0194-mode-unproved",
      };
    },
  };
}
