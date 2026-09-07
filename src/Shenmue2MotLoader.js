import { decodeHalfFloat } from "./MotnLoader.js";

const POSITION_CHANNELS = Object.freeze(["x", "y", "z"]);
const ROTATION_CHANNELS = Object.freeze(["rx", "ry", "rz"]);
const HUMANOID_CONTROLLER_COUNT = 22;
const CURVE_COUNT = (
  POSITION_CHANNELS.length
  + HUMANOID_CONTROLLER_COUNT * ROTATION_CHANNELS.length
);
const SEQUENCE_HEADER_SIZE = 0x4e;
const MOTION_FRAMES_PER_SECOND = 30;

// Native descriptor builder 0x8c0ef9a0 partitions ordinary 69-curve NPC
// motions as 27 / 9 / 9 / 12 / 12 curves. After the root XYZ triplet, every
// controller owns one rotation triplet, so slots 1..4 cover these exact
// controller ranges. Slot 0 supplies the root and first eight controllers;
// the actor system normally requests the base motion across all groups.
const NATIVE_CONTROLLER_INDICES_BY_SLOT = Object.freeze([
  Object.freeze(Array.from({ length: 8 }, (_, index) => index)),
  Object.freeze([8, 9, 10]),
  Object.freeze([11, 12, 13]),
  Object.freeze([14, 15, 16, 17]),
  Object.freeze([18, 19, 20, 21]),
]);

export function shenmue2MotionControllerIndicesForSlot(slot) {
  return NATIVE_CONTROLLER_INDICES_BY_SLOT[Number(slot)] || null;
}

const NATIVE_MOTION_BANKS = Object.freeze([
  { firstId: 0x8001, lastId: 0x8105, bank: "npc" },
  { firstId: 0x9101, lastId: 0x910a, bank: "npcWESM" },
  { firstId: 0x9301, lastId: 0x931a, bank: "npcKUN" },
  { firstId: 0x9601, lastId: 0x9604, bank: "npcSYE" },
  { firstId: 0x9701, lastId: 0x9706, bank: "npcWS00" },
  { firstId: 0x9801, lastId: 0x9809, bank: "npcJOY" },
  { firstId: 0x9901, lastId: 0x9908, bank: "npcANI1" },
  { firstId: 0xa101, lastId: 0xa101, bank: "npcWK00" },
  { firstId: 0xa301, lastId: 0xa303, bank: "npcWR00" },
  { firstId: 0xa401, lastId: 0xa403, bank: "npcWN00" },
  { firstId: 0xa501, lastId: 0xa506, bank: "npcWE00" },
  { firstId: 0xa701, lastId: 0xa702, bank: "npcAK00" },
  { firstId: 0xa801, lastId: 0xa806, bank: "npcWT00" },
  { firstId: 0xe001, lastId: 0xe3b7, bank: "npcTable" },
  { firstId: 0xf001, lastId: 0xf130, bank: "motion" },
]);

export const SHENMUE2_AREA_MOTION_BANK_FILES = Object.freeze({
  npcWESM: "NPC_WESM.MOT",
  npcKUN: "NPC_KUN.MOT",
  npcSYE: "NPC_SYE.MOT",
  npcWS00: "NPC_WS00.MOT",
  npcJOY: "NPC_JOY.MOT",
  npcANI1: "NPC_ANI1.MOT",
  npcWK00: "NPC_WK00.MOT",
  npcWR00: "NPC_WR00.MOT",
  npcWN00: "NPC_WN00.MOT",
  npcWE00: "NPC_WE00.MOT",
  npcAK00: "NPC_AK00.MOT",
  npcWT00: "NPC_WT00.MOT",
});

export function resolveShenmue2NativeMotionId(motionId) {
  const normalized = Number(motionId) & 0xffff;
  const range = NATIVE_MOTION_BANKS.find(
    ({ firstId, lastId }) => normalized >= firstId && normalized <= lastId,
  );
  if (!range) return null;
  return {
    motionId: normalized,
    bank: range.bank,
    sequenceIndex: normalized - range.firstId,
  };
}

