import {
  nativeFloat32FromWord,
  nativeFloat32Word,
} from "./NativeEventNumericRuntime.js";
import {
  readAvailableNativeOperandWords,
} from "./NativeEventAddress.js";

const SELECTOR_TWO_EPSILON = nativeFloat32FromWord(0x3727c5ac);
const SELECTOR_FOUR_EPSILON = nativeFloat32FromWord(0x38d1b717);
const MINIMUM_FLOAT_WORD = 0x3c23d70b;
const MINIMUM_FLOAT = nativeFloat32FromWord(MINIMUM_FLOAT_WORD);

function requireIndex(value) {
  if (!Number.isInteger(value)) {
    throw new TypeError("native indexed-record index must be an integer");
  }
  return value;
}

function requireBinaryValue(value) {
  if (value !== 0 && value !== 1) {
    throw new RangeError("native indexed-record value must be zero or one");
  }
  return value;
}

function requireWord(value, name = "native indexed controller word") {
  if (
    !Number.isInteger(value)
    || value < -0x80000000
    || value > 0xffffffff
  ) {
    throw new RangeError(`${name} must be a 32-bit word`);
  }
  return value >>> 0;
}

function requireWords(value, length) {
  if (!Array.isArray(value) || value.length !== length) {
    throw new TypeError(
      `native indexed controller source must contain ${length} words`,
    );
  }
  return value.map(word => requireWord(word));
}

function clampMinimumWord(word) {
  return nativeFloat32FromWord(word) < MINIMUM_FLOAT
    ? MINIMUM_FLOAT_WORD
    : word;
}

export class NativeIndexedRecordState {
  constructor() {
    this.primaryValues = new Map();
    this.mirrorValues = new Map();
    this.callbackRecords = new Map();
    this.classZeroBits = 0;
    this.classOneBits = 0;
    this.combinedBits = 0;
    this.controllerRecords = new Map();
    this.controllerMirrorRecords = new Map();
    this.controllerGlobalMode = 0;
    this.controllerFloat4Words = undefined;
    this.controllerGeneration = 0;
  }

