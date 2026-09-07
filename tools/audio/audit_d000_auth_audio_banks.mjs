#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { parseDTPK } from "../lib/dtpk.mjs";

const MAPINFO_SOURCES = Object.freeze({
  D000: Object.freeze({
    path: ".disc-work/exact/d000/MAPINFO.BIN",
    sha256: "7712f3ae8c9e154b3831bc8d8af31ebc135f35d930ae50c503a65e3af34e9b7e",
  }),
  YQ14: Object.freeze({
    path: "extracted_files/data/SCENE/01/YQ14/MAPINFO.BIN",
    sha256: "84ba191106cbc8f882790468bd8a7054f207bf7375e32355519fb6f49bc904bf",
  }),
});
const repoRoot = path.resolve(import.meta.dirname, "../..");
const firstExisting = (candidates, label) => {
  const result = candidates.filter(Boolean)
    .map((candidate) => path.resolve(candidate))
    .find(existsSync);
  if (!result) throw new Error(`${label} not found. Tried: ${candidates}`);
  return result;
};
const exactRoot = firstExisting([
  process.env.SHENMUE_D000_EXACT_ROOT,
  path.join(repoRoot, ".disc-work/exact/d000"),
], "D000 exact extraction");
const extractedRoot = firstExisting([
  process.env.SHENMUE_DISC1_EXTRACTED_ROOT,
  path.join(repoRoot, "extracted_files"),
], "Disc 1 extraction");
const inventoryPath = path.join(
  repoRoot,
  "tools/evidence/d000-auth-audio-inventory.json",
);
const outputPath = path.resolve(
  process.argv[2]
  ?? path.join(repoRoot, "tools/evidence/d000-auth-audio-banks.json"),
);
const mapinfoSources = new Map(Object.entries(MAPINFO_SOURCES).map(
  ([name, source]) => {
    const absolutePath = name === "D000"
      ? path.join(exactRoot, "MAPINFO.BIN")
      : path.join(repoRoot, source.path);
    const bytes = readFileSync(absolutePath);
    return [name, { ...source, bytes }];
  },
));
const inventoryBytes = readFileSync(inventoryPath);
const inventory = JSON.parse(inventoryBytes);
const sha256 = (bytes) => (
  createHash("sha256").update(bytes).digest("hex")
);
const failures = [];
for (const [name, source] of mapinfoSources) {
  if (sha256(source.bytes) !== source.sha256) {
    failures.push(`${name} MAPINFO SHA-256 changed: ${sha256(source.bytes)}`);
  }
}

function exactString(sourceName, offset, value) {
  const source = mapinfoSources.get(sourceName);
  if (!source) throw new Error(`Unknown MAPINFO source ${sourceName}`);
  const expected = Buffer.from(`${value}\0`);
  const actual = source.bytes.subarray(offset, offset + expected.length);
  if (!actual.equals(expected)) {
    failures.push(
      `${sourceName} MAPINFO 0x${offset.toString(16)} is not ${JSON.stringify(value)}`,
    );
  }
  return { value, offset: `0x${offset.toString(16)}` };
}

const definitions = [
  {
    family: "D0W0",
    mapinfoSource: "D000",
    bankName: "A1_YAMAW.SND",
    bankOffset: 0xadb21,
    resourceRange: ["0xadb11", "0xadc5c"],
    sequenceOffsets: Array.from(
      { length: 12 },
      (_, index) => 0xadb60 + index * 0x12,
    ),
    sequenceNames: [
      ..."123456789".split("").map((value) => `seqdata${value}.bin`),
      "seqdataA.bin",
      "seqdataB.bin",
      "seqdataC.bin",
    ],
    inventoryPrefix: "D0W0/",
  },
  {
    family: "AUTH",
    mapinfoSource: "D000",
    bankName: "A1_TELP.SND",
    bankOffset: 0xaea94,
    resourceRange: ["0xaea83", "0xaeae1"],
    sequenceOffsets: [0xaeac4],
    sequenceNames: ["seqdata0.bin"],
    inventoryPrefix: "AUTH/",
  },
  {
    family: "BUSS",
    mapinfoSource: "D000",
    bankName: "A1_BUSNO.SND",
    bankOffset: 0xaefed,
    resourceRange: ["0xaefed", "0xaf080"],
    resourceStrings: [
      { offset: 0xaf033, value: "a1_busno.snd", role: "alternateBranchSoundBank" },
    ],
    sequenceOffsets: [0xaf00f, 0xaf021, 0xaf055, 0xaf067],
    sequenceNames: [
      "seqdata1.bin",
      "seqdata4.bin",
      "seqdata2.bin",
      "seqdata5.bin",
    ],
    inventoryPrefix: "BUSS/",
  },
  {
    family: "DJHN",
    mapinfoSource: "D000",
    bankName: "A1_YANJI.SND",
    bankOffset: 0xb1a09,
    resourceRange: ["0xb1873", "0xb1a26"],
    sequenceOffsets: Array.from(
      { length: 7 },
      (_, index) => 0xb1935 + index * 0x15,
    ),
    sequenceNames: Array.from(
      { length: 7 },
      (_, index) => `seqdata${index + 1}.bin`,
    ),
    inventoryPrefix: "DJHN/",
  },
  {
    family: "YQ14",
    mapinfoSource: "YQ14",
    bankName: "N1014_4.SND",
    bankOffset: 0x57db0,
    resourceRange: ["0x57db0", "0x57e27"],
    resourceStrings: [
      { offset: 0x57df6, value: "E1002", role: "event" },
      { offset: 0x57dfc, value: "A01114", role: "streamArchive" },
      { offset: 0x57e03, value: "M_YQ14.BIN", role: "roomScript" },
      { offset: 0x57e0e, value: "M_01114.BIN", role: "eventScript" },
    ],
    sequenceOffsets: [],
    sequenceNames: ["seqdata1.bin", "seqdata2.bin"],
    inventoryPrefix: "YQ14/",
  },
  {
    family: "YBHN",
    mapinfoSource: "D000",
    bankName: "A1_YOBI.SND",
    bankOffset: 0xaf88d,
    resourceRange: ["0xaf881", "0xaf8c8"],
    resourceStrings: [
      { offset: 0xaf882, value: "bgm018.snd", role: "music" },
      { offset: 0xaf8a9, value: "YBHN", role: "resource" },
      { offset: 0xaf8bb, value: "YBHN", role: "archive" },
      { offset: 0xaf8c0, value: "DR15_012", role: "event" },
    ],
    sequenceOffsets: [0xaf8ae],
    sequenceNames: ["seqdata0.bin"],
    inventoryPrefix: "YBHN/",
  },
];

