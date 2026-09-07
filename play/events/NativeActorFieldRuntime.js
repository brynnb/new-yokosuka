function requireFourcc(value) {
  const fourcc = String(value || "");
  if (fourcc.length !== 4) {
    throw new TypeError("native actor field tag must have four bytes");
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
    throw new TypeError("native actor field tag is unavailable");
  }
  return String.fromCharCode(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
}

export class NativeActorFieldState {
  constructor() {
    this.actors = new Map();
    this.globalFallback = {};
  }

  configureActor({
    actorTag,
    actorAvailable,
    dword7c,
    dwordB8,
    floatWordBc,
  } = {}) {
    if (typeof actorAvailable !== "boolean") {
      throw new TypeError("native actor availability must be boolean");
    }
    for (const [name, value] of Object.entries({
      dword7c,
      dwordB8,
      floatWordBc,
    })) {
      if (value !== undefined && !Number.isInteger(value)) {
        throw new TypeError(`native actor ${name} must be an integer`);
      }
    }
    const state = {
      ...(this.actors.get(requireFourcc(actorTag)) || {}),
      actorAvailable,
      ...(dword7c === undefined ? {} : { dword7c: dword7c >>> 0 }),
      ...(dwordB8 === undefined ? {} : { dwordB8: dwordB8 >>> 0 }),
      ...(floatWordBc === undefined
        ? {}
        : { floatWordBc: floatWordBc >>> 0 }),
    };
    this.actors.set(requireFourcc(actorTag), state);
    return { ...state };
  }

  configureGlobalFallback({ dwordB8, floatWordBc } = {}) {
    for (const [name, value] of Object.entries({ dwordB8, floatWordBc })) {
      if (value !== undefined && !Number.isInteger(value)) {
        throw new TypeError(`native global fallback ${name} must be an integer`);
      }
    }
    this.globalFallback = {
      ...this.globalFallback,
      ...(dwordB8 === undefined ? {} : { dwordB8: dwordB8 >>> 0 }),
      ...(floatWordBc === undefined
        ? {}
        : { floatWordBc: floatWordBc >>> 0 }),
    };
    return { ...this.globalFallback };
  }

  accessDword7c({ actorTag, mode }) {
    const key = requireFourcc(actorTag);
    const state = this.actors.get(key);
    if (!state) {
      return { reason: "actor-field-state-unavailable" };
    }
    if (!state.actorAvailable) {
      return { applied: false, result: -1, reason: "actor-unavailable" };
    }
    if (mode === 11) {
      return Number.isInteger(state.dword7c)
        ? { applied: false, result: state.dword7c >>> 0 }
        : { reason: "actor-dword-7c-value-unavailable" };
    }
    if (![0, 1, 2, 4, 8, 9].includes(mode)) {
      return { reason: "actor-dword-7c-mode-unproven" };
    }
    const previous = state.dword7c;
    state.dword7c = mode >>> 0;
    return {
      applied: true,
      actorTag: key,
      mode,
      ...(Number.isInteger(previous) ? { previous: previous >>> 0 } : {}),
      result: state.dword7c,
    };
  }

  accessB8Bc({ objectTag, mode, value }) {
    const isGlobal = objectTag === null;
    const object = isGlobal
      ? null
      : this.actors.get(requireFourcc(objectTag));
    if (!isGlobal && !object) {
      return { reason: "object-field-state-unavailable" };
    }
    const target = isGlobal || !object.actorAvailable
      ? this.globalFallback
      : object;
    const targetKind = target === this.globalFallback ? "global" : "object";
    if (mode === 3) {
      if (!Number.isInteger(value)) {
        return { reason: "object-float-bc-value-unavailable" };
      }
      const previous = target.floatWordBc;
      target.floatWordBc = value >>> 0;
      return {
        applied: true,
        targetKind,
        ...(targetKind === "object" ? { objectTag } : {}),
        mode,
        ...(Number.isInteger(previous) ? { previous: previous >>> 0 } : {}),
        value: target.floatWordBc,
      };
    }
    if (!Number.isInteger(value)) {
      return { reason: "object-dword-b8-value-unavailable" };
    }
    if (mode === 2) {
      const bitCount = value | 0;
      if (bitCount < 0 || bitCount > 4) {
        return { reason: "object-dword-b8-prefix-count-unproven" };
      }
      const previous = target.dwordB8;
      target.dwordB8 = bitCount === 0 ? 0 : (2 ** bitCount - 1) >>> 0;
      return {
        applied: true,
        targetKind,
        ...(targetKind === "object" ? { objectTag } : {}),
        mode,
        bitCount,
        ...(Number.isInteger(previous) ? { previous: previous >>> 0 } : {}),
        value: target.dwordB8,
      };
    }
    if (![0, 1].includes(mode) || value < 0 || value > 15) {
      return { reason: "object-dword-b8-bit-route-unproven" };
    }
    if (!Number.isInteger(target.dwordB8)) {
      return { reason: "object-dword-b8-state-unavailable" };
    }
    const mask = (1 << value) >>> 0;
    const previous = target.dwordB8 >>> 0;
    const wasSet = (previous & mask) === 0 ? 0 : 1;
    target.dwordB8 = mode === 0
      ? (previous & ~mask) >>> 0
      : (previous | mask) >>> 0;
    return {
      applied: true,
      targetKind,
      ...(targetKind === "object" ? { objectTag } : {}),
      mode,
      bitIndex: value,
      previous,
      value: target.dwordB8,
      result: wasSet,
    };
  }

  readActor(actorTag) {
    const state = this.actors.get(requireFourcc(actorTag));
    return state ? { ...state } : undefined;
  }

  readGlobalFallback() {
    return { ...this.globalFallback };
  }
}

export function createNativeActorFieldState() {
  return new NativeActorFieldState();
}

export function createNativeActorFieldSemanticHandlers({
  resolveActorFieldState,
  resolveObjectFieldState,
} = {}) {
  return {
    "resolved-actor-dword-7c-access": async ({
      action,
      context,
      readArgument,
    }) => {
      const mode = readArgument(1);
      if (![0, 1, 2, 4, 8, 9, 11].includes(mode)) {
        return { status: "stopped", reason: "actor-dword-7c-mode-unproven" };
      }
      const actorTag = actorTagArgument(action, readArgument);
      const access = context.accessActorDword7c;
      if (typeof access !== "function") {
        return { status: "stopped", reason: "actor-field-state-missing" };
      }
      let mutation = access({ actorTag, mode });
      if (mutation?.reason === "actor-field-state-unavailable") {
        const resolve = resolveActorFieldState || context.resolveActorFieldState;
        const configure = context.configureActorFieldState;
        if (typeof resolve === "function" && typeof configure === "function") {
          const resolved = await resolve({ actorTag, mode });
          if (resolved && typeof resolved.actorAvailable === "boolean") {
            configure({ actorTag, ...resolved });
            mutation = access({ actorTag, mode });
          }
        }
      }
      if (mutation?.reason === "actor-dword-7c-value-unavailable") {
        return {
          status: "continued",
          resultUnavailable: mutation.reason,
        };
      }
      if (mutation?.reason === "actor-field-state-unavailable") {
        return { status: "stopped", reason: mutation.reason };
      }
      if (mutation?.reason === "actor-dword-7c-mode-unproven") {
        return { status: "stopped", reason: mutation.reason };
      }
      return {
        status: "continued",
        mutation,
        ...(Object.hasOwn(mutation || {}, "result")
          ? { result: mutation.result }
          : {}),
      };
    },
    "resolved-object-b8-bc-control": async ({
      action,
      context,
      readArgument,
    }) => {
      const mode = readArgument(1);
      const value = readArgument(2);
      const authored = (
        (mode === 0 && Number.isInteger(value) && value >= 0 && value <= 12)
        || (mode === 1 && Number.isInteger(value) && value >= 0 && value <= 15)
        || (mode === 2 && Number.isInteger(value) && value >= 0 && value <= 4)
        || (mode === 3 && value === 0x41f00000)
      );
      if (!authored) {
        return { status: "stopped", reason: "object-b8-bc-route-unproven" };
      }
      const operand = action.arguments?.[0];
      const rawTag = readArgument(0);
      const objectTag = rawTag === 0 && typeof operand?.ascii !== "string"
        ? null
        : actorTagArgument(action, readArgument);
      const access = context.accessObjectB8Bc;
      if (typeof access !== "function") {
        return { status: "stopped", reason: "object-field-state-missing" };
      }
      let mutation = access({ objectTag, mode, value });
      if (mutation?.reason === "object-field-state-unavailable") {
        const resolve = resolveObjectFieldState || context.resolveObjectFieldState;
        const configure = context.configureActorFieldState;
        if (typeof resolve === "function" && typeof configure === "function") {
          const resolved = await resolve({
            objectTag,
            mode,
            sourceOperand: operand,
          });
          if (resolved && typeof resolved.actorAvailable === "boolean") {
            configure({ actorTag: objectTag, ...resolved });
            mutation = access({ objectTag, mode, value });
          }
        }
      }
      if (
        mutation?.reason === "object-dword-b8-state-unavailable"
        && [0, 1].includes(mode)
      ) {
        return {
          status: "stopped",
          reason: mutation.reason,
        };
      }
      if (mutation?.reason) {
        return { status: "stopped", reason: mutation.reason };
      }
      return {
        status: "continued",
        mutation,
        ...(Object.hasOwn(mutation, "result")
          ? { result: mutation.result }
          : {}),
      };
    },
  };
}
