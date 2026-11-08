#!/usr/bin/env node
// All packages, including Story-only scenes. This is wiring coverage, not a
// visual certificate: a body can also have a simpler native mouth controller.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { resolveNativeCutsceneFacialAssets } from "../../play/cutscenes/NativeCutsceneFacialAssets.js";
import { NullEngine, Scene } from "@babylonjs/core";
import { loadNativeCharacterModel } from "../../play/characters/NativeCharacterModelLoader.js";
import { resolveGenericFaceMorph } from "../../src/GenericFaceMorph.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export function classifyVoiceCoverage(voices, actors) {
  // Missing source recordings cannot drive speech or lip motion; retain
  // them as a separate source-coverage gap rather than a false lip error.
  return {
    unavailableVoices: voices.filter(voice => voice.unavailable)
      .map(voice => ({ voice: voice.voiceId, speaker: voice.speakerId,
        sourcePath: voice.sourcePath, reason: voice.unavailableReason, resolution: voice.resolution })),
    voicesWithoutLipCues: voices.filter(voice => !voice.unavailable && actors.has(voice.speakerId) && !voice.lipSync)
      .map(voice => ({ voice: voice.voiceId, speaker: voice.speakerId })),
  };
}

// AUTH objects may borrow scenery or instantiate a packaged model. Only the
// latter has files to check; reference-only entries deliberately draw nothing.
// Attached scene objects must name a real scene object, or loading will fail.
export function auditSceneObjectCoverage(pkg, fileExists) {
  const environment = pkg.environment || {};
  const objects = environment.sceneObjects || {};
  const problems = [];
  for (const [tag, object] of Object.entries(objects)) {
    if (object.referenceOnly) continue;
    for (const file of [object.assetPath, object.textureAssetPath].filter(Boolean)) {
      if (!pkg.assets?.[file]) problems.push({ actor: tag, path: file, kind: "not-bundled" });
      if (!fileExists(file)) problems.push({ actor: tag, path: file, kind: "not-restored-locally" });
    }
  }
  for (const [tag, attachment] of Object.entries(environment.attachedObjects || {})) {
    if (attachment.sceneObject && (!objects[tag] || objects[tag].referenceOnly)) {
      problems.push({ actor: tag, kind: "missing-scene-object" });
    }
    if (!attachment.sceneObject) for (const file of [attachment.assetPath, attachment.textureAssetPath].filter(Boolean)) {
      if (!pkg.assets?.[file]) problems.push({ actor: tag, path: file, kind: "not-bundled" });
      if (!fileExists(file)) problems.push({ actor: tag, path: file, kind: "not-restored-locally" });
    }
  }
  return problems;
}