  configureControllerRecord({
    index,
    controlWord,
    word40,
    floatWords08,
    floatWord18,
    floatWord1c,
    floatWord20,
    vector40Words,
    vector52Words,
    initialized,
    active,
    controlWordCallback,
    word40Callback,
    floatWords08Callback,
    floatWord18Callback,
    floatWord1cCallback,
    floatProductCallback,
    vector52WordsCallback,
  }) {
    const selectedIndex = requireIndex(index);
    if (selectedIndex < 0 || selectedIndex >= 128) {
      throw new RangeError("native indexed controller index must be below 128");
    }
    if (
      controlWord !== undefined
      && !Number.isInteger(controlWord)
    ) {
      throw new TypeError("native indexed controller word +0x04 is invalid");
    }
    if (word40 !== undefined && !Number.isInteger(word40)) {
      throw new TypeError("native indexed controller word +0x40 is invalid");
    }
    const normalizedFloatWords08 = floatWords08 === undefined
      ? undefined
      : requireWords(floatWords08, 4);
    const normalizedFloatWord18 = floatWord18 === undefined
      ? undefined
      : requireWord(floatWord18, "native indexed controller word +0x18");
    const normalizedFloatWord1c = floatWord1c === undefined
      ? undefined
      : requireWord(floatWord1c, "native indexed controller word +0x1c");
    const normalizedFloatWord20 = floatWord20 === undefined
      ? undefined
      : requireWord(floatWord20, "native indexed controller word +0x20");
    const normalizedVector40Words = vector40Words === undefined
      ? undefined
      : requireWords(vector40Words, 3);
    const normalizedVector52Words = vector52Words === undefined
      ? undefined
      : requireWords(vector52Words, 3);
    for (const [name, callback] of Object.entries({
      controlWordCallback,
      word40Callback,
      floatWords08Callback,
      floatWord18Callback,
      floatWord1cCallback,
      floatProductCallback,
      vector52WordsCallback,
    })) {
      if (callback !== undefined && typeof callback !== "function") {
        throw new TypeError(`native indexed ${name} must be a function`);
      }
    }
    const previous = this.controllerRecords.get(selectedIndex);
    this.controllerRecords.set(selectedIndex, {
      controlWord: controlWord === undefined
        ? previous?.controlWord
        : controlWord | 0,
      word40: word40 === undefined ? previous?.word40 : word40 | 0,
      floatWords08: normalizedFloatWords08 ?? previous?.floatWords08,
      floatWord18: normalizedFloatWord18 ?? previous?.floatWord18,
      floatWord1c: normalizedFloatWord1c ?? previous?.floatWord1c,
      floatWord20: normalizedFloatWord20 ?? previous?.floatWord20,
      vector40Words: normalizedVector40Words ?? previous?.vector40Words,
      vector52Words: normalizedVector52Words ?? previous?.vector52Words,
      initialized: initialized === undefined
        ? previous?.initialized
        : Boolean(initialized),
      active: active === undefined ? previous?.active : Boolean(active),
      controlWordCallback: controlWordCallback
        ?? previous?.controlWordCallback,
      word40Callback: word40Callback ?? previous?.word40Callback,
      floatWords08Callback: floatWords08Callback
        ?? previous?.floatWords08Callback,
      floatWord18Callback: floatWord18Callback
        ?? previous?.floatWord18Callback,
      floatWord1cCallback: floatWord1cCallback
        ?? previous?.floatWord1cCallback,
      floatProductCallback: floatProductCallback
        ?? previous?.floatProductCallback,
      vector52WordsCallback: vector52WordsCallback
        ?? previous?.vector52WordsCallback,
    });
    return this.readControllerRecord(selectedIndex);
  }

  planControllerReset(mode) {
    if (mode !== 1 && mode !== 2) {
      throw new RangeError("native indexed controller reset mode is unproved");
    }
    return Object.freeze({
      kind: "indexed-controller-reset",
      mode,
      callbackArgument: mode === 1 ? 0 : 1,
      previousGeneration: this.controllerGeneration,
    });
  }

  commitControllerReset(plan) {
    if (
      plan?.kind !== "indexed-controller-reset"
      || plan.previousGeneration !== this.controllerGeneration
    ) {
      throw new Error("native indexed controller reset plan is stale");
    }
    const nextRecords = new Map();
    for (let index = 0; index < 128; index += 1) {
      const previous = this.controllerRecords.get(index);
      nextRecords.set(index, {
        controlWord: 0,
        word40: 1820,
        floatWords08: undefined,
        floatWord18: 0x3f800000,
        floatWord1c: 0x40000000,
        floatWord20: 0x3e800000,
        vector40Words: undefined,
        vector52Words: undefined,
        initialized: true,
        active: plan.mode === 1 && index === 0,
        controlWordCallback: previous?.controlWordCallback,
        word40Callback: previous?.word40Callback,
        floatWords08Callback: previous?.floatWords08Callback,
        floatWord18Callback: previous?.floatWord18Callback,
        floatWord1cCallback: previous?.floatWord1cCallback,
        floatProductCallback: previous?.floatProductCallback,
        vector52WordsCallback: previous?.vector52WordsCallback,
      });
    }
    this.controllerRecords = nextRecords;
    this.controllerMirrorRecords = new Map();
    this.controllerGlobalMode = plan.mode;
    this.controllerGeneration += 1;
    return {
      applied: true,
      mode: plan.mode,
      callbackArgument: plan.callbackArgument,
      initializedRecordCount: 128,
      generation: this.controllerGeneration,
    };
  }

  planControllerFloat4Write(words) {
    return Object.freeze({
      kind: "indexed-controller-float4-write",
      words: Object.freeze(requireWords(words, 4)),
      previousGeneration: this.controllerGeneration,
    });
  }

