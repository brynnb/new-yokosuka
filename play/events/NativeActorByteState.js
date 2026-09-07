const MAX_ACTOR_BYTE_STATES = 512;

function requireActorCode(value) {
  const actorCode = String(value || "");
  if (actorCode.length !== 4) {
    throw new TypeError("native actor byte state requires a four-character ID");
  }
  for (const character of actorCode) {
    if (character.codePointAt(0) > 0xff) {
      throw new TypeError("native actor byte state ID must be byte-oriented");
    }
  }
  return actorCode;
}

function requireByte(value) {
  const byte = Number(value);
  if (!Number.isInteger(byte) || byte < 0 || byte > 0xff) {
    throw new RangeError("native actor state must be a byte");
  }
  return byte;
}

export class NativeActorByteState {
  constructor(snapshot = {}) {
    const source = snapshot.actorBytes ?? snapshot;
    const entries = Object.entries(source || {});
    if (entries.length > MAX_ACTOR_BYTE_STATES) {
      throw new RangeError("native actor byte state exceeds its entry limit");
    }
    this.values = new Map(entries.map(([actorCode, value]) => [
      requireActorCode(actorCode),
      requireByte(value),
    ]));
  }

  read(actorCode) {
    return this.values.get(requireActorCode(actorCode)) ?? 0;
  }

  write(actorCode, value) {
    const key = requireActorCode(actorCode);
    const byte = requireByte(value);
    if (!this.values.has(key) && this.values.size >= MAX_ACTOR_BYTE_STATES) {
      return false;
    }
    if (byte === 0) this.values.delete(key);
    else this.values.set(key, byte);
    return true;
  }

  replace(snapshot) {
    const replacement = new NativeActorByteState(snapshot);
    this.values = replacement.values;
    return this;
  }

  toJSON() {
    return {
      schema: "new-yokosuka-native-actor-byte-state-v1",
      actorBytes: Object.fromEntries(
        [...this.values].sort(([left], [right]) => left.localeCompare(right)),
      ),
    };
  }
}

export function createNativeActorByteState(snapshot) {
  return new NativeActorByteState(snapshot);
}

function actorCodeArgument(action, readArgument) {
  const operand = action.arguments?.[1];
  if (typeof operand?.ascii === "string") {
    return requireActorCode(operand.ascii);
  }
  const word = Number(readArgument(1));
  if (!Number.isInteger(word)) {
    throw new TypeError("native actor byte state tag is unavailable");
  }
  const unsigned = word >>> 0;
  return requireActorCode(String.fromCharCode(
    unsigned & 0xff,
    unsigned >>> 8 & 0xff,
    unsigned >>> 16 & 0xff,
    unsigned >>> 24 & 0xff,
  ));
}

export function createNativeActorByteStateSemanticHandlers({
  actorByteState,
} = {}) {
  return {
    "game-state-access": async ({ action, context, readArgument }) => {
      const state = actorByteState || context.actorByteState;
      if (
        !state
        || typeof state.read !== "function"
        || typeof state.write !== "function"
      ) {
        return {
          status: "stopped",
          reason: "native-actor-byte-state-missing",
        };
      }
      let mode;
      let actorCode;
      try {
        mode = readArgument(0);
        actorCode = actorCodeArgument(action, readArgument);
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
      if (mode === 0x42) {
        return { result: state.read(actorCode) };
      }
      if (mode === 0x41) {
        let value;
        try {
          value = Number(readArgument(2));
          if (!Number.isInteger(value)) {
            throw new TypeError(
              "native actor byte state value is unavailable",
            );
          }
          value &= 0xff;
        } catch (error) {
          return { status: "stopped", reason: error.message };
        }
        if (!state.write(actorCode, value)) {
          return {
            status: "stopped",
            reason: "native-actor-byte-state-capacity-exhausted",
          };
        }
        return { status: "continued" };
      }
      return {
        status: "stopped",
        reason: "native-actor-byte-state-mode-unproved",
      };
    },
  };
}
