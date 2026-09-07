#!/usr/bin/env node
import fs from "node:fs";

function usage() {
    console.error(
        "Usage: node tools/assets/build_humans_texture_pack.js <HUMANS.AFS> <entry> <output.bin>",
    );
}

const [afsPath, entryText, outputPath] = process.argv.slice(2);
const entryIndex = Number.parseInt(entryText, 10);
if (
    !afsPath
    || !outputPath
    || !Number.isInteger(entryIndex)
    || entryIndex < 0
) {
    usage();
    process.exit(2);
}

const afs = fs.readFileSync(afsPath);
if (afs.subarray(0, 3).toString("ascii") !== "AFS") {
    throw new Error(`${afsPath} is not an AFS archive.`);
}
const entryCount = afs.readUInt32LE(4);
if (entryIndex >= entryCount) {
    throw new Error(`AFS entry ${entryIndex} is outside 0..${entryCount - 1}.`);
}
const tableOffset = 8 + entryIndex * 8;
const entryOffset = afs.readUInt32LE(tableOffset);
const entryLength = afs.readUInt32LE(tableOffset + 4);
const entry = afs.subarray(entryOffset, entryOffset + entryLength);
if (entry.subarray(0, 4).toString("ascii") !== "PAKF") {
    throw new Error(`AFS entry ${entryIndex} is not a PAKF texture package.`);
}

const packageSize = entry.readUInt32LE(4);
const expectedTextures = entry.readUInt32LE(12);
const records = [];
let position = 16;
while (position + 8 <= Math.min(packageSize, entry.length)) {
    const marker = entry.subarray(position, position + 4).toString("ascii");
    const blockSize = entry.readUInt32LE(position + 4);
    const blockEnd = position + blockSize;
    if (
        blockSize < 8
        || blockEnd > entry.length
        || blockEnd <= position
    ) {
        break;
    }

    if (marker === "TEXN" && position + 16 <= blockEnd) {
        const identifier = entry.subarray(position + 8, position + 16);
        const pvrOffset = entry.indexOf(Buffer.from("PVRT"), position + 16);
        if (pvrOffset >= position + 16 && pvrOffset + 8 <= blockEnd) {
            const pvrLength = entry.readUInt32LE(pvrOffset + 4) + 8;
            if (pvrOffset + pvrLength <= blockEnd) {
                const header = Buffer.alloc(12);
                identifier.copy(header, 0);
                header.writeUInt32LE(pvrLength, 8);
                records.push(
                    header,
                    entry.subarray(pvrOffset, pvrOffset + pvrLength),
                );
            }
        }
    }
    position = blockEnd;
}

const extractedTextures = records.length / 2;
if (extractedTextures !== expectedTextures) {
    throw new Error(
        `Extracted ${extractedTextures}/${expectedTextures} textures from entry ${entryIndex}.`,
    );
}
fs.writeFileSync(outputPath, Buffer.concat(records));
console.log(
    `Wrote ${extractedTextures} textures from HUMANS entry ${entryIndex} to ${outputPath}.`,
);
