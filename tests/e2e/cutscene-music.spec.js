import { test } from "@playwright/test";
import { availableCutscene } from "../../play/config/cutscenes.js";
import { runCutscenePreview } from "./cutscene-preview-flow.js";

test("opening vision music continues between shots and stops on cancel", async ({ page }, testInfo) => {
  test.setTimeout(210_000);
  await runCutscenePreview({
    page,
    cutscene: availableCutscene("S1-OP02-00"),
    expectedMusicTrack: "bgm019",
    sampleOnly: true,
    completionTimeout: 15_000,
    testInfo,
  });
});

test("kitten music continues between shots and stops on cancel", async ({ page }, testInfo) => {
  test.setTimeout(210_000);
  await runCutscenePreview({
    page,
    cutscene: availableCutscene("S1-CATA1-01"),
    expectedMusicTrack: "bgm051",
    sampleOnly: true,
    completionTimeout: 15_000,
    testInfo,
  });
});
