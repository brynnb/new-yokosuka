import { expect, test } from "@playwright/test";
import { availableCutscene } from "../../play/config/cutscenes.js";
import { runCutscenePreview } from "./cutscene-preview-flow.js";
import { completionTimeoutForCutscene } from "./cutscene-preview-timeout.js";

test("Wang tracks the attached letter and releases the target", async ({ page }, testInfo) => {
  const id = "S1-DJHN-03";
  const completionTimeout = completionTimeoutForCutscene(id);
  test.setTimeout(completionTimeout + 120_000);
  await runCutscenePreview({ page, cutscene: availableCutscene(id), completionTimeout, testInfo, verifyReplay: true,
    inspectPlayback: async ({ page, report }) => {
      report.gazeSamples = [];
      for (const frame of [670, 700, 800, 975, 1030]) {
        await page.waitForFunction(frame => window.__cutsceneBrowserProbe.activity.frame >= frame,
          frame, { timeout: completionTimeout });
        const gaze = await page.evaluate(() => window.__readCutsceneLookPoints().find(value => value.actorTag === "YKHI"));
        if (frame > 675 && frame < 981) {
          expect(gaze.target.objectTag).toBe("MALS");
          expect(gaze.targetWorld).toHaveLength(3);
          expect(gaze.renderedHead).not.toEqual(gaze.baseHead);
        }
        if (frame > 981) expect(gaze.target).toBeNull();
        report.gazeSamples.push({ frame, gaze });
        await page.screenshot({ path: testInfo.outputPath(`wang-gaze-${frame}.png`),
          style: "#dialogue-overlay, #dialogue-controls-hud { visibility: hidden !important; }" });
      }
    },
  });
});
