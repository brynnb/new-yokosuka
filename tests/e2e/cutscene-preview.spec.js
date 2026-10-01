import { test } from "@playwright/test";
import { availableCutscene } from "../../play/config/cutscenes.js";
import { runCutscenePreview } from "./cutscene-preview-flow.js";
import { completionTimeoutForCutscene } from "./cutscene-preview-timeout.js";

// Opt-in motion-review evidence; ordinary completion runs retain stills only.
if (process.env.NY_E2E_CUTSCENE_VIDEO === "1") {
  test.use({ video: { mode: "on", size: { width: 1280, height: 720 } } });
}

const cutsceneId = process.env.NY_E2E_CUTSCENE_ID || "S1-TGMA-01";
const cutscene = availableCutscene(cutsceneId);
if (!cutscene) throw new Error(`Unknown cutscene ${cutsceneId}`);
const cutsceneLabel = cutscene.label;
const completionTimeout = Number.parseInt(
  process.env.NY_E2E_CUTSCENE_TIMEOUT_MS
    || String(completionTimeoutForCutscene(cutsceneId)),
  10,
);

test(`plays ${cutsceneLabel} through the real cutscene menu`, async ({ page }, testInfo) => {
  test.setTimeout(completionTimeout + 120_000);
  await runCutscenePreview({
    page, cutscene, completionTimeout, testInfo,
    expectedMusicTrack: process.env.NY_E2E_CUTSCENE_MUSIC || null,
    verifyReplay: process.env.NY_E2E_CUTSCENE_REPLAY === "1",
  });
});
