#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { buildNativeAseqActivityPack, parseIpacActivityArchive, sha256 } from "../lib/NativeAseqActivityPack.mjs";
import { buildNativeAseqAudioPack } from "../lib/NativeAseqAudioPack.mjs";
import { extractNativeAseqCallbackPresentation } from "../lib/NativeAseqCallbackPresentation.mjs";
import { parseChrtSceneObjectBindings } from "../lib/chrt_scene_object_bindings.js";
import { extractNativeTexnPack } from "../lib/NativeTexnPack.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const disc = process.env.SHENMUE_DISC2_EXTRACTED_ROOT || path.join(root, "extracted_disc2_v2");
const source = filename => path.join(disc, "data/SCENE/02", filename);
const sourceRef = filename => `disc2/SCENE/02/${filename}`;
const prefix = "play/assets/hazuki/nozomi-flowers";
const directory = path.join(root, prefix);
const audioPrefix = "public/audio/world/nozomi-flowers";
const generatedBy = "tools/cutscenes/build_nozomi_flowers_pack.mjs";
const evidence = "tools/evidence/nozomi-flowers-callback-ir.json";
const mapHash = "6a4e6e8d8e71aa450fef6922ebe0036776a94cb498710a562e4418a9338037fe";
const archiveHash = "916aab45137cf340516a1cdd2ee61540e7c6562a1e92c5f932e9055ae0db3b89";
const textureHash = "46f81a1f67b471c19481edc3092ed43be443e35d4c437c4fc594658d8866927b";
const map = fs.readFileSync(source("JOMO/MAPINFO.BIN"));
const scenery = fs.readFileSync(source("JOMO/COMMON02.PKF"));
const ir = JSON.parse(fs.readFileSync(path.join(root, evidence)));
const owner = ir.supportingFunctions.find(fn => fn.id === "0x743cc");
const actions = owner.blocks.flatMap(block => block.actions);
const callback = ir.function;
if (sha256(map) !== mapHash || ir.source.mapinfoSha256 !== mapHash || sha256(scenery) !== textureHash
    || callback.id !== "0x747f4" || !actions.some(a => a.kind === "childCoroutineLaunch" && a.targetFileOffset === callback.id)
    || !actions.some(a => a.operationId === 0x50 && a.arguments[0]?.value === 36)) {
  throw new Error("01BTU room, callback or native slot changed");
}
const scex = map.indexOf("SCEX");
let offset = scex + 8;
for (let i = 0; i < 36; i++) {
  const size = map.readUInt32LE(offset + 4);
  if (map.toString("ascii", offset, offset + 4) !== "TRCK" || size < 8) throw new Error("Invalid original SCEX slot");
  offset += size;
}
if (offset !== 0xc1728) throw new Error("Native slot 36 no longer selects the flower film");
const members = [
  { name: "FLOWERS.AUTH", sourcePath: source("JOMO/MAPINFO.BIN"), sourceManifestPath: sourceRef("JOMO/MAPINFO.BIN"),
    sourceOffset: offset, sourceSha256: mapHash, byteLength: 14092, sha256: "35585c982b6a77d82692b37e1f12b5a4c19bc0b1917771e19aad802904f90a65" },
  ...[
    ["M_01BTU.MOTN", 27424, "7520194e6bada362b3614ff82ebb477b500a442a1fb4f2d4ed3013c64b8b7a48"],
    ["BUTM409G.CHRM", 16388, "9452517994e536a850681992ded6c0d6efd3a858b1136b5043b59981291bda49"],
  ].map(([name, byteLength, digest]) => ({ name, archiveMember: name, sourcePath: source("JOMO/COMMON02.PKS"),
    sourceManifestPath: sourceRef("JOMO/COMMON02.PKS"), sourceSha256: archiveHash, byteLength, sha256: digest })),
];
const chrt = parseIpacActivityArchive(scenery).members.find(m => m.name === "CHARA.CHRT");
const flowers = parseChrtSceneObjectBindings(chrt.bytes).find(b => b.actorTag === "HANA");
if (flowers?.model !== "BUTM409G") throw new Error("Changed original lilies binding");
const textureIds = ["eca9c861ab38365f", "af89b3616464365f"]; // BUTM409G.CHRM TEXD/NAME entries
const textureEntries = extractNativeTexnPack(scenery).entries.filter(entry => textureIds.includes(entry.id));
if (new Set(textureEntries.map(e => e.id)).size !== textureIds.length) throw new Error("Missing original lilies texture");

