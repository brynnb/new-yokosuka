const FOG_ENABLED_ADDRESS = 0x0c20bc54;
const SCROLL_GLOBAL_CONTROL_ADDRESS = 0x0c1f7128;
const SCROLL_MODE_TWO_ENABLED_ADDRESS = 0x0c1f7130;
const SCROLL_MODE_TWO_VALUE_ADDRESS = 0x0c1f7134;

function sourceFor(action, context) {
  return {
    functionFileOffset: context.location?.functionId,
    callFileOffset: action.callFileOffset,
  };
}

async function writeDword(write, offset, value, source) {
  await write({ offset, width: 4, value: value >>> 0, source });
}

export function createNativePresentationControlSemanticHandlers({
  writeNativePresentationField,
} = {}) {
  return {
    "native-fog-enable-control": async ({ action, context, readArgument }) => {
      const write = writeNativePresentationField || context.writeSceneField;
      if (typeof write !== "function") {
        return { status: "stopped", reason: "native-presentation-state-writer-missing" };
      }
      const enabled = readArgument(0) === 0 ? 0 : 1;
      await writeDword(write, FOG_ENABLED_ADDRESS, enabled, sourceFor(action, context));
      return { status: "continued", mutation: { field: "fogEnabled", value: enabled } };
    },
    "scroll-sprite-global-control-write": async ({
      action,
      context,
      readArgument,
    }) => {
      const write = writeNativePresentationField || context.writeSceneField;
      if (typeof write !== "function") {
        return { status: "stopped", reason: "native-presentation-state-writer-missing" };
      }
      const value = readArgument(0);
      if (!Number.isInteger(value)) {
        return { status: "stopped", reason: "scroll-sprite-global-control-invalid" };
      }
      await writeDword(
        write,
        SCROLL_GLOBAL_CONTROL_ADDRESS,
        value,
        sourceFor(action, context),
      );
      return {
        status: "continued",
        mutation: { field: "scrollGlobalControl", value: value >>> 0 },
      };
    },
    "scroll-sprite-mode-two-control": async ({
      action,
      context,
      readArgument,
    }) => {
      if (readArgument(0) !== 2) {
        return { status: "stopped", reason: "scroll-sprite-mode-two-form-unproved" };
      }
      const value = readArgument(1);
      if (!Number.isInteger(value)) {
        return { status: "stopped", reason: "scroll-sprite-mode-two-value-invalid" };
      }
      const write = writeNativePresentationField || context.writeSceneField;
      if (typeof write !== "function") {
        return { status: "stopped", reason: "native-presentation-state-writer-missing" };
      }
      const source = sourceFor(action, context);
      await writeDword(write, SCROLL_MODE_TWO_ENABLED_ADDRESS, 1, source);
      await writeDword(write, SCROLL_MODE_TWO_VALUE_ADDRESS, value, source);
      return {
        status: "continued",
        mutation: { field: "scrollModeTwo", enabled: 1, value: value >>> 0 },
      };
    },
  };
}
