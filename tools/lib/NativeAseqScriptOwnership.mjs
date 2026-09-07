const GENERATED_FUNCTION_PROLOGUE = Object.freeze([
  0x2de6, // mov.l r14,@-r13
  0x4d22, // sts.l pr,@-r13
]);

function offsetHex(value) {
  return `0x${value.toString(16)}`;
}

function requireBytes(bytes) {
  if (
    !bytes
    || typeof bytes.length !== "number"
    || typeof bytes.readUInt16LE !== "function"
    || typeof bytes.readUInt32LE !== "function"
  ) {
    throw new TypeError("native ASEQ ownership requires a Node.js byte buffer");
  }
  return bytes;
}

function requireOffset(bytes, value, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value + 2 > bytes.length) {
    throw new RangeError(`${label} is outside the native program`);
  }
  return value;
}

function signedByte(value) {
  return value < 0x80 ? value : value - 0x100;
}

function pcRelativeLong(bytes, instructionOffset, register) {
  const instruction = bytes.readUInt16LE(instructionOffset);
  if ((instruction & 0xff00) !== (0xd000 | (register << 8))) {
    throw new Error(
      `expected a PC-relative r${register} load at ${offsetHex(instructionOffset)}`,
    );
  }
  const literalOffset = ((instructionOffset + 4) & ~3) + (instruction & 0xff) * 4;
  if (literalOffset < 0 || literalOffset + 4 > bytes.length) {
    throw new Error(
      `PC-relative load at ${offsetHex(instructionOffset)} leaves the native program`,
    );
  }
  return {
    literalOffset,
    value: bytes.readUInt32LE(literalOffset),
  };
}

function isGeneratedFunctionPrologue(bytes, offset) {
  return (
    offset >= 0
    && offset + 8 <= bytes.length
    && bytes.readUInt16LE(offset) === GENERATED_FUNCTION_PROLOGUE[0]
    && bytes.readUInt16LE(offset + 2) === GENERATED_FUNCTION_PROLOGUE[1]
    && (bytes.readUInt16LE(offset + 4) & 0xff00) === 0x7d00
    && bytes.readUInt16LE(offset + 6) === 0x6ed3
  );
}

export function nativeAseqGeneratedFunctionBounds(bytesValue, functionOffsetValue) {
  const bytes = requireBytes(bytesValue);
  const functionOffset = requireOffset(bytes, functionOffsetValue, "native function offset");
  if (!isGeneratedFunctionPrologue(bytes, functionOffset)) {
    throw new Error(
      `native ASEQ function ${offsetHex(functionOffset)} has no generated SH-4 prologue`,
    );
  }
  let functionEndOffset = bytes.length;
  for (let offset = functionOffset + 2; offset + 8 <= bytes.length; offset += 2) {
    if (isGeneratedFunctionPrologue(bytes, offset)) {
      functionEndOffset = offset;
      break;
    }
  }
  return Object.freeze({ functionOffset, functionEndOffset });
}

export function nativeAseqGoverningActivityFrame(
  bytesValue,
  functionOffsetValue,
  callFileOffsetValue,
) {
  const bytes = requireBytes(bytesValue);
  const callFileOffset = requireOffset(bytes, callFileOffsetValue, "native call offset");
  const { functionOffset, functionEndOffset } = nativeAseqGeneratedFunctionBounds(
    bytes,
    functionOffsetValue,
  );
  if (callFileOffset < functionOffset || callFileOffset >= functionEndOffset) {
    throw new Error(
      `native call ${offsetHex(callFileOffset)} is outside function `
      + `${offsetHex(functionOffset)}..${offsetHex(functionEndOffset)}`,
    );
  }

  const candidates = [];
  for (
    let offset = functionOffset;
    offset < callFileOffset && offset + 18 <= functionEndOffset;
    offset += 2
  ) {
    if (
      (bytes.readUInt16LE(offset) & 0xfff0) !== 0x54e0
      || bytes.readUInt16LE(offset + 4) !== 0x3450
      || bytes.readUInt16LE(offset + 6) !== 0x344a
      || bytes.readUInt16LE(offset + 8) !== 0x6043
      || bytes.readUInt16LE(offset + 10) !== 0x8800
    ) continue;
    const frameInstruction = bytes.readUInt16LE(offset + 2);
    let frame = null;
    if ((frameInstruction & 0xff00) === 0xe500) {
      frame = signedByte(frameInstruction & 0xff);
    } else if ((frameInstruction & 0xff00) === 0xd500) {
      frame = pcRelativeLong(bytes, offset + 2, 5).value;
    }
    const branch = bytes.readUInt16LE(offset + 12);
    const blockStart = (
      (branch & 0xff00) === 0x8b00
      || (branch & 0xff00) === 0x8900
    ) ? offset + 16 + signedByte(branch & 0xff) * 2 : null;
    const skipLoad = bytes.readUInt16LE(offset + 14);
    const blockEnd = (
      (skipLoad & 0xff00) === 0xd100
      && bytes.readUInt16LE(offset + 16) === 0x0123
    ) ? offset + 20 + (pcRelativeLong(bytes, offset + 14, 1).value | 0) : null;
    if (
      Number.isInteger(frame)
      && Number.isInteger(blockStart)
      && Number.isInteger(blockEnd)
      && blockStart <= callFileOffset
      && callFileOffset < blockEnd
      && blockEnd <= functionEndOffset
    ) candidates.push({ offset, frame });
  }
  const result = candidates.at(-1);
  if (!result || result.frame < 0) {
    throw new Error(
      `native call ${offsetHex(callFileOffset)} has no governing ASEQ frame`,
    );
  }
  return result.frame;
}

