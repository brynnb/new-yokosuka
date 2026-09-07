import fs from "node:fs";

function humanActorCodes(indexBytes) {
  const count = indexBytes.readUInt32LE(0);
  if (indexBytes.length !== 4 + count * 8) {
    throw new Error("Unexpected Shenmue II HUMANS.IDX layout.");
  }
  return Array.from({ length: count }, (_, index) => (
    indexBytes.subarray(4 + index * 4, 8 + index * 4).toString("ascii")
  ));
}

export function shenmue2HumanActorCodes(indexPath) {
  return humanActorCodes(fs.readFileSync(indexPath));
}

export function shenmue2HumanModelAssets(indexPath, archivePath) {
  const actorCodes = shenmue2HumanActorCodes(indexPath);
  const archive = fs.readFileSync(archivePath);
  if (!archive.subarray(0, 4).toString("ascii").startsWith("AFS")) {
    throw new Error(`${archivePath} is not an AFS archive.`);
  }
  const entryCount = archive.readUInt32LE(4);
  if (entryCount !== actorCodes.length * 2) {
    throw new Error("HUMANS.AFS does not contain one model pair per IDX row.");
  }
  const result = [];
  for (let logicalIndex = 0; logicalIndex < actorCodes.length; logicalIndex += 1) {
    const entryIndex = logicalIndex * 2 + 1;
    const entryOffset = archive.readUInt32LE(8 + entryIndex * 8);
    const entryLength = archive.readUInt32LE(12 + entryIndex * 8);
    const entry = archive.subarray(entryOffset, entryOffset + entryLength);
    const base = 16;
    if (entry.subarray(base, base + 4).toString("ascii") !== "IPAC") continue;
    const table = base + entry.readUInt32LE(base + 4);
    const count = entry.readUInt32LE(base + 8);
    for (let index = 0; index < count; index += 1) {
      const record = table + index * 20;
      const extension = entry.subarray(record + 8, record + 12)
        .toString("ascii").replace(/\0/g, "").trim();
      if (extension !== "CHRM") continue;
      result.push({
        actorCode: actorCodes[logicalIndex],
        logicalIndex,
        modelCode: entry.subarray(record, record + 8)
          .toString("ascii").replace(/\0/g, "").trim(),
        modelBytes: entry.subarray(
          base + entry.readUInt32LE(record + 12),
          base + entry.readUInt32LE(record + 12)
            + entry.readUInt32LE(record + 16),
        ),
      });
      break;
    }
  }
  return result;
}

export function shenmue2HumanModelBindings(indexPath, archivePath) {
  return new Map(shenmue2HumanModelAssets(indexPath, archivePath).map(({
    modelBytes: _modelBytes,
    ...binding
  }) => [binding.actorCode, binding]));
}

export function shenmue2RuntimeActorBindings(ram, actorCodes) {
  const knownCodes = actorCodes instanceof Set
    ? actorCodes
    : new Set(actorCodes);
  const candidatesByController = new Map();
  const add = (controllerAddress, candidate) => {
    if (!candidatesByController.has(controllerAddress)) {
      candidatesByController.set(controllerAddress, []);
    }
    candidatesByController.get(controllerAddress).push(candidate);
  };
  for (let offset = 0; offset + 0x28 <= ram.length; offset += 4) {
    const actorCode = ram.subarray(offset, offset + 4).toString("ascii");
    if (!knownCodes.has(actorCode)) continue;

    // Ordinary NPC runtime records retain the actor code followed by two
    // independent pointers to the same compact controller at +0x08/+0x24.
    // Requiring both eliminates coincidental pointers in script/name tables.
    const ordinaryController = ram.readUInt32LE(offset + 0x08);
    if (ordinaryController === ram.readUInt32LE(offset + 0x24)) {
      add(ordinaryController, {
        actorCode,
        method: "native NPC record code + controller pointers +0x08/+0x24",
        actorRecordAddress: `0x${(0x8c000000 + offset >>> 0).toString(16)}`,
      });
    }

    // Story/scene CLMD records use a distinct layout: the controller pointer
    // is 0x20 bytes before the code and the CLMD tag is 0x4c bytes before it.
    if (
      offset >= 0x4c
      && ram.subarray(offset - 0x4c, offset - 0x48).toString("ascii")
        === "CLMD"
    ) {
      add(ram.readUInt32LE(offset - 0x20), {
        actorCode,
        method: "native CLMD record controller pointer -0x20",
        actorRecordAddress: `0x${(0x8c000000 + offset - 0x4c >>> 0).toString(16)}`,
      });
    }
  }
  return new Map([...candidatesByController].flatMap(([
    controllerAddress,
    candidates,
  ]) => {
    const codes = [...new Set(candidates.map(({ actorCode }) => actorCode))];
    return codes.length === 1 ? [[controllerAddress, {
      actorCode: codes[0],
      observations: candidates.filter(
        ({ actorCode }) => actorCode === codes[0],
      ),
    }]] : [];
  }));
}

export function shenmue2RuntimeActorBinding(
  ram,
  controllerAddress,
  actorCodes,
) {
  return shenmue2RuntimeActorBindings(ram, actorCodes).get(
    Number(controllerAddress) >>> 0,
  ) || null;
}
