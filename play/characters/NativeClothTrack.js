const MAGIC = "NYCLTH01";
const VERSION = 2;
const HEADER_BYTES = 40;
const COMPONENT_COUNT = 6;

function ascii(view, offset, length) {
  return String.fromCharCode(...new Uint8Array(
    view.buffer,
    view.byteOffset + offset,
    length,
  ));
}

function modelCode(word) {
  return String.fromCharCode(
    word & 0xff,
    (word >>> 8) & 0xff,
    (word >>> 16) & 0xff,
    (word >>> 24) & 0xff,
  ).replace(/[\0 ]+$/u, "");
}

export class NativeClothTrack {
  constructor(buffer) {
    if (!(buffer instanceof ArrayBuffer)) {
      throw new TypeError("native cloth track requires an ArrayBuffer");
    }
    if (buffer.byteLength < HEADER_BYTES) {
      throw new Error("native cloth track header is truncated");
    }
    const view = new DataView(buffer);
    if (ascii(view, 0, 8) !== MAGIC) {
      throw new Error("native cloth track magic is invalid");
    }
    if (view.getUint16(8, true) !== VERSION) {
      throw new Error("native cloth track version is unsupported");
    }
    const headerBytes = view.getUint16(10, true);
    const frameCount = view.getUint32(12, true);
    const vertexCount = view.getUint32(16, true);
    const controlType = view.getInt16(20, true);
    const rowCount = view.getUint16(22, true);
    const columnCount = view.getUint16(24, true);
    const componentCount = view.getUint16(26, true);
    const ownerModelWord = view.getUint32(28, true);
    const quantizationScale = view.getFloat32(32, true);
    if (
      headerBytes !== HEADER_BYTES
      || frameCount < 1
      || vertexCount < 1
      || rowCount * columnCount !== vertexCount
      || componentCount !== COMPONENT_COUNT
      || !(quantizationScale > 0)
      || !Number.isFinite(quantizationScale)
      || view.getUint32(36, true) !== 0
    ) {
      throw new Error("native cloth track header fields are invalid");
    }
    const valuesPerFrame = vertexCount * componentCount;
    const recordBytes = 8 + valuesPerFrame * 2;
    const expectedBytes = headerBytes + frameCount * recordBytes;
    if (buffer.byteLength !== expectedBytes) {
      throw new Error(
        `native cloth track length ${buffer.byteLength} does not match ${expectedBytes}`,
      );
    }
    this.buffer = buffer;
    this.frameCount = frameCount;
    this.vertexCount = vertexCount;
    this.controlType = controlType;
    this.rowCount = rowCount;
    this.columnCount = columnCount;
    this.componentCount = componentCount;
    this.ownerModelWord = ownerModelWord;
    this.modelCode = modelCode(ownerModelWord);
    this.quantizationScale = quantizationScale;
    this.valuesPerFrame = valuesPerFrame;
    this.recordBytes = recordBytes;
    this.coordinates = [];
    this.activityOrder = [];
    this.activityRanges = new Map();
    for (let index = 0; index < frameCount; index += 1) {
      const offset = headerBytes + index * recordBytes;
      const slot = view.getUint16(offset, true);
      if (view.getUint16(offset + 2, true) !== 0) {
        throw new Error("native cloth track sample reserved field is nonzero");
      }
      const frame = view.getUint32(offset + 4, true);
      if (index > 0) {
        const previous = this.coordinates[index - 1];
        if (slot === previous.slot && frame <= previous.frame) {
          throw new Error("native cloth track activity frames are not ordered");
        }
        if (slot !== previous.slot && this.activityRanges.has(slot)) {
          throw new Error("native cloth track activity slot is discontiguous");
        }
      }
      if (!this.activityRanges.has(slot)) {
        this.activityOrder.push(slot);
        this.activityRanges.set(slot, {
          orderIndex: this.activityOrder.length - 1,
          start: index,
          end: index,
        });
      } else {
        this.activityRanges.get(slot).end = index;
      }
      this.coordinates.push(Object.freeze({ slot, frame }));
    }
    Object.freeze(this.coordinates);
    Object.freeze(this.activityOrder);
    this.cachedIndex = -1;
    this.cachedFrame = null;
  }

  matches(group) {
    return group?.controlType === this.controlType
      && group?.vertexCount === this.vertexCount;
  }

  frameAt(slot, frame) {
    if (
      !Number.isSafeInteger(slot)
      || slot < 0
      || !Number.isSafeInteger(frame)
      || frame < 0
    ) {
      throw new TypeError("native cloth track AUTH coordinate is invalid");
    }
    const range = this.activityRanges.get(slot);
    if (!range) return null;
    let low = range.start;
    let high = range.end;
    let resolved = -1;
    while (low <= high) {
      const middle = (low + high) >>> 1;
      const coordinate = this.coordinates[middle];
      if (coordinate.frame <= frame) {
        resolved = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    if (resolved < 0) {
      if (range.orderIndex === 0) return null;
      const previousSlot = this.activityOrder[range.orderIndex - 1];
      resolved = this.activityRanges.get(previousSlot).end;
    }
    if (resolved === this.cachedIndex) return this.cachedFrame;
    const byteOffset = HEADER_BYTES + resolved * this.recordBytes + 8;
    const samples = new Int16Array(
      this.buffer,
      byteOffset,
      this.valuesPerFrame,
    );
    const decoded = new Float32Array(this.valuesPerFrame);
    for (let component = 0; component < decoded.length; component += 1) {
      decoded[component] = Math.fround(
        samples[component] * this.quantizationScale,
      );
    }
    this.cachedIndex = resolved;
    this.cachedFrame = decoded;
    return decoded;
  }
}

export function parseNativeClothTrack(buffer) {
  return new NativeClothTrack(buffer);
}
