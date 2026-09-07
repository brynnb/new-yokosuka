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

import activityManifest from "../../play/assets/introduction/op00/manifest.json" with { type: "json" };
import { parseAuthSequence } from "../../src/AuthSequence.js";
import { parseAuthStrings } from "../../src/AuthStrings.js";
import { parseNativeSrfRecords } from "../../src/NativeLipSync.js";
import { parseDTPK, translateDTPKRate } from "../lib/dtpk.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = [
  process.env.SHENMUE_DISC1_EXTRACTED_ROOT,
  path.join(root, "extracted_files"),
].filter(Boolean).find(existsSync);
if (!sourceRoot) throw new Error("an exact Shenmue Disc 1 extraction was not found");

const dtpkDump = [
  process.env.DTPK_DUMP,
  process.argv[2],
  path.join(root, ".disc-work/pool-audio/dtpkdump/DTPKDump.py"),
].filter(Boolean).find(existsSync);
const vgmstream = [
  process.env.VGMSTREAM_CLI,
  process.argv[3],
  path.join(root, ".disc-work/tooling/vgmstream/vgmstream-cli"),
].filter(Boolean).find(existsSync);
const python = process.env.DTPK_PYTHON || "python3";
if (!dtpkDump || !vgmstream) {
  throw new Error("DTPKDump.py and vgmstream-cli are required");
}

const streamPath = path.join(sourceRoot, "data/SCENE/01/STREAM/A0114.AFS");
const bankPath = path.join(sourceRoot, "data/SCENE/01/SOUND/A1_PROLG.SND");
const musicArchivePath = path.join(sourceRoot, "data/SCENE/01/STREAM/BGM01.AFS");
const outputDirectory = path.join(root, "public/audio/world/op00");
const musicOutputDirectory = path.join(root, "public/music");
const expected = Object.freeze({
  stream: "1d8b7fd29323c5cc2773016d22350b7289a89d0f06c77af281a7032bfb6990b8",
  bank: "d8d4d8ebe34f0fcae9bdafdfabd4740363e7a10e2c8cc42c476d462d91606441",
  musicArchive: "c7a5829e5a93a39d23e709986db6026b638a4d419c91a63bb41136c30fe705cc",
});

