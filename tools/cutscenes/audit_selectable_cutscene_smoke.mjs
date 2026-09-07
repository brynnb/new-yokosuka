#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

import { NativeAseqActivityRuntime } from "../../play/events/NativeAseqActivityRuntime.js";
import { NativeAseqPresentationRuntime } from "../../play/events/NativeAseqPresentationRuntime.js";
import { createNativeEventInterpreter } from "../../play/events/NativeEventInterpreter.js";
import {
  createNativeEventOperationExecutor,
  createNativeOperation0050SemanticHandlers,
  createNativeOperation013eSemanticHandlers,
} from "../../play/events/NativeEventOperationRuntime.js";
import { createNativeRuntimeInterfaceExecutor } from "../../play/events/NativeRuntimeInterface.js";
import {
  createNativeSceneFieldRuntimeContext,
  createNativeSceneGameplayState,
} from "../../play/events/NativeSceneGameplayState.js";
import { NativeCutscenePackageRegistry } from "../../play/cutscenes/NativeCutscenePackageRegistry.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_OUTPUT = "tools/evidence/selectable-cutscene-smoke.json";
const PROGRAM_PACK_PATH = "play/data/events/nativeEventPrograms.generated.json";
const MUSIC_MANIFEST_PATH = "public/music/manifest.json";

function json(relativePath) {
  return JSON.parse(readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function sha256(relativePath) {
  return createHash("sha256")
    .update(readFileSync(path.join(ROOT, relativePath)))
    .digest("hex");
}

function sourcePathForUrl(url) {
  if (url.startsWith("/play/")) return url.slice(1);
  if (url.startsWith("/audio/") || url.startsWith("/music/")) {
    return `public${url}`;
  }
  return null;
}

function localAssetPath(sourcePath) {
  if (sourcePath === "/motion/MOTION.BIN") {
    return ".disc-work/runtime-motion/MOTION.BIN";
  }
  return sourcePath;
}

function requireFile(relativePath, label) {
  if (!relativePath || !existsSync(path.join(ROOT, relativePath))) {
    throw new Error(`${label} ${relativePath || "<missing>"} is unavailable`);
  }
  return relativePath;
}

function recursiveAssetPaths(value, found = new Set()) {
  if (typeof value === "string") {
    if (value.startsWith("play/") || value.startsWith("public/")) found.add(value);
    return found;
  }
  if (Array.isArray(value)) {
    for (const child of value) recursiveAssetPaths(child, found);
    return found;
  }
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) recursiveAssetPaths(child, found);
  }
  return found;
}

function availableActorTags(definition) {
  return new Set([
    "AKIR",
    ...(definition.actors?.playerActorAliases || []),
    ...(definition.actors?.ignoredActorTags || []),
    ...definition.actorDefinitions.map(actor => actor.actorCode),
    ...Object.keys(definition.environment?.sceneObjects || {}),
    ...Object.keys(definition.environment?.packageActors || {}),
  ].map(value => String(value).toUpperCase()));
}

function simpleAdapter(methods, overrides = {}) {
  return Object.fromEntries(methods.map(method => [
    method,
    overrides[method] || (() => true),
  ]));
}

