export const OPERATION_22_CANDIDATE_BYTE_LENGTH = 16;

function hexWord(value) {
  return `0x${value.toString(16).padStart(8, "0")}`;
}

export function decodeOperation22MotionCandidates(
  data,
  startOffset,
  endOffset,
  addressAt,
) {
  const candidates = [];
  let cursor = startOffset;
  let terminator = null;
  let decodeError = null;

  while (cursor + 4 <= endOffset) {
    const motionWord = data.readUInt32LE(cursor);
    if (motionWord === 0xffffffff) {
      terminator = {
        address: addressAt(cursor),
        value: "0xffffffff",
        byteLength: 4,
      };
      break;
    }
    if (cursor + OPERATION_22_CANDIDATE_BYTE_LENGTH > endOffset) {
      decodeError = "motion candidate extends beyond owned program";
      break;
    }
    candidates.push({
      recordIndex: candidates.length,
      address: addressAt(cursor),
      byteLength: OPERATION_22_CANDIDATE_BYTE_LENGTH,
      motionStateId: data.readUInt16LE(cursor),
      motionWord: hexWord(motionWord),
      motionControlFloat: data.readFloatLE(cursor + 4),
      motionControlFlags: hexWord(data.readUInt32LE(cursor + 8)),
      selectionAdvanceControl: data.readUInt32LE(cursor + 12),
      rawBytes: data.subarray(
        cursor,
        cursor + OPERATION_22_CANDIDATE_BYTE_LENGTH,
      ).toString("hex"),
    });
    cursor += OPERATION_22_CANDIDATE_BYTE_LENGTH;
  }

  if (!decodeError && !terminator) {
    decodeError = "motion candidate array lacks an owned sentinel";
  }

  const uniqueMotionStateIds = [...new Set(
    candidates.map((candidate) => candidate.motionStateId),
  )].sort((left, right) => left - right);
  return {
    candidates,
    terminator,
    exactBoundary: decodeError === null,
    decodeError,
    candidateStrideBytes: OPERATION_22_CANDIDATE_BYTE_LENGTH,
    uniqueMotionStateIds,
    deterministicMotionStateId:
      uniqueMotionStateIds.length === 1 ? uniqueMotionStateIds[0] : null,
    motionStateSelectionStatus: uniqueMotionStateIds.length === 1
      ? "RNG-independent unanimous numeric motion state"
      : "native random candidate motion state",
  };
}
