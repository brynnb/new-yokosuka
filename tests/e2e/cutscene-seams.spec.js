import { expect, test } from "@playwright/test";
import { availableCutscene } from "../../play/config/cutscenes.js";
import { runCutscenePreview } from "./cutscene-preview-flow.js";

async function reach(page, activityId, frame) {
  await page.evaluate(() => document.activeElement?.blur());
  for (let attempt = 0; attempt < 60; attempt++) {
    const activity = await page.evaluate(() => window.__cutsceneBrowserProbe.activity);
    if (activity.id === activityId && activity.frame >= frame) return;
    if (activity.id !== activityId || activity.frame + 170 < frame) {
      // Stop at the next boundary: a fixed five-second jump can skip a whole
      // short final shot before we can freeze it for comparison.
      await page.evaluate(seconds => window.__getCutsceneDirector().seekBySeconds(seconds),
        Math.min(5, (activity.durationFrames - activity.frame) / 30 + 0.02));
      await page.waitForTimeout(100);
    } else {
      await page.waitForFunction(({ activityId, frame }) => {
        const activity = window.__cutsceneBrowserProbe.activity;
        return activity.id === activityId && activity.frame >= frame;
      }, { activityId, frame }, { timeout: 12_000 });
      return;
    }
  }
  throw new Error(`Did not reach ${activityId}:${frame}`);
}