function createAuditPresentation(definition, metrics) {
  const available = availableActorTags(definition);
  const actorOwners = new WeakMap();
  const actors = simpleAdapter(
    ["begin", "applyTransform", "applyMotion", "end"],
    {
      begin(owner, actorTags) {
        const missing = actorTags.filter(tag => !available.has(tag));
        if (missing.length > 0) {
          throw new Error(`actors ${missing.join(", ")} have no model owner`);
        }
        actorOwners.set(owner, new Set(actorTags));
        metrics.actorTags.push(...actorTags);
        return true;
      },
      applyTransform(owner, actorTag) {
        if (!actorOwners.get(owner)?.has(actorTag)) {
          throw new Error(`movement actor ${actorTag} is outside activity ownership`);
        }
        metrics.transforms += 1;
        return true;
      },
      applyMotion(owner, actorTag) {
        if (!actorOwners.get(owner)?.has(actorTag)) {
          throw new Error(`motion actor ${actorTag} is outside activity ownership`);
        }
        metrics.motions += 1;
        return true;
      },
      end(owner) {
        actorOwners.delete(owner);
        return true;
      },
    },
  );
  const camera = simpleAdapter(["begin", "apply", "end"], {
    apply() {
      metrics.cameraFrames += 1;
      return true;
    },
  });
  const audio = simpleAdapter(["begin", "play", "end"], {
    play(_owner, command) {
      const assets = command.audio?.assetUrls || [];
      for (const url of assets) {
        requireFile(sourcePathForUrl(url), `${command.name} asset`);
      }
      metrics[command.name === "voice" ? "voices" : "sounds"] += 1;
      if (command.name === "voice") {
        metrics.voiceIds.push(command.audio?.voiceId || null);
        metrics.voiceSpeakerIds.push(command.audio?.speakerId || null);
        if (command.audio?.silent === true) {
          metrics.silentVoiceIds.push(command.audio?.voiceId || null);
        }
      }
      return true;
    },
  });
  const faces = definition.presentation?.facialAssets
    ? simpleAdapter(["prepare", "begin", "play", "apply", "end"], {
        play(_owner, command) {
          if (command.name === "face-clip") metrics.faceClipCues += 1;
          if (command.name === "face-gaze") metrics.faceGazeCues += 1;
          if (command.name === "voice") metrics.voiceFaceCues += 1;
          return true;
        },
      })
    : null;
  const hands = definition.presentation?.handAssets
    ? simpleAdapter(["prepare", "begin", "play", "apply", "end"], {
        play(_owner, command) {
          if (command.name === "hand-pose") metrics.handPoseCues += 1;
          if (command.name === "body-hand-pose") metrics.bodyHandPoseCues += 1;
          return true;
        },
      })
    : null;
  const nodeMotion = definition.presentation?.nodeMotion
    ? simpleAdapter(["prepare", "begin", "apply", "end"], {
        apply() {
          metrics.nodeMotionFrames += 1;
          return true;
        },
      })
    : null;
  const actorLookPoints = simpleAdapter(["begin", "play", "end"], {
    play() {
      metrics.actorLookPointCues += 1;
      return true;
    },
  });
  return new NativeAseqPresentationRuntime({
    actors,
    camera,
    audio,
    faces,
    hands,
    nodeMotion,
    actorLookPoints,
  });
}

function sumRecordCount(records, field) {
  return records.reduce((sum, record) => sum + (record.commandCounts?.[field] || 0), 0);
}

function sumRecordCues(records, field) {
  return records.reduce((sum, record) => sum + (record[field]?.length || 0), 0);
}

function environmentCoverage(definition) {
  const count = value => Object.keys(value || {}).length;
  return Object.freeze({
    sceneObjectCount: count(definition.environment?.sceneObjects),
    packageActorCount: count(definition.environment?.packageActors),
    attachedObjectCount: count(definition.environment?.attachedObjects),
    mapLayerCount: count(definition.environment?.mapLayers),
    scrollSpriteCount: count(definition.environment?.scrollSprites),
  });
}

function audioManifestsForDefinition(definition) {
  return [
    definition.playback.audioManifest,
    ...Object.values(definition.playback.audioManifests || {}).map(
      entry => entry?.manifest || entry,
    ),
  ].filter(Boolean);
}

