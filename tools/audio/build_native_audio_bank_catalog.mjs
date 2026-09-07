#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseDTPK } from "../lib/dtpk.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const sourceDefinitions = [
  {
    disc: 1,
    candidates: [
      process.env.SHENMUE_DISC1_EXTRACTED_ROOT,
      path.join(repoRoot, "extracted_files"),
    ],
  },
  {
    disc: 2,
    candidates: [
      process.env.SHENMUE_DISC2_EXTRACTED_ROOT,
      path.join(repoRoot, "extracted_disc2_v2"),
    ],
  },
  {
    disc: 3,
    candidates: [
      process.env.SHENMUE_DISC3_EXTRACTED_ROOT,
      path.join(repoRoot, "extracted_disc3_v2"),
    ],
  },
];
const sources = sourceDefinitions.map(({ disc, candidates }) => {
  const root = candidates.filter(Boolean).find(existsSync);
  if (!root) {
    throw new Error(
      `Disc ${disc} extraction not found. Tried: ${
        candidates.filter(Boolean).join(", ")
      }`,
    );
  }
  return { disc, root };
});
const outputPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(
    repoRoot,
    ".disc-work/audio/native-audio-bank-catalog.json",
  );
const inventoryPath = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.join(
    repoRoot,
    "tools/evidence/native-audio-bank-inventory.json",
  );

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function filesBelow(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  };
  visit(root);
  return files.sort();
}

function familyFor(relativePath) {
  const filename = path.basename(relativePath).toUpperCase();
  if (filename === "SYSTEM1.SND") return "system";
  if (filename.startsWith("BATTLE") || filename === "QTEBAT.SND") {
    return "battle";
  }
  if (filename.startsWith("BGM") || filename === "SPP004.SND") {
    return "background-music";
  }
  if (filename.startsWith("AMB") || filename === "O15RAIN.SND") {
    return "ambient";
  }
  if (filename.startsWith("A1_") || filename.startsWith("E1")) return "event";
  if (filename.startsWith("F1")) return "location";
  if (filename.startsWith("FRE")) return "free-roam";
  if (filename.startsWith("RIM")) return "room";
  if (filename.startsWith("TSM") || filename.startsWith("TYM")) return "time";
  return "other";
}

function sourceRecord(disc, dataRoot, absolute) {
  return {
    disc,
    path: path.relative(dataRoot, absolute).split(path.sep).join("/"),
  };
}

function compactParsedBank(parsed) {
  const referencedPlaybackIds = new Set();
  const commands = [];
  let eventTrackCount = 0;
  let songTrackCount = 0;
  let unsupportedTrackCount = 0;
  for (const group of parsed.groups) {
    for (const track of group.tracks) {
      if (track.kind === "event") eventTrackCount += 1;
      if (track.kind === "song") songTrackCount += 1;
      if (track.kind === "unsupported" || track.kind === "unknown") {
        unsupportedTrackCount += 1;
      }
      if (!track.playable) continue;
      for (const entry of track.entries) {
        if (entry.playbackId !== undefined) {
          referencedPlaybackIds.add(entry.playbackId);
        }
      }
      commands.push({
        commandHex: track.commandHex,
        groupDescriptor: group.descriptorHex,
        track: track.track,
        flags: track.flags,
        syncGroup: track.syncGroup,
        syncLevel: track.syncLevel,
        compositionHex: track.compositionHex,
        entries: track.entries,
      });
    }
  }
  const playbacks = parsed.playbacks.filter(
    ({ playbackId }) => referencedPlaybackIds.has(playbackId),
  );
  const referencedSampleIds = new Set(
    playbacks.map(({ sampleId }) => sampleId),
  );
  const samples = parsed.samples.filter(
    ({ sampleId }) => referencedSampleIds.has(sampleId),
  );
  return {
    id: parsed.id,
    byteLength: parsed.byteLength,
    sha256: parsed.sha256,
    chunks: parsed.offsets,
    groupCount: parsed.groups.length,
    playbackCount: parsed.playbacks.length,
    sampleCount: parsed.samples.length,
    playableCommandCount: commands.length,
    eventTrackCount,
    songTrackCount,
    unsupportedTrackCount,
    groups: parsed.groups.map((group) => ({
      index: group.index,
      descriptor: group.descriptorHex,
      bank: group.bankHex,
      trackCount: group.trackCount,
      playableTrackCount: group.tracks.filter(({ playable }) => playable).length,
      eventTrackCount: group.tracks.filter(({ kind }) => kind === "event").length,
      songTrackCount: group.tracks.filter(({ kind }) => kind === "song").length,
      unsupportedTrackCount: group.tracks.filter(
        ({ kind }) => kind === "unsupported" || kind === "unknown",
      ).length,
    })),
    commands,
    playbacks,
    samples,
  };
}

