import { expect } from "@playwright/test";

// Presentation-only checks through the real Story adapter. These do not grant
// prerequisites or claim that replaying a scene proves its narrative trigger.
export async function reviewStoryFaces(page, testInfo, character) {
  const saved = () => page.request.get(`/api/characters/${character.id}/state`).then(r => r.json());
  const before = await saved();
  for (const [id, world, area, actors] of [
    ["s1.ms08.master-chen.arrival", "ms08", "MS08", { KISY: "KIS", TAIJ: "SYU" }],
    ["s1.d000.jimmy-caught.scene", "dobuita", "D000", { JIMY: "JIM" }],
    ["s1.mend.nozomi-amulet.scene", "mend", "MEND", { HRSK: "NZM" }],
  ]) {
    await page.evaluate(async world => { await window.storyProbe.lifecycle.travelToWorld(world); }, world);
    await page.waitForFunction(() => window.storyProbe.lifecycle.worldRuntime.ready);
    await page.evaluate(({ id, area, actors }) => {
      const p = window.storyProbe, presentation = p.regions.controller.presentation;
      const review = p.faceReview = { done: false, error: null, cancelling: false,
        samples: {}, returnedFrom: p.lifecycle.worldRuntime.activeWorld.id };
      let nextSample = 0;
      const scene = p.lifecycle.scene;
      const observer = scene.onAfterRenderObservable.add(() => {
        if (performance.now() < nextSample) return;
        nextSample = performance.now() + 100;
        const runtime = p.director?.activeCutscene?.packageRuntime;
        for (const [tag, face] of runtime?.presentation.faces?.active?.faces || []) {
          if (!actors[tag] || !face.voiceCue || face.voiceCue.positionSeconds <= 0) continue;
          const meshes = face.entry.primaryMeshes;
          if (!meshes.some(mesh => mesh.isEnabled() && scene.isActiveMesh(mesh))) continue;
          const sample = review.samples[tag] ||= { code: face.entry.definition.faceCode,
            frames: 0, vertices: new Set(), mouths: new Set(), audio: new Set() };
          sample.frames++;
          sample.audio.add(face.voiceCue.positionSeconds);
          sample.mouths.add(JSON.stringify(Array.from(face.mouth.current)));
          sample.vertices.add(JSON.stringify(meshes.flatMap(mesh => {
            const positions = mesh.getVerticesData("position");
            return Array.from(mesh._mt5SourceVertexIndices).flatMap((source, index) => {
              const local = source - face.entry.primaryVertexBase;
              return mesh._mt5ExternalParentVertexOffsets?.[index] < 0
                || local < 0 || local >= face.entry.table.vertexCount ? []
                : Array.from(positions.slice(index * 3, index * 3 + 3));
            });
          })));
        }
      });
      review.stopProbe = () => scene.onAfterRenderObservable.remove(observer);
      presentation.begin({ area });
      void presentation.execute({ name: "start_activity", arguments: [{ type: "string", isStatic: true, value: id }] })
        .then(() => { presentation.commit(); review.done = true; }, error => {
          presentation.rollback("face-review-failed");
          if (!review.cancelling) review.error = error.message;
          review.done = true;
        });
    }, { id, area, actors });
    try {
      for (const [tag, code] of Object.entries(actors)) {
        await page.waitForFunction(tag => {
          const r = window.storyProbe.faceReview, s = r.samples[tag];
          return r.error || r.done || (s?.vertices.size > 2 && s.mouths.size > 2 && s.audio.size > 2);
        }, tag, { timeout: 120_000 });
        const sample = await page.evaluate(tag => {
          const r = window.storyProbe.faceReview, s = r.samples[tag];
          return { error: r.error, code: s?.code, frames: s?.frames,
            vertices: s?.vertices.size, mouths: s?.mouths.size, audio: s?.audio.size };
        }, tag);
        console.info(`Story FACE ${id}/${tag}:`, JSON.stringify(sample));
        expect(sample.error).toBeNull(); expect(sample.code).toBe(code);
        expect(sample.frames).toBeGreaterThan(2); expect(sample.vertices).toBeGreaterThan(2);
        expect(sample.mouths).toBeGreaterThan(2); expect(sample.audio).toBeGreaterThan(2);
        await page.screenshot({ path: testInfo.outputPath(`story-face-${tag}.png`) });
        // An actor may be submitted by Babylon while hidden behind scenery.
        // Keep the native-shot capture, then explicitly frame the real shell
        // with the existing diagnostic camera for mesh/neck/eye inspection.
        await page.evaluate(async tag => {
          const { frameCutsceneSurface } = await import("/tests/e2e/cutscene-surface-framing.js");
          const p = window.storyProbe;
          p.faceReview.closeupFrames = 0;
          p.faceReview.restoreCamera = frameCutsceneSurface(p.director.activeCutscene.packageRuntime,
            "face", tag, null, () => { p.faceReview.closeupFrames++; });
        }, tag);
        try {
          await page.waitForFunction(() => window.storyProbe.faceReview.closeupFrames >= 2);
          await page.screenshot({ path: testInfo.outputPath(`diagnostic-story-face-${tag}.png`) });
        } finally {
          await page.evaluate(() => { window.storyProbe.faceReview.restoreCamera(); });
        }
      }
    } finally {
      await page.evaluate(() => {
        const p = window.storyProbe;
        p.faceReview.stopProbe(); p.faceReview.cancelling = true;
        p.regions.controller.presentation.rollback("face-review-cancel");
      });
      await page.waitForFunction(() => {
        const p = window.storyProbe;
        return p.faceReview.done && !p.director.active && p.lifecycle.worldRuntime.ready
          && p.lifecycle.worldRuntime.activeWorld.id === p.faceReview.returnedFrom
          && !p.lifecycle.getController().movementLocked;
      }, null, { timeout: 100_000 });
    }
    expect(await page.evaluate(() => window.storyProbe.sceneErrors)).toEqual([]);
    const after = await saved();
    expect(after.character.storyFlags).toEqual(before.character.storyFlags);
    expect(after.character.yen).toBe(before.character.yen);
    expect(after.inventory).toEqual(before.inventory);
  }
}
