#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { buildNativeAseqActivityPack, sha256 } from "../lib/NativeAseqActivityPack.mjs";
import { buildNativeAseqAudioPack } from "../lib/NativeAseqAudioPack.mjs";
import { extractNativeTexnPack } from "../lib/NativeTexnPack.mjs";
import { parseChrtSceneObjectBindings } from "../lib/chrt_scene_object_bindings.js";
import { parseAuthSequence } from "../../src/AuthSequence.js";

const root = path.resolve(import.meta.dirname, "../..");
const disc = path.join(process.env.SHENMUE_DISC1_EXTRACTED_ROOT || path.join(root, "extracted_files"), "data/SCENE/01");
const source = name => path.join(disc, "BETD", name);
const json = file => JSON.parse(fs.readFileSync(path.join(root, file)));
const write = (file, data) => fs.writeFileSync(path.join(root, file), JSON.stringify(data, null, 2) + "\n");
const prefix = "play/assets/hazuki/bad-ending";
const audioPrefix = "public/audio/world/bad-ending";
const generatedBy = "tools/cutscenes/build_bad_ending_pack.mjs";
const evidence = "tools/evidence/bad-ending-source.json";
const original = json(evidence);
const map = fs.readFileSync(source("MAPINFO.BIN"));
if (sha256(map) !== original.mapSha256) throw Error("Changed original BETD MAPINFO");
const sourceMembers = [], outputMembers = [], sceneObjects = {}, nativeSceneObjectStates = [];
const activities = [];
let offset = map.indexOf("SCEX") + 8;
for (const [slot, shot] of original.shots.entries()) {
  const length = map.readUInt32LE(offset + 4);
  const bytes = map.subarray(offset, offset + length);
  if (offset !== shot.offset || map.toString("ascii", offset, offset + 4) !== "TRCK" || sha256(bytes) !== shot.sha256) throw Error("Changed BETD track " + slot);
  const name = "SHOT" + slot + ".AUTH";
  sourceMembers.push({ name, sourcePath: source("MAPINFO.BIN"), sourceManifestPath: "disc1/SCENE/01/BETD/MAPINFO.BIN",
    sourceOffset: offset, sourceSha256: original.mapSha256, byteLength: length, sha256: shot.sha256 });
  const parsed = parseAuthSequence(bytes);
  activities.push({ slot, file: name, actors: parsed.actors, durationFrames: shot.frames, frameCount: shot.keys,
    binding: { kind: "map-embedded-slot", nativeSlot: slot }, browserIsolatedStage: true, browserMapVisibility: [],
    browserLightingPresetIndex: 1, nativeSceneObjectStates });
  offset += length;
}
if (map.toString("ascii", offset, offset + 4) !== "LGHT") throw Error("Unaccounted BETD shot");
function addLoose(name) {
  const bytes = fs.readFileSync(source(name)), digest = sha256(bytes);
  if (digest !== original.files[name]) throw Error("Changed BETD model or motion: " + name);
  sourceMembers.push({ name, sourcePath: source(name), sourceManifestPath: "disc1/SCENE/01/BETD/" + name,
    sourceSha256: digest, byteLength: bytes.length, sha256: digest });
  return bytes;
}
addLoose("M_01BEDA.BIN");
const identities = parseChrtSceneObjectBindings(map.subarray(map.indexOf("CHRS")));
const packageActors = {};
for (const [tag, label, code] of [["FUKU","Fuku-san","FUB_M"], ["SORY","Lan Di","KOK_M"], ["KURA","Man in black","BLA_M"]]) {
  if (identities.find(row => row.actorTag === tag)?.model !== code) throw Error("Changed original actor " + tag);
  packageActors[tag] = { label, modelCode: code, browserFilename: code + ".CHRM", characterScale: 1, assetFormat: "MT5",
    assetPath: "play/assets/characters/" + code + ".CHRM", textureAssetPath: "play/assets/characters/" + code.slice(0,3) + "_textures.bin" };
}
// BETD assigns a dedicated YKB body to AKIR. Keep the normal exploration avatar under its own lease.
const ryoName = "YKB_M.MT5";
const ryoPath = path.join(disc, "MODEL/CHARA", ryoName);
const ryoBytes = fs.readFileSync(ryoPath);
const ryoDigest = sha256(ryoBytes);
if (identities.find(row => row.actorTag === "AKIR")?.model !== "YKB_M" || ryoDigest !== original.ryo.bodySha256) {
  throw Error("Changed BETD Ryo body");
}
sourceMembers.push({ name: ryoName, sourcePath: ryoPath, sourceManifestPath: "disc1/SCENE/01/MODEL/CHARA/" + ryoName,
  sourceSha256: ryoDigest, byteLength: ryoBytes.length, sha256: ryoDigest });
outputMembers.push(ryoName);
const ryoTextures = Buffer.concat(extractNativeTexnPack(ryoBytes, ryoName).entries.map(entry => entry.bytes));
packageActors.AKIR = { label: "Ryo Hazuki", modelCode: "YKB_M", browserFilename: ryoName, characterScale: 1, assetFormat: "MT5",
  assetPath: prefix + "/" + ryoName, textureAssetPath: prefix + "/YKB_textures.bin" };
