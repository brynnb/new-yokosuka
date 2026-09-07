function requireByte(value, name) {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new RangeError(`native primary runtime ${name} must be a byte`);
  }
  return value;
}

function requireDword(value, name) {
  if (!Number.isInteger(value)) {
    throw new TypeError(`native primary runtime ${name} must be an integer`);
  }
  return value >>> 0;
}

function requireFourcc(value) {
  const fourcc = String(value || "");
  if (fourcc.length !== 4) {
    throw new TypeError(
      "native primary runtime actor requires a four-character ID",
    );
  }
  return fourcc;
}

function actorTagArgument(action, readArgument, index) {
  const operand = action.arguments?.[index];
  if (operand?.kind === "constant" && typeof operand.ascii === "string") {
    return requireFourcc(operand.ascii);
  }
  const value = readArgument(index);
  if (typeof value === "string") return requireFourcc(value);
  if (!Number.isInteger(value)) {
    throw new TypeError("native primary runtime actor tag is unavailable");
  }
  const word = value >>> 0;
  return requireFourcc(String.fromCharCode(
    word & 0xff,
    (word >>> 8) & 0xff,
    (word >>> 16) & 0xff,
    (word >>> 24) & 0xff,
  ));
}

function exactAdapter(options, context, name) {
  return options[name] || context[name];
}

function requireResult(value, mode) {
  if (
    !Number.isInteger(value)
    || value < -0x80000000
    || value > 0xffffffff
  ) {
    throw new TypeError(
      `native primary runtime mode ${mode} result must be a 32-bit word`,
    );
  }
  return value;
}

export class NativePrimaryRuntimeState {
  constructor() {
    this.state = undefined;
    this.transitionCallbackArgument = undefined;
    this.transitionCallbackRevision = 0;
  }

  configure({
    available,
    currentEventPresent = false,
    gateByte = 0,
    stateDword1f8 = 0,
    stateDword20 = 0,
    statusByte1d9 = 0,
    globalByteB02 = 0,
  }) {
    if (typeof available !== "boolean") {
      throw new TypeError(
        "native primary runtime availability must be boolean",
      );
    }
    if (typeof currentEventPresent !== "boolean") {
      throw new TypeError(
        "native primary runtime current-event presence must be boolean",
      );
    }
    this.state = {
      available,
      currentEventPresent,
      gateByte: requireByte(gateByte, "gate"),
      stateDword1f8: requireDword(stateDword1f8, "dword +0x1f8"),
      stateDword20: requireDword(stateDword20, "dword +0x20"),
      statusByte1d9: requireByte(statusByte1d9, "byte +0x1d9"),
      globalByteB02: requireByte(globalByteB02, "global byte B02"),
    };
    return this.read();
  }

  requireState() {
    if (!this.state) {
      throw new Error("native primary runtime state is unavailable");
    }
    return this.state;
  }

  planTransition(mode) {
    const state = this.requireState();
    if (!state.available) {
      throw new Error("native primary runtime object is unavailable");
    }
    if (mode === 0) {
      return {
        mode,
        next: {
          ...state,
          stateDword1f8: 0,
          stateDword20: 2,
          globalByteB02: 0,
        },
        callbackArgument: null,
      };
    }
    if (mode === 1) {
      return {
        mode,
        next: {
          ...state,
          stateDword1f8: 1,
          stateDword20: 1,
        },
        callbackArgument: 1,
      };
    }
    throw new RangeError("native primary runtime transition mode is unproved");
  }

  commitTransition(plan) {
    if (
      !plan
      || (plan.mode !== 0 && plan.mode !== 1)
      || !plan.next
    ) {
      throw new TypeError("native primary runtime transition plan is invalid");
    }
    this.state = { ...plan.next };
    return this.read();
  }

  queryStateOne() {
    const state = this.requireState();
    return {
      result: Boolean(
        state.currentEventPresent
        && state.available
        && (state.gateByte === 0 || state.gateByte === 1)
        && state.stateDword1f8 === 1
      ),
      currentEventPresent: state.currentEventPresent,
      objectAvailable: state.available,
      gateByte: state.gateByte,
      stateDword1f8: state.stateDword1f8,
    };
  }

  queryStatusByte() {
    const state = this.requireState();
    return {
      result: Boolean(state.available && state.statusByte1d9 !== 0),
      objectAvailable: state.available,
      statusByte1d9: state.statusByte1d9,
    };
  }

  setCurrentEventPresent(present) {
    if (typeof present !== "boolean") {
      throw new TypeError(
        "native primary runtime current-event presence must be boolean",
      );
    }
    const state = this.requireState();
    this.state = {
      ...state,
      currentEventPresent: present,
    };
    return this.read();
  }

  invokeTransitionCallback(argument) {
    if (argument !== 1) {
      throw new RangeError(
        "native primary runtime transition callback argument is unproved",
      );
    }
    this.transitionCallbackArgument = argument;
    this.transitionCallbackRevision += 1;
    return this.readTransitionCallback();
  }

  readTransitionCallback() {
    return {
      argument: this.transitionCallbackArgument,
      revision: this.transitionCallbackRevision,
    };
  }

  read() {
    return this.state ? { ...this.state } : undefined;
  }
}

export function createNativePrimaryRuntimeState() {
  return new NativePrimaryRuntimeState();
}

