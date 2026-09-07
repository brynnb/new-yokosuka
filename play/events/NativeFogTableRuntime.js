import {
  readAvailableNativeOperandWords,
} from "./NativeEventAddress.js";

const FOG_CONFIGURATION_ADDRESS = 0x0c20bc44;
const FOG_ENABLED_ADDRESS = 0x0c20bc54;

function sourceFor(action, context) {
  return {
    functionFileOffset: context.location?.functionId,
    callFileOffset: action.callFileOffset,
  };
}

/**
 * Operation 0x0049 installs three float32 inputs and one packed color used by
 * the Dreamcast's 128-entry fog-table builder, then enables that native path.
 * Words are retained bit-exactly so a presentation adapter can reproduce the
 * original curve without reverse-labelling its three numeric inputs.
 */
export function createNativeFogTableSemanticHandlers({
  writeNativeFogTableField,
} = {}) {
  return {
    "native-fog-table-configuration-write": async ({ action, context }) => {
      const words = readAvailableNativeOperandWords(
        action.arguments?.[0],
        context,
        4,
      );
      if (!words) {
        return {
          status: "stopped",
          reason: "native-fog-table-configuration-unavailable",
        };
      }
      const write = writeNativeFogTableField || context.writeSceneField;
      if (typeof write !== "function") {
        return {
          status: "stopped",
          reason: "native-fog-table-state-writer-missing",
        };
      }
      const source = sourceFor(action, context);
      for (let index = 0; index < words.length; index += 1) {
        await write({
          offset: FOG_CONFIGURATION_ADDRESS + index * 4,
          width: 4,
          value: words[index],
          source,
        });
      }
      await write({
        offset: FOG_ENABLED_ADDRESS,
        width: 4,
        value: 1,
        source,
      });
      return {
        status: "continued",
        mutation: {
          address: FOG_CONFIGURATION_ADDRESS,
          floatInputWords: words.slice(0, 3),
          packedColorWord: words[3],
          enabledAddress: FOG_ENABLED_ADDRESS,
          enabled: 1,
        },
      };
    },
  };
}
