import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSelectableCutsceneSmokeReport,
} from "../tools/cutscenes/audit_selectable_cutscene_smoke.mjs";

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
});
