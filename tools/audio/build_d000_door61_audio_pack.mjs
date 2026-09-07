#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseDTPK, translateDTPKRate } from "../lib/dtpk.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = [
  process.env.SHENMUE_DISC1_EXTRACTED_ROOT,
  path.join(repoRoot, "extracted_files"),
].filter(Boolean).find(existsSync);
const decodedDirectory = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (!sourceRoot || !decodedDirectory || !existsSync(decodedDirectory)) {
  throw new Error("Usage: node tools/audio/build_d000_door61_audio_pack.mjs <F1DOBUIT -wavconv directory>");
}

const evidencePath = path.join(repoRoot, "tools/evidence/d000-door-61-closed-check.json");
const evidenceBytes = readFileSync(evidencePath);
const evidence = JSON.parse(evidenceBytes);
const bankPath = path.join(sourceRoot, "data/SCENE/01/SOUND/F1DOBUIT.SND");
const bank = readFileSync(bankPath);
const sha256 = value => createHash("sha256").update(value).digest("hex");
if (
  evidence.status !== "exact-control-presentation-dialogue-and-audio-route"
  || sha256(bank) !== evidence.source.soundBankSha256
) throw new Error("D000 door 61 sound evidence changed");

const parsed = parseDTPK(bank);
const group = parsed.groups.find(candidate => candidate.descriptorHex === evidence.sound.group);
const track = group?.tracks[evidence.sound.track];
const entry = track?.entries?.[0];
const playback = parsed.playbacks.find(candidate => candidate.playbackId === entry?.playbackId);
if (
  track?.commandHex !== evidence.sound.commandHex
  || track?.compositionHex !== evidence.sound.compositionHex
  || track?.entries?.length !== 1
  || playback?.playbackId !== evidence.sound.playbackId
  || playback?.sampleId !== evidence.sound.sampleId
  || `0x${playback.dtpkRate.toString(16).padStart(4, "0")}` !== evidence.sound.dtpkRate
  || translateDTPKRate(playback.dtpkRate) !== evidence.sound.sampleRate
) throw new Error("D000 door 61 DTPK route changed");

const marker = `_Sample_${evidence.sound.sampleId.toString(16).padStart(2, "0")}_`;
const decoded = readdirSync(decodedDirectory).find(filename => (
  filename.toLowerCase().includes(marker.toLowerCase())
  && filename.toLowerCase().endsWith(".wav")
));
if (!decoded) throw new Error(`Decoded sample ${marker} was not found`);
const input = readFileSync(path.join(decodedDirectory, decoded));
if (
  input.subarray(0, 4).toString("ascii") !== "RIFF"
  || input.subarray(12, 16).toString("ascii") !== "WAVE"
  || input.subarray(44, 48).toString("ascii") !== "data"
) throw new Error(`${decoded} lacks DTPKDump's expected WAV layout`);
const pcm = Buffer.concat([
  input.subarray(0, 8), input.subarray(12, 24),
  input.subarray(28, 52), input.subarray(56),
]);
pcm.writeUInt32LE(pcm.length - 8, 4);
pcm.writeUInt16LE(2, 32);
pcm.writeUInt32LE(evidence.sound.sampleRate, 24);
pcm.writeUInt32LE(evidence.sound.sampleRate * 2, 28);

const outputDirectory = path.join(repoRoot, "public/audio/world/f1dobuit");
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(path.join(outputDirectory, `${evidence.sound.commandHex}.wav`), pcm);
writeFileSync(path.join(outputDirectory, "door61-manifest.json"), `${JSON.stringify({
  schema: "new-yokosuka-d000-door61-audio-pack-v1",
  generatedBy: "tools/audio/build_d000_door61_audio_pack.mjs",
  source: {
    bank: path.relative(repoRoot, bankPath), sha256: sha256(bank),
    evidence: path.relative(repoRoot, evidencePath), evidenceSha256: sha256(evidenceBytes),
  },
  track: {
    ...evidence.sound, decodedSource: decoded,
    asset: `${evidence.sound.commandHex}.wav`,
    byteLength: pcm.length, sha256: sha256(pcm),
  },
}, null, 2)}\n`);
console.log(`Wrote D000 door 61 cue to ${outputDirectory}`);
