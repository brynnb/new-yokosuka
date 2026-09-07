function actorTagArgument(action, readArgument) {
  const operand = action.arguments?.[0];
  if (operand?.kind === "constant" && typeof operand.ascii === "string") {
    return operand.ascii;
  }
  const value = readArgument(0);
  if (!Number.isInteger(value)) {
    throw new TypeError("native FACE-table actor tag is unavailable");
  }
  return String.fromCharCode(
    value & 0xff,
    value >>> 8 & 0xff,
    value >>> 16 & 0xff,
    value >>> 24 & 0xff,
  );
}

export function createNativeFaceTableSemanticHandlers({
  resolveActor,
  refreshFaceTable,
  queryActorActivity,
} = {}) {
  return {
    "resolved-face-table-refresh": async ({ action, context, readArgument }) => {
      if (readArgument(1) !== 0 || readArgument(2) !== 0) {
        return { status: "stopped", reason: "native-face-table-refresh-form-unproved" };
      }
      const resolve = resolveActor || context.resolveNativeFaceTableActor;
      if (typeof resolve !== "function") {
        return { status: "stopped", reason: "native-face-table-actor-resolver-missing" };
      }
      let actorTag;
      try {
        actorTag = actorTagArgument(action, readArgument);
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
      const actor = await resolve(actorTag);
      if (actor == null) {
        return {
          status: "continued",
          mutation: { applied: false, nativeNoOp: true, reason: "actor-missing", actorTag },
        };
      }
      const refresh = refreshFaceTable || context.refreshNativeFaceTable;
      if (typeof refresh !== "function") {
        return { status: "stopped", reason: "native-face-table-refresh-adapter-missing" };
      }
      const mutation = await refresh({ actorTag, actor });
      return { status: "continued", mutation };
    },
    "resolved-face-activity-query": async ({ action, context, readArgument }) => {
      if (readArgument(1) !== 1 || readArgument(2) !== 0) {
        return { status: "stopped", reason: "native-face-activity-query-form-unproved" };
      }
      const resolve = resolveActor || context.resolveNativeFaceTableActor;
      if (typeof resolve !== "function") {
        return { status: "stopped", reason: "native-face-table-actor-resolver-missing" };
      }
      let actorTag;
      try {
        actorTag = actorTagArgument(action, readArgument);
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
      const actor = await resolve(actorTag);
      if (actor == null) return { result: 0 };
      const query = queryActorActivity || context.queryNativeFaceActorActivity;
      if (typeof query !== "function") {
        return { status: "stopped", reason: "native-face-activity-query-adapter-missing" };
      }
      const value = await query({ actorTag, actor });
      if (!Number.isInteger(value)) {
        return { status: "stopped", reason: "native-face-activity-query-invalid" };
      }
      const signedByte = (value << 24) >> 24;
      return { result: signedByte >= 1 ? 1 : 0 };
    },
  };
}
