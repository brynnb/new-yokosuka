#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const actorSourcePath = path.resolve(
  process.argv[2] || "tools/evidence/scheduled-actors.json",
);
const humansPath = path.resolve(
  process.argv[3] || "extracted_disc3_v2/data/SCENE/03/STREAM/HUMANS.AFS",
);
const outputDirectory = path.resolve(
  process.argv[4] || "play/assets/characters",
);
const evidencePath = path.resolve(
  process.argv[5] || "play/data/scheduled-actor-assets.json",
);

// chars.csv uses the in-engine medium-detail name for these two characters,
// while this HUMANS archive stores their complete playable hierarchy as _L.
// The archive contains no corresponding _M child.
const ARCHIVE_MODEL_ALIASES = Object.freeze({
  JME_: "JME_L",
  JOJ_M: "JOJ_L",
  NZM_M: "NZM_L",
});

function ascii(bytes) {
  return bytes.toString("ascii").replace(/[^\x20-\x7e]/g, ".");
}

function cleanAscii(bytes) {
  return ascii(bytes).replace(/\.+$/g, "").trim();
}

function digest(algorithm, bytes) {
  return crypto.createHash(algorithm).update(bytes).digest("hex");
}

function parseAfs(bytes) {
  if (!ascii(bytes.subarray(0, 4)).startsWith("AFS")) {
    throw new Error(`${humansPath} is not an AFS archive.`);
  }
  const count = bytes.readUInt32LE(4);
  return Array.from({ length: count }, (_, index) => ({
    index,
    offset: bytes.readUInt32LE(8 + index * 8),
    length: bytes.readUInt32LE(12 + index * 8),
  }));
}

function parseIpacChildren(entryBytes, base) {
  if (ascii(entryBytes.subarray(base, base + 4)) !== "IPAC") return [];
  const table = base + entryBytes.readUInt32LE(base + 4);
  const count = entryBytes.readUInt32LE(base + 8);
  return Array.from({ length: count }, (_, index) => {
    const record = table + index * 20;
    return {
      index,
      filename: cleanAscii(entryBytes.subarray(record, record + 8)),
      extension: cleanAscii(entryBytes.subarray(record + 8, record + 12)),
      offset: entryBytes.readUInt32LE(record + 12) + base,
      length: entryBytes.readUInt32LE(record + 16),
    };
  });
}

function parseModelChildren(entryBytes) {
  if (ascii(entryBytes.subarray(0, 4)) !== "PAKS") return [];
  return parseIpacChildren(entryBytes, 16).filter(
    (child) => child.extension === "CHRM",
  );
}

function buildTexturePack(entryBytes, entryIndex) {
  if (ascii(entryBytes.subarray(0, 4)) !== "PAKF") {
    throw new Error(
      `HUMANS entry ${entryIndex} preceding a model is not PAKF.`,
    );
  }
  const packageSize = entryBytes.readUInt32LE(4);
  const expectedTextures = entryBytes.readUInt32LE(12);
  const records = [];
  let position = 16;
  while (position + 8 <= Math.min(packageSize, entryBytes.length)) {
    const marker = ascii(entryBytes.subarray(position, position + 4));
    const blockSize = entryBytes.readUInt32LE(position + 4);
    const blockEnd = position + blockSize;
    if (
      blockSize < 8
      || blockEnd > entryBytes.length
      || blockEnd <= position
    ) {
      break;
    }
    if (marker === "TEXN" && position + 16 <= blockEnd) {
      const identifier = entryBytes.subarray(position + 8, position + 16);
      const pvrOffset = entryBytes.indexOf(
        Buffer.from("PVRT"),
        position + 16,
      );
      if (pvrOffset >= position + 16 && pvrOffset + 8 <= blockEnd) {
        const pvrLength = entryBytes.readUInt32LE(pvrOffset + 4) + 8;
        if (pvrOffset + pvrLength <= blockEnd) {
          const header = Buffer.alloc(12);
          identifier.copy(header, 0);
          header.writeUInt32LE(pvrLength, 8);
          records.push(header, entryBytes.subarray(
            pvrOffset,
            pvrOffset + pvrLength,
          ));
        }
      }
    }
    position = blockEnd;
  }
  if (records.length / 2 !== expectedTextures) {
    throw new Error(
      `Extracted ${records.length / 2}/${expectedTextures} textures `
      + `from HUMANS entry ${entryIndex}.`,
    );
  }
  return Buffer.concat(records);
}

function writeReproducibleAsset(filename, bytes) {
  if (fs.existsSync(filename)) {
    const existing = fs.readFileSync(filename);
    if (!existing.equals(bytes)) {
      throw new Error(
        `Refusing to replace nonmatching existing asset ${filename}.`,
      );
    }
    return false;
  }
  fs.writeFileSync(filename, bytes);
  return true;
}

const actorSource = JSON.parse(
  fs.readFileSync(actorSourcePath, "utf8"),
);
const humans = fs.readFileSync(humansPath);
const afsEntries = parseAfs(humans);
const modelCandidates = new Map();

for (const entry of afsEntries) {
  const entryBytes = humans.subarray(entry.offset, entry.offset + entry.length);
  for (const child of parseModelChildren(entryBytes)) {
    const modelBytes = entryBytes.subarray(
      child.offset,
      child.offset + child.length,
    );
    const candidates = modelCandidates.get(child.filename) || [];
    candidates.push({
      modelEntryIndex: entry.index,
      textureEntryIndex: entry.index - 1,
      modelBytes,
    });
    modelCandidates.set(child.filename, candidates);
  }
}