function fidelityFindings(definition, records, metrics, musicTrackCount) {
  const findings = [];
  const faceActors = new Set(Object.keys(definition.presentation?.facialAssets || {}));
  const faceAliases = definition.presentation?.facialActorAliases || {};
  const handActors = new Set(Object.keys(definition.presentation?.handAssets || {}));
  const faceCueActors = new Set(records.flatMap(record => [
    ...(record.nativeFaceClipCues || []),
    ...(record.nativeFaceGazeCues || []),
  ]).map(cue => cue.actorTag));
  const handCueActors = new Set(records.flatMap(record => [
    ...(record.nativeHandPoseCues || []),
    ...(record.nativeBodyHandPoseCues || []),
  ]).map(cue => cue.actorTag));
  const missingFaces = [...faceCueActors].filter(actor => !faceActors.has(actor));
  const missingHands = [...handCueActors].filter(actor => !handActors.has(actor));
  if (missingFaces.length > 0) findings.push({
    kind: "authored-face-cues-without-exact-face-asset",
    severity: "known-gap",
    actorTags: missingFaces,
  });
  if (missingHands.length > 0) findings.push({
    kind: "authored-hand-cues-without-exact-hand-asset",
    severity: "known-gap",
    actorTags: missingHands,
  });
  const voicedActorsWithoutFaces = [...new Set(metrics.voiceSpeakerIds
    .filter(Boolean)
    .map(actorTag => faceAliases[actorTag] || actorTag)
    .filter(actorTag => !faceActors.has(actorTag)))];
  if (voicedActorsWithoutFaces.length > 0) findings.push({
    kind: "voiced-actor-without-detailed-face-presentation",
    severity: "review",
    actorTags: voicedActorsWithoutFaces,
  });
  const audioManifests = audioManifestsForDefinition(definition);
  const selectedSilentVoiceIds = new Set(metrics.silentVoiceIds.filter(Boolean));
  const unavailableVoices = [...new Map(audioManifests.flatMap(manifest => (
    (manifest.voices || []).filter(voice => voice.unavailable).map(voice => [
      voice.voiceId,
      {
        voiceId: voice.voiceId,
        reason: voice.unavailableReason || voice.resolution || "absent from pinned source",
        evidence: voice.evidence || null,
      },
    ])
  ))).values()].filter(voice => selectedSilentVoiceIds.has(voice.voiceId));
  if (unavailableVoices.length > 0) findings.push({
    kind: "native-reference-has-no-retail-voice-member",
    severity: "source-absence",
    voices: unavailableVoices,
  });
  if (metrics.voices === 0) findings.push({
    kind: "no-authored-voice-cues",
    severity: "informational",
  });
  if (metrics.sounds === 0) findings.push({
    kind: "no-authored-sound-cues",
    severity: "informational",
  });
  if (musicTrackCount === 0) {
    const authoredSilence = definition.music?.authoredSilence;
    findings.push(authoredSilence?.classification
      === "native-owner-silent-during-activity"
      ? {
          kind: "native-owner-authors-no-cutscene-music",
          severity: "informational",
          resource: authoredSilence.resource,
          evidence: authoredSilence.evidence,
        }
      : {
          kind: "no-explicit-package-music-binding",
          severity: "review",
        });
  }
  return findings;
}

function activitySelection(record) {
  return {
    slot: record.slot,
    binding: record.binding?.kind === "map-embedded-slot"
      ? { kind: "map-embedded-slot", activityId: record.activityId }
      : {
          primaryPointer: record.primaryPointer,
          secondaryPointer: record.secondaryPointer,
        },
  };
}

function selectedActivities(program, manifest) {
  const records = [];
  const previewDetails = program.preview?.activities
    || (program.preview?.activity ? [program.preview.activity] : []);
  for (const detail of previewDetails) {
    const record = activityForPreviewDetail(detail, manifest);
    if (!record) throw new Error("preview activity is absent from its package manifest");
    records.push(record);
  }
  for (const binding of program.operation013eStaticBindings || []) {
    const record = manifest.activities.find(activity => (
      activity.slot === binding.slot
      && activity.primaryPointer === binding.primaryPointer
      && activity.secondaryPointer === binding.secondaryPointer
    ));
    if (!record) throw new Error(`slot ${binding.slot} binding is absent from its package`);
    records.push(record);
  }
  for (const owner of program.authResourceSelection?.ownerCalls || []) {
    const record = manifest.activities.find(activity => (
      activity.slot === owner.slot
      && activity.binding?.kind === "map-embedded-slot"
      && activity.sha256 === owner.resource?.sha256
    ));
    if (!record) throw new Error(`embedded slot ${owner.slot} is absent from its package`);
    records.push(record);
  }
  // OP02's owner installs its embedded AUTH records through the native owner
  // rather than operation 0x013e. Its package manifest is the exact owner set.
  if (records.length === 0 && program.id === "S1-OP02-00") {
    records.push(...manifest.activities);
  }
  return [...new Map(records.map(record => [record.activityId, record])).values()];
}

function activityForPreviewDetail(detail, manifest) {
  return manifest.activities.find(activity => (
    activity.slot === detail.slot
    && (detail.binding?.kind === "map-embedded-slot"
      ? activity.activityId === detail.binding.activityId
      : activity.primaryPointer === detail.binding?.primaryPointer
        && activity.secondaryPointer === detail.binding?.secondaryPointer)
  ));
}

