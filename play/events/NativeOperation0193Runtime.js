function stopped(reason) {
  return { status: "stopped", reason };
}

export class NativeOperation0193State {
  constructor() {
    this.initializations = [];
    this.advanceCount = 0;
  }

  initialize(mode, tagWord) {
    const mutation = { mode, tagWord: tagWord >>> 0 };
    this.initializations.push(mutation);
    return mutation;
  }

  advance() {
    this.advanceCount += 1;
    return { advanceCount: this.advanceCount };
  }

  clear() {
    this.initializations.length = 0;
    this.advanceCount = 0;
  }
}

export function createNativeOperation0193State() {
  return new NativeOperation0193State();
}

export function createNativeOperation0193SemanticHandlers({
  state = createNativeOperation0193State(),
  initializeNativeOperation0193,
  advanceNativeOperation0193,
} = {}) {
  return {
    "native-operation-0193-controller": async ({ context, readArgument }) => {
      const mode = readArgument(0);
      const value = readArgument(1);
      if (mode === 1) {
        if (value !== 0) {
          return stopped("native-operation-0193-mode-1-value-unproved");
        }
        const advance = advanceNativeOperation0193
          || context.advanceNativeOperation0193
          || (() => state.advance());
        const mutation = await advance();
        return { status: "continued", mutation: { mode, ...mutation } };
      }
      if (mode !== 0 && mode !== 2) {
        return stopped("native-operation-0193-mode-unproved");
      }
      if (mode === 0 && value !== 0) {
        return stopped("native-operation-0193-mode-0-value-unproved");
      }
      const initialize = initializeNativeOperation0193
        || context.initializeNativeOperation0193
        || ((route, tagWord) => state.initialize(route, tagWord));
      const mutation = await initialize(mode === 2 ? 1 : 0, value >>> 0);
      return { status: "continued", mutation: { mode, ...mutation } };
    },
  };
}
