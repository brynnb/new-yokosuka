import { decodeHalfFloat } from "./MotnLoader.js";

const RECORD_SIZE = 0x20;
const CHANNELS = Object.freeze([
  ["rx", 0x08, 0x0a, value => (value << 16 >> 16) * Math.PI * 2 / 0x10000],
  ["ry", 0x0c, 0x0e, value => (value << 16 >> 16) * Math.PI * 2 / 0x10000],
  ["rz", 0x10, 0x12, value => (value << 16 >> 16) * Math.PI * 2 / 0x10000],
  ["tx", 0x14, 0x16, decodeHalfFloat],
  ["ty", 0x18, 0x1a, decodeHalfFloat],
  ["tz", 0x1c, 0x1e, decodeHalfFloat],
]);

function viewOf(input) {
  if (input instanceof ArrayBuffer) return new DataView(input);
  if (ArrayBuffer.isView(input)) {
    return new DataView(input.buffer, input.byteOffset, input.byteLength);
  }
  throw new TypeError("TMNM input must be binary data");
}

function uint32(view, offset, label) {
  if (offset < 0 || offset + 4 > view.byteLength) {
    throw new Error(`TMNM ${label} is out of range`);
  }
  return view.getUint32(offset, true);
}

function stringAt(view, offset) {
  let result = "";
  while (offset < view.byteLength) {
    const value = view.getUint8(offset++);
    if (value === 0) return result;
    if (value < 0x20 || value > 0x7e) throw new Error("TMNM name is not ASCII");
    result += String.fromCharCode(value);
  }
  throw new Error("TMNM name is unterminated");
}

function channel(view, sequenceOffset, recordOffset, pointerField, valueField, decode) {
  const pointer = view.getUint16(recordOffset + pointerField, true);
  if (pointer === 0) {
    return Object.freeze({ constant: decode(view.getUint16(recordOffset + valueField, true)) });
  }
  return Object.freeze({ pointer: sequenceOffset + pointer, decode });
}

function playbackKind(name) {
  // LP is the native motion-name token for a looping state. Other TMNM
  // resources are one-shot transitions whose final pose remains selected.
  return /(?:^|_)LP(?:_|$)/.test(name) ? "loop" : "transition";
}

/** Exact parser for the node-oriented MOTN stream consumed by the TMNM route. */
export function parseTmnmMotion(input) {
  const view = viewOf(input);
  const indexOffset = uint32(view, 0, "index offset");
  const namesOffset = uint32(view, 4, "name-table offset");
  const dataOffset = uint32(view, 8, "data offset");
  const sequenceCount = view.getUint8(12) - 1;
  const declaredSize = uint32(view, 16, "declared size");
  if (sequenceCount <= 0 || declaredSize !== view.byteLength) {
    throw new Error("TMNM header is invalid");
  }
  const sequences = [];
  for (let index = 0; index < sequenceCount; index += 1) {
    const sequenceOffset = dataOffset + uint32(view, indexOffset + index * 8, "sequence offset");
    const name = stringAt(view, uint32(view, namesOffset + index * 4, "name offset"));
    const durationFrames = view.getUint16(sequenceOffset, true);
    const family = view.getUint16(sequenceOffset + 2, true);
    const nodeCount = view.getUint16(sequenceOffset + 8, true);
    if (family !== 0xffff || nodeCount <= 0 || sequenceOffset + 12 + nodeCount * RECORD_SIZE > view.byteLength) {
      throw new Error(`TMNM sequence ${index} has an invalid node stream`);
    }
    const nodes = [];
    for (let nodeIndex = 0; nodeIndex < nodeCount; nodeIndex += 1) {
      const recordOffset = sequenceOffset + 12 + nodeIndex * RECORD_SIZE;
      const scalePointer = view.getUint16(recordOffset, true);
      nodes.push(Object.freeze({
        scale: scalePointer === 0
          ? Object.freeze({ constants: [2, 4, 6].map(offset => (
              decodeHalfFloat(view.getUint16(recordOffset + offset, true))
            )) })
          : Object.freeze({ pointer: sequenceOffset + scalePointer }),
        ...Object.fromEntries(CHANNELS.map(
        ([key, pointer, value, decode]) => [
          key,
          channel(view, sequenceOffset, recordOffset, pointer, value, decode),
        ],
        )),
      }));
    }
    sequences.push(Object.freeze({
      index,
      name,
      playbackKind: playbackKind(name),
      durationFrames,
      nodeCount,
      nodes,
    }));
  }
  return Object.freeze({ view, sequences: Object.freeze(sequences) });
}

function sampleChannel(motion, channel, frame) {
  if ("constant" in channel) return channel.constant;
  const clamped = Math.max(0, Math.floor(frame));
  const offset = channel.pointer + clamped * 2;
  if (offset + 2 > motion.view.byteLength) throw new Error("TMNM curve exceeds its bank");
  const first = channel.decode(motion.view.getUint16(offset, true));
  const fraction = frame - clamped;
  if (fraction === 0) return first;
  if (offset + 4 > motion.view.byteLength) return first;
  const second = channel.decode(motion.view.getUint16(offset + 2, true));
  return first + (second - first) * fraction;
}

export function sampleTmnmSequence(motion, sequence, frame) {
  const sampledFrame = Math.max(0, Math.min(sequence.durationFrames, frame));
  return sequence.nodes.map((node) => {
    const baseFrame = Math.floor(sampledFrame);
    const fraction = sampledFrame - baseFrame;
    const sampleScale = (frameValue, axis) => node.scale.constants
      ? node.scale.constants[axis]
      : decodeHalfFloat(motion.view.getUint16(node.scale.pointer + frameValue * 6 + axis * 2, true));
    const scale = [0, 1, 2].map((axis) => {
      const first = sampleScale(baseFrame, axis);
      if (fraction === 0) return first;
      const second = sampleScale(Math.min(sequence.durationFrames, baseFrame + 1), axis);
      return first + (second - first) * fraction;
    });
    return Object.freeze({
      sx: scale[0], sy: scale[1], sz: scale[2],
      ...Object.fromEntries(Object.entries(node)
        .filter(([key]) => key !== "scale")
        .map(([key, value]) => [key, sampleChannel(motion, value, sampledFrame)])),
    });
  });
}
