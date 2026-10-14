// Original presentation bytes for walkthrough-guided basement events. The
// source room controller is not needed to author ordinary Yarn interactions.
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {parseIpacActivityArchive, sha256} from "../lib/NativeAseqActivityPack.mjs";
import {MotnLoader} from "../../src/MotnLoader.js";
import {externalTextureKeysFromMt5} from "../../src/assetLoader.js";
import {buildTexturePackIndex} from "../../src/Mt5TexturePolicy.js";

const root = path.resolve(import.meta.dirname, "../..");
const source = path.join(process.env.SHENMUE_DISC2_EXTRACTED_ROOT || path.join(root, "extracted_disc2_v2"), "data/SCENE/02/YDB1");
const archive = fs.readFileSync(path.join(source, "MPK00.PKS"));
if (sha256(archive) !== "494c0fe00feebe7797e7b663bc62f989cffab2e8f83d18969bc755113909657c") throw Error("Changed original YDB1 archive");
const members = parseIpacActivityArchive(archive).members;
const hashes = {
  "M_0138.MOTN": "b87b57426d1d3e7dafb340b3086c381e85862d401008f14902bbd822d3ed327e",
  "ONOS500G.CHRM": "c4cc7dca0e7194d3734bda8f34bd0b771f84fd342a32c82d611c3d3feddac147",
  "PNX02M1G.CHRM": "b8abb8ddad33c16097a60085f91f40fb82f5a175132cabc0101104ae54c81bb0",
};
const outputs = Object.entries(hashes).map(([name, hash]) => {
  const member = members.find(member => member.name === name);
  if (!member || sha256(member.bytes) !== hash) throw Error(`Changed original ${name}`);
  return {name, bytes: member.bytes};
});
const selections = [
  [38, "AKI_HIKU_TANA_0138"], [67, "AKI_TORU_ONO_TIKATANSAKU_FE"],
  [11, "AKI_KABEKOWA_ONO_TIKA_FE"], [49, "AKI_TORU_HOUOUKYOU_TIKATANSAKU"],
];
// A different, unused sequence in this bank is not decoded by our parser.
// Validate the actual named selections, just as the runtime loads them, rather
// than requiring reconstruction of every unrelated original controller.
const bank = MotnLoader.parse(outputs[0].bytes, {sequenceIndices: selections.map(([index]) => index)});
const sequences = selections.map(([index, name]) => {
  const clip = bank.sequences.find(clip => clip.name === name);
  if (!clip || clip.valueData?.complete !== true) throw Error(`Incomplete basement clip ${index}/${name}`);
  return {index, name, durationFrames: clip.durationFrames};
});
const textures = fs.readFileSync(path.join(source, "MPK00.PKF"));
if (sha256(textures) !== "45f0e55e465e8e9ff1eeb72827d77b0a1b355b273fac22cec091722459d3b981") throw Error("Changed basement textures");
// Reuse the canonical world's TEXN/IPAC extraction and dictionary aliases.
// MPK00.PKF is gzip-compressed: passing it directly to Mt5Loader's flat-pack
// reader silently gives every held prop a white material. Fix the producer,
// not the runtime loader with a permissive missing-texture fallback.
const texturePack = execFileSync("python3", ["-c", [
  "import gzip,struct,sys",
  "from tools.assets.sync_models import extract_texn_with_ids",
  "entries=dict(extract_texn_with_ids(gzip.decompress(sys.stdin.buffer.read())))",
  "sys.stdout.buffer.write(b''.join(key+struct.pack('<I',len(value))+value for key,value in entries.items()))",
].join("\n")], {cwd: root, input: textures, maxBuffer: 16 * 1024 * 1024});
const asBuffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const textureIndex = buildTexturePackIndex(asBuffer(texturePack));
if (!textureIndex?.size) throw Error("Basement texture pack is empty");
for (const output of outputs.filter(output => output.name.endsWith(".CHRM"))) {
  for (const key of externalTextureKeysFromMt5(asBuffer(output.bytes))) {
    if (!textureIndex.has(key)) throw Error(`Missing original texture ${key} for ${output.name}`);
  }
}
outputs.push({name: "textures.bin", bytes: texturePack});
const prefix = "play/assets/basement/mirror-search", directory = path.join(root, prefix);
fs.mkdirSync(directory, {recursive: true});
for (const output of outputs) fs.writeFileSync(path.join(directory, output.name), output.bytes);
fs.writeFileSync(path.join(directory, "manifest.json"), JSON.stringify({
  schema: "new-yokosuka-authored-story-assets-v1", generatedBy: "tools/cutscenes/build_basement_story_assets.mjs",
  source: {disc: 2, path: "disc2/SCENE/02/YDB1/MPK00.PKS", sha256: sha256(archive)},
  textureSource: {path: "disc2/SCENE/02/YDB1/MPK00.PKF", sha256: sha256(textures), extraction: "tools/assets/sync_models.py:extract_texn_with_ids", textureCount: textureIndex.size},
  outputs: outputs.map(file => ({path: `${prefix}/${file.name}`, byteLength: file.bytes.length, sha256: sha256(file.bytes)})), sequences,
  adaptation: "Original selected motions and props. Positions, camera, grips and instantaneous shelf/wall presentation are authored; light-source puzzles and exact debris/hand choreography are omitted. Yarn owns genuine item prerequisites and atomic progression, not motion completion alone.",
}, null, 2) + "\n");
console.log("Built original basement Story assets");
