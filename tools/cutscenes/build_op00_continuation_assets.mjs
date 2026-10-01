#!/usr/bin/env node
// The post-murder scenes are embedded in OP00, not the later BEBF nightmare.
// Preserve their original owner selection, CHRT identities and motion banks.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildNativeAseqActivityPack, parseIpacActivityArchive, sha256 } from "../lib/NativeAseqActivityPack.mjs";
import { parseChrtSceneObjectBindings } from "../lib/chrt_scene_object_bindings.js";
import { parseAuthSequence } from "../../src/AuthSequence.js";
import { extractNativeAseqCallbackPresentation, extractNativeAseqOwnerHandPresentation } from "../lib/NativeAseqCallbackPresentation.mjs";
import { nativeAseqGoverningActivityFrame } from "../lib/NativeAseqScriptOwnership.mjs";
import { parseNativeHandRig } from "../../src/NativeHandRig.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = process.env.SHENMUE_DISC1_EXTRACTED_ROOT || path.join(root, "extracted_files");
const sourcePath = path.join(sourceRoot, "data/SCENE/01/OP00/MAPINFO.BIN");
const map = readFileSync(sourcePath);
const mapHash = "8c2e8957ba3c96eb0a1315249db1abe1cb5931ea1bd63ee9601f30d1c8f257e4";
const evidencePath = "tools/evidence/op00-opening-owner-ir.json";
const ir = JSON.parse(readFileSync(path.join(root, evidencePath)));
if (sha256(map) !== mapHash || ir.source.mapinfoSha256 !== mapHash) throw new Error("OP00 continuation source changed");
const callbackEvidencePath = "tools/evidence/op00-continuation-native-callback-ir.json";
const callbackIr = JSON.parse(readFileSync(path.join(root, callbackEvidencePath)));
if (callbackIr.source.mapinfoSha256 !== mapHash) throw new Error("OP00 continuation callback source changed");
const callbackFunctions = [callbackIr.function, ...callbackIr.supportingFunctions];
const presentationCallbacks = new Map(callbackFunctions
  .filter(fn => fn.blocks.some(block => block.actions.some(action => ["actor-face-clip-control-write",
    "resolved-face-controller-setup", "resolved-object-hndl-hndr-vector-install", "actor-mhnd-controller-request",
    "resolved-object-hndl-hndr-component-write"].includes(action.semanticId))))
  .map(fn => [fn.id, fn]));
