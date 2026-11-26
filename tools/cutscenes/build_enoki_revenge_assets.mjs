// Export the two original Dobuita fighters and the DEFB director's motion bank.
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {parseIpacActivityArchive, sha256} from "../lib/NativeAseqActivityPack.mjs";
import {extractNativeTexnPack} from "../lib/NativeTexnPack.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const disc = process.env.SHENMUE_DISC1_EXTRACTED_ROOT || path.join(root, "extracted_files");
const scene = path.join(disc, "data/SCENE/01");
const exported = [];
function save(file, bytes) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.writeFileSync(target, bytes);
  exported.push(file);
}
function readAt(fd, size, offset) {
  const bytes = Buffer.alloc(size);
  if (fs.readSync(fd, bytes, 0, size, offset) !== size) throw Error("Truncated HUMANS.AFS member");
  return bytes;
}

const motionArchive = fs.readFileSync(path.join(scene, "D000/DEFB.PKS"));
const member = parseIpacActivityArchive(motionArchive).members.find(row => row.name === "M_DEFB.MOTN");
if (!member || sha256(motionArchive) !== "54c0cafcff9046420e559cd2dc76826a3dbeb9ddec33ba14480ed70330a3fd8a"
    || sha256(member.bytes) !== "9ac89b9fe6ddc97a4feb1be39c24434ca691ca89173bdbf486483f28790688c8") {
  throw Error("Changed or missing original D000 DEFB motion bank");
}
save("play/assets/dobuita/enoki-revenge/M_DEFB.MOTN", member.bytes);

const humans = fs.readFileSync(path.join(scene, "STREAM/HUMANS.IDX"));
const actorCount = humans.readUInt32LE();
const tags = Array.from({length: actorCount}, (_, n) => humans.toString("ascii", 4 + 4*n, 8 + 4*n));
const fighters = [
  ["TMNY", "YAC", "e4f4ab13e60c736c88c62b20d352f1d6c767b6f941b5ce6b23cf9338e8c9275f", "c3d16ac5aa51562f9dca0668370d85fbef7b7ce9758230c6fcc9648c8a0298cd"],
  ["MYTY", "YAE", "9cbd6c259b6464bf5cd115ed9b0aa8d8a900216da30ff6fbe10fee368fa73828", "c26c8b930b09027719cf29cf62ede194bada550ed0c73a34b5da65bb48246f00"],
];
const fd = fs.openSync(path.join(scene, "STREAM/HUMANS.AFS"), "r");
try {
  const header = readAt(fd, 8, 0);
  if (header.toString("ascii", 0, 4) !== "AFS\0" || header.readUInt32LE(4) !== tags.length * 2) {
    throw Error("Unexpected HUMANS.AFS/IDX layout");
  }
  for (const [actor, code, textureHash, modelHash] of fighters) {
    const index = tags.indexOf(actor);
    if (index < 0 || tags.lastIndexOf(actor) !== index) throw Error("Non-unique HUMANS.IDX tag " + actor);
    const entry = readAt(fd, 16, 8 + index * 16);
    const textures = readAt(fd, entry.readUInt32LE(4), entry.readUInt32LE(0));
    const models = readAt(fd, entry.readUInt32LE(12), entry.readUInt32LE(8));
    if (sha256(textures) !== textureHash || sha256(models) !== modelHash) throw Error("Changed HUMANS members for " + actor);
    const name = code + "_L.CHRM";
    const body = parseIpacActivityArchive(models).members.find(row => row.name === name);
    if (!body) throw Error("Missing " + name + " for " + actor);
    save("play/assets/characters/" + name, body.bytes);
    save("play/assets/characters/" + code + "_textures.bin", extractNativeTexnPack(textures, actor).bytes);
  }
} finally {
  fs.closeSync(fd);
}
execFileSync(process.execPath, ["tools/runtime-assets.mjs", "update", ...exported], {cwd: root, stdio: "inherit"});
