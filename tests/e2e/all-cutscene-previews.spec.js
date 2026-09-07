import { test } from "@playwright/test";
import { CUTSCENES } from "../../play/config/cutscenes.js";
import { runCutscenePreview } from "./cutscene-preview-flow.js";
import { completionTimeoutForCutscene } from "./cutscene-preview-timeout.js";

test.describe("every selectable cutscene", () => {
  for (const cutscene of CUTSCENES) {
    test(`${cutscene.id} — ${cutscene.label}`, async ({ page }) => {
      const completionTimeout = Number.parseInt(
        process.env.NY_E2E_CUTSCENE_TIMEOUT_MS
          || String(completionTimeoutForCutscene(cutscene.id)),
        10,
      );
      test.setTimeout(completionTimeout + 120_000);
      await runCutscenePreview({ page, cutscene, completionTimeout });
    });
  }
});
