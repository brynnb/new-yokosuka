import { createHash } from "node:crypto";

const RECORD_TERMINATOR = 0xffffffff;
const FIELD_TAG = /^[0-9A-F]{4}$/;

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

function finiteFloat(bytes, offset, label) {
  assertRange(bytes, offset, 4, label);
  const value = bytes.readFloatLE(offset);
  if (!Number.isFinite(value)) throw new Error(`${label} is not finite`);
  return value;
}

function point(bytes, offset, label) {
  return [
    finiteFloat(bytes, offset, `${label} x`),
    finiteFloat(bytes, offset + 4, `${label} z`),
  ];
}

function findTokens(bytes, token, start, end) {
  const offsets = [];
  let offset = start - 1;
  while ((offset = bytes.indexOf(token, offset + 1)) >= 0 && offset < end) {
    offsets.push(offset);
  }
  return offsets;
}

function parseRecord(bytes, offset, payloadEnd) {
  assertRange(bytes, offset, 12, "COLI record");
  const code = bytes.readUInt32LE(offset);
  const shapeType = bytes.readUInt32LE(offset + 4);
  let cursor = offset + 8;
  let geometry;

  if (shapeType === 1) {
    geometry = {
      kind: "segment",
      start: point(bytes, cursor, "segment start"),
      end: point(bytes, cursor + 8, "segment end"),
    };
    cursor += 16;
  } else if (shapeType === 2 || shapeType === 6) {
    assertRange(bytes, cursor, 4, "COLI vertex count");
    const vertexCount = bytes.readUInt32LE(cursor);
    if (vertexCount < 2 || vertexCount > 4096) {
      throw new Error(`Invalid COLI vertex count ${vertexCount}`);
    }
    cursor += 4;
    geometry = {
      // Type 2 is an open connected wall chain. Type 6 is the closed polygon
      // form also used by native event/region queries.
      kind: shapeType === 2 ? "polyline" : "polygon",
      vertices: Array.from(
        { length: vertexCount },
        (_, index) => point(bytes, cursor + index * 8, `vertex ${index}`),
      ),
    };
    cursor += vertexCount * 8;
  } else if (shapeType === 3) {
    geometry = {
      kind: "circle",
      radius: finiteFloat(bytes, cursor, "circle radius"),
      center: point(bytes, cursor + 4, "circle center"),
    };
    cursor += 12;
  } else if (shapeType === 4) {
    geometry = {
      kind: "polygon",
      vertices: Array.from(
        { length: 3 },
        (_, index) => point(bytes, cursor + index * 8, `triangle ${index}`),
      ),
    };
    cursor += 24;
  } else if (shapeType === 5) {
    geometry = {
      kind: "parallelogram",
      origin: point(bytes, cursor, "parallelogram origin"),
      edgeU: point(bytes, cursor + 8, "parallelogram edge U"),
      edgeV: point(bytes, cursor + 16, "parallelogram edge V"),
    };
    cursor += 24;
  } else {
    throw new Error(`Unsupported COLI shape type ${shapeType}`);
  }

  if (cursor + 4 > payloadEnd) {
    throw new Error("COLI record extends beyond its section");
  }
  if (bytes.readUInt32LE(cursor) !== RECORD_TERMINATOR) {
    throw new Error(
      `COLI shape ${shapeType} at 0x${offset.toString(16)} has no terminator`,
    );
  }
  return {
    fileOffset: offset,
    byteLength: cursor + 4 - offset,
    code,
    shapeType,
    geometry,
  };
}

