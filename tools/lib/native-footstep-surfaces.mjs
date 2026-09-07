import { createHash } from "node:crypto";

const EMPTY_CELL_OFFSET = -4;
const LIST_TERMINATOR = 0xffffffff;
const SUPPRESSED_SURFACE_INDICES = new Set([15, 19, 20]);

function assertRange(bytes, offset, length, label) {
  if (
    !Number.isInteger(offset)
    || !Number.isInteger(length)
    || offset < 0
    || length < 0
    || offset + length > bytes.length
  ) {
    throw new Error(
      `${label} range 0x${offset.toString(16)}+0x${
        length.toString(16)
      } exceeds MAPINFO length 0x${bytes.length.toString(16)}`,
    );
  }
}

function offsetsOf(bytes, signature) {
  const offsets = [];
  let offset = -1;
  while ((offset = bytes.indexOf(signature, offset + 1)) >= 0) {
    offsets.push(offset);
  }
  return offsets;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function float32(bytes, offset, label) {
  assertRange(bytes, offset, 4, label);
  const value = bytes.readFloatLE(offset);
  if (!Number.isFinite(value)) {
    throw new Error(`${label} is not a finite float`);
  }
  return value;
}

function point(bytes, offset, label) {
  return [
    float32(bytes, offset, `${label} x`),
    float32(bytes, offset + 4, `${label} z`),
  ];
}

export function decodeNativeSurfaceCode(code) {
  const low = code & 0xffff;
  const surfaceIndex = low % 100;
  return {
    surfaceIndex,
    priority: Math.floor(low / 100),
    flags: code >>> 16,
    suppressed: SUPPRESSED_SURFACE_INDICES.has(surfaceIndex),
  };
}

function parseRecord(bytes, sectionOffset, sectionByteLength, recordOffset) {
  const absoluteOffset = sectionOffset + recordOffset;
  assertRange(bytes, absoluteOffset, 12, "native surface record");
  if (recordOffset < 8 || recordOffset >= sectionByteLength + 8) {
    throw new Error(
      `Record offset 0x${recordOffset.toString(16)} is outside SOND`,
    );
  }
  const code = bytes.readUInt32LE(absoluteOffset);
  const shapeType = bytes.readUInt32LE(absoluteOffset + 4);
  let cursor = absoluteOffset + 8;
  let geometry;
  if (shapeType === 0) {
    geometry = {
      kind: "point",
      point: point(bytes, cursor, "point record"),
    };
    cursor += 8;
  } else if (shapeType === 3) {
    geometry = {
      kind: "circle",
      center: point(bytes, cursor, "circle center"),
      radius: float32(bytes, cursor + 8, "circle radius"),
    };
    cursor += 12;
  } else if (shapeType === 4) {
    geometry = {
      kind: "triangle",
      vertices: Array.from(
        { length: 3 },
        (_, index) => point(bytes, cursor + index * 8, `triangle ${index}`),
      ),
    };
    cursor += 24;
  } else if (shapeType === 5) {
    // The type-5 point test at 0x0c08dac0 consumes these as one origin and
    // two edge vectors. Keeping that native representation avoids inventing
    // vertices that are not present in MAPINFO.
    geometry = {
      kind: "parallelogram",
      origin: point(bytes, cursor, "parallelogram origin"),
      edgeU: point(bytes, cursor + 8, "parallelogram edge U"),
      edgeV: point(bytes, cursor + 16, "parallelogram edge V"),
    };
    cursor += 24;
  } else if (shapeType === 6) {
    const vertexCount = bytes.readUInt32LE(cursor);
    if (vertexCount < 1 || vertexCount > 4096) {
      throw new Error(`Invalid polygon vertex count ${vertexCount}`);
    }
    cursor += 4;
    geometry = {
      kind: "polygon",
      vertices: Array.from(
        { length: vertexCount },
        (_, index) => point(bytes, cursor + index * 8, `polygon ${index}`),
      ),
    };
    cursor += vertexCount * 8;
  } else {
    throw new Error(`Unsupported native surface shape type ${shapeType}`);
  }
  assertRange(bytes, cursor, 4, "native surface record terminator");
  if (bytes.readUInt32LE(cursor) !== LIST_TERMINATOR) {
    throw new Error(
      `Shape ${shapeType} at 0x${absoluteOffset.toString(16)} has no terminator`,
    );
  }
  return {
    recordOffset,
    code,
    ...decodeNativeSurfaceCode(code),
    shapeType,
    geometry,
    byteLength: cursor + 4 - absoluteOffset,
  };
}

function parseGrid(bytes, gridOffset) {
  assertRange(bytes, gridOffset, 0x40, "sond grid header");
  if (bytes.subarray(gridOffset, gridOffset + 4).toString("ascii") !== "sond") {
    throw new Error("Native surface grid does not begin with sond");
  }
  const headerByteLength = bytes.readUInt32LE(gridOffset + 4);
  const cellCount = bytes.readUInt32LE(gridOffset + 8);
  const width = bytes.readUInt32LE(gridOffset + 12);
  const height = bytes.readUInt32LE(gridOffset + 16);
  if (
    headerByteLength !== 0x40
    || cellCount < 1
    || width < 1
    || height < 1
    || width * height !== cellCount
  ) {
    throw new Error("Invalid native surface grid dimensions");
  }
  const tableOffset = gridOffset + headerByteLength;
  const listBaseOffset = tableOffset + (cellCount + 1) * 4;
  assertRange(bytes, tableOffset, (cellCount + 1) * 4, "grid offset table");
  const cells = [];
  const referencedRecordOffsets = new Set();
  for (let index = 0; index < cellCount; index += 1) {
    const listOffset = bytes.readInt32LE(tableOffset + index * 4);
    const recordOffsets = [];
    if (listOffset !== EMPTY_CELL_OFFSET) {
      if (listOffset < 0) throw new Error(`Invalid grid list offset ${listOffset}`);
      let cursor = listBaseOffset + listOffset;
      for (let guard = 0; guard < 65536; guard += 1) {
        assertRange(bytes, cursor, 4, "grid record list");
        const recordOffset = bytes.readUInt32LE(cursor);
        cursor += 4;
        if (recordOffset === LIST_TERMINATOR) break;
        if (guard === 65535) throw new Error("Unterminated grid record list");
        recordOffsets.push(recordOffset);
        referencedRecordOffsets.add(recordOffset);
      }
    }
    cells.push(recordOffsets);
  }
  return {
    gridOffset,
    headerByteLength,
    cellCount,
    width,
    height,
    headerValues: Array.from(
      { length: 9 },
      (_, index) => bytes.readFloatLE(gridOffset + 20 + index * 4),
    ),
    tableOffset,
    listBaseOffset,
    cells,
    referencedRecordOffsets: [...referencedRecordOffsets].sort((a, b) => a - b),
  };
}

export function parseNativeFootstepSurfaces(bytes) {
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
  const sectionCandidates = offsetsOf(bytes, "SOND").flatMap((sectionOffset) => {
    if (sectionOffset + 8 > bytes.length) return [];
    const sectionByteLength = bytes.readUInt32LE(sectionOffset + 4);
    if (
      sectionByteLength < 4
      || sectionOffset + 8 + sectionByteLength > bytes.length
    ) {
      return [];
    }
    return [{ sectionOffset, sectionByteLength }];
  });
  const grids = [];
  for (const gridOffset of offsetsOf(bytes, "sond")) {
    let grid;
    try {
      grid = parseGrid(bytes, gridOffset);
    } catch {
      continue;
    }
    const matchingSections = [];
    for (const section of sectionCandidates) {
      if (section.sectionOffset >= gridOffset) continue;
      try {
        const records = grid.referencedRecordOffsets.map((recordOffset) => (
          parseRecord(
            bytes,
            section.sectionOffset,
            section.sectionByteLength,
            recordOffset,
          )
        ));
        matchingSections.push({ ...section, records });
      } catch {
        // A MAPINFO can contain multiple unrelated SOND-tagged sections.
      }
    }
    const match = matchingSections.at(-1);
    if (!match) continue;
    const recordIndex = new Map(
      match.records.map((record, index) => [record.recordOffset, index]),
    );
    grids.push({
      sectionOffset: match.sectionOffset,
      sectionByteLength: match.sectionByteLength,
      gridOffset: grid.gridOffset,
      cellCount: grid.cellCount,
      width: grid.width,
      height: grid.height,
      headerValues: grid.headerValues,
      records: match.records,
      cells: grid.cells.map((recordOffsets) => (
        recordOffsets.map((recordOffset) => recordIndex.get(recordOffset))
      )),
    });
  }
  return {
    sha256: sha256(bytes),
    byteLength: bytes.length,
    grids,
  };
}
