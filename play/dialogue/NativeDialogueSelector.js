import {
  NATIVE_DIALOGUE_SELECTORS,
} from "../data/dialogue/nativeActorSelectors.generated.js";
import {
  evaluateNativeDialoguePredicate,
} from "./NativeDialoguePredicate.js";

const decodedSelectors = new Map();

const OPERATIONS = Object.freeze({
  1: "assign",
  2: "increment",
  3: "decrement",
  4: "isZero",
  5: "booleanAnd",
  6: "booleanOr",
  7: "equal",
  8: "notEqual",
  9: "greaterThan",
  10: "greaterThanOrEqual",
  11: "lessThan",
  12: "lessThanOrEqual",
});

export function signExtendNativeDialogue(value, bits) {
  const sign = 2 ** (bits - 1);
  return value & sign ? value - 2 ** bits : value;
}

function hex(value) {
  return `0x${value.toString(16)}`;
}

function decodeBase64(value) {
  const binary = globalThis.atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

export function nativeDialogueSelectorResource(actorCode) {
  const key = String(actorCode || "").toUpperCase();
  const resource = NATIVE_DIALOGUE_SELECTORS.resources[key];
  if (!resource) return null;
  let bytes = decodedSelectors.get(key);
  if (!bytes) {
    bytes = decodeBase64(resource.base64);
    decodedSelectors.set(key, bytes);
  }
  return { key, resource, bytes };
}

function operand(token, nextByte) {
  const group = token & 0xe0;
  if (group === 0xa0) {
    if (token !== 0xa0) {
      throw new Error(`invalid runtime selector token ${hex(token)}`);
    }
    return {
      kind: "runtimeSelector",
      mode: nextByte,
      nativeValueType: 1,
    };
  }
  const value = ((token & 0x0f) << 8) | nextByte;
  if (group === 0x40 && value === 0x0fff) {
    return {
      kind: "literal",
      value: -1,
      nativeValueType: 1,
      encodedAs: "nativeValueType4SpecialMinusOne",
    };
  }
  const type = {
    0x00: ["nativeValueType2", 2],
    0x20: ["nativeValueType3", 3],
    0x40: ["nativeValueType4", 4],
    0x60: ["literal", 1],
    0xc0: ["actorRuntimeIdentity", 5],
    0xe0: ["nativeSpatialResult", 6],
  }[group];
  if (!type) throw new Error(`unsupported expression token ${hex(token)}`);
  return { kind: type[0], value, nativeValueType: type[1] };
}

export function parseNativeDialogueExpression(bytes, start) {
  const stack = [];
  let cursor = start;
  while (cursor < bytes.length) {
    const token = bytes[cursor++];
    const group = token & 0xe0;
    if (group !== 0x80) {
      if (cursor >= bytes.length) {
        throw new Error(`truncated expression at ${hex(cursor - 1)}`);
      }
      stack.push(operand(token, bytes[cursor++]));
      continue;
    }
    const opcode = token & 0x1f;
    if (opcode === 0) {
      if (!stack.length) {
        throw new Error(`empty expression at ${hex(cursor - 1)}`);
      }
      return { cursor, predicate: stack.at(-1) };
    }
    const operation = OPERATIONS[opcode];
    if (!operation) {
      throw new Error(
        `unsupported expression operator ${opcode} at ${hex(cursor - 1)}`,
      );
    }
    if (opcode >= 2 && opcode <= 4) {
      if (!stack.length) {
        throw new Error(`unary expression underflow at ${hex(cursor - 1)}`);
      }
      stack.push({
        kind: "operator",
        opcode,
        operation,
        operand: stack.pop(),
      });
      continue;
    }
    if (stack.length < 2) {
      throw new Error(`binary expression underflow at ${hex(cursor - 1)}`);
    }
    const right = stack.pop();
    const left = stack.pop();
    stack.push({ kind: "operator", opcode, operation, left, right });
  }
  throw new Error(`unterminated expression at ${hex(start)}`);
}

function unresolved(actorCode, offset, reasons) {
  return {
    status: "unresolved",
    actorCode,
    selectorOffset: offset,
    reasons: [...new Set(reasons.filter(Boolean))],
  };
}

export function selectNativeDialogueEntry(actorCode, context = {}) {
  const source = nativeDialogueSelectorResource(actorCode);
  if (!source) {
    return {
      status: "missing",
      actorCode: String(actorCode || "").toUpperCase(),
    };
  }
  const { key, resource, bytes } = source;
  let cursor = 0;
  let lastExpression = null;
  const visited = new Set();

  while (cursor >= 0 && cursor < bytes.length) {
    const stateKey = `${cursor}:${lastExpression?.resolved
      ? lastExpression.value
      : lastExpression?.reasons?.join(",") || "initial"}`;
    if (visited.has(stateKey)) {
      return unresolved(key, cursor, [`selector:cycle:${hex(cursor)}`]);
    }
    visited.add(stateKey);

    const opcodeOffset = cursor;
    const opcode = bytes[cursor];
    if (opcode < 0x80) {
      if (cursor + 1 >= bytes.length) {
        return unresolved(key, cursor, [`selector:truncated:${hex(cursor)}`]);
      }
      const encoded = ((opcode & 0x0f) << 8) | bytes[cursor + 1];
      const opcodeClass = opcode & 0x70;
      cursor += 2;
      if (opcodeClass === 0x00) continue;
      if (opcodeClass === 0x10) {
        if (cursor + encoded > bytes.length) {
          return unresolved(
            key,
            opcodeOffset,
            [`selector:entryBounds:${hex(opcodeOffset)}`],
          );
        }
        return {
          status: "selected",
          actorCode: key,
          markerOffset: resource.recordRoutingOffset + opcodeOffset,
          bodyOffset: resource.recordRoutingOffset + cursor,
          bodyByteLength: encoded,
          bodyBytes: bytes.subarray(cursor, cursor + encoded),
        };
      }
      if (opcodeClass === 0x40) {
        if (!lastExpression?.resolved) {
          return unresolved(
            key,
            opcodeOffset,
            lastExpression?.reasons || [
              `selector:lastExpression:${hex(opcodeOffset)}`,
            ],
          );
        }
        if (lastExpression.value === 0) {
          cursor += signExtendNativeDialogue(encoded, 12);
        }
        continue;
      }
      if (opcodeClass === 0x50) {
        cursor += signExtendNativeDialogue(encoded, 12);
        continue;
      }
      return { status: "none", actorCode: key, selectorOffset: opcodeOffset };
    }

    if (opcode < 0xe0) {
      if ((opcode & 0xf0) === 0xd0) {
        if (cursor + 2 >= bytes.length) {
          return unresolved(
            key,
            cursor,
            [`selector:truncatedBranch:${hex(cursor)}`],
          );
        }
        const encoded = (
          ((opcode & 0x0f) << 16)
          | (bytes[cursor + 1] << 8)
          | bytes[cursor + 2]
        );
        cursor += 3 + signExtendNativeDialogue(encoded, 20);
      } else {
        cursor += 1;
      }
      continue;
    }

    if (opcode === 0xf0) {
      try {
        const parsed = parseNativeDialogueExpression(bytes, cursor + 1);
        cursor = parsed.cursor;
        lastExpression = evaluateNativeDialoguePredicate(
          parsed.predicate,
          context,
        );
      } catch (error) {
        return unresolved(
          key,
          cursor,
          [`selector:expression:${error.message}`],
        );
      }
      continue;
    }
    if (opcode === 0xf1) {
      cursor += 1;
      continue;
    }
    return { status: "none", actorCode: key, selectorOffset: cursor };
  }

  return unresolved(key, cursor, [`selector:outOfBounds:${hex(cursor)}`]);
}

export function hasNativeDialogueSelector(actorCode) {
  return Boolean(nativeDialogueSelectorResource(actorCode));
}
