const SLOT_BY_SELECTOR = new Map([
  [0, 0], [3, 1], [6, 2], [11, 3],
  [17, 4], [21, 5], [26, 6], [33, 7],
]);

function requireObjectTag(value) {
  const objectTag = String(value || "");
  if (
    objectTag.length !== 4
    || [...objectTag].some(character => character.codePointAt(0) > 0xff)
  ) {
    throw new TypeError("native MOMT vector slot requires a four-byte object tag");
  }
  return objectTag;
}

function objectTagArgument(action, readArgument) {
  const operand = action.arguments?.[0];
  if (operand?.kind === "constant" && typeof operand.ascii === "string") {
    return requireObjectTag(operand.ascii);
  }
  const value = readArgument(0);
  if (typeof value === "string") return requireObjectTag(value);
  if (!Number.isInteger(value)) {
    throw new TypeError("native MOMT vector slot object tag is unavailable");
  }
  const word = value >>> 0;
  return requireObjectTag(String.fromCharCode(
    word & 0xff,
    word >>> 8 & 0xff,
    word >>> 16 & 0xff,
    word >>> 24 & 0xff,
  ));
}

function requireWords(words) {
  if (
    !Array.isArray(words)
    || words.length !== 3
    || words.some(word => !Number.isInteger(word))
  ) {
    throw new TypeError("native MOMT vector slot requires three integer words");
  }
  return Object.freeze(words.map(word => word >>> 0));
}

function cloneSlot(slot) {
  return slot ? { ...slot, words: [...slot.words], sourceWords: [...slot.sourceWords] } : null;
}

function routeForFlags(flags) {
  const word = flags >>> 0;
  if (word & 0x40000000) {
    return {
      route: "secondary-direct",
      pointerTableOffset: 0x44,
      requiresObjectTransform: false,
    };
  }
  if (word & 0x01000000) {
    return {
      route: "primary-direct",
      pointerTableOffset: 0x1c,
      requiresObjectTransform: false,
    };
  }
  return {
    route: "secondary-object-transformed",
    pointerTableOffset: 0x44,
    requiresObjectTransform: true,
  };
}

/** Transaction-owned representation of MOMT +0x368's eight vector slots. */
export class NativeMomtVectorSlotState {
  constructor() {
    this.objects = new Map();
    this.revision = 0;
  }

  configureObject({
    objectTag,
    objectAvailable,
    momtAvailable,
    objectTransformPresent = false,
  }) {
    if (
      typeof objectAvailable !== "boolean"
      || typeof momtAvailable !== "boolean"
      || typeof objectTransformPresent !== "boolean"
    ) {
      throw new TypeError("native MOMT vector slot availability must be Boolean");
    }
    const key = requireObjectTag(objectTag);
    this.objects.set(key, {
      objectAvailable,
      momtAvailable,
      objectTransformPresent,
      slots: Array(8).fill(null),
    });
    this.revision += 1;
  }

  planWrite({ objectTag, selector, flags }) {
    const key = requireObjectTag(objectTag);
    if (!Number.isInteger(selector) || !Number.isInteger(flags)) {
      throw new TypeError("native MOMT vector selector and flags must be integers");
    }
    const object = this.objects.get(key);
    if (!object) {
      return { applied: false, reason: "momt-vector-slot-state-unavailable" };
    }
    if (!object.objectAvailable) {
      return { applied: false, reason: "momt-vector-slot-object-unavailable" };
    }
    if (!object.momtAvailable) {
      return { applied: false, reason: "momt-vector-slot-record-unavailable" };
    }
    const slot = SLOT_BY_SELECTOR.get(selector);
    if (slot === undefined) {
      return {
        applied: false,
        nativeNoOp: true,
        objectTag: key,
        selector,
      };
    }
    const route = routeForFlags(flags);
    return {
      applied: true,
      expectedRevision: this.revision,
      objectTag: key,
      selector,
      slot,
      flags: flags >>> 0,
      ...route,
      objectTransformPresent: object.objectTransformPresent,
    };
  }

