function bytesFrom(source) {
  if (source instanceof Uint8Array) return source;
  if (source instanceof ArrayBuffer) return new Uint8Array(source);
  if (ArrayBuffer.isView(source)) {
    return new Uint8Array(
      source.buffer,
      source.byteOffset,
      source.byteLength,
    );
  }
  throw new TypeError("FIGHT bytecode source must be an ArrayBuffer view.");
}

function hexadecimal(bytes) {
  return [...bytes]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

const ACTION_OPCODE_SIZE = Object.freeze(new Map([
  [0x05, 8],
  [0x06, 8],
  [0x07, 8],
  [0x08, 8],
  [0x09, 8],
  [0x0a, 8],
  [0x0b, 8],
  [0x0c, 8],
  [0x0e, 8],
  [0x13, 8],
  [0x15, 8],
  [0x1a, 8],
  [0x1b, 8],
  [0x1c, 8],
  [0x22, 8],
  [0x23, 8],
  [0x24, 8],
  [0x28, 8],
  [0x29, 8],
  [0x2a, 8],
  [0x32, 8],
  [0x36, 8],
  [0x39, 8],
  [0x3a, 8],
  [0x3b, 8],
  [0x3e, 8],
  [0x40, 8],
  [0x45, 8],
  [0x48, 8],
  [0x49, 8],
  [0x4c, 8],
  [0x4d, 8],
  [0x50, 8],
  [0x51, 8],
  [0x52, 8],
  [0x53, 8],
  [0x59, 8],
  [0x5a, 8],
]));

function fightView(source) {
  const bytes = bytesFrom(source);
  return {
    bytes,
    view: new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    ),
  };
}

// Conservatively executes one straight-line EN_RYOU action continuation.
// 0x0e selects the hand/leg branch, 0x0d installs the address resumed after
// the requested motion, and 0x05 installs that motion. Opcode 0x0f pushes an
// alternate/fallback continuation frame but does not redirect the current
// script pointer; the first command-matcher path therefore continues at +4.
export function traceFightActionPath(source, {
  startFileOffset,
  selector,
  scriptOffset = 0x14,
  commandOffset = null,
  maximumInstructions = 128,
} = {}) {
  const { bytes, view } = fightView(source);
  const scriptEnd = commandOffset ?? view.getUint32(8, false);
  let fileOffset = startFileOffset;
  let continuationFileOffset = null;
  const fallbackContinuationFileOffsets = [];
  const instructions = [];
  for (let index = 0; index < maximumInstructions; index += 1) {
    if (
      !Number.isInteger(fileOffset)
      || fileOffset < scriptOffset
      || fileOffset + 4 > scriptEnd
    ) {
      return {
        startFileOffset,
        selector,
        continuationFileOffset,
        fallbackContinuationFileOffsets,
        instructions,
        terminal: null,
        stopped: "outside-script",
        stoppedFileOffset: fileOffset,
      };
    }
    const opcode = bytes[fileOffset];
    const instruction = {
      fileOffset,
      scriptRelativeOffset: fileOffset - scriptOffset,
      opcode,
    };
    instructions.push(instruction);
    if (opcode === 0x0e) {
      const comparedSelector = view.getUint16(fileOffset + 2, false);
      const targetOffset = view.getUint16(fileOffset + 4, false);
      const targetFileOffset = scriptOffset + targetOffset;
      const taken = comparedSelector === selector;
      Object.assign(instruction, {
        comparedSelector,
        targetOffset,
        targetFileOffset,
        taken,
      });
      fileOffset = taken ? targetFileOffset : fileOffset + 8;
      continue;
    }
    if (opcode === 0x0d) {
      const targetOffset = view.getUint16(fileOffset + 2, false);
      continuationFileOffset = scriptOffset + targetOffset;
      Object.assign(instruction, {
        targetOffset,
        targetFileOffset: continuationFileOffset,
      });
      fileOffset += 4;
      continue;
    }
    if (opcode === 0x05) {
      const rawRequest = view.getUint32(fileOffset + 4, false);
      const encodedMotionId = rawRequest & 0xffff;
      const motionId = encodedMotionId & 0x7fff;
      return {
        startFileOffset,
        selector,
        continuationFileOffset,
        fallbackContinuationFileOffsets,
        instructions,
        terminal: {
          fileOffset,
          scriptRelativeOffset: fileOffset - scriptOffset,
          rawRequest,
          requestFlags: rawRequest >>> 16,
          motionIdFlags: encodedMotionId & 0x8000,
          encodedMotionId,
          motionId,
          sequenceIndex: motionId - 1,
        },
        stopped: "motion-request",
        stoppedFileOffset: fileOffset,
      };
    }
    if (opcode === 0x0f) {
      const targetOffset = view.getUint16(fileOffset + 2, false);
      const targetFileOffset = scriptOffset + targetOffset;
      fallbackContinuationFileOffsets.push(targetFileOffset);
      Object.assign(instruction, {
        targetOffset,
        targetFileOffset,
      });
      fileOffset += 4;
      continue;
    }
    if (opcode === 0x48) {
      // The native handler builds the current command mask from bytes +2/+3,
      // then passes the following halfword to its command-history matcher.
      // The final halfword is present in the eight-byte instruction but is
      // unused by the observed handler.
      Object.assign(instruction, {
        requiredInputMask: view.getUint16(fileOffset + 2, false),
        historyMatchParameter: view.getUint16(fileOffset + 4, false),
        reserved: view.getUint16(fileOffset + 6, false),
      });
      fileOffset += 8;
      continue;
    }
    if (opcode === 0x10) {
      return {
        startFileOffset,
        selector,
        continuationFileOffset,
        fallbackContinuationFileOffsets,
        instructions,
        terminal: null,
        stopped: "path-end",
        stoppedFileOffset: fileOffset,
      };
    }
    fileOffset += ACTION_OPCODE_SIZE.get(opcode) || 4;
  }
  return {
    startFileOffset,
    selector,
    continuationFileOffset,
    fallbackContinuationFileOffsets,
    instructions,
    terminal: null,
    stopped: "instruction-limit",
    stoppedFileOffset: fileOffset,
  };
}

