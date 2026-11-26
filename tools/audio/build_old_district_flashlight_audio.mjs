#!/usr/bin/env node
// Recover the five MKSG prop/actor sounds by issuing the source commands to
// the Disc 2 AICA driver. The original score applies pitch, envelope and gain.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { crc32, deflateSync } from "node:zlib";
import { sha256 } from "../lib/NativeAseqActivityPack.mjs";
import { parseDTPK } from "../lib/dtpk.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const disc = process.env.SHENMUE_DISC2_EXTRACTED_ROOT || path.join(root, "extracted_disc2_v2");
const prefix = "public/audio/world/e1kaiqte";
const renderer = process.env.DSF_RENDERER || path.join(root, ".audio-tools/dsf-renderer/dsf-renderer");
const rate = 44100;
const renderSeconds = 3;
const renderFrames = rate * renderSeconds;
const frameSize = 4; // Stereo signed 16-bit PCM.
const bootFrames = 2618;
const sources = {};

function source(name, member, expected) {
  const bytes = fs.readFileSync(path.join(disc, "data", member));
  if (sha256(bytes) !== expected) throw Error("Changed original " + member);
  sources[name] = { path: "disc2/" + member, sha256: expected };
  return bytes;
}

const map = source("map", "SCENE/02/MKSG/MAPINFO.BIN", "8c26c6de22132f8b42a450b31fb3ad4f0a954948e794419319528ac63ce790ae");
const bank = source("bank", "SCENE/02/SOUND/E1KAIQTE.SND", "29d862fe6e0d7e3fcf4e3a518d378e4d0e4cb8535c2aad1fc16f0eebb3dec3f4");
const driver = source("driver", "SOUND/AICADRV.BIN", "3f88553a52a6d1af0b988ea3f41800178988350721bd7422a570dc3e4e369915");
const filename = map.toString("ascii", 0x3dd38, 0x3dd44);
if (map.readUInt32LE(0x3dd30) !== 1 || map.readUInt32LE(0x3dd34) !== 4 || filename !== "e1kaiqte.snd") {
  throw Error("Changed MKSG sound bank registration");
}
const { groups } = parseDTPK(bank);
const group = groups.find(entry => entry.descriptorHex === "a904");
if (groups.length !== 1 || group?.trackCount !== 7) throw Error("Missing MKSG A904 sequence bank");

// The file's only score event on each selected track is DF <playback> 7F 80.
const definitions = [
  [1, 6, 0x21494, "c8be904f38f0a632b160205091cf85f3b7265634e19edf23476223538bda7de9"],
  [2, 3, 0x20b04, "6c72f79b6106c2d1fae1d576d74bd025ce1d87323b1da2dc1f94f0baa49b7eec"],
  [3, 2, 0x219a0, "6e447b8c95ddcfb1361bcded70ec43fa73bf109bc9070618f8fddb20cb60f77c"],
  [4, 1, 0x21760, "566676c6185d1fb4c90ff2a4af19082b3cb9764525f08c505e2e488e7c05ca70"],
  [5, 0, 0x21790, "4e47339c7a1e290dbd57f58028e954447aa46f4902b8642f2af74ec512ac40e0"],
];

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "mksg-audio-"));
function render(command) {
  // AICA system RAM, bank registration and queue layout used by the Disc 2 driver.
  const ram = Buffer.alloc(0x10000 + bank.length);
  driver.copy(ram);
  bank.copy(ram, 0x10000);
  ram.writeUInt32LE(bank.readUInt32LE(4), 0x60);
  ram.writeUInt32BE(0xa0001100, 0x400);
  if (command !== null) ram.writeUInt32BE(command, 0x404);
  const compressed = deflateSync(Buffer.concat([Buffer.alloc(4), ram]));
  const header = Buffer.alloc(16);
  header.write("PSF\x12", "latin1");
  header.writeUInt32LE(compressed.length, 8);
  header.writeUInt32LE(crc32(compressed), 12);
  const dsf = path.join(temp, "capture.dsf");
  const wav = path.join(temp, "capture.wav");
  fs.writeFileSync(dsf, Buffer.concat([header, compressed]));
  execFileSync(renderer, [dsf, wav, String(renderSeconds)], { stdio: "pipe", timeout: 30000 });
  const bytes = fs.readFileSync(wav);
  if (
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.toString("ascii", 8, 16) !== "WAVEfmt " ||
    bytes.readUInt16LE(20) !== 1 || bytes.readUInt16LE(22) !== 2 ||
    bytes.readUInt32LE(24) !== rate || bytes.readUInt16LE(34) !== 16 ||
    bytes.toString("ascii", 36, 40) !== "data" || bytes.length !== 44 + renderFrames * frameSize
  ) {
    throw Error("Unexpected DSF renderer PCM format");
  }
  return bytes;
}

