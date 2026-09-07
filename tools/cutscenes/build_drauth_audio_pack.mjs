#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { parseAuthSequence } from "../../src/AuthSequence.js";
import { parseAuthStrings } from "../../src/AuthStrings.js";
import { parseNativeSrfRecords } from "../../src/NativeLipSync.js";
import { parseDTPK, translateDTPKRate } from "../lib/dtpk.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = [
  process.env.SHENMUE_DISC1_EXTRACTED_ROOT,
  path.join(repoRoot, "extracted_files"),
].filter(Boolean).find(existsSync);
if (!sourceRoot) throw new Error("an exact Shenmue Disc 1 extraction was not found");

const dtpkDump = [
  process.env.DTPK_DUMP,
  process.argv[2],
  path.join(repoRoot, ".disc-work/pool-audio/dtpkdump/DTPKDump.py"),
].filter(Boolean).find(existsSync);
const vgmstream = [
  process.env.VGMSTREAM_CLI,
  process.argv[3],
  path.join(repoRoot, ".disc-work/tooling/vgmstream/vgmstream-cli"),
].filter(Boolean).find(existsSync);
if (!dtpkDump || !vgmstream) {
  throw new Error(
    "DTPKDump.py and vgmstream-cli are required (arguments 1/2 or DTPK_DUMP/VGMSTREAM_CLI)",
  );
}

const python = process.env.DTPK_PYTHON || "python3";
const streamPath = path.join(sourceRoot, "data/SCENE/01/STREAM/01REV.AFS");
const bankPath = path.join(sourceRoot, "data/SCENE/01/SOUND/A1_SENFK.SND");
const authDirectory = path.join(repoRoot, "play/assets/dobuita/drauth");
const outputDirectory = path.join(repoRoot, "public/audio/world/drauth");
const expected = Object.freeze({
  streamSha256: "6bc7b263890198ba5a8f74b49f107491a1d7a139e09f1fc713524c837c753b52",
  bankSha256: "cc416c5966e1a3caf8050ea577c550af0c60b662bdf1a9fb8197c085d7e2ec4f",
  voices: Object.freeze({
    "01REVA001.str": "ba88925abc5bb72c5a9a5ea322048a4e4aeda3077e351e73828ed75081cf6d01",
    "01REVA002.str": "f3c8ffa17e36d4aa02b24927732127052b3071595b024aaf4a4373db20911df7",
    "01REVA003.str": "03ea87293f68926770037764d91f69432998daaf421eed710311f78d09a7590d",
    "01REVA004.str": "c77353f45df09a636195055adfd8cded68363624dfc072ec56d383fbccdd4a55",
    "01REVA005.str": "200c45aa4f8eaa9834f5d9c5773f6cbf0e18a98cb54e87ad6e1b93c501ab443b",
    "01REVB001.str": "e64cd17b37107f624d6c0ec2df54ffcef800bff528c8681be896b71ef4196f04",
    "01REVB002.str": "479c8c4f3e9f2e187452b77511073d7a9ab6fbc0b9fc77e97e4ebdd5ab2fd850",
    "01REVB003.str": "ddf2406fd5dd5fd181637b214c240edd38c2f61b822c34927b5be3bbbbb0a029",
    "01REVB004.str": "db73e9a31306b50da644aca41e5a5ebfa18f60feddb97dc779a2d66b2d1d662e",
    "01REVB005.str": "e74f672468a5922b65c87b1850b7116b954dec49a950e08ae4c684e0dd9acbd0",
    "01REVB006.str": "4b087a5c5d1406566ee65b41448bd1c3660d9d2dbe4961e969d5c6bc3d5723cb",
    "01REVC001.str": "9364b62cdabe068067731e78f26355b41dcbbbf3b376023809c94511bd9191e3",
  }),
});

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const align = value => (value + 0x7ff) & ~0x7ff;

function afsMembers(bytes) {
  if (bytes.subarray(0, 4).toString("binary") !== "AFS\0") {
    throw new Error("01REV.AFS signature changed");
  }
  const count = bytes.readUInt32LE(4);
  const extents = Array.from({ length: count }, (_, index) => ({
    index,
    offset: bytes.readUInt32LE(8 + index * 8),
    byteLength: bytes.readUInt32LE(12 + index * 8),
  }));
  const directoryOffset = align(Math.max(...extents.map(
    member => member.offset + member.byteLength,
  )));
  return extents.map(member => {
    if (member.offset + member.byteLength > bytes.length) {
      throw new Error(`01REV.AFS member ${member.index} exceeds its archive`);
    }
    const name = bytes.subarray(
      directoryOffset + member.index * 0x30,
      directoryOffset + member.index * 0x30 + 0x20,
    ).toString("ascii").replace(/\0.*$/, "");
    return {
      ...member,
      name,
      bytes: bytes.subarray(member.offset, member.offset + member.byteLength),
    };
  });
}

