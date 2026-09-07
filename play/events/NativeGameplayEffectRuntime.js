const EFFECT_ADAPTERS = Object.freeze({
  stateBankWrite: "writeStateBank",
  actorByteStateWrite: "writeActorByteState",
  mapLayerState: "setMapLayerState",
  objectRuntimeFlag: "setObjectRuntimeFlag",
  objectPresentationFlag: "setObjectPresentationFlag",
  mapTransition: "requestMapTransition",
  globalByteStateWrite: "writeGlobalByteState",
  nativeOperation: "executeNativeOperation",
});

function requireInteger(value, label) {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${label} must be an integer`);
  }
  return value;
}

function requireFourcc(value, label) {
  const normalized = String(value || "");
  if (normalized.length !== 4) {
    throw new TypeError(`${label} must be a four-character native ID`);
  }
  for (const character of normalized) {
    if (character.codePointAt(0) > 0xff) {
      throw new TypeError(`${label} must be byte-oriented`);
    }
  }
  return normalized;
}

function materializeOperand(operand, {
  label,
  fourcc = false,
  resolveOperand,
  effect,
}) {
  if (!operand || typeof operand !== "object") {
    throw new TypeError(`${label} operand is missing`);
  }
  let value;
  if (operand.kind === "constant") {
    value = fourcc ? operand.ascii : operand.value;
  } else {
    if (typeof resolveOperand !== "function") {
      throw new Error(`${label} requires a runtime operand resolver`);
    }
    value = resolveOperand(operand, { label, effect });
  }
  if (value === undefined) {
    throw new Error(`${label} could not be resolved`);
  }
  return value;
}

export function materializeNativeGameplayEffect(
  template,
  resolveOperand = null,
) {
  if (!template || typeof template !== "object") {
    throw new TypeError("native gameplay effect template must be an object");
  }
  const read = (field, options = {}) => materializeOperand(
    template[field],
    {
      label: options.label || field,
      fourcc: options.fourcc || false,
      resolveOperand,
      effect: template,
    },
  );
  let effect;
  switch (template.kind) {
    case "stateBankWrite":
      effect = {
        kind: template.kind,
        bank: template.bank,
        index: read("index", { label: "state bank index" }),
        value: read("value", { label: "state bank value" }),
      };
      break;
    case "actorByteStateWrite":
      effect = {
        kind: template.kind,
        actor: read("actor", { fourcc: true }),
        value: read("value", { label: "actor byte state" }),
      };
      break;
    case "mapLayerState":
      effect = {
        kind: template.kind,
        layer: read("layer", { label: "MAP layer" }),
        value: read("value", { label: "MAP layer state" }),
      };
      break;
    case "objectRuntimeFlag":
    case "objectPresentationFlag":
      effect = {
        kind: template.kind,
        object: read("object", { fourcc: true }),
        mode: read("mode", { label: "object flag mode" }),
      };
      break;
    case "mapTransition":
      effect = {
        kind: template.kind,
        scene: read("scene", { label: "transition scene" }),
        area: read("area", {
          label: "transition area",
          fourcc: true,
        }),
        entry: read("entry", { label: "transition entry" }),
      };
      break;
    case "globalByteStateWrite":
      effect = {
        kind: template.kind,
        value: read("value", { label: "global byte state" }),
      };
      break;
    case "nativeOperation":
      effect = {
        kind: template.kind,
        semanticId: template.semanticId,
        arguments: (template.arguments || []).map(
          (argument, index) => materializeOperand(argument, {
            label: `native argument ${index}`,
            resolveOperand,
            effect: template,
          }),
        ),
      };
      break;
    default:
      throw new RangeError(
        `unsupported native gameplay effect ${template.kind}`,
      );
  }
  return validateNativeGameplayEffect({
    ...effect,
    source: template.source,
  });
}

export function validateNativeGameplayEffect(effect) {
  if (!effect || typeof effect !== "object") {
    throw new TypeError("native gameplay effect must be an object");
  }
  if (!EFFECT_ADAPTERS[effect.kind]) {
    throw new RangeError(`unsupported native gameplay effect ${effect.kind}`);
  }
  switch (effect.kind) {
    case "stateBankWrite":
      requireInteger(effect.bank, "state bank");
      requireInteger(effect.index, "state bank index");
      requireInteger(effect.value, "state bank value");
      break;
    case "actorByteStateWrite":
      requireFourcc(effect.actor, "actor");
      requireInteger(effect.value, "actor byte state");
      break;
    case "mapLayerState":
      requireInteger(effect.layer, "map layer");
      requireInteger(effect.value, "map layer state");
      break;
    case "objectRuntimeFlag":
      requireFourcc(effect.object, "runtime object");
      if (![1, 2].includes(effect.mode)) {
        throw new RangeError("object runtime flag mode must be 1 or 2");
      }
      break;
    case "objectPresentationFlag":
      requireFourcc(effect.object, "presentation object");
      if (![0, 1].includes(effect.mode)) {
        throw new RangeError(
          "object presentation flag mode must be 0 or 1",
        );
      }
      break;
    case "mapTransition":
      requireInteger(effect.scene, "transition scene");
      requireFourcc(effect.area, "transition area");
      requireInteger(effect.entry, "transition entry");
      break;
    case "globalByteStateWrite":
      requireInteger(effect.value, "global byte state");
      if (effect.value < 0 || effect.value > 0xff) {
        throw new RangeError("global byte state must be between 0 and 255");
      }
      break;
    case "nativeOperation":
      if (!effect.semanticId) {
        throw new TypeError("native operation requires a semantic ID");
      }
      if (!Array.isArray(effect.arguments)) {
        throw new TypeError("native operation arguments must be an array");
      }
      break;
    default:
      break;
  }
  return effect;
}

function adapterFor(effect, adapters) {
  const adapterName = EFFECT_ADAPTERS[effect.kind];
  const adapter = adapters?.[adapterName];
  if (!adapter || typeof adapter.apply !== "function") {
    throw new Error(
      `native gameplay effect ${effect.kind} requires ${adapterName}`,
    );
  }
  return adapter;
}

export class NativeGameplayEffectRuntime {
  constructor(adapters = {}) {
    this.adapters = { ...adapters };
  }

  async execute(effects, context = {}) {
    if (!Array.isArray(effects)) {
      throw new TypeError("native gameplay effects must be an array");
    }
    const plan = effects.map((effect) => {
      validateNativeGameplayEffect(effect);
      const adapter = adapterFor(effect, this.adapters);
      adapter.validate?.(effect, context);
      return { effect, adapter };
    });
    const transitionIndex = plan.findIndex(
      ({ effect }) => effect.kind === "mapTransition",
    );
    if (
      transitionIndex !== -1
      && (
        transitionIndex !== plan.length - 1
        || plan.some(
          ({ effect }, index) => (
            index !== transitionIndex && effect.kind === "mapTransition"
          ),
        )
      )
    ) {
      throw new Error(
        "a native map transition must be the single terminal effect",
      );
    }

    const applied = [];
    try {
      for (const step of plan) {
        const rollback = await step.adapter.apply(step.effect, context);
        applied.push({
          ...step,
          rollback: typeof rollback === "function" ? rollback : null,
        });
      }
    } catch (error) {
      for (let index = applied.length - 1; index >= 0; index -= 1) {
        try {
          await applied[index].rollback?.();
        } catch {
          // Preserve the original failure. Adapters own rollback telemetry.
        }
      }
      throw error;
    }
    return {
      status: "applied",
      count: applied.length,
      effects: applied.map(({ effect }) => effect),
    };
  }
}

export function createNativeStateBankEffectAdapter(dialogueState) {
  if (
    !dialogueState
    || typeof dialogueState.read !== "function"
    || typeof dialogueState.write !== "function"
  ) {
    throw new TypeError("native dialogue state is required");
  }
  return {
    validate(effect) {
      if (effect.kind !== "stateBankWrite") {
        throw new TypeError("state-bank adapter received another effect kind");
      }
    },
    apply(effect) {
      const previous = dialogueState.read(effect.bank, effect.index);
      if (!dialogueState.write(effect.bank, effect.index, effect.value)) {
        throw new RangeError(
          `native state bank ${effect.bank}:${effect.index} is unavailable`,
        );
      }
      return () => {
        dialogueState.write(effect.bank, effect.index, previous);
      };
    },
  };
}

export function createNativeActorByteEffectAdapter(actorByteState) {
  if (
    !actorByteState
    || typeof actorByteState.read !== "function"
    || typeof actorByteState.write !== "function"
  ) {
    throw new TypeError("native actor byte state is required");
  }
  return {
    validate(effect) {
      if (effect.kind !== "actorByteStateWrite") {
        throw new TypeError("actor-byte adapter received another effect kind");
      }
    },
    apply(effect) {
      const previous = actorByteState.read(effect.actor);
      if (!actorByteState.write(effect.actor, effect.value)) {
        throw new RangeError(
          `native actor byte state ${effect.actor} is unavailable`,
        );
      }
      return () => {
        actorByteState.write(effect.actor, previous);
      };
    },
  };
}

export function createNativeMapLayerEffectAdapter(mapLayerState) {
  if (
    !mapLayerState
    || typeof mapLayerState.scriptState !== "function"
    || typeof mapLayerState.setScriptState !== "function"
    || typeof mapLayerState.restoreScriptState !== "function"
  ) {
    throw new TypeError("native MAP layer state is required");
  }
  return {
    validate(effect) {
      if (effect.kind !== "mapLayerState") {
        throw new TypeError("MAP-layer adapter received another effect kind");
      }
    },
    apply(effect) {
      const previous = mapLayerState.scriptState(effect.layer);
      mapLayerState.setScriptState(effect.layer, effect.value);
      return () => {
        mapLayerState.restoreScriptState(effect.layer, previous);
      };
    },
  };
}

export function createNativeGlobalByteEffectAdapter(sceneState) {
  if (
    !sceneState
    || typeof sceneState.readGlobalByte !== "function"
    || typeof sceneState.writeGlobalByte !== "function"
  ) {
    throw new TypeError("native scene gameplay state is required");
  }
  return {
    validate(effect) {
      if (effect.kind !== "globalByteStateWrite") {
        throw new TypeError(
          "global-byte adapter received another effect kind",
        );
      }
    },
    apply(effect) {
      const previous = sceneState.readGlobalByte();
      sceneState.writeGlobalByte(effect.value);
      return () => sceneState.writeGlobalByte(previous);
    },
  };
}

export function createNativeObjectRuntimeFlagEffectAdapter(sceneState) {
  if (
    !sceneState
    || typeof sceneState.readObjectRuntimeFlag !== "function"
    || typeof sceneState.writeObjectRuntimeFlag !== "function"
  ) {
    throw new TypeError("native scene gameplay state is required");
  }
  return {
    validate(effect) {
      if (effect.kind !== "objectRuntimeFlag") {
        throw new TypeError(
          "object-runtime adapter received another effect kind",
        );
      }
    },
    apply(effect) {
      const previous = sceneState.readObjectRuntimeFlag(effect.object);
      sceneState.writeObjectRuntimeFlag(effect.object, effect.mode === 1);
      return () => (
        sceneState.writeObjectRuntimeFlag(effect.object, previous)
      );
    },
  };
}

export function createNativeMapTransitionEffectAdapter({
  resolve,
  request,
}) {
  if (typeof resolve !== "function" || typeof request !== "function") {
    throw new TypeError("native transition resolve and request are required");
  }
  const resolved = new WeakMap();
  return {
    validate(effect) {
      if (effect.kind !== "mapTransition") {
        throw new TypeError(
          "map-transition adapter received another effect kind",
        );
      }
      const transition = resolve(effect);
      if (!transition) {
        throw new Error(
          `native transition ${effect.scene}:${effect.area}:${effect.entry} `
          + "has no exact browser destination",
        );
      }
      resolved.set(effect, transition);
    },
    async apply(effect, context) {
      await request(resolved.get(effect), context);
    },
  };
}

export function createNativeGameplayEffectRuntime(adapters) {
  return new NativeGameplayEffectRuntime(adapters);
}
