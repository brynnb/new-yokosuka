#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MotnLoader } from "../../src/MotnLoader.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const sourceRoot = [
  process.env.SHENMUE_DISC1_EXTRACTED_ROOT,
  path.join(repoRoot, "extracted_files"),
].filter(Boolean).find(existsSync);
if (!sourceRoot) {
  throw new Error("an exact Shenmue Disc 1 extraction was not found");
}

const sourceRelativePath = "data/SCENE/01/JOMO/COMMON01.PKS";
const sourcePath = path.join(sourceRoot, sourceRelativePath);
const outputDirectory = path.join(repoRoot, "play/assets/hazuki");
const outputPath = path.join(outputDirectory, "M_JOMO.MOTN");
const manifestPath = path.join(outputDirectory, "M_JOMO.manifest.json");
const expected = Object.freeze({
  sourceSha256: "4b117711c45ca0a94690ce14b8896ddb5feacfde0ba5c7f2a13ae5310201ba22",
  decodedSha256: "04c50d4ce80de10f88670ac470528dcc5c5316e202e825ffc073aa7740f2d879",
  memberSha256: "581290595e671cb9d70fd37b7207391ea18d0b2d623ac2f73973280024c57b14",
  byteLength: 229212,
});
const requiredMotions = Object.freeze([
  Object.freeze({
    request: 0x203e,
    index: 61,
    name: "AKI_DERU_DENWA_A_GORODENWA_F",
  }),
  Object.freeze({
    request: 0x203f,
    index: 62,
    name: "AKI_DERU_DENWA_B_GORODENWA_F",
  }),
]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function ascii(bytes, offset, length) {
  return bytes.subarray(offset, offset + length).toString("ascii");
}

function archiveMember(bytes, memberName, extension) {
  if (!Buffer.isBuffer(bytes) || !["PAKS", "PAKF"].includes(ascii(bytes, 0, 4))) {
    throw new Error("COMMON01.PKS is not a PAKS container");
  }
  const ipacOffset = bytes.readUInt32LE(4);
  if (ascii(bytes, ipacOffset, 4) !== "IPAC") {
    throw new Error("COMMON01.PKS has no valid IPAC dictionary");
  }
  const dictionaryOffset = ipacOffset + bytes.readUInt32LE(ipacOffset + 4);
  const count = bytes.readUInt32LE(ipacOffset + 8);
  if (count > 10000 || dictionaryOffset + count * 20 > bytes.length) {
    throw new Error("COMMON01.PKS has an invalid IPAC dictionary");
  }
  for (let index = 0; index < count; index += 1) {
    const entry = dictionaryOffset + index * 20;
    const name = ascii(bytes, entry, 8).replace(/[\0 ]+$/g, "");
    const type = ascii(bytes, entry + 8, 4).replace(/[\0 ]+$/g, "");
    const offset = bytes.readUInt32LE(entry + 12);
    const size = bytes.readUInt32LE(entry + 16);
    if (name !== memberName || type !== extension) continue;
    const start = ipacOffset + offset;
    if (start > bytes.length || size > bytes.length - start) {
      throw new Error(`${memberName}.${extension} exceeds its PAKS container`);
    }
    return bytes.subarray(start, start + size);
  }
  throw new Error(`${memberName}.${extension} was not found in COMMON01.PKS`);
}

const source = readFileSync(sourcePath);
if (sha256(source) !== expected.sourceSha256) {
  throw new Error("COMMON01.PKS source SHA-256 changed");
}
const decoded = gunzipSync(source);
if (sha256(decoded) !== expected.decodedSha256) {
  throw new Error("decoded COMMON01.PKS SHA-256 changed");
}
const motion = archiveMember(decoded, "M_JOMO", "MOTN");
if (
  motion.length !== expected.byteLength
  || sha256(motion) !== expected.memberSha256
) {
  throw new Error("M_JOMO.MOTN source member changed");
}

const parsed = MotnLoader.parse(motion, {
  sequenceIndices: requiredMotions.map(item => item.index),
});
for (const required of requiredMotions) {
  const sequence = parsed.sequences.find(item => item.index === required.index);
  if (
    sequence?.name !== required.name
    || sequence.valid !== true
    || sequence.valueData?.complete !== true
  ) {
    throw new Error(`telephone request 0x${required.request.toString(16)} changed`);
  }
}

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(outputPath, motion);
writeFileSync(manifestPath, `${JSON.stringify({
  schema: "new-yokosuka-jomo-telephone-motion-pack-v1",
  generatedBy: "tools/animation/build_jomo_telephone_motion_pack.mjs",
  source: {
    disc: 1,
    path: `extracted_files/${sourceRelativePath}`,
    sha256: expected.sourceSha256,
    decodedSha256: expected.decodedSha256,
    archiveMember: "M_JOMO.MOTN",
  },
  output: {
    path: "play/assets/hazuki/M_JOMO.MOTN",
    byteLength: motion.length,
    sha256: expected.memberSha256,
  },
  nativeRegistry: {
    lowerExclusive: 0x2000,
    upperExclusive: 0x2046,
    indexRule: "request - lowerExclusive - 1",
  },
  motions: requiredMotions,
}, null, 2)}\n`);
console.log(`Wrote exact JOMO telephone motions to ${outputPath}`);
