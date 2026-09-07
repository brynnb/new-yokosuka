#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  parseAuthSequence,
  resolveAuthMotions,
  resolveAuthSoundMotions,
} from "../lib/AuthSequence.js";
import { MotnLoader } from "../../src/MotnLoader.js";

function firstExisting(candidates, label) {
  const found = candidates.map((candidate) => path.resolve(candidate))
    .find(existsSync);
  if (!found) throw new Error(`${label} not found. Tried: ${candidates}`);
  return found;
}

function bytesForMotn(bytes) {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const exactRoot = firstExisting([
  ".disc-work/exact/d000",
], "D000 exact extraction");
const extractedRoot = firstExisting([
  "extracted_files",
], "Disc 1 extraction");
const authPath = path.join(exactRoot, "unpacked/AUTH/SEQDATA0.AUTH");
const motionPath = path.join(exactRoot, "unpacked/AUTH/M_01TE.MOTN");
const mapinfoPath = path.join(exactRoot, "MAPINFO.BIN");
const bankPath = path.join(
  extractedRoot,
  "data/SCENE/01/SOUND/A1_TELP.SND",
);
const outputPath = path.resolve(
  process.argv[2] ?? "tools/evidence/d000-phone-book-audio.json",
);

const authBytes = readFileSync(authPath);
const motionBytes = readFileSync(motionPath);
const mapinfo = readFileSync(mapinfoPath);
const bank = readFileSync(bankPath);
const parsed = parseAuthSequence(bytesForMotn(authBytes));
const motion = MotnLoader.parse(bytesForMotn(motionBytes));
const motions = resolveAuthMotions(parsed, motion);
const sounds = resolveAuthSoundMotions(parsed, motion);
const failures = [];

if (!parsed.timelineComplete) failures.push("AUTH timeline is incomplete");
if (
  motions.length !== 1
  || motions[0].motionName
    !== "AKI_SIRABERU_DENWATYOU_ETC_TABACOYA_0100"
) {
  failures.push("AUTH does not resolve to the expected phone-book motion");
}
if (sounds.length !== 7 || sounds.some((sound) => !sound.motionFrameResolved)) {
  failures.push("Not all seven AUTH sounds resolve to the active motion");
}

const resourceOffsets = {
  bank: mapinfo.indexOf(Buffer.from("a1_telp.snd\0"), 0xaea80),
  resourceType: mapinfo.indexOf(Buffer.from("AUTH\0"), 0xaeaa0),
  sequence: mapinfo.indexOf(Buffer.from("seqdata0.bin\0"), 0xaeab0),
  package: mapinfo.indexOf(Buffer.from("01TEL\0"), 0xaead0),
};
if (
  resourceOffsets.bank !== 0xaea94
  || resourceOffsets.resourceType !== 0xaeabf
  || resourceOffsets.sequence !== 0xaeac4
  || resourceOffsets.package !== 0xaead6
) {
  failures.push("D000 phone-book resource-cluster offsets changed");
}

const fileEvidence = (filename, bytes, logicalPath) => ({
  path: logicalPath,
  byteLength: bytes.length,
  sha256: sha256(bytes),
});
const report = {
  schema: "new-yokosuka-d000-phone-book-audio-v1",
  status: failures.length === 0 ? "verified" : "failed",
  generatedBy: "tools/audio/audit_d000_phone_book_audio.mjs",
  source: {
    auth: fileEvidence(
      authPath,
      authBytes,
      ".disc-work/exact/d000/unpacked/AUTH/SEQDATA0.AUTH",
    ),
    motion: fileEvidence(
      motionPath,
      motionBytes,
      ".disc-work/exact/d000/unpacked/AUTH/M_01TE.MOTN",
    ),
    mapinfo: fileEvidence(
      mapinfoPath,
      mapinfo,
      ".disc-work/exact/d000/MAPINFO.BIN",
    ),
    bank: fileEvidence(
      bankPath,
      bank,
      "extracted_files/data/SCENE/01/SOUND/A1_TELP.SND",
    ),
  },
  resourceCluster: {
    mapinfoRange: ["0xaea94", "0xaeae1"],
    soundBank: {
      name: "a1_telp.snd",
      offset: `0x${resourceOffsets.bank.toString(16)}`,
    },
    authResourceType: {
      name: "AUTH",
      offset: `0x${resourceOffsets.resourceType.toString(16)}`,
    },
    authSequence: {
      name: "seqdata0.bin",
      offset: `0x${resourceOffsets.sequence.toString(16)}`,
    },
    package: {
      name: "01TEL",
      offset: `0x${resourceOffsets.package.toString(16)}`,
    },
  },
  timeline: {
    durationFrames: parsed.durationFrames,
    actors: parsed.actors,
    timelineComplete: parsed.timelineComplete,
    motions: motions.map((event) => ({
      recordOffset: `0x${event.recordOffset.toString(16)}`,
      timelineFrame: event.timelineFrame,
      actorTag: event.actorTag,
      motionId: `0x${event.motionId.toString(16).padStart(4, "0")}`,
      sequenceNumber: event.sequenceNumber,
      sequenceIndex: event.sequenceIndex,
      motionName: event.motionName,
      startFrame: event.startFrame,
      endFrame: event.endFrame,
      motionDurationFrames: event.motionDurationFrames,
    })),
    sounds: sounds.map((event) => ({
      recordOffset: `0x${event.recordOffset.toString(16)}`,
      timelineFrame: event.frame,
      actorTag: event.actorTag,
      commandHex: event.commandHex,
      eventIndex: event.eventIndex,
      motionName: event.motionName,
      motionLocalFrame: event.motionLocalFrame,
      motionFrameResolved: event.motionFrameResolved,
    })),
  },
  exactConclusions: [
    "D000 MAPINFO directly associates A1_TELP.SND, AUTH/SEQDATA0, and package 01TEL in one resource cluster.",
    "The AUTH motion reference resolves to the complete phone-book inspection sequence in M_01TE.MOTN.",
    "All seven A904 sound events resolve to exact local frames in that authored motion interval.",
  ],
  browserStatus: {
    runtimeStatus: "packaged but intentionally unwired",
    unresolved: [
      "The browser stages three shorter M_D000.MOTN phone-book phases rather than the long M_01TE AUTH sequence.",
      "AUTH local frames must not be copied to those separate clips until their temporal correspondence is independently proven.",
    ],
  },
  failures,
};

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `${report.status}: ${sounds.length} phone-book sound events resolve to `
  + `${motions.length} authored motion`,
);
if (failures.length > 0) process.exitCode = 1;
