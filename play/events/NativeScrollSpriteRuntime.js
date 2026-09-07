import {
  readAvailableNativeOperandWords,
} from "./NativeEventAddress.js";

const SCROLL_SPRITE_COLOR_SLOTS_ADDRESS = 0x0c1f7118;

function sourceFor(action, context) {
  return {
    functionFileOffset: context.location?.functionId,
    callFileOffset: action.callFileOffset,
  };
}

/**
 * Operation 0x006f mode zero copies four packed color words into the native
 * SCRL/SCROLL sprite renderer's four slots. Other modes own separate control
 * fields and deliberately remain unresolved here.
 */
export function createNativeScrollSpriteSemanticHandlers({
  writeNativeScrollSpriteField,
} = {}) {
  return {
    "scroll-sprite-packed-color-slots-write": async ({
      action,
      context,
      readArgument,
    }) => {
      if (readArgument(0) !== 0 || action.arguments?.length !== 2) {
        return {
          status: "stopped",
          reason: "scroll-sprite-color-write-form-unproved",
        };
      }
      const words = readAvailableNativeOperandWords(
        action.arguments?.[1],
        context,
        4,
      );
      if (!words) {
        return {
          status: "stopped",
          reason: "scroll-sprite-color-source-unavailable",
        };
      }
      const write = writeNativeScrollSpriteField || context.writeSceneField;
      if (typeof write !== "function") {
        return {
          status: "stopped",
          reason: "scroll-sprite-color-state-writer-missing",
        };
      }
      const source = sourceFor(action, context);
      for (let index = 0; index < words.length; index += 1) {
        await write({
          offset: SCROLL_SPRITE_COLOR_SLOTS_ADDRESS + index * 4,
          width: 4,
          value: words[index],
          source,
        });
      }
      return {
        status: "continued",
        mutation: {
          address: SCROLL_SPRITE_COLOR_SLOTS_ADDRESS,
          packedColorWords: words,
        },
      };
    },
  };
}
