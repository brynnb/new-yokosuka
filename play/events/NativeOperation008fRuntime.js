function requireFourcc(value) {
  const fourcc = String(value || "");
  if (fourcc.length !== 4) {
    throw new TypeError(
      "native operation 0x008f object requires a four-character ID",
    );
  }
  for (const character of fourcc) {
    if (character.codePointAt(0) > 0xff) {
      throw new TypeError(
        "native operation 0x008f object ID must be byte-oriented",
      );
    }
  }
  return fourcc;
}

function objectTagArgument(action, readArgument) {
  const operand = action.arguments?.[0];
  if (operand?.kind === "constant" && typeof operand.ascii === "string") {
    return requireFourcc(operand.ascii);
  }
  const value = readArgument(0);
  if (typeof value === "string") return requireFourcc(value);
  if (!Number.isInteger(value)) {
    throw new TypeError("native operation 0x008f object tag is unavailable");
  }
  const word = value >>> 0;
  return requireFourcc(String.fromCharCode(
    word & 0xff,
    (word >>> 8) & 0xff,
    (word >>> 16) & 0xff,
    (word >>> 24) & 0xff,
  ));
}

function requireWord(value, label) {
  if (
    !Number.isInteger(value)
    || value < -0x80000000
    || value > 0xffffffff
  ) {
    throw new RangeError(`${label} must be a 32-bit word`);
  }
  return value >>> 0;
}

function adapter(options, context, name) {
  return options[name] || context[name];
}

function requireAdapters(options, context, names) {
  const resolved = {};
  for (const name of names) {
    const value = adapter(options, context, name);
    if (typeof value !== "function") {
      return {
        stopped: {
          status: "stopped",
          reason: `native-operation-008f-${name}-missing`,
        },
      };
    }
    resolved[name] = value;
  }
  return { resolved };
}

export class NativeOperation008fState {
  constructor() {
    this.objects = new Map();
  }

  configureObject({ objectTag, object }) {
    if (object === undefined) {
      throw new TypeError(
        "native operation 0x008f configured object may not be undefined",
      );
    }
    this.objects.set(requireFourcc(objectTag), object);
    return object;
  }

  resolveObject(objectTag) {
    const key = requireFourcc(objectTag);
    if (!this.objects.has(key)) {
      return {
        available: false,
        reason: "native-operation-008f-object-state-unavailable",
      };
    }
    return { available: true, object: this.objects.get(key) };
  }
}

export function createNativeOperation008fState() {
  return new NativeOperation008fState();
}

const ZERO_ROUTE_ADAPTERS = [
  "invokeNativeOperation008fZeroStage0",
  "invokeNativeOperation008fZeroStage1",
];

const DESCRIPTOR_ROUTE_ADAPTERS = [
  "captureNativeOperation008fIdentity",
  "invokeNativeOperation008fDescriptorPrepare",
  "resolveNativeOperation008fOwnerField1c",
  "applyNativeOperation008fDescriptor",
  "queryNativeOperation008fGate",
  "invokeNativeOperation008fReconcile",
  "invokeNativeOperation008fFinalizeStage0",
  "invokeNativeOperation008fFinalizeStage1",
];

export function createNativeOperation008fSemanticHandlers(options = {}) {
  return {
    "native-operation-008f-object-orchestration": async ({
      action,
      context,
      readArgument,
    }) => {
      let objectTag;
      let descriptor;
      let value;
      try {
        objectTag = objectTagArgument(action, readArgument);
        descriptor = requireWord(
          readArgument(1),
          "native operation 0x008f descriptor",
        );
        value = requireWord(
          readArgument(2),
          "native operation 0x008f value",
        );
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }

      const state = context.nativeOperation008fState;
      if (!state || typeof state.resolveObject !== "function") {
        return {
          status: "stopped",
          reason: "native-operation-008f-state-unavailable",
        };
      }
      const resolution = state.resolveObject(objectTag);
      if (!resolution.available) {
        return { status: "stopped", reason: resolution.reason };
      }
      const object = resolution.object;

      if (descriptor === 0) {
        const preflight = requireAdapters(
          options,
          context,
          ZERO_ROUTE_ADAPTERS,
        );
        if (preflight.stopped) return preflight.stopped;
        const {
          invokeNativeOperation008fZeroStage0,
          invokeNativeOperation008fZeroStage1,
        } = preflight.resolved;
        await invokeNativeOperation008fZeroStage0(object);
        await invokeNativeOperation008fZeroStage1(object);
        return {
          status: "continued",
          mutation: { route: "zero-descriptor", objectTag },
        };
      }

      const preflight = requireAdapters(
        options,
        context,
        DESCRIPTOR_ROUTE_ADAPTERS,
      );
      if (preflight.stopped) return preflight.stopped;
      const adapters = preflight.resolved;
      const baseline = await adapters.captureNativeOperation008fIdentity(
        object,
      );
      await adapters.invokeNativeOperation008fDescriptorPrepare(object);
      const ownerField1c = (
        await adapters.resolveNativeOperation008fOwnerField1c()
      );
      await adapters.applyNativeOperation008fDescriptor({
        object,
        ownerField1c,
        descriptor,
        value,
      });
      const gate = requireWord(
        await adapters.queryNativeOperation008fGate(object),
        "native operation 0x008f gate result",
      );
      if (gate === 0) {
        return {
          status: "continued",
          mutation: {
            route: "descriptor-gate-zero",
            objectTag,
            descriptor,
            value,
          },
        };
      }

      const current = await adapters.captureNativeOperation008fIdentity(
        object,
      );
      const reconciled = current !== baseline;
      if (reconciled) {
        await adapters.invokeNativeOperation008fReconcile(object);
      }
      await adapters.invokeNativeOperation008fFinalizeStage0(object);
      await adapters.invokeNativeOperation008fFinalizeStage1(object);
      return {
        status: "continued",
        mutation: {
          route: "descriptor-gate-nonzero",
          objectTag,
          descriptor,
          value,
          reconciled,
        },
      };
    },
  };
}
