#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseAuthCamera } from "../../src/AuthCamera.js";
import { parseAuthMovement } from "../../src/AuthMovement.js";
import { parseAuthSequence, resolveAuthMotions } from "../../src/AuthSequence.js";
import { MotnLoader } from "../../src/MotnLoader.js";
import { sha256 } from "../lib/NativeAseqActivityPack.mjs";
import { extractNativeAseqCallbackPresentation } from "../lib/NativeAseqCallbackPresentation.mjs";
import {
  extractNativeAseqCallbackObjectPresentation,
} from "../lib/NativeAseqCallbackObjectPresentation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = [
  process.env.SHENMUE_DISC1_EXTRACTED_ROOT,
  path.join(root, "extracted_files"),
].filter(Boolean).find(existsSync);
if (!sourceRoot) throw new Error("an exact Shenmue Disc 1 extraction was not found");

const sourceDirectory = path.join(sourceRoot, "data/SCENE/01/TOKI");
const auth = readFileSync(path.join(sourceDirectory, "SEQDATA2.BIN"));
const motionBytes = readFileSync(path.join(sourceDirectory, "M_0142.BIN"));
const prop = readFileSync(path.join(sourceDirectory, "MALS509G.MT5"));
const mapinfo = readFileSync(path.join(sourceDirectory, "MAPINFO.BIN"));
const callbackIr = JSON.parse(readFileSync(
  path.join(root, "tools/evidence/toki-native-callback-ir.json"),
  "utf8",
));
if (
  callbackIr.source?.mapinfoSha256 !== "6167c444368db980b6e2534d13b237dfec77be89c3258bbac96bc6efc67e481f"
  || callbackIr.source?.callbackFunction !== "0xa94"
) throw new Error("TOKI native callback evidence changed");
const pins = {
  auth: [15592, "507a20816d8a73a2a41700e90b4bc8e62e9a2b4dc4ad865cdfd9e555f459a38e"],
  motion: [220648, "498586681767acb83318a283b740766129a51fef2a194c9b942690bb6722e6e3"],
  prop: [19912, "a7de7d6a318a17276a983ee4bb2a745a5b934675d0328f4566d0e4a06c48e156"],
};
for (const [label, bytes] of [["SEQDATA2.BIN", auth], ["M_0142.BIN", motionBytes], ["MALS509G.MT5", prop]]) {
  const [byteLength, digest] = label === "SEQDATA2.BIN" ? pins.auth
    : label === "M_0142.BIN" ? pins.motion : pins.prop;
  if (bytes.length !== byteLength || sha256(bytes) !== digest) {
    throw new Error(`TOKI ${label} changed`);
  }
}

const sequence = parseAuthSequence(auth);
const movement = parseAuthMovement(auth);
const camera = parseAuthCamera(auth);
const motion = MotnLoader.parse(motionBytes);
const resolvedMotions = resolveAuthMotions(sequence, new Map([[16, motion]]));
const callbackPresentation = extractNativeAseqCallbackPresentation({
  bytes: mapinfo,
  callbackFunction: 0xa94,
  nativeFunction: callbackIr.function,
  durationFrames: sequence.durationFrames,
});
const callbackObjects = extractNativeAseqCallbackObjectPresentation({
  bytes: mapinfo,
  callbackFunction: 0xa94,
  nativeFunction: callbackIr.function,
  durationFrames: sequence.durationFrames,
});
if (
  sequence.durationFrames !== 5355
  || sequence.frames.length !== 74
  || JSON.stringify(sequence.actors) !== JSON.stringify(["AKIR", "ASDA"])
  || movement.actors.length !== 2
  || camera.cameras.length !== 1
  || resolvedMotions.some(value => value.motionValid !== true)
) throw new Error("TOKI exact AUTH presentation changed");
for (const [index, name] of [
  [4, "AKI_AT1_HAIRU_TOUKIYA_0100"],
  [5, "AKI_AT2_TEGAMIKAIDOKU_TOUKIYA_0100"],
  [6, "AKI_AT3_TEGAMIKAIDOKU_TOUKIYA_0100"],
  [9, "JIJ_KAH_AT3_TEGAMIKAIDOKU_TOUKIYA_0100"],
  [12, "JIJ_KAH_AT2_TEGAMIKAIDOKU_TOUKIYA_2_0100"],
]) {
  if (motion.sequences[index]?.name !== name) throw new Error(`TOKI motion ${index} changed`);
}

const outputDirectory = path.join(root, "play/assets/dobuita/toki");
const outputPrefix = "play/assets/dobuita/toki";
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(path.join(outputDirectory, "SEQDATA2.AUTH"), auth);
writeFileSync(path.join(outputDirectory, "M_0142.MOTN"), motionBytes);
writeFileSync(path.join(outputDirectory, "MALS509G.MT5"), prop);

const handDirectory = path.join(sourceRoot, "data/SCENE/01/MODEL/HAND");
const handPins = Object.freeze({
  "KAS_HM.BIN": [9168, "58aeb13a2458cfc31a539753ef40d8269db1d0c2e86eeca08b8867007a2598d4"],
  "KAS_TL.MT5": [176796, "cbb723c3ab2bb4f26f05992b37852fa0d8f0eeb904510ad68b36bfc829e95970"],
  "KAS_TR.MT5": [176700, "51b7232819cce6014a230cfb1b30e23f06a1b14acaa58e87ef992ad87b1634f3"],
});
const handBytes = Object.fromEntries(Object.entries(handPins).map(([filename, pin]) => {
  const value = readFileSync(path.join(handDirectory, filename));
  if (value.length !== pin[0] || sha256(value) !== pin[1]) {
    throw new Error(`TOKI HAND ${filename} changed`);
  }
  writeFileSync(path.join(outputDirectory, filename), value);
  return [filename, value];
}));

