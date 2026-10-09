#!/usr/bin/env node
// Export the existing 01KOZ AUTH, motion and speech without executing SCN3.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildNativeAseqActivityPack, parseIpacActivityArchive, sha256 } from "../lib/NativeAseqActivityPack.mjs";
import { buildNativeAseqAudioPack } from "../lib/NativeAseqAudioPack.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = process.env.SHENMUE_DISC1_EXTRACTED_ROOT || path.join(root, "extracted_files");
const mapPath = path.join(source, "data/SCENE/01/JOMO/MAPINFO.BIN");
const map = fs.readFileSync(mapPath), mapHash = "4af865fbb62a06e917d6625149f4bcf77fa6a6bba19b08b8433440f96712a2b9";
if (sha256(map) !== mapHash) throw new Error("first-allowance MAPINFO source changed");
const auth = map.subarray(0xb70d4, 0xb70d4 + 25780);
if (sha256(auth) !== "9677f9dc9d7872b68d265c41c7162f8c02424238e47f83fd56e07d7bee47bff0") throw new Error("01KOZ AUTH changed");
const archivePath = path.join(source, "data/SCENE/01/JOMO/COMMON01.PKS"), archive = fs.readFileSync(archivePath);
if (sha256(archive) !== "4b117711c45ca0a94690ce14b8896ddb5feacfde0ba5c7f2a13ae5310201ba22") throw new Error("JOMO COMMON01 changed");
const motion = parseIpacActivityArchive(archive).members.find(member => member.name === "M_01KOZ.MOTN");
if (sha256(motion.bytes) !== "c83f0001ee0ba3e91ea7210d591747fba80fe7a09a63976a9d18084b4796ac0d") throw new Error("01KOZ motion changed");
const prefix = "play/assets/hazuki/first-allowance", directory = path.join(root, prefix);
const members = [
  { name: "SEQDATA35.AUTH", sourcePath: mapPath, sourceManifestPath: "extracted_files/data/SCENE/01/JOMO/MAPINFO.BIN", sourceOffset: 0xb70d4, sourceSha256: mapHash, byteLength: auth.length, sha256: sha256(auth) },
  { name: "M_01KOZ.MOTN", sourcePath: archivePath, sourceManifestPath: "extracted_files/data/SCENE/01/JOMO/COMMON01.PKS", archiveMember: "M_01KOZ.MOTN", sourceSha256: sha256(archive), byteLength: motion.bytes.length, sha256: sha256(motion.bytes) },
];
buildNativeAseqActivityPack({
  generatedBy: "tools/cutscenes/build_first_allowance_assets.mjs", resourceName: "01KOZ", disc: 1,
  sourceMembers: members, expectedMembers: members, bindingEvidence: "docs/design/story-event-template.md#original-data",
  selectionRule: "original JOMO activity 35, identified by its 01KOZ sound paths; authored trigger and server settlement",
  outputDirectory: directory, outputAssetPrefix: prefix, manifestPath: path.join(directory, "manifest.json"),
  audioManifest: "public/audio/world/first-allowance/manifest.json",
  activities: [{ slot: 35, binding: { kind: "map-embedded-slot" }, file: "SEQDATA35.AUTH", actors: ["dor0", "KOZU", "AKIR", "INE_"], durationFrames: 1696 }],
  // The two-entry source window corresponds to AUTH's one-based 113/114.
  // The frozen file's packed attribute count ends at 114; no other IDs are remapped.
  motionBanks: [{ bank: 28, member: "M_01KOZ.MOTN", parseOptions: { sequenceIndexBase: 112 } }],
  playerActorAliases: ["AKIR"],
  sceneObjects: Object.fromEntries(["dor0", "KOZU"].map(tag => [tag, {
    model: "non-rendered-reference", browserFilename: `01KOZ-${tag}-reference`, referenceOnly: true,
  }])),
  packageActors: { INE_: { label: "Ine-san", modelCode: "INE_M", browserFilename: "INE_M.CHRM", assetFormat: "MT5", characterScale: 1,
    assetPath: "play/assets/INE_M.CHRM", textureAssetPath: "play/assets/INE_textures.bin" } },
});
if (!process.argv.includes("--activity-only")) {
  for (const key of ["VGMSTREAM_CLI", "DTPK_DUMP"]) if (!process.env[key]) throw new Error(`${key} is required for native audio export`);
  const manifest = buildNativeAseqAudioPack({
    generatedBy: "tools/cutscenes/build_first_allowance_assets.mjs", disc: 1,
    authDirectory: directory, authFiles: ["SEQDATA35.AUTH"], authManifest: `${prefix}/manifest.json`,
    resourceBindingEvidence: "docs/design/story-event-template.md#original-data",
    stream: { label: "01KOZ.AFS", path: path.join(source, "data/SCENE/01/STREAM/01KOZ.AFS"), manifestPath: "extracted_files/data/SCENE/01/STREAM/01KOZ.AFS", sha256: "7c3b338d91d9e87bfe3a152b2f63f876aec3cf7ba5f02c017ad7be3c4c7f77e5" },
    soundBank: { label: "A1_OKOZU.SND", path: path.join(source, "data/SCENE/01/SOUND/A1_OKOZU.SND"), manifestPath: "extracted_files/data/SCENE/01/SOUND/A1_OKOZU.SND", sha256: "b664c9b12716dac2815416d5bc4109536043612dab86e53a13e18626e7f8bdda" },
    outputDirectory: path.join(root, "public/audio/world/first-allowance"), outputAssetPrefix: "public/audio/world/first-allowance",
    dtpkDump: process.env.DTPK_DUMP, vgmstream: process.env.VGMSTREAM_CLI, python: process.env.DTPK_PYTHON || "python3",
  });
  console.log(`First allowance: ${manifest.voices.length} original voice lines, ${manifest.sounds.length} effects`);
}
