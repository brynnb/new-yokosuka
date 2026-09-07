import { createHash } from "node:crypto";

const FIELD_TAG = /^[0-9A-F]{4}$/;
const FLDD_FOOTER_WORD_COUNT = 8;
const FACE_RECORD_BYTE_LENGTH = 16;
const CONTROL_TERMINATOR = -255;

function assertRange(bytes, offset, length, label) {
  if (
    !Number.isInteger(offset)
    || !Number.isInteger(length)
    || offset < 0
    || length < 0
    || offset + length > bytes.length
  ) {
    throw new Error(
      `${label} range 0x${offset.toString(16)}+0x${length.toString(16)}`
      + ` exceeds MAPINFO length 0x${bytes.length.toString(16)}`,
    );
  }
}

function finiteFloat(bytes, offset, label) {
  assertRange(bytes, offset, 4, label);
  const value = bytes.readFloatLE(offset);
  if (!Number.isFinite(value)) throw new Error(`${label} is not finite`);
  return value;
}

function parseControls(bytes, contentOffset, controlsOffset, pointerTableOffset) {
  const controls = [];
  let pointerOffset = pointerTableOffset;
  while (pointerOffset + 4 <= bytes.length) {
    const relativeOffset = bytes.readUInt32LE(pointerOffset);
    if (relativeOffset === 0) break;
    const fileOffset = contentOffset + relativeOffset;
    if (fileOffset < controlsOffset || fileOffset >= pointerTableOffset) {
      throw new Error(
        `Invalid FLDD control pointer 0x${relativeOffset.toString(16)}`,
      );
    }
    controls.push({ fileOffset, pointerFileOffset: pointerOffset });
    pointerOffset += 4;
  }

  for (let index = 0; index < controls.length; index += 1) {
    const control = controls[index];
    const endOffset = index + 1 < controls.length
      ? controls[index + 1].fileOffset
      : pointerTableOffset;
    if (endOffset <= control.fileOffset || endOffset - control.fileOffset < 16) {
      throw new Error(`Invalid FLDD control length at 0x${control.fileOffset.toString(16)}`);
    }
    const terminatorOffset = endOffset - 4;
    if (bytes.readInt32LE(terminatorOffset) !== CONTROL_TERMINATOR) {
      throw new Error(`Missing FLDD control terminator at 0x${terminatorOffset.toString(16)}`);
    }
    control.byteLength = endOffset - control.fileOffset;
    control.type = bytes.readInt32LE(control.fileOffset);
    control.id = bytes.readInt32LE(control.fileOffset + 4);
    control.value = bytes.readInt32LE(control.fileOffset + 8);
    control.rawHex = bytes.subarray(control.fileOffset, endOffset).toString("hex");

    // Type -7 is the native DOOR hierarchy link. Both words are stored as
    // little-endian four-character scene-node names (for example R238/R038).
    if (control.type === -7 && control.byteLength >= 16) {
      control.doorNodeId = bytes.subarray(
        control.fileOffset + 4,
        control.fileOffset + 8,
      ).toString("ascii");
      control.doorParentNodeId = bytes.subarray(
        control.fileOffset + 8,
        control.fileOffset + 12,
      ).toString("ascii");
    }

    // Type -2, value 29 is the authored map-exit/entry control. Its ID is
    // the AREATBL record to load, while this pose is on the source side of
    // the transition. Other type -2 variants intentionally remain raw.
    if (control.type === -2 && control.value === 29 && control.byteLength >= 32) {
      control.position = [
        finiteFloat(bytes, control.fileOffset + 12, "FLDD exit x"),
        finiteFloat(bytes, control.fileOffset + 16, "FLDD exit y"),
        finiteFloat(bytes, control.fileOffset + 20, "FLDD exit z"),
      ];
      control.facing = bytes.readUInt16LE(control.fileOffset + 24);
    }
  }
  return { controls, controlPointerTableEnd: pointerOffset + 4 };
}