  commitControllerFloat4Write(plan) {
    if (
      plan?.kind !== "indexed-controller-float4-write"
      || plan.previousGeneration !== this.controllerGeneration
    ) {
      throw new Error("native indexed controller float4 plan is stale");
    }
    this.controllerFloat4Words = [...plan.words];
    this.controllerGeneration += 1;
    return {
      applied: true,
      words: [...plan.words],
      generation: this.controllerGeneration,
    };
  }

  planControllerInitialize({ index, mode, vector40Words, vector52Words }) {
    const selectedIndex = requireIndex(index);
    if (selectedIndex < 0 || selectedIndex >= 128) {
      return {
        applied: false,
        reason: "indexed-record-out-of-range",
      };
    }
    if (![2, 3, 4].includes(mode)) {
      throw new RangeError("native indexed controller initializer is unproved");
    }
    if ((mode === 3 || mode === 4) && vector40Words === undefined) {
      throw new TypeError("native indexed controller +0x28 vector is required");
    }
    if ((mode === 2 || mode === 4) && vector52Words === undefined) {
      throw new TypeError("native indexed controller +0x34 vector is required");
    }
    return Object.freeze({
      kind: "indexed-controller-initialize",
      index: selectedIndex,
      mode,
      vector40Words: vector40Words === undefined
        ? undefined
        : Object.freeze(requireWords(vector40Words, 3)),
      vector52Words: vector52Words === undefined
        ? undefined
        : Object.freeze(requireWords(vector52Words, 3)),
      presentationRequired: selectedIndex < 32,
      previousGeneration: this.controllerGeneration,
    });
  }

  commitControllerInitialize(plan) {
    if (plan?.applied === false) return plan;
    if (
      plan?.kind !== "indexed-controller-initialize"
      || plan.previousGeneration !== this.controllerGeneration
    ) {
      throw new Error("native indexed controller initializer plan is stale");
    }
    const previous = this.controllerRecords.get(plan.index);
    const record = {
      controlWord: plan.mode,
      word40: 1820,
      floatWords08: undefined,
      floatWord18: 0x3f800000,
      floatWord1c: 0x40000000,
      floatWord20: 0x3e800000,
      vector40Words: plan.vector40Words
        ? [...plan.vector40Words]
        : undefined,
      vector52Words: plan.vector52Words
        ? [...plan.vector52Words]
        : undefined,
      initialized: true,
      active: true,
      controlWordCallback: previous?.controlWordCallback,
      word40Callback: previous?.word40Callback,
      floatWords08Callback: previous?.floatWords08Callback,
      floatWord18Callback: previous?.floatWord18Callback,
      floatWord1cCallback: previous?.floatWord1cCallback,
      floatProductCallback: previous?.floatProductCallback,
      vector52WordsCallback: previous?.vector52WordsCallback,
    };
    this.controllerRecords.set(plan.index, record);
    if (plan.index < 32) {
      this.controllerMirrorRecords.set(plan.index, {
        controlWord: plan.mode,
        ...(plan.vector40Words
          ? { vector40Words: [...plan.vector40Words] }
          : {}),
        ...(plan.vector52Words
          ? { vector52Words: [...plan.vector52Words] }
          : {}),
        active: true,
      });
    }
    this.controllerGeneration += 1;
    return {
      applied: true,
      index: plan.index,
      mode: plan.mode,
      vector40Words: plan.vector40Words ? [...plan.vector40Words] : undefined,
      vector52Words: plan.vector52Words ? [...plan.vector52Words] : undefined,
      mirrored: plan.index < 32,
      generation: this.controllerGeneration,
    };
  }

  readControllerSubsystem() {
    return {
      mode: this.controllerGlobalMode,
      float4Words: this.controllerFloat4Words
        ? [...this.controllerFloat4Words]
        : undefined,
      generation: this.controllerGeneration,
      recordCount: this.controllerRecords.size,
    };
  }

