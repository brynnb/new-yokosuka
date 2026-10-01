import { test } from "@playwright/test";
import { CUTSCENES } from "../../play/config/cutscenes.js";
import { runCutscenePreview } from "./cutscene-preview-flow.js";
import { completionTimeoutForCutscene } from "./cutscene-preview-timeout.js";

const startId = process.env.NY_E2E_CUTSCENE_START_ID;
const startIndex = startId ? CUTSCENES.findIndex(cutscene => cutscene.id === startId) : 0;
if (startIndex < 0) throw new Error(`Unknown cutscene resume ID ${startId}`);

test.describe("every selectable cutscene", () => {
  test.describe.configure({ retries: 0 });
  for (const cutscene of CUTSCENES.slice(startIndex)) {
    test(`${cutscene.id} — ${cutscene.label}`, async ({ page }, testInfo) => {
      const completionTimeout = Number.parseInt(
        process.env.NY_E2E_CUTSCENE_TIMEOUT_MS
          || String(completionTimeoutForCutscene(cutscene.id)),
        10,
      );
      test.setTimeout(completionTimeout + 120_000);
      await runCutscenePreview({ page, cutscene, completionTimeout, testInfo });
    });
  }
});
