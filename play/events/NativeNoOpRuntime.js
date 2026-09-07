export function createNativeNoOpSemanticHandlers(semanticIds = []) {
  const handlers = {};
  for (const semanticId of semanticIds) {
    if (typeof semanticId !== "string" || semanticId.length === 0) {
      throw new TypeError("native no-op semantic ID must be a non-empty string");
    }
    if (handlers[semanticId]) {
      throw new Error(`duplicate native no-op semantic ID ${semanticId}`);
    }
    handlers[semanticId] = async () => ({
      status: "continued",
      mutation: { route: "native-no-op", semanticId },
    });
  }
  return handlers;
}