  async applyControllerWrite({ index, selector, value, words }) {
    const selectedIndex = requireIndex(index);
    if (!Number.isInteger(selector)) {
      throw new TypeError("native indexed controller write is invalid");
    }
    if (selectedIndex < 0 || selectedIndex >= 128) {
      return {
        applied: false,
        reason: "indexed-record-out-of-range",
      };
    }
    const record = this.controllerRecords.get(selectedIndex);
    if (!record) {
      return {
        applied: false,
        reason: "indexed-controller-record-unavailable",
      };
    }
    let field;
    let callback;
    let nextValue;
    let secondaryCallback;
    let secondaryCallbackValue;
    let secondaryFieldValue;
    if (selector === 0) {
      if (!Number.isInteger(value)) {
        throw new TypeError("native indexed controller write is invalid");
      }
      if (value >= 5) {
        return {
          applied: false,
          reason: "indexed-controller-mode-value-out-of-range",
        };
      }
      if (!Number.isInteger(record.controlWord)) {
        return {
          applied: false,
          reason: "indexed-controller-control-word-unavailable",
        };
      }
      field = "controlWord";
      nextValue = (
        (value & ~0x08) | (record.controlWord & 0x08)
      ) | 0;
      callback = record.controlWordCallback;
    } else if (selector === 11) {
      if (!Number.isInteger(record.controlWord)) {
        return {
          applied: false,
          reason: "indexed-controller-control-word-unavailable",
        };
      }
      field = "controlWord";
      nextValue = value === 0
        ? (record.controlWord & ~0x08) | 0
        : (record.controlWord | 0x08) | 0;
      callback = record.controlWordCallback;
    } else if (selector === 10) {
      if (!Number.isInteger(value)) {
        throw new TypeError("native indexed controller write is invalid");
      }
      field = "word40";
      nextValue = value | 0;
      callback = record.word40Callback;
    } else if (selector === 2) {
      const sourceWords = requireWords(words, 4);
      field = "floatWords08";
      nextValue = [
        sourceWords[0],
        ...sourceWords.slice(1).map(word => (
          SELECTOR_TWO_EPSILON > nativeFloat32FromWord(word) ? 0 : word
        )),
      ];
      callback = record.floatWords08Callback;
    } else if (selector === 4) {
      const sourceWord = requireWord(
        value,
        "native indexed controller selector-four word",
      );
      field = "floatWord18";
      nextValue = sourceWord;
      callback = record.floatWord18Callback;
      secondaryCallbackValue = (
        Math.abs(nativeFloat32FromWord(sourceWord)) < SELECTOR_FOUR_EPSILON
          ? 0
          : sourceWord
      );
    } else if (selector === 5) {
      const sourceWord = requireWord(
        value,
        "native indexed controller selector-five word",
      );
      if (!Number.isInteger(record.floatWord20)) {
        return {
          applied: false,
          reason: "indexed-controller-floatWord20-unavailable",
        };
      }
      field = "floatWord1c";
      nextValue = clampMinimumWord(sourceWord);
      callback = record.floatWord1cCallback;
      secondaryFieldValue = clampMinimumWord(record.floatWord20 >>> 0);
      secondaryCallback = record.floatProductCallback;
      secondaryCallbackValue = nativeFloat32Word(Math.fround(
        Math.fround(nativeFloat32FromWord(nextValue))
        * Math.fround(nativeFloat32FromWord(secondaryFieldValue)),
      ));
    } else if (selector === 6) {
      const [sourceWord] = requireWords(words, 1);
      field = "floatWord20";
      nextValue = clampMinimumWord(sourceWord);
      callback = record.floatProductCallback;
      if (!Number.isInteger(record.floatWord1c)) {
        return {
          applied: false,
          reason: "indexed-controller-floatWord1c-unavailable",
        };
      }
      secondaryCallbackValue = nativeFloat32Word(Math.fround(
        Math.fround(nativeFloat32FromWord(record.floatWord1c))
        * Math.fround(nativeFloat32FromWord(nextValue)),
      ));
    } else if (selector === 8) {
      field = "vector52Words";
      nextValue = requireWords(words, 3);
      callback = record.vector52WordsCallback;
      secondaryCallbackValue = nextValue.map(word => (
        (word ^ 0x80000000) >>> 0
      ));
    } else {
      return {
        applied: false,
        reason: "indexed-controller-selector-unproved",
      };
    }
    if (
      selectedIndex < 32
      && (
        typeof callback !== "function"
        || (selector === 5 && typeof secondaryCallback !== "function")
      )
    ) {
      return {
        applied: false,
        reason: (
          selector === 5 && typeof secondaryCallback !== "function"
            ? "indexed-controller-floatProduct-callback-unavailable"
            : `indexed-controller-${field}-callback-unavailable`
        ),
      };
    }
    record[field] = nextValue;
    if (selector === 5) record.floatWord20 = secondaryFieldValue;
    const storedValue = Array.isArray(nextValue)
      ? [...nextValue]
      : nextValue;
    if (selectedIndex < 32) {
      const mirror = this.controllerMirrorRecords.get(selectedIndex) || {};
      mirror[field] = storedValue;
      if (selector === 5) mirror.floatWord20 = secondaryFieldValue;
      this.controllerMirrorRecords.set(selectedIndex, mirror);
      await callback({
        index: selectedIndex,
        selector,
        value: [4, 8].includes(selector)
          ? secondaryCallbackValue
          : storedValue,
      });
      if (selector === 5) {
        await secondaryCallback({
          index: selectedIndex,
          selector,
          value: secondaryCallbackValue,
        });
      }
    }
    return {
      applied: true,
      index: selectedIndex,
      selector,
      field,
      value: storedValue,
      ...(secondaryCallbackValue === undefined
        ? {}
        : { callbackValue: secondaryCallbackValue }),
      mirrored: selectedIndex < 32,
    };
  }

