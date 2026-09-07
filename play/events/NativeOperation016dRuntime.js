function requireInt32(value) {
  if (!Number.isInteger(value) || value < -0x80000000 || value > 0xffffffff) {
    throw new RangeError(
      "native operation 0x016d control dword must be a 32-bit integer",
    );
  }
  return value | 0;
}

export class NativeOperation016dState {
  constructor() {
    this.controlDword224b20 = undefined;
  }

  configureControlDword224b20(value) {
    this.controlDword224b20 = requireInt32(value);
  }

  readControlDword224b20() {
    if (this.controlDword224b20 === undefined) {
      throw new Error("native-operation-016d-control-state-unavailable");
    }
    return this.controlDword224b20;
  }

  queryControlDword224b20() {
    return this.readControlDword224b20() >= 0 ? 1 : 0;
  }
}

export function createNativeOperation016dState() {
  return new NativeOperation016dState();
}

export function createNativeOperation016dSemanticHandlers({
  applyModeZero,
  applyModeOne,
  applyModeThree,
} = {}) {
  return {
    "native-operation-016d-control": async ({
      context,
      readArgument,
    }) => {
      try {
        const mode = readArgument(0);
        if (mode === 0) {
          const apply = applyModeZero || context.applyNativeOperation016dModeZero;
          if (typeof apply !== "function") {
            return {
              status: "stopped",
              reason: "native-operation-016d-mode-zero-adapter-missing",
            };
          }
          const mutation = await apply({
            mode,
            argument1: readArgument(1),
            argument2: readArgument(2),
          });
          return { status: "continued", mutation };
        }
        if (mode === 1) {
          const apply = applyModeOne || context.applyNativeOperation016dModeOne;
          if (typeof apply !== "function") {
            return {
              status: "stopped",
              reason: "native-operation-016d-mode-one-adapter-missing",
            };
          }
          const mutation = await apply({
            mode,
            argument1: readArgument(1),
            argument2: readArgument(2),
            argument3: readArgument(3),
          });
          return { status: "continued", mutation };
        }
        if (mode === 2) {
          const query = (
            context.queryNativeOperation016dControlDword224b20
          );
          if (typeof query !== "function") {
            return {
              status: "stopped",
              reason: "native-operation-016d-control-state-unavailable",
            };
          }
          return { result: query() };
        }
        if (mode === 3) {
          const apply = (
            applyModeThree || context.applyNativeOperation016dModeThree
          );
          if (typeof apply !== "function") {
            return {
              status: "stopped",
              reason: "native-operation-016d-mode-three-adapter-missing",
            };
          }
          const mutation = await apply({ mode });
          return { status: "continued", mutation };
        }
        if (mode === 4) {
          return {
            status: "continued",
            mutation: { mode, nativeNoOp: true },
          };
        }
        return {
          status: "stopped",
          reason: "native-operation-016d-mode-unproved",
        };
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
    },
  };
}
