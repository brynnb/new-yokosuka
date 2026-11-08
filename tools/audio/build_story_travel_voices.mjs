#!/usr/bin/env node
// Restore source-matched reminder voices through the existing AFS and audio tools.
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {afsMembers} from "../lib/NativeAseqAudioPack.mjs";
import {parseNativeSrfRecords} from "../../src/NativeLipSync.js";

const root = path.resolve(import.meta.dirname, "../..");
const disc = process.env.SHENMUE_DISC1_EXTRACTED_ROOT || path.join(root, "extracted_files");
const decoder = process.env.VGMSTREAM_CLI;
if (!decoder) throw Error("Set VGMSTREAM_CLI to the established audio decoder");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "play/data/story-travel-restrictions.json")));
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const temporary = fs.mkdtempSync("/var/tmp/ny-story-travel-voices-");
const output = [];
try {
  for (const rule of catalog.restrictions.filter(entry => entry.voice)) {
    const {id,asset,archive,archiveSha256} = rule.voice;
    if (!/^[A-Z0-9]+$/.test(id) || !/^[A-Z0-9]+\.AFS$/.test(archive)
      || asset !== `public/audio/world/story-travel/${id}.wav`) throw Error(`Invalid voice source ${id}`);
    const bytes = fs.readFileSync(path.join(disc, "data/SCENE/01/STREAM", archive));
    if (hash(bytes) !== archiveSha256) throw Error(`Changed original archive ${archive}`);
    const members = afsMembers(bytes, archive);
    const speech = members.filter(member => /\.str$/i.test(member.name));
    const subtitle = members.find(member => /\.srf$/i.test(member.name));
    const index = speech.findIndex(member => member.name.toUpperCase() === `${id}.STR`);
    if (!subtitle || index < 0) throw Error(`Missing original voice or subtitles for ${id}`);
    const records = parseNativeSrfRecords(subtitle.bytes);
    if (records.length !== speech.length || records[index].displayText !== rule.message) {
      throw Error(`Voice and reminder text do not match for ${id}`);
    }
    const input = path.join(temporary, `${id}.str`), wav = path.join(temporary, `${id}.wav`);
    fs.writeFileSync(input, speech[index].bytes);
    execFileSync(decoder, ["-i", "-o", wav, input], {stdio:"pipe"});
    const decoded = fs.readFileSync(wav);
    if (decoded.subarray(0,4).toString("ascii") !== "RIFF" || decoded.subarray(8,12).toString("ascii") !== "WAVE") {
      throw Error(`Decoder did not produce WAV for ${id}`);
    }
    output.push({asset,wav});
  }
  if (!output.length) throw Error("No Story travel voices to build");
  for (const {asset,wav} of output) {
    const target = path.join(root, asset);
    fs.mkdirSync(path.dirname(target), {recursive:true});
    fs.copyFileSync(wav, target);
  }
  execFileSync(process.execPath, ["tools/runtime-assets.mjs", "update", ...output.map(item => item.asset)], {cwd:root,stdio:"inherit"});
} finally {
  fs.rmSync(temporary, {recursive:true,force:true});
}