  readControllerRecord(index) {
    const selectedIndex = requireIndex(index);
    const record = this.controllerRecords.get(selectedIndex);
    const mirror = this.controllerMirrorRecords.get(selectedIndex);
    return record
      ? {
          controlWord: record.controlWord,
          word40: record.word40,
          floatWords08: record.floatWords08
            ? [...record.floatWords08]
            : undefined,
          floatWord18: record.floatWord18,
          floatWord1c: record.floatWord1c,
          floatWord20: record.floatWord20,
          vector40Words: record.vector40Words
            ? [...record.vector40Words]
            : undefined,
          vector52Words: record.vector52Words
            ? [...record.vector52Words]
            : undefined,
          initialized: record.initialized,
          active: record.active,
          mirrorControlWord: mirror?.controlWord,
          mirrorWord40: mirror?.word40,
          mirrorFloatWords08: mirror?.floatWords08
            ? [...mirror.floatWords08]
            : undefined,
          mirrorFloatWord18: mirror?.floatWord18,
          mirrorFloatWord1c: mirror?.floatWord1c,
          mirrorFloatWord20: mirror?.floatWord20,
          mirrorVector40Words: mirror?.vector40Words
            ? [...mirror.vector40Words]
            : undefined,
          mirrorVector52Words: mirror?.vector52Words
            ? [...mirror.vector52Words]
            : undefined,
          mirrorActive: mirror?.active,
          hasControlWordCallback: (
            typeof record.controlWordCallback === "function"
          ),
          hasWord40Callback: typeof record.word40Callback === "function",
          hasFloatWords08Callback: (
            typeof record.floatWords08Callback === "function"
          ),
          hasFloatWord18Callback: (
            typeof record.floatWord18Callback === "function"
          ),
          hasFloatWord1cCallback: (
            typeof record.floatWord1cCallback === "function"
          ),
          hasFloatProductCallback: (
            typeof record.floatProductCallback === "function"
          ),
          hasVector52WordsCallback: (
            typeof record.vector52WordsCallback === "function"
          ),
        }
      : undefined;
  }

