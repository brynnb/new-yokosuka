function requireUnsignedWord(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new RangeError(`${label} must be an unsigned 32-bit word`);
  }
  return value >>> 0;
}

function requireIndex(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer`);
  }
  return value;
}

const FLOAT_WORD = new DataView(new ArrayBuffer(4));

function float32FromWord(value) {
  FLOAT_WORD.setUint32(0, requireUnsignedWord(value, "native float word"), true);
  return FLOAT_WORD.getFloat32(0, true);
}

function squaredFloat32Distance(leftWords, rightWords) {
  const deltas = leftWords.map((word, index) => Math.fround(
    float32FromWord(word) - float32FromWord(rightWords[index]),
  ));
  return Math.fround(Math.fround(
    Math.fround(deltas[0] * deltas[0])
      + Math.fround(deltas[1] * deltas[1]),
  ) + Math.fround(deltas[2] * deltas[2]));
}

export class NativeInteractionManagerState {
  constructor() {
    this.clear();
  }

  clear() {
    this.identity = null;
    this.descriptorSequences = null;
    this.indirectRecordKeys = null;
    this.indirectRecordVectors = null;
    this.runtimeSlots = null;
    this.revision = 0;
  }

  configure({ id = null, descriptorSequences, indirectRecords } = {}) {
    if (!Array.isArray(descriptorSequences) || !Array.isArray(indirectRecords)) {
      throw new TypeError(
        "native interaction manager requires descriptor sequences and records",
      );
    }
    const records = new Map();
    for (const record of indirectRecords) {
      const index = requireIndex(record?.index, "native indirect-record index");
      const key = requireUnsignedWord(record?.key, "native indirect-record key");
      if (!Array.isArray(record?.vectorWords) || record.vectorWords.length !== 3) {
        throw new TypeError("native indirect record requires three vector words");
      }
      const vectorWords = record.vectorWords.map(word => (
        requireUnsignedWord(word, "native indirect-record vector word")
      ));
      if (records.has(index)) {
        throw new Error(`duplicate native indirect-record index ${index}`);
      }
      records.set(index, { key, vectorWords });
    }
    const sequences = descriptorSequences.map((sequence, descriptorIndex) => {
      if (!Array.isArray(sequence)) {
        throw new TypeError(
          `native descriptor ${descriptorIndex} sequence must be an array`,
        );
      }
      return sequence.map(value => {
        const index = requireIndex(value, "native indirect sequence index");
        if (!records.has(index)) {
          throw new Error(
            `native descriptor ${descriptorIndex} references missing record ${index}`,
          );
        }
        return index;
      });
    });
    this.identity = id === null ? null : String(id);
    this.descriptorSequences = sequences;
    this.indirectRecordKeys = records;
    this.indirectRecordVectors = new Map(
      [...records].map(([index, record]) => [index, record.vectorWords]),
    );
    this.runtimeSlots = Array.from({ length: 16 }, () => ({
      words: [0, 0, 0, -3, 0, 0],
    }));
    this.revision += 1;
    return this.readConfiguration();
  }

  isConfigured() {
    return this.descriptorSequences !== null;
  }

  queryIndirectIndex(descriptorIndex, key) {
    if (!this.isConfigured()) return undefined;
    const index = requireIndex(
      descriptorIndex,
      "native interaction descriptor index",
    );
    const requestedKey = requireUnsignedWord(key, "native interaction lookup key");
    const sequence = this.descriptorSequences[index];
    if (!sequence) return -1;
    for (const recordIndex of sequence) {
      if (this.indirectRecordKeys.get(recordIndex)?.key === requestedKey) {
        return recordIndex;
      }
    }
    return -1;
  }

  queryNearestDescriptorIndex(targetWords, key = 2) {
    if (!this.isConfigured()) return undefined;
    if (!Array.isArray(targetWords) || targetWords.length !== 3) {
      throw new TypeError("native interaction target requires three float words");
    }
    const target = targetWords.map(word => requireUnsignedWord(
      word,
      "native interaction target word",
    ));
    const requestedKey = requireUnsignedWord(key, "native interaction lookup key");
    let nearestIndex = -1;
    let nearestDistance = Infinity;
    for (let descriptorIndex = 0;
      descriptorIndex < this.descriptorSequences.length;
      descriptorIndex += 1) {
      const recordIndex = this.queryIndirectIndex(descriptorIndex, requestedKey);
      if (recordIndex < 0) continue;
      const vector = this.indirectRecordVectors.get(recordIndex);
      if (!vector) continue;
      const distance = squaredFloat32Distance(vector, target);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = descriptorIndex;
      }
    }
    return nearestIndex;
  }

  allocateRuntimeSlot(firstWord, secondWord) {
    if (!this.isConfigured()) return undefined;
    if (!Number.isInteger(firstWord) || !Number.isInteger(secondWord)) {
      throw new TypeError("native interaction runtime-slot words must be integers");
    }
    const index = this.runtimeSlots.findIndex(slot => slot.words[3] === -3);
    if (index < 0) return -1;
    this.runtimeSlots[index] = {
      words: [
        secondWord,
        firstWord,
        0,
        2,
        0,
        5,
      ],
    };
    this.revision += 1;
    return index;
  }

  consumeRuntimeSlotStatus(index) {
    if (!this.isConfigured()) return undefined;
    const slotIndex = requireIndex(index, "native interaction runtime-slot index");
    const slot = this.runtimeSlots[slotIndex];
    if (!slot) return undefined;
    const status = slot.words[3] | 0;
    slot.words[5] = 0;
    this.revision += 1;
    return status >= -2 && status <= 2 ? status : -1;
  }

  readRuntimeSlots() {
    if (!this.isConfigured()) return null;
    return this.runtimeSlots.map(slot => ({ words: [...slot.words] }));
  }

  readConfiguration() {
    if (!this.isConfigured()) return null;
    return {
      id: this.identity,
      descriptorSequences: this.descriptorSequences.map(sequence => [...sequence]),
      indirectRecords: [...this.indirectRecordKeys]
        .sort(([left], [right]) => left - right)
        .map(([index, record]) => ({
          index,
          key: record.key,
          vectorWords: [...record.vectorWords],
        })),
    };
  }
}

export function createNativeInteractionManagerState() {
  return new NativeInteractionManagerState();
}
