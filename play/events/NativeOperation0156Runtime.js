function stopped(reason) {
  return { status: "stopped", reason };
}

function requireWord(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new RangeError(`${label} must be an unsigned 16-bit integer`);
  }
  return value;
}

function envelopeMutation(mode, selector, durationFrames) {
  const duration = requireWord(durationFrames, "native FENS duration");
  if (duration === 0) {
    throw new RangeError("native FENS duration must be greater than zero");
  }
  return {
    mode,
    selector: selector & 0xff,
    durationFrames: duration,
    step: Math.floor(0x100 / duration),
    direction: mode === 0 ? "rising" : "falling",
    initialLevel: mode === 0 ? 0 : 0xff,
  };
}

/** Exact script-visible state installed by native operation 0x0156. */
export class NativeOperation0156State {
  constructor() {
    this.envelope = null;
  }

  begin(selector, durationFrames) {
    // The native mode-zero helper only creates FENS when its singleton is
    // absent. Preserve that ownership rule instead of restarting it.
    if (this.envelope !== null) {
      return { ...this.envelope, created: false };
    }
    this.envelope = envelopeMutation(0, selector, durationFrames);
    return { ...this.envelope, created: true };
  }

  reverse(durationFrames) {
    const selector = this.envelope?.selector ?? 0;
    this.envelope = envelopeMutation(1, selector, durationFrames);
    return { ...this.envelope, created: false };
  }

  clear() {
    this.envelope = null;
  }
}

export function createNativeOperation0156State() {
  return new NativeOperation0156State();
}

export function createNativeOperation0156SemanticHandlers({
  state = createNativeOperation0156State(),
  applyNativeFensEnvelope,
} = {}) {
  return {
    "native-operation-0156-fens-envelope-control": async ({
      context,
      readArgument,
    }) => {
      const mode = readArgument(0);
      const selector = readArgument(1);
      const durationFrames = readArgument(2);
      if (mode !== 0 && mode !== 1) {
        return stopped("native-operation-0156-mode-unproved");
      }
      if (!Number.isInteger(selector)) {
        return stopped("native-operation-0156-selector-unavailable");
      }
      if (
        !Number.isInteger(durationFrames)
        || durationFrames <= 0
        || durationFrames > 0xffff
      ) {
        return stopped("native-operation-0156-duration-unproved");
      }
      const apply = applyNativeFensEnvelope
        || context.applyNativeFensEnvelope
        || ((route, style, duration) => (
          route === 0
            ? state.begin(style, duration)
            : state.reverse(duration)
        ));
      const mutation = await apply(mode, selector, durationFrames);
      return { status: "continued", mutation };
    },
  };
}