  configureCallbackRecord({ index, classWord }) {
    const selectedIndex = requireIndex(index);
    if (selectedIndex < 0 || selectedIndex >= 32) {
      throw new RangeError("native callback-record index must be below 32");
    }
    if (!Number.isInteger(classWord)) {
      throw new TypeError("native callback-record class word is required");
    }
    this.callbackRecords.set(selectedIndex, {
      valueWord: 0,
      classWord: classWord & 0xffff,
    });
  }

  applyBinaryWrite({ index, value }) {
    const selectedIndex = requireIndex(index);
    const binaryValue = requireBinaryValue(value);
    if (selectedIndex < 0 || selectedIndex >= 128) {
      return {
        applied: false,
        reason: "indexed-record-out-of-range",
      };
    }
    const lowIndex = selectedIndex < 32;
    const callback = lowIndex
      ? this.callbackRecords.get(selectedIndex)
      : null;
    if (lowIndex && !callback) {
      return {
        applied: false,
        reason: "indexed-callback-record-unavailable",
      };
    }
    this.primaryValues.set(selectedIndex, binaryValue);
    if (!lowIndex) {
      return {
        applied: true,
        index: selectedIndex,
        value: binaryValue,
        mirrored: false,
      };
    }
    this.mirrorValues.set(selectedIndex, binaryValue);
    callback.valueWord = binaryValue;
    const mask = (1 << selectedIndex) >>> 0;
    this.classZeroBits = (this.classZeroBits & ~mask) >>> 0;
    this.classOneBits = (this.classOneBits & ~mask) >>> 0;
    const classBit = (callback.classWord >> 3) & 1;
    if (binaryValue === 1) {
      if (classBit === 0) {
        this.classZeroBits = (this.classZeroBits | mask) >>> 0;
      } else {
        this.classOneBits = (this.classOneBits | mask) >>> 0;
      }
    }
    this.combinedBits = (this.classZeroBits | this.classOneBits) >>> 0;
    return {
      applied: true,
      index: selectedIndex,
      value: binaryValue,
      mirrored: true,
      callback: { ...callback },
      bitfields: this.readBitfields(),
    };
  }

  readRecord(index) {
    const selectedIndex = requireIndex(index);
    const callback = this.callbackRecords.get(selectedIndex);
    return {
      primaryValue: this.primaryValues.get(selectedIndex),
      mirrorValue: this.mirrorValues.get(selectedIndex),
      callback: callback ? { ...callback } : undefined,
    };
  }

  readBitfields() {
    return {
      classZeroBits: this.classZeroBits,
      classOneBits: this.classOneBits,
      combinedBits: this.combinedBits,
    };
  }
}

