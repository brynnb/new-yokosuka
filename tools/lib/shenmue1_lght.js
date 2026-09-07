const CHILD_HEADER_SIZE = 0x18;
const RECORD_SIZE = 0x20;

function halfToNumber(raw) {
  const sign = raw & 0x8000 ? -1 : 1;
  const exponent = (raw >>> 10) & 0x1f;
  const fraction = raw & 0x03ff;
  if (exponent === 0x1f) return fraction ? Number.NaN : sign * Infinity;
  if (exponent === 0) return sign * 2 ** -14 * (fraction / 0x400);
  return sign * 2 ** (exponent - 15) * (1 + fraction / 0x400);
}

function half(bytes, offset) {
  return halfToNumber(bytes.readUInt16LE(offset));
}

function requireToken(bytes, offset, limit, signature) {
  if (offset < 0 || offset + 8 > limit) {
    throw new Error(`${signature} token header exceeds its parent`);
  }
  if (bytes.toString("ascii", offset, offset + 4) !== signature) {
    throw new Error(`Expected ${signature} token at 0x${offset.toString(16)}`);
  }
  const size = bytes.readUInt32LE(offset + 4);
  if (size < 8 || offset + size > limit) {
    throw new Error(`Invalid ${signature} token size at 0x${offset.toString(16)}`);
  }
  return { offset, size, end: offset + size };
}

function parseRecord(bytes, offset) {
  const values = Array.from({ length: 12 }, (_, index) => (
    half(bytes, offset + 0x06 + index * 2)
  ));
  if (!values.every(Number.isFinite)) {
    throw new Error(`Non-finite LGHT value at 0x${offset.toString(16)}`);
  }
  return {
    slot: bytes.readUInt16LE(offset),
    enabled: bytes.readUInt16LE(offset + 0x02),
    nativeType: bytes.readUInt16LE(offset + 0x04),
    color: values.slice(0, 3),
    intensity: values[3],
    scalarA: values[4],
    scalarB: values[5],
    position: values.slice(6, 9),
    direction: values.slice(9, 12),
    angularParameter: bytes.readUInt16LE(offset + 0x1e),
    sourceOffset: offset,
  };
}

export function parseShenmue1LightScene(bytes) {
  if (!Buffer.isBuffer(bytes)) {
    throw new TypeError("Shenmue I LGHT input must be a Buffer");
  }
  const root = requireToken(bytes, 0, bytes.length, "LGHT");
  const children = [];
  for (let offset = root.offset + 8; offset < root.end;) {
    const child = requireToken(bytes, offset, root.end, "LGHT");
    if (child.size < CHILD_HEADER_SIZE) {
      throw new Error(`LGHT child at 0x${offset.toString(16)} is too small`);
    }
    const count = bytes.readUInt16LE(offset + 0x0c);
    const expectedSize = CHILD_HEADER_SIZE + count * RECORD_SIZE;
    if (child.size !== expectedSize) {
      throw new Error(
        `LGHT child at 0x${offset.toString(16)} has size ${child.size}, expected ${expectedSize}`,
      );
    }
    children.push({
      index: children.length,
      sourceOffset: child.offset,
      size: child.size,
      scalar: bytes.readFloatLE(offset + 0x08),
      mode: bytes.readUInt16LE(offset + 0x0e),
      globalValues: Array.from(
        { length: 4 },
        (_, index) => half(bytes, offset + 0x10 + index * 2),
      ),
      records: Array.from(
        { length: count },
        (_, index) => parseRecord(
          bytes,
          offset + CHILD_HEADER_SIZE + index * RECORD_SIZE,
        ),
      ),
    });
    offset = child.end;
  }
  return {
    root: { sourceOffset: root.offset, size: root.size },
    children,
  };
}

export function findShenmue1LightScenes(bytes) {
  if (!Buffer.isBuffer(bytes)) {
    throw new TypeError("Shenmue I MAPINFO input must be a Buffer");
  }
  const scenes = [];
  for (
    let offset = bytes.indexOf("LGHT", 0, "ascii");
    offset !== -1;
    offset = bytes.indexOf("LGHT", offset + 4, "ascii")
  ) {
    try {
      const scene = parseShenmue1LightScene(bytes.subarray(offset));
      if (scene.children.length > 0) scenes.push({ offset, scene });
    } catch {
      // Nested children and arbitrary payload bytes can also contain LGHT.
      // Only complete, structurally valid root tokens are scene candidates.
    }
  }
  return scenes;
}

export const SHENMUE1_LGHT_CHILD_HEADER_SIZE = CHILD_HEADER_SIZE;
export const SHENMUE1_LGHT_RECORD_SIZE = RECORD_SIZE;
