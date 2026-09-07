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
    "Usage: node tools/audio/build_d000_gacha_audio_pack.mjs "
    + "<E1GACHAP DTPKDump -wavconv output directory>",
  );
}

const bankPath = path.join(
  sourceRoot,
  "data/SCENE/01/SOUND/E1GACHAP.SND",
);
const evidencePath = path.join(
  repoRoot,
  "tools/evidence/d000-gacha-audio.json",
);
const outputDirectory = path.join(
  repoRoot,
  "public/audio/world/e1gachap",
);
const bank = readFileSync(bankPath);
const evidenceBytes = readFileSync(evidencePath);
const evidence = JSON.parse(evidenceBytes);
if (evidence.status !== "verified") {
  throw new Error("D000 gacha audio evidence is not verified");
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const parsedBank = parseDTPK(bank);
const group = parsedBank.groups.find(
  ({ descriptorHex }) => descriptorHex === "a904",
);
if (
  parsedBank.groups.length !== 1
  || !group
  || group.trackCount !== 6
) {
  throw new Error(
    "E1GACHAP.SND is not the expected single six-track A904 bank",
  );
}
const playbackById = new Map(
  parsedBank.playbacks.map((playback) => [playback.playbackId, playback]),
);
const commands = [...new Set(
  evidence.sounds.map(({ commandHex }) => commandHex),
)].sort();
if (
  commands.length !== 6
  || commands.some((commandHex, track) => (
    commandHex !== `a904${track.toString(16).padStart(2, "0")}00`
  ))
) {
  throw new Error("Gacha evidence does not reference A904 tracks 0 through 5");
}

mkdirSync(outputDirectory, { recursive: true });
const tracks = [];
for (const commandHex of commands) {
  const track = Number.parseInt(commandHex.slice(4, 6), 16);
  const parsedTrack = group.tracks[track];
  if (
    !parsedTrack?.playable
    || parsedTrack.entries.length !== 1
  ) {
    throw new Error(`${commandHex} is not one simple playable A904 track`);
  }
  const entry = parsedTrack.entries[0];
  const playback = playbackById.get(entry.playbackId);
  if (!playback) {
    throw new Error(
      `${commandHex} references missing playback ${entry.playbackId}`,
    );
  }
  const sourceFilename = decodedDTPKSample(
    decodedDirectory,
    playback.sampleId,
    "E1GACHAP",
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
    `e1gachap:${commandHex}`,
  );
  writeFileSync(path.join(outputDirectory, `${commandHex}.webm`), output);
  tracks.push({
    commandHex,
    track,
    playbackId: playback.playbackId,
    sampleId: playback.sampleId,
    dtpkRate: `0x${playback.dtpkRate.toString(16).padStart(4, "0")}`,
    sampleRate,
    rawVolume: entry.volume,
    compositionHex: parsedTrack.compositionHex,
    decodedSource: sourceFilename,
    byteLength: output.length,
    sha256: sha256(output),
    runtimeStatus: evidence.runtimeBoundary.verifiedCueCommands
      .includes(commandHex)
      ? "wired at verified authored-motion frame"
      : "packaged but intentionally unwired",
  });
}

const manifest = {
  schema: "new-yokosuka-d000-gacha-audio-pack-v1",
  generatedBy: "tools/audio/build_d000_gacha_audio_pack.mjs",
  source: {
    bank: "extracted_files/data/SCENE/01/SOUND/E1GACHAP.SND",
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
    command: "python DTPKDump.py -wavconv E1GACHAP.SND",
    wavNormalization: "remove DTPKDump's four 64-bit-size padding words",
  },
  encoding: {
    container: "webm",
    codec: "opus",
    bitRate: 48000,
    variableBitRate: true,
    application: "lowdelay",
  },
  purpose: "native D000 gacha-machine interaction effects",
  runtimeStatus: (
    "A904:02 wired at its verified frame; remaining child-coroutine "
    + "timings intentionally unresolved"
  ),
  tracks,
};
writeFileSync(
  path.join(outputDirectory, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(
  `Wrote ${tracks.length} native E1GACHAP tracks to ${outputDirectory}.`,
);
