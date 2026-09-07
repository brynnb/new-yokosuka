function requireDword(value, label) {
  if (!Number.isInteger(value)) {
    throw new TypeError(`${label} must be an integer word`);
  }
  return value >>> 0;
}

async function positionWords(action, context, readArgument) {
  const operand = action.arguments?.[1];
  if (
    operand?.kind === "frame-address"
    && Number.isInteger(operand.offset)
  ) {
    const words = [0, 4, 8].map(delta => (
      context.readFrameField?.(operand.offset + delta)
    ));
    if (words.some(word => !Number.isInteger(word))) {
      throw new TypeError(
        "native fixed record frame position is unavailable",
      );
    }
    return words.map(word => word >>> 0);
  }
  if (
    operand?.kind === "static-pointer"
    && Array.isArray(operand.staticWords)
  ) {
    return operand.staticWords.map((word, index) => requireDword(
      word,
      `native fixed record static position word ${index}`,
    ));
  }
  if (typeof context.readNativeVector !== "function") {
    throw new TypeError("native fixed record vector reader is unavailable");
  }
  const words = await context.readNativeVector(readArgument(1));
  if (
    !Array.isArray(words)
    || words.length !== 3
    || words.some(word => !Number.isInteger(word))
  ) {
    throw new TypeError("native fixed record position is unavailable");
  }
  return words.map(word => word >>> 0);
}

export function createNativeFixedRecordPoseSemanticHandlers() {
  return {
    "native-fixed-record-pose-write": async ({
      action,
      context,
      readArgument,
    }) => {
      const state = context.nativeOperation0120State;
      if (!state || typeof state.planFixedRecordPose !== "function") {
        return {
          status: "stopped",
          reason: "native-fixed-record-state-unavailable",
        };
      }
      try {
        const index = readArgument(0);
        const words = await positionWords(action, context, readArgument);
        const plan = state.planFixedRecordPose(
          index,
          words,
          readArgument(2),
        );
        if (plan.reason) {
          return { status: "stopped", reason: plan.reason };
        }
        state.commit(plan);
        return {
          status: "continued",
          mutation: {
            index,
            positionWords1c: words,
            word28: readArgument(2) >>> 0,
          },
        };
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
    },
  };
}