export function createNativePrimaryRuntimeSemanticHandlers({
  planPrimaryRuntimeTransition,
  commitPrimaryRuntimeTransition,
  invokePrimaryRuntimeTransition,
  queryPrimaryRuntimeStateOne,
  queryPrimaryRuntimeStatusByte,
  ...extendedOptions
} = {}) {
  const handlers = {
    "primary-runtime-state-transition": async ({
      context,
      readArgument,
    }) => {
      const planTransition = (
        planPrimaryRuntimeTransition
        || context.planPrimaryRuntimeTransition
      );
      const commitTransition = (
        commitPrimaryRuntimeTransition
        || context.commitPrimaryRuntimeTransition
      );
      if (
        typeof planTransition !== "function"
        || typeof commitTransition !== "function"
      ) {
        return {
          status: "stopped",
          reason: "primary-runtime-transition-state-adapter-missing",
        };
      }
      const mode = readArgument(0);
      const invokeTransition = (
        invokePrimaryRuntimeTransition
        || context.invokePrimaryRuntimeTransition
      );
      if (mode === 1 && typeof invokeTransition !== "function") {
        return {
          status: "stopped",
          reason: "primary-runtime-transition-callback-missing",
        };
      }
      try {
        const plan = await planTransition(mode);
        const state = await commitTransition(plan);
        if (plan.callbackArgument !== null) {
          await invokeTransition(plan.callbackArgument);
        }
        return { status: "continued", mutation: { plan, state } };
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
    },
    "primary-runtime-state-one-query": async ({ context }) => {
      const query = (
        queryPrimaryRuntimeStateOne
        || context.queryPrimaryRuntimeStateOne
      );
      if (typeof query !== "function") {
        return {
          status: "stopped",
          reason: "primary-runtime-state-one-query-adapter-missing",
        };
      }
      try {
        const detail = await query();
        return { result: detail.result ? 1 : 0, query: detail };
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
    },
    "primary-runtime-status-byte-query": async ({ context }) => {
      const query = (
        queryPrimaryRuntimeStatusByte
        || context.queryPrimaryRuntimeStatusByte
      );
      if (typeof query !== "function") {
        return {
          status: "stopped",
          reason: "primary-runtime-status-byte-query-adapter-missing",
        };
      }
      try {
        const detail = await query();
        return { result: detail.result ? 1 : 0, query: detail };
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
    },
  };
  handlers["primary-runtime-extended-operation"] = async ({
    action,
    context,
    readArgument,
  }) => {
    let mode;
    try {
      mode = readArgument(0);
      if (mode === 12) {
        if (readArgument(1) !== 0) {
          return {
            status: "stopped",
            reason: "primary-runtime-mode-12-value-unproved",
          };
        }
        return {
          status: "continued",
          mutation: { mode, route: "native-no-op" },
        };
      }

      const definitions = {
        7: ["invokePrimaryRuntimeMode7", true, false],
        9: ["invokePrimaryRuntimeMode9", true, false],
        11: ["queryPrimaryRuntimeMode11", false, true],
        13: ["invokePrimaryRuntimeMode13", true, false],
        15: ["queryPrimaryRuntimeMode15", false, true],
        17: ["queryPrimaryRuntimeMode17", true, true],
        18: ["invokePrimaryRuntimeMode18", false, false],
      };
      const definition = definitions[mode];
      if (definition) {
        const [name, takesArgument, returnsResult] = definition;
        const invoke = exactAdapter(extendedOptions, context, name);
        if (typeof invoke !== "function") {
          return {
            status: "stopped",
            reason: `primary-runtime-${name}-missing`,
          };
        }
        const value = takesArgument ? readArgument(1) : undefined;
        const result = await invoke(...(takesArgument ? [value] : []));
        if (returnsResult) {
          return { result: requireResult(result, mode) };
        }
        return {
          status: "continued",
          mutation: {
            mode,
            ...(takesArgument ? { value } : {}),
          },
        };
      }

      if (mode === 14 || mode === 16) {
        const resolveActor = exactAdapter(
          extendedOptions,
          context,
          "resolvePrimaryRuntimeActor",
        );
        const invokeName = (
          mode === 14
            ? "invokePrimaryRuntimeMode14"
            : "invokePrimaryRuntimeMode16"
        );
        const invoke = exactAdapter(
          extendedOptions,
          context,
          invokeName,
        );
        if (typeof resolveActor !== "function") {
          return {
            status: "stopped",
            reason: "primary-runtime-resolvePrimaryRuntimeActor-missing",
          };
        }
        if (typeof invoke !== "function") {
          return {
            status: "stopped",
            reason: `primary-runtime-${invokeName}-missing`,
          };
        }
        const actorTag = actorTagArgument(action, readArgument, 1);
        const value = mode === 14 ? readArgument(2) : undefined;
        const actor = await resolveActor({
          actorTag,
          source: {
            functionFileOffset: context.location?.functionId,
            callFileOffset: action.callFileOffset,
          },
        });
        if (actor === undefined) {
          return {
            status: "stopped",
            reason: "primary-runtime-actor-resolution-unavailable",
          };
        }
        if (actor !== null) {
          await invoke(...(mode === 14 ? [actor, value] : [actor]));
        }
        return {
          status: "continued",
          mutation: {
            mode,
            actorTag,
            actorPresent: actor !== null,
            ...(mode === 14 ? { value } : {}),
          },
        };
      }
      return {
        status: "stopped",
        reason: "primary-runtime-extended-mode-unproved",
      };
    } catch (error) {
      return { status: "stopped", reason: error.message };
    }
  };
  return handlers;
}
