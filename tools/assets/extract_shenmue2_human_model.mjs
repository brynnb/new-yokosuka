#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { shenmue2HumanModelAssets } from
  "../lib/Shenmue2RuntimeActorBinding.js";

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]?.replace(/^--/, "");
    const value = argv[index + 1];
    if (!name || value === undefined) throw new Error("Incomplete argument");
    options[name] = value;
  }
  for (const required of ["humans-idx", "humans-afs", "out-dir"]) {
    if (!options[required]) throw new Error(`Missing --${required}`);
  }
  if (!options.actor && !options.model) {
    throw new Error("Provide --actor or --model");
  }
  return options;
}

function texturePackForEntry(archive, entryIndex) {
  const entryOffset = archive.readUInt32LE(8 + entryIndex * 8);
  const entryLength = archive.readUInt32LE(12 + entryIndex * 8);
  const entry = archive.subarray(entryOffset, entryOffset + entryLength);
  if (entry.subarray(0, 4).toString("ascii") !== "PAKF") {
    throw new Error(`HUMANS.AFS entry ${entryIndex} is not PAKF`);
  }
  const packageSize = entry.readUInt32LE(4);
  const expectedTextureCount = entry.readUInt32LE(12);
  const records = [];
  let position = 16;
  while (position + 8 <= Math.min(packageSize, entry.length)) {
    const marker = entry.subarray(position, position + 4).toString("ascii");
    const blockSize = entry.readUInt32LE(position + 4);
    const blockEnd = position + blockSize;
    if (blockSize < 8 || blockEnd > entry.length || blockEnd <= position) break;
    if (marker === "TEXN" && position + 16 <= blockEnd) {
      const pvrOffset = entry.indexOf(Buffer.from("PVRT"), position + 16);
      if (pvrOffset >= position + 16 && pvrOffset + 8 <= blockEnd) {
        const pvrLength = entry.readUInt32LE(pvrOffset + 4) + 8;
        if (pvrOffset + pvrLength <= blockEnd) {
          const header = Buffer.alloc(12);
          entry.copy(header, 0, position + 8, position + 16);
          header.writeUInt32LE(pvrLength, 8);
          records.push(header, entry.subarray(pvrOffset, pvrOffset + pvrLength));
        }
      }
    }
    position = blockEnd;
  }
  if (records.length / 2 !== expectedTextureCount) {
    throw new Error(
      `Extracted ${records.length / 2}/${expectedTextureCount} textures`,
    );
  }
  return Buffer.concat(records);
}

const options = parseArguments(process.argv.slice(2));
const assets = shenmue2HumanModelAssets(
  options["humans-idx"],
  options["humans-afs"],
);
const matches = assets.filter((asset) => (
  (!options.actor || asset.actorCode === options.actor)
  && (!options.model || asset.modelCode === options.model)
));
if (matches.length !== 1) {
  throw new Error(`Expected one HUMANS model, found ${matches.length}`);
}
const asset = matches[0];
const archive = fs.readFileSync(options["humans-afs"]);
const textureEntryIndex = asset.logicalIndex * 2;
const texturePack = texturePackForEntry(archive, textureEntryIndex);
const outputDirectory = path.resolve(options["out-dir"]);
const textureStem = asset.modelCode.replace(/_L$/, "");
fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(
  path.join(outputDirectory, `${asset.modelCode}.CHRM`),
  asset.modelBytes,
);
fs.writeFileSync(
  path.join(outputDirectory, `${textureStem}_textures.bin`),
  texturePack,
);
process.stderr.write(
  `Extracted ${asset.actorCode}/${asset.modelCode} from HUMANS pair `
  + `${textureEntryIndex}/${textureEntryIndex + 1}\n`,
);