// The two FACE eye-target requests have no proven frame range in the callback.
// The six independently timed expression and face-clip writes are usable.
const presentation = extractNativeAseqCallbackPresentation({
  bytes: map, callbackFunction: Number(callback.id), durationFrames: 1248,
  nativeFunction: { ...callback, blocks: callback.blocks.map(block => ({ ...block,
    actions: block.actions.filter(a => a.semanticId !== "resolved-object-face-record-request"),
  })) },
});
const sceneObjects = {
  HANA: { model: flowers.model, browserFilename: "S1_JOMO_BUTM409G.MT5", assetPath: `${prefix}/BUTM409G.CHRM`,
    textureAssetPath: `${prefix}/flowers-textures.bin`, initialPresentation: flowers.presentation },
  // Borrow the everyday bouquet. It has no AUTH track and stays hidden until
  // the common exploration lease restores its original visibility and input.
  BASE: { model: "BUTM408G", browserFilename: "S1_JOMO_BUTM408G.MT5", objectTag: "HANA" },
};
const manifest = buildNativeAseqActivityPack({
  generatedBy, resourceName: "01BTU", disc: 2, sourceMembers: members, expectedMembers: members,
  selectionRule: "JOMO 0x743cc selects SCEX slot 36 and launches callback 0x747f4. Package slot 0 contains that single complete activity.",
  bindingEvidence: evidence, outputDirectory: directory, outputAssetPrefix: prefix, manifestPath: path.join(directory, "manifest.json"),
  audioManifest: `${audioPrefix}/manifest.json`, sceneObjects,
  outputMembers: ["BUTM409G.CHRM"],
  generatedAssets: [{ assetPath: `${prefix}/flowers-textures.bin`, bytes: Buffer.concat(textureEntries.map(e => e.bytes)),
    source: { path: sourceRef("JOMO/COMMON02.PKF"), sha256: textureHash, textureIds } }],
  packageActors: { INE_: { label: "Ine-san", modelCode: "INE_M", browserFilename: "INE_M.CHRM", assetFormat: "MT5",
    characterScale: 1, assetPath: "play/assets/INE_M.CHRM", textureAssetPath: "play/assets/INE_textures.bin" } },
  motionBanks: [{ bank: 28, member: "M_01BTU.MOTN", parseOptions: { sequenceIndexBase: 128 }, expectedSequences: [
    { index: 128, name: "AKI_AT1_MIRU_HANA_HARASAKIHANA_0100" }, { index: 129, name: "JIJ_INE_AT1_MIRU_HANA_HARASAKIHANA_0100" },
  ] }],
  activities: [{ slot: 0, binding: { kind: "map-embedded-slot", nativeSlot: 36, ownerFunction: owner.id, callbackFunction: callback.id },
    file: "FLOWERS.AUTH", actors: ["AKIR", "HANA", "INE_"], durationFrames: 1248, frameCount: 31,
    nativeFaceClipCues: presentation.nativeFaceClipCues, nativeFaceControllerCues: presentation.nativeFaceControllerCues }],
});
const assets = [`${prefix}/manifest.json`, ...manifest.outputs.map(o => o.path)];
if (process.argv.includes("--audio")) {
  if (!process.env.VGMSTREAM_CLI) throw new Error("Set VGMSTREAM_CLI to the original SPSD audio decoder");
  const audio = buildNativeAseqAudioPack({
    generatedBy, disc: 2, authDirectory: directory, authFiles: ["FLOWERS.AUTH"], authManifest: `${prefix}/manifest.json`, resourceBindingEvidence: evidence,
    stream: { label: "01BTU.AFS", path: source("STREAM/01BTU.AFS"), manifestPath: sourceRef("STREAM/01BTU.AFS"), sha256: "543d2cc9ffb37d548e6169c796361d0340fd1d519a765dcb39dda1a755df5889" },
    soundBank: { label: "A1_NHANA.SND", path: source("SOUND/A1_NHANA.SND"), manifestPath: sourceRef("SOUND/A1_NHANA.SND"), sha256: "05c6f6e2aa40888d113ef26f1de1dd76384a8ce3d0cec156be045e1f5a306643" },
    outputDirectory: path.join(root, audioPrefix), outputAssetPrefix: audioPrefix, vgmstream: process.env.VGMSTREAM_CLI,
    dtpkDump: process.env.DTPK_DUMP || path.join(root, ".disc-work/pool-audio/dtpkdump/DTPKDump.py"), python: process.env.DTPK_PYTHON || "python3",
  });
  assets.push(`${audioPrefix}/manifest.json`, ...[...audio.voices, ...audio.sounds].filter(a => a.asset).map(a => a.asset));
}
execFileSync(process.execPath, ["tools/runtime-assets.mjs", "update", ...new Set(assets)], { cwd: root, stdio: "inherit" });
