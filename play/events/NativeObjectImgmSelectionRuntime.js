function requireObjectTag(value) {
  const objectTag = String(value || "");
  if (
    objectTag.length !== 4
    || [...objectTag].some(character => character.codePointAt(0) > 0xff)
  ) {
    throw new TypeError(
      "native object IMGM selection requires a four-byte object tag",
    );
  }
  return objectTag;
}

function objectTagArgument(action, readArgument) {
  const operand = action.arguments?.[0];
  if (operand?.kind === "constant" && typeof operand.ascii === "string") {
    return requireObjectTag(operand.ascii);
  }
  const value = readArgument(0);
  if (typeof value === "string") return requireObjectTag(value);
  if (!Number.isInteger(value)) {
    throw new TypeError("native object IMGM selection tag is unavailable");
  }
  const word = value >>> 0;
  return requireObjectTag(String.fromCharCode(
    word & 0xff,
    word >>> 8 & 0xff,
    word >>> 16 & 0xff,
    word >>> 24 & 0xff,
  ));
}

function selectionByte(value) {
  if (
    !Number.isInteger(value)
    || value < -0x80000000
    || value > 0xffffffff
  ) {
    throw new RangeError(
      "native object IMGM selection source must be a 32-bit word",
    );
  }
  return value & 0xff;
}

function sourceFor(action, context) {
  return {
    functionFileOffset: context.location?.functionId,
    callFileOffset: action.callFileOffset,
  };
}

/** Exact object-local IMGM +0x09 selection bytes. */
export class NativeObjectImgmSelectionState {
  constructor() {
    this.selections = new Map();
  }

  write(objectTag, value) {
    const key = requireObjectTag(objectTag);
    const selection = selectionByte(value);
    const previous = this.selections.get(key);
    this.selections.set(key, selection);
    return {
      objectTag: key,
      selection,
      ...(previous === undefined ? {} : { previous }),
      changed: previous !== selection,
    };
  }

  read(objectTag) {
    return this.selections.get(requireObjectTag(objectTag));
  }

  snapshot() {
    return [...this.selections.entries()];
  }

  restore(snapshot) {
    if (
      !Array.isArray(snapshot)
      || snapshot.some(entry => !Array.isArray(entry) || entry.length !== 2)
    ) {
      throw new TypeError("native object IMGM selection snapshot is invalid");
    }
    const restored = new Map();
    for (const [objectTag, value] of snapshot) {
      restored.set(requireObjectTag(objectTag), selectionByte(value));
    }
    this.selections = restored;
  }
}

export function createNativeObjectImgmSelectionState() {
  return new NativeObjectImgmSelectionState();
}

export function createNativeObjectImgmSelectionSemanticHandlers({
  hasSceneObject,
  writeObjectImgmSelection,
} = {}) {
  return {
    "resolved-object-imgm-selection-write": async ({
      action,
      context,
      readArgument,
    }) => {
      let objectTag;
      let selection;
      try {
        objectTag = objectTagArgument(action, readArgument);
        selection = selectionByte(readArgument(1));
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }

      const hasObject = hasSceneObject || context.hasSceneObject;
      if (typeof hasObject === "function") {
        const exists = await hasObject(objectTag);
        if (typeof exists !== "boolean") {
          return {
            status: "stopped",
            reason: "object-imgm-selection-object-result-invalid",
          };
        }
        // The native resolver's null route returns without invoking the IMGM
        // writer. Preserve that as a successful no-op.
        if (!exists) {
          return {
            status: "continued",
            mutation: {
              kind: "object-imgm-selection",
              objectTag,
              selection,
              applied: false,
              source: sourceFor(action, context),
            },
          };
        }
      }

      const write = (
        writeObjectImgmSelection
        || context.writeObjectImgmSelection
        || context.nativeObjectImgmSelectionState?.write?.bind(
          context.nativeObjectImgmSelectionState,
        )
      );
      if (typeof write !== "function") {
        return {
          status: "stopped",
          reason: "object-imgm-selection-writer-missing",
        };
      }
      const result = await write(objectTag, selection);
      if (result === false) {
        return {
          status: "stopped",
          reason: "object-imgm-selection-write-rejected",
        };
      }
      return {
        status: "continued",
        mutation: {
          kind: "object-imgm-selection",
          objectTag,
          selection,
          applied: true,
          source: sourceFor(action, context),
        },
      };
    },
  };
}
