#!/usr/bin/env node
// Authored dialogue timing around original speech; no native controller execution.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { afsMembers } from "../lib/NativeAseqAudioPack.mjs";
import { parseNativeSrfRecords } from "../../src/NativeLipSync.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = process.env.SHENMUE_DISC1_EXTRACTED_ROOT || path.join(root, "extracted_files");
const decoder = process.env.VGMSTREAM_CLI;
if (!decoder) throw new Error("VGMSTREAM_CLI is required");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const bytes = fs.readFileSync(path.join(source, "data/SCENE/01/STREAM/SA1116.AFS"));
const sourceHash = "4fd86759263b7666c96e5ffe33638f4d67da1f38ebb51bd596227ad6ab675398";
if (hash(bytes) !== sourceHash) throw new Error("SA1116 source changed");
const members = afsMembers(bytes, "SA1116"), speech = members.filter(m => /\.str$/i.test(m.name));
const subtitles = parseNativeSrfRecords(members.find(m => /\.srf$/i.test(m.name)).bytes);
if (speech.length !== 11 || subtitles.length !== speech.length) throw new Error("SA1116 subtitle/voice correspondence changed");
const output = "public/audio/world/first-dojo";
fs.mkdirSync(path.join(root, output, "voice"), { recursive: true });
const temporary = fs.mkdtempSync("/var/tmp/ny-first-dojo-");
try {
  const voices = speech.map((member, index) => {
    const voiceId = member.name.replace(/\.str$/i, "");
    const input = path.join(temporary, member.name), asset = `${output}/voice/${voiceId}.wav`;
    fs.writeFileSync(input, member.bytes);
    execFileSync(decoder, ["-o", path.join(root, asset), input], { stdio: "pipe" });
    const duration = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path.join(root, asset)], { encoding: "utf8" }).trim());
    if (!Number.isFinite(duration) || duration <= 0) throw new Error(`Invalid voice duration: ${voiceId}`);
    const wav = fs.readFileSync(path.join(root, asset));
    return { ...subtitles[index], voiceId, sourcePath: `SA1116/${member.name}`, asset,
      nativeSha256: hash(member.bytes), byteLength: wav.length, sha256: hash(wav), durationSeconds: duration };
  });
  // Original JHD0 owner 0x3aec8 orders these eleven lines before MSKA slot 0.
  const order = ["B001", "A001", "B002", "A002", "B003", "A003", "B004", "A004", "A005", "A006", "B005"];
  const lines = order.map(id => {
    const voice = voices.find(v => v.voiceId === `SA1116${id}`);
    if (!voice) throw new Error(`Missing original line ${id}`);
    return { sourcePath: voice.sourcePath, durationFrames: Math.ceil(voice.durationSeconds * 30) + 9 };
  });
  fs.writeFileSync(path.join(root, output, "manifest.json"), JSON.stringify({
    schema: "new-yokosuka-aseq-audio-pack-v2", generatedBy: "tools/cutscenes/build_first_dojo_assets.mjs",
    source: { path: "disc1/SCENE/01/STREAM/SA1116.AFS", sha256: sourceHash }, voices, sounds: [],
    authoredLeadIn: { evidence: "JHD0 MAPINFO 0x3aec8; original line order, held MSKA poses/camera and voice-length timing are authored approximations", lines },
  }, null, 2) + "\n");
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
