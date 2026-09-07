function stopped(reason) {
  return { status: "stopped", reason };
}

export class NativeOperation009bState {
  constructor() {
    this.records = new Map();
    this.releases = [];
  }

  install(handle, record = true) {
    if (!Number.isSafeInteger(handle) || handle < 1) {
      throw new RangeError("native registry record handle must be a positive integer");
    }
    this.records.set(handle >>> 0, record);
    return handle >>> 0;
  }

  release(handle) {
    const normalized = handle >>> 0;
    const released = normalized !== 0 && this.records.delete(normalized);
    this.releases.push(Object.freeze({ handle: normalized, released }));
    return released;
  }

  clear() {
    this.records.clear();
    this.releases.length = 0;
  }
}

export function createNativeOperation009bState() {
  return new NativeOperation009bState();
}

export function createNativeOperation009bSemanticHandlers({
  state = createNativeOperation009bState(),
  releaseNativeRegistryRecord,
} = {}) {
  return {
    "native-registry-record-release": async ({ context, readArgument }) => {
      let handle;
      try {
        handle = readArgument(0);
      } catch (error) {
        return stopped(error.message);
      }
      if (!Number.isInteger(handle)) {
        return stopped("native-operation-009b-handle-unavailable");
      }
      const normalized = handle >>> 0;
      const release = releaseNativeRegistryRecord
        || context.releaseNativeRegistryRecord
        || (value => state.release(value));
      const result = await release(normalized);
      if (result !== true && result !== false && result !== 0 && result !== 1) {
        return stopped("native-operation-009b-release-result-invalid");
      }
      const released = result === true || result === 1;
      return {
        result: released ? 1 : 0,
        mutation: { handle: normalized, released },
      };
    },
  };
}
