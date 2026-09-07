export function createNativeOperation017aSemanticHandlers({
  applyNativeOperation017aControl,
} = {}) {
  return {
    "native-operation-017a-control": async ({
      context,
      readArgument,
    }) => {
      const applyControl = (
        applyNativeOperation017aControl
        || context.applyNativeOperation017aControl
      );
      if (typeof applyControl !== "function") {
        return {
          status: "stopped",
          reason: "native-operation-017a-adapter-missing",
        };
      }
      let mode;
      let detail;
      try {
        mode = readArgument(0);
        if (mode === 0) {
          detail = {
            mode,
            maskWord: readArgument(1),
            modeByteWord: readArgument(2),
          };
        } else if (mode === 1) {
          // The native handler ignores both remaining authored words.
          detail = { mode };
        } else if (mode === 2) {
          detail = {
            mode,
            clearMaskWord: readArgument(1),
          };
        } else {
          return {
            status: "stopped",
            reason: "native-operation-017a-mode-unproved",
          };
        }
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
      const mutation = await applyControl(detail);
      if (mutation === undefined) {
        return {
          status: "stopped",
          reason: "native-operation-017a-result-unavailable",
        };
      }
      return { status: "continued", mutation };
    },
  };
}
