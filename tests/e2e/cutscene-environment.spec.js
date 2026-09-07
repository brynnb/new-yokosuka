import { expect, test } from "@playwright/test";
import { availableCutscene } from "../../play/config/cutscenes.js";
import { runCutscenePreview } from "./cutscene-preview-flow.js";

async function readPresentation(page, stateUrl) {
  return page.evaluate(async url => {
    const { default: state } = await import(url);
    return {
      season: state.currentSeason, time: state.currentTimeOfDay,
      weather: state.currentWeatherIndex, zone: state.currentZone,
      profile: state.currentVariantProfile,
      roots: state.currentMeshes.filter(root => /JU00.*MAP/.test(root._filename)).map(root => ({
        filename: root._filename, enabled: root.isEnabled(),
      })),
      actorPresentation: window.__readCutsceneActorPresentation(),
    };
  }, stateUrl);
}

function expectComposition(presentation) {
  expect(presentation.zone).toBe("JU00");
  for (const group of presentation.profile.groups) {
    const active = [group.variants[presentation[group.type]]].flat().filter(Boolean);
    for (const suffix of new Set(group.variants.flat().filter(Boolean))) {
      const root = presentation.roots.find(root => root.filename === `S1_JU00_${suffix}.MT5`);
      expect(root, `${group.name}: resident ${suffix}`).toBeDefined();
      expect(root.enabled, `${group.name}: ${suffix}`).toBe(active.includes(suffix));
    }
  }
}

test("kitten uses shared seasonal visibility and disables camera fading", async ({ page }, testInfo) => {
  test.setTimeout(210_000);
  await runCutscenePreview({
    page, cutscene: availableCutscene("S1-CATA1-01"),
    sampleOnly: true, expectedMusicTrack: "bgm051",
    verifyMusicAcrossActivities: false, completionTimeout: 15_000, testInfo,
    inspectPlayback: async ({ page, report, runtimeModuleUrls }) => {
      const stateUrl = runtimeModuleUrls["/src/state.js"];
      report.initialEnvironment = await readPresentation(page, stateUrl);
      expectComposition(report.initialEnvironment);
      expect(report.initialEnvironment.actorPresentation.cameraFadeEnabled).toBe(false);
      await page.screenshot({ path: testInfo.outputPath("summer-first-activity.png") });

      // Capture the live environment on its next ordinary timer tick, without
      // replacing synchronization. Feed it the same snapshot fields as gameplay.
      await page.evaluate(async url => {
        const { WorldEnvironmentRuntime } = await import(url);
        await new Promise(resolve => {
          const synchronize = WorldEnvironmentRuntime.prototype.synchronize;
          WorldEnvironmentRuntime.prototype.synchronize = function(options) {
            WorldEnvironmentRuntime.prototype.synchronize = synchronize;
            const result = synchronize.call(this, options);
            const previousState = this.clock.worldState;
            window.__setTestSeason = seasonIndex => {
              this.setServerState({ ...previousState, seasonIndex, season: seasonIndex ? "winter" : "summer" });
              this.synchronize();
            };
            window.__restoreTestSeason = () => { this.setServerState(previousState); this.synchronize(); };
            resolve();
            return result;
          };
        });
      }, runtimeModuleUrls["/play/world/WorldEnvironmentRuntime.js"]);
      try {
        report.environmentChanges = [];
        for (const season of [1, 0]) {
          await page.evaluate(season => window.__setTestSeason(season), season);
          const presentation = await readPresentation(page, stateUrl);
          report.environmentChanges.push(presentation);
          expect(presentation.season).toBe(season);
          expectComposition(presentation);
          await page.screenshot({ path: testInfo.outputPath(`season-${season}-first-activity.png`) });
        }
        // The second AUTH has the close camera view that previously faded
        // Megumi. Wait for authored playback rather than moving actors/camera.
        await expect.poll(() => page.evaluate(() => window.__cutsceneBrowserProbe.activity?.id), {
          timeout: 120_000,
        }).toBe("CATA1/SEQDATA1.AUTH");
        await page.waitForTimeout(3_000);
        report.closeCamera = await readPresentation(page, stateUrl);
        expectComposition(report.closeCamera);
        expect(report.closeCamera.actorPresentation.cameraFadeEnabled).toBe(false);
        const megumi = report.closeCamera.actorPresentation.actors.find(actor => actor.actorCode === "MEGM");
        expect(megumi.models).toHaveLength(1);
        expect(megumi.models[0].cameraFaded).toBe(false);
        expect(megumi.models[0].materials.every(material => material.alpha === 1)).toBe(true);
      } finally {
        await page.evaluate(() => window.__restoreTestSeason());
      }
    },
  });
  expect(await page.evaluate(() => window.__readCutsceneActorPresentation().cameraFadeEnabled)).toBe(true);
});
