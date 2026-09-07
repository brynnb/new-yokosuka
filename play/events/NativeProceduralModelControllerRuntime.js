import {
  readAvailableNativeOperandWords,
} from "./NativeEventAddress.js";
import {
  nativeFloat32FromWord,
  nativeFloat32Word,
} from "./NativeEventNumericRuntime.js";

const SLOT_COUNT = 2;

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

function requireHandle(value) {
  if (!Number.isInteger(value) || value < 0 || value >= SLOT_COUNT) {
    throw new RangeError("native procedural-model handle is outside its two slots");
  }
  return value;
}

function cloneRecord(record) {
  if (!record) return null;
  return {
    ...record,
    originWords: [...record.originWords],
    parameters: { ...record.parameters },
    modelCommands: record.modelCommands.map(command => ({ ...command })),
  };
}

function requireResourceString(context, pointer, label) {
  const resolve = context.resolveNativeStaticString;
  if (typeof resolve !== "function") {
    throw new Error("native-procedural-model-static-string-resolver-missing");
  }
  const value = resolve(pointer);
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label}-unavailable:${pointer}`);
  }
  return value;
}

function readVector(action, argumentIndex, context, label) {
  const words = readAvailableNativeOperandWords(
    action.arguments?.[argumentIndex],
    context,
    3,
  );
  if (!words) throw new Error(`${label}-unavailable`);
  return words;
}

function sourceFor(action, context) {
  return {
    functionFileOffset: context.location?.functionId,
    callFileOffset: action.callFileOffset,
  };
}

export class NativeProceduralModelControllerState {
  constructor() {
    this.slots = Array.from({ length: SLOT_COUNT }, () => null);
  }

  allocate(configuration) {
    const handle = this.slots.findIndex(record => record === null);
    if (handle < 0) {
      throw new Error("native-procedural-model-slots-exhausted");
    }
    const flagsWord = requireWord(
      configuration.flagsWord,
      "native procedural-model flags",
    ) | 0x0000000a;
    this.slots[handle] = {
      handle,
      flagBit2Set: Boolean(flagsWord & 0x00000002),
      flagsWord: flagsWord >>> 0,
      originWords: configuration.originWords.map((word, index) => (
        requireWord(word, `native procedural-model origin ${index}`)
      )),
      resourcePath: configuration.resourcePath,
      texture: configuration.texture,
      modelPath: configuration.modelPath,
      model: configuration.model,
      scaleWord: requireWord(
        configuration.scaleWord,
        "native procedural-model scale",
      ),
      gridResource: null,
      parameters: {},
      modelCommands: [],
      packedColor: null,
    };
    return { handle, record: this.read(handle) };
  }

  requireRecord(handle) {
    const index = requireHandle(handle);
    const record = this.slots[index];
    if (!record) throw new Error(`native-procedural-model-slot-inactive:${index}`);
    return record;
  }

  setFlagBit2(handle, set) {
    const record = this.requireRecord(handle);
    const previous = record.flagBit2Set;
    record.flagBit2Set = Boolean(set);
    record.flagsWord = record.flagBit2Set
      ? (record.flagsWord | 0x00000002) >>> 0
      : (record.flagsWord & 0xfffffffd) >>> 0;
    return {
      handle: record.handle,
      previous,
      flagBit2Set: record.flagBit2Set,
    };
  }

  release(handle) {
    const index = requireHandle(handle);
    const previous = this.requireRecord(index);
    this.slots[index] = null;
    return { handle: index, previous: cloneRecord(previous) };
  }

  writeParameters(handle, values) {
    const record = this.requireRecord(handle);
    const written = {};
    for (const [field, value] of Object.entries(values)) {
      const word = requireWord(value, `native procedural-model ${field}`);
      record.parameters[field] = word;
      written[field] = word;
    }
    return { handle: record.handle, written };
  }

  installGridResource(handle, gridResource) {
    const record = this.requireRecord(handle);
    const previous = record.gridResource;
    record.gridResource = { ...gridResource };
    return {
      handle: record.handle,
      previous: previous ? { ...previous } : null,
      gridResource: { ...record.gridResource },
    };
  }

  commandModel(handle, firstWord, secondWord) {
    const record = this.requireRecord(handle);
    const command = {
      firstWord: requireWord(firstWord, "native procedural-model command one"),
      secondWord: requireWord(secondWord, "native procedural-model command two"),
    };
    record.modelCommands.push(command);
    return { handle: record.handle, command: { ...command } };
  }

  writePackedColor(handle, red, green, blue, alpha) {
    const record = this.requireRecord(handle);
    const channels = [red, green, blue, alpha].map((value, index) => (
      requireWord(value, `native procedural-model color ${index}`) & 0xff
    ));
    const packedColor = (
      channels[0] * 0x1000000
      + (channels[1] << 16)
      + (channels[2] << 8)
      + channels[3]
    ) >>> 0;
    const previous = record.packedColor;
    record.packedColor = packedColor;
    return { handle: record.handle, previous, packedColor, channels };
  }

  read(handle) {
    return cloneRecord(this.slots[requireHandle(handle)]);
  }

  snapshot() {
    return this.slots.map(cloneRecord);
  }

  restore(snapshot) {
    if (!Array.isArray(snapshot) || snapshot.length !== SLOT_COUNT) {
      throw new TypeError("native procedural-model snapshot must contain two slots");
    }
    this.slots = snapshot.map((record, handle) => {
      if (record === null) return null;
      if (record?.handle !== handle) {
        throw new TypeError("native procedural-model snapshot handle is invalid");
      }
      return cloneRecord(record);
    });
  }
}

export function createNativeProceduralModelControllerState() {
  return new NativeProceduralModelControllerState();
}

function stateFor(context) {
  const state = (
    typeof context.getNativeProceduralModelControllerState === "function"
      ? context.getNativeProceduralModelControllerState()
      : context.nativeProceduralModelControllerState
  );
  if (!(state instanceof NativeProceduralModelControllerState)) {
    throw new Error("native-procedural-model-controller-state-missing");
  }
  return state;
}

export function createNativeProceduralModelControllerSemanticHandlers({
  querySurfaceHeight,
  applyMutation,
} = {}) {
  return {
    "native-procedural-model-controller": async ({
      action,
      context,
      readArgument,
    }) => {
      const mode = readArgument(0);
      const state = stateFor(context);
      let mutation;
      let result;
      if (mode === 0) {
        const pointers = [2, 3, 4, 5].map(readArgument);
        mutation = state.allocate({
          originWords: readVector(
            action,
            1,
            context,
            "native-procedural-model-origin",
          ),
          resourcePath: requireResourceString(
            context,
            pointers[0],
            "native-procedural-model-texture-path",
          ),
          texture: requireResourceString(
            context,
            pointers[1],
            "native-procedural-model-texture",
          ),
          modelPath: requireResourceString(
            context,
            pointers[2],
            "native-procedural-model-model-path",
          ),
          model: requireResourceString(
            context,
            pointers[3],
            "native-procedural-model-model",
          ),
          scaleWord: readArgument(6),
          flagsWord: readArgument(7),
        });
        result = mutation.handle;
      } else if (mode === 1 || mode === 2) {
        mutation = state.setFlagBit2(readArgument(1), mode === 1);
      } else if (mode === 3) {
        mutation = state.release(readArgument(1));
      } else if (mode === 10) {
        mutation = state.writeParameters(readArgument(1), {
          wordAc: readArgument(2),
          wordB0: readArgument(3),
          wordB4: readArgument(4),
          wordB8: readArgument(5),
          wordBc: readArgument(6),
          wordC0: readArgument(7),
        });
      } else if (mode === 11) {
        mutation = state.writeParameters(readArgument(1), {
          wordA0: readArgument(2),
          wordA4: readArgument(3),
          wordA8: readArgument(4),
        });
        const record = state.requireRecord(readArgument(1));
        record.flagsWord = (record.flagsWord | 0x04000000) >>> 0;
      } else if (mode === 13) {
        const scaled = nativeFloat32Word(
          nativeFloat32FromWord(readArgument(3)) * 10,
        );
        mutation = state.writeParameters(readArgument(1), {
          word20: readArgument(2),
          word24: scaled,
        });
      } else if (mode === 14) {
        mutation = state.writeParameters(readArgument(1), {
          word28: readArgument(2),
          word2c: readArgument(3),
        });
      } else if (mode === 16) {
        mutation = state.writeParameters(readArgument(1), {
          word38: readArgument(2),
          word3c: readArgument(3),
        });
      } else if (mode === 17) {
        mutation = state.installGridResource(readArgument(1), {
          path: requireResourceString(
            context,
            readArgument(2),
            "native-procedural-model-grid-path",
          ),
          name: requireResourceString(
            context,
            readArgument(3),
            "native-procedural-model-grid",
          ),
        });
      } else if (mode === 18) {
        const query = querySurfaceHeight || context.queryNativeProceduralModelSurfaceHeight;
        if (typeof query !== "function") {
          return {
            status: "stopped",
            reason: "native-procedural-model-surface-query-missing",
          };
        }
        const handle = readArgument(1);
        const pointWords = readVector(
          action,
          2,
          context,
          "native-procedural-model-query-point",
        );
        state.requireRecord(handle);
        const height = await query({
          handle,
          pointWords,
          record: state.read(handle),
          source: sourceFor(action, context),
        });
        if (!Number.isFinite(height)) {
          return {
            status: "stopped",
            reason: "native-procedural-model-surface-result-invalid",
          };
        }
        result = Math.trunc(height);
        if (result < -0x80000000 || result > 0x7fffffff) {
          return {
            status: "stopped",
            reason: "native-procedural-model-surface-result-out-of-range",
          };
        }
        mutation = { handle, pointWords, surfaceHeight: height, result };
      } else if (mode === 21) {
        mutation = state.commandModel(
          readArgument(1),
          readArgument(2),
          readArgument(3),
        );
      } else if (mode === 24) {
        mutation = state.writePackedColor(
          readArgument(1),
          readArgument(2),
          readArgument(3),
          readArgument(4),
          readArgument(5),
        );
      } else {
        return {
          status: "stopped",
          reason: `native-procedural-model-mode-unproved:${mode}`,
        };
      }

      const apply = applyMutation || context.applyNativeProceduralModelMutation;
      if (typeof apply === "function") {
        await apply({ mode, mutation, source: sourceFor(action, context) });
      }
      return {
        status: "continued",
        mutation: { mode, ...mutation },
        ...(result === undefined ? {} : { result }),
      };
    },
  };
}