const outputs = [
  ["SEQDATA2.AUTH", auth],
  ["M_0142.MOTN", motionBytes],
  ["MALS509G.MT5", prop],
  ...Object.entries(handBytes),
].map(([filename, bytes]) => ({
  path: `${outputPrefix}/${filename}`,
  byteLength: bytes.length,
  sha256: sha256(bytes),
}));
const attachedObjectCues = callbackObjects.attachedObjectCues.filter((cue, index, values) => (
  values.findLastIndex(value => value.objectTag === cue.objectTag && value.frame === cue.frame)
    === index
));
const asset = filename => ({
  path: `${outputPrefix}/${filename}`,
  sourcePath: `extracted_files/data/SCENE/01/MODEL/HAND/${filename}`,
  byteLength: handPins[filename][0],
  sha256: handPins[filename][1],
});
const manifest = {
  schema: "new-yokosuka-aseq-activity-pack-v1",
  generatedBy: "tools/cutscenes/build_toki_activity_pack.mjs",
  source: {
    disc: 1,
    path: "extracted_files/data/SCENE/01/TOKI/SEQDATA2.BIN",
    sha256: pins.auth[1],
    archiveFormat: "loose-TRCK",
    members: [{ name: "SEQDATA2.BIN", byteLength: pins.auth[0], sha256: pins.auth[1] }],
  },
  nativeBinding: {
    evidence: "tools/evidence/player-cutscene-owner-discovery.json",
    resourceName: "TOKI",
    variant: "",
    selectionRule: "first exact SEQDATA2.BIN install; later installs replay identical bytes",
  },
  audioManifest: "public/audio/world/toki/manifest.json",
  actorTags: sequence.actors,
  nativeHandPoseTables: callbackPresentation.nativeHandPoseTables,
  handAssets: {
    ASDA: {
      actorTag: "ASDA",
      bodyModelCode: "KAS_L",
      handCode: "KAS",
      bodyHandRenderKeys: { left: -0x42, right: -0x41 },
      left: { rootRenderKey: 11, model: asset("KAS_TL.MT5") },
      right: { rootRenderKey: 6, model: asset("KAS_TR.MT5") },
      rig: {
        ...asset("KAS_HM.BIN"),
        transformNodeCount: 71,
        vertexCount: 301,
        pointerOffsets: [24, 168, 8864, 5848, 6456, 9168],
      },
      presentation: {
        attachment: "body-hand-node-world-matrix",
        initialPose: "hm-bind-pose",
        deformationAssetRetained: true,
        nativePoseOperation: "0x005e",
      },
    },
  },
  attachedObjects: {
    TEGS: {
      browserFilename: "MALS509G.MT5",
      assetPath: `${outputPrefix}/MALS509G.MT5`,
      attachments: attachedObjectCues.map(cue => cue.action === "detach" ? ({
        activitySlot: cue.activitySlot,
        frame: cue.frame,
        action: "detach",
        callFileOffset: cue.callFileOffset,
      }) : ({
        activitySlot: cue.activitySlot,
        frame: cue.frame,
        parentActorTag: cue.parentActorTag,
        controlId: cue.controlId,
        translation: cue.translation,
        rotationRaw: cue.rotationRaw,
        callFileOffset: cue.callFileOffset,
      })),
      nodeTransforms: callbackObjects.nodeTransformCues.map(cue => ({
        activitySlot: cue.activitySlot,
        ...(cue.frame === undefined
          ? { firstFrame: cue.firstFrame, lastFrame: cue.lastFrame }
          : { frame: cue.frame }),
        nodeKey: cue.nodeKey,
        mode: cue.mode,
        rotationRaw: cue.rotationRaw,
        callFileOffset: cue.callFileOffset,
      })),
    },
  },
  motionBanks: [{
    bank: 16,
    path: `${outputPrefix}/M_0142.MOTN`,
    byteLength: motionBytes.length,
    sha256: sha256(motionBytes),
  }],
  outputs,
  activities: [{
    slot: 0,
    primaryPointer: 13559,
    secondaryPointer: 13572,
    activityId: "TOKI/SEQDATA2.AUTH",
    archiveMember: "SEQDATA2.AUTH",
    byteLength: auth.length,
    sha256: sha256(auth),
    durationFrames: sequence.durationFrames,
    durationSeconds: Math.max(movement.duration, camera.duration),
    frameCount: sequence.frames.length,
    commandCounts: { camera: 1, move: 2, motion: 6, sound: 29, voice: 41 },
    actors: sequence.actors,
    nativeHandPoseCues: callbackPresentation.nativeHandPoseCues,
    nativeFaceClipCues: callbackPresentation.nativeFaceClipCues,
    nativeFaceGazeCues: callbackPresentation.nativeFaceGazeCues,
    nativeActorLookPointCues: callbackObjects.nativeActorLookPointCues,
    motions: resolvedMotions.map(value => ({
      actorTag: value.actorTag,
      frame: value.frame,
      motionBank: value.motionBank,
      sequenceIndex: value.sequenceIndex,
      motionName: value.motionName,
      startFrame: value.startFrame,
      endFrame: value.endFrame,
    })),
  }],
};
writeFileSync(path.join(outputDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote exact TOKI activity pack to ${outputDirectory}`);
