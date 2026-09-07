import { expect, test } from "@playwright/test";
import { availableCutscene } from "../../play/config/cutscenes.js";
import { runCutscenePreview } from "./cutscene-preview-flow.js";

// A bounded real-renderer inventory: independent archive variant, multi-shot
// program, and a scene with known source-lifecycle gaps. This does not assert
// complete narrative or visual fidelity, and never creates a game account.
const sampleIds = ["S1-D0W0-01", "S1-OP02-00", "S1-CATA1-01"];

for (const id of sampleIds) {
  const cutscene = availableCutscene(id);
  test(`${id} launches, advances, and cancels in the real renderer`, async ({ page }, testInfo) => {
    test.setTimeout(210_000);
    const report = await runCutscenePreview({
      page,
      cutscene,
      completionTimeout: 15_000,
      sampleOnly: true,
      expectedMusicTrack: { "S1-OP02-00": "bgm019", "S1-CATA1-01": "bgm051" }[id],
      // Keep the launch inventory short; the dedicated music suite follows
      // long AUTH segments across a boundary with the same audio probes.
      verifyMusicAcrossActivities: false,
      testInfo,
    });
    if (id === "S1-D0W0-01") {
      const selected = report.probe.scheduledActorSelections.filter(actor => actor.actorCode === "YAMA");
      expect(selected).toHaveLength(1);
      expect(selected[0]).toMatchObject({
        modelCode: "YMG_L", defaultModel: "YMG_L", authoritative: true,
        activityOnly: false, loadedModels: ["YMG_L"], pendingModels: [],
      });
    }
  });
}
