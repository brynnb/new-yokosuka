import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSelectableCutsceneSmokeReport,
  validatePackageAssets,
} from "../tools/cutscenes/audit_selectable_cutscene_smoke.mjs";

function packageWithSound(sound) {
  return {
    assets: {
      "play/events/NativeAseqAudioCatalog.js": "/play/events/NativeAseqAudioCatalog.js",
    },
    playback: {
      manifest: { outputs: [] },
      audioManifest: {
        schema: "new-yokosuka-aseq-audio-pack-v2",
        sounds: [{ commandHex: "a9042000", sourcePath: "cloths/RYODORO2.aiff", ...sound }],
      },
    },
  };
}

test("package audit accepts source-backed silent sound cues but rejects missing evidence", () => {
  const sound = {
    unavailable: true,
    unavailableReason: "Selected source bank does not contain the requested track",
    evidence: "tools/evidence/op00-opening-owner-ir.json",
  };
  assert.equal(validatePackageAssets(packageWithSound(sound)), 1);
  assert.throws(() => validatePackageAssets(packageWithSound({ ...sound, evidence: null })),
    /requires source evidence/);
  assert.throws(() => validatePackageAssets(packageWithSound({ ...sound, unavailableReason: null })),
    /requires source evidence/);
});

test("package audit still rejects missing normal sound assets and malformed empty asset lists", () => {
  const missing = "public/audio/world/op00-dream/audit-missing.wav";
  assert.throws(() => validatePackageAssets(packageWithSound({ asset: missing })),
    /sound asset .*audit-missing\.wav is unavailable/);
  assert.throws(() => validatePackageAssets(packageWithSound({ assets: [{ asset: missing }] })),
    /sound asset .*audit-missing\.wav is unavailable/);
  assert.throws(() => validatePackageAssets(packageWithSound({ assets: [] })),
    /AUTH sound asset is required/);
});

test("all selectable cutscenes pass package, program, activity, and cleanup smoke", async () => {
  const report = await buildSelectableCutsceneSmokeReport();
  assert.ok(report.summary.selectableCutsceneCount >= 50);
  assert.equal(
    report.summary.previewProgramCount + report.summary.ownerProgramCount,
    report.summary.selectableCutsceneCount,
  );
  assert.equal(report.summary.failedCount, 0, JSON.stringify(report.failureClusters));
  assert.equal(report.summary.knownGapCount, 0, JSON.stringify(report.fidelityFindingClusters));
  assert.equal(report.summary.passedCount, report.summary.selectableCutsceneCount);
  assert.ok(report.scenes.every(scene => (
    scene.status === "passed"
    && scene.coverage.activityCount > 0
    && scene.coverage.durationFrames > 0
    && scene.coverage.actorCount > 0
    && scene.coverage.cameraFrames > 0
    && scene.coverage.settlement === "completed"
    && scene.coverage.activityOrder.length === scene.coverage.playbackActivityCount
    && scene.coverage.playbackTicks >= scene.coverage.durationFrames
    && (
      scene.coverage.authoredVoiceCues === 0
      || scene.coverage.voiceCues === scene.coverage.authoredVoiceCues
    )
    && (
      scene.coverage.authoredSoundCues === 0
      || scene.coverage.soundCues === scene.coverage.authoredSoundCues
    )
    && scene.stages.at(-1).endsWith("playback")
  )));
  const opening = report.scenes.find(scene => scene.cutsceneId === "S1-OP02-00");
  for (const id of ["S1-OP02-00", "S1-000", "S1-OP00-MAIL", "S1-OP00-DREAM"]) {
    const scene = report.scenes.find(scene => scene.cutsceneId === id);
    assert.ok(scene.coverage.originalScriptStages?.length > 0, `${id} needs original-stage coverage`);
    assert.ok(scene.stages.includes("original-script-stage-coverage"));
  }
  assert.deepEqual(opening.coverage.dispatchedMusicTracks, ["bgm019"]);
  assert.deepEqual(opening.coverage.stoppedMusicTracks, ["bgm019"]);
  const nightmare = report.scenes.find(scene => scene.cutsceneId === "S1-BEBF-01");
  assert.deepEqual(nightmare.coverage.dispatchedMusicTracks, ["bgm129"]);
  assert.deepEqual(nightmare.coverage.stoppedMusicTracks, ["bgm129"]);
  assert.equal(nightmare.coverage.playbackActivityCount, 3);
  for (const [id, hiddenActors] of [
    ["S1-OP00-MAIL", ["AKIR"]],
    ["S1-OP00-DREAM", ["IWAO"]],
  ]) {
    assert.deepEqual(report.scenes.find(scene => scene.cutsceneId === id)
      .coverage.hiddenActorTags, hiddenActors);
  }
  // The old corpus assertion required EVSN's mistaken unconditional retry.
  // Repeated-binding compiler support is covered by its synthetic test; the
  // playable rescue route must reach its aftermath without repeating dialogue.
  for (const id of ["S1-EVSN-01", "S1-EVSN-02"]) {
    assert.equal(report.scenes.find(scene => scene.cutsceneId === id)
      .coverage.playbackActivityCount, 3);
  }
});
