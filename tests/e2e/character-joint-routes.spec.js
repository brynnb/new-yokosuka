import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { availableCutscene } from "../../play/config/cutscenes.js";
import { runCutscenePreview } from "./cutscene-preview-flow.js";

test("native shoulder and foot routes reach Iwao during cutscene playback", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  // These diagnostic seeks skip whole stages. Serve their real audio locally
  // so remote fetches do not race cancellation at every skipped boundary.
  await page.route("**/r2-assets/**/public/audio/**", route => {
    const path = new URL(route.request().url()).pathname.split("/public/audio/")[1];
    return route.fulfill({ body: fs.readFileSync(`public/audio/${path}`) });
  });
  await runCutscenePreview({ page, cutscene: availableCutscene("S1-000"),
    sampleOnly: true, completionTimeout: 15_000, verifyMusicAcrossActivities: false, testInfo,
    inspectPlayback: async ({ report }) => {
      for (let shot = 0; shot < 25; shot++) {
        const previous = await page.evaluate(() => window.__cutsceneBrowserProbe.activity.id);
        if (previous === "OP00/SEQDATA8.AUTH") break;
        await page.evaluate(() => {
          const activity = window.__cutsceneBrowserProbe.activity;
          window.__getCutsceneDirector().seekBySeconds(activity.durationFrames / 30 + 1);
        });
        await page.waitForFunction(previous => window.__cutsceneBrowserProbe.activity.id !== previous,
          previous, { timeout: 15_000 });
      }
      expect(await page.evaluate(() => window.__cutsceneBrowserProbe.activity.id)).toBe("OP00/SEQDATA8.AUTH");
      await page.evaluate(() => {
        const activity = window.__cutsceneBrowserProbe.activity;
        window.__getCutsceneDirector().seekBySeconds((60 - activity.frame) / 30);
      });
      await page.waitForTimeout(100);
      report.jointRoutes = await page.evaluate(() => {
        const director = window.__getCutsceneDirector();
        director.activeCutscene.runtime.owner.nativeRuntime.update = () => false;
        const model = director.activeCutscene.packageRuntime.actors.activeActor("IWAO").model;
        const root = model.renderRoot;
        const results = [[4, 13], [9, 7], [18, 34], [23, 27]].map(([key, type]) => {
          const index = model.latestControllerRenderMatrixByKey.get(key);
          const node = root._mt5Nodes.find(n => (n.flag << 16) >> 16 === key);
          const actual = root._mt5CharacterWorldMatrices.get(node.addr);
          const expected = model.latestRetargetedRoutes.get(key);
          return { key, type: model.latestControllerFamily.nodes[index]?.type,
            expectedType: type, matrixError: expected
              ? Math.max(...actual.map((value, i) => Math.abs(value - expected[i]))) : null };
        });
        // A close diagnostic camera exposes the joint contour at the real AUTH
        // pose. Only camera and playback clock change; no mesh/weight overrides.
        const scene = root.getScene();
        const V = scene.activeCamera.position.constructor;
        const torso = root._mt5Nodes.find(n => (n.flag & 65535) === 1);
        root._mt5CharacterGpuRig.skeleton.prepare(true);
        const target = V.Zero();
        let count = 0;
        for (const mesh of root._mt5CharacterGpuRig.skinnedMeshes) {
          const data = mesh.getPositionData(true, true);
          for (let i = 0; i < data.length / 3; i++) {
            if ((mesh._mt5SourceNodeAddresses?.[i] ?? mesh._mt5NodeAddress) !== torso.addr) continue;
            target.addInPlace(V.TransformCoordinates(V.FromArray(data, i * 3), mesh.computeWorldMatrix(true)));
            count++;
          }
        }
        target.scaleInPlace(1 / count);
        const direction = scene.activeCamera.position.subtract(target).normalize();
        const camera = scene.activeCamera.clone("joint diagnostic");
        camera.position.copyFrom(target.add(direction.scale(1.25)));
        camera.minZ = 0.01;
        camera.setTarget(target);
        scene.activeCamera = camera;
        return results;
      });
      for (const route of report.jointRoutes) {
        expect(route.type).toBe(route.expectedType);
        expect(route.matrixError).not.toBeNull();
        expect(route.matrixError).toBeLessThan(1e-6);
      }
      await page.screenshot({ path: testInfo.outputPath("iwao-shoulder-pose.png"),
        style: "#dialogue-overlay, #dialogue-controls-hud { visibility: hidden !important; }" });
    },
  });
});