function parseColiSection(bytes, sectionOffset, fieldEnd) {
  assertRange(bytes, sectionOffset, 8, "COLI header");
  const payloadByteLength = bytes.readUInt32LE(sectionOffset + 4);
  const payloadOffset = sectionOffset + 8;
  const payloadEnd = payloadOffset + payloadByteLength;
  if (payloadEnd > fieldEnd) {
    throw new Error(
      `COLI at 0x${sectionOffset.toString(16)} exceeds its field`,
    );
  }
  const records = [];
  let cursor = payloadOffset;
  while (cursor < payloadEnd) {
    const record = parseRecord(bytes, cursor, payloadEnd);
    records.push(record);
    cursor += record.byteLength;
  }
  if (cursor !== payloadEnd) {
    throw new Error(`COLI at 0x${sectionOffset.toString(16)} is misaligned`);
  }
  return {
    fileOffset: sectionOffset,
    payloadByteLength,
    records,
  };
}

function parseFields(bytes, colsOffset, colsEnd) {
  const fields = [];
  let cursor = colsOffset + 8;
  while (cursor + 8 <= colsEnd) {
    const tag = bytes.subarray(cursor, cursor + 4).toString("ascii");
    const byteLength = bytes.readUInt32LE(cursor + 4);
    if (!FIELD_TAG.test(tag) || byteLength < 8 || cursor + byteLength > colsEnd) {
      break;
    }
    const fieldEnd = cursor + byteLength;
    const sections = findTokens(
      bytes,
      Buffer.from("COLI"),
      cursor + 8,
      fieldEnd,
    ).map((offset) => parseColiSection(bytes, offset, fieldEnd));
    fields.push({
      id: tag,
      fileOffset: cursor,
      byteLength,
      sections,
    });
    cursor = fieldEnd;
  }
  return fields;
}

export function parseNativeWorldCollisions(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const containers = [];
  for (
    const colsOffset of findTokens(
      bytes,
      Buffer.from("COLS"),
      0,
      bytes.length,
    )
  ) {
    if (colsOffset + 8 > bytes.length) continue;
    const byteLength = bytes.readUInt32LE(colsOffset + 4);
    const colsEnd = colsOffset + 8 + byteLength;
    if (byteLength < 8 || colsEnd > bytes.length) continue;
    let fields;
    try {
      fields = parseFields(bytes, colsOffset, colsEnd);
    } catch {
      continue;
    }
    if (!fields.some(({ sections }) => sections.length > 0)) continue;
    containers.push({
      fileOffset: colsOffset,
      byteLength,
      fields,
    });
  }
  return {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    byteLength: bytes.length,
    containers,
  };
}

export function browserSegmentsForCollisionGeometry(geometry) {
  const browserPoint = ([x, z]) => [-x, -z];
  const polylineSegments = (vertices, closed) => {
    const converted = vertices.map(browserPoint);
    const segments = [];
    const edgeCount = closed ? converted.length : converted.length - 1;
    for (let index = 0; index < edgeCount; index += 1) {
      segments.push([
        converted[index],
        converted[(index + 1) % converted.length],
      ]);
    }
    return segments;
  };

  if (geometry.kind === "segment") {
    return [[browserPoint(geometry.start), browserPoint(geometry.end)]];
  }
  if (geometry.kind === "circle") {
    const [centerX, centerZ] = browserPoint(geometry.center);
    const tessellation = 16;
    const vertices = Array.from({ length: tessellation }, (_, index) => {
      const angle = (index / tessellation) * Math.PI * 2;
      return [
        centerX + Math.cos(angle) * geometry.radius,
        centerZ + Math.sin(angle) * geometry.radius,
      ];
    });
    return polylineSegments(vertices, true);
  }
  if (geometry.kind === "polyline" || geometry.kind === "polygon") {
    return polylineSegments(
      geometry.vertices,
      geometry.kind === "polygon",
    );
  }
  if (geometry.kind === "parallelogram") {
    const { origin, edgeU, edgeV } = geometry;
    return polylineSegments([
      origin,
      [origin[0] + edgeU[0], origin[1] + edgeU[1]],
      [
        origin[0] + edgeU[0] + edgeV[0],
        origin[1] + edgeU[1] + edgeV[1],
      ],
      [origin[0] + edgeV[0], origin[1] + edgeV[1]],
    ], true);
  }
  throw new Error(`Unsupported native collision geometry ${geometry.kind}`);
}