export function parseFightBytecode(source, {
  maximumRegisteredMotionId = 0x0617,
} = {}) {
  const bytes = bytesFrom(source);
  if (bytes.byteLength < 20) {
    throw new Error("FIGHT bytecode is shorter than its 20-byte header.");
  }
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  );
  const uint16 = (offset) => view.getUint16(offset, false);
  const uint32 = (offset) => view.getUint32(offset, false);
  const fighterKind = uint32(0);
  const sectionOffsets = [4, 8, 12, 16].map(uint32);
  const [scriptOffset, commandOffset, metadataOffset, trailingOffset] =
    sectionOffsets;
  const boundaries = [20, ...sectionOffsets, bytes.byteLength];
  for (let index = 1; index < boundaries.length; index += 1) {
    if (boundaries[index] < boundaries[index - 1]) {
      throw new Error("FIGHT section offsets are not monotonically ordered.");
    }
  }
  if (trailingOffset > bytes.byteLength) {
    throw new Error("FIGHT section offset extends beyond the source file.");
  }
  if (bytes[scriptOffset] !== 0x47) {
    throw new Error("FIGHT script does not begin with opcode 0x47.");
  }

  const entrySelector = bytes[scriptOffset + 1];
  const entryBranches = [];
  let entryCursor = scriptOffset + 4;
  while (
    entryCursor + 8 <= commandOffset
    && bytes[entryCursor] === 0x0e
  ) {
    const selector = uint16(entryCursor + 2);
    const targetOffset = uint16(entryCursor + 4);
    entryBranches.push({
      fileOffset: entryCursor,
      scriptRelativeOffset: entryCursor - scriptOffset,
      selector,
      targetOffset,
      targetFileOffset: scriptOffset + targetOffset,
    });
    entryCursor += 8;
  }

  // Opcode 0x05 consumes the following big-endian request word. Its low
  // 15 bits are the one-based registered motion ID. Bit 15 is an additional
  // motion-request flag (observed as 0x8364 for motion 0x0364); the high
  // 16-bit word carries separate flags such as 0x1000 for alternate installs.
  const motionRequests = [];
  for (let offset = scriptOffset; offset + 8 <= commandOffset; offset += 4) {
    if (bytes[offset] !== 0x05) continue;
    // Every instruction is four-byte aligned, but several opcodes consume a
    // second word. Do not reinterpret a 0x05 byte inside that payload as a
    // new motion request. EN_RYOU file 0x055c is the concrete trap: it is the
    // high byte of opcode 0x0e's target word, not an instruction boundary.
    const previousOpcode = offset >= scriptOffset + 4
      ? bytes[offset - 4]
      : null;
    if (ACTION_OPCODE_SIZE.get(previousOpcode) === 8) continue;
    const rawRequest = uint32(offset + 4);
    const encodedMotionId = rawRequest & 0xffff;
    const motionId = encodedMotionId & 0x7fff;
    if (
      motionId === 0
      || motionId > maximumRegisteredMotionId
    ) {
      continue;
    }
    motionRequests.push({
      fileOffset: offset,
      scriptRelativeOffset: offset - scriptOffset,
      rawRequest,
      requestFlags: rawRequest >>> 16,
      motionIdFlags: encodedMotionId & 0x8000,
      encodedMotionId,
      motionId,
      sequenceIndex: motionId - 1,
    });
  }

  const commandBytes = metadataOffset - commandOffset;
  if (commandBytes < 4 || (commandBytes - 4) % 20 !== 0) {
    throw new Error(
      "FIGHT command section is not 20-byte records plus a terminator.",
    );
  }
  const terminatorOffset = metadataOffset - 4;
  if (
    bytes[terminatorOffset] !== 0x7f
    || uint32(terminatorOffset) !== 0x7f000000
  ) {
    throw new Error("FIGHT command section has no 0x7f terminator.");
  }
  const commandRecords = [];
  for (
    let offset = commandOffset;
    offset < terminatorOffset;
    offset += 20
  ) {
    commandRecords.push({
      index: commandRecords.length,
      fileOffset: offset,
      rawHex: hexadecimal(bytes.subarray(offset, offset + 20)),
      words: Array.from({ length: 5 }, (_, index) => (
        uint32(offset + index * 4)
      )),
    });
  }

  return {
    byteLength: bytes.byteLength,
    fighterKind,
    header: {
      byteLength: 20,
      sectionOffsets,
      scriptOffset,
      commandOffset,
      metadataOffset,
      trailingOffset,
    },
    sections: {
      script: {
        offset: scriptOffset,
        byteLength: commandOffset - scriptOffset,
      },
      commands: {
        offset: commandOffset,
        byteLength: metadataOffset - commandOffset,
        recordSize: 20,
        terminatorOffset,
      },
      metadata: {
        offset: metadataOffset,
        byteLength: trailingOffset - metadataOffset,
      },
      trailing: {
        offset: trailingOffset,
        byteLength: bytes.byteLength - trailingOffset,
      },
    },
    entryDispatch: {
      opcode: bytes[scriptOffset],
      selector: entrySelector,
      branches: entryBranches,
      firstBodyFileOffset: entryCursor,
    },
    motionRequests,
    commandRecords,
  };
}
