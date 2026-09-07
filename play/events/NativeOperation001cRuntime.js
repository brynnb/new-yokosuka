import {
  advanceNativeAddressOperand,
  isNativeAddressOperand,
  readAvailableNativeAddressWords,
  readNativeAddressWords,
  writeNativeAddressWords,
} from "./NativeEventAddress.js";

function requireFourcc(value) {
  const fourcc = String(value || "");
  if (fourcc.length !== 4) {
    throw new TypeError(
      "native operation 0x001c object requires a four-character ID",
    );
  }
  return fourcc;
}

function requireWord(value, label) {
  if (
    !Number.isInteger(value)
    || value < -0x80000000
    || value > 0xffffffff
  ) {
    throw new RangeError(`${label} must be a 32-bit word`);
  }
  return value >>> 0;
}

function requireTriple(words, label) {
  if (!Array.isArray(words) || words.length !== 3) {
    throw new TypeError(`${label} must contain exactly three words`);
  }
  return words.map((word, index) => (
    requireWord(word, `${label} word ${index}`)
  ));
}

function requirePointer(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      "native operation 0x001c destination must be a non-negative pointer",
    );
  }
  return value;
}

function objectTagArgument(action, readArgument) {
  const operand = action.arguments?.[0];
  if (operand?.kind === "constant" && typeof operand.ascii === "string") {
    return operand.ascii;
  }
  const value = readArgument(0);
  if (typeof value === "string") return requireFourcc(value);
  if (!Number.isInteger(value)) {
    throw new TypeError("native operation 0x001c object tag is unavailable");
  }
  return String.fromCharCode(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
}

export class NativeOperation001cState {
  constructor() {
    this.objects = new Map();
    this.outputs = new Map();
    this.revision = 0;
  }

  configureObject({
    objectTag,
    present,
    directWords,
    associatedWords,
  }) {
    if (typeof present !== "boolean") {
      throw new TypeError(
        "native operation 0x001c object presence must be Boolean",
      );
    }
    this.objects.set(requireFourcc(objectTag), {
      present,
      directWords: (
        directWords === undefined
          ? undefined
          : requireTriple(directWords, "operation 0x001c direct output")
      ),
      associatedWords: (
        associatedWords === undefined
          ? undefined
          : requireTriple(
            associatedWords,
            "operation 0x001c associated output",
          )
      ),
    });
    this.revision += 1;
  }

  configureOutput(pointer, words) {
    this.outputs.set(
      requirePointer(pointer),
      requireTriple(words, "operation 0x001c destination"),
    );
    this.revision += 1;
    return this.readOutput(pointer);
  }

  planNormal({ objectTag, destination, associated, currentWords }) {
    const key = requireFourcc(objectTag);
    const pointer = Number.isSafeInteger(destination)
      ? requirePointer(destination)
      : null;
    const object = this.objects.get(key);
    const current = currentWords === undefined
      ? this.outputs.get(pointer)
      : requireTriple(currentWords, "operation 0x001c current output");
    if (!object) {
      return {
        applied: false,
        reason: "native-operation-001c-object-state-unavailable",
      };
    }
    let source;
    if (!object.present) {
      if (!associated && !current) {
        return {
          applied: false,
          reason: "native-operation-001c-output-state-unavailable",
        };
      }
      source = associated ? [0, 0, 0] : current;
    } else {
      source = associated ? object.associatedWords : object.directWords;
      if (!source) {
        return {
          applied: false,
          reason: (
            `native-operation-001c-${associated ? "associated" : "direct"}`
            + "-words-unavailable"
          ),
        };
      }
    }
    return {
      applied: true,
      expectedRevision: this.revision,
      route: associated ? "associated-normal" : "direct-normal",
      objectTag: key,
      destination: pointer ?? destination,
      words: source.map(word => word & 0xffff),
    };
  }

  planSpecial({ objectTag, destination, associated, value, currentWords }) {
    const pointer = Number.isSafeInteger(destination)
      ? requirePointer(destination)
      : null;
    if (
      currentWords === undefined
      && !this.outputs.has(pointer)
    ) {
      return {
        applied: false,
        reason: "native-operation-001c-output-state-unavailable",
      };
    }
    return {
      applied: true,
      expectedRevision: this.revision,
      route: associated ? "associated-special" : "direct-special",
      objectTag: requireFourcc(objectTag),
      destination: pointer ?? destination,
      words: [0, requireWord(
        value,
        "native operation 0x001c helper result",
      ) & 0xffff, 0],
    };
  }

  commit(plan, { writeOutput } = {}) {
    if (!plan?.applied) {
      throw new TypeError("native operation 0x001c state plan is required");
    }
    if (plan.expectedRevision !== this.revision) {
      throw new Error("native operation 0x001c state changed before commit");
    }
    if (typeof writeOutput === "function") {
      writeOutput([...plan.words]);
    } else {
      this.outputs.set(requirePointer(plan.destination), [...plan.words]);
    }
    this.revision += 1;
    return typeof writeOutput === "function"
      ? [...plan.words]
      : this.readOutput(plan.destination);
  }

  readOutput(pointer) {
    const words = this.outputs.get(requirePointer(pointer));
    return words ? [...words] : undefined;
  }
}

export function createNativeOperation001cState() {
  return new NativeOperation001cState();
}

export function createNativeOperation001cSemanticHandlers({
  queryDirectSpecialWord,
  queryAssociatedSpecialWord,
} = {}) {
  return {
    "native-operation-001c-packed-word-query": async ({
      action,
      context,
      readArgument,
    }) => {
      try {
        const state = context.nativeOperation001cState;
        if (!state || typeof state.commit !== "function") {
          return {
            status: "stopped",
            reason: "native-operation-001c-state-unavailable",
          };
        }
        const objectTag = objectTagArgument(action, readArgument);
        const destinationOperand = action.arguments?.[1];
        const nativeAddress = isNativeAddressOperand(destinationOperand)
          ? destinationOperand
          : null;
        const destination = nativeAddress
          ? { kind: nativeAddress.kind, offset: nativeAddress.offset }
          : requirePointer(readArgument(1));
        const flags = readArgument(2) >>> 0;
        if (![0, 0x02000000, 0x40000000, 0x42000000].includes(flags)) {
          return {
            status: "stopped",
            reason: "native-operation-001c-flags-unproved",
          };
        }
        const associated = Boolean(flags & 0x40000000);
        const special = Boolean(flags & 0x02000000);
        const currentWords = nativeAddress
          ? (
              special
                ? readNativeAddressWords(nativeAddress, context, 3)
                : readAvailableNativeAddressWords(nativeAddress, context, 3)
            )
          : state.readOutput(destination);
        let plan;
        if (!special) {
          plan = state.planNormal({
            objectTag,
            destination,
            associated,
            currentWords,
          });
        } else {
          const sourceWords = currentWords;
          if (!sourceWords) {
            return {
              status: "stopped",
              reason: "native-operation-001c-output-state-unavailable",
            };
          }
          const query = (
            associated
              ? queryAssociatedSpecialWord
                || context.queryNativeOperation001cAssociatedSpecialWord
              : queryDirectSpecialWord
                || context.queryNativeOperation001cDirectSpecialWord
          );
          if (typeof query !== "function") {
            return {
              status: "stopped",
              reason: (
                `native-operation-001c-${associated ? "associated" : "direct"}`
                + "-special-query-missing"
              ),
            };
          }
          const value = await query({
            objectTag,
            ...(nativeAddress
              ? {
                  sourceAddress: advanceNativeAddressOperand(
                    nativeAddress,
                    4,
                  ),
                }
              : { sourcePointer: destination + 4 }),
            sourceWords,
          });
          plan = state.planSpecial({
            objectTag,
            destination,
            associated,
            value,
            currentWords,
          });
        }
        if (plan.reason) {
          return { status: "stopped", reason: plan.reason };
        }
        const source = {
          functionFileOffset: context.location?.functionId,
          callFileOffset: action.callFileOffset,
        };
        state.commit(plan, nativeAddress ? {
          writeOutput: words => writeNativeAddressWords(
            nativeAddress,
            context,
            words,
            source,
          ),
        } : undefined);
        return {
          status: "continued",
          mutation: {
            route: plan.route,
            objectTag,
            destination,
            words: [...plan.words],
          },
        };
      } catch (error) {
        return { status: "stopped", reason: error.message };
      }
    },
  };
}