export function shenmue2NpcTableMotionId(logicalCharacterIndex, slot = 0) {
  const index = Number(logicalCharacterIndex);
  const normalizedSlot = Number(slot);
  if (
    !Number.isInteger(index)
    || index < 0
    || !Number.isInteger(normalizedSlot)
    || normalizedSlot < 0
    || normalizedSlot >= 17
  ) return null;
  // NPC_TBL contains 17 contiguous, character-specific slots per HUMANS.IDX
  // logical character. Multiple encoded IDs alias these canonical slots; the
  // native resolver still indexes this table directly by encoded ID.
  const motionId = 0xe001 + index * 17 + normalizedSlot;
  return motionId <= 0xe3b7 ? motionId : null;
}

export function shenmue2NpcTableIdleMotionId(logicalCharacterIndex) {
  return shenmue2NpcTableMotionId(logicalCharacterIndex, 1);
}

// Xbox native functions 0x60ed3, 0x60ef0, and 0x60f0d select these IDs after
// 0x58b4c maps the model's IMGM body value to a motion-family index. Dreamcast
// MT7 stores that body value in the root node's 0x7001-based type. The generic
// HUMANS actor-code suffix is not this value: native captures prove, for
// example, that 00B_/CF1_L selects family 4 rather than suffix family 1.
const NPC_LOCOMOTION_MOTION_IDS = Object.freeze([
  0xf03e, 0xf0ff, 0xf07e, 0xf084,
  0xf09e, 0xf0d1, 0xf060, 0xf086,
  0xf005, 0xf078, 0xf058, 0xf084,
  0xf084, 0xf0a4, 0xf0a6, null,
]);

// Signed bytes at Xbox virtual address 0x4ec000, consumed by 0x58b4c after
// 0x813db reads IMGM payload +0x14. Values 0x11 and above are non-locomotion
// families; 0x60ed3 consequently falls back to 0xf084 for them.
const NPC_BODY_VALUE_TO_MOTION_FAMILY = Object.freeze([
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
  17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17,
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
  17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17,
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
  17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17,
  1,
]);
const NPC_ALTERNATE_LOCOMOTION_MOTION_IDS = Object.freeze([
  0xf006, 0xf006, 0xf006, 0xf0e6,
  0xf0e6, 0xf0e6, 0xf006, 0xf006,
  0xf006, 0xf006, 0xf006, 0xf006,
  0xf006, 0xf006, 0xf006, null,
]);
const NPC_LOCOMOTION_TRANSITION_MOTION_IDS = Object.freeze([
  0xf03f, 0xf05f, 0xf07f, 0xf057,
  0xf09f, 0xf0d2, 0xf061, 0xf087,
  null, 0xf079, 0xf059, 0xf0a8,
  0xf0a5, 0xf0a7, 0xf0ea, null,
]);

// Xbox function 0x612e4 selects the native standing motion from this table.
// Its three dimensions are model variant, actor motion subtype, and the
// age/variant category computed by 0x6129d. Keep this table distinct from the
// global MOTION.MOT locomotion-family selectors.
const NPC_PROFILE_IDLE_MOTION_IDS = Object.freeze([
  0xe108, 0x8036, 0xe108, 0x8036, 0xe108, 0xe380, 0xe381, 0xe381, 0xe380,
  0x800f, 0xe0f1, 0x8009, 0xe101, 0xe101, 0xe101, 0x801f, 0xe0df, 0xe0f2,
  0xe0e3, 0xe0e3, 0xe0e3, 0xe108, 0xe0f5, 0xe0f5, 0xe0e4, 0xe0e4, 0xe381,
  0xe0e3, 0xe0e3, 0xe0e3, 0xe0f5, 0xe0f5, 0xe0f5, 0xe0e4, 0xe0e4, 0xe0e4,
  0xe0f7, 0xe107, 0xe108, 0xe381, 0xe380, 0xe381, 0xe107, 0xe0f7, 0xe107,
  0xe101, 0xe101, 0xe0f2, 0xe0f0, 0xe0f0, 0xe0f0, 0xe0f6, 0xe0f6, 0xe0f6,
]);

