import {
  NATIVE_DIALOGUE_PREDICATE_DATA,
} from "../data/dialogue/nativePredicateValues.generated.js";

const BANK_DEFINITIONS = new Map(
  NATIVE_DIALOGUE_PREDICATE_DATA.stateBanks.banks.map(
    (definition) => [definition.bank, definition],
  ),
);

function definitionFor(bank) {
  const definition = BANK_DEFINITIONS.get(Number(bank));
  if (!definition) throw new RangeError(`Unknown native dialogue bank ${bank}`);
  return definition;
}

function bytesFrom(value, length) {
  if (value === undefined || value === null) return new Uint8Array(length);
  const bytes = value instanceof Uint8Array
    ? value
    : Uint8Array.from(value);
  if (bytes.length !== length) {
    throw new RangeError(
      `Native dialogue bank has ${bytes.length} bytes; expected ${length}`,
    );
  }
  return bytes.slice();
}

export class NativeDialogueState {
  constructor(snapshot = {}) {
    const source = snapshot.banks ?? snapshot;
    this.banks = new Map();
    for (const [bank, definition] of BANK_DEFINITIONS) {
      this.banks.set(
        bank,
        bytesFrom(source[bank] ?? source[String(bank)], definition.byteLength),
      );
    }
  }

  read(bank, index) {
    const definition = definitionFor(bank);
    const numericIndex = Number(index);
    if (
      !Number.isInteger(numericIndex)
      || numericIndex < 0
      || numericIndex >= definition.capacity
    ) {
      return 0;
    }
    const bytes = this.banks.get(Number(bank));
    if (definition.storage === "bitfield") {
      return (bytes[numericIndex >> 3] >> (numericIndex & 7)) & 1;
    }
    return bytes[numericIndex];
  }

  write(bank, index, value) {
    const definition = definitionFor(bank);
    const numericIndex = Number(index);
    if (
      !Number.isInteger(numericIndex)
      || numericIndex < 0
      || numericIndex >= definition.capacity
    ) {
      return false;
    }
    const bytes = this.banks.get(Number(bank));
    if (definition.storage === "bitfield") {
      const mask = 1 << (numericIndex & 7);
      const byteIndex = numericIndex >> 3;
      bytes[byteIndex] = Number(value)
        ? bytes[byteIndex] | mask
        : bytes[byteIndex] & ~mask;
    } else {
      bytes[numericIndex] = Number(value) & 0xff;
    }
    return true;
  }

  predicateContext() {
    return {
      readStateBank: (bank, index) => this.read(bank, index),
      writeStateBank: (bank, index, value) => this.write(
        bank,
        index,
        value,
      ),
    };
  }

  toJSON() {
    return {
      schema: "new-yokosuka-native-dialogue-state-v1",
      banks: Object.fromEntries(
        [...this.banks].map(([bank, bytes]) => [bank, [...bytes]]),
      ),
    };
  }

  static fromNativeSave(saveBytes) {
    const save = saveBytes instanceof Uint8Array
      ? saveBytes
      : Uint8Array.from(saveBytes);
    const banks = {};
    for (const definition of BANK_DEFINITIONS.values()) {
      const end = definition.saveOffset + definition.byteLength;
      if (end > save.length) {
        throw new RangeError(
          `Native save is too short for dialogue bank ${definition.bank}`,
        );
      }
      banks[definition.bank] = save.slice(definition.saveOffset, end);
    }
    return new NativeDialogueState({ banks });
  }

  writeNativeSave(saveBytes) {
    const save = saveBytes instanceof Uint8Array
      ? saveBytes.slice()
      : Uint8Array.from(saveBytes);
    for (const definition of BANK_DEFINITIONS.values()) {
      const end = definition.saveOffset + definition.byteLength;
      if (end > save.length) {
        throw new RangeError(
          `Native save is too short for dialogue bank ${definition.bank}`,
        );
      }
      save.set(this.banks.get(definition.bank), definition.saveOffset);
    }
    return save;
  }
}

export function createNativeDialogueState(snapshot) {
  return new NativeDialogueState(snapshot);
}
