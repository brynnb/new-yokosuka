const FOURCC_PATTERN = /^[A-Z0-9_]{4}$/;

function readCString(bytes, offset, limit) {
  if (offset < 0 || offset >= limit) return null;
  let end = offset;
  while (end < limit && bytes[end] !== 0) end += 1;
  if (end === offset || end >= limit) return null;
  const value = bytes.toString("ascii", offset, end);
  return /^[\x20-\x7e]+$/.test(value) ? value : null;
}

function relativeString(bytes, wordOffset, stringStart, stringEnd) {
  if (wordOffset < 0 || wordOffset + 4 > bytes.length) return null;
  const targetOffset = wordOffset + bytes.readUInt32LE(wordOffset);
  if (targetOffset < stringStart || targetOffset >= stringEnd) return null;
  const value = readCString(bytes, targetOffset, stringEnd);
  return value ? { value, targetOffset } : null;
}

function finiteFloats(bytes, offset, count) {
  if (offset < 0 || offset + count * 4 > bytes.length) return null;
  const values = Array.from(
    { length: count },
    (_, index) => bytes.readFloatLE(offset + index * 4),
  );
  return values.every(Number.isFinite) ? values : null;
}

function findToken(bytes, signature, start = 0) {
  const offset = bytes.indexOf(Buffer.from(signature, "ascii"), start);
  if (offset < 0 || offset + 8 > bytes.length) return null;
  const size = bytes.readUInt32LE(offset + 4);
  if (size < 8 || offset + size > bytes.length) return null;
  return { offset, size, end: offset + size };
}

function propertyValue(
  bytes,
  recordOffset,
  recordEnd,
  propertyName,
  stringStart,
  stringEnd,
) {
  for (let offset = recordOffset + 8; offset + 8 <= recordEnd; offset += 4) {
    const property = relativeString(bytes, offset, stringStart, stringEnd);
    if (property?.value !== propertyName) continue;
    const type = bytes.readUInt32LE(offset + 4);
    if (propertyName === "Position" && type === 0x49) {
      const value = finiteFloats(bytes, offset + 8, 3);
      if (value) return { type, value, offset };
    }
    if (propertyName === "Angle" && type === 0x49) {
      const value = finiteFloats(bytes, offset + 8, 3);
      if (value) return { type, value, offset };
    }
    if (propertyName === "Angle" && type === 0x01) {
      const value = finiteFloats(bytes, offset + 8, 1);
      if (value) return { type, value: [0, value[0], 0], offset };
    }
    if (propertyName === "Image" && type === 0x03) {
      const value = relativeString(
        bytes,
        offset + 8,
        stringStart,
        stringEnd,
      );
      if (value) return { type, value: value.value, offset };
    }
  }
  return null;
}

function recordStart(bytes, offset, chrsEnd, stringStart, stringEnd) {
  if (offset < 12 || offset + 8 > chrsEnd) return null;
  const objectTag = bytes.toString("ascii", offset, offset + 4);
  if (!FOURCC_PATTERN.test(objectTag)) return null;

  // A rendered CHRS record is introduced by the serialized Character model
  // expression immediately before its four-character object tag:
  //
  //   relative("$MODEL.MT5"), relative("Character"), 0x22, "TAG0"
  //
  // This relationship is stronger than matching the tag or Image label to a
  // filename and resolves otherwise ambiguous pairs such as KAK1/KAK2.
  const model = relativeString(bytes, offset - 12, stringStart, stringEnd);
  const character = relativeString(bytes, offset - 8, stringStart, stringEnd);
  const characterType = bytes.readUInt32LE(offset - 4);
  if (
    !model?.value.toUpperCase().endsWith(".MT5")
    || character?.value !== "Character"
    || characterType !== 0x22
  ) {
    return null;
  }

  const propertyCount = bytes.readUInt32LE(offset + 4);
  if (propertyCount < 1 || propertyCount > 0x100) return null;
  return {
    offset,
    objectTag,
    propertyCount,
    model: model.value.replace(/^[$@]/, ""),
    modelStringOffset: model.targetOffset,
  };
}

export function extractMapinfoCharacterPlacements(bytes) {
  const chrs = findToken(bytes, "CHRS");
  const strings = findToken(bytes, "STRG", chrs?.end || 0);
  if (!chrs) throw new Error("MAPINFO has no valid CHRS token");
  if (!strings) throw new Error("MAPINFO has no valid STRG token after CHRS");

  const starts = [];
  for (let offset = chrs.offset + 8; offset + 8 <= chrs.end; offset += 4) {
    const start = recordStart(
      bytes,
      offset,
      chrs.end,
      strings.offset + 8,
      strings.end,
    );
    if (start) starts.push(start);
  }

  return starts.map((start, index) => {
    const end = starts[index + 1]?.offset || chrs.end;
    const position = propertyValue(
      bytes,
      start.offset,
      end,
      "Position",
      strings.offset + 8,
      strings.end,
    );
    const angle = propertyValue(
      bytes,
      start.offset,
      end,
      "Angle",
      strings.offset + 8,
      strings.end,
    );
    const image = propertyValue(
      bytes,
      start.offset,
      end,
      "Image",
      strings.offset + 8,
      strings.end,
    );
    return {
      objectTag: start.objectTag,
      model: start.model,
      image: image?.value || null,
      position: position?.value || null,
      rotationDegrees: angle?.value || [0, 0, 0],
      scale: [1, 1, 1],
      evidence: {
        recordOffset: start.offset,
        modelStringOffset: start.modelStringOffset,
        positionPropertyOffset: position?.offset ?? null,
        anglePropertyOffset: angle?.offset ?? null,
        imagePropertyOffset: image?.offset ?? null,
        propertyCount: start.propertyCount,
      },
    };
  }).filter((placement) => placement.position);
}
