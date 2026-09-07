const PROVEN_CONFIGURATIONS = new Set([
  "30,1,0,255,255,255,255,255,255,255",
  "0,1,255,255,255,255,255,255,255,255",
  "30,2,255,0,0,0,0,0,0,0",
  "50,1,150,68,50,0,255,255,255,255",
]);

function stopped(reason) {
  return { status: "stopped", reason };
}

function snapshot(state) {
  return {
    mode: state.mode,
    currentFixed: [...state.currentFixed],
    targetFixed: [...state.targetFixed],
    stepFixed: [...state.stepFixed],
    remainingFrames: state.remainingFrames,
    cacheActive: state.cacheActive,
    cachedTarget: [...state.cachedTarget],
  };
}

export class NativeOperation01a1State {
  constructor() {
    this.currentFixed = new Int32Array(4);
    this.targetFixed = new Int32Array(4);
    this.stepFixed = new Int32Array(4);
    this.cachedTarget = new Uint8Array(4);
    this.cacheActive = false;
    this.mode = null;
    this.remainingFrames = 0;
  }

  configure({ durationFrames, mode, initialBytes, targetBytes }) {
    const initial = mode === 2 && this.cacheActive
      ? [this.cachedTarget[0], this.cachedTarget[1], this.cachedTarget[2], this.cachedTarget[1]]
      : initialBytes;
    for (let index = 0; index < 4; index += 1) {
      this.currentFixed[index] = initial[index] << 16;
      this.targetFixed[index] = targetBytes[index] << 16;
      this.stepFixed[index] = durationFrames === 0
        ? 0
        : Math.trunc((this.targetFixed[index] - this.currentFixed[index]) / durationFrames);
    }
    if (mode === 1) {
      this.cachedTarget.set(targetBytes);
      this.cacheActive = true;
    } else {
      this.cacheActive = false;
    }
    this.mode = mode;
    this.remainingFrames = durationFrames;
    return snapshot(this);
  }

  isActive() {
    return this.remainingFrames !== 0;
  }

  advance(frameCount = 1) {
    if (!Number.isSafeInteger(frameCount) || frameCount < 0) {
      throw new RangeError("native byte-envelope frame count must be nonnegative");
    }
    const elapsed = Math.min(frameCount, this.remainingFrames);
    for (let index = 0; index < 4; index += 1) {
      this.currentFixed[index] += this.stepFixed[index] * elapsed;
    }
    this.remainingFrames -= elapsed;
    if (this.remainingFrames === 0 && elapsed !== 0) {
      this.currentFixed.set(this.targetFixed);
    }
    return snapshot(this);
  }

  clear() {
    this.currentFixed.fill(0);
    this.targetFixed.fill(0);
    this.stepFixed.fill(0);
    this.cachedTarget.fill(0);
    this.cacheActive = false;
    this.mode = null;
    this.remainingFrames = 0;
  }
}

export function createNativeOperation01a1State() {
  return new NativeOperation01a1State();
}

export function createNativeOperation01a1SemanticHandlers({
  state = createNativeOperation01a1State(),
  applyNativeFourChannelByteEnvelope,
  queryNativeFourChannelByteEnvelopeActive,
} = {}) {
  return {
    "native-four-channel-byte-envelope-control": async ({ context, readArgument }) => {
      const values = Array.from({ length: 10 }, (_, index) => readArgument(index));
      if (!values.every(Number.isInteger) || !PROVEN_CONFIGURATIONS.has(values.join(","))) {
        return stopped("native-operation-01a1-configuration-unproved");
      }
      const configuration = {
        durationFrames: values[0],
        mode: values[1],
        initialBytes: values.slice(2, 6),
        targetBytes: values.slice(6, 10),
      };
      const apply = applyNativeFourChannelByteEnvelope
        || context.applyNativeFourChannelByteEnvelope
        || (detail => state.configure(detail));
      const mutation = await apply(configuration);
      return { status: "continued", mutation };
    },
    "native-four-channel-byte-envelope-active-query": async ({ context, readArgument }) => {
      if (readArgument(0) !== 0xffff_ffff) {
        return stopped("native-operation-01a1-query-unproved");
      }
      const query = queryNativeFourChannelByteEnvelopeActive
        || context.queryNativeFourChannelByteEnvelopeActive
        || (() => state.isActive());
      const active = await query();
      if (active !== true && active !== false && active !== 0 && active !== 1) {
        return stopped("native-operation-01a1-query-result-invalid");
      }
      return { result: active ? 1 : 0 };
    },
  };
}