export function shenmue2NpcProfileIdleMotionId(profile, modelVariant = 0) {
  const ageCategory = Number(profile?.ageCategory);
  const variant = Number(profile?.variant);
  const motionSubtype = Number(profile?.motionSubtype);
  const normalizedModelVariant = Number(modelVariant);
  if (
    !Number.isInteger(ageCategory)
    || !Number.isInteger(variant)
    || !Number.isInteger(motionSubtype)
    || motionSubtype < 0
    || motionSubtype > 2
    || !Number.isInteger(normalizedModelVariant)
    || normalizedModelVariant < 0
    || normalizedModelVariant > 2
  ) return null;

  let category = ageCategory < 13 ? 2 : (ageCategory > 55 ? 4 : 0);
  if (variant !== 0) category += 1;
  const index = normalizedModelVariant + 3 * motionSubtype + 9 * category;
  return NPC_PROFILE_IDLE_MOTION_IDS[index] ?? null;
}

export function shenmue2GenericNpcMotionFamily(actorCode) {
  const match = /^(?:0[0-9]|1[0-8])([A-H])_$/.exec(String(actorCode || ""));
  return match ? match[1].charCodeAt(0) - 0x41 : null;
}

export function shenmue2Mt7BodyValue(rootNodeId) {
  const type = Number(rootNodeId) & 0xffff;
  const bodyValue = type - 0x7001;
  return Number.isInteger(bodyValue)
    && bodyValue >= 0
    && bodyValue < NPC_BODY_VALUE_TO_MOTION_FAMILY.length
    ? bodyValue
    : null;
}

export function shenmue2Mt7MotionFamily(rootNodeId) {
  const bodyValue = shenmue2Mt7BodyValue(rootNodeId);
  return bodyValue === null
    ? null
    : NPC_BODY_VALUE_TO_MOTION_FAMILY[bodyValue];
}

export function shenmue2NpcLocomotionMotionId(
  actorCodeOrFamily,
  { alternate = false, transition = false } = {},
) {
  const family = Number.isInteger(actorCodeOrFamily)
    ? actorCodeOrFamily
    : shenmue2GenericNpcMotionFamily(actorCodeOrFamily);
  if (family === null || family < 0 || family >= 16) return null;
  const table = transition
    ? NPC_LOCOMOTION_TRANSITION_MOTION_IDS
    : (alternate
      ? NPC_ALTERNATE_LOCOMOTION_MOTION_IDS
      : NPC_LOCOMOTION_MOTION_IDS);
  return table[family] ?? null;
}

function exactArrayBuffer(input) {
  if (input instanceof ArrayBuffer) return input;
  if (ArrayBuffer.isView(input)) {
    return input.buffer.slice(
      input.byteOffset,
      input.byteOffset + input.byteLength,
    );
  }
  throw new TypeError("Shenmue II MOT input must be binary data.");
}

function cString(view, offset, limit = 96) {
  if (offset < 0 || offset >= view.byteLength) return "";
  let value = "";
  for (let cursor = offset; cursor < view.byteLength && value.length < limit; cursor += 1) {
    const byte = view.getUint8(cursor);
    if (byte === 0) break;
    if (byte < 0x20 || byte > 0x7e) return "";
    value += String.fromCharCode(byte);
  }
  return value;
}

function inferSequenceCount(view, nameTableOffset, attributes) {
  if (nameTableOffset + 4 <= view.byteLength) {
    const firstNameOffset = view.getUint32(nameTableOffset, true);
    const span = firstNameOffset - nameTableOffset;
    if (
      span > 0
      && span % 4 === 0
      && span / 4 <= 0x4000
      && cString(view, firstNameOffset)
    ) {
      return span / 4;
    }
  }
  return attributes & 0x0fff;
}

