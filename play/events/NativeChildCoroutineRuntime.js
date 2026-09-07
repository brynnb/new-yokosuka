function requireProgram(program) {
  if (!Array.isArray(program?.functions)) {
    throw new TypeError("native child-coroutine program is required");
  }
  return new Map(program.functions.map(definition => [
    definition.id,
    definition,
  ]));
}

function launchFields(definition, action, readArgument, handle) {
  const fields = { 4: handle };
  const base = definition.frameArgumentBase;
  if (!Number.isInteger(base)) return fields;
  for (let index = 0; index < (action.arguments || []).length; index += 1) {
    const value = readArgument(index);
    if (!Number.isInteger(value)) {
      throw new Error(
        `native child-coroutine argument ${index} is unavailable`,
      );
    }
    fields[base + index * 4] = value >>> 0;
  }
  return fields;
}

export class NativeChildCoroutineRuntime {
  constructor({ program, interpreter, context = {} }) {
    this.functions = requireProgram(program);
    if (
      !interpreter
      || typeof interpreter.initialState !== "function"
      || typeof interpreter.run !== "function"
    ) {
      throw new TypeError("native child-coroutine interpreter is required");
    }
    this.interpreter = interpreter;
    this.context = context;
    this.records = new Map();
    this.nextHandle = 1;
    this.pendingUpdate = null;
  }

  launch(action, { readArgument }) {
    const definition = this.functions.get(action.targetFileOffset);
    if (!definition) {
      return {
        status: "rejected",
        reason: "child-coroutine-target-missing",
      };
    }
    if (typeof readArgument !== "function") {
      return {
        status: "rejected",
        reason: "child-coroutine-argument-reader-missing",
      };
    }
    const handle = this.nextHandle;
    this.nextHandle += 1;
    let fields;
    try {
      fields = launchFields(definition, action, readArgument, handle);
    } catch (error) {
      return {
        status: "rejected",
        reason: error instanceof Error ? error.message : String(error),
      };
    }
    this.records.set(handle, {
      handle,
      targetFileOffset: action.targetFileOffset,
      launchFileOffset: action.callFileOffset,
      state: this.interpreter.initialState(action.targetFileOffset, fields),
      continuationTicks: 0,
      deactivated: false,
    });
    return { status: "launched", handle };
  }

  deactivate({ handle, current, currentHandle }) {
    const selected = current ? currentHandle : handle;
    if (!Number.isSafeInteger(selected)) return false;
    const record = this.records.get(selected);
    if (!record) return false;
    record.deactivated = true;
    return true;
  }

  update() {
    if (this.pendingUpdate) return this.pendingUpdate;
    const pending = this.advance().finally(() => {
      if (this.pendingUpdate === pending) this.pendingUpdate = null;
    });
    this.pendingUpdate = pending;
    return pending;
  }

  async advance() {
    for (const record of [...this.records.values()]) {
      if (record.deactivated) {
        this.records.delete(record.handle);
        continue;
      }
      if (record.continuationTicks > 1) {
        record.continuationTicks -= 1;
        continue;
      }
      record.continuationTicks = 0;
      const result = await this.interpreter.run(record.state, {
        ...this.context,
        coroutineHandle: record.handle,
      });
      if (record.deactivated || result.status === "completed") {
        this.records.delete(record.handle);
        continue;
      }
      if (
        result.status === "yielded"
        && result.request?.kind === "native-coroutine-continuation"
        && Number.isSafeInteger(result.request.scheduler?.ticks)
        && result.request.scheduler.ticks > 0
      ) {
        record.state = result.state;
        record.continuationTicks = result.request.scheduler.ticks;
        continue;
      }
      return {
        status: "stopped",
        reason: "child-coroutine-stopped",
        handle: record.handle,
        targetFileOffset: record.targetFileOffset,
        result,
      };
    }
    return {
      status: "continued",
      activeCount: this.records.size,
    };
  }

  diagnosticSnapshot() {
    return [...this.records.values()].map((record) => {
      const frames = record.state?.frames;
      const frame = Array.isArray(frames) ? frames.at(-1) : null;
      return {
        handle: record.handle,
        targetFileOffset: record.targetFileOffset,
        launchFileOffset: record.launchFileOffset,
        continuationTicks: record.continuationTicks,
        deactivated: record.deactivated,
        frame: frame ? {
          functionId: frame.functionId ?? null,
          blockId: frame.blockId ?? null,
          actionIndex: frame.actionIndex ?? null,
          operationResults: frame.operationResults ?? null,
        } : null,
      };
    });
  }

  clear() {
    this.records.clear();
  }
}

export function createNativeChildCoroutineRuntime(options) {
  return new NativeChildCoroutineRuntime(options);
}
