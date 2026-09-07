const FLAG_MASK = 0x01000000;

function requireFourcc(value) {
  const fourcc = String(value || "");
  if (fourcc.length !== 4) {
    throw new TypeError(
      "native operation 0x019f actor requires a four-character ID",
    );
  }
  return fourcc;
}

function actorTagArgument(action, readArgument) {
  const operand = action.arguments?.[0];
  if (operand?.kind === "constant" && typeof operand.ascii === "string") {
    return requireFourcc(operand.ascii);
  }
  const value = readArgument(0);
  if (typeof value === "string") return requireFourcc(value);
  if (!Number.isInteger(value)) {
    throw new TypeError("native operation 0x019f actor tag is unavailable");
  }
  const word = value >>> 0;
  return requireFourcc(String.fromCharCode(
    word & 0xff,
    (word >>> 8) & 0xff,
    (word >>> 16) & 0xff,
    (word >>> 24) & 0xff,
  ));
}

function cloneActor(actor) {
  return actor ? { ...actor } : undefined;
}

export class NativeOperation019fState {
  constructor() {
    this.actors = new Map();
    this.revision = 0;
  }

  configureActor({
    actorTag,
    actorAvailable,
    controllerAvailable,
    controllerFlags18 = 0,
  }) {
    if (
      typeof actorAvailable !== "boolean"
      || typeof controllerAvailable !== "boolean"
    ) {
      throw new TypeError(
        "native operation 0x019f availability must be Boolean",
      );
    }
    if (!Number.isInteger(controllerFlags18)) {
      throw new TypeError(
        "native operation 0x019f controller flags must be an integer",
      );
    }
    const actor = {
      actorAvailable,
      controllerAvailable,
      controllerFlags18: controllerFlags18 >>> 0,
    };
    this.actors.set(requireFourcc(actorTag), actor);
    this.revision += 1;
    return cloneActor(actor);
  }

  planFlagWrite({ actorTag, enabled }) {
    const key = requireFourcc(actorTag);
    const actor = this.actors.get(key);
    if (!actor) {
      return {
        applied: false,
        reason: "native-operation-019f-actor-state-unavailable",
      };
    }
    if (!actor.actorAvailable) {
      return { applied: false, reason: "actor-unavailable" };
    }
    if (!actor.controllerAvailable) {
      return {
        applied: false,
        actorTag: key,
        removeFromSceneRegistry: true,
      };
    }
    return {
      applied: true,
      expectedRevision: this.revision,
      actorTag: key,
      enabled,
      controllerFlags18: (
        enabled
          ? actor.controllerFlags18 | FLAG_MASK
          : actor.controllerFlags18 & ~FLAG_MASK
      ) >>> 0,
    };
  }

  commit(plan) {
    if (!plan?.applied) {
      throw new TypeError("native operation 0x019f state plan is required");
    }
    if (plan.expectedRevision !== this.revision) {
      throw new Error("native operation 0x019f state changed before commit");
    }
    const actor = this.actors.get(plan.actorTag);
    if (!actor?.actorAvailable || !actor.controllerAvailable) {
      throw new Error("native operation 0x019f actor changed before commit");
    }
    actor.controllerFlags18 = plan.controllerFlags18;
    this.revision += 1;
    return cloneActor(actor);
  }

  readActor(actorTag) {
    return cloneActor(this.actors.get(requireFourcc(actorTag)));
  }
}

export function createNativeOperation019fState() {
  return new NativeOperation019fState();
}

export function createNativeOperation019fSemanticHandlers({
  removeActorFromSceneRegistry,
} = {}) {
  return {
    "native-operation-019f-momt-flag-24-control": async ({
      action,
      context,
      readArgument,
    }) => {
      const state = context.nativeOperation019fState;
      if (!state || typeof state.planFlagWrite !== "function") {
        return {
          status: "stopped",
          reason: "native-operation-019f-state-unavailable",
        };
      }
      let mode;
      let plan;
      try {
        mode = readArgument(1);
        if (mode !== 0 && mode !== 1) {
          return {
            status: "stopped",
            reason: "native-operation-019f-mode-unproved",
          };
        }
        plan = state.planFlagWrite({
          actorTag: actorTagArgument(action, readArgument),
          enabled: mode === 1,
        });
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
      if (plan.reason === "native-operation-019f-actor-state-unavailable") {
        return { status: "stopped", reason: plan.reason };
      }
      if (plan.removeFromSceneRegistry) {
        const removeActor = (
          removeActorFromSceneRegistry
          || context.removeActorFromSceneRegistry
        );
        if (typeof removeActor !== "function") {
          return {
            status: "stopped",
            reason: "actor-scene-registry-remove-adapter-missing",
          };
        }
        await removeActor({
          actorTag: plan.actorTag,
          source: {
            functionFileOffset: context.location?.functionId,
            callFileOffset: action.callFileOffset,
          },
        });
      } else if (plan.applied) {
        state.commit(plan);
      }
      return { status: "continued", mutation: plan };
    },
  };
}