function sampleCurveRaw(curve, frame) {
  const samples = curve?.samples || [];
  if (!samples.length) return 0;
  if (frame <= samples[0].frame) return samples[0].value;
  if (frame >= samples.at(-1).frame) return samples.at(-1).value;

  let left = samples[0];
  let right = samples.at(-1);
  for (let index = 1; index < samples.length; index += 1) {
    if (frame <= samples[index].frame) {
      left = samples[index - 1];
      right = samples[index];
      break;
    }
  }
  const frameSpan = right.frame - left.frame;
  if (frameSpan <= 0) return right.value;
  const t = (frame - left.frame) / frameSpan;
  const t2 = t * t;
  const t3 = t2 * t;
  const seconds = frameSpan / MOTION_FRAMES_PER_SECOND;
  return (
    (2 * t3 - 3 * t2 + 1) * left.value
    + (t3 - 2 * t2 + t) * left.outgoingTangent * seconds
    + (-2 * t3 + 3 * t2) * right.value
    + (t3 - t2) * right.incomingTangent * seconds
  );
}

function sampleCurveDerivativeRaw(curve, frame) {
  const samples = curve?.samples || [];
  if (!samples.length) return 0;
  if (frame <= samples[0].frame) return samples[0].outgoingTangent;
  if (frame >= samples.at(-1).frame) return samples.at(-1).incomingTangent;

  let left = samples[0];
  let right = samples.at(-1);
  for (let index = 1; index < samples.length; index += 1) {
    if (frame <= samples[index].frame) {
      left = samples[index - 1];
      right = samples[index];
      break;
    }
  }
  const frameSpan = right.frame - left.frame;
  if (frameSpan <= 0) return right.incomingTangent;
  const t = (frame - left.frame) / frameSpan;
  const t2 = t * t;
  const seconds = frameSpan / MOTION_FRAMES_PER_SECOND;
  // Differentiate the same duration-scaled cubic Hermite basis used above.
  // MOT tangents are authored in units per second, so convert d/du back to
  // d/dseconds by dividing through the segment duration.
  return (
    (6 * t2 - 6 * t) * left.value
    + (3 * t2 - 4 * t + 1) * left.outgoingTangent * seconds
    + (-6 * t2 + 6 * t) * right.value
    + (3 * t2 - 2 * t) * right.incomingTangent * seconds
  ) / seconds;
}

function decodeCurveSample(view, cursor, end, frame) {
  if (cursor + 4 > end) return null;
  const valueWord = view.getUint16(cursor, true);
  const tangentWord = view.getUint16(cursor + 2, true);
  const hasSeparateOutgoingTangent = (valueWord & 1) !== 0;
  const byteLength = hasSeparateOutgoingTangent ? 6 : 4;
  if (cursor + byteLength > end) return null;
  const outgoingTangentWord = hasSeparateOutgoingTangent
    ? view.getUint16(cursor + 4, true)
    : tangentWord;
  const rawValue = decodeHalfFloat(valueWord);
  const rawIncomingTangent = decodeHalfFloat(tangentWord);
  const rawOutgoingTangent = decodeHalfFloat(outgoingTangentWord);
  if (![rawValue, rawIncomingTangent, rawOutgoingTangent].every(Number.isFinite)) {
    return null;
  }
  return {
    frame,
    timeSeconds: frame / MOTION_FRAMES_PER_SECOND,
    byteLength,
    valueWord,
    tangentWord,
    outgoingTangentWord,
    hasSeparateOutgoingTangent,
    rawValue,
    rawIncomingTangent,
    rawOutgoingTangent,
    value: rawValue,
    tangent: rawIncomingTangent,
    incomingTangent: rawIncomingTangent,
    outgoingTangent: rawOutgoingTangent,
  };
}

function parseCurve(view, start, interiorCount, terminalFrame, end) {
  let cursor = start;
  const startSample = decodeCurveSample(view, cursor, end, 0);
  if (!startSample) return null;
  cursor += startSample.byteLength;
  const interiorSamples = [];
  for (let keyIndex = 0; keyIndex < interiorCount; keyIndex += 1) {
    const sample = decodeCurveSample(view, cursor, end, 0);
    if (!sample) return null;
    cursor += sample.byteLength;
    if (cursor + 2 > end) return null;
    const frame = view.getUint16(cursor, true);
    cursor += 2;
    // The native reader consumes the authored count exactly and does not use
    // frame ordering to determine record width. Preserve unusual timing data
    // for diagnostics instead of rejecting an otherwise valid stream.
    sample.frame = frame;
    sample.timeSeconds = frame / MOTION_FRAMES_PER_SECOND;
    interiorSamples.push(sample);
  }
  const endSample = decodeCurveSample(
    view,
    cursor,
    end,
    Math.max(0, terminalFrame),
  );
  if (!endSample) return null;
  cursor += endSample.byteLength;
  return {
    end: cursor,
    samples: [startSample, ...interiorSamples, endSample],
  };
}