const inventory = JSON.parse(readFileSync(path.join(root, "play/assets/introduction/op00/asset-inventory.generated.json")));
const scene = JSON.parse(readFileSync(path.join(root, "play/data/events/op00-introduction-scene.json")));
const mapNames = scene.environment.renderedFoundation.map(name => name.replace(/^S1_OP00_|\.MT5$/g, ""));
const afs = readFileSync(path.join(sourceRoot, "data/SCENE/01/OP00/OP99.AFS"));
if (sha256(afs) !== "738cb6917d7bc08cc5bbd12e5ded5157ff9c5ffadcce199c5c0f89b25b9c557f") throw new Error("OP99 changed");
const members = [];
const bindings = new Map();
for (let index = 0; index < afs.readUInt32LE(4); index++) {
  const offset = afs.readUInt32LE(8 + index * 8);
  const bytes = afs.subarray(offset, offset + afs.readUInt32LE(12 + index * 8));
  if (!["PAKS", "PAKF"].includes(bytes.toString("ascii", 0, 4))) continue;
  for (const member of parseIpacActivityArchive(bytes).members) {
    members.push({ ...member, archiveEntryIndex: index });
    if (member.name === "CHARA.CHRT") for (const binding of parseChrtSceneObjectBindings(member.bytes)) {
      bindings.set(binding.actorTag, { ...binding, archiveEntryIndex: index });
    }
  }
}
const tracks = [];
for (let offset = 0x22ae4; offset < map.length - 8; offset += 4) {
  if (map.toString("ascii", offset, offset + 4) !== "TRCK") continue;
  const byteLength = map.readUInt32LE(offset + 4);
  const bytes = map.subarray(offset, offset + byteLength);
  parseAuthSequence(bytes);
  tracks.push({ sourceOffset: offset, byteLength, bytes });
  offset += byteLength - 4;
}
if (tracks.length !== 47) throw new Error("OP00 embedded AUTH count changed");
const definitions = [
  { id: "op00-mail", owner: "0x1bfa4", ownerCall: "0x204b8", slots: [26, 27, 25],
    bank: 23, motion: "M_01103.BIN", motionHash: "7a71d2308e02dc6ec1693cb32b60f2d74fdd48d58d69574aa858b338e48e9735",
    actors: ["INE_", "KWMT"], objects: ["MNLF", "MNRG", "BIKE", "PSTH", "FUTO"],
    music: [{ trackId: "bgm049", activitySlot: 26, loop: false }] },
  { id: "op00-dream", owner: "0x1dda8", ownerCall: "0x204c4", slots: [28, ...Array.from({ length: 17 }, (_, i) => i + 30), 29],
    bank: 24, motion: "M_0119.BIN", motionHash: "5526e7ce5da4868b858198a562e6922b3df942dc423597f63ddd5fc1b1892efd",
    actors: ["AKI_", "IWAO", "SORY"], objects: [],
    music: [{ trackId: "bgm120", activitySlot: 28, loop: false }, { trackId: "op00-dream-tsm006", activitySlot: 30, loop: false }] },
];
for (const definition of definitions) {
  const prefix = `play/assets/introduction/${definition.id}`;
  const directory = path.join(root, prefix);
  mkdirSync(directory, { recursive: true });
  const generatedAssets = [];
  const asset = name => {
    const member = members.find(member => member.name === name);
    if (!member) throw new Error(`OP99 missing ${name}`);
    const canonical = inventory.assets.find(a => `${a.nativeName}.${a.extension}` === name && a.assetPath);
    if (canonical) return canonical.assetPath;
    const assetPath = `${prefix}/${name}`;
    if (!generatedAssets.some(a => a.assetPath === assetPath)) generatedAssets.push({
      assetPath, bytes: member.bytes, source: { archive: "OP99.AFS", archiveEntryIndex: member.archiveEntryIndex, member: name },
    });
    return assetPath;
  };
  const packageActors = Object.fromEntries(definition.actors.map(actorTag => {
    const binding = bindings.get(actorTag);
    if (!binding) throw new Error(`OP00 missing CHRT actor ${actorTag}`);
    return [actorTag, { label: actorTag, modelCode: binding.model,
      browserFilename: `S1_OP00_${binding.model}.MT5`, assetPath: asset(`${binding.model}.CHRM`),
      assetFormat: "MT5", characterScale: 1 }];
  }));
  // Register all murder props too: those resident browser roots must not leak
  // into the later stages after the original owner has released their CHRT.
  const sceneObjects = { ...inventory.sceneObjects };
  for (const actorTag of definition.objects) {
    const binding = bindings.get(actorTag);
    sceneObjects[actorTag] = { model: binding.model, browserFilename: `S1_OP00_${binding.model}.MT5`,
      assetPath: asset(`${binding.model}.CHRM`), lifecycle: { kind: binding.presentation ? "room-script-persistent" : "auth-scoped" },
      ...(binding.presentation ? { initialPresentation: binding.presentation } : {}) };
  }
  const owner = ir.supportingFunctions.find(f => f.id === definition.owner);
  const actions = owner.blocks.flatMap(block => block.actions);
  const calls = actions.filter(a => a.operationId === 0x50 && a.arguments[0].value !== 0xffffffff);
  if (JSON.stringify(calls.map(a => a.arguments[0].value)) !== JSON.stringify(definition.slots)) throw new Error("OP00 continuation selection changed");
  const ownerHands = extractNativeAseqOwnerHandPresentation({ bytes: map, nativeFunction: owner,
    functions: callbackFunctions, stages: calls.map(call => ({ slot: call.arguments[0].value,
      ownerCallFileOffset: call.callFileOffset, actors: parseAuthSequence(tracks[call.arguments[0].value].bytes).actors })) });
  const nativeHandPoseTables = { ...ownerHands.nativeHandPoseTables };
  const faceCallbackSelections = [];
  const handCallbackSelections = [];
  const activities = definition.slots.map(slot => {
    const call = calls.find(a => a.arguments[0].value === slot);
    const sequence = parseAuthSequence(tracks[slot].bytes);
    const previousCall = calls[calls.indexOf(call) - 1];
    const launches = actions.slice(previousCall ? actions.indexOf(previousCall) + 1 : 0, actions.indexOf(call))
      .filter(action => action.kind === "childCoroutineLaunch" && presentationCallbacks.has(action.targetFileOffset));
    if (launches.length > 1) throw new Error(`OP00 slot ${slot} has multiple presentation callbacks`);
    let faceCues = {};
    const handCues = { ...ownerHands.bySlot.get(slot), nativeHandComponentCues: [] };
    if (launches.length) {
      const launch = launches[0];
      const nativeFunction = presentationCallbacks.get(launch.targetFileOffset);
      const callbackFunction = Number.parseInt(nativeFunction.id, 16);
      const faceActions = nativeFunction.blocks.flatMap(block => block.actions).filter(action =>
        ["actor-face-clip-control-write", "resolved-face-controller-setup"].includes(action.semanticId));
      // The waking coroutine continues into post-AUTH idle. Decode its whole
      // timeline, but retain only cues owned by this activity; keep the tail as
      // source evidence rather than stretching the selected cutscene duration.
      const callbackDuration = Math.max(sequence.durationFrames, ...faceActions.map(action =>
        nativeAseqGoverningActivityFrame(map, callbackFunction, Number.parseInt(action.callFileOffset, 16)) + 1));
      const presentation = extractNativeAseqCallbackPresentation({
        bytes: map, callbackFunction, nativeFunction, activitySlot: slot, durationFrames: callbackDuration,
      });
      faceCues = Object.fromEntries(["nativeFaceClipCues", "nativeFaceControllerCues", "nativeFaceGazeCues"].map(key =>
        [key, presentation[key].filter(cue => cue.frame < sequence.durationFrames)]));
      Object.assign(nativeHandPoseTables, presentation.nativeHandPoseTables);
      const orderBase = handCues.nativeHandPoseCues.length + handCues.nativeBodyHandPoseCues.length;
      for (const key of ["nativeHandPoseCues", "nativeBodyHandPoseCues", "nativeHandComponentCues"]) {
        handCues[key] = [...handCues[key], ...presentation[key].filter(cue => cue.frame < sequence.durationFrames)
          .map((cue, index) => ({ ...cue, sourceOrder: orderBase + (cue.sourceOrder ?? index) }))];
      }
      handCues.nativeHandComponentLimitations = presentation.nativeHandComponentLimitations;
      handCallbackSelections.push({ slot, callbackFunction: nativeFunction.id, ownerCallFileOffset: launch.callFileOffset });
      faceCallbackSelections.push({ slot, callbackFunction: nativeFunction.id, ownerCallFileOffset: launch.callFileOffset,
        excludedAfterActivity: presentation.nativeFaceClipCues.filter(cue => cue.frame >= sequence.durationFrames) });
    }
    const visible = new Map();
    for (const action of actions) {
      if (action === call) break;
      if (action.semanticId === "resolved-object-presentation-flag") visible.set(action.arguments[0].ascii, action.arguments[1].value === 1);
    }
    // AUTH's actor list can include a hidden reference actor. Keep its motion
    // and resources, but project the owner's explicit presentation flag.
    const hiddenActors = sequence.actors.filter(tag => visible.get(tag) === false);
    const bedroom = [28, 29].includes(slot);
    const dream = definition.id === "op00-dream" && !bedroom;
    return { slot, file: `SEQDATA${slot}.AUTH`, binding: { kind: "map-embedded-slot" }, hiddenActors, ...faceCues, ...handCues,
      nativeSceneObjectStates: Object.entries(sceneObjects).filter(([,v]) => v.lifecycle.kind === "room-script-persistent")
        .map(([actorTag]) => ({ actorTag, presented: definition.objects.includes(actorTag) && (visible.get(actorTag) ?? true) })),
      // OP00's bedroom (OMO) and exterior/dojo are co-resident in the browser.
      // The montage borrows actors, not the dojo. Reuse shared dream staging;
      // this black backdrop does not reproduce the native fog/flash controllers.
      ...(dream ? { browserIsolatedStage: true, browserBackgroundColor: [0, 0, 0, 1] } : {}),
      browserMapVisibility: mapNames.map(nativeName => ({
        nativeName, visible: !dream && (nativeName === "OMO" ? bedroom : nativeName !== "OMADO" && !bedroom),
      })),
    };
  });
  const selected = definition.slots.map(slot => ({ name: `SEQDATA${slot}.AUTH`, sourcePath,
    sourceManifestPath: "extracted_files/data/SCENE/01/OP00/MAPINFO.BIN", sourceOffset: tracks[slot].sourceOffset,
    sourceSha256: mapHash, byteLength: tracks[slot].byteLength, sha256: sha256(tracks[slot].bytes) }));
  const motionPath = path.join(sourceRoot, `data/SCENE/01/OP00/${definition.motion}`);
  const motionBytes = readFileSync(motionPath);
  if (sha256(motionBytes) !== definition.motionHash) throw new Error("OP00 motion changed");
  generatedAssets.push({ assetPath: `${prefix}/${definition.motion}`, bytes: motionBytes });
  const motionBanks = [{ bank: definition.bank, sourcePath: motionPath, assetPath: `${prefix}/${definition.motion}`,
    byteLength: motionBytes.length, sha256: definition.motionHash }];
  if (definition.id === "op00-dream") {
    const original = JSON.parse(readFileSync(path.join(root, "play/assets/introduction/op00/manifest.json"))).motionBanks[0];
    motionBanks.push({ ...original, sourcePath: path.join(root, original.path), assetPath: original.path });
  }
  const facesByBody = new Map(Object.values(inventory.facialAssets).map(face => [face.bodyModelCode, face]));
  if (Object.values(packageActors).some(actor => actor.modelCode === "YKD_M")) {
    // OP99 CHRT selects the sleepwear YKD variant under AKI_, not AKIR/YKC.
    // Use its matching self-contained disc FACE model and exact archive FTBL.
    const modelSource = "extracted_files/data/SCENE/01/MODEL/FACE/YKD_F.MT5";
    const modelBytes = readFileSync(path.join(sourceRoot, "data/SCENE/01/MODEL/FACE/YKD_F.MT5"));
    if (sha256(modelBytes) !== "9d90eee53400ab16c63f45584559ae7288cea2ef1b7a3b7a5f9b471106fc9aea") throw new Error("YKD FACE model changed");
    const tablePath = asset("YKD_FTBL.BIN");
    const tableBytes = members.find(member => member.name === "YKD_FTBL.BIN").bytes;
    const posePath = `${prefix}/ykd-talk-poses.generated.json`;
    const poseBytes = readFileSync(path.join(root, posePath));
    const poses = JSON.parse(poseBytes).actors.AKI_;
    if (poses?.faceCode !== "YKD" || poses.tableSha256 !== sha256(tableBytes)) throw new Error("YKD TALK poses do not match OP99 FTBL");
    const record = (assetPath, bytes) => ({ path: assetPath, byteLength: bytes.length, sha256: sha256(bytes) });
    const modelPath = `${prefix}/YKD_F.MT5`;
    generatedAssets.push({ assetPath: modelPath, bytes: modelBytes, source: { path: modelSource } },
      { assetPath: posePath, bytes: poseBytes });
    facesByBody.set("YKD_M", {
      bodyModelCode: "YKD_M", faceCode: "YKD", attachmentRenderKey: -0x43, faceRootRenderKey: 3, eyeRenderKeys: [77, 78],
      model: { ...record(modelPath, modelBytes), sourcePath: modelSource },
      table: record(tablePath, tableBytes), poses: { ...record(posePath, poseBytes), actorTag: "AKI_" },
    });
  }
  const facialAssets = Object.fromEntries(Object.entries(packageActors).flatMap(([actorTag, actor]) => {
    const face = facesByBody.get(actor.modelCode);
    return face ? [[actorTag, { ...face, actorTag }]] : [];
  }));
  for (const activity of activities) for (const cue of [...activity.nativeFaceClipCues || [], ...activity.nativeFaceControllerCues || []]) {
    if (!facialAssets[cue.actorTag]) throw new Error(`OP00 FACE cue ${cue.callFileOffset} has no matching actor resource`);
  }
  const handsByBody = new Map(Object.values(inventory.handAssets).map(hand => [hand.bodyModelCode, hand]));
  if (Object.values(packageActors).some(actor => actor.modelCode === "YKD_M")) {
    // OP99 entry 25 supplies YKD body, T-left/T-right and HM together. The
    // global MT5 hands supply their textures; do not borrow jacket-Ryo's YKB.
    const files = [
      ["YKD_TL.MT5", 47804, "4e2b42891e99adf3272d28dddd139bdf3de5ab62a4c2cd111425434d67904d14"],
      ["YKD_TR.MT5", 47868, "baa29587c3d53740ddac70330a926cf32cd6c5ddc4e87415b14c1b9371eb1d05"],
      ["YKD_HM.BIN", 9272, "bee95bb9557c1e8d6be25a7e92a0a5dd03ae3d15f1ac8a46d41a9c6a4d2f6fc6"],
    ].map(([filename, byteLength, digest]) => {
      const sourcePath = `extracted_files/data/SCENE/01/MODEL/HAND/${filename}`;
      const bytes = readFileSync(path.join(sourceRoot, `data/SCENE/01/MODEL/HAND/${filename}`));
      if (bytes.length !== byteLength || sha256(bytes) !== digest) throw new Error(`${filename} source changed`);
      const archiveName = filename.replace(/\.MT5$/, ".CHRM");
      if (!members.some(member => member.archiveEntryIndex === 25 && member.name === archiveName)) throw new Error(`OP99 YKD binding lacks ${archiveName}`);
      const assetPath = `${prefix}/${filename}`;
      generatedAssets.push({ assetPath, bytes, source: { path: sourcePath, archive: "OP99.AFS", archiveEntryIndex: 25, member: archiveName } });
      return { bytes, record: { path: assetPath, sourcePath, byteLength, sha256: digest } };
    });
    const rig = parseNativeHandRig(files[2].bytes);
    if (!files[2].bytes.equals(members.find(member => member.name === "YKD_HM.BIN").bytes)) throw new Error("YKD archive/global HM differs");
    handsByBody.set("YKD_M", { bodyModelCode: "YKD_M", handCode: "YKD", bodyHandRenderKeys: { left: -66, right: -65 },
      left: { rootRenderKey: files[0].bytes.readUInt32LE(files[0].bytes.readUInt32LE(8)) & 0xffff, model: files[0].record },
      right: { rootRenderKey: files[1].bytes.readUInt32LE(files[1].bytes.readUInt32LE(8)) & 0xffff, model: files[1].record },
      rig: { ...files[2].record, transformNodeCount: 71, vertexCount: rig.vertexCount,
        pointerOffsets: Array.from({ length: 6 }, (_, index) => files[2].bytes.readUInt32LE(index * 4)) },
      presentation: { attachment: "body-hand-node-world-matrix", initialPose: "hm-bind-pose",
        deformationAssetRetained: true, nativePoseOperation: "0x005e" } });
  }
  const handAssets = Object.fromEntries(Object.entries(packageActors).flatMap(([actorTag, actor]) => {
    const hand = handsByBody.get(actor.modelCode);
    return hand ? [[actorTag, { ...hand, actorTag }]] : [];
  }));
  for (const activity of activities) for (const cue of [...activity.nativeHandPoseCues, ...activity.nativeBodyHandPoseCues]) {
    if (!handAssets[cue.actorTag]) throw new Error(`OP00 HAND cue ${cue.callFileOffset} has no matching actor resource`);
  }
  const manifest = buildNativeAseqActivityPack({ generatedBy: "tools/cutscenes/build_op00_continuation_assets.mjs", resourceName: "OP00", disc: 1,
    sourceMembers: selected, expectedMembers: selected, bindingEvidence: evidencePath,
    selectionRule: `OP00 owner ${definition.owner}, validated by the shared control-flow compiler`,
    outputDirectory: directory, outputAssetPrefix: prefix, manifestPath: path.join(directory, "manifest.json"),
    motionBanks, activities, packageActors, sceneObjects, facialAssets, handAssets, nativeHandPoseTables, generatedAssets,
    mapLayers: activities[0].browserMapVisibility.map(({ nativeName }) => ({ nativeName, browserFilename: `S1_OP00_${nativeName}.MT5` })),
  });
  writeFileSync(path.join(directory, "manifest.json"), JSON.stringify({ ...manifest,
    source: { ...manifest.source, sha256: mapHash }, music: definition.music,
    ...(faceCallbackSelections.length ? { nativeFaceCallbackSource: { path: callbackEvidencePath, mapinfoSha256: mapHash, selections: faceCallbackSelections } } : {}),
    nativeHandCallbackSource: { path: callbackEvidencePath, mapinfoSha256: mapHash, selections: handCallbackSelections,
      ownerFunction: owner.id, unpresentedOwnerCues: ownerHands.unpresentedCues },
    limitations: ["Native post-process dream flashes and per-shot lighting are not reproduced.", "Sleeping blanket deformation remains the separate tracked blanket issue.",
      ...(definition.id === "op00-dream" ? ["Lan Di's separate HNDM right-hand motion in callback 0x11dac is not yet projected; his authored static HAND pose is retained."] : [])],
  }, null, 2) + "\n");
  // Feed the same authoritative owner-order compiler used by the murder scene.
  writeFileSync(path.join(directory, "owner-program.generated.json"), JSON.stringify({
    id: definition.id, disc: 1, area: "OP00", mapinfoSha256: mapHash, entryFunction: ir.function.id,
    functions: [ir.function, owner], authResourceSelection: {
      selectionKind: "original-script-stages",
      stages: [{ ownerCallFileOffset: definition.ownerCall, functionId: owner.id }], selectedSlots: definition.slots,
      completionBoundary: { kind: "after-original-stage-return", functionId: ir.function.id,
        callFileOffset: definition.ownerCall, completedStageFunction: owner.id }, ownerCalls: calls.map(call => {
        const slot = call.arguments[0].value;
        return { functionId: owner.id, callFileOffset: call.callFileOffset, slot,
          resource: { sha256: sha256(tracks[slot].bytes), byteLength: tracks[slot].byteLength } };
      }),
    },
  }, null, 2) + "\n");
  console.log(`Wrote ${definition.id}: ${activities.length} original AUTH activities`);
}
