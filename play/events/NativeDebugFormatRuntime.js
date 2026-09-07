export function createNativeDebugFormatSemanticHandlers({
  formatNativeDebugMessage,
} = {}) {
  return {
    "native-debug-format": async ({
      action,
      context,
      readArgument,
    }) => {
      const formatMessage = (
        formatNativeDebugMessage
        || context.formatNativeDebugMessage
      );
      if (typeof formatMessage !== "function") {
        if (!action.resultComparison && !action.resultTarget) {
          return {
            status: "continued",
            debugMessage: null,
          };
        }
        return {
          status: "stopped",
          reason: "native-debug-formatter-adapter-missing",
        };
      }
      if (action.arguments?.[0]?.kind !== "static-pointer") {
        return {
          status: "stopped",
          reason: "native-debug-format-pointer-unproved",
        };
      }
      let formatPointer;
      let argumentWords;
      try {
        formatPointer = readArgument(0);
        argumentWords = action.arguments.slice(1).map(
          (_argument, index) => readArgument(index + 1),
        );
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
      const formatted = await formatMessage({
        formatPointer,
        argumentWords,
        source: {
          functionFileOffset: context.location?.functionId,
          callFileOffset: action.callFileOffset,
        },
      });
      if (!formatted || !Number.isInteger(formatted.result)) {
        return {
          status: "stopped",
          reason: "native-debug-formatter-result-unavailable",
        };
      }
      return {
        status: "continued",
        result: formatted.result | 0,
        debugMessage: formatted.message,
      };
    },
  };
}