/**
 * Parses Shenmue II's compact .MOT stream. It is not the block-based MOTN
 * layout used by Shenmue I. Each sequence has 69 count bytes: XYZ translation
 * for the root controller, followed by XYZ rotation for 22 controllers. One
 * alignment byte precedes the Hermite curve payload. A
 * key stores [value, shared tangent], with bit zero of the value word selecting
 * an optional third half-float for a distinct outgoing tangent. Interior keys
 * are followed by a uint16 frame; the first and last key times are implicit.
 * The leading half-float in the sequence header is retained as metadata, but
 * does not multiply compact curve samples. Dreamcast curve builder
 * 0x8c1cda80 instead applies the runtime curve's independent scale and base
 * fields at +0x34/+0x38. Synchronized F086 curves have scale 1 and base 0,
 * and their evaluated values exactly match the unscaled half-floats.
 */
export class Shenmue2MotLoader {
  constructor(input) {
    this.buffer = exactArrayBuffer(input);
    this.view = new DataView(this.buffer);
  }

  static parse(input, options = {}) {
    return new Shenmue2MotLoader(input).parse(options);
  }

  static sampleCurve(curve, frame) {
    return sampleCurveRaw(curve, frame);
  }

  static sampleCurveDerivative(curve, frame) {
    return sampleCurveDerivativeRaw(curve, frame);
  }

  static evaluateSequence(sequence, frame) {
    const rootPosition = { x: 0, y: 0, z: 0 };
    const rotations = Array.from(
      { length: HUMANOID_CONTROLLER_COUNT },
      () => ({ rx: 0, ry: 0, rz: 0 }),
    );
    for (const curve of sequence?.curves || []) {
      const value = sampleCurveRaw(curve, frame);
      if (curve.kind === "rootPosition") {
        rootPosition[curve.channel] = value;
      } else {
        rotations[curve.controllerIndex][curve.channel] = value;
      }
    }
    return { rootPosition, rotations };
  }

  static evaluateSequenceDerivatives(sequence, frame) {
    const rootPosition = { x: 0, y: 0, z: 0 };
    const rotations = Array.from(
      { length: HUMANOID_CONTROLLER_COUNT },
      () => ({ rx: 0, ry: 0, rz: 0 }),
    );
    for (const curve of sequence?.curves || []) {
      const value = sampleCurveDerivativeRaw(curve, frame);
      if (curve.kind === "rootPosition") {
        rootPosition[curve.channel] = value;
      } else {
        rotations[curve.controllerIndex][curve.channel] = value;
      }
    }
    return { rootPosition, rotations };
  }

  parse({ sequenceIndices = null } = {}) {
    const view = this.view;
    if (view.byteLength < 0x20) throw new Error("Shenmue II MOT header is truncated.");
    const header = {
      sequenceTableOffset: view.getUint32(0, true),
      sequenceNameTableOffset: view.getUint32(4, true),
      sequenceDataOffset: view.getUint32(8, true),
      attributes: view.getUint32(12, true),
      fileSize: view.getUint32(16, true),
      motionIdLowerBound: view.getUint32(20, true) & 0xffff,
      motionIdUpperBound: view.getUint32(24, true) & 0xffff,
    };
    header.sequenceCount = inferSequenceCount(
      view,
      header.sequenceNameTableOffset,
      header.attributes,
    );
    if (
      header.sequenceTableOffset + header.sequenceCount * 8 > view.byteLength
      || header.sequenceNameTableOffset + header.sequenceCount * 4 > view.byteLength
    ) {
      throw new Error("Shenmue II MOT sequence tables exceed the file.");
    }

    const offsets = Array.from({ length: header.sequenceCount }, (_, index) => (
      header.sequenceDataOffset
      + view.getUint32(header.sequenceTableOffset + index * 8, true)
    ));
    const orderedOffsets = [...new Set(offsets)].sort((left, right) => left - right);
    const requested = sequenceIndices ? new Set(sequenceIndices) : null;
    const sequences = [];
    for (let index = 0; index < header.sequenceCount; index += 1) {
      if (requested && !requested.has(index)) continue;
      const dataOffset = offsets[index];
      const nextOffset = orderedOffsets.find((offset) => offset > dataOffset);
      const dataEnd = nextOffset || Math.min(header.fileSize || view.byteLength, view.byteLength);
      sequences.push(this.parseSequence(header, index, dataOffset, dataEnd));
    }
    return { format: "Shenmue2MOT", header, sequences };
  }