function playbackActivityOccurrences(program, manifest, uniqueRecords) {
  const details = program.preview?.activities
    || (program.preview?.activity ? [program.preview.activity] : null);
  if (!details) return uniqueRecords;
  return details.map((detail) => {
    const record = activityForPreviewDetail(detail, manifest);
    if (!record) throw new Error("preview playback activity is absent from its package manifest");
    return record;
  });
}

function validatePackageAssets(definition) {
  const bundled = new Set(Object.keys(definition.assets));
  if (bundled.size === 0) throw new Error("package has no bundled assets");
  for (const [sourcePath, url] of Object.entries(definition.assets)) {
    if (sourcePath.startsWith("play/") || sourcePath.startsWith("public/")) {
      requireFile(sourcePath, "bundled asset");
    }
    const resolved = sourcePathForUrl(url);
    if (resolved && sourcePath.startsWith("play/") && resolved !== sourcePath) {
      throw new Error(`bundled asset URL ${url} resolves to ${resolved}, not ${sourcePath}`);
    }
  }
  for (const output of definition.playback.manifest.outputs || []) {
    requireFile(localAssetPath(output.path), "manifest output");
    if (!bundled.has(output.path)) {
      throw new Error(`manifest output ${output.path} is not bundled`);
    }
  }
  const packageLoadedMetadata = {
    sceneObjects: definition.environment?.sceneObjects,
    packageActors: definition.environment?.packageActors,
    attachedObjects: definition.environment?.attachedObjects,
    scrollSprites: definition.environment?.scrollSprites,
    presentation: definition.presentation,
  };
  for (const sourcePath of recursiveAssetPaths(packageLoadedMetadata)) {
    requireFile(sourcePath, "package metadata asset");
    if (sourcePath.startsWith("play/") && !bundled.has(sourcePath)) {
      throw new Error(`package metadata asset ${sourcePath} is not bundled`);
    }
  }
  // Map-layer records resolve already-loaded world geometry by native name.
  // Their asset paths are provenance and rebuild inputs, not package fetches.
  for (const sourcePath of recursiveAssetPaths(definition.environment?.mapLayers)) {
    requireFile(sourcePath, "map-layer source asset");
  }
  for (const manifest of audioManifestsForDefinition(definition)) {
    for (const voice of manifest.voices || []) {
      if (!voice.unavailable) requireFile(voice.asset, "voice asset");
    }
    for (const sound of manifest.sounds || []) {
      const assets = sound.assets?.map(value => value.asset) || [sound.asset];
      for (const asset of assets) requireFile(asset, "sound asset");
    }
  }
  return bundled.size;
}

function validateProgram(program, cutscene) {
  if (!program) throw new Error(`native program ${cutscene.program.programId} is absent`);
  const reviewed = new Set([program.entryFunction, ...(program.directEntries || [])]);
  if (!reviewed.has(cutscene.program.entryFunction)) {
    throw new Error(`entry ${cutscene.program.entryFunction} is not reviewed`);
  }
  const actions = program.functions.flatMap(fn => fn.blocks.flatMap(block => block.actions));
  const unsupported = actions.filter(action => (
    action.adapterStatus === "unresolved"
    || action.behaviorStatus === "unresolved"
    || (action.arguments || []).some(argument => argument.kind === "unresolved")
  ));
  if (unsupported.length > 0) {
    const first = unsupported[0];
    throw new Error(
      `program has ${unsupported.length} unresolved actions; first ${first.operationHex || first.kind}`,
    );
  }
  return actions.length;
}

async function playActivity(runtime, record) {
  const started = await runtime.startActivity(activitySelection(record));
  for (let frame = 1; frame <= started.durationFrames; frame += 1) {
    if (runtime.updateActivity({
      activityId: started.activityId,
      slot: started.slot,
      previousFrame: frame - 1,
      currentFrame: frame,
      durationFrames: started.durationFrames,
    }) !== true) throw new Error(`activity rejected frame ${frame}`);
  }
  if (runtime.stopActivity({ reason: "complete", activity: started }) !== true) {
    throw new Error("activity cleanup was rejected");
  }
  if (runtime.active) throw new Error("activity remained active after cleanup");
  return started;
}