const uniqueBanks = new Map();
const rejected = [];
const streamArchives = [];
for (const { disc, root } of sources) {
  const dataRoot = path.join(root, "data");
  for (const absolute of filesBelow(dataRoot)) {
    const extension = path.extname(absolute).toUpperCase();
    if (extension === ".AFS") {
      streamArchives.push({
        ...sourceRecord(disc, dataRoot, absolute),
        byteLength: statSync(absolute).size,
      });
      continue;
    }
    if (extension !== ".SND") continue;
    const bytes = readFileSync(absolute);
    const source = sourceRecord(disc, dataRoot, absolute);
    if (bytes.subarray(0, 4).toString("ascii") !== "DTPK") {
      rejected.push({
        ...source,
        byteLength: bytes.length,
        sha256: sha256(bytes),
        reason: "not-dtpk",
        signatureHex: bytes.subarray(0, 16).toString("hex"),
      });
      continue;
    }
    try {
      const parsed = parseDTPK(bytes);
      let bank = uniqueBanks.get(parsed.sha256);
      if (!bank) {
        bank = {
          ...compactParsedBank(parsed),
          families: new Set(),
          sources: [],
        };
        uniqueBanks.set(parsed.sha256, bank);
      }
      bank.families.add(familyFor(source.path));
      bank.sources.push(source);
    } catch (error) {
      rejected.push({
        ...source,
        byteLength: bytes.length,
        sha256: sha256(bytes),
        reason: "parse-error",
        error: error.message,
      });
    }
  }
}

const banks = [...uniqueBanks.values()]
  .map((bank) => ({
    ...bank,
    families: [...bank.families].sort(),
    sources: bank.sources.sort(
      (left, right) => left.disc - right.disc
        || left.path.localeCompare(right.path),
    ),
  }))
  .sort((left, right) => (
    left.sources[0].disc - right.sources[0].disc
    || left.sources[0].path.localeCompare(right.sources[0].path)
  ));
const allSources = banks.flatMap(({ sources: bankSources }) => bankSources);
const catalog = {
  schema: "new-yokosuka-native-audio-bank-catalog-v1",
  generatedBy: "tools/audio/build_native_audio_bank_catalog.mjs",
  sourcePolicy: {
    roots: sources.map(({ disc }) => ({
      disc,
      environmentVariable: `SHENMUE_DISC${disc}_EXTRACTED_ROOT`,
    })),
    bankIdentity: "SHA-256 of complete native DTPK bytes",
    duplicatePolicy:
      "Byte-identical banks are one record with every disc path retained.",
    semanticPolicy:
      "Families derive only from source filenames; command purposes require "
      + "independent script, executable, motion, or emulator evidence.",
    streamPolicy:
      "AFS archives are inventoried by path and size only in this catalog; "
      + "their entry-level dialogue/stream extraction remains separate.",
  },
  summary: {
    sourceBankCount: allSources.length,
    uniqueBankCount: banks.length,
    byteIdenticalDuplicateCount: allSources.length - banks.length,
    rejectedBankCount: rejected.length,
    playableCommandCount: banks.reduce(
      (total, bank) => total + bank.playableCommandCount,
      0,
    ),
    uniqueSampleCountWithinBanks: banks.reduce(
      (total, bank) => total + bank.sampleCount,
      0,
    ),
    streamArchiveCount: streamArchives.length,
    streamArchiveByteLength: streamArchives.reduce(
      (total, archive) => total + archive.byteLength,
      0,
    ),
  },
  banks,
  rejected: rejected.sort(
    (left, right) => left.disc - right.disc
      || left.path.localeCompare(right.path),
  ),
  streamArchives: streamArchives.sort(
    (left, right) => left.disc - right.disc
      || left.path.localeCompare(right.path),
  ),
};
const inventory = {
  schema: "new-yokosuka-native-audio-bank-inventory-v1",
  generatedBy: "tools/audio/build_native_audio_bank_catalog.mjs",
  sourcePolicy: catalog.sourcePolicy,
  summary: catalog.summary,
  banks: banks.map((bank) => ({
    id: bank.id,
    byteLength: bank.byteLength,
    sha256: bank.sha256,
    families: bank.families,
    sources: bank.sources,
    groupCount: bank.groupCount,
    playbackCount: bank.playbackCount,
    sampleCount: bank.sampleCount,
    playableCommandCount: bank.playableCommandCount,
    eventTrackCount: bank.eventTrackCount,
    songTrackCount: bank.songTrackCount,
    unsupportedTrackCount: bank.unsupportedTrackCount,
    groups: bank.groups,
  })),
  rejected: catalog.rejected,
  streamArchives: catalog.streamArchives,
};

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`);
mkdirSync(path.dirname(inventoryPath), { recursive: true });
writeFileSync(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`);
process.stdout.write(
  `${outputPath}\n${inventoryPath}\n`
  + `${catalog.summary.sourceBankCount} source banks, `
  + `${catalog.summary.uniqueBankCount} unique banks, `
  + `${catalog.summary.playableCommandCount} playable commands, `
  + `${catalog.summary.rejectedBankCount} rejected\n`,
);
