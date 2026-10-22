#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { buildNativeAseqAudioPack } from "../lib/NativeAseqAudioPack.mjs";
const root=path.resolve(import.meta.dirname,"../..");
const sourceRoot=process.env.SHENMUE_DISC1_EXTRACTED_ROOT || path.join(root,"extracted_files");
const source=relative=>path.join(sourceRoot,"data/SCENE/01",relative);
const dtpkDump=process.env.DTPK_DUMP || path.join(root,".disc-work/pool-audio/dtpkdump/DTPKDump.py");
const vgmstream=process.env.VGMSTREAM_CLI;
if(!vgmstream||!fs.existsSync(vgmstream))throw Error("VGMSTREAM_CLI must locate vgmstream-cli");
const output=buildNativeAseqAudioPack({
  generatedBy:"tools/cutscenes/build_phone_book_audio_pack.mjs",disc:1,
  authDirectory:path.join(root,"play/assets/dobuita/phone-book"),authFiles:["SEQDATA0.AUTH"],
  authManifest:"play/assets/dobuita/phone-book/manifest.json",resourceBindingEvidence:"tools/evidence/d000-phone-book-audio.json",
  stream:{label:"01TEL.AFS",path:source("STREAM/01TEL.AFS"),manifestPath:"extracted_files/data/SCENE/01/STREAM/01TEL.AFS",sha256:"211aab675b0b65ded671d7b5bda0d583fc5382061c4618ca0311522d3668b398"},
  soundBank:{label:"A1_TELP.SND",path:source("SOUND/A1_TELP.SND"),manifestPath:"extracted_files/data/SCENE/01/SOUND/A1_TELP.SND",sha256:"70b37d84b73c8823bbbaaac641ee34bb462d52783c989aca35df410cc4f786d6"},
  outputDirectory:path.join(root,"public/audio/world/phone-book"),outputAssetPrefix:"public/audio/world/phone-book",
  dtpkDump,vgmstream,python:process.env.DTPK_PYTHON || "python3",
});
console.log(`Built ${output.voices.length} original directory voices and ${output.sounds.length} sound references`);
