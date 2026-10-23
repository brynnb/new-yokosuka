#!/usr/bin/env node
// All packages, including Story-only scenes. This is wiring coverage, not a
// visual certificate: a body can also have a simpler native mouth controller.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { resolveNativeCutsceneFacialAssets } from "../../play/cutscenes/NativeCutsceneFacialAssets.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--output")) {
  throw new Error("Usage: audit_cutscene_presentation.mjs [--output file]");
}
const output = path.resolve(root, args[1] || "tests/reports/cutscene-presentation.json");
const vite = await createServer({ root, server: { middlewareMode: true, watch: null }, appType: "custom", logLevel: "error" });
try {
  const { NATIVE_CUTSCENE_PACKAGES } = await vite.ssrLoadModule("/play/cutscenes/nativeCutscenePackages.js");
  const packages = NATIVE_CUTSCENE_PACKAGES.map(pkg => {
    const faces = resolveNativeCutsceneFacialAssets(pkg.presentation?.facialAssets, pkg.presentation?.facialActorAliases);
    const audio = [pkg.playback?.audioManifest, ...(pkg.playback?.audioManifests || []).map(value => value.manifest)].filter(Boolean);
    const voices = audio.flatMap(manifest => manifest.voices || []);
    const speakers = [...new Set(voices.map(voice => voice.speakerId).filter(Boolean))];
    const actors = new Set(pkg.actorTags);
    const onStageSpeakers = speakers.filter(tag => actors.has(tag));
    const missingFaceAssets = [];
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
      voicesWithoutLipCues: voices.filter(voice => actors.has(voice.speakerId) && !voice.lipSync)
        .map(voice => ({ voice: voice.voiceId, speaker: voice.speakerId })),
      missingFaceAssets,
      referenceOnlyObjects: Object.entries(pkg.environment?.sceneObjects || {}).filter(([, object]) => object.referenceOnly).map(([tag]) => tag),
      attachedObjects: Object.keys(pkg.environment?.attachedObjects || {}),
      detailedHands: Object.entries(pkg.presentation?.handAssets || {}).filter(([, hand]) => hand.mode !== "body-only").map(([tag]) => tag),
      renderedVerification: "not-performed-by-this-audit",
    };
  });
  const summary = {
    packages: packages.length,
    packagesWithUnboundSpeakers: packages.filter(pkg => pkg.speakersWithoutDetailedFace.length).length,
    unboundSpeakerOccurrences: packages.reduce((n, pkg) => n + pkg.speakersWithoutDetailedFace.length, 0),
    missingFaceAssets: packages.reduce((n, pkg) => n + pkg.missingFaceAssets.length, 0),
    referenceOnlyObjects: packages.reduce((n, pkg) => n + pkg.referenceOnlyObjects.length, 0),
  };
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify({ schema: "cutscene-presentation-audit-v1", summary, packages }, null, 2) + "\n");
  console.log(JSON.stringify(summary));
  console.log(`Wrote ${output}`);
} finally {
  await vite.close();
}