try {
  if (render(null).subarray(44).some(byte => byte !== 0)) throw Error("Empty AICA queue is audible");
  const sounds = [];
  const files = new Map();
  for (const [trackIndex, sampleId, literalOffset, pcmHash] of definitions) {
    const track = group.tracks[trackIndex];
    const command = track.commandHex.toUpperCase();
    const literal = map.subarray(literalOffset, literalOffset + 4).toString("hex");
    if (
      literal !== track.commandHex || track.compositionHex !== "c0df0" + trackIndex + "7f80ff" ||
      track.entries.length !== 1 || track.entries[0].sampleId !== sampleId
    ) {
      throw Error("Changed MKSG sequence or native command " + command);
    }
    const wave = render(Number.parseInt(command, 16));
    const pcm = wave.subarray(44);
    if (sha256(pcm) !== pcmHash) throw Error("Original AICA render changed for " + command);
    // All effects first sound at frame 2618 or 2619 after the isolated driver
    // boots. Strip common boot silence while preserving their relative onset.
    const preroll = pcm.subarray(0, bootFrames * frameSize);
    const onset = pcm.subarray(bootFrames * frameSize, (bootFrames + 2) * frameSize);
    if (preroll.some(byte => byte !== 0) || !onset.some(byte => byte !== 0)) {
      throw Error("Unexpected AICA onset for " + command);
    }
    let end = renderFrames;
    while (end > bootFrames && pcm.readUInt32LE((end - 1) * frameSize) === 0) end--;
    if (end > renderFrames - rate / 2 || end === bootFrames) {
      throw Error("Missing or incomplete sound tail for " + command);
    }
    const data = pcm.subarray(bootFrames * frameSize, end * frameSize);
    const header = Buffer.from(wave.subarray(0, 44));
    header.writeUInt32LE(36 + data.length, 4);
    header.writeUInt32LE(data.length, 40);
    const asset = prefix + "/" + command + ".wav";
    const bytes = Buffer.concat([header, data]);
    files.set(asset, bytes);
    sounds.push({
      command, literalOffset, track: trackIndex, scoreHex: track.compositionHex, sampleId,
      fullRenderPcmSha256: pcmHash, trimmedBootFrames: bootFrames, frames: data.length / frameSize,
      asset, sha256: sha256(bytes),
    });
  }
  const manifest = prefix + "/manifest.json";
  const provenance = { schema: "new-yokosuka-mksg-flashlight-audio-v1", sources, sampleRate: rate, sounds };
  files.set(manifest, JSON.stringify(provenance, null, 2) + "\n");
  fs.mkdirSync(path.join(root, prefix), { recursive: true });
  for (const [asset, bytes] of files) fs.writeFileSync(path.join(root, asset), bytes);
  execFileSync(process.execPath, ["tools/runtime-assets.mjs", "update", ...files.keys()], {
    cwd: root, stdio: "inherit",
  });
  console.log("Rendered five original MKSG flashlight sounds.");
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