function parseField(bytes, fieldOffset, fieldEnd) {
  assertRange(bytes, fieldOffset, 12, "FLDD field");
  const id = bytes.subarray(fieldOffset, fieldOffset + 4).toString("ascii");
  const byteLength = bytes.readUInt32LE(fieldOffset + 4);
  if (!FIELD_TAG.test(id) || byteLength < 12 || fieldOffset + byteLength > fieldEnd) {
    throw new Error(`Invalid FLDD field at 0x${fieldOffset.toString(16)}`);
  }

  const contentOffset = fieldOffset + 8;
  const footerOffset = contentOffset + bytes.readUInt32LE(contentOffset);
  assertRange(
    bytes,
    footerOffset,
    FLDD_FOOTER_WORD_COUNT * 4,
    "FLDD footer",
  );
  const relativeOffsets = Array.from(
    { length: FLDD_FOOTER_WORD_COUNT },
    (_, index) => bytes.readUInt32LE(footerOffset + index * 4),
  );
  const absolute = relativeOffsets.map((offset) => contentOffset + offset);
  const [positionsOffset, positionsEnd] = absolute;
  if ((positionsEnd - positionsOffset) % 12 !== 0) {
    throw new Error(`FLDD position array in ${id} is misaligned`);
  }
  const vertexCount = (positionsEnd - positionsOffset) / 12;
  if (vertexCount === 0 || vertexCount > 0xffff) {
    throw new Error(`Invalid FLDD vertex count ${vertexCount}`);
  }
  const vertices = Array.from({ length: vertexCount }, (_, index) => {
    const offset = positionsOffset + index * 12;
    return [
      finiteFloat(bytes, offset, `FLDD vertex ${index} x`),
      finiteFloat(bytes, offset + 4, `FLDD vertex ${index} y`),
      finiteFloat(bytes, offset + 8, `FLDD vertex ${index} z`),
    ];
  });

  const facesOffset = absolute[3];
  const faces = [];
  let cursor = facesOffset;
  while (cursor + FACE_RECORD_BYTE_LENGTH <= footerOffset) {
    const words = Array.from(
      { length: 8 },
      (_, index) => bytes.readUInt16LE(cursor + index * 2),
    );
    const indices = words.slice(4);
    // The face array is followed by FLDD lookup/control data. Its first
    // record contains values outside the authored vertex array, providing a
    // reliable boundary without assigning semantics to that later data.
    if (
      !indices.every((index) => index < vertexCount)
      || new Set(indices).size < 3
    ) break;
    faces.push({
      fileOffset: cursor,
      recordOffset: cursor - facesOffset,
      // The first four words carry FLDD face attributes whose precise
      // semantics are not yet established. Preserve them losslessly without
      // assigning names that could become part of the public format.
      attributes: words.slice(0, 4),
      indices,
    });
    cursor += FACE_RECORD_BYTE_LENGTH;
  }
  if (faces.length === 0) throw new Error(`FLDD field ${id} has no faces`);

  const controlsOffset = cursor;
  const controlPointerTableOffset = absolute[7];
  if (controlPointerTableOffset < controlsOffset || controlPointerTableOffset > footerOffset) {
    throw new Error(`Invalid FLDD control pointer table in ${id}`);
  }
  const { controls, controlPointerTableEnd } = parseControls(
    bytes,
    contentOffset,
    controlsOffset,
    controlPointerTableOffset,
  );

  return {
    id,
    fileOffset: fieldOffset,
    byteLength,
    contentOffset,
    footerOffset,
    footerRelativeOffsets: relativeOffsets,
    positionsOffset,
    facesOffset,
    faceDataEnd: cursor,
    controlsOffset,
    controlPointerTableOffset,
    controlPointerTableEnd,
    vertices,
    faces,
    controls,
  };
}

export function parseShenmue2WorldCollisions(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const fields = [];
  let searchOffset = 0;
  while (searchOffset < bytes.length) {
    const flddOffset = bytes.indexOf(Buffer.from("FLDD"), searchOffset);
    if (flddOffset < 0) break;
    assertRange(bytes, flddOffset, 16, "FLDD container");
    const payloadByteLength = bytes.readUInt32LE(flddOffset + 4);
    const containerEnd = Math.min(
      bytes.length,
      flddOffset + Math.max(8, payloadByteLength),
    );
    try {
      fields.push(parseField(bytes, flddOffset + 8, containerEnd));
    } catch {
      // A four-byte string inside payload data is not necessarily a token.
    }
    searchOffset = flddOffset + 4;
  }
  return {
    format: "shenmue2-mapinfo-fldd-collision-v1",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    byteLength: bytes.length,
    fields,
  };
}