async function playPreviewProgram(program, runtime) {
  const sceneState = createNativeSceneGameplayState();
  for (const binding of runtime.embeddedBindings?.() || []) {
    sceneState.installNativeEmbeddedAuthBinding(binding);
  }
  sceneState.prepareNativeOperation013eBindings(program);
  const context = createNativeSceneFieldRuntimeContext(sceneState);
  const executeOperation = createNativeEventOperationExecutor({
    handlers: {
      ...createNativeOperation013eSemanticHandlers(),
      ...createNativeOperation0050SemanticHandlers({
        startActivity: detail => runtime.startActivity(detail),
        stopActivity: detail => runtime.stopActivity(detail),
      }),
    },
  });
  const interpreter = createNativeEventInterpreter({
    program,
    executeOperation,
    executeRuntimeInterface: createNativeRuntimeInterfaceExecutor(),
  });
  let result = await interpreter.run(null, context);
  let ticks = 0;
  while (result.status === "yielded") {
    const update = sceneState.advanceNativeOperation0050Activity();
    if (update && runtime.updateActivity(update) !== true) {
      throw new Error(`preview rejected activity frame ${update.currentFrame}`);
    }
    result = await interpreter.run(result.state, context);
    ticks += 1;
    if (ticks > 200000) throw new Error("preview program exceeded smoke tick budget");
  }
  if (result.status !== "completed") {
    throw new Error(
      `preview program exited with ${result.status}: ${JSON.stringify(result.reason || null)}`,
    );
  }
  if (runtime.active || sceneState.readNativeOperation0050Activity()) {
    throw new Error("preview program leaked activity ownership");
  }
  return ticks;
}

function validateMusic(definition, musicManifest) {
  const commands = definition.playback.ownerAudioCommands || [];
  const cues = definition.music?.cues || [];
  const trackIds = new Set([
    ...commands.filter(command => command.kind === "music").map(command => command.trackId),
    ...cues.map(cue => cue.trackId),
  ]);
  for (const trackId of trackIds) {
    const track = musicManifest.tracks[trackId];
    if (!track) throw new Error(`music track ${trackId} is not catalogued`);
    const localPath = sourcePathForUrl(track.url) || `public/music/${trackId}.ogg`;
    requireFile(localPath, `music track ${trackId}`);
    if (track.sha256 && sha256(localPath) !== track.sha256) {
      throw new Error(`music track ${trackId} does not match its catalog hash`);
    }
  }
  return trackIds.size;
}