export function createNativeIndexedRecordSemanticHandlers({
  applyIndexedBinaryRecordWrite,
  applyIndexedControllerWrite,
  planIndexedControllerReset,
  commitIndexedControllerReset,
  planIndexedControllerFloat4Write,
  commitIndexedControllerFloat4Write,
  planIndexedControllerInitialize,
  commitIndexedControllerInitialize,
  presentIndexedControllerMutation,
  readNativeWords,
} = {}) {
  return {
    "indexed-binary-record-write": async ({
      context,
      readArgument,
    }) => {
      const applyWrite = (
        applyIndexedBinaryRecordWrite
        || context.applyIndexedBinaryRecordWrite
      );
      if (typeof applyWrite !== "function") {
        return {
          status: "stopped",
          reason: "indexed-binary-record-adapter-missing",
        };
      }
      const value = readArgument(1);
      if (value !== 0 && value !== 1) {
        return {
          status: "stopped",
          reason: "indexed-binary-record-value-unproven",
        };
      }
      const mutation = await applyWrite({
        index: readArgument(0),
        value,
      });
      if (mutation?.reason === "indexed-callback-record-unavailable") {
        return { status: "stopped", reason: mutation.reason };
      }
      return { status: "continued", mutation };
    },
    "indexed-record-controller-write": async ({
      action,
      context,
      readArgument,
    }) => {
      const applyWrite = (
        applyIndexedControllerWrite
        || context.applyIndexedControllerWrite
      );
      if (typeof applyWrite !== "function") {
        return {
          status: "stopped",
          reason: "indexed-controller-adapter-missing",
        };
      }
      const selector = readArgument(1);
      if (![0, 2, 4, 5, 6, 8, 10, 11].includes(selector)) {
        return {
          status: "stopped",
          reason: "indexed-controller-selector-unproved",
        };
      }
      let words;
      if ([2, 6, 8].includes(selector)) {
        const wordCount = selector === 2 ? 4 : selector === 8 ? 3 : 1;
        const operand = action.arguments?.[2];
        words = readAvailableNativeOperandWords(
          operand,
          context,
          wordCount,
        );
        if (!words && ["constant", "static-pointer"].includes(operand?.kind)) {
          const readWords = readNativeWords || context.readNativeWords;
          if (typeof readWords !== "function") {
            return {
              status: "stopped",
              reason: "native-word-reader-missing",
            };
          }
          words = await readWords(readArgument(2), wordCount);
        }
        if (
          !Array.isArray(words)
          || words.length !== wordCount
        ) {
          return {
            status: "stopped",
            reason: "native-word-source-unavailable",
          };
        }
      }
      const mutation = await applyWrite({
        index: readArgument(0),
        selector,
        ...([2, 6, 8].includes(selector)
          ? { words }
          : { value: readArgument(2) }),
      });
      if (mutation?.reason?.endsWith("-unavailable")) {
        return { status: "stopped", reason: mutation.reason };
      }
      return { status: "continued", mutation };
    },
    "indexed-controller-subsystem-reset": async ({
      context,
      readArgument,
    }) => {
      const planReset = (
        planIndexedControllerReset || context.planIndexedControllerReset
      );
      const commitReset = (
        commitIndexedControllerReset || context.commitIndexedControllerReset
      );
      const present = (
        presentIndexedControllerMutation
        || context.presentIndexedControllerMutation
      );
      if (typeof planReset !== "function" || typeof commitReset !== "function") {
        return {
          status: "stopped",
          reason: "indexed-controller-reset-adapter-missing",
        };
      }
      if (typeof present !== "function") {
        return {
          status: "stopped",
          reason: "indexed-controller-presentation-adapter-missing",
        };
      }
      const plan = await planReset(readArgument(0));
      await present(plan);
      return {
        status: "continued",
        mutation: await commitReset(plan),
      };
    },
    "indexed-controller-float4-write": async ({
      context,
      readArgument,
    }) => {
      const planWrite = (
        planIndexedControllerFloat4Write
        || context.planIndexedControllerFloat4Write
      );
      const commitWrite = (
        commitIndexedControllerFloat4Write
        || context.commitIndexedControllerFloat4Write
      );
      const present = (
        presentIndexedControllerMutation
        || context.presentIndexedControllerMutation
      );
      const readWords = readNativeWords || context.readNativeWords;
      if (typeof planWrite !== "function" || typeof commitWrite !== "function") {
        return {
          status: "stopped",
          reason: "indexed-controller-float4-adapter-missing",
        };
      }
      if (typeof present !== "function") {
        return {
          status: "stopped",
          reason: "indexed-controller-presentation-adapter-missing",
        };
      }
      if (typeof readWords !== "function") {
        return { status: "stopped", reason: "native-word-reader-missing" };
      }
      const words = await readWords(readArgument(0), 4);
      if (!Array.isArray(words) || words.length !== 4) {
        return { status: "stopped", reason: "native-word-source-unavailable" };
      }
      const plan = await planWrite(words);
      await present(plan);
      return {
        status: "continued",
        mutation: await commitWrite(plan),
      };
    },
    "indexed-controller-mode-initialize": async ({
      action,
      context,
      readArgument,
    }) => {
      const planInitialize = (
        planIndexedControllerInitialize
        || context.planIndexedControllerInitialize
      );
      const commitInitialize = (
        commitIndexedControllerInitialize
        || context.commitIndexedControllerInitialize
      );
      if (
        typeof planInitialize !== "function"
        || typeof commitInitialize !== "function"
      ) {
        return {
          status: "stopped",
          reason: "indexed-controller-initialize-adapter-missing",
        };
      }
      const operationId = Number(action.operationId);
      const mode = operationId === 0x0068
        ? 2
        : operationId === 0x0069
          ? 3
          : operationId === 0x006a
            ? 4
            : undefined;
      if (mode === undefined) {
        return {
          status: "stopped",
          reason: "indexed-controller-initializer-operation-unproved",
        };
      }
      const readWords = readNativeWords || context.readNativeWords;
      if (typeof readWords !== "function") {
        return { status: "stopped", reason: "native-word-reader-missing" };
      }
      const vector40Words = mode === 2
        ? undefined
        : await readWords(readArgument(1), 3);
      const vector52Words = mode === 3
        ? undefined
        : await readWords(readArgument(mode === 4 ? 2 : 1), 3);
      if (
        (vector40Words && vector40Words.length !== 3)
        || (vector52Words && vector52Words.length !== 3)
      ) {
        return { status: "stopped", reason: "native-word-source-unavailable" };
      }
      const plan = await planInitialize({
        index: readArgument(0),
        mode,
        vector40Words,
        vector52Words,
      });
      if (plan?.applied === false) {
        return { status: "continued", mutation: plan };
      }
      if (plan.presentationRequired) {
        const present = (
          presentIndexedControllerMutation
          || context.presentIndexedControllerMutation
        );
        if (typeof present !== "function") {
          return {
            status: "stopped",
            reason: "indexed-controller-presentation-adapter-missing",
          };
        }
        await present(plan);
      }
      return {
        status: "continued",
        mutation: await commitInitialize(plan),
      };
    },
  };
}

