const CAMERA_AUXILIARY_CONTROL_ADDRESS = 0x0c201b38;
const CAMERA_AUXILIARY_VECTOR_ADDRESS = 0x0c201b3c;
const CAMERA_PRIMARY_SCALE_ADDRESS = 0x0c201b20;
const CAMERA_SECONDARY_SCALE_ADDRESS = 0x0c201b2c;
const FLOAT_ONE_WORD = 0x3f800000;

function sourceFor(action, context) {
  return {
    functionFileOffset: context.location?.functionId,
    callFileOffset: action.callFileOffset,
  };
}

async function writeWords(write, address, words, source) {
  for (let index = 0; index < words.length; index += 1) {
    await write({
      offset: address + index * 4,
      width: 4,
      value: words[index] >>> 0,
      source,
    });
  }
}

/**
 * Operation 0x0173 mode zero resets the native event-camera auxiliary state.
 * The fixed addresses and exact zero/one vectors are recovered from the SH-4
 * handler; no camera-space interpretation is invented here.
 */
export function createNativeCameraAuxiliarySemanticHandlers({
  writeNativeCameraAuxiliaryField,
} = {}) {
  return {
    "camera-auxiliary-state-reset": async ({
      action,
      context,
      readArgument,
    }) => {
      if (readArgument(0) !== 0 || action.arguments?.length !== 1) {
        return {
          status: "stopped",
          reason: "camera-auxiliary-reset-form-unproved",
        };
      }
      const write = (
        writeNativeCameraAuxiliaryField || context.writeSceneField
      );
      if (typeof write !== "function") {
        return {
          status: "stopped",
          reason: "camera-auxiliary-state-writer-missing",
        };
      }
      const source = sourceFor(action, context);
      const zeroVector = [0, 0, 0];
      const oneVector = [FLOAT_ONE_WORD, FLOAT_ONE_WORD, FLOAT_ONE_WORD];
      await writeWords(
        write,
        CAMERA_AUXILIARY_VECTOR_ADDRESS,
        zeroVector,
        source,
      );
      await write({
        offset: CAMERA_AUXILIARY_CONTROL_ADDRESS,
        width: 4,
        value: 0,
        source,
      });
      await writeWords(
        write,
        CAMERA_PRIMARY_SCALE_ADDRESS,
        oneVector,
        source,
      );
      await writeWords(
        write,
        CAMERA_SECONDARY_SCALE_ADDRESS,
        oneVector,
        source,
      );
      return {
        status: "continued",
        mutation: {
          control: {
            address: CAMERA_AUXILIARY_CONTROL_ADDRESS,
            value: 0,
          },
          auxiliaryVector: {
            address: CAMERA_AUXILIARY_VECTOR_ADDRESS,
            words: zeroVector,
          },
          primaryScale: {
            address: CAMERA_PRIMARY_SCALE_ADDRESS,
            words: oneVector,
          },
          secondaryScale: {
            address: CAMERA_SECONDARY_SCALE_ADDRESS,
            words: oneVector,
          },
        },
      };
    },
  };
}
