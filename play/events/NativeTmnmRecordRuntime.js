import {
  nativeFloat32FromWord,
} from "./NativeEventNumericRuntime.js";

const FLOAT_WORD_46FFFE00 = nativeFloat32FromWord(0x46fffe00);

function requireFourcc(value) {
  const fourcc = String(value || "");
  if (fourcc.length !== 4) {
    throw new TypeError("native TMNM object requires a four-character ID");
  }
  for (const character of fourcc) {
    if (character.codePointAt(0) > 0xff) {
      throw new TypeError("native TMNM object ID must be byte-oriented");
    }
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

function requireHalfword(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new RangeError(`${label} must be a 16-bit word`);
  }
  return value;
}

function objectTagArgument(action, readArgument) {
  const operand = action.arguments?.[0];
  if (operand?.kind === "constant" && typeof operand.ascii === "string") {
    return requireFourcc(operand.ascii);
  }
  const value = readArgument(0);
  if (typeof value === "string") return requireFourcc(value);
  const word = requireWord(value, "native TMNM object tag");
  return requireFourcc(String.fromCharCode(
    word & 0xff,
    (word >>> 8) & 0xff,
    (word >>> 16) & 0xff,
    (word >>> 24) & 0xff,
  ));
}

export class NativeTmnmRecordState {
  constructor() {
    this.records = new Map();
  }

  configure({
    objectTag,
    word00,
    word0c,
    word10,
    word14,
    word18,
    word1c,
  }) {
    const key = requireFourcc(objectTag);
    const previous = this.records.get(key) || {};
    const next = { ...previous };
    for (const [field, value] of Object.entries({
      word00,
      word0c,
      word10,
      word14,
      word18,
    })) {
      if (value !== undefined) {
        next[field] = requireWord(
          value,
          `native TMNM record word +0x${field.slice(4)}`,
        );
      }
    }
    if (word1c !== undefined) {
      next.word1c = requireHalfword(
        word1c,
        "native TMNM record word +0x1c",
      );
    }
    this.records.set(key, next);
    return this.read(key);
  }

  resetWord00(objectTag) {
    const key = requireFourcc(objectTag);
    const record = this.records.get(key);
    if (!record) {
      return {
        applied: false,
        reason: "resolved-object-or-tmnm-record-unavailable",
      };
    }
    const previous = record.word00;
    record.word00 = 0;
    return {
      applied: true,
      objectTag: key,
      previous,
      word00: 0,
    };
  }

  has(objectTag) {
    return this.records.has(requireFourcc(objectTag));
  }

  apply({
    objectTag,
    word0c,
    word10,
    word14,
    word18,
    word1cMask,
  }) {
    const key = requireFourcc(objectTag);
    const record = this.records.get(key);
    if (!record) {
      return {
        applied: false,
        reason: "resolved-object-or-tmnm-record-unavailable",
      };
    }
    const supplied = {
      word0c: requireWord(word0c, "native TMNM argument four"),
      word10: requireWord(word10, "native TMNM argument five"),
      word14: requireWord(word14, "native TMNM argument two"),
      word18: requireWord(word18, "native TMNM argument three"),
      word1cMask: requireWord(word1cMask, "native TMNM argument six"),
    };
    if (
      (supplied.word1cMask | 0) > 0
      && !Number.isInteger(record.word1c)
    ) {
      return {
        applied: false,
        reason: "tmnm-record-word-1c-unavailable",
      };
    }
    const writtenFields = [];
    if (!(0 > nativeFloat32FromWord(supplied.word14))) {
      record.word14 = supplied.word14;
      writtenFields.push("word14");
    }
    if (!(0 > nativeFloat32FromWord(supplied.word18))) {
      record.word18 = supplied.word18;
      writtenFields.push("word18");
    }
    if (!(0 > nativeFloat32FromWord(supplied.word0c))) {
      record.word0c = supplied.word0c;
      writtenFields.push("word0c");
    }
    if (FLOAT_WORD_46FFFE00 > nativeFloat32FromWord(supplied.word10)) {
      record.word10 = supplied.word10;
      writtenFields.push("word10");
    }
    if ((supplied.word1cMask | 0) >= 0) {
      if (supplied.word1cMask === 0) {
        record.word1c = 0;
      } else {
        record.word1c = (
          (record.word1c & 0xffff) | supplied.word1cMask
        ) & 0xffff;
      }
      writtenFields.push("word1c");
    }
    return {
      applied: true,
      objectTag: key,
      writtenFields,
      record: this.read(key),
    };
  }

  read(objectTag) {
    const record = this.records.get(requireFourcc(objectTag));
    return record ? { ...record } : undefined;
  }
}

export function createNativeTmnmRecordSemanticHandlers({
  applyResource,
} = {}) {
  return {
    "resolved-object-tmnm-word-zero-reset": async ({
      action,
      context,
      readArgument,
    }) => {
      const state = context.nativeTmnmRecords;
      if (!state) {
        return {
          status: "stopped",
          reason: "native-tmnm-record-state-missing",
        };
      }
      const mutation = state.resetWord00(
        objectTagArgument(action, readArgument),
      );
      return { status: "continued", mutation };
    },
    "resolved-object-tmnm-parameter-write": async ({
      action,
      context,
      readArgument,
    }) => {
      const state = context.nativeTmnmRecords;
      if (!state) {
        return {
          status: "stopped",
          reason: "native-tmnm-record-state-missing",
        };
      }
      const objectTag = objectTagArgument(action, readArgument);
      if (!state.has(objectTag)) {
        return {
          status: "continued",
          mutation: {
            applied: false,
            reason: "resolved-object-or-tmnm-record-unavailable",
          },
        };
      }
      const resourceId = readArgument(1);
      if (resourceId !== 0) {
        const apply = applyResource || context.applyNativeTmnmResource;
        if (typeof apply !== "function") {
          return {
            status: "stopped",
            reason: "native-tmnm-resource-adapter-missing",
          };
        }
        await apply({ objectTag, resourceId });
      }
      const mutation = state.apply({
        objectTag,
        word14: readArgument(2),
        word18: readArgument(3),
        word0c: readArgument(4),
        word10: readArgument(5),
        word1cMask: readArgument(6),
      });
      if (mutation.reason?.endsWith("-unavailable")) {
        return { status: "stopped", reason: mutation.reason };
      }
      return { status: "continued", mutation };
    },
  };
}

export function createNativeTmnmRecordState() {
  return new NativeTmnmRecordState();
}
