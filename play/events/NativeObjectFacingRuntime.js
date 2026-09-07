import {
  isNativeAddressOperand,
  readAvailableNativeAddressWords,
} from "./NativeEventAddress.js";
import {
  nativeBinaryAngleFromFloatPairWords,
  nativeFloat32FromWord,
  nativeFloat32Word,
} from "./NativeEventNumericRuntime.js";

function requireFourcc(value) {
  const fourcc = String(value || "");
  if (fourcc.length !== 4) {
    throw new TypeError(
      "native object-facing request requires a four-character object ID",
    );
  }
  return fourcc;
}

function requireVectorWords(value, label) {
  if (
    !Array.isArray(value)
    || value.length !== 3
    || value.some(word => !Number.isInteger(word))
  ) {
    throw new TypeError(`${label} requires exactly three integer words`);
  }
  return value.map(word => word >>> 0);
}

function objectTagArgument(action, readArgument) {
  const operand = action.arguments?.[0];
  if (operand?.kind === "constant" && typeof operand.ascii === "string") {
    return requireFourcc(operand.ascii);
  }
  const value = readArgument(0);
  if (typeof value === "string") return requireFourcc(value);
  if (!Number.isInteger(value)) {
    throw new TypeError("native object-facing object tag is unavailable");
  }
  return String.fromCharCode(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
}

function staticVectorWords(operand) {
  if (!Array.isArray(operand?.staticWords)) return undefined;
  return requireVectorWords(
    operand.staticWords,
    "native object-facing static target",
  );
}

function actionSource(action, context) {
  return {
    functionFileOffset: context.location?.functionId,
    callFileOffset: action.callFileOffset,
  };
}

/**
 * Operation 0x001e resolves an object's direct position vector, computes the
 * native binary heading toward a supplied world point, and replaces the
 * object's complete direct secondary vector with [0, heading, 0]. The latter
 * uses the same accessor/reconciliation path as direct operation 0x001d.
 */
export function createNativeObjectFacingSemanticHandlers({
  readSceneObjectBaseVector,
  applySceneObjectVectorOperation,
  readNativeVector,
} = {}) {
  return {
    "resolved-object-world-point-heading-write": async ({
      action,
      context,
      readArgument,
    }) => {
      try {
        const flags = readArgument(1) >>> 0;
        const auxiliary = readArgument(3) >>> 0;
        if (flags !== 0x38000000 || auxiliary !== 0) {
          return {
            status: "stopped",
            reason: "resolved-object-heading-form-unproved",
          };
        }

        const readPosition = (
          readSceneObjectBaseVector || context.readSceneObjectBaseVector
        );
        if (typeof readPosition !== "function") {
          return {
            status: "stopped",
            reason: "scene-object-base-vector-reader-missing",
          };
        }
        const apply = (
          applySceneObjectVectorOperation
          || context.applySceneObjectVectorOperation
        );
        if (typeof apply !== "function") {
          return {
            status: "stopped",
            reason: "scene-object-vector-operation-adapter-missing",
          };
        }

        const objectTag = objectTagArgument(action, readArgument);
        const position = requireVectorWords(
          await readPosition({ objectTag, associated: false }),
          `native direct position for ${objectTag}`,
        );
        const targetOperand = action.arguments?.[2];
        let target = staticVectorWords(targetOperand);
        if (!target && isNativeAddressOperand(targetOperand)) {
          target = readAvailableNativeAddressWords(
            targetOperand,
            context,
            3,
          );
        }
        if (!target) {
          const readVector = readNativeVector || context.readNativeVector;
          if (typeof readVector !== "function") {
            return {
              status: "stopped",
              reason: "native-vector-reader-missing",
            };
          }
          target = await readVector(readArgument(2));
        }
        target = requireVectorWords(
          target,
          "native object-facing world target",
        );

        const deltaWords = [0, 1, 2].map(index => nativeFloat32Word(
          Math.fround(
            nativeFloat32FromWord(target[index])
            - nativeFloat32FromWord(position[index]),
          ),
        ));
        const heading = nativeBinaryAngleFromFloatPairWords(
          deltaWords[0],
          deltaWords[2],
        );
        const vector = [0, heading, 0];
        const next = await apply({
          objectTag,
          flags,
          vector,
          source: actionSource(action, context),
        });
        return {
          status: "continued",
          result: 0,
          mutation: {
            objectTag,
            flags,
            position,
            target,
            deltaWords,
            heading,
            vector,
            next,
          },
        };
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
    },
  };
}
