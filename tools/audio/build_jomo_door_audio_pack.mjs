#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  encodeDeterministicWebMOpus,
  normalizeDTPKDumpWav,
  setPcmSampleRate,
} from "../lib/DTPKAudioPack.mjs";
import {
  parseDTPK,
  translateDTPKRate,
} from "../lib/dtpk.mjs";

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
    "Usage: node tools/audio/build_jomo_door_audio_pack.mjs "
    + "<F1OMOYAA.SND DTPKDump -wavconv output directory>",
  );
}

const bankPath = path.join(
  sourceRoot,
  "data/SCENE/01/SOUND/F1OMOYAA.SND",
);
const evidencePath = path.join(
  repoRoot,
  "tools/evidence/jomo-door-audio.json",
);
const outputDirectory = path.join(
  repoRoot,
  "public/audio/world/f1omoyaa",
);
const expectedBankHash =
  "41cdccd04ef8f4835a946f3f1ada404d4f1607adbae6c4bf8da5b825d23c9abb";
const sha256 = (bytes) => (
  createHash("sha256").update(bytes).digest("hex")
);
const definitions = [
  {
    commandHex: "ab020000",
    phase: "openingStart",
    track: 0,
    playbackId: 62,
    sampleId: 16,
  },
  {
    commandHex: "ab020100",
    phase: "closingStart",
    track: 1,
    playbackId: 63,
    sampleId: 15,
  },
  {
    commandHex: "ab020200",
    phase: "openingStart",
    track: 2,
    playbackId: 64,
    sampleId: 20,
  },
  {
    commandHex: "ab020300",
    phase: "closingStart",
    track: 3,
    playbackId: 65,
    sampleId: 19,
  },
  {
    commandHex: "ab020400",
    phase: "openingStart",
    track: 4,
    playbackId: 66,
    sampleId: 55,
  },
  {
    commandHex: "ab020500",
    phase: "closingStart",
    track: 5,
    playbackId: 67,
    sampleId: 54,
  },
  {
    commandHex: "ab020600",
    phase: "openingStart",
    track: 6,
    playbackId: 68,
    sampleId: 34,
  },
  {
    commandHex: "ab020700",
    phase: "closingStart",
    track: 7,
    playbackId: 69,
    sampleId: 33,
  },
  {
    commandHex: "ab020800",
    phase: "openingStart",
    track: 8,
    playbackId: 70,
    sampleId: 22,
  },
  {
    commandHex: "ab020900",
    phase: "closingStart",
    track: 9,
    playbackId: 71,
    sampleId: 21,
  },
];

const bank = readFileSync(bankPath);
if (sha256(bank) !== expectedBankHash) {
  throw new Error("F1OMOYAA.SND SHA-256 changed");
}
const evidenceBytes = readFileSync(evidencePath);
const evidence = JSON.parse(evidenceBytes);
if (
  evidence.schema !== "new-yokosuka-jomo-door-audio-evidence-v3"
  || evidence.runtimePolicy.implementedModels.length !== 7
  || evidence.modelAudioRows?.some((row) => (
    row.commands[0].semanticRole !== "openingStart"
    || row.commands[1].semanticRole !== "closingStart"
  ))
) {
  throw new Error("JOMO door phase schema is not runtime-closed");
}

const parsed = parseDTPK(bank);
const group = parsed.groups.find(
  ({ descriptorHex }) => descriptorHex === "ab02",
);
const decodedFiles = readdirSync(decodedDirectory);
mkdirSync(outputDirectory, { recursive: true });
const tracks = definitions.map((definition) => {
  const parsedTrack = group?.tracks[definition.track];
  const entry = parsedTrack?.entries[0];
  const playback = parsed.playbacks.find(
    ({ playbackId }) => playbackId === entry?.playbackId,
  );
  if (
    parsedTrack?.commandHex !== definition.commandHex
    || !parsedTrack.playable
    || parsedTrack.entries.length !== 1
    || playback?.playbackId !== definition.playbackId
    || playback.sampleId !== definition.sampleId
  ) {
    throw new Error(`${definition.commandHex} native route changed`);
  }
  const sampleRate = translateDTPKRate(playback.dtpkRate);
  if (sampleRate !== 11025) {
    throw new Error(`${definition.commandHex} sample rate changed`);
  }
  const marker = `_Sample_${definition.sampleId
    .toString(16).padStart(2, "0")}_`;
  const sourceFilename = decodedFiles.find((candidate) => (
    candidate.toLowerCase().includes(marker.toLowerCase())
    && !candidate.startsWith("fixed-")
    && candidate.toLowerCase().endsWith(".wav")
  ));
  if (!sourceFilename) {
    throw new Error(`Decoded F1OMOYAA sample ${marker} was not found`);
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
    `f1omoyaa:${definition.commandHex}`,
  );
  writeFileSync(
    path.join(outputDirectory, `${definition.commandHex}.webm`),
    output,
  );
  return {
    commandHex: definition.commandHex,
    phase: definition.phase,
    models: evidence.modelAudioRows
      .filter((row) => row.commands.some(
        ({ commandHex }) => commandHex === definition.commandHex,
      ))
      .map(({ model }) => model),
    group: "ab02",
    track: definition.track,
    compositionHex: parsedTrack.compositionHex,
    playbackId: playback.playbackId,
    sampleId: playback.sampleId,
    rawVolume: entry.volume,
    dtpkRate: `0x${playback.dtpkRate.toString(16).padStart(4, "0")}`,
    sampleRate,
    decodedSource: sourceFilename,
    asset: `${definition.commandHex}.webm`,
    byteLength: output.length,
    sha256: sha256(output),
  };
});

const manifest = {
  schema: "new-yokosuka-jomo-door-audio-pack-v2",
  generatedBy: "tools/audio/build_jomo_door_audio_pack.mjs",
  source: {
    bank: "extracted_files/data/SCENE/01/SOUND/F1OMOYAA.SND",
    bankSha256: expectedBankHash,
    evidence: "tools/evidence/jomo-door-audio.json",
    evidenceSha256: sha256(evidenceBytes),
    decoder: {
      tool: "DTPKDump",
      commit: "a323c0e7e80af05e17e5bb291a9b20e55a3f9455",
    },
  },
  encoding: {
    container: "WebM",
    codec: "Opus",
    bitrate: "48k",
    application: "lowdelay",
  },
  tracks,
  runtimeStatus: (
    "Wired to all seven model rows. Generated SH-4 consumers select "
    + "field 2 at opening start and field 3 at closing start; synchronized "
    + "retail traces close both phase routes."
  ),
};
writeFileSync(
  path.join(outputDirectory, "door-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(
  `Wrote ${tracks.length} JOMO door tracks to `
  + path.relative(repoRoot, outputDirectory),
);