async function auditScene({ cutscene, definition, program, musicManifest }) {
  const stages = [];
  let currentStage = "package-assets";
  const metrics = {
    actorTags: [], transforms: 0, motions: 0, cameraFrames: 0,
    voices: 0, sounds: 0,
    faceClipCues: 0, faceGazeCues: 0, voiceFaceCues: 0,
    handPoseCues: 0, bodyHandPoseCues: 0, nodeMotionFrames: 0,
    actorLookPointCues: 0,
    voiceIds: [], voiceSpeakerIds: [], silentVoiceIds: [],
  };
  try {
    const bundledAssetCount = validatePackageAssets(definition);
    stages.push("package-assets");
    currentStage = "program-structure";
    const programActionCount = validateProgram(program, cutscene);
    stages.push("program-structure");
    currentStage = "music-bindings";
    const musicTrackCount = validateMusic(definition, musicManifest);
    stages.push("music-bindings");
    currentStage = "activity-preparation";
    const records = selectedActivities(program, definition.playback.manifest);
    if (records.length === 0) throw new Error("program selects no packaged activity");
    const playbackRecords = playbackActivityOccurrences(
      program,
      definition.playback.manifest,
      records,
    );
    const presentation = createAuditPresentation(definition, metrics);
    const runtime = new NativeAseqActivityRuntime({
      manifest: definition.playback.manifest,
      audioManifest: definition.playback.audioManifest,
      audioManifests: definition.playback.audioManifests,
      loadAsset: async sourcePath => readFileSync(requireFile(
        localAssetPath(sourcePath),
        "activity asset",
      )),
      presentation,
    });
    let playbackTicks = 0;
    if (program.preview) {
      currentStage = "preview-program-playback";
      playbackTicks = await playPreviewProgram(program, runtime);
      stages.push("preview-program-playback");
    } else {
      currentStage = "owner-activity-playback";
      for (const record of records) {
        const started = await playActivity(runtime, record);
        playbackTicks += started.durationFrames;
      }
      stages.push("owner-activity-playback");
    }
    const expectedVoiceCues = sumRecordCount(playbackRecords, "voice");
    const expectedSoundCues = sumRecordCount(playbackRecords, "sound");
    const expectedFaceClipCues = sumRecordCues(playbackRecords, "nativeFaceClipCues");
    const expectedFaceGazeCues = sumRecordCues(playbackRecords, "nativeFaceGazeCues");
    const expectedHandPoseCues = sumRecordCues(playbackRecords, "nativeHandPoseCues");
    const expectedBodyHandPoseCues = sumRecordCues(playbackRecords, "nativeBodyHandPoseCues");
    const expectedActorLookPointCues = sumRecordCues(
      playbackRecords,
      "nativeActorLookPointCues",
    );
    for (const [label, expected, actual] of [
      ["voice", expectedVoiceCues, metrics.voices],
      ["sound", expectedSoundCues, metrics.sounds],
      ["FACE clip", expectedFaceClipCues, metrics.faceClipCues],
      ["FACE gaze", expectedFaceGazeCues, metrics.faceGazeCues],
      ["HAND pose", expectedHandPoseCues, metrics.handPoseCues],
      ["body HAND pose", expectedBodyHandPoseCues, metrics.bodyHandPoseCues],
      ["actor look-point", expectedActorLookPointCues, metrics.actorLookPointCues],
    ]) {
      if (expected > 0 && actual !== expected) {
        throw new Error(`${label} playback covered ${actual}/${expected} authored cues`);
      }
    }
    return {
      cutsceneId: cutscene.id,
      label: cutscene.label,
      packageId: definition.id,
      programId: program.id,
      programKind: program.preview ? "activity-preview" : "native-owner",
      status: "passed",
      stages,
      fidelityFindings: fidelityFindings(definition, records, metrics, musicTrackCount),
      coverage: {
        bundledAssetCount,
        programActionCount,
        activityCount: records.length,
        playbackActivityCount: playbackRecords.length,
        durationFrames: records.reduce((sum, record) => sum + record.durationFrames, 0),
        playbackTicks,
        actorCount: new Set(metrics.actorTags).size,
        motionApplications: metrics.motions,
        transformApplications: metrics.transforms,
        cameraFrames: metrics.cameraFrames,
        voiceCues: metrics.voices,
        soundCues: metrics.sounds,
        authoredVoiceCues: expectedVoiceCues,
        authoredSoundCues: expectedSoundCues,
        silentVoiceCueCount: metrics.silentVoiceIds.length,
        musicTrackCount,
        faceClipCues: metrics.faceClipCues,
        faceGazeCues: metrics.faceGazeCues,
        voiceFaceCues: metrics.voiceFaceCues,
        handPoseCues: metrics.handPoseCues,
        bodyHandPoseCues: metrics.bodyHandPoseCues,
        nodeMotionFrames: metrics.nodeMotionFrames,
        actorLookPointCues: metrics.actorLookPointCues,
        facialAssetActorCount: Object.keys(definition.presentation?.facialAssets || {}).length,
        handAssetActorCount: Object.keys(definition.presentation?.handAssets || {}).length,
        ...environmentCoverage(definition),
      },
    };
  } catch (error) {
    return {
      cutsceneId: cutscene.id,
      label: cutscene.label,
      packageId: definition?.id || cutscene.packageId,
      programId: program?.id || cutscene.program?.programId,
      programKind: program?.preview ? "activity-preview" : "native-owner",
      status: "failed",
      stages,
      failure: {
        stage: currentStage,
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export async function buildSelectableCutsceneSmokeReport() {
  const vite = await createServer({
    root: ROOT,
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "error",
  });
  try {
    const [{ CUTSCENES }, { NATIVE_CUTSCENE_PACKAGES }] = await Promise.all([
      vite.ssrLoadModule("/play/config/cutscenes.js"),
      vite.ssrLoadModule("/play/cutscenes/nativeCutscenePackages.js"),
    ]);
    const registry = new NativeCutscenePackageRegistry(NATIVE_CUTSCENE_PACKAGES);
    const pack = json(PROGRAM_PACK_PATH);
    const programById = new Map(pack.programs.map(program => [program.id, program]));
    const musicManifest = json(MUSIC_MANIFEST_PATH);
    const scenes = [];
    for (const cutscene of CUTSCENES) {
      let definition;
      try {
        definition = registry.requireForCutscene(cutscene);
      } catch (error) {
        scenes.push({
          cutsceneId: cutscene.id,
          label: cutscene.label,
          packageId: cutscene.packageId,
          programId: cutscene.program?.programId,
          status: "failed",
          stages: [],
          failure: { stage: "package-binding", message: error.message },
        });
        continue;
      }
      scenes.push(await auditScene({
        cutscene,
        definition,
        program: programById.get(cutscene.program.programId),
        musicManifest,
      }));
    }
    const failed = scenes.filter(scene => scene.status === "failed");
    const fidelityFindings = scenes.flatMap(scene => scene.fidelityFindings || []);
    return {
      schema: "new-yokosuka-selectable-cutscene-smoke-v1",
      generatedBy: "tools/cutscenes/audit_selectable_cutscene_smoke.mjs",
      generatedFrom: {
        cutscenes: "play/config/cutscenes.js",
        packages: "play/cutscenes/nativeCutscenePackages.js",
        programPack: { path: PROGRAM_PACK_PATH, sha256: sha256(PROGRAM_PACK_PATH) },
      },
      evidenceBoundary: [
        "Every selectable package is loaded through Vite's real module graph, so bundled URL maps and manifest objects match the game client.",
        "Every selected AUTH is hash-verified, parsed, motion-resolved, audio-resolved, advanced through its final frame, and cleanup-checked through the shared activity/presentation runtimes.",
        "Activity-preview programs execute through the canonical event interpreter. Larger native owners are structurally checked and all activities they select are playback-smoked; their complete world-dependent owner paths remain browser integration coverage.",
        "Zero voice, sound, or music coverage is reported as a fidelity review item only when the native package contains no authored binding; it is not guessed into a failure.",
        "Retail-native voice references proven absent from their pinned AFS/IDX source are reported as source absences rather than fabricated assets.",
        "World geometry visibility and final rendered appearance require a browser scene and are outside this headless audit.",
      ],
      summary: {
        selectableCutsceneCount: scenes.length,
        passedCount: scenes.length - failed.length,
        failedCount: failed.length,
        previewProgramCount: scenes.filter(scene => scene.programKind === "activity-preview").length,
        ownerProgramCount: scenes.filter(scene => scene.programKind === "native-owner").length,
        fidelityFindingCount: fidelityFindings.length,
        knownGapCount: fidelityFindings.filter(finding => finding.severity === "known-gap").length,
        reviewFindingCount: fidelityFindings.filter(finding => finding.severity === "review").length,
        sourceAbsenceCount: fidelityFindings.filter(
          finding => finding.severity === "source-absence",
        ).length,
      },
      failureClusters: Object.entries(failed.reduce((counts, scene) => {
        const key = `${scene.failure.stage}: ${scene.failure.message}`;
        counts[key] = (counts[key] || 0) + 1;
        return counts;
      }, {})).map(([failure, sceneCount]) => ({ failure, sceneCount })),
      fidelityFindingClusters: Object.entries(scenes.reduce((counts, scene) => {
        for (const finding of scene.fidelityFindings || []) {
          const key = `${finding.severity}: ${finding.kind}`;
          counts[key] = (counts[key] || 0) + 1;
        }
        return counts;
      }, {})).map(([finding, sceneCount]) => ({ finding, sceneCount })),
      scenes,
    };
  } finally {
    await vite.close();
  }
}

async function main() {
  const outputArgument = process.argv.indexOf("--out");
  const output = outputArgument >= 0 ? process.argv[outputArgument + 1] : DEFAULT_OUTPUT;
  if (!output) throw new Error("--out requires a path");
  const report = await buildSelectableCutsceneSmokeReport();
  const outputPath = path.resolve(ROOT, output);
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `Wrote ${path.relative(ROOT, outputPath)}: `
    + `${report.summary.passedCount}/${report.summary.selectableCutsceneCount} passed`,
  );
  if (report.summary.failedCount > 0) process.exitCode = 1;
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  await main();
}