async function main() {
const runtimeAssets = JSON.parse(readFileSync(path.join(root, "src/runtime-assets.generated.json"))).assets;
const args = process.argv.slice(2);
const inspectModels = args.includes("--models");
if (inspectModels) args.splice(args.indexOf("--models"), 1);
if (args.length && (args.length !== 2 || args[0] !== "--output")) {
  throw new Error("Usage: audit_cutscene_presentation.mjs [--models] [--output file]");
}
const output = path.resolve(root, args[1] || "tests/reports/cutscene-presentation.json");
const vite = await createServer({ root, server: { middlewareMode: true, watch: null }, appType: "custom", logLevel: "error" });
const engine = inspectModels ? new NullEngine() : null;
const modelBindings = new Map();
async function inspectBody(pkg, tag) {
  const actor = pkg.environment?.packageActors?.[tag]
    || pkg.actorDefinitions?.find(actor => actor.actorCode === tag);
  // Same registered body path convention as ScheduledActorRuntime. Package
  // archive assets take precedence; missing/unknown data remains explicit.
  const source = actor?.assetPath || (actor?.modelCode
    ? `play/assets/${actor.characterAssetDirectory || "characters"}/${actor.modelCode}.CHRM` : null);
  if (!source || !existsSync(path.join(root, source))) return { source, status: "body-unavailable" };
  if (modelBindings.has(source)) return modelBindings.get(source);
  const scene = new Scene(engine);
  try {
    const bytes = readFileSync(path.join(root, source));
    const model = await loadNativeCharacterModel({
      scene, sourceFilename: source, assetFormat: actor.assetFormat || "MT5",
      modelBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    });
    const binding = resolveGenericFaceMorph(model);
    const result = { source, status: binding ? "authored-two-target-mouth" : "no-structural-mouth-binding" };
    modelBindings.set(source, result);
    return result;
  } finally {
    scene.dispose();
  }
}
try {
  const { NATIVE_CUTSCENE_PACKAGES } = await vite.ssrLoadModule("/play/cutscenes/nativeCutscenePackages.js");
  const packages = NATIVE_CUTSCENE_PACKAGES.map(pkg => {
    const faces = resolveNativeCutsceneFacialAssets(pkg.presentation?.facialAssets, pkg.presentation?.facialActorAliases);
    const audio = [pkg.playback?.audioManifest, ...(pkg.playback?.audioManifests || []).map(value => value.manifest)].filter(Boolean);
    const voices = audio.flatMap(manifest => manifest.voices || []);
    const audioPaths = [...new Set(audio.flatMap(manifest => [...(manifest.voices || []), ...(manifest.sounds || [])])
      .filter(record => !record.unavailable)
      .flatMap(record => [record.asset, ...(record.assets || []).map(asset => asset.asset)]).filter(Boolean))];
    // Subtitle/lip metadata can exist while the actual recordings are absent.
    // Unregistered ignored files also disappear from clean hosted builds.
    const missingAudioAssets = audioPaths.flatMap(file => [
      ...(!runtimeAssets[file] ? [{ path: file, kind: "not-registered" }] : []),
      ...(!existsSync(path.join(root, file)) ? [{ path: file, kind: "not-restored-locally" }] : []),
    ]);
    const speakers = [...new Set(voices.map(voice => voice.speakerId).filter(Boolean))];
    const actors = new Set(pkg.actorTags);
    const onStageSpeakers = speakers.filter(tag => actors.has(tag));
    const missingFaceAssets = [];
    const missingHandAssets = [];
    for (const [tag, hand] of Object.entries(pkg.presentation?.handAssets || {})) {
      if (hand.mode === "body-only") continue;
      for (const record of [hand.left?.model, hand.right?.model, hand.rig, ...(hand.texturePack ? [hand.texturePack] : [])]) {
        if (!record?.path || !pkg.assets[record.path]) missingHandAssets.push({actor:tag,path:record?.path,kind:"not-bundled"});
        else if (!existsSync(path.join(root,record.path))) missingHandAssets.push({actor:tag,path:record.path,kind:"not-restored-locally"});
      }
    }
    for (const [tag, face] of Object.entries(faces)) for (const record of [face.model, face.table, face.poses]) {
      if (!record?.path || !pkg.assets[record.path]) missingFaceAssets.push({ actor: tag, path: record?.path, kind: "not-bundled" });
      else if (!existsSync(path.join(root, record.path))) missingFaceAssets.push({ actor: tag, path: record.path, kind: "not-restored-locally" });
    }
    return {
      id: pkg.id,
      manifestGenerator: pkg.playback?.manifest?.generatedBy,
      actors: [...actors], onStageSpeakers,
      // Remote telephone voices and disembodied narration must not cause an
      // invisible actor to be instantiated just to satisfy a face audit.
      offStageSpeakers: speakers.filter(tag => !actors.has(tag)),
      detailedFaces: Object.keys(faces).filter(tag => actors.has(tag)),
      speakersWithoutDetailedFace: onStageSpeakers.filter(tag => !faces[tag]),
      ...classifyVoiceCoverage(voices, actors),
      missingFaceAssets,
      missingHandAssets,
      sceneObjectProblems: auditSceneObjectCoverage(pkg, file => existsSync(path.join(root, file))),
      missingAudioAssets,
      referenceOnlyObjects: Object.entries(pkg.environment?.sceneObjects || {}).filter(([, object]) => object.referenceOnly).map(([tag]) => tag),
      attachedObjects: Object.keys(pkg.environment?.attachedObjects || {}),
      detailedHands: Object.entries(pkg.presentation?.handAssets || {}).filter(([, hand]) => hand.mode !== "body-only").map(([tag]) => tag),
      renderedVerification: "not-performed-by-this-audit",
    };
  });
  const summary = {
    packages: packages.length,
    packagesWithSpeakersWithoutDetailedFace: packages.filter(pkg => pkg.speakersWithoutDetailedFace.length).length,
    speakerOccurrencesWithoutDetailedFace: packages.reduce((n, pkg) => n + pkg.speakersWithoutDetailedFace.length, 0),
    missingFaceAssets: packages.reduce((n, pkg) => n + pkg.missingFaceAssets.length, 0),
    missingHandAssets: packages.reduce((n, pkg) => n + pkg.missingHandAssets.length, 0),
    audioAssetProblems: packages.reduce((n, pkg) => n + pkg.missingAudioAssets.length, 0),
    sceneObjectProblems: packages.reduce((n, pkg) => n + pkg.sceneObjectProblems.length, 0),
    unavailableVoiceCues: packages.reduce((n, pkg) => n + pkg.unavailableVoices.length, 0),
    playableVoicesWithoutLipCues: packages.reduce((n, pkg) => n + pkg.voicesWithoutLipCues.length, 0),
    referenceOnlyObjects: packages.reduce((n, pkg) => n + pkg.referenceOnlyObjects.length, 0),
  };
  if (inspectModels) {
    // Serial, cached by exact source path: never load the whole cast into one
    // scene or keep GPU rigs alive after their structural inspection.
    for (const [index, pkg] of packages.entries()) {
      pkg.genericMouths = {};
      for (const tag of pkg.speakersWithoutDetailedFace) {
        pkg.genericMouths[tag] = await inspectBody(NATIVE_CUTSCENE_PACKAGES[index], tag);
      }
      pkg.speakersWithoutMouthBinding = pkg.speakersWithoutDetailedFace.filter(tag =>
        pkg.genericMouths[tag].status !== "authored-two-target-mouth");
    }
    summary.genericMouthOccurrences = packages.reduce((n, pkg) => n
      + Object.values(pkg.genericMouths).filter(mouth => mouth.status === "authored-two-target-mouth").length, 0);
    summary.speakerOccurrencesWithoutMouthBinding = packages.reduce((n, pkg) => n + pkg.speakersWithoutMouthBinding.length, 0);
  }
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify({ schema: "cutscene-presentation-audit-v1", summary, packages }, null, 2) + "\n");
  console.log(JSON.stringify(summary));
  console.log(`Wrote ${output}`);
} finally {
  engine?.dispose();
  await vite.close();
}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