const textures = new Map();
function addScenery(tag, model, presentation) {
  const name = model + ".MT5", bytes = addLoose(name);
  outputMembers.push(name);
  if (bytes.indexOf("TEXN") >= 0) {
    for (const entry of extractNativeTexnPack(bytes,name).entries) {
      if (textures.has(entry.id) && !textures.get(entry.id).equals(entry.bytes)) throw Error("Conflicting BETD texture " + entry.id);
      textures.set(entry.id, entry.bytes);
    }
  }
  // MAP02 is a resident, entirely untextured marker layer. The normal world renderer
  // yields no visible roots for it. A leased transform retains its position and layer identity.
  sceneObjects[tag] = { model, browserFilename: "S1_BETD_" + name, ...(model === "MAP02" ? { referenceOnly: true } : {}), assetPath: prefix + "/" + name, textureAssetPath: prefix + "/textures.bin",
    lifecycle: { kind: "room-script-persistent" }, initialPresentation: presentation };
  nativeSceneObjectStates.push({ actorTag: tag, presented: true });
}
const composition = json("src/data/scene-compositions.json");
const profile = Object.values(composition).find(group => group?.BETD)?.BETD;
if (!profile) throw Error("Missing BETD composition");
// Select one nonwinter layer per group; registry order matches the shared seasonal selector.
const maps = [...profile.baseAssets, ...profile.groups.map(group => group.variants[0])];
maps.forEach((model,index) => addScenery("RM" + String(index).padStart(2,"0"), model, { position:[0,0,0], rotationDegrees:[0,0,0], scale:[1,1,1] }));
// The original CHRS stores a single yaw or three angles depending on the prop.
for (const placement of json("tools/evidence/betd-mapinfo-placements.json").placements) {
  const tag = placement.runtime.objectTag;
  const binding = identities.find(row => row.actorTag === tag);
  if (!binding || "S1_BETD_" + binding.model + ".MT5" !== placement.model) throw Error("Changed BETD placement " + tag);
  addScenery(tag, binding.model, { position: placement.position, rotationDegrees: placement.rotationDegrees, scale: placement.scale });
}
const pack = buildNativeAseqActivityPack({
  generatedBy, resourceName: "01BEDA", disc: 1, sourceMembers, expectedMembers: sourceMembers,
  selectionRule: "The three original BETD SCEX slots in narrative order. The room's legacy interpreter and end screen are not installed by this package.",
  bindingEvidence:evidence, outputDirectory:path.join(root,prefix), outputAssetPrefix:prefix, manifestPath:path.join(root,prefix,"manifest.json"),
  audioManifest:audioPrefix + "/manifest.json", sceneObjects, packageActors, outputMembers,
  generatedAssets:[{assetPath:prefix+"/textures.bin",bytes:Buffer.concat([...textures.values()])},
    {assetPath:prefix+"/YKB_textures.bin",bytes:ryoTextures}],
  motionBanks:[{bank:16,member:"M_01BEDA.BIN"}], activities
});
const runtime = [prefix+"/manifest.json", ...pack.outputs.map(o=>o.path)];
const music = json("public/music/manifest.json");
const musicSource = Object.values(json("public/music/asset-viewer-manifest.json").tracks).find(t =>
  t.source.group===0 && t.source.track===0 && t.source.bankSha256===original.musicSha256);
if (!musicSource) throw Error("Missing original BGM127 sequence");
music.tracks.bgm127={url:musicSource.ogg_url,label:"Lan Di returns",durationSeconds:musicSource.durationSeconds,loop:true,source:musicSource.source};
write("public/music/manifest.json",music);
runtime.push("public/music/manifest.json", "public"+musicSource.ogg_url);
if (process.argv.includes("--audio")) {
  const audio=buildNativeAseqAudioPack({generatedBy,disc:1,authDirectory:path.join(root,prefix),authFiles:activities.map(a=>a.file),
    authManifest:prefix+"/manifest.json",resourceBindingEvidence:evidence,
    stream:{label:"01BEDA.AFS",path:path.join(disc,"STREAM/01BEDA.AFS"),manifestPath:"disc1/SCENE/01/STREAM/01BEDA.AFS",sha256:original.voiceSha256},
    soundBank:{label:"A1_BADEN.SND",path:path.join(disc,"SOUND/A1_BADEN.SND"),manifestPath:"disc1/SCENE/01/SOUND/A1_BADEN.SND",sha256:original.soundSha256},
    outputDirectory:path.join(root,audioPrefix),outputAssetPrefix:audioPrefix,vgmstream:process.env.VGMSTREAM_CLI,
    dtpkDump:process.env.DTPK_DUMP||path.join(root,".disc-work/pool-audio/dtpkdump/DTPKDump.py"),python:process.env.DTPK_PYTHON||"python3"});
  runtime.push(audioPrefix+"/manifest.json", ...[...audio.voices,...audio.sounds].filter(a=>a.asset).map(a=>a.asset));
}
const routesPath="tools/data/native-activity-preview-routes.json";
const routes=json(routesPath), programId="story-s1-jomo-bad-ending";
const route={cutsceneId:programId,programId,packageId:"bad-ending",worldId:"interior",area:"JOMO",manifest:prefix+"/manifest.json",
  activities:activities.map(a=>({slot:a.slot}))};
const prior=routes.routes.findIndex(r=>r.programId===programId);
if (prior<0) routes.routes.push(route); else routes.routes[prior]=route;
write(routesPath,routes);
execFileSync(process.execPath,["tools/runtime-assets.mjs","update",...runtime],{cwd:root,stdio:"inherit"});
