import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { parseAuthSequence } from "../../src/AuthSequence.js";
import { parseAuthStrings } from "../../src/AuthStrings.js";
import { parseNativeSrfRecords } from "../../src/NativeLipSync.js";
import { parseDTPK, translateDTPKRate } from "./dtpk.mjs";

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const align = value => (value + 0x7ff) & ~0x7ff;

function afsMembers(bytes, label) {
  if (bytes.subarray(0, 4).toString("binary") !== "AFS\0") {
    throw new Error(`${label} signature changed`);
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
      throw new Error(`${label} member ${member.index} exceeds its archive`);
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
    input.subarray(0, 8), input.subarray(12, 24),
    input.subarray(28, 52), input.subarray(56),
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

function concatenatePcmWav(segments, label) {
  if (!Array.isArray(segments) || segments.length === 0) {
    throw new TypeError(`${label} has no PCM segments`);
  }
  const format = segments[0].subarray(20, 36);
  for (const segment of segments) {
    if (
      segment.length !== 44 + segment.readUInt32LE(40)
      || !segment.subarray(20, 36).equals(format)
    ) throw new Error(`${label} PCM segment format changed`);
  }
  const payload = Buffer.concat(segments.map(segment => segment.subarray(44)));
  const output = Buffer.concat([Buffer.from(segments[0].subarray(0, 44)), payload]);
  output.writeUInt32LE(output.length - 8, 4);
  output.writeUInt32LE(payload.length, 40);
  return output;
}

export function buildNativeAseqAudioPack(config) {
  const authRecords = config.authFiles.map(filename => {
    const bytes = readFileSync(path.join(config.authDirectory, filename));
    return { sequence: parseAuthSequence(bytes), strings: parseAuthStrings(bytes).strings };
  });
  const voicesByName = new Map();
  // A DTPK command identifies playback, not semantic source identity. Native
  // AUTH can legitimately use one command for multiple path strings (for
  // example, equivalent footsteps authored under different activity roots).
  // Preserve every command/path pair because the runtime resolves authored
  // events by both fields, while allowing those records to share one asset.
  const soundsByIdentity = new Map();
  for (const auth of authRecords) {
    for (const frame of auth.sequence.frames) {
      for (const command of frame.commands) {
        if (command.name !== "voice" && command.name !== "sound") continue;
        const sourcePath = auth.strings[command.stringIndex];
        if (typeof sourcePath !== "string") throw new Error("AUTH audio string is unavailable");
        if (command.name === "voice") {
          const nativeMember = `${path.basename(sourcePath, path.extname(sourcePath))}.str`;
          const prior = voicesByName.get(nativeMember.toUpperCase());
          if (prior && prior.sourcePath !== sourcePath) {
            throw new Error(`AUTH voice ${nativeMember} has conflicting source strings`);
          }
          voicesByName.set(nativeMember.toUpperCase(), {
            nativeMember,
            sourcePath,
            speakerId: command.actorTag || prior?.speakerId || null,
          });
        } else {
          const hex = commandHex(command.commandWord);
          // AUTH uses all-bits-set as an authored stop/clear command. It has
          // no DTPK sample and is handled directly by the activity runtime.
          if (hex === "ffffffff") continue;
          const key = `${hex}:${sourcePath}`;
          soundsByIdentity.set(key, { commandHex: hex, sourcePath });
        }
      }
    }
  }

  if (voicesByName.size > 0 && !config.stream) {
    throw new Error("AUTH voice commands require an exact native stream archive");
  }
  const stream = config.stream ? readFileSync(config.stream.path) : null;
  if (stream && sha256(stream) !== config.stream.sha256) {
    throw new Error(`${config.stream.label} changed`);
  }
  const members = stream ? afsMembers(stream, config.stream.label) : [];
  const nativeVoices = members.filter(member => path.extname(member.name).toUpperCase() === ".STR");
  const subtitles = members.filter(member => path.extname(member.name).toUpperCase() === ".SRF");
  if (stream && subtitles.length !== 1) {
    throw new Error(`${config.stream.label} requires one SRF member`);
  }
  const subtitleRecords = stream ? parseNativeSrfRecords(subtitles[0].bytes) : [];
  if (stream && nativeVoices.length !== subtitleRecords.length) {
    throw new Error(`${config.stream.label} SRF records do not align with voices`);
  }
  const presentation = new Map(nativeVoices.map(
    (member, index) => [member.name.toUpperCase(), subtitleRecords[index]],
  ));
  if (soundsByIdentity.size > 0 && !config.soundBank) {
    throw new Error("AUTH sound commands require an exact native sound bank");
  }
  const bank = config.soundBank ? readFileSync(config.soundBank.path) : null;
  if (bank && sha256(bank) !== config.soundBank.sha256) {
    throw new Error(`${config.soundBank.label} changed`);
  }
  const parsedBank = bank ? parseDTPK(bank) : null;
  const temporary = mkdtempSync(path.join(os.tmpdir(), "new-yokosuka-aseq-audio-"));
  try {
    const voiceDirectory = path.join(config.outputDirectory, "voice");
    const sfxDirectory = path.join(config.outputDirectory, "sfx");
    mkdirSync(voiceDirectory, { recursive: true });
    mkdirSync(sfxDirectory, { recursive: true });
    const voices = [];
    for (const [upperName, usage] of [...voicesByName].sort()) {
      const member = members.find(candidate => candidate.name.toUpperCase() === upperName);
      const unavailable = config.unavailableVoices?.[usage.nativeMember];
      if (!member && unavailable) {
        voices.push({
          voiceId: path.basename(usage.nativeMember, ".str"),
          sourcePath: usage.sourcePath,
          nativeMember: usage.nativeMember,
          speakerId: usage.speakerId,
          sourceText: null,
          displayText: null,
          lipSync: null,
          unavailable: true,
          unavailableReason: unavailable.reason,
          evidence: unavailable.evidence,
        });
        continue;
      }
      const configuredVoiceHashes = config.voiceHashes || null;
      const expectedHash = configuredVoiceHashes
        ? configuredVoiceHashes[usage.nativeMember]
        : member && sha256(member.bytes);
      if (!member || !expectedHash || sha256(member.bytes) !== expectedHash) {
        throw new Error(`AUTH voice ${usage.nativeMember} source changed`);
      }
      const nativePath = path.join(temporary, usage.nativeMember);
      const asset = `${path.basename(usage.nativeMember, ".str")}.wav`;
      const outputPath = path.join(voiceDirectory, asset);
      writeFileSync(nativePath, member.bytes);
      run(config.vgmstream, ["-o", outputPath, nativePath]);
      const output = readFileSync(outputPath);
      const record = presentation.get(upperName);
      voices.push({
        voiceId: path.basename(usage.nativeMember, ".str"),
        sourcePath: usage.sourcePath,
        nativeMember: usage.nativeMember,
        nativeIndex: member.index,
        nativeByteLength: member.byteLength,
        nativeSha256: expectedHash,
        speakerId: record?.speakerId ?? null,
        sourceText: record?.sourceText ?? null,
        displayText: record?.displayText ?? null,
        lipSync: record?.lipSync ?? null,
        asset: `${config.outputAssetPrefix}/voice/${asset}`,
        ...wavInfo(output, asset),
      });
    }
    const temporaryBank = config.soundBank
      ? path.join(temporary, path.basename(config.soundBank.path))
      : null;
    if (temporaryBank) {
      copyFileSync(config.soundBank.path, temporaryBank);
      run(config.python, [config.dtpkDump, "-wavconv", temporaryBank], { cwd: temporary });
    }
    const decodedFiles = temporaryBank
      ? readdirSync(temporary).filter(filename => filename.endsWith(".wav"))
      : [];
    const sounds = [];
    const decodedSounds = new Map();
    for (const usage of [...soundsByIdentity.values()].sort(
      (left, right) => left.commandHex.localeCompare(right.commandHex)
        || left.sourcePath.localeCompare(right.sourcePath),
    )) {
      const track = parsedBank.groups.flatMap(group => group.tracks)
        .find(candidate => candidate.commandHex === usage.commandHex);
      if (!track?.playable || track.entries.length === 0) {
        throw new Error(`AUTH sound command ${usage.commandHex} is not a playable track`);
      }
      let decodedSound = decodedSounds.get(usage.commandHex);
      if (!decodedSound) {
        const decodedSegments = track.entries.map((entry) => {
          const marker = `_Sample_${entry.sampleId.toString(16).padStart(2, "0")}_`;
          const decoded = decodedFiles.find(filename => (
            filename.toLowerCase().includes(marker.toLowerCase())
          ));
          if (!decoded) throw new Error(`DTPK sample ${entry.sampleId} was not decoded`);
          const sampleRate = translateDTPKRate(entry.dtpkRate);
          const output = repairedDtpkWav(
            readFileSync(path.join(temporary, decoded)),
            decoded,
            sampleRate,
          );
          return Object.freeze({
            playbackId: entry.playbackId,
            sampleId: entry.sampleId,
            sampleRate,
            bytes: output,
          });
        });
        const sampleRates = new Set(decodedSegments.map(entry => entry.sampleRate));
        if (sampleRates.size !== 1) {
          throw new Error(`AUTH sound command ${usage.commandHex} changes sample rate`);
        }
        const asset = `${usage.commandHex}.wav`;
        const output = track.entries.length === 1
          ? decodedSegments[0].bytes
          : concatenatePcmWav(
              decodedSegments.map(entry => entry.bytes),
              `AUTH sound command ${usage.commandHex}`,
            );
        writeFileSync(path.join(sfxDirectory, asset), output);
        decodedSound = Object.freeze({
          playbackId: decodedSegments[0].playbackId,
          sampleId: decodedSegments[0].sampleId,
          sampleRate: decodedSegments[0].sampleRate,
          asset: `${config.outputAssetPrefix}/sfx/${asset}`,
          ...wavInfo(output, asset),
          ...(decodedSegments.length > 1 ? {
            nativeSegments: decodedSegments.map(entry => Object.freeze({
              playbackId: entry.playbackId,
              sampleId: entry.sampleId,
              sampleRate: entry.sampleRate,
              byteLength: entry.bytes.length,
              sha256: sha256(entry.bytes),
            })),
          } : {}),
        });
        decodedSounds.set(usage.commandHex, decodedSound);
      }
      sounds.push({
        ...usage,
        ...decodedSound,
      });
    }
    const manifest = {
      schema: "new-yokosuka-aseq-audio-pack-v2",
      generatedBy: config.generatedBy,
      sources: {
        stream: config.stream
          ? { disc: config.disc, path: config.stream.manifestPath, sha256: config.stream.sha256 }
          : null,
        soundBank: config.soundBank
          ? { disc: config.disc, path: config.soundBank.manifestPath, sha256: config.soundBank.sha256 }
          : null,
        authManifest: config.authManifest,
        resourceBindingEvidence: config.resourceBindingEvidence,
      },
      voices,
      sounds,
    };
    writeFileSync(path.join(config.outputDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    return Object.freeze(manifest);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
