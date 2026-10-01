import { expect, test } from "@playwright/test";
import { availableCutscene } from "../../play/config/cutscenes.js";
import { runCutscenePreview } from "./cutscene-preview-flow.js";
import { completionTimeoutForCutscene } from "./cutscene-preview-timeout.js";

test("TGMA deforms the exact FUB face during talking and expressions", async ({ page }, testInfo) => {
  const id = "S1-TGMA-01";
  const completionTimeout = completionTimeoutForCutscene(id);
  test.setTimeout(completionTimeout + 120_000);
  await runCutscenePreview({
    page, cutscene: availableCutscene(id), completionTimeout, testInfo, verifyReplay: true,
    inspectPlayback: async ({ page, report }) => {
      report.faceSamples = [];
      for (const frame of [180, 195, 220, 300, 440, 620]) {
        await page.waitForFunction(frame => window.__cutsceneBrowserProbe.activity.frame >= frame,
          frame, { timeout: completionTimeout });
        const face = await page.evaluate(() => window.__readCutsceneFaces()
          .find(face => face.actorTag === "FUKU"));
        expect(face.faceCode).toBe("FUB");
        expect(face.enabled).toBe(true);
        expect(face.vertices.length).toBeGreaterThan(0);
        report.faceSamples.push({ frame, ...face });
        await page.screenshot({ path: testInfo.outputPath(`fub-face-${frame}.png`) });
        if (frame === 300 || frame === 620) {
          await page.evaluate(() => window.__frameCutsceneSurface("face", "FUKU"));
          try {
            await page.waitForFunction(() => window.__cutsceneSurfaceFrames >= 2);
            await page.screenshot({ path: testInfo.outputPath(`diagnostic-fub-front-${frame}.png`) });
          } finally {
            await page.evaluate(() => window.__frameCutsceneSurface("restore"));
          }
        }
      }
      const distinct = key => new Set(report.faceSamples.map(sample => JSON.stringify(sample[key]))).size;
      expect(distinct("mouth")).toBeGreaterThan(1);
      expect(distinct("upper")).toBeGreaterThan(1);
      // Read real model-local output, excluding body-owned seam vertices:
      // head/body motion alone cannot satisfy this deformation assertion.
      expect(distinct("vertices")).toBeGreaterThan(1);
    },
  });
});
