function stopped(reason) {
  return { status: "stopped", reason };
}

function byte(value, label) {
  if (!Number.isInteger(value)) {
    throw new TypeError(`${label} must be an integer`);
  }
  return value & 0xff;
}

/** Exact two-byte global state mutated by native operation 0x014b. */
export class NativeOperation014bState {
  constructor({ mode = 0, dependent = 0 } = {}) {
    this.mode = byte(mode, "native 0x014b mode");
    this.dependent = byte(dependent, "native 0x014b dependent state");
  }

  apply(value) {
    const requested = byte(value, "native 0x014b requested mode");
    const writeAccepted = this.mode !== 4;
    // Native mode four owns the byte and prevents later script writes.
    if (writeAccepted) {
      this.mode = requested;
    }
    // Modes four and five reset the adjacent dependent byte.
    if (this.mode === 4 || this.mode === 5) {
      this.dependent = 0;
    }
    return {
      requested,
      mode: this.mode,
      dependent: this.dependent,
      writeAccepted,
    };
  }

  snapshot() {
    return { mode: this.mode, dependent: this.dependent };
  }

  restore(snapshot) {
    this.mode = byte(snapshot?.mode, "native 0x014b snapshot mode");
    this.dependent = byte(
      snapshot?.dependent,
      "native 0x014b snapshot dependent state",
    );
  }

  clear() {
    this.mode = 0;
    this.dependent = 0;
  }
}

export function createNativeOperation014bState(options) {
  return new NativeOperation014bState(options);
}

export function createNativeOperation014bSemanticHandlers({
  state = createNativeOperation014bState(),
  applyNativeOperation014b,
} = {}) {
  return {
    "native-operation-014b-mode-byte-control": async ({
      context,
      readArgument,
    }) => {
      const requested = readArgument(0);
      if (!Number.isInteger(requested)) {
        return stopped("native-operation-014b-value-unavailable");
      }
      const apply = applyNativeOperation014b
        || context.applyNativeOperation014b
        || (value => state.apply(value));
      const mutation = await apply(requested);
      if (mutation === undefined || mutation === false) {
        return stopped("native-operation-014b-adapter-rejected");
      }
      return { status: "continued", mutation };
    },
  };
}
