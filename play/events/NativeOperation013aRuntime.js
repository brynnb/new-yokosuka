function objectTag(action, readArgument) {
  const operand = action.arguments?.[0];
  if (operand?.kind === "constant" && typeof operand.ascii === "string") {
    return operand.ascii;
  }
  const value = readArgument(0);
  if (typeof value === "string" && value.length === 4) return value;
  if (!Number.isInteger(value)) throw new TypeError("operation 0x013a object tag is unavailable");
  return String.fromCharCode(value & 0xff, (value >>> 8) & 0xff,
    (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

export function createNativeOperation013aSemanticHandlers({
  writeNativeObjectVectorComponent,
} = {}) {
  return {
    "resolved-object-float-word-48-write": async ({ action, context, readArgument }) => {
      let tag;
      let value;
      try {
        tag = objectTag(action, readArgument);
        value = readArgument(1);
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
      if (!Number.isInteger(value)) {
        return { status: "stopped", reason: "operation-013a-float-word-unavailable" };
      }
      const write = writeNativeObjectVectorComponent || context.writeNativeObjectVectorComponent;
      if (typeof write !== "function") {
        return { status: "stopped", reason: "native-object-vector-component-writer-missing" };
      }
      const mutation = await write({ objectTag: tag, componentIndex: 2, value: value >>> 0 });
      return mutation === undefined
        ? { status: "continued", mutation: { applied: false, nativeNoOp: true, objectTag: tag } }
        : { status: "continued", mutation: { applied: true, objectTag: tag, ...mutation } };
    },
  };
}
