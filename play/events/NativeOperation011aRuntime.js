function stopped(reason) {
  return { status: "stopped", reason };
}

export class NativeOperation011aState {
  constructor() {
    this.releases = [];
  }

  release(handle) {
    const value = handle >>> 0;
    this.releases.push(value);
    return value;
  }

  clear() {
    this.releases.length = 0;
  }
}

export function createNativeOperation011aState() {
  return new NativeOperation011aState();
}

export function createNativeOperation011aSemanticHandlers({
  state = createNativeOperation011aState(),
  releaseNativeObjectRecord,
} = {}) {
  return {
    "native-operation-011a-object-record-release": async ({
      context,
      readArgument,
    }) => {
      let handle;
      try {
        handle = readArgument(0);
      } catch (error) {
        return stopped(error.message);
      }
      if (!Number.isInteger(handle)) {
        return stopped("native-operation-011a-handle-unavailable");
      }
      const release = releaseNativeObjectRecord
        || context.releaseNativeObjectRecord
        || (value => state.release(value));
      await release(handle >>> 0);
      return {
        status: "continued",
        mutation: { handle: handle >>> 0 },
      };
    },
  };
}
