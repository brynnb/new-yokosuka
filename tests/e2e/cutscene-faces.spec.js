import { expect, test } from "@playwright/test";
import { availableCutscene } from "../../play/config/cutscenes.js";
import { runCutscenePreview } from "./cutscene-preview-flow.js";
import { completionTimeoutForCutscene } from "./cutscene-preview-timeout.js";

test("Megumi speaks with the original body mouth targets and releases them on cancel", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await runCutscenePreview({
    page, cutscene: availableCutscene("S1-CATA1-01"), completionTimeout: 90_000,
    sampleOnly: true, testInfo,
    inspectPlayback: async ({ page, report }) => {
      report.genericMouthSamples = [];
      const deadline = Date.now() + 45_000;
      while (Date.now() < deadline) {
        const sample = await page.evaluate(() => {
          const runtime = [...window.__getCutsceneDirector().runtimes.values()].find(runtime => runtime.presentation.active);
          const face = runtime?.presentation.faces.active?.genericFaces.get("MEGM");
          if (!face?.voiceCue) return null;
          const meshes = face.speech.controller.binding.meshes.map(record => record.mesh);
          return {
            weight: face.speech.controller.weight,
            audioTime: face.voiceCue.positionSeconds,
            rendered: meshes.some(mesh => mesh.isEnabled() && mesh.getScene().isActiveMesh(mesh)),
            vertices: meshes.flatMap(mesh => Array.from(mesh.getVerticesData("position"))),
          };
        });
        if (sample?.rendered) report.genericMouthSamples.push(sample);
        const distinct = new Set(report.genericMouthSamples.map(sample => JSON.stringify(sample.vertices))).size;
        if (distinct > 2 && sample?.weight > 0.5) break;
        await page.waitForTimeout(100);
      }
      expect(new Set(report.genericMouthSamples.map(sample => sample.weight)).size).toBeGreaterThan(2);
      expect(new Set(report.genericMouthSamples.map(sample => JSON.stringify(sample.vertices))).size).toBeGreaterThan(2);
      await page.screenshot({ path: testInfo.outputPath("megumi-speaking.png") });
      console.info("Megumi rendered mouth samples:", report.genericMouthSamples.length);
    },
  });
  expect(await page.evaluate(() => [...window.__getCutsceneDirector().runtimes.values()]
    .every(runtime => !runtime.presentation.faces.active))).toBe(true);
});

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