for (const sample of [
  { id: "S1-OP02-00", actor: "SINF", shots: [["OP02/SEQDATA2.AUTH", 60], ["OP02/SEQDATA4.AUTH", 480], ["OP02/SEQDATA5.AUTH", 10]] },
  { id: "S1-000", actor: "INE_", shots: [["OP00/SEQDATA0.AUTH", 600], ["OP00/SEQDATA1.AUTH", 440], ["OP00/SEQDATA1.AUTH", 800]] },
]) {
  test(`${sample.id} renders its neck joins and opening props`, async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await runCutscenePreview({ page, cutscene: availableCutscene(sample.id), testInfo,
      sampleOnly: true, completionTimeout: 15_000,
      inspectPlayback: async ({ page, report }) => {
        report.surfaceSamples = [];
        for (const [activityId, frame] of sample.shots) {
          await reach(page, activityId, frame);
          await page.evaluate(() => {
            const director = window.__getCutsceneDirector();
            const native = director.activeCutscene.runtime.owner.nativeRuntime;
            window.__resumeSeamDiagnostic = () => { delete native.update; };
            native.update = () => false;
          });
          const prefix = `${activityId.split("/")[1]}-${frame}`;
          try {
            report.surfaceSamples.push(await page.evaluate(actor => {
              const runtime = window.__getCutsceneDirector().activeCutscene.packageRuntime;
              const face = runtime.presentation.faces?.active?.faces.get(actor);
              const car = runtime.sceneObjects?.objects.get("RMJN")?.root;
              return { activity: window.__cutsceneBrowserProbe.activity,
                face: face ? { actor, bound: face.surfaceIntegration.boundExternalParentVertexCount,
                  removed: face.surfaceIntegration.removedTriangleCount,
                  retained: face.surfaceIntegration.retainedTriangleCount } : null,
                car: car ? { enabled: car.isEnabled(), position: car.position.asArray(),
                  meshes: car.getChildMeshes().map(mesh => ({ name: mesh.name,
                    enabled: mesh.isEnabled(), visible: mesh.isVisible, indices: mesh.getTotalIndices(),
                    position: mesh.getAbsolutePosition().asArray(),
                    active: mesh.getScene().getActiveMeshes().data.slice(0, mesh.getScene().getActiveMeshes().length).includes(mesh),
                    dynamic: mesh.getScene()._selectionOctree?.dynamicContent.includes(mesh),
                    bounds: [mesh.getBoundingInfo().boundingBox.minimumWorld.asArray(), mesh.getBoundingInfo().boundingBox.maximumWorld.asArray()],
                  })) } : null };
            }, sample.actor));
            const state = report.surfaceSamples.at(-1);
            if (sample.id === "S1-000" && activityId.endsWith("SEQDATA0.AUTH")) {
              expect(state.car.enabled).toBe(true);
              expect(state.car.meshes.filter(mesh => mesh.indices > 0).every(mesh => mesh.dynamic)).toBe(true);
              expect(state.car.meshes.some(mesh => mesh.indices > 0 && mesh.active), "black car is submitted in its first shot").toBe(true);
            } else {
              expect(state.face, "sample includes the real detailed FACE integration").not.toBeNull();
            }
            await page.screenshot({ path: testInfo.outputPath(`${prefix}-authored.png`),
              style: "#dialogue-overlay { visibility: hidden !important; }" });
            if (process.env.NY_SEAM_DIAGNOSTIC === "true") {
              if (sample.id === "S1-000" && activityId.endsWith("SEQDATA0.AUTH")) {
                await page.evaluate(() => {
                  const car = window.__getCutsceneDirector().activeCutscene.packageRuntime.sceneObjects.objects.get("RMJN").root;
                  const octree = car.getScene()._selectionOctree;
                  window.__restoreCarDiagnostic = () => { if (octree) octree.dynamicContent = original; };
                  const original = octree?.dynamicContent.slice();
                  if (octree) for (const mesh of car.getChildMeshes()) if (!octree.dynamicContent.includes(mesh)) octree.dynamicContent.push(mesh);
                });
                await page.screenshot({ path: testInfo.outputPath(`${prefix}-dynamic-car.png`) });
                await page.evaluate(() => window.__restoreCarDiagnostic());
              }
              for (const mode of ["body-only", "complete-body-and-face", "double-sided-face", "rest-face"]) {
                const changed = await page.evaluate(({ actor, mode }) => {
                  const runtime = window.__getCutsceneDirector().activeCutscene.packageRuntime;
                  const face = runtime.presentation.faces?.active?.faces.get(actor);
                  if (!face) return false;
                  const patches = face.surfaceIntegration.patches.map(patch => ({
                    ...patch, current: Array.from(patch.mesh.getIndices()),
                  }));
                  const materials = [...new Set(face.entry.root.getChildMeshes().map(mesh => mesh.material))]
                    .filter(Boolean).map(material => ({ material, cull: material.backFaceCulling }));
                  const buffers = face.entry.primaryMeshes.map(mesh => ({mesh, positions: Array.from(mesh.getVerticesData("position"))}));
                  window.__restoreSeamDiagnostic = () => {
                    face.entry.root.setEnabled(true);
                    for (const patch of patches) patch.mesh.setIndices(patch.current);
                    for (const { material, cull } of materials) material.backFaceCulling = cull;
                    for (const { mesh, positions } of buffers) mesh.updateVerticesData("position", positions);
                  };
                  if (mode === "rest-face") {
                    for (const { mesh } of buffers) mesh.updateVerticesData("position", mesh._mt5SourcePositions);
                  } else if (mode === "double-sided-face") {
                    for (const { material } of materials) material.backFaceCulling = false;
                  } else {
                    for (const patch of patches) patch.mesh.setIndices(patch.indices);
                    face.entry.root.setEnabled(mode !== "body-only");
                  }
                  return true;
                }, { actor: sample.actor, mode });
                if (!changed) continue;
                await page.screenshot({ path: testInfo.outputPath(`${prefix}-${mode}.png`),
                  style: "#dialogue-overlay { visibility: hidden !important; }" });
                await page.evaluate(() => window.__restoreSeamDiagnostic());
              }
            }
          } finally {
            if (sample.shots.at(-1)[0] !== activityId || sample.shots.at(-1)[1] !== frame) {
              await page.evaluate(() => window.__resumeSeamDiagnostic());
            }
          }
        }
      },
    });
  });
}