export function nativeAseqGoverningActivityRange(
  bytesValue,
  functionOffsetValue,
  callFileOffsetValue,
) {
  const bytes = requireBytes(bytesValue);
  const callFileOffset = requireOffset(bytes, callFileOffsetValue, "native call offset");
  const { functionOffset, functionEndOffset } = nativeAseqGeneratedFunctionBounds(
    bytes,
    functionOffsetValue,
  );
  const candidates = [];
  for (
    let offset = functionOffset;
    offset < callFileOffset && offset + 32 <= functionEndOffset;
    offset += 2
  ) {
    if (
      bytes.readUInt16LE(offset) !== 0xe044
      || bytes.readUInt16LE(offset + 2) !== 0x04ee
      || (bytes.readUInt16LE(offset + 4) & 0xff00) !== 0xd500
      || bytes.readUInt16LE(offset + 6) !== 0x3457
      || bytes.readUInt16LE(offset + 8) !== 0x344a
      || bytes.readUInt16LE(offset + 10) !== 0xe044
      || bytes.readUInt16LE(offset + 12) !== 0x05ee
      || (bytes.readUInt16LE(offset + 14) & 0xff00) !== 0xd600
      || bytes.readUInt16LE(offset + 16) !== 0x3657
      || bytes.readUInt16LE(offset + 18) !== 0x355a
      || bytes.readUInt16LE(offset + 20) !== 0x2459
      || bytes.readUInt16LE(offset + 22) !== 0x6043
      || bytes.readUInt16LE(offset + 24) !== 0x8800
    ) continue;
    const branch = bytes.readUInt16LE(offset + 26);
    const skipLoad = bytes.readUInt16LE(offset + 28);
    if (
      (branch & 0xff00) !== 0x8b00
      || (skipLoad & 0xff00) !== 0xd100
      || bytes.readUInt16LE(offset + 30) !== 0x0123
    ) continue;
    const blockStart = offset + 30 + signedByte(branch & 0xff) * 2;
    const blockEnd = offset + 34 + (pcRelativeLong(bytes, offset + 28, 1).value | 0);
    if (
      blockStart <= callFileOffset
      && callFileOffset < blockEnd
      && blockEnd <= functionEndOffset
    ) candidates.push({
      offset,
      firstFrame: pcRelativeLong(bytes, offset + 4, 5).value + 1,
      lastFrame: pcRelativeLong(bytes, offset + 14, 6).value - 1,
    });
  }
  const result = candidates.at(-1);
  if (
    !result
    || result.firstFrame < 0
    || result.lastFrame < result.firstFrame
  ) throw new Error(
    `native call ${offsetHex(callFileOffset)} has no governing ASEQ range`,
  );
  return Object.freeze({
    firstFrame: result.firstFrame,
    lastFrame: result.lastFrame,
  });
}

export function deriveNativeAseqCallOwnership({
  bytes: bytesValue,
  trackFunctions,
  callFileOffset: callFileOffsetValue,
} = {}) {
  const bytes = requireBytes(bytesValue);
  const callFileOffset = requireOffset(bytes, callFileOffsetValue, "native call offset");
  if (!Array.isArray(trackFunctions) || trackFunctions.length === 0) {
    throw new TypeError("native ASEQ ownership requires track functions");
  }

  const owners = [];
  const seenTracks = new Set();
  const seenFunctions = new Set();
  for (const entry of trackFunctions) {
    if (!Number.isSafeInteger(entry?.trackIndex) || entry.trackIndex < 0) {
      throw new TypeError("native ASEQ track index must be non-negative");
    }
    if (seenTracks.has(entry.trackIndex)) {
      throw new Error(`native ASEQ track ${entry.trackIndex} has duplicate functions`);
    }
    seenTracks.add(entry.trackIndex);
    if (!Number.isSafeInteger(entry.functionOffset)) continue;
    if (seenFunctions.has(entry.functionOffset)) {
      throw new Error(
        `native ASEQ function ${offsetHex(entry.functionOffset)} has duplicate tracks`,
      );
    }
    seenFunctions.add(entry.functionOffset);
    const bounds = nativeAseqGeneratedFunctionBounds(bytes, entry.functionOffset);
    if (
      bounds.functionOffset <= callFileOffset
      && callFileOffset < bounds.functionEndOffset
    ) owners.push({ trackIndex: entry.trackIndex, ...bounds });
  }
  if (owners.length !== 1) {
    throw new Error(
      `native call ${offsetHex(callFileOffset)} expected one ASEQ track owner; `
      + `found ${owners.length}`,
    );
  }
  const owner = owners[0];
  return Object.freeze({
    trackIndex: owner.trackIndex,
    frame: nativeAseqGoverningActivityFrame(
      bytes,
      owner.functionOffset,
      callFileOffset,
    ),
    functionOffset: owner.functionOffset,
    functionEndOffset: owner.functionEndOffset,
  });
}
