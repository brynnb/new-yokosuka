import {
  readAvailableNativeOperandWords,
} from "./NativeEventAddress.js";

const SLOT_COUNT = 16;
const CONTROLLER_SELECTOR = 0;
const ARGUMENT_COUNTS = new Map([
  [0, 7],
  [1, 2],
  [2, 2],
  [3, 2],
  [7, 3],
  [8, 4],
  [9, 5],
  [11, 3],
  [12, 3],
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

function words(values, label) {
  return values.map((value, index) => word(value, `${label} ${index}`));
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

/** Exact sixteen-slot, selector-zero EFPT ownership used by operation 0x0100. */
export class NativeEfptPrimaryControllerState {
  constructor() {
    this.slots = Array.from({ length: SLOT_COUNT }, () => null);
  }

  create(configuration) {
    const handle = this.slots.findIndex(record => record === null);
    if (handle < 0) return { handle: -1, record: null };
    this.slots[handle] = {
      handle,
      controllerSelector: CONTROLLER_SELECTOR,
      firstVectorWords: words(configuration.firstVectorWords, "native EFPT first vector"),
      secondVectorWords: words(configuration.secondVectorWords, "native EFPT second vector"),
      countWord: word(configuration.countWord, "native EFPT count"),
      scalarWord: word(configuration.scalarWord, "native EFPT scalar"),
      controlWord: word(configuration.controlWord, "native EFPT control"),
      variantWord: word(configuration.variantWord, "native EFPT variant"),
      active: false,
      commands: [],
    };
    return { handle, record: clone(this.slots[handle]) };
  }

  command(mode, handle, arguments_) {
    const index = word(handle, "native EFPT handle");
    const argumentsWords = words(arguments_, `native EFPT mode ${mode} argument`);
    if (index >= SLOT_COUNT || this.slots[index] === null) {
      return {
        mode,
        controllerSelector: CONTROLLER_SELECTOR,
        handle: index,
        arguments: argumentsWords,
        applied: false,
      };
    }
    const record = this.slots[index];
    const command = { mode, arguments: argumentsWords };
    record.commands.push(command);
    if (mode === 1) record.active = true;
    if (mode === 2) record.active = false;
    if (mode === 7) record.field72Word = argumentsWords[0];
    if (mode === 8) {
      record.field64Word = argumentsWords[0];
      record.field68Word = argumentsWords[1];
    }
    if (mode === 9) record.packedFieldWords = [...argumentsWords];
    if (mode === 11) record.mode11Word = argumentsWords[0];
    if (mode === 12) record.mode12Word = argumentsWords[0];
    if (mode === 3) this.slots[index] = null;
    return {
      mode,
      controllerSelector: CONTROLLER_SELECTOR,
      handle: index,
      ...command,
      applied: true,
    };
  }

  clear() {
    this.slots.fill(null);
  }
}

export function createNativeEfptPrimaryControllerState() {
  return new NativeEfptPrimaryControllerState();
}

export function createNativeEfptPrimaryControllerSemanticHandlers({
  state = createNativeEfptPrimaryControllerState(),
  applyNativeEfptController,
} = {}) {
  return {
    "native-efpt-primary-controller": async ({ action, context, readArgument }) => {
      const mode = readArgument(0);
      const argumentCount = ARGUMENT_COUNTS.get(mode);
      if (argumentCount === undefined) {
        return stopped("native-efpt-primary-controller-mode-unproved");
      }
      if (action.arguments?.length !== argumentCount) {
        return stopped("native-efpt-primary-controller-argument-shape-unproved");
      }
      let detail;
      if (mode === 0) {
        const firstVectorWords = vectorWords(action, 1, context);
        const secondVectorWords = vectorWords(action, 2, context);
        if (!firstVectorWords || !secondVectorWords) {
          return stopped("native-efpt-primary-controller-vector-unavailable");
        }
        detail = {
          mode,
          controllerSelector: CONTROLLER_SELECTOR,
          firstVectorWords,
          secondVectorWords,
          countWord: readArgument(3),
          scalarWord: readArgument(4),
          controlWord: readArgument(5),
          variantWord: readArgument(6),
        };
      } else {
        detail = {
          mode,
          controllerSelector: CONTROLLER_SELECTOR,
          handle: readArgument(1),
          arguments: Array.from(
            { length: argumentCount - 2 },
            (_, index) => readArgument(index + 2),
          ),
        };
      }
      const apply = applyNativeEfptController
        || context.applyNativeEfptController
        || (route => (
          route.mode === 0
            ? state.create(route)
            : state.command(route.mode, route.handle, route.arguments)
        ));
      const mutation = await apply(detail);
      return mode === 0
        ? { status: "continued", result: mutation.handle, mutation }
        : { status: "continued", mutation };
    },
  };
}
