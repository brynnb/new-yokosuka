function requireFourcc(value) {
  const fourcc = String(value || "");
  if (fourcc.length !== 4) {
    throw new TypeError("native OSAG actor requires a four-character ID");
  }
  return fourcc;
}

function requireByte(value, name) {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new RangeError(`native OSAG ${name} must be a byte`);
  }
  return value;
}

function actorTagArgument(action, readArgument) {
  const operand = action.arguments?.[0];
  if (
    operand?.kind === "constant"
    && typeof operand.ascii === "string"
  ) {
    return operand.ascii;
  }
  const value = readArgument(0);
  if (typeof value === "string") return value;
  if (!Number.isInteger(value)) {
    throw new TypeError("native OSAG actor tag is unavailable");
  }
  return String.fromCharCode(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
}

export class NativeActorOsagState {
  constructor() {
    this.actors = new Map();
  }

  configureActor({
    actorTag,
    available,
    osagNodeBytes = null,
    controllerFlagByte = null,
  }) {
    if (typeof available !== "boolean") {
      throw new TypeError("native OSAG actor availability must be boolean");
    }
    if (
      osagNodeBytes !== null
      && (
        !Array.isArray(osagNodeBytes)
        || osagNodeBytes.some(value => (
          !Number.isInteger(value) || value < 0 || value > 0xff
        ))
      )
    ) {
      throw new TypeError("native OSAG node states must be bytes or null");
    }
    if (controllerFlagByte !== null) {
      requireByte(controllerFlagByte, "controller flag");
    }
    this.actors.set(requireFourcc(actorTag), {
      available,
      osagNodeBytes: osagNodeBytes === null ? null : [...osagNodeBytes],
      controllerFlagByte,
    });
  }

  applyNodeAndFlagSet({ actorTag, recordTag, flagMask }) {
    if (recordTag !== "OSAG") {
      throw new Error("native actor record must use the OSAG tag");
    }
    if (flagMask !== 0x10) {
      throw new Error("native OSAG controller flag mask must be 0x10");
    }
    const key = requireFourcc(actorTag);
    const actor = this.actors.get(key);
    if (!actor) {
      return { applied: false, reason: "actor-osag-state-missing" };
    }
    if (!actor.available) {
      return { applied: false, reason: "actor-missing" };
    }
    if (actor.osagNodeBytes !== null) {
      actor.osagNodeBytes = actor.osagNodeBytes.map(
        value => (value & 0x0f) | 0x80,
      );
    }
    if (actor.controllerFlagByte !== null) {
      actor.controllerFlagByte |= flagMask;
    }
    return {
      applied: (
        actor.osagNodeBytes !== null
        || actor.controllerFlagByte !== null
      ),
      state: this.readActor(key),
    };
  }

  writeControllerFlagBit3({ actorTag, enabled }) {
    if (typeof enabled !== "boolean") {
      throw new TypeError("native actor controller bit-3 state must be Boolean");
    }
    const actor = this.actors.get(requireFourcc(actorTag));
    if (!actor?.available || actor.controllerFlagByte === null) return false;
    actor.controllerFlagByte = enabled
      ? actor.controllerFlagByte | 0x08
      : actor.controllerFlagByte & ~0x08;
    return true;
  }

  readActor(actorTag) {
    const actor = this.actors.get(requireFourcc(actorTag));
    return actor
      ? {
          available: actor.available,
          osagNodeBytes: actor.osagNodeBytes === null
            ? null
            : [...actor.osagNodeBytes],
          controllerFlagByte: actor.controllerFlagByte,
        }
      : undefined;
  }
}

export function createNativeActorOsagState() {
  return new NativeActorOsagState();
}

export function createNativeActorOsagSemanticHandlers({
  applyActorOsagNodeAndFlagSet,
} = {}) {
  return {
    "actor-osag-node-byte-and-flag-set": async ({
      action,
      context,
      readArgument,
    }) => {
      const applyState = (
        applyActorOsagNodeAndFlagSet
        || context.applyActorOsagNodeAndFlagSet
      );
      if (typeof applyState !== "function") {
        return {
          status: "stopped",
          reason: "actor-osag-state-adapter-missing",
        };
      }
      const mutation = await applyState({
        actorTag: actorTagArgument(action, readArgument),
        recordTag: "OSAG",
        nodeByteWrite: {
          preserveMask: 0x0f,
          setMask: 0x80,
        },
        flagMask: 0x10,
        source: {
          functionFileOffset: context.location?.functionId,
          callFileOffset: action.callFileOffset,
        },
      });
      if (mutation?.reason === "actor-osag-state-missing") {
        return { status: "stopped", reason: mutation.reason };
      }
      return { status: "continued", mutation };
    },
  };
}