const sha256 = value => createHash("sha256").update(value).digest("hex");
const align = value => (value + 0x7ff) & ~0x7ff;
const commandHex = word => [0, 8, 16, 24]
  .map(shift => ((word >>> shift) & 0xff).toString(16).padStart(2, "0"))
  .join("");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${path.basename(command)} failed: ${result.stderr || result.stdout}`);
  }
}

function afsMembers(bytes, label) {
  if (bytes.subarray(0, 4).toString("binary") !== "AFS\0") {
    throw new Error(`${label} has no AFS signature`);
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
  return extents.map((member) => ({
    ...member,
    name: bytes.subarray(
      directoryOffset + member.index * 0x30,
      directoryOffset + member.index * 0x30 + 0x20,
    ).toString("ascii").replace(/\0.*$/, ""),
    bytes: bytes.subarray(member.offset, member.offset + member.byteLength),
  }));
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
  const blockAlign = output.readUInt16LE(22) * output.readUInt16LE(34) / 8;
  output.writeUInt32LE(output.length - 8, 4);
  output.writeUInt16LE(blockAlign, 32);
  output.writeUInt32LE(sampleRate, 24);
  output.writeUInt32LE(sampleRate * blockAlign, 28);
  return output;
}

function assetRecord(filename, prefix) {
  const value = readFileSync(filename);
  return {
    asset: `${prefix}/${path.basename(filename)}`,
    byteLength: value.length,
    sha256: sha256(value),
  };
}

const oggCrcTable = new Uint32Array(256);
for (let index = 0; index < oggCrcTable.length; index += 1) {
  let remainder = index << 24;
  for (let bit = 0; bit < 8; bit += 1) {
    remainder = remainder & 0x80000000
      ? (remainder << 1) ^ 0x04c11db7
      : remainder << 1;
  }
  oggCrcTable[index] = remainder >>> 0;
}

function normalizeOggSerial(filename, serial) {
  const bytes = readFileSync(filename);
  let offset = 0;
  while (offset < bytes.length) {
    if (bytes.subarray(offset, offset + 4).toString("ascii") !== "OggS") {
      throw new Error(`${path.basename(filename)} has an invalid Ogg page`);
    }
    const segmentCount = bytes[offset + 26];
    const bodyLength = [...bytes.subarray(
      offset + 27,
      offset + 27 + segmentCount,
    )].reduce((total, value) => total + value, 0);
    const pageLength = 27 + segmentCount + bodyLength;
    bytes.writeUInt32LE(serial >>> 0, offset + 14);
    bytes.writeUInt32LE(0, offset + 22);
    let crc = 0;
    for (let cursor = offset; cursor < offset + pageLength; cursor += 1) {
      crc = (
        (crc << 8)
        ^ oggCrcTable[((crc >>> 24) ^ bytes[cursor]) & 0xff]
      ) >>> 0;
    }
    bytes.writeUInt32LE(crc, offset + 22);
    offset += pageLength;
  }
  writeFileSync(filename, bytes);
}

const voicesByName = new Map();
const soundUsages = new Map();
for (const activity of activityManifest.activities) {
  const bytes = readFileSync(path.join(root, activity.asset.path));
  if (bytes.length !== activity.byteLength || sha256(bytes) !== activity.sha256) {
    throw new Error(`OP00 AUTH activity ${activity.slot} changed`);
  }
  const sequence = parseAuthSequence(bytes);
  const strings = parseAuthStrings(bytes).strings;
  for (const frame of sequence.frames) {
    for (const command of frame.commands) {
      if (command.name !== "voice" && command.name !== "sound") continue;
      const sourcePath = strings[command.stringIndex];
      if (typeof sourcePath !== "string") throw new Error("OP00 AUTH audio string is unavailable");
      if (command.name === "voice") {
        const nativeMember = `${path.basename(sourcePath, path.extname(sourcePath))}.str`;
        voicesByName.set(nativeMember.toUpperCase(), { nativeMember, sourcePath });
      } else {
        const hex = commandHex(command.commandWord);
        soundUsages.set(`${hex}:${sourcePath}`, { commandHex: hex, sourcePath });
      }
    }
  }
}
if (voicesByName.size !== 48 || soundUsages.size !== 91) {
  throw new Error("OP00 AUTH audio inventory changed");
}

const stream = readFileSync(streamPath);
const bank = readFileSync(bankPath);
const musicArchive = readFileSync(musicArchivePath);
if (sha256(stream) !== expected.stream) throw new Error("A0114.AFS changed");
if (sha256(bank) !== expected.bank) throw new Error("A1_PROLG.SND changed");
if (sha256(musicArchive) !== expected.musicArchive) throw new Error("BGM01.AFS changed");
const voiceMembers = afsMembers(stream, "A0114.AFS");
const nativeVoiceMembers = voiceMembers.filter(member => (
  path.extname(member.name).toUpperCase() === ".STR"
));
const subtitleMembers = voiceMembers.filter(member => (
  path.extname(member.name).toUpperCase() === ".SRF"
));
if (subtitleMembers.length !== 1) {
  throw new Error("A0114.AFS does not have one SRF member");
}
const subtitleRecords = parseNativeSrfRecords(subtitleMembers[0].bytes);
if (nativeVoiceMembers.length !== subtitleRecords.length) {
  throw new Error("A0114 SRF records do not align with native voice members");
}
const voicePresentationByName = new Map(nativeVoiceMembers.map(
  (member, index) => [member.name.toUpperCase(), subtitleRecords[index]],
));
const musicMembers = afsMembers(musicArchive, "BGM01.AFS");
const parsedBank = parseDTPK(bank);
const bankTracks = new Map(parsedBank.groups.flatMap(group => group.tracks)
  .map(track => [track.commandHex, track]));

const temporary = mkdtempSync(path.join(os.tmpdir(), "new-yokosuka-op00-audio-"));
try {
  const voiceDirectory = path.join(outputDirectory, "voice");
  const sfxDirectory = path.join(outputDirectory, "sfx");
  mkdirSync(voiceDirectory, { recursive: true });
  mkdirSync(sfxDirectory, { recursive: true });
  mkdirSync(musicOutputDirectory, { recursive: true });

  const voices = [];
  for (const [upperName, usage] of [...voicesByName].sort()) {
    const member = voiceMembers.find(candidate => candidate.name.toUpperCase() === upperName);
    // Three authored voice commands name members that are absent from both the
    // exact AFS directory and its IDX lookup. Preserve those native no-ops in
    // metadata instead of inventing or substituting dialogue.
    if (!member) {
      voices.push({
        voiceId: path.basename(usage.nativeMember, ".str"),
        sourcePath: usage.sourcePath,
        nativeMember: usage.nativeMember,
        unavailable: true,
        resolution: "absent-from-pinned-native-stream",
      });
      continue;
    }
    const nativePath = path.join(temporary, usage.nativeMember);
    const outputPath = path.join(voiceDirectory, `${path.basename(usage.nativeMember, ".str")}.wav`);
    writeFileSync(nativePath, member.bytes);
    run(vgmstream, ["-o", outputPath, nativePath]);
    voices.push({
      voiceId: path.basename(usage.nativeMember, ".str"),
      sourcePath: usage.sourcePath,
      nativeMember: usage.nativeMember,
      nativeIndex: member.index,
      nativeByteLength: member.byteLength,
      nativeSha256: sha256(member.bytes),
      speakerId: voicePresentationByName.get(upperName)?.speakerId ?? null,
      sourceText: voicePresentationByName.get(upperName)?.sourceText ?? null,
      displayText: voicePresentationByName.get(upperName)?.displayText ?? null,
      lipSync: voicePresentationByName.get(upperName)?.lipSync ?? null,
      ...assetRecord(outputPath, "public/audio/world/op00/voice"),
    });
  }

  const temporaryBank = path.join(temporary, "A1_PROLG.SND");
  copyFileSync(bankPath, temporaryBank);
  run(python, [dtpkDump, "-wavconv", temporaryBank], { cwd: temporary });
  const decodedFiles = readdirSync(temporary).filter(filename => filename.endsWith(".wav"));
  const assetsByCommand = new Map();
  for (const hex of [...new Set([...soundUsages.values()].map(value => value.commandHex))].sort()) {
    const track = bankTracks.get(hex);
    if (!track?.playable || track.entries.length === 0) {
      throw new Error(`OP00 sound command ${hex} is not playable`);
    }
    const assets = track.entries.map((entry, entryIndex) => {
      const marker = `_Sample_${entry.sampleId.toString(16).padStart(2, "0")}_`;
      const decoded = decodedFiles.find(filename => filename.toLowerCase().includes(marker.toLowerCase()));
      if (!decoded) throw new Error(`DTPK sample ${entry.sampleId} was not decoded`);
      const sampleRate = translateDTPKRate(entry.dtpkRate);
      const output = repairedDtpkWav(readFileSync(path.join(temporary, decoded)), decoded, sampleRate);
      const suffix = track.entries.length === 1 ? "" : `-${entryIndex}`;
      const outputPath = path.join(sfxDirectory, `${hex}${suffix}.wav`);
      writeFileSync(outputPath, output);
      return {
        playbackId: entry.playbackId,
        sampleId: entry.sampleId,
        sampleRate,
        ...assetRecord(outputPath, "public/audio/world/op00/sfx"),
      };
    });
    assetsByCommand.set(hex, assets);
  }
  const sounds = [...soundUsages.values()]
    .sort((left, right) => `${left.commandHex}:${left.sourcePath}`.localeCompare(
      `${right.commandHex}:${right.sourcePath}`,
    ))
    .map(usage => ({ ...usage, assets: assetsByCommand.get(usage.commandHex) }));

  const musicDefinitions = [
    { id: "op00-open1", member: "open1.str", activitySlot: 1 },
    { id: "op00-open2", member: "open2.str", activitySlot: 4 },
  ];
  const music = [];
  for (const definition of musicDefinitions) {
    const member = musicMembers.find(candidate => candidate.name.toLowerCase() === definition.member);
    if (!member) throw new Error(`OP00 music ${definition.member} is missing`);
    const nativePath = path.join(temporary, definition.member);
    const wavPath = path.join(temporary, `${definition.id}.wav`);
    const outputPath = path.join(musicOutputDirectory, `${definition.id}.ogg`);
    writeFileSync(nativePath, member.bytes);
    run(vgmstream, ["-o", wavPath, nativePath]);
    run("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-fflags", "+bitexact", "-i", wavPath,
      "-c:a", "libvorbis", "-q:a", "5",
      "-flags:a", "+bitexact", "-map_metadata", "-1", outputPath,
    ]);
    normalizeOggSerial(
      outputPath,
      definition.activitySlot === 1 ? 0x4f503031 : 0x4f503032,
    );
    music.push({
      trackId: definition.id,
      activitySlot: definition.activitySlot,
      nativeMember: definition.member,
      nativeIndex: member.index,
      nativeByteLength: member.byteLength,
      nativeSha256: sha256(member.bytes),
      ...assetRecord(outputPath, "public/music"),
    });
  }

  const manifest = {
    schema: "new-yokosuka-aseq-audio-pack-v2",
    generatedBy: "tools/cutscenes/build_op00_audio_pack.mjs",
    sources: {
      stream: { path: "extracted_files/data/SCENE/01/STREAM/A0114.AFS", sha256: expected.stream },
      soundBank: { path: "extracted_files/data/SCENE/01/SOUND/A1_PROLG.SND", sha256: expected.bank },
      musicArchive: { path: "extracted_files/data/SCENE/01/STREAM/BGM01.AFS", sha256: expected.musicArchive },
      activityManifest: "play/assets/introduction/op00/manifest.json",
    },
    voices,
    sounds,
    music,
    summary: {
      voiceCount: voices.length,
      soundCueCount: 266,
      soundBindingCount: sounds.length,
      uniqueSoundCommandCount: assetsByCommand.size,
      musicTrackCount: music.length,
    },
  };
  writeFileSync(
    path.join(outputDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log(
    `Wrote ${voices.length} OP00 voices, ${sounds.length} SFX bindings, `
    + `${assetsByCommand.size} decoded SFX commands, and ${music.length} score tracks.`,
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
