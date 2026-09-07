#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = [
  process.env.SHENMUE_DISC1_EXTRACTED_ROOT,
  path.join(repoRoot, "extracted_files"),
].filter(Boolean).find(existsSync);
const decoder = [
  process.env.VGMSTREAM_CLI,
  path.join(repoRoot, ".disc-work/tooling/vgmstream/vgmstream-cli"),
].filter(Boolean).find(existsSync);
if (!sourceRoot || !decoder) {
  throw new Error("Disc 1 extracted files and vgmstream-cli r2117 are required");
}

const definitions = [
  {
    archive: "SA1071.AFS",
    sha256: "7587943ce2910d652a5a1674a8fcfa285fd9f6c8d2d6be2e58e6183541418340",
    voices: ["SA1071A001", "SA1071A002", "SA1071A003", "SA1071A004"],
    evidence: "tools/evidence/d000-phone-book-interaction.json",
  },
  {
    archive: "SA1080.AFS",
    sha256: "632c862cfd6c8aa6584c0aed55a702e79031db56485f8fa7cc459b0f8d122432",
    voices: ["SA1080A002", "SA1080A003", "SA1080A004", "SA1080A005", "SA1080A006"],
    evidence: "tools/evidence/d000-door-1-closed-check.json",
  },
  {
    archive: "SA1081.AFS",
    sha256: "d3a46fd1f6bdc2ec427f3395ba0daa5fa9ff1df04591629f729867e418f9cdce",
    voices: ["SA1081A002", "SA1081A003", "SA1081A005", "SA1081A006"],
    evidence: "tools/evidence/d000-door-51-closed-check.json",
  },
  {
    archive: "SA1088.AFS",
    sha256: "0cff29cb2f9a1af46fda182ede40c2ddb17de906f92e6ee8b3cf62d836eee438",
    voices: ["SA1088A001", "SA1088A002", "SA1088A003", "SA1088A004", "SA1088A005"],
    evidence: "tools/evidence/d000-door-61-closed-check.json",
  },
];
const sha256 = value => createHash("sha256").update(value).digest("hex");
const align = value => (value + 0x7ff) & ~0x7ff;

function parseAfsMembers(bytes) {
  if (bytes.subarray(0, 4).toString("ascii") !== "AFS\0") {
    throw new Error("dialogue source is not an AFS archive");
  }
  const count = bytes.readUInt32LE(4);
  if (count <= 0 || 8 + count * 8 > bytes.length) {
    throw new Error("dialogue AFS member table is invalid");
  }
  const extents = Array.from({ length: count }, (_, index) => ({
    index,
    offset: bytes.readUInt32LE(8 + index * 8),
    length: bytes.readUInt32LE(12 + index * 8),
  }));
  if (extents.some(member => member.offset + member.length > bytes.length)) {
    throw new Error("dialogue AFS member exceeds archive bounds");
  }
  const directory = align(Math.max(...extents.map(member => member.offset + member.length)));
  if (directory + count * 0x30 > bytes.length) {
    throw new Error("dialogue AFS directory is missing");
  }
  return extents.map(member => ({
    ...member,
    name: bytes.subarray(directory + member.index * 0x30, directory + member.index * 0x30 + 32)
      .toString("ascii").split("\0", 1)[0],
  }));
}

const outputDirectory = path.join(repoRoot, "public/audio/dialogue");
mkdirSync(outputDirectory, { recursive: true });
const temporary = mkdtempSync(path.join(tmpdir(), "new-yokosuka-door-voices-"));
const lines = [{ voiceId: "F1030B001", url: "/audio/dialogue/F1030B001.wav" }];
const sources = [];
try {
  for (const definition of definitions) {
    const archivePath = path.join(sourceRoot, "data/SCENE/01/STREAM", definition.archive);
    const bytes = readFileSync(archivePath);
    if (sha256(bytes) !== definition.sha256) {
      throw new Error(`${definition.archive} SHA-256 changed`);
    }
    const members = parseAfsMembers(bytes);
    const packedVoices = [];
    for (const voiceId of definition.voices) {
      const member = members.find(candidate => candidate.name.toLowerCase() === `${voiceId}.str`.toLowerCase());
      if (!member) throw new Error(`${voiceId} is absent from ${definition.archive}`);
      const source = bytes.subarray(member.offset, member.offset + member.length);
      const streamPath = path.join(temporary, `${voiceId}.str`);
      const wavPath = path.join(temporary, `${voiceId}.wav`);
      writeFileSync(streamPath, source);
      execFileSync(decoder, ["-i", "-o", wavPath, streamPath], { stdio: "pipe" });
      const wav = readFileSync(wavPath);
      if (wav.subarray(0, 4).toString("ascii") !== "RIFF" || wav.subarray(8, 12).toString("ascii") !== "WAVE") {
        throw new Error(`${voiceId} did not decode to WAV`);
      }
      writeFileSync(path.join(outputDirectory, `${voiceId}.wav`), wav);
      lines.push({ voiceId, url: `/audio/dialogue/${voiceId}.wav` });
      packedVoices.push({
        voiceId, member: member.name, sourceSha256: sha256(source),
        byteLength: wav.length, sha256: sha256(wav),
      });
    }
    sources.push({
      archive: path.relative(repoRoot, archivePath), sha256: definition.sha256,
      evidence: definition.evidence, voices: packedVoices,
    });
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

lines.sort((left, right) => left.voiceId.localeCompare(right.voiceId));
writeFileSync(path.join(outputDirectory, "manifest.json"), `${JSON.stringify({
  schema: "new-yokosuka-dialogue-voice-pack-v2",
  generatedBy: "tools/audio/build_d000_closed_door_voice_pack.mjs",
  decoder: "vgmstream-cli r2117",
  lines,
  sources,
}, null, 2)}\n`);
console.log(`Wrote ${lines.length - 1} recovered closed-door voices to ${outputDirectory}`);