/**
 * Routes only the presentation boundaries proven for the indexed-controller
 * family. The adapter deliberately assigns no visual meaning to native words.
 */
export function createNativeIndexedControllerPresentationAdapter({
  presentReset,
  presentFloat4Write,
  presentLowIndexInitialize,
} = {}) {
  return async plan => {
    if (plan?.kind === "indexed-controller-reset") {
      if (typeof presentReset !== "function") {
        throw new Error("native indexed controller reset presenter is missing");
      }
      return presentReset(plan);
    }
    if (plan?.kind === "indexed-controller-float4-write") {
      if (typeof presentFloat4Write !== "function") {
        throw new Error("native indexed controller float4 presenter is missing");
      }
      return presentFloat4Write(plan);
    }
    if (
      plan?.kind === "indexed-controller-initialize"
      && plan.presentationRequired
    ) {
      if (typeof presentLowIndexInitialize !== "function") {
        throw new Error(
          "native indexed controller low-index presenter is missing",
        );
      }
      return presentLowIndexInitialize(Object.freeze({
        ...plan,
        vector52CallbackWords: plan.vector52Words
          ? Object.freeze(plan.vector52Words.map(word => (
              (word ^ 0x80000000) >>> 0
            )))
          : undefined,
      }));
    }
    throw new Error("native indexed controller presentation plan is unproved");
  };
}

export function createNativeIndexedRecordState() {
  return new NativeIndexedRecordState();
}
