function requireFourcc(value) {
  const fourcc = String(value || "");
  if (fourcc.length !== 4) {
    throw new TypeError(
      "native tagged-object action requires a four-character object tag",
    );
  }
  return fourcc;
}

function requireNativeResult(value) {
  if (!Number.isInteger(value) || value < -1 || value > 1) {
    throw new RangeError(
      "native tagged-object controller result must be -1, 0, or 1",
    );
  }
  return value;
}

function objectTagArgument(action, readArgument, index = 1) {
  const operand = action.arguments?.[index];
  if (
    operand?.kind === "constant"
    && typeof operand.ascii === "string"
  ) {
    return requireFourcc(operand.ascii);
  }
  const value = readArgument(index);
  if (value === 0) return null;
  if (!Number.isInteger(value)) {
    throw new TypeError("native tagged-object action tag is unavailable");
  }
  return requireFourcc(String.fromCharCode(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ));
}

export class NativeTaggedObjectControllerState {
  constructor() {
    this.clear();
  }

  clear() {
    this.activePair = null;
    this.configurationPointer = undefined;
    this.revision = 0;
  }

  read() {
    return this.activePair
      ? {
          activePair: [...this.activePair],
          configurationPointer: this.configurationPointer,
          revision: this.revision,
        }
      : null;
  }

  applyInitialize({ firstObjectTag, secondObjectTag, result }) {
    const nativeResult = requireNativeResult(result);
    if (nativeResult === 0) {
      this.activePair = [firstObjectTag, secondObjectTag];
      this.configurationPointer = undefined;
      this.revision += 1;
    } else {
      this.activePair = null;
      this.configurationPointer = undefined;
    }
    return this.read();
  }

  writeConfiguration(pointer) {
    if (!Number.isInteger(pointer)) {
      throw new TypeError(
        "native tagged-object controller configuration pointer is unavailable",
      );
    }
    if (!this.activePair) return -1;
    this.configurationPointer = pointer >>> 0;
    this.revision += 1;
    return 0;
  }
}

export function createNativeTaggedObjectControllerSemanticHandlers({
  state,
  initializeTaggedObjectControllerPair,
} = {}) {
  return {
    "tagged-object-controller-initialize": async ({
      action,
      context,
      readArgument,
    }) => {
      if (readArgument(0) !== 0) {
        return {
          status: "stopped",
          reason: "tagged-object-controller-initialize-mode-unproven",
        };
      }
      const controllerState = (
        state || context.nativeTaggedObjectControllerState
      );
      const initialize = (
        initializeTaggedObjectControllerPair
        || context.initializeTaggedObjectControllerPair
      );
      if (
        !(controllerState instanceof NativeTaggedObjectControllerState)
        || typeof initialize !== "function"
      ) {
        return {
          status: "stopped",
          reason: "tagged-object-controller-initialize-adapter-missing",
        };
      }
      try {
        const firstObjectTag = objectTagArgument(action, readArgument, 1);
        const secondObjectTag = objectTagArgument(action, readArgument, 2);
        const result = requireNativeResult(await initialize({
          firstObjectTag,
          secondObjectTag,
          source: sourceFor(action, context),
        }));
        return {
          status: "continued",
          result,
          mutation: controllerState.applyInitialize({
            firstObjectTag,
            secondObjectTag,
            result,
          }),
        };
      } catch (error) {
        return {
          status: "stopped",
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    },
    "tagged-object-controller-configuration-write": async ({
      context,
      readArgument,
    }) => {
      if (readArgument(0) !== 16) {
        return {
          status: "stopped",
          reason: "tagged-object-controller-configuration-mode-unproven",
        };
      }
      const controllerState = (
        state || context.nativeTaggedObjectControllerState
      );
      if (!(controllerState instanceof NativeTaggedObjectControllerState)) {
        return {
          status: "stopped",
          reason: "tagged-object-controller-state-missing",
        };
      }
      try {
        const result = controllerState.writeConfiguration(readArgument(1));
        return {
          status: "continued",
          result,
          mutation: controllerState.read(),
        };
      } catch (error) {
        return {
          status: "stopped",
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

function sourceFor(action, context) {
  return {
    functionFileOffset: context.location?.functionId,
    callFileOffset: action.callFileOffset,
  };
}

export class NativeTaggedObjectActionState {
  constructor() {
    this.clear();
  }

  clear() {
    this.active = null;
    this.revision = 0;
  }

  read() {
    return this.active ? { ...this.active } : null;
  }

  requireMode(mode) {
    if (![1, 2, 3, 4, 5].includes(mode)) {
      throw new RangeError(`native tagged-object mode ${mode} is unsupported`);
    }
    if (mode === 1) return;
    if (!this.active) {
      throw new Error("native tagged-object controller is not active");
    }
    if (
      (mode === 2 || mode === 3)
      && (
        this.active.nativeState !== 1
        || !this.active.completed
      )
    ) {
      throw new Error(
        `native tagged-object mode ${mode} requires completed state 1`,
      );
    }
    if (mode === 5 && !this.active.completed) {
      throw new Error(
        "native tagged-object mode 5 requires a completed action",
      );
    }
  }

  apply({ mode, objectTag, result }) {
    this.requireMode(mode);
    const nativeResult = requireNativeResult(result);
    if (mode === 1) {
      if (nativeResult === 0) {
        this.active = {
          objectTag: requireFourcc(objectTag),
          nativeState: 1,
          completed: false,
          revision: ++this.revision,
        };
      }
      return this.read();
    }
    if (mode === 2 || mode === 3) {
      if (nativeResult === 0) {
        this.active.nativeState = mode;
        this.active.completed = false;
        this.active.revision = ++this.revision;
      }
      return this.read();
    }
    if (mode === 4) {
      if (nativeResult === 1) {
        this.active.completed = true;
        this.active.revision = ++this.revision;
      }
      return this.read();
    }
    if (mode === 5) {
      this.active.revision = ++this.revision;
      return this.read();
    }
  }
}

export function createNativeTaggedObjectActionSemanticHandlers({
  state,
  executeTaggedObjectAction,
} = {}) {
  return {
    "tagged-object-action": async ({
      action,
      context,
      readArgument,
    }) => {
      const actionState = state || context.nativeTaggedObjectActionState;
      const execute = (
        executeTaggedObjectAction
        || context.executeTaggedObjectAction
      );
      if (
        !(actionState instanceof NativeTaggedObjectActionState)
        || typeof execute !== "function"
      ) {
        return {
          status: "stopped",
          reason: "tagged-object-action-controller-missing",
        };
      }
      const mode = readArgument(0);
      if (![1, 2, 3, 4, 5].includes(mode)) {
        return {
          status: "stopped",
          reason: `tagged-object-action-mode-unhandled:${mode}`,
        };
      }
      let objectTag;
      try {
        actionState.requireMode(mode);
        objectTag = mode === 1
          ? objectTagArgument(action, readArgument)
          : actionState.read()?.objectTag;
        const result = requireNativeResult(await execute({
          mode,
          objectTag,
          state: actionState.read(),
          source: sourceFor(action, context),
        }));
        const next = actionState.apply({ mode, objectTag, result });
        return {
          status: "continued",
          result,
          mutation: {
            mode,
            objectTag,
            next,
          },
        };
      } catch (error) {
        return {
          status: "stopped",
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

export function createNativeTaggedObjectActionState() {
  return new NativeTaggedObjectActionState();
}

export function createNativeTaggedObjectControllerState() {
  return new NativeTaggedObjectControllerState();
}