function commandHex(word) {
  return [0, 8, 16, 24]
    .map(shift => ((word >>> shift) & 0xff).toString(16).padStart(2, "0"))
    .join("");
}

function wavInfo(bytes, label) {
  if (
    bytes.subarray(0, 4).toString("ascii") !== "RIFF"
    || bytes.subarray(8, 12).toString("ascii") !== "WAVE"
  ) throw new Error(`${label} is not a WAV file`);
  return { byteLength: bytes.length, sha256: sha256(bytes) };
}

function repairedDtpkWav(input, filename, sampleRate) {
  if (
    input.subarray(0, 4).toString("ascii") !== "RIFF"
    || input.subarray(12, 16).toString("ascii") !== "WAVE"
    || input.subarray(44, 48).toString("ascii") !== "data"
  ) throw new Error(`${filename} does not have DTPKDump's known WAV layout`);
  const output = Buffer.concat([
    input.subarray(0, 8),
    input.subarray(12, 24),
    input.subarray(28, 52),
    input.subarray(56),
  ]);
  if (output.length !== 44 + output.readUInt32LE(40)) {
    throw new Error(`${filename} WAV payload is inconsistent`);
  }
  const blockAlign = output.readUInt16LE(22) * output.readUInt16LE(34) / 8;
  output.writeUInt32LE(output.length - 8, 4);
  output.writeUInt16LE(blockAlign, 32);
  output.writeUInt32LE(sampleRate, 24);
  output.writeUInt32LE(sampleRate * blockAlign, 28);
  return output;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${path.basename(command)} failed: ${result.stderr || result.stdout}`);
  }
}

const authRecords = ["SEQDATA1.AUTH", "SEQDATA2.AUTH"].map(filename => {
  const bytes = readFileSync(path.join(authDirectory, filename));
  return {
    filename,
    sequence: parseAuthSequence(bytes),
    strings: parseAuthStrings(bytes).strings,
  };
});
const voicesByName = new Map();
const soundsByCommand = new Map();
for (const auth of authRecords) {
  for (const frame of auth.sequence.frames) {
    for (const command of frame.commands) {
      if (command.name !== "voice" && command.name !== "sound") continue;
      const sourcePath = auth.strings[command.stringIndex];
      if (typeof sourcePath !== "string") throw new Error("AUTH audio string is unavailable");
      if (command.name === "voice") {
        const nativeMember = `${path.basename(sourcePath, path.extname(sourcePath))}.str`;
        voicesByName.set(nativeMember.toUpperCase(), { nativeMember, sourcePath });
      } else {
        const hex = commandHex(command.commandWord);
        const prior = soundsByCommand.get(hex);
        if (prior && prior.sourcePath !== sourcePath) {
          throw new Error(`AUTH sound command ${hex} has conflicting source strings`);
        }
        soundsByCommand.set(hex, { commandHex: hex, sourcePath });
      }
    }
  }
}

const stream = readFileSync(streamPath);
if (sha256(stream) !== expected.streamSha256) throw new Error("01REV.AFS SHA-256 changed");
const members = afsMembers(stream);
const nativeVoiceMembers = members.filter(member => (
  path.extname(member.name).toUpperCase() === ".STR"
));
const subtitleMembers = members.filter(member => (
  path.extname(member.name).toUpperCase() === ".SRF"
));
if (subtitleMembers.length !== 1) {
  throw new Error("01REV.AFS does not have one SRF member");
}
const subtitleRecords = parseNativeSrfRecords(subtitleMembers[0].bytes);
if (nativeVoiceMembers.length !== subtitleRecords.length) {
  throw new Error("01REV SRF records do not align with native voice members");
}
const voicePresentationByName = new Map(nativeVoiceMembers.map(
  (member, index) => [member.name.toUpperCase(), subtitleRecords[index]],
));
const bank = readFileSync(bankPath);
if (sha256(bank) !== expected.bankSha256) throw new Error("A1_SENFK.SND SHA-256 changed");
const parsedBank = parseDTPK(bank);
const temporary = mkdtempSync(path.join(os.tmpdir(), "new-yokosuka-drauth-audio-"));
try {
  const voiceDirectory = path.join(outputDirectory, "voice");
  const sfxDirectory = path.join(outputDirectory, "sfx");
  mkdirSync(voiceDirectory, { recursive: true });
  mkdirSync(sfxDirectory, { recursive: true });

  const voices = [];
  for (const [upperName, usage] of [...voicesByName].sort()) {
    const expectedHash = expected.voices[usage.nativeMember];
    const member = members.find(candidate => candidate.name.toUpperCase() === upperName);
    if (!member || !expectedHash || sha256(member.bytes) !== expectedHash) {
      throw new Error(`AUTH voice ${usage.nativeMember} source changed`);
    }
    const nativePath = path.join(temporary, usage.nativeMember);
    const asset = `${path.basename(usage.nativeMember, ".str")}.wav`;
    const outputPath = path.join(voiceDirectory, asset);
    writeFileSync(nativePath, member.bytes);
    run(vgmstream, ["-o", outputPath, nativePath]);
    const output = readFileSync(outputPath);
    voices.push({
      voiceId: path.basename(usage.nativeMember, ".str"),
      sourcePath: usage.sourcePath,
      nativeMember: usage.nativeMember,
      nativeIndex: member.index,
      nativeByteLength: member.byteLength,
      nativeSha256: expectedHash,
      speakerId: voicePresentationByName.get(upperName)?.speakerId ?? null,
      sourceText: voicePresentationByName.get(upperName)?.sourceText ?? null,
      displayText: voicePresentationByName.get(upperName)?.displayText ?? null,
      lipSync: voicePresentationByName.get(upperName)?.lipSync ?? null,
      asset: `public/audio/world/drauth/voice/${asset}`,
      ...wavInfo(output, asset),
    });
  }

  const temporaryBank = path.join(temporary, "A1_SENFK.SND");
  copyFileSync(bankPath, temporaryBank);
  run(python, [dtpkDump, "-wavconv", temporaryBank], { cwd: temporary });
  const decodedFiles = readdirSync(temporary).filter(filename => filename.endsWith(".wav"));
  const sounds = [];
  for (const usage of [...soundsByCommand.values()].sort(
    (left, right) => left.commandHex.localeCompare(right.commandHex),
  )) {
    const track = parsedBank.groups.flatMap(group => group.tracks)
      .find(candidate => candidate.commandHex === usage.commandHex);
    if (!track?.playable || track.entries.length !== 1) {
      throw new Error(`AUTH sound command ${usage.commandHex} is not an exact playable track`);
    }
    const entry = track.entries[0];
    const marker = `_Sample_${entry.sampleId.toString(16).padStart(2, "0")}_`;
    const decoded = decodedFiles.find(filename => filename.toLowerCase().includes(marker.toLowerCase()));
    if (!decoded) throw new Error(`DTPK sample ${entry.sampleId} was not decoded`);
    const sampleRate = translateDTPKRate(entry.dtpkRate);
    const output = repairedDtpkWav(readFileSync(path.join(temporary, decoded)), decoded, sampleRate);
    const asset = `${usage.commandHex}.wav`;
    writeFileSync(path.join(sfxDirectory, asset), output);
    sounds.push({
      ...usage,
      playbackId: entry.playbackId,
      sampleId: entry.sampleId,
      sampleRate,
      asset: `public/audio/world/drauth/sfx/${asset}`,
      ...wavInfo(output, asset),
    });
  }

  const manifest = {
    schema: "new-yokosuka-aseq-audio-pack-v2",
    generatedBy: "tools/cutscenes/build_drauth_audio_pack.mjs",
    sources: {
      stream: {
        disc: 1,
        path: "extracted_files/data/SCENE/01/STREAM/01REV.AFS",
        sha256: expected.streamSha256,
      },
      soundBank: {
        disc: 1,
        path: "extracted_files/data/SCENE/01/SOUND/A1_SENFK.SND",
        sha256: expected.bankSha256,
      },
      authManifest: "play/assets/dobuita/drauth/manifest.json",
    },
    voices,
    sounds,
  };
  writeFileSync(
    path.join(outputDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log(`Wrote ${voices.length} voices and ${sounds.length} SFX to ${outputDirectory}`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
