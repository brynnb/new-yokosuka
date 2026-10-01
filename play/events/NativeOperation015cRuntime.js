function stopped(reason) {
  return { status: "stopped", reason };
}

export class NativeOperation015cState {
  constructor() {
    this.handles = new Map();
    this.nextHandle = 1;
  }

  acquire(name) {
    if (!this.handles.has(name)) {
      this.handles.set(name, this.nextHandle++);
    }
    return this.handles.get(name);
  }

  clear() {
    this.handles.clear();
    this.nextHandle = 1;
  }
}

export function createNativeOperation015cState() {
  return new NativeOperation015cState();
}

export function createNativeOperation015cSemanticHandlers({
  state = createNativeOperation015cState(),
  acquireNativeNamedController,
} = {}) {
  return {
    "native-operation-015c-named-controller-acquire": async ({
      action,
      context,
      readArgument,
    }) => {
      if (
        action.arguments?.[0]?.kind !== "static-pointer"
        || readArgument(1) !== 0
      ) {
        return stopped("native-operation-015c-arguments-unproved");
      }
      const pointer = readArgument(0);
      const resolve = context.resolveNativeStaticString;
      if (typeof resolve !== "function") {
        return stopped("native-operation-015c-string-resolver-missing");
      }
      const name = resolve(pointer);
      if (typeof name !== "string" || name.length === 0) {
        return stopped(`native-operation-015c-name-unavailable:${pointer}`);
      }
      // This native entry shares the named audio-start helper with dialogue.
      // Presentation is supplied by the owning program, never a shot guess.
      if (context.playNativeNamedAudio && context.playNativeNamedAudio(name) !== true) {
        return stopped(`native-named-audio-unavailable:${name}`);
      }
      const acquire = acquireNativeNamedController
        || context.acquireNativeNamedController
        || (value => state.acquire(value));
      const handle = await acquire(name);
      if (!Number.isInteger(handle)) {
        return stopped("native-operation-015c-handle-unavailable");
      }
      return {
        result: handle >>> 0,
        mutation: { name },
      };
    },
  };
}
