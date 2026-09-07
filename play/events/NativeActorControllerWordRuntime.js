function requireFourcc(value) {
  const fourcc = String(value || "");
  if (fourcc.length !== 4) {
    throw new TypeError("native actor controller tag must have four bytes");
  }
  return fourcc;
}

function objectTagArgument(action, readArgument) {
  const operand = action.arguments?.[0];
  if (
    operand?.kind === "constant"
    && typeof operand.ascii === "string"
  ) {
    return operand.ascii;
  }
  const value = readArgument(0);
  if (typeof value === "string") return requireFourcc(value);
  if (!Number.isInteger(value)) {
    throw new TypeError("native actor controller tag is unavailable");
  }
  return String.fromCharCode(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
}

function cloneActor(actor) {
  return actor ? { ...actor } : undefined;
}

const MOTM_DWORD_1CC_BY_MODE = new Map([
  [0, 3],
  [1, 7],
  [2, 0],
  [3, 5],
]);

export class NativeActorControllerWordState {
  constructor() {
    this.actors = new Map();
  }

  configureActor({
    actorTag,
    actorAvailable,
    controllerAvailable,
    controllerWord7c,
    controllerFlag4000,
    controllerDword1cc,
    controllerWord86,
    controllerWord90,
    controllerWord9a,
  }) {
    if (
      typeof actorAvailable !== "boolean"
      || typeof controllerAvailable !== "boolean"
    ) {
      throw new TypeError(
        "native actor/controller availability must be boolean",
      );
    }
    for (const [name, value] of Object.entries({
      controllerWord7c,
      controllerDword1cc,
      controllerWord86,
      controllerWord90,
      controllerWord9a,
    })) {
      if (value !== undefined && !Number.isInteger(value)) {
        throw new TypeError(`native actor controller ${name} must be an integer`);
      }
    }
    if (
      controllerFlag4000 !== undefined
      && typeof controllerFlag4000 !== "boolean"
    ) {
      throw new TypeError("native actor controller flag 0x4000 must be boolean");
    }
    const actor = {
      ...(this.actors.get(requireFourcc(actorTag)) || {}),
      actorAvailable,
      controllerAvailable,
      ...(controllerWord7c === undefined
        ? {}
        : { controllerWord7c: controllerWord7c & 0xffff }),
      ...(controllerFlag4000 === undefined
        ? {}
        : { controllerFlag4000 }),
      ...(controllerDword1cc === undefined
        ? {}
        : { controllerDword1cc: controllerDword1cc >>> 0 }),
      ...(controllerWord86 === undefined
        ? {}
        : { controllerWord86: controllerWord86 & 0xffff }),
      ...(controllerWord90 === undefined
        ? {}
        : { controllerWord90: controllerWord90 & 0xffff }),
      ...(controllerWord9a === undefined
        ? {}
        : { controllerWord9a: controllerWord9a & 0xffff }),
    };
    this.actors.set(requireFourcc(actorTag), actor);
    return cloneActor(actor);
  }

  planWordWrite({ actorTag, value }) {
    const key = requireFourcc(actorTag);
    const actor = this.actors.get(key);
    if (!actor) {
      return {
        applied: false,
        reason: "actor-controller-word-state-unavailable",
      };
    }
    if (!actor.actorAvailable) {
      return {
        applied: false,
        reason: "actor-unavailable",
      };
    }
    if (!actor.controllerAvailable) {
      return {
        applied: false,
        actorTag: key,
        removeFromSceneRegistry: true,
      };
    }
    if (!Number.isInteger(value)) {
      throw new TypeError("native actor controller word must be an integer");
    }
    return {
      applied: true,
      actorTag: key,
      value: value & 0xffff,
    };
  }

  commitWordWrite(plan) {
    if (!plan.applied) return;
    const actor = this.actors.get(requireFourcc(plan.actorTag));
    if (!actor?.actorAvailable || !actor.controllerAvailable) {
      throw new Error("native actor controller word plan became invalid");
    }
    actor.controllerWord7c = plan.value;
  }

  applyModeControl({ actorTag, mode }) {
    const key = requireFourcc(actorTag);
    const actor = this.actors.get(key);
    if (!actor) {
      return {
        applied: false,
        reason: "actor-controller-word-state-unavailable",
      };
    }
    if (!actor.actorAvailable) {
      return {
        applied: false,
        reason: "actor-unavailable",
      };
    }
    if (!actor.controllerAvailable) {
      return {
        applied: false,
        actorTag: key,
        removeFromSceneRegistry: true,
      };
    }
    if (!Number.isInteger(mode)) {
      throw new TypeError("native actor controller mode must be an integer");
    }
    const normalizedMode = mode >>> 0;
    if (normalizedMode === 0xffffffff) {
      actor.controllerFlag4000 = false;
      actor.controllerDword1cc = 0;
      actor.controllerWord86 = 0;
      actor.controllerWord90 = 0;
      actor.controllerWord9a = 0;
      return {
        applied: true,
        actorTag: key,
        mode: normalizedMode,
        controllerFlag4000: false,
        controllerDword1cc: 0,
        controllerWord86: 0,
        controllerWord90: 0,
        controllerWord9a: 0,
      };
    }
    if (!MOTM_DWORD_1CC_BY_MODE.has(normalizedMode)) {
      return { applied: false, reason: "actor-controller-mode-unproven" };
    }
    const controllerDword1cc = MOTM_DWORD_1CC_BY_MODE.get(normalizedMode);
    actor.controllerFlag4000 = true;
    actor.controllerDword1cc = controllerDword1cc;
    return {
      applied: true,
      actorTag: key,
      mode: normalizedMode,
      controllerFlag4000: true,
      controllerDword1cc,
    };
  }

  readActor(actorTag) {
    return cloneActor(this.actors.get(requireFourcc(actorTag)));
  }
}

export function createNativeActorControllerWordState() {
  return new NativeActorControllerWordState();
}

export function createNativeActorControllerWordSemanticHandlers({
  removeActorFromSceneRegistry,
  resolveActorControllerState,
} = {}) {
  async function finishMutation(mutation, action, context) {
    if (mutation.removeFromSceneRegistry) {
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
        actorTag: mutation.actorTag,
        source: {
          functionFileOffset: context.location?.functionId,
          callFileOffset: action.callFileOffset,
        },
      });
    }
    return { status: "continued", mutation };
  }

  return {
    "actor-controller-word-7c-write": async ({
      action,
      context,
      readArgument,
    }) => {
      const planWrite = context.planActorControllerWordWrite;
      const commit = context.commitActorControllerWordWrite;
      if (typeof planWrite !== "function" || typeof commit !== "function") {
        return {
          status: "stopped",
          reason: "actor-controller-word-state-missing",
        };
      }
      let plan;
      try {
        plan = planWrite({
          actorTag: objectTagArgument(action, readArgument),
          value: readArgument(1),
        });
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
      if (plan.reason === "actor-controller-word-state-unavailable") {
        return { status: "stopped", reason: plan.reason };
      }
      if (plan.removeFromSceneRegistry) {
        return finishMutation(plan, action, context);
      }
      commit(plan);
      return finishMutation(plan, action, context);
    },
    "actor-motm-mode-control": async ({
      action,
      context,
      readArgument,
    }) => {
      const rawMode = readArgument(1);
      if (!Number.isInteger(rawMode)) {
        return { status: "stopped", reason: "actor-controller-mode-unavailable" };
      }
      const mode = rawMode >>> 0;
      if (![0, 1, 2, 3, 0xffffffff].includes(mode)) {
        return { status: "stopped", reason: "actor-controller-mode-unproven" };
      }
      const actorTag = objectTagArgument(action, readArgument);
      const apply = context.applyActorControllerModeControl;
      if (typeof apply !== "function") {
        return { status: "stopped", reason: "actor-controller-state-missing" };
      }
      let mutation = apply({ actorTag, mode });
      if (mutation.reason === "actor-controller-word-state-unavailable") {
        const resolve = (
          resolveActorControllerState
          || context.resolveActorControllerState
        );
        const configure = context.configureActorControllerWordState;
        if (typeof resolve === "function" && typeof configure === "function") {
          const resolved = await resolve({ actorTag, mode });
          if (
            resolved
            && typeof resolved.actorAvailable === "boolean"
            && typeof resolved.controllerAvailable === "boolean"
          ) {
            configure({ actorTag, ...resolved });
            mutation = apply({ actorTag, mode });
          }
        }
      }
      if (mutation.reason === "actor-controller-word-state-unavailable") {
        return { status: "stopped", reason: mutation.reason };
      }
      if (mutation.reason === "actor-controller-mode-unproven") {
        return { status: "stopped", reason: mutation.reason };
      }
      return finishMutation(mutation, action, context);
    },
  };
}