const explicitModelCodes = Array.isArray(actorSource.modelCodes)
  ? actorSource.modelCodes
  : null;
const identityMappedModelCodes = [...new Set(
  explicitModelCodes || actorSource.sourceVariants
    .map((variant) => variant.characterMapping?.modelCode)
    .filter(Boolean),
)].sort();
const modelOverrideCodes = explicitModelCodes
  ? []
  : [...new Set(
      actorSource.sourceVariants.flatMap(
        (variant) => variant.scheduleTables.flatMap(
          (table) => table.entries.flatMap(
            (entry) => entry.descriptor.operations
              .filter((operation) => operation.operation === 0x2f)
              .map((operation) => operation.modelOverrideCode),
          ),
        ),
      ).filter(Boolean),
    )].sort();
const additionalModelOverrideCodes = modelOverrideCodes.filter(
  (modelCode) => !identityMappedModelCodes.includes(modelCode),
);
const mappedModelCodes = [...new Set([
  ...identityMappedModelCodes,
  ...modelOverrideCodes,
])].sort();

fs.mkdirSync(outputDirectory, { recursive: true });
const assets = [];
let writtenFileCount = 0;
for (const mappedModelCode of mappedModelCodes) {
  const assetModelCode = ARCHIVE_MODEL_ALIASES[mappedModelCode]
    || mappedModelCode;
  const candidates = modelCandidates.get(assetModelCode) || [];
  if (candidates.length === 0) {
    throw new Error(
      `No HUMANS CHRM child resolves ${mappedModelCode} (${assetModelCode}).`,
    );
  }

  const modelHashes = new Set(candidates.map(
    (candidate) => digest("sha256", candidate.modelBytes),
  ));
  if (modelHashes.size !== 1) {
    throw new Error(
      `HUMANS has nonidentical ${assetModelCode} model candidates.`,
    );
  }

  const textureCandidates = candidates.map((candidate) => {
    const entry = afsEntries[candidate.textureEntryIndex];
    if (!entry) {
      throw new Error(
        `Model entry ${candidate.modelEntryIndex} has no preceding texture entry.`,
      );
    }
    const entryBytes = humans.subarray(
      entry.offset,
      entry.offset + entry.length,
    );
    return buildTexturePack(entryBytes, candidate.textureEntryIndex);
  });
  const textureHashes = new Set(textureCandidates.map(
    (bytes) => digest("sha256", bytes),
  ));
  if (textureHashes.size !== 1) {
    throw new Error(
      `HUMANS has nonidentical ${assetModelCode} texture candidates.`,
    );
  }

  const textureStem = assetModelCode.replace(/_[LM]$/, "");
  const modelFilename = `${assetModelCode}.CHRM`;
  const textureFilename = `${textureStem}_textures.bin`;
  if (writeReproducibleAsset(
    path.join(outputDirectory, modelFilename),
    candidates[0].modelBytes,
  )) writtenFileCount++;
  if (writeReproducibleAsset(
    path.join(outputDirectory, textureFilename),
    textureCandidates[0],
  )) writtenFileCount++;

  assets.push({
    mappedModelCode,
    assetModelCode,
    mappingRule: mappedModelCode === assetModelCode
      ? "exact HUMANS CHRM child name"
      : "documented HUMANS full-hierarchy alias",
    modelFile: modelFilename,
    textureFile: textureFilename,
    modelEntryIndices: candidates.map(
      (candidate) => candidate.modelEntryIndex,
    ),
    textureEntryIndices: candidates.map(
      (candidate) => candidate.textureEntryIndex,
    ),
    modelByteLength: candidates[0].modelBytes.length,
    modelSha256: [...modelHashes][0],
    texturePackByteLength: textureCandidates[0].length,
    texturePackSha256: [...textureHashes][0],
  });
}

const evidence = {
  schema: explicitModelCodes
    ? "new-yokosuka-humans-actor-assets-v1"
    : "new-yokosuka-scheduled-actor-assets-v1",
  generatedFrom: {
    ...(explicitModelCodes
      ? { actorSource: path.relative(process.cwd(), actorSourcePath) }
      : { scheduledActors: path.relative(process.cwd(), actorSourcePath) }),
    humansArchive: path.relative(process.cwd(), humansPath),
    humansArchiveSha256: digest("sha256", humans),
  },
  evidenceBoundary: (
    "Each asset is an exact CHRM child from HUMANS.AFS paired with the PAKF "
    + "texture entry immediately preceding its PAKS model entry. Duplicate "
    + "archive candidates are accepted only when both extracted model and "
    + "texture-pack bytes are identical."
  ),
  aliases: ARCHIVE_MODEL_ALIASES,
  assets,
  summary: {
    mappedModelCount: identityMappedModelCodes.length,
    modelOverrideCount: additionalModelOverrideCodes.length,
    resolvedAssetCount: assets.length,
    aliasCount: Object.keys(ARCHIVE_MODEL_ALIASES).length,
    outputFileCount: assets.length * 2,
  },
};
fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(
  `Resolved ${assets.length}/${mappedModelCodes.length} HUMANS actor `
  + `models; wrote ${writtenFileCount} new asset files.`,
);
