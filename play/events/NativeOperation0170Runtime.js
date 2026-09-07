const MAP_SLOT_COUNT = 32;

function signed32(value) {
  return value >> 0;
}

function requireSelector(value) {
  if (!Number.isInteger(value)) {
    throw new TypeError("operation 0x0170 MAP selector is unavailable");
  }
  const selector = signed32(value);
  if (selector !== -1 && (selector < 0 || selector >= MAP_SLOT_COUNT)) {
    throw new RangeError(
      `operation 0x0170 MAP selector must be -1 or 0 through ${MAP_SLOT_COUNT - 1}`,
    );
  }
  return selector;
}

function stopped(error) {
  return {
    status: "stopped",
    reason: {
      kind: "native-operation-0170-contract-failed",
      message: error instanceof Error ? error.message : String(error),
    },
  };
}

export function createNativeOperation0170SemanticHandlers({
  applyMapRenderPreparation,
} = {}) {
  return {
    "native-map-render-preparation-control": async ({
      action,
      context,
      readArgument,
    }) => {
      try {
        const selector = requireSelector(readArgument(0));
        const mode = signed32(readArgument(1));
        if (mode !== 0 && mode !== 1) {
          return {
            status: "stopped",
            reason: "native-operation-0170-mode-unproved",
          };
        }
        if (typeof applyMapRenderPreparation !== "function") {
          throw new Error(
            "operation 0x0170 MAP render-preparation adapter is unavailable",
          );
        }
        const accepted = await applyMapRenderPreparation({
          selector,
          mode,
          source: {
            functionFileOffset: context.location?.functionId,
            callFileOffset: action.callFileOffset,
          },
        });
        if (accepted !== true) {
          throw new Error(
            "operation 0x0170 MAP render-preparation adapter rejected the request",
          );
        }
        return {
          status: "continued",
          mutation: { selector, mode },
        };
      } catch (error) {
        return stopped(error);
      }
    },
  };
}