  parseSequence(header, index, dataOffset, dataEnd) {
    const view = this.view;
    const nameOffset = view.getUint32(header.sequenceNameTableOffset + index * 4, true);
    if (dataOffset < 0 || dataOffset + SEQUENCE_HEADER_SIZE > dataEnd) {
      return { index, dataOffset, dataEnd, valid: false };
    }
    const durationFrames = view.getUint16(dataOffset + 4, true);
    const countBytes = Array.from(
      new Uint8Array(this.buffer, dataOffset + 8, CURVE_COUNT),
    );
    const alignmentByte = view.getUint8(dataOffset + 8 + CURVE_COUNT);
    const scale = decodeHalfFloat(view.getUint16(dataOffset, true));
    let cursor = dataOffset + SEQUENCE_HEADER_SIZE;
    const curves = [];
    for (let curveIndex = 0; curveIndex < CURVE_COUNT; curveIndex += 1) {
      const interiorCount = countBytes[curveIndex];
      const start = cursor;
      const decoded = parseCurve(
        view,
        start,
        interiorCount,
        // The header stores a frame count, not the zero-based terminal frame.
        // FUN_8c1cda80 installs the final compact key at (count - 1) / 30.
        // Retained f03e runtime curves therefore end at 1.1 seconds for a
        // header count of 34. Treating 34 as the key index stretched every
        // Hermite segment and made native foot targets diverge near the end
        // of the walk cycle.
        Math.max(0, durationFrames - 1),
        dataEnd,
      );
      if (!decoded) {
        return {
          index,
          dataOffset,
          dataEnd,
          valid: false,
          error: `curve ${curveIndex} cannot be decoded`,
        };
      }
      cursor = decoded.end;
      const isRootPosition = curveIndex < POSITION_CHANNELS.length;
      const rotationCurveIndex = curveIndex - POSITION_CHANNELS.length;
      curves.push({
        curveIndex,
        kind: isRootPosition ? "rootPosition" : "rotation",
        controllerIndex: isRootPosition
          ? 0
          : Math.floor(rotationCurveIndex / ROTATION_CHANNELS.length),
        channel: isRootPosition
          ? POSITION_CHANNELS[curveIndex]
          : ROTATION_CHANNELS[rotationCurveIndex % ROTATION_CHANNELS.length],
        interiorCount,
        dataOffset: start,
        byteLength: cursor - start,
        samples: decoded.samples,
      });
    }
    return {
      index,
      name: cString(view, nameOffset),
      dataOffset,
      dataEnd,
      valid: true,
      scale,
      flags: view.getUint16(dataOffset + 2, true),
      durationFrames,
      curveDataOffset: dataOffset + SEQUENCE_HEADER_SIZE,
      curveDataEnd: cursor,
      trailingDataOffset: cursor,
      trailingByteLength: dataEnd - cursor,
      alignmentByte,
      countBytes,
      curves,
    };
  }
}

export const SHENMUE2_MOT_CURVE_COUNT = CURVE_COUNT;
export const SHENMUE2_MOT_NODE_COUNT = HUMANOID_CONTROLLER_COUNT;
export const SHENMUE2_MOT_CONTROLLER_COUNT = HUMANOID_CONTROLLER_COUNT;
