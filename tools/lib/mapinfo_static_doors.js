const DOOR_NAME_PATTERN = /^DR\d{2}_\d{3}$/;

function rounded(value, places = 6) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function signedAngleDegrees(raw) {
  const low = raw & 0xffff;
  const signed = low >= 0x8000 ? low - 0x10000 : low;
  return signed * 360 / 0x10000;
}

function doorNameRun(bytes, offset, imageModels) {
  const names = [];
  let cursor = offset;
  while (cursor + 10 <= bytes.length) {
    const end = bytes.indexOf(0, cursor);
    if (end < 0 || end - cursor > 32 || end === cursor) break;
    const name = bytes.toString("ascii", cursor, end);
    if (!DOOR_NAME_PATTERN.test(name) && !Object.hasOwn(imageModels, name)) break;
    names.push(name);
    cursor = end + 1;
  }
  return { names, end: cursor };
}

export function extractMapinfoStaticDoors(bytes, prefix = "", imageModels = {}) {
  const firstBytes = new Set(["D", ...Object.keys(imageModels)].map(name => name.charCodeAt(0)));
  let best = { names: [], offset: -1, end: -1 };
  for (let offset = 0; offset + 10 <= bytes.length; offset += 1) {
    if (!firstBytes.has(bytes[offset])) continue;
    const run = doorNameRun(bytes, offset, imageModels);
    if (run.names.length > best.names.length) {
      best = { ...run, offset };
    }
  }
  if (best.names.length === 0) {
    throw new Error("MAPINFO has no static door resource-name table");
  }

  // One 16-byte resource descriptor follows every NUL-terminated model name.
  // The packed placement array begins immediately after those descriptors.
  const descriptorsOffset = (best.end + 3) & ~3;
  const recordsOffset = descriptorsOffset + best.names.length * 0x10;
  const placements = [];
  for (let offset = recordsOffset, index = 0; offset + 0x24 <= bytes.length;
    offset += 0x24, index += 1) {
    const type = bytes.readUInt32LE(offset);
    const modelIndex = bytes.readUInt32LE(offset + 4);
    const scale = [0x08, 0x0c, 0x10].map(
      (field) => bytes.readFloatLE(offset + field),
    );
    const sourcePosition = [0x14, 0x18, 0x1c].map(
      (field) => bytes.readFloatLE(offset + field),
    );
    if (
      ![1, 2].includes(type)
      || modelIndex >= best.names.length
      || !scale.every((value) => (
        Number.isFinite(value) && value > 0 && value < 10
      ))
      || !sourcePosition.every((value) => (
        Number.isFinite(value) && Math.abs(value) < 100000
      ))
    ) {
      break;
    }
    const sourceYaw = signedAngleDegrees(bytes.readUInt32LE(offset + 0x20));
    placements.push({
      id: `static-door-${index}`,
      model: `${prefix}${imageModels[best.names[modelIndex]] || best.names[modelIndex]}.MT5`,
      position: [
        -sourcePosition[0],
        sourcePosition[1],
        sourcePosition[2],
      ].map((value) => rounded(value)),
      rotationDegrees: [0, -sourceYaw, 0].map((value) => rounded(value)),
      scale: scale.map((value) => rounded(value)),
      runtime: {
        objectTag: null,
        staticDoorIndex: index,
        ...(Object.hasOwn(imageModels, best.names[modelIndex]) ? {staticDoorResourceName: best.names[modelIndex]} : {}),
        staticDoorType: type,
        staticDoorModelIndex: modelIndex,
        staticSourceOffset: `0x${offset.toString(16)}`,
        placementSource: "mapinfo-static-door-table",
      },
    });
  }
  return {
    nameTableOffset: best.offset,
    descriptorsOffset,
    recordsOffset,
    modelNames: best.names,
    placements,
  };
}
