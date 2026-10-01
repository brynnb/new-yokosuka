import { expect, test } from "@playwright/test";
import { availableCutscene } from "../../play/config/cutscenes.js";
import { runCutscenePreview } from "./cutscene-preview-flow.js";
import { completionTimeoutForCutscene } from "./cutscene-preview-timeout.js";

test("mail scene ground overlays retain texture transparency", async ({ page }, testInfo) => {
  const cutscene = availableCutscene("S1-OP00-MAIL");
  test.setTimeout(120_000);
  await runCutscenePreview({ page, cutscene, completionTimeout: 30_000, sampleOnly: true, testInfo,
    inspectPlayback: async ({ runtimeModuleUrls, report }) => {
      await page.locator("#loading.hidden").waitFor({ state: "attached" });
      await page.waitForFunction(() => {
        const activity = window.__cutsceneBrowserProbe.activity;
        return activity.id === "OP00/SEQDATA26.AUTH" && activity.frame >= 145;
      });
      report.groundOverlays = await page.evaluate(async url => {
        const { default: state } = await import(url);
        return state.scene.meshes.filter(mesh => mesh.isEnabled()
          && mesh.metadata?.mt5DepthOverlay
          && mesh.material?.useAlphaFromDiffuseTexture).map(mesh => ({
          textureId: mesh.metadata.mt5TextureId,
          hasAlpha: mesh.material.diffuseTexture.hasAlpha,
          hasVertexAlpha: mesh.hasVertexAlpha,
          zOffset: mesh.material.zOffset,
        }));
      }, runtimeModuleUrls["/src/state.js"]);
      expect(report.groundOverlays.map(mesh => mesh.textureId)).toEqual(expect.arrayContaining([
        "736e6f775f620000", "d6c8d1d675726e5f",
      ]));
      for (const overlay of report.groundOverlays) {
        expect(overlay.hasAlpha).toBe(true);
        expect(overlay.hasVertexAlpha).toBe(true);
        expect(overlay.zOffset).toBeLessThan(0);
      }
      await page.screenshot({ path: testInfo.outputPath("mail-snow-transparency.png") });
    },
  });
});

test("opening terrain retains its layers and submits the generated per-face depth bias", async ({ page }, testInfo) => {
  const cutscene = availableCutscene("S1-OP02-00");
  const completionTimeout = completionTimeoutForCutscene(cutscene.id);
  test.setTimeout(completionTimeout + 120_000);
  await runCutscenePreview({ page, cutscene, completionTimeout, testInfo,
    inspectPlayback: async ({ page, report }) => {
      report.terrainSamples = [];
      for (const frame of [80, 170, 280]) {
        await page.waitForFunction(frame => {
          const activity = window.__cutsceneBrowserProbe.activity;
          return activity.id === "OP02/SEQDATA0.AUTH" && activity.frame >= frame;
        }, frame, { timeout: 15_000 });
        const sample = await page.evaluate(() => {
          const maps = window.__getCutsceneDirector().activeCutscene.packageRuntime.mapLayers;
          const activeMeshes = maps.scene.getActiveMeshes();
          return {
            activity: window.__cutsceneBrowserProbe.activity,
            roots: maps.worldRoots.filter(root => /^S1_OP02_MAP.*\.MT5$/.test(root._filename)).map(root => ({
              filename: root._filename, enabled: root.isEnabled(),
              triangles: root.getChildMeshes().reduce((sum, mesh) => sum + mesh.getTotalIndices() / 3, 0),
              overlays: root.getChildMeshes().filter(mesh => mesh.metadata?.mt5DepthOverlay).map(mesh => ({
                triangles: mesh.getTotalIndices() / 3,
                zOffset: mesh.material.zOffset, zOffsetUnits: mesh.material.zOffsetUnits,
                submitted: activeMeshes.data.slice(0, activeMeshes.length).includes(mesh),
              })),
            })),
          };
        });
        report.terrainSamples.push(sample);
        expect(sample.roots.map(root => root.filename).sort()).toEqual([
          "S1_OP02_MAP.MT5", "S1_OP02_MAP01.MT5", "S1_OP02_MAP02.MT5", "S1_OP02_MAP03.MT5",
        ]);
        const terrain = sample.roots.find(root => root.filename === "S1_OP02_MAP.MT5");
        expect(terrain.enabled).toBe(true);
        expect(terrain.overlays.reduce((sum, mesh) => sum + mesh.triangles, 0)).toBe(5);
        for (const overlay of terrain.overlays) {
          expect(overlay.zOffset).toBe(-1);
          expect(overlay.zOffsetUnits).toBe(-1);
        }
        await page.screenshot({ path: testInfo.outputPath(`opening-terrain-${frame}.png`) });
      }
      expect(report.terrainSamples.some(sample => sample.roots.some(root =>
        root.filename === "S1_OP02_MAP.MT5" && root.overlays.some(mesh => mesh.submitted))),
      "biased terrain faces are actually submitted in the moving opening camera").toBe(true);
    },
  });
});
