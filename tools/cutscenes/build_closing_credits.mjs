#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { PvrDecoder } from "../../src/PvrDecoder.js";

const root = path.resolve(import.meta.dirname, "../..");
const disc = path.join(process.env.SHENMUE_DISC3_EXTRACTED_ROOT || path.join(root, "extracted_disc3_v2"), "data");
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const archive = fs.readFileSync(path.join(disc, "SPRITE/STAFF_S.GZ"));
const sourceSha256 = "5f55ab9c27c49e496462c81faf2b53fd7a7dec371a6f4fc74f2c4cf7bd54b619";
if (digest(archive) !== sourceSha256) throw Error("Closing credits texture archive changed");
const bytes = gunzipSync(archive);
const prefix = "play/assets/ending/closing-credits";
const directory = path.join(root, prefix);
fs.mkdirSync(directory, {recursive:true});
const images = [];
let offset = 0;
for (let i = 0; i < 62; i++) {
  const entrySize = bytes.readUInt32LE(offset + 4);
  const end = offset + entrySize;
  const tag = bytes.toString("ascii", offset, offset + 4);
  const textureId = bytes.subarray(offset + 8, offset + 16).toString("hex");
  // The English pack uses a non-ASCII prefix on the 61 numbered pages.
  const expectedTag = i === 0 ? "50524553454e5400" : "d2d96166665f" + Buffer.from(String(i).padStart(2, "0")).toString("hex");
  if (tag !== "TEXN" || textureId !== expectedTag || end > bytes.length) throw Error("Invalid credits texture entry " + i);
  const pvr = offset + 28;
  if (bytes.toString("ascii", pvr, pvr + 4) !== "PVRT") throw Error("Missing original PVR texture");
  const data = bytes.subarray(pvr, end);
  const decoded = new PvrDecoder(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)).decodePixels();
  if (decoded.width !== 512 || decoded.height !== (i === 0 ? 64 : 512)) throw Error("Invalid original credits dimensions");
  images.push({textureId, pixels:Buffer.from(decoded.pixelData), height:decoded.height});
  offset = end;
}
if (bytes.subarray(offset).some(v => v !== 0)) throw Error("Unexpected trailing credits data");

function makePng(filename, rows) {
  const asset = prefix + "/" + filename;
  const height = rows.reduce((n, row) => n + row.height, 0);
  execFileSync("magick", ["-size", "512x" + height, "-depth", "8", "rgba:-", "-strip",
    "-define", "png:exclude-chunk=time", path.join(root, asset)], {input:Buffer.concat(rows.map(r => r.pixels))});
  return {path:asset, width:512, height, sha256:digest(fs.readFileSync(path.join(root, asset)))};
}
const logo = makePng("present.png", images.slice(0, 1));
const sheets = [];
for (let page = 1; page < images.length; page += 8) {
  const rows = images.slice(page, page + 8);
  sheets.push({...makePng("pages-" + String(page).padStart(2, "0") + ".png", rows), firstPage:page, pageCount:rows.length});
}
const audioAsset="public/music/shenmue1/closing-credits-rim004.ogg";
const bankSha256="b462a368b2761709768d06e748a55bec515fec75b7b52f49c48d3e570f4fe2ff";
const driverSha256="3f88553a52a6d1af0b988ea3f41800178988350721bd7422a570dc3e4e369915";
if (!fs.existsSync(path.join(root,audioAsset)) || process.argv.includes("--audio")) {
  execFileSync("python3", ["-m","tools.audio.render_music_sequence","--bank",path.join(disc,"SCENE/03/SOUND/RIM004.SND"),
    "--bank-sha256",bankSha256,"--driver",path.join(disc,"SOUND/AICADRV.BIN"),"--driver-sha256",driverSha256,
    "--renderer",path.join(root,".audio-tools/dsf-renderer/dsf-renderer"),"--seconds","560","--output",audioAsset],{cwd:root,stdio:"inherit"});
}
const manifestPath = prefix + "/manifest.json";
const manifest = {source:"disc3/SPRITE/STAFF_S.GZ",sourceSha256,logo,sheets,pageCount:61,
  music:{trackId:"closing-credits-rim004",asset:audioAsset,source:"disc3/SCENE/03/SOUND/RIM004.SND",bankSha256,
    driverSha256,group:0,track:0,durationSeconds:560}};
fs.writeFileSync(path.join(root, manifestPath), JSON.stringify(manifest,null,2) + "\n");
const musicPath = path.join(root,"public/music/manifest.json");
const music = JSON.parse(fs.readFileSync(musicPath));
music.tracks[manifest.music.trackId] = {label:"Closing credits",url:"/music/shenmue1/closing-credits-rim004.ogg",
  loop:false,durationSeconds:560,sha256:digest(fs.readFileSync(path.join(root,audioAsset))),source:{file:"RIM004.SND",bankSha256,driverSha256,group:0,track:0}};
fs.writeFileSync(musicPath,JSON.stringify(music,null,2)+"\n");
execFileSync(process.execPath,["tools/runtime-assets.mjs","update","public/music/manifest.json",manifestPath,logo.path,...sheets.map(s=>s.path),audioAsset],{cwd:root,stdio:"inherit"});
