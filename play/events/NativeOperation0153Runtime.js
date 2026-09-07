export class NativeOperation0153State {
  constructor(value = 0) {
    this.value = value ? 1 : 0;
  }

  writeFromSignedArgument(argument) {
    const previous = this.value;
    this.value = (argument | 0) < 0 ? 1 : 0;
    return { previous, value: this.value };
  }

  clear() {
    this.value = 0;
  }
}

export function createNativeOperation0153State(options) {
  return new NativeOperation0153State(options?.value);
}

export function createNativeOperation0153SemanticHandlers({
  state = createNativeOperation0153State(),
  writeNativeOperation0153Flag,
} = {}) {
  return {
    "native-operation-0153-negative-flag-write": async ({
      context,
      readArgument,
    }) => {
      const argument = readArgument(0);
      if (![0, 1, 0xffffffff].includes(argument >>> 0)) {
        return {
          status: "stopped",
          reason: "native-operation-0153-argument-unproved",
        };
      }
      const mutation = state.writeFromSignedArgument(argument);
      const write = writeNativeOperation0153Flag
        || context.writeNativeOperation0153Flag;
      if (typeof write === "function") {
        await write(mutation.value);
      }
      return { status: "continued", mutation };
    },
  };
}
