import { test } from "@playwright/test";
import { availableCutscene } from "../../play/config/cutscenes.js";
import { runCutscenePreview } from "./cutscene-preview-flow.js";
import { completionTimeoutForCutscene } from "./cutscene-preview-timeout.js";

const cutsceneId = process.env.NY_E2E_CUTSCENE_ID || "S1-TGMA-01";
const cutscene = availableCutscene(cutsceneId);
if (!cutscene) throw new Error(`Unknown cutscene ${cutsceneId}`);
const cutsceneLabel = cutscene.label;
const completionTimeout = Number.parseInt(
  process.env.NY_E2E_CUTSCENE_TIMEOUT_MS
    || String(completionTimeoutForCutscene(cutsceneId)),
  10,
);

test(`plays ${cutsceneLabel} through the real cutscene menu`, async ({ page }) => {
  test.setTimeout(completionTimeout + 120_000);
  await runCutscenePreview({ page, cutscene, completionTimeout });
});
