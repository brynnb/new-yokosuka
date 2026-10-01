import { expect, test } from "@playwright/test";
import { availableCutscene } from "../../play/config/cutscenes.js";
import { runCutscenePreview } from "./cutscene-preview-flow.js";
import { completionTimeoutForCutscene } from "./cutscene-preview-timeout.js";

test("Lan Di nightmare animates Ryo's sleep/wake face and isolates its black dream stage", async ({ page }, testInfo) => {
  const cutscene = availableCutscene("S1-OP00-DREAM");
  const completionTimeout = completionTimeoutForCutscene(cutscene.id);
  test.setTimeout(completionTimeout + 120_000);
  await runCutscenePreview({ page, cutscene, completionTimeout, testInfo,
    inspectPlayback: async ({ report }) => {
      report.dreamStages = [];
      report.ryoFaceSamples = [];
      for (const [slot, frame] of [[28, 35], [28, 65], [28, 115], [28, 200], [30, 5], [36, 20], [44, 20], [46, 20], [29, 10], [29, 45], [29, 100], [29, 200]]) {
        const id = `OP00/SEQDATA${slot}.AUTH`;
        await page.waitForFunction(({ id, frame }) => {
          const activity = window.__cutsceneBrowserProbe.activity;
          return activity.id === id && activity.frame >= frame;
        }, { id, frame }, { timeout: 30_000 });
        const sample = await page.evaluate(() => {
          const runtime = window.__getCutsceneDirector().activeCutscene.packageRuntime;
          const maps = runtime.mapLayers;
          return {
            activity: window.__cutsceneBrowserProbe.activity,
            visibleRoots: maps.worldRoots.filter(root => root.isEnabled()).map(root => root._filename),
            blanketRoots: maps.worldRoots.filter(root => /FUTS30[12]G\.MT5$/i.test(root._filename)).map(root => root._filename),
            background: maps.background?.color.asArray() ?? null,
            skyEnabled: maps.scene.getMeshByName("skyDome")?.isEnabled() ?? false,
            weather: maps.scene.particleSystems.filter(system => system.name.startsWith("world_weather_")).map(system => system.name),
            gameplayRyoVisible: runtime.actors.program.hiddenPlayer.root.isEnabled(),
            sleepwearRyoVisible: runtime.actors.programActor("AKI_").model.renderRoot.isEnabled(),
          };
        });
        report.dreamStages.push(sample);
        expect(sample.activity.id).toBe(id);
        expect(sample.blanketRoots, "The opening bedroom does not instantiate separate blankets").toEqual([]);
        const bedroom = [28, 29].includes(slot);
        expect(sample.gameplayRyoVisible, "the regular avatar is not in this cinematic's cast").toBe(false);
        expect(sample.sleepwearRyoVisible, "sleepwear Ryo belongs only in bedroom shots").toBe(bedroom);
        expect(sample.background).toEqual(bedroom ? null : [0, 0, 0, 1]);
        if (bedroom) expect(sample.visibleRoots).toContain("S1_OP00_OMO.MT5");
        else {
          expect(sample.visibleRoots).toEqual([]);
          expect(sample.skyEnabled).toBe(false);
          expect(sample.weather).toEqual([]);
        }
        if (bedroom) {
          const face = await page.evaluate(() => window.__readCutsceneFaces().find(face => face.actorTag === "AKI_"));
          expect(face).toMatchObject({ faceCode: "YKD", enabled: true,
            controllerMode: slot === 28 || frame < 21 ? 1 : 2,
            controllerDrivenClose: slot === 28 || frame < 21 });
          expect(face.vertices.length).toBeGreaterThan(0);
          report.ryoFaceSamples.push({ slot, frame, ...face });
        }
        await page.screenshot({ path: testInfo.outputPath(`lan-di-dream-slot-${slot}-frame-${frame}.png`) });
      }
      for (const slot of [28, 29]) {
        const samples = report.ryoFaceSamples.filter(sample => sample.slot === slot);
        for (const key of ["mouth", "upper", "vertices"]) {
          expect(new Set(samples.map(sample => JSON.stringify(sample[key]))).size,
            `slot ${slot} changes ${key}, not just the body transform`).toBeGreaterThan(1);
        }
      }
    },
  });
});

test("Shenhua nightmare omits blanket covers through sleeping, dreaming, and waking", async ({ page }, testInfo) => {
  const cutscene = availableCutscene("S1-BEBF-01");
  const completionTimeout = completionTimeoutForCutscene(cutscene.id);
  test.setTimeout(completionTimeout + 120_000);
  await runCutscenePreview({ page, cutscene, completionTimeout, testInfo, verifyReplay: true,
    inspectPlayback: async ({ report }) => {
      report.beddingSamples = [];
      for (const [slot, frame] of [[0, 55], [1, 20], [2, 160]]) {
        const id = `BEBF/SEQDATA${slot}.AUTH`;
        await page.waitForFunction(({ id, frame }) => {
          const activity = window.__cutsceneBrowserProbe.activity;
          return activity.id === id && activity.frame >= frame;
        }, { id, frame }, { timeout: 35_000 });
        const sample = await page.evaluate(() => {
          const maps = window.__getCutsceneDirector().activeCutscene.packageRuntime.mapLayers;
          return {
            activity: window.__cutsceneBrowserProbe.activity,
            blankets: ["FUT1", "FUT2"].map(tag => {
              const root = maps.roots.get(tag);
              return { tag, filename: root?._filename, enabled: root?.isEnabled(),
                visibleMeshes: root?.getChildMeshes().filter(mesh => mesh.isEnabled()).length };
            }),
            visibleRoomLayers: [...maps.roots].filter(([name, root]) => name.startsWith("MAP") && root.isEnabled()).map(([name]) => name),
          };
        });
        report.beddingSamples.push(sample);
        expect(sample.activity.id).toBe(id);
        expect(sample.blankets).toEqual([
          { tag: "FUT1", filename: "S1_JOMO_FUTS301G.MT5", enabled: false, visibleMeshes: 0 },
          { tag: "FUT2", filename: "S1_JOMO_FUTS302G.MT5", enabled: false, visibleMeshes: 0 },
        ]);
        expect(sample.visibleRoomLayers).toEqual(slot === 1 ? [] : ["MAP", "MAP02", "MAP04", "MAP06", "MAP08"]);
        await page.screenshot({ path: testInfo.outputPath(`shenhua-nightmare-slot-${slot}-frame-${frame}.png`) });
      }
    },
  });
});
