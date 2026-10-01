#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildNativeAseqAudioPack } from "../lib/NativeAseqAudioPack.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = process.env.SHENMUE_DISC1_EXTRACTED_ROOT || path.join(root, "extracted_files");
const musicPath = path.join(root, "public/music/manifest.json");
const music = JSON.parse(readFileSync(musicPath));
const viewerMusic = JSON.parse(readFileSync(path.join(root, "public/music/asset-viewer-manifest.json")));
for (const [id, sourceId] of [
  ["bgm120", "6f6feae07377adcf7a511b69ae27bb46bd4b93a8a23f60eff32750d44cdd1264"],
  ["op00-dream-tsm006", "2656077848045a242f05170457f670fbb6c70ab3f7f49d6b6d40b6842c4d1ef2"],
]) {
  const track = viewerMusic.tracks[sourceId];
  const bytes = readFileSync(path.join(root, "public", track.ogg_url));
  music.tracks[id] = { label: track.label, url: track.ogg_url, durationSeconds: track.durationSeconds,
    loop: false, sha256: createHash("sha256").update(bytes).digest("hex"), source: track.source };
}
writeFileSync(musicPath, JSON.stringify(music, null, 2) + "\n");
for (const [id, streamName, streamHash, bankName, bankHash] of [
  ["op00-mail", "A01103.AFS", "7e0be1bdf65a820afbf5e705fa29048e8c4e5af08cfdd3a423c5edca6c4bd6ed", "A1_TKINE.SND", "e72195163c278d908981a457011ef7c2d70d2a4d83274bae6c17935c462260ba"],
  ["op00-dream", "A0119.AFS", "c3541b5503030a1f4e1a65c09d790162d3468f7d54973bd05b5eeb60067101f2", "A1_UNASA.SND", "c27b48c423fda444a9a346667e8a1750eeb9191c25d071478571352b8a2a0b8a"],
]) {
  const authManifest = `play/assets/introduction/${id}/manifest.json`;
  const manifest = JSON.parse(readFileSync(path.join(root, authManifest)));
  // Old authoring path strings (including /0114/) do not select sound banks.
  // The owner keeps A1_UNASA in slot 4 through the entire dream montage.
  const activities = manifest.activities;
  const source = (folder, name, sha256) => ({ label: name, sha256,
    path: path.join(sourceRoot, `data/SCENE/01/${folder}/${name}`),
    manifestPath: `extracted_files/data/SCENE/01/${folder}/${name}` });
  buildNativeAseqAudioPack({ generatedBy: "tools/cutscenes/build_op00_continuation_audio.mjs", disc: 1,
    authManifest, authDirectory: path.join(root, `play/assets/introduction/${id}`),
    authFiles: activities.map(a => a.archiveMember), resourceBindingEvidence: "tools/evidence/op00-opening-owner-ir.json",
    stream: source("STREAM", streamName, streamHash), soundBank: source("SOUND", bankName, bankHash),
    // Two recycled /0114/ tracks retain a PROLG clothing cue, but the dream
    // owner replaces slot 4 with UNASA (only tracks 0..5). Do not substitute
    // a sound from the unloaded murder bank. This omission is explicit until
    // the original driver's handling of the out-of-range cue is established.
    unavailableSounds: id === "op00-dream" ? {
      "a9042000:/p16/prj16m5/AUTH01/0114/SE/cloths/RYODORO2.aiff": {
        reason: "Dream owner 0x1dde2 binds A1_UNASA.SND to bank 4; track 32 is absent (bank contains tracks 0..5). Recycled slots 44 and 46 retain this PROLG-only clothing cue; native out-of-range behavior is unverified.",
        evidence: "tools/evidence/op00-opening-owner-ir.json",
      },
    } : undefined,
    outputDirectory: path.join(root, `public/audio/world/${id}`), outputAssetPrefix: `public/audio/world/${id}`,
    dtpkDump: process.env.DTPK_DUMP || path.join(root, ".disc-work/pool-audio/dtpkdump/DTPKDump.py"),
    vgmstream: process.env.VGMSTREAM_CLI || path.join(root, ".disc-work/tooling/vgmstream/vgmstream-cli"),
    python: process.env.DTPK_PYTHON || "python3.12",
  });
  console.log(`Wrote ${id} native voices and sounds`);
}