  commit(plan, sourceWords, storedWords = sourceWords) {
    if (!plan?.applied) {
      throw new TypeError("native MOMT vector slot write plan is required");
    }
    if (plan.expectedRevision !== this.revision) {
      throw new Error("native MOMT vector slot state changed before commit");
    }
    const object = this.objects.get(plan.objectTag);
    if (!object?.objectAvailable || !object.momtAvailable) {
      throw new Error("native MOMT vector slot object changed before commit");
    }
    const entry = {
      selector: plan.selector,
      slot: plan.slot,
      flags: plan.flags,
      route: plan.route,
      pointerTableOffset: plan.pointerTableOffset,
      otherPointerTableCleared: plan.pointerTableOffset === 0x1c ? 0x44 : 0x1c,
      objectTransformed: (
        plan.requiresObjectTransform && plan.objectTransformPresent
      ),
      sourceWords: requireWords(sourceWords),
      words: requireWords(storedWords),
    };
    object.slots[plan.slot] = entry;
    this.revision += 1;
    return cloneSlot(entry);
  }

  readSlot(objectTag, slot) {
    if (!Number.isInteger(slot) || slot < 0 || slot >= 8) {
      throw new RangeError("native MOMT vector slot index must be 0..7");
    }
    return cloneSlot(this.objects.get(requireObjectTag(objectTag))?.slots[slot]);
  }
}

export function createNativeMomtVectorSlotState() {
  return new NativeMomtVectorSlotState();
}

function inlineVectorWords(operand, context) {
  if (
    !["frame-address", "scene-address"].includes(operand?.kind)
    || !Number.isInteger(operand.offset)
  ) return null;
  const read = operand.kind === "frame-address"
    ? context.readFrameField
    : context.readSceneField;
  const words = [0, 4, 8].map(delta => read?.(operand.offset + delta));
  return words.every(Number.isInteger) ? requireWords(words) : null;
}

export function createNativeMomtVectorSlotSemanticHandlers({
  readNativeVector,
  transformNativeObjectPointWords,
} = {}) {
  return {
    "resolved-object-momt-vector-slot-write": async ({
      action,
      context,
      readArgument,
    }) => {
      const state = context.nativeMomtVectorSlotState;
      const planWrite = context.planNativeMomtVectorSlotWrite
        || state?.planWrite?.bind(state);
      const commitWrite = context.commitNativeMomtVectorSlotWrite
        || state?.commit?.bind(state);
      if (typeof planWrite !== "function" || typeof commitWrite !== "function") {
        return { status: "stopped", reason: "momt-vector-slot-state-unavailable" };
      }
      let plan;
      try {
        plan = await planWrite({
          objectTag: objectTagArgument(action, readArgument),
          selector: readArgument(1),
          flags: readArgument(3),
        });
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
      if (!plan.applied) {
        return plan.nativeNoOp
          ? { status: "continued", mutation: plan }
          : { status: "stopped", reason: plan.reason };
      }

      const operand = action.arguments?.[2];
      let sourceWords = inlineVectorWords(operand, context);
      if (!sourceWords) {
        const read = readNativeVector || context.readNativeVector;
        if (typeof read !== "function") {
          return { status: "stopped", reason: "native-vector-reader-missing" };
        }
        sourceWords = await read(readArgument(2));
      }
      try {
        sourceWords = requireWords(sourceWords);
      } catch {
        return { status: "stopped", reason: "native-vector-source-unavailable" };
      }

      let storedWords = sourceWords;
      if (plan.requiresObjectTransform && plan.objectTransformPresent) {
        const transform = (
          transformNativeObjectPointWords
          || context.transformNativeObjectPointWords
        );
        if (typeof transform !== "function") {
          return {
            status: "stopped",
            reason: "native-object-point-transform-missing",
          };
        }
        storedWords = await transform({
          objectTag: plan.objectTag,
          words: [...sourceWords],
          source: {
            functionFileOffset: context.location?.functionId,
            callFileOffset: action.callFileOffset,
          },
        });
        try {
          storedWords = requireWords(storedWords);
        } catch {
          return {
            status: "stopped",
            reason: "native-object-point-transform-invalid",
          };
        }
      }
      const mutation = await commitWrite(plan, sourceWords, storedWords);
      return { status: "continued", mutation };
    },
  };
}
