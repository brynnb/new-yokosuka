export function createNativeOperation014fSemanticHandlers({
  writeNativeOperation014fGlobalFloatWord,
} = {}) {
  return {
    "native-operation-014f-global-float-word-write": async ({
      context,
      readArgument,
    }) => {
      const value = readArgument(0);
      if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
        return {
          status: "stopped",
          reason: "native-operation-014f-float-word-unavailable",
        };
      }
      const write = writeNativeOperation014fGlobalFloatWord
        || context.writeNativeOperation014fGlobalFloatWord;
      if (typeof write !== "function") {
        return {
          status: "stopped",
          reason: "native-operation-014f-global-writer-missing",
        };
      }
      const word = value >>> 0;
      const previous = await write(word);
      return { status: "continued", mutation: { previous, value: word } };
    },
  };
}
