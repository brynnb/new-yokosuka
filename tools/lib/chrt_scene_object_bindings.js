const ACTOR_TAG = /^[A-Z0-9_]{4}$/;

function ascii(bytes, start, end) {
  return bytes.subarray(start, end).toString("ascii");
}

function readCString(bytes, offset, limit) {
  if (offset < 0 || offset >= limit) return null;
  let end = offset;
  while (end < limit && bytes[end] !== 0) end += 1;
  if (end === offset || end >= limit) return null;
  const value = ascii(bytes, offset, end);
  return /^[\x20-\x7e]+$/.test(value) ? value : null;
}

function relativeString(bytes, wordOffset, stringStart, stringEnd) {
  if (wordOffset < 0 || wordOffset + 4 > bytes.length) return null;
  const target = wordOffset + bytes.readUInt32LE(wordOffset);
  if (target < stringStart || target >= stringEnd) return null;
  return readCString(bytes, target, stringEnd);
}

function finiteVector(bytes, offset, count) {
  if (offset < 0 || offset + count * 4 > bytes.length) return null;
  const values = Array.from(
    { length: count },
    (_, index) => bytes.readFloatLE(offset + index * 4),
  );
  return values.every(Number.isFinite) ? values : null;
}

function characterPresentation(bytes, start, end, stringStart, stringEnd) {
  let objectPropertyOffset = null;
  const positions = [];
  const angles = [];
  for (let offset = start + 8; offset + 8 <= end; offset += 4) {
    const property = relativeString(bytes, offset, stringStart, stringEnd);
    const type = bytes.readUInt32LE(offset + 4);
    if (property === "Object") objectPropertyOffset = offset;
    if (property === "Position" && type === 0x49) {
      const value = finiteVector(bytes, offset + 8, 3);
      if (value) positions.push({ offset, value });
    }
    if (property === "Angle" && (type === 0x49 || type === 0x01)) {
      const value = type === 0x49
        ? finiteVector(bytes, offset + 8, 3)
        : [0, bytes.readFloatLE(offset + 8), 0];
      if (value.every(Number.isFinite)) angles.push({ offset, value });
    }
  }
  if (objectPropertyOffset === null) return null;
  const objectPositions = positions.filter(value => value.offset > objectPropertyOffset);
  const objectAngles = angles.filter(value => value.offset > objectPropertyOffset);
  if (objectPositions.length === 0) return null;
  if (objectPositions.length !== 1 || objectAngles.length > 1) {
    throw new Error("CHRT associated Object placement is ambiguous");
  }
  return {
    position: objectPositions[0].value,
    rotationDegrees: objectAngles[0]?.value || [0, 0, 0],
    scale: [1, 1, 1],
    source: {
      objectPropertyOffset,
      positionPropertyOffset: objectPositions[0].offset,
      anglePropertyOffset: objectAngles[0]?.offset ?? null,
    },
  };
}

export function parseChrtSceneObjectBindings(bytes) {
  if (!Buffer.isBuffer(bytes)) {
    throw new TypeError("CHRT scene-object parser requires a Buffer");
  }
  if (ascii(bytes, 0, 4) !== "CHRS" || bytes.length < 16) return [];
  const chrsEnd = bytes.readUInt32LE(4);
  if (chrsEnd < 8 || chrsEnd > bytes.length) {
    throw new Error("CHRT has an invalid CHRS boundary");
  }
  const stringOffset = bytes.indexOf(Buffer.from("STRG"), chrsEnd);
  if (stringOffset < 0 || stringOffset + 8 > bytes.length) {
    throw new Error("CHRT has no STRG table");
  }
  const stringEnd = stringOffset + bytes.readUInt32LE(stringOffset + 4);
  const stringStart = stringOffset + 8;
  if (stringEnd > bytes.length) throw new Error("CHRT STRG table is truncated");

  const imageModels = new Map();
  for (let offset = 8; offset + 32 <= chrsEnd; offset += 4) {
    const imageProperty = relativeString(bytes, offset + 16, stringStart, stringEnd);
    if (
      relativeString(bytes, offset, stringStart, stringEnd) !== "DefImage"
      || bytes.readUInt32LE(offset + 4) !== 0x23
      || bytes.readUInt32LE(offset + 12) !== 0x04
      || (imageProperty !== "Image" && imageProperty !== "IMAGE")
      || bytes.readUInt32LE(offset + 20) !== 0x19
      || bytes.readUInt32LE(offset + 24) !== 0x3f800000
    ) continue;
    const image = relativeString(bytes, offset + 8, stringStart, stringEnd);
    const model = relativeString(bytes, offset + 28, stringStart, stringEnd)
      ?.replace(/^[$@]/, "").replace(/\.MT5$/i, "");
    if (!image || !model) throw new Error("CHRT DefImage is incomplete");
    if (imageModels.has(image)) throw new Error(`CHRT DefImage ${image} is duplicated`);
    imageModels.set(image, { model, recordOffset: offset });
  }

  const starts = [];
  for (let offset = 8; offset + 8 <= chrsEnd; offset += 4) {
    const actorTag = ascii(bytes, offset, offset + 4);
    if (
      !ACTOR_TAG.test(actorTag)
      || relativeString(bytes, offset - 8, stringStart, stringEnd) !== "Character"
      || bytes.readUInt32LE(offset - 4) !== 0x22
    ) continue;
    starts.push({ actorTag, offset });
  }

  return starts.map((start, index) => {
    const end = starts[index + 1]?.offset || chrsEnd;
    let image = null;
    let imagePropertyOffset = null;
    for (let offset = start.offset + 8; offset + 12 <= end; offset += 4) {
      if (
        relativeString(bytes, offset, stringStart, stringEnd) === "Image"
        && bytes.readUInt32LE(offset + 4) === 0x03
      ) {
        image = relativeString(bytes, offset + 8, stringStart, stringEnd);
        imagePropertyOffset = offset;
        break;
      }
    }
    const binding = imageModels.get(image);
    return binding ? {
      actorTag: start.actorTag,
      image,
      model: binding.model,
      characterRecordOffset: start.offset,
      imagePropertyOffset,
      defImageRecordOffset: binding.recordOffset,
      presentation: characterPresentation(
        bytes,
        start.offset,
        end,
        stringStart,
        stringEnd,
      ),
    } : null;
  }).filter(Boolean);
}
