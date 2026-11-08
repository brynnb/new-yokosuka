#!/usr/bin/env node
// Export the existing 01KOZ AUTH, motion and speech without executing SCN3.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildNativeAseqActivityPack, parseIpacActivityArchive, sha256 } from "../lib/NativeAseqActivityPack.mjs";
import { buildNativeAseqAudioPack } from "../lib/NativeAseqAudioPack.mjs";
import { parseChrtSceneObjectBindings } from "../lib/chrt_scene_object_bindings.js";
import { extractNativeTexnPack } from "../lib/NativeTexnPack.mjs";
import { extractNativeAseqCallbackObjectPresentation } from "../lib/NativeAseqCallbackObjectPresentation.mjs";
import { extractNativeAseqCallbackPresentation, extractNativeAseqCallbackStageEffects } from "../lib/NativeAseqCallbackPresentation.mjs";
import { externalTextureKeysFromMt5 } from "../../src/assetLoader.js";
import { buildTexturePackIndex } from "../../src/Mt5TexturePolicy.js";
import { parseAuthMovement, evaluateAuthActor } from "../../src/AuthMovement.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = process.env.SHENMUE_DISC1_EXTRACTED_ROOT || path.join(root, "extracted_files");
const mapPath = path.join(source, "data/SCENE/01/JOMO/MAPINFO.BIN");
const map = fs.readFileSync(mapPath), mapHash = "4af865fbb62a06e917d6625149f4bcf77fa6a6bba19b08b8433440f96712a2b9";
if (sha256(map) !== mapHash) throw new Error("first-allowance MAPINFO source changed");
const auth = map.subarray(0xb70d4, 0xb70d4 + 25780);
if (sha256(auth) !== "9677f9dc9d7872b68d265c41c7162f8c02424238e47f83fd56e07d7bee47bff0") throw new Error("01KOZ AUTH changed");
// AUTH's temporary dor0 is the bedroom door, not the exploration runtime's
// unrelated entrance object also called dor0. Its original position matches
// the captured/static-table dor7 exactly; fail if that association changes.
const movement = parseAuthMovement(auth);
const doorTrack = movement.actors.find(actor => actor.tag === "dor0");
if (!doorTrack) throw new Error("01KOZ has no original door track");
const doorPose = evaluateAuthActor(doorTrack, 0);
const doors = JSON.parse(fs.readFileSync(path.join(root, "play/data/jomo-runtime-placements.json"))).placements
  .filter(placement => placement.runtime?.objectTag === "dor7");
