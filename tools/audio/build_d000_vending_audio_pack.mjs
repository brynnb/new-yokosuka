#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseDTPK,
  translateDTPKRate,
} from "../lib/dtpk.mjs";
import {
  decodedDTPKSample,
  encodeDeterministicWebMOpus,
  normalizeDTPKDumpWav,
  setPcmSampleRate,
} from "../lib/DTPKAudioPack.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const sourceCandidates = [
  process.env.SHENMUE_DISC1_EXTRACTED_ROOT,
  path.join(repoRoot, "extracted_files"),
].filter(Boolean);
const sourceRoot = sourceCandidates.find(existsSync);
if (!sourceRoot) {
  throw new Error(
    `Disc 1 extraction not found. Tried: ${sourceCandidates.join(", ")}`,
  );
}

const decodedDirectory = process.argv[2]
  ? path.resolve(process.argv[2])
  : null;
if (!decodedDirectory || !existsSync(decodedDirectory)) {
  throw new Error(
    "Usage: node tools/audio/build_d000_vending_audio_pack.mjs "
    + "<A1_YANJI DTPKDump -wavconv output directory>",
  );
}

const bankPath = path.join(
  sourceRoot,
  "data/SCENE/01/SOUND/A1_YANJI.SND",
);
const evidencePath = path.join(
  repoRoot,
  "tools/evidence/d000-vending-interaction.json",
);
const outputDirectory = path.join(
  repoRoot,
  "public/audio/world/a1_yanji",
);
const bank = readFileSync(bankPath);
const evidenceBytes = readFileSync(evidencePath);
const evidence = JSON.parse(evidenceBytes);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const parsedBank = parseDTPK(bank);
const group = parsedBank.groups.find(
  ({ descriptorHex }) => descriptorHex === "a904",
);
if (!group) throw new Error("A1_YANJI.SND does not declare group A904");
if (group.trackCount !== 24) {
  throw new Error(`A1_YANJI A904 has ${group.trackCount} tracks, expected 24`);
}

const playbackById = new Map(
  parsedBank.playbacks.map((playback) => [playback.playbackId, playback]),
);
const commands = [...new Set(
  evidence.authoredSequences.flatMap(({ sounds }) => (
    sounds.filter(({ stop }) => !stop).map(({ commandHex }) => commandHex)
  )),
)].sort();
if (commands.some((command) => !command.startsWith("a904"))) {
  throw new Error("Vending AUTH evidence references a non-A904 command");
}

function playbackForCommand(commandHex) {
  const track = Number.parseInt(commandHex.slice(4, 6), 16);
  const parsedTrack = group.tracks[track];
  if (
    !parsedTrack
    || !parsedTrack.playable
    || parsedTrack.entries.length !== 1
  ) {
    throw new Error(`${commandHex} is not a simple playable A904 SFX`);
  }
  const entry = parsedTrack.entries[0];
  const playback = playbackById.get(entry.playbackId);
  if (!playback) {
    throw new Error(
      `${commandHex} references missing playback ${entry.playbackId}`,
    );
  }
  return {
    ...playback,
    track,
    rawVolume: entry.volume,
    compositionHex: parsedTrack.compositionHex,
  };
}

mkdirSync(outputDirectory, { recursive: true });
const tracks = [];
for (const commandHex of commands) {
  const playback = playbackForCommand(commandHex);
  const sourceFilename = decodedDTPKSample(
    decodedDirectory,
    playback.sampleId,
    "A1_YANJI",
  );
  const sampleRate = translateDTPKRate(playback.dtpkRate);
  if (!sampleRate) {
    throw new Error(
      `Unmapped DTPK rate 0x${playback.dtpkRate.toString(16)}`,
    );
  }
  const pcm = setPcmSampleRate(
    normalizeDTPKDumpWav(
      readFileSync(path.join(decodedDirectory, sourceFilename)),
      sourceFilename,
    ),
    sampleRate,
  );
  const output = encodeDeterministicWebMOpus(
    pcm,
    `a1_yanji:${commandHex}`,
  );
  writeFileSync(path.join(outputDirectory, `${commandHex}.webm`), output);
  tracks.push({
    commandHex,
    track: playback.track,
    playbackId: playback.playbackId,
    sampleId: playback.sampleId,
    dtpkRate: `0x${playback.dtpkRate.toString(16).padStart(4, "0")}`,
    sampleRate,
    rawVolume: playback.rawVolume,
    compositionHex: playback.compositionHex,
    decodedSource: sourceFilename,
    byteLength: output.length,
    sha256: sha256(output),
  });
}

const manifest = {
  schema: "new-yokosuka-d000-vending-audio-pack-v1",
  generatedBy: "tools/audio/build_d000_vending_audio_pack.mjs",
  source: {
    bank: "extracted_files/data/SCENE/01/SOUND/A1_YANJI.SND",
    byteLength: bank.length,
    sha256: sha256(bank),
    commandGroup: "a904",
    commandGroupTrackCount: group.trackCount,
    evidence: path.relative(repoRoot, evidencePath),
    evidenceSha256: sha256(evidenceBytes),
  },
  decoder: {
    repository: "https://github.com/Preppy/dtpkdump",
    commit: "a323c0e7e80af05e17e5bb291a9b20e55a3f9455",
    command: "python DTPKDump.py -wavconv A1_YANJI.SND",
    wavNormalization: "remove DTPKDump's four 64-bit-size padding words",
  },
  encoding: {
    container: "webm",
    codec: "opus",
    bitRate: 48000,
    variableBitRate: true,
    application: "lowdelay",
  },
  purpose: "native D000 DJHN AUTH vending-sequence effects",
  runtimeStatus: "packaged but intentionally unwired pending exact AUTH timeline mapping",
  tracks,
};
writeFileSync(
  path.join(outputDirectory, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(
  `Wrote ${tracks.length} native A1_YANJI vending tracks to ${
    outputDirectory
  }.`,
);
