import {
  readAvailableNativeOperandWords,
} from "./NativeEventAddress.js";

const SLOT_COUNT = 8;
const MODES = new Map([
  [0, 6],
  [1, 2],
  [2, 2],
  [3, 2],
  [6, 4],
  [7, 3],
  [10, 3],
  [13, 4],
  [15, 1],
]);

function stopped(reason) {
  return { status: "stopped", reason };
}

function word(value, label) {
  if (!Number.isInteger(value)) {
    throw new TypeError(`${label} must be an integer word`);
  }
  return value >>> 0;
}

function clone(record) {
  if (!record) return null;
  return {
    ...record,
    firstVectorWords: [...record.firstVectorWords],
    secondVectorWords: [...record.secondVectorWords],
    commands: record.commands.map(command => ({
      ...command,
      arguments: [...command.arguments],
    })),
  };
}

function vectorWords(action, argumentIndex, context) {
  return readAvailableNativeOperandWords(
    action.arguments?.[argumentIndex],
    context,
    3,
  );
}

/** Exact eight-slot EFPT ownership exposed by operation 0x0047. */
export class NativeEfptControllerState {
  constructor() {
    this.slots = Array.from({ length: SLOT_COUNT }, () => null);
    this.globalResetCount = 0;
  }

  create(configuration) {
    const handle = this.slots.findIndex(record => record === null);
    if (handle < 0) return { handle: -1, record: null };
    this.slots[handle] = {
      handle,
      firstVectorWords: configuration.firstVectorWords.map((value, index) => (
        word(value, `native EFPT first vector ${index}`)
      )),
      secondVectorWords: configuration.secondVectorWords.map((value, index) => (
        word(value, `native EFPT second vector ${index}`)
      )),
      countWord: word(configuration.countWord, "native EFPT count"),
      scalarWord: word(configuration.scalarWord, "native EFPT scalar"),
      controlWord: word(configuration.controlWord, "native EFPT control"),
      commands: [],
    };
    return { handle, record: clone(this.slots[handle]) };
  }

  command(mode, handle, arguments_) {
    const index = word(handle, "native EFPT handle");
    if (index >= SLOT_COUNT || this.slots[index] === null) {
      return { mode, handle: index, arguments: [...arguments_], applied: false };
    }
    const record = this.slots[index];
    const command = {
      mode,
      arguments: arguments_.map((value, argumentIndex) => (
        word(value, `native EFPT mode ${mode} argument ${argumentIndex}`)
      )),
    };
    record.commands.push(command);
    if (mode === 3) this.slots[index] = null;
    return { mode, handle: index, ...command, applied: true };
  }

  resetGlobals() {
    this.globalResetCount += 1;
    return { mode: 15, globalResetCount: this.globalResetCount };
  }

  clear() {
    this.slots.fill(null);
    this.globalResetCount = 0;
  }
}

export function createNativeEfptControllerState() {
  return new NativeEfptControllerState();
}

export function createNativeEfptControllerSemanticHandlers({
  state = createNativeEfptControllerState(),
  applyNativeEfptController,
} = {}) {
  return {
    "native-efpt-controller": async ({ action, context, readArgument }) => {
      const mode = readArgument(0);
      const argumentCount = MODES.get(mode);
      if (argumentCount === undefined) {
        return stopped("native-efpt-controller-mode-unproved");
      }
      if (action.arguments?.length !== argumentCount) {
        return stopped("native-efpt-controller-argument-shape-unproved");
      }
      let detail;
      if (mode === 0) {
        const firstVectorWords = vectorWords(action, 1, context);
        const secondVectorWords = vectorWords(action, 2, context);
        if (!firstVectorWords || !secondVectorWords) {
          return stopped("native-efpt-controller-vector-unavailable");
        }
        detail = {
          mode,
          firstVectorWords,
          secondVectorWords,
          countWord: readArgument(3),
          scalarWord: readArgument(4),
          controlWord: readArgument(5),
        };
      } else if (mode === 6) {
        const firstVectorWords = vectorWords(action, 2, context);
        const secondVectorWords = vectorWords(action, 3, context);
        if (!firstVectorWords || !secondVectorWords) {
          return stopped("native-efpt-controller-vector-unavailable");
        }
        detail = {
          mode,
          handle: readArgument(1),
          firstVectorWords,
          secondVectorWords,
        };
      } else {
        detail = {
          mode,
          arguments: Array.from(
            { length: argumentCount - 1 },
            (_, index) => readArgument(index + 1),
          ),
        };
      }
      const apply = applyNativeEfptController
        || context.applyNativeEfptController
        || (route => {
          if (route.mode === 0) return state.create(route);
          if (route.mode === 15) return state.resetGlobals();
          if (route.mode === 6) {
            return state.command(route.mode, route.handle, [
              ...route.firstVectorWords,
              ...route.secondVectorWords,
            ]);
          }
          return state.command(
            route.mode,
            route.arguments[0],
            route.arguments.slice(1),
          );
        });
      const mutation = await apply(detail);
      return mode === 0
        ? { status: "continued", result: mutation.handle, mutation }
        : { status: "continued", mutation };
    },
  };
}