if (doors.length !== 1 || doors[0].model !== "S1_JOMO_DR01_015.MT5"
  || ![-doorPose.x, doorPose.y, doorPose.z].every((value, i) => Math.abs(value - doors[0].position[i]) < 0.0001)) {
  throw new Error("01KOZ bedroom door no longer matches the JOMO placement");
}
const archivePath = path.join(source, "data/SCENE/01/JOMO/COMMON01.PKS"), archive = fs.readFileSync(archivePath);
if (sha256(archive) !== "4b117711c45ca0a94690ce14b8896ddb5feacfde0ba5c7f2a13ae5310201ba22") throw new Error("JOMO COMMON01 changed");
const motion = parseIpacActivityArchive(archive).members.find(member => member.name === "M_01KOZ.MOTN");
if (sha256(motion.bytes) !== "c83f0001ee0ba3e91ea7210d591747fba80fe7a09a63976a9d18084b4796ac0d") throw new Error("01KOZ motion changed");
const prefix = "play/assets/hazuki/first-allowance", directory = path.join(root, prefix);
const callback = JSON.parse(fs.readFileSync(path.join(root, "tools/evidence/first-allowance-native-callback-ir.json")));
if (callback.source.mapinfoSha256 !== mapHash || callback.source.callbackFunction !== "0x634ec") {
  throw new Error("first-allowance callback owner changed");
}
const callbackInput = { bytes: map, callbackFunction: 0x634ec, nativeFunction: callback.function, activitySlot: 35, durationFrames: 1696 };
const objects = extractNativeAseqCallbackObjectPresentation(callbackInput);
const presentation = extractNativeAseqCallbackPresentation(callbackInput);
// Extract only this prop's flag operations. Actor/door initialization is not
// silently treated as scene-object visibility by this bounded adapter.
const propEffects = extractNativeAseqCallbackStageEffects({ ...callbackInput, supportingFunctions: [],
  nativeFunction: { ...callback.function, blocks: callback.function.blocks.map(block => ({ ...block,
    actions: block.actions.filter(action => action.arguments?.[0]?.ascii === "KOZU"),
  })) }, source: callback.source,
});
const textures = fs.readFileSync(path.join(source, "data/SCENE/01/JOMO/COMMON01.PKF"));
if (sha256(textures) !== "053cdebca90a626f9b019b9bd0ab3b34296596c392541764155f2a3d4f908b30") {
  throw new Error("JOMO COMMON01 textures changed");
}
const chrt = parseIpacActivityArchive(textures).members.find(member => member.name === "CHARA.CHRT").bytes;
const binding = parseChrtSceneObjectBindings(chrt).find(value => value.actorTag === "KOZU");
if (binding?.model !== "FUTS5OKG" || binding.characterRecordOffset !== 0x5b34) throw new Error("KOZU source model changed");
const prop = parseIpacActivityArchive(archive).members.find(member => member.name === `${binding.model}.CHRM`);
if (prop?.bytes.length !== 1956 || sha256(prop.bytes) !== "2b6031cbd7c81f5eddb56035155bedd072d565d550922083de601e5820af5951") {
  throw new Error("KOZU source geometry changed");
}
// Publish only the prop's original NAME references, not all of COMMON01's
// unrelated character textures. A missing source texture is an export error.
const asBuffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const texturePack = extractNativeTexnPack(textures).bytes;
const textureIndex = buildTexturePackIndex(asBuffer(texturePack));
const propTextures = Buffer.concat([...externalTextureKeysFromMt5(asBuffer(prop.bytes))].map(key => {
  const entry = textureIndex.get(key);
  if (!entry) throw new Error(`KOZU is missing original texture ${key}`);
  return texturePack.subarray(entry.offset - 12, entry.offset + entry.length);
}));
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
  activities: [{ slot: 35, binding: { kind: "map-embedded-slot" }, file: "SEQDATA35.AUTH", actors: ["dor0", "KOZU", "AKIR", "INE_"], durationFrames: 1696,
    ...presentation,
  }],
  nativeHandPoseTables: presentation.nativeHandPoseTables,
  externalAssets: [{ sourcePath: archivePath, sourceSha256: sha256(archive), archiveMember: prop.name,
    assetPath: `${prefix}/${prop.name}`, byteLength: prop.bytes.length, sha256: sha256(prop.bytes) }],
  generatedAssets: [{ assetPath: `${prefix}/textures.bin`, bytes: propTextures }],
  // The two-entry source window corresponds to AUTH's one-based 113/114.
  // The frozen file's packed attribute count ends at 114; no other IDs are remapped.
  motionBanks: [{ bank: 28, member: "M_01KOZ.MOTN", parseOptions: { sequenceIndexBase: 112 } }],
  playerActorAliases: ["AKIR"],
  sceneObjects: {
    dor0: { model: "DR01_015", browserFilename: doors[0].model, objectTag: "dor7" },
    KOZU: { model: binding.model, browserFilename: prop.name, assetPath: `${prefix}/${prop.name}`,
      textureAssetPath: `${prefix}/textures.bin`, source: binding },
  },
  attachedObjects: { KOZU: {
    browserFilename: prop.name, sceneObject: true,
    attachments: objects.attachedObjectCues,
    presentation: propEffects.programPresentationCues.frames.flatMap(({ frame, cues }) =>
      cues.map(cue => ({ activitySlot: 35, frame, visible: cue.presented, source: cue.source }))),
  } },
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
