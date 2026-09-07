export function createNativeOperation0052SemanticHandlers({ writeNativeOperation0052TableEntry } = {}) {
  return {
    "native-operation-0052-indexed-table-write": async ({ context, readArgument }) => {
      const index = readArgument(1);
      const value = readArgument(2);
      if (index !== 32 || value !== 89) {
        return { status: "stopped", reason: "native-operation-0052-route-unproved" };
      }
      const write = writeNativeOperation0052TableEntry || context.writeNativeOperation0052TableEntry;
      if (typeof write !== "function") {
        return { status: "stopped", reason: "native-operation-0052-table-writer-missing" };
      }
      const previous = await write({ index, value });
      return { status: "continued", mutation: { previous, index, value } };
    },
  };
}