const mappings = definitions.map((definition) => {
  exactString(
    definition.mapinfoSource,
    definition.bankOffset,
    definition.bankName.toLowerCase(),
  );
  const sequenceResources = definition.sequenceOffsets.map(
    (offset, index) => exactString(
      definition.mapinfoSource,
      offset,
      definition.sequenceNames[index],
    ),
  );
  const relatedResources = (definition.resourceStrings || []).map(resource => ({
    role: resource.role,
    ...exactString(definition.mapinfoSource, resource.offset, resource.value),
  }));
  const bankPath = path.join(
    extractedRoot,
    "data/SCENE/01/SOUND",
    definition.bankName,
  );
  const bank = readFileSync(bankPath);
  const parsed = parseDTPK(bank);
  const commands = new Set(
    parsed.groups.flatMap(({ tracks }) => (
      tracks.filter(({ playable }) => playable).map(({ commandHex }) => (
        commandHex
      ))
    )),
  );
  const files = inventory.files.filter(({ path: sourcePath }) => (
    sourcePath.startsWith(definition.inventoryPrefix)
    && sourcePath.split("/").length === 2
  ));
  const authoredCommands = [...new Set(
    files.flatMap(({ sounds }) => (
      sounds.filter(({ stop }) => !stop).map(({ commandHex }) => commandHex)
    )),
  )].sort();
  const absentCommands = authoredCommands.filter(
    (command) => !commands.has(command),
  );
  if (files.length !== definition.sequenceNames.length) {
    failures.push(
      `${definition.family} inventory has ${files.length} sequences, expected `
      + definition.sequenceNames.length,
    );
  }
  if (absentCommands.length) {
    failures.push(
      `${definition.family} commands absent from ${definition.bankName}: `
      + absentCommands.join(", "),
    );
  }
  return {
    family: definition.family,
    status: absentCommands.length === 0
      ? "resource-cluster-and-command-set-verified"
      : "failed",
    resourceCluster: {
      mapinfoSource: definition.mapinfoSource,
      mapinfoRange: definition.resourceRange,
      soundBank: exactString(
        definition.mapinfoSource,
        definition.bankOffset,
        definition.bankName.toLowerCase(),
      ),
      sequenceResources,
      relatedResources,
    },
    bank: {
      path: `extracted_files/data/SCENE/01/SOUND/${definition.bankName}`,
      byteLength: bank.length,
      sha256: sha256(bank),
      groups: parsed.groups.map((group) => ({
        descriptorHex: group.descriptorHex,
        trackCount: group.trackCount,
        playableTrackCount: group.tracks.filter(({ playable }) => playable)
          .length,
      })),
    },
    authFileCount: files.length,
    soundEventCount: files.reduce(
      (total, file) => total + file.sounds.length,
      0,
    ),
    authoredCommands,
    absentCommands,
  };
});

const report = {
  schema: "new-yokosuka-d000-auth-audio-banks-v1",
  status: failures.length ? "failed" : "verified",
  generatedBy: "tools/audio/audit_d000_auth_audio_banks.mjs",
  source: {
    mapinfo: Object.fromEntries([...mapinfoSources].map(([name, source]) => [
      name,
      {
        path: source.path,
        byteLength: source.bytes.length,
        sha256: sha256(source.bytes),
      },
    ])),
    authInventory: {
      path: "tools/evidence/d000-auth-audio-inventory.json",
      sha256: sha256(inventoryBytes),
    },
  },
  method: [
    "Require every exact source-hashed MAPINFO used by an audited family.",
    "Verify each bank and AUTH sequence string at its exact MAPINFO resource "
      + "cluster offset.",
    "Parse the referenced DTPK bank and require every playable AUTH command "
      + "in that resource family to exist in the bank.",
    "Do not infer high-level meanings from track numbers or audition.",
  ],
  mappings,
  unresolvedFamilies: [
    "DRAUTH",
    "YORU",
  ],
  failures,
};
mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) {
  throw new Error(`D000 AUTH bank audit failed:\n${failures.join("\n")}`);
}
console.log(`Verified ${mappings.length} D000 AUTH bank mappings at ${outputPath}`);
