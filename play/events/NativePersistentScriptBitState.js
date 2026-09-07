export const NATIVE_PERSISTENT_SCRIPT_BIT_CAPACITY = 256;
export const NATIVE_PERSISTENT_SCRIPT_BIT_BYTE_LENGTH =
  NATIVE_PERSISTENT_SCRIPT_BIT_CAPACITY / 8;

function requireBytes(value) {
  if (value === undefined || value === null) {
    return new Uint8Array(NATIVE_PERSISTENT_SCRIPT_BIT_BYTE_LENGTH);
  }
  const bytes = value instanceof Uint8Array
    ? value
    : Uint8Array.from(value);
  if (bytes.length !== NATIVE_PERSISTENT_SCRIPT_BIT_BYTE_LENGTH) {
    throw new RangeError(
      `Native persistent script bits have ${bytes.length} bytes; expected `
      + NATIVE_PERSISTENT_SCRIPT_BIT_BYTE_LENGTH,
    );
  }
  return bytes.slice();
}

function validIndex(value) {
  return Number.isSafeInteger(value)
    && value >= 0
    && value < NATIVE_PERSISTENT_SCRIPT_BIT_CAPACITY;
}

export class NativePersistentScriptBitState {
  constructor(snapshot = {}) {
    const source = snapshot?.bytes
      ?? (Array.isArray(snapshot) || snapshot instanceof Uint8Array
        ? snapshot
        : undefined);
    this.bytes = requireBytes(source);
  }

  read(index) {
    if (!validIndex(index)) return 0;
    return (this.bytes[index >> 3] >> (index & 7)) & 1;
  }

  write(index, value) {
    if (!validIndex(index)) return false;
    const byteIndex = index >> 3;
    const mask = 1 << (index & 7);
    this.bytes[byteIndex] = Number(value)
      ? this.bytes[byteIndex] | mask
      : this.bytes[byteIndex] & ~mask;
    return true;
  }

  toJSON() {
    return { bytes: [...this.bytes] };
  }
}

export function createNativePersistentScriptBitState(snapshot) {
  return new NativePersistentScriptBitState(snapshot);
}

export function createNativePersistentScriptBitSemanticHandlers({
  state,
} = {}) {
  return {
    "persistent-script-bit-write": async ({ context, readArgument }) => {
      const target = state || context.nativePersistentScriptBitState;
      if (
        !target
        || typeof target.read !== "function"
        || typeof target.write !== "function"
      ) {
        return {
          status: "stopped",
          reason: "persistent-script-bit-state-missing",
        };
      }
      const owner = readArgument(0);
      const index = readArgument(1);
      const value = readArgument(2);
      if (owner !== 0 || !validIndex(index) || (value !== 0 && value !== 1)) {
        return {
          status: "stopped",
          reason: "persistent-script-bit-write-arguments-invalid",
        };
      }
      const previous = target.read(index);
      if (target.write(index, value) !== true) {
        return {
          status: "stopped",
          reason: "persistent-script-bit-write-rejected",
        };
      }
      return {
        status: "continued",
        mutation: { index, previous, value },
      };
    },
  };
}
