import { expect, test } from "@playwright/test";
import { availableCutscene } from "../../play/config/cutscenes.js";
import { runCutscenePreview } from "./cutscene-preview-flow.js";

test("murder ends with the original night camera, lightning and thunder before cleanup", async ({ page }, testInfo) => {
  test.setTimeout(540_000);
  await runCutscenePreview({ page, cutscene: availableCutscene("S1-000"), completionTimeout: 90_000,
    verifyMusicAcrossActivities: false, testInfo,
    inspectPlayback: async ({ report }) => {
      await page.locator("#loading.hidden").waitFor({ state: "attached" });
      // Seeking advances the current AUTH, not unspent time across async
      // native stage starts. Traverse those real boundaries explicitly.
      // Local payloads allow a quick visual diagnostic. Hosted media streams
      // must play naturally: skipping their owners intentionally aborts pending
      // requests, which would invalidate this strict network-error check.
      const hosted = report.authRequests.some(url => url.includes("/shenmue/runtime/"));
      report.castSamples = [];
      for (let shot = 0; !hosted && shot < 25; shot++) {
        const previous = await page.evaluate(() => window.__cutsceneBrowserProbe.activity.id);
        if (previous === "OP00/SEQDATA24.AUTH") break;
        if ([4, 13, 16, 19, 23].some(slot => previous === `OP00/SEQDATA${slot}.AUTH`)) {
          const cast = await page.evaluate(() => {
            const actors = window.__getCutsceneDirector().activeCutscene.packageRuntime.actors;
            return { activity: window.__cutsceneBrowserProbe.activity.id,
              characters: ["AKIR", "IWAO", "SORY", "KURA", "KURB", "INE_", "FUKU"].map(tag => ({
                tag, declared: actors.active.actorTags.includes(tag),
                renderEnabled: actors.programActor(tag)?.model?.renderRoot?.isEnabled() || false,
              })) };
          });
          expect(cast.characters.filter(actor => actor.renderEnabled).map(actor => actor.tag))
            .toEqual(cast.characters.filter(actor => actor.declared).map(actor => actor.tag));
          report.castSamples.push(cast);
          await page.screenshot({ path: testInfo.outputPath(`cast-${shot}.png`) });
        }
        expect(await page.evaluate(() => {
          const activity = window.__cutsceneBrowserProbe.activity;
          return window.__getCutsceneDirector().seekBySeconds(activity.durationFrames / 30 + 1);
        })).toBe(true);
        await page.waitForFunction(previous => window.__cutsceneBrowserProbe.activity.id !== previous,
          previous, { timeout: 15_000 });
      }
      await page.waitForFunction(() => window.__cutsceneBrowserProbe.activity.id === "OP00/SEQDATA24.AUTH",
        null, { timeout: hosted ? 450_000 : 45_000 });
      report.stormSamples = [];
      for (const frame of [50, 138, 146, 180, 300, 340, 470]) {
        await page.waitForFunction(frame => {
          const activity = window.__cutsceneBrowserProbe.activity;
          return activity.id === "OP00/SEQDATA24.AUTH" && activity.frame >= frame;
        }, frame, { timeout: 20_000 });
        await page.evaluate(() => window.__getCutsceneDirector().togglePaused());
        const sample = await page.evaluate(() => {
          const runtime = window.__getCutsceneDirector().activeCutscene.packageRuntime;
          const scene = runtime.mapLayers.scene;
          return { activity: window.__cutsceneBrowserProbe.activity,
            background: runtime.mapLayers.background?.color.asArray(),
            lightingPresetIndex: runtime.mapLayers.lightingPresetIndex,
            ambient: scene.ambientColor.asArray(),
            lights: scene.lights.map(light => ({ type: light.getClassName(), intensity: light.intensity })),
            objects: [...runtime.sceneObjects.objects].filter(([tag]) => tag.startsWith("THN"))
              .map(([tag, value]) => ({ tag, enabled: value.root.isEnabled(),
                vertices: value.root.getChildMeshes().reduce((sum, mesh) => sum + mesh.getTotalVertices(), 0),
                materials: value.root.getChildMeshes().map(mesh => ({
                  name: mesh.material?.name, diffuse: mesh.material?.diffuseTexture?.name,
                  alpha: mesh.material?.alpha, transparencyMode: mesh.material?.transparencyMode,
                  textureIds: mesh.metadata?.textureIds, disableLighting: mesh.material?.disableLighting,
                })) })),
            sounds: [...runtime.presentation.audio.active.cues].map(cue => cue.command.audio.sourcePath),
            thunderPlayback: [...runtime.presentation.audio.active.elements]
              .filter(record => record.command.audio.sourcePath?.startsWith("native-script:OP00:"))
              .map(record => ({ time: record.audio.currentTime, ready: record.audio.readyState,
                error: record.audio.error?.message || null, volume: record.audio.volume, muted: record.audio.muted })),
            actorVisible: runtime.actors.activeActor("AKIR")?.root.isEnabled(),
            characters: ["AKIR", "IWAO", "SORY", "KURA", "KURB", "INE_", "FUKU"].map(tag => {
              const actor = runtime.actors.programActor(tag);
              // Occlusion-query boxes live outside renderRoot and deliberately
              // remain enabled, but their material never writes color.
              return { tag, renderEnabled: actor?.model?.renderRoot?.isEnabled(),
                visibleMeshes: actor?.root.getChildMeshes().filter(mesh =>
                  mesh.isEnabled() && mesh.isVisible && mesh.visibility > 0
                  && mesh.material?.disableColorWrite !== true && mesh.getTotalIndices() > 0).length || 0 };
            }),
          };
        });
        expect(sample.lightingPresetIndex).toBe(3);
        expect(sample.background).toEqual([0, 0, 0, 1]);
        expect(sample.objects).toHaveLength(4);
        expect(sample.objects.every(object => object.vertices > 0)).toBe(true);
        expect(sample.actorVisible).not.toBe(true);
        expect(sample.characters.filter(character => character.visibleMeshes > 0)).toEqual([]);
        expect(sample.characters.some(character => character.renderEnabled)).toBe(false);
        if ([50, 180, 340, 470].includes(frame)) expect(sample.objects.every(object => !object.enabled)).toBe(true);
        report.stormSamples.push(sample);
        await page.screenshot({ path: testInfo.outputPath(`storm-${frame}.png`) });
        await page.evaluate(() => window.__getCutsceneDirector().togglePaused());
      }
      expect(report.stormSamples.some(sample => sample.sounds.some(source => source?.startsWith("native-script:OP00:")))).toBe(true);
      expect(report.stormSamples.some(sample => sample.thunderPlayback.some(audio =>
        audio.time > 0.1 && audio.ready >= 2 && !audio.error && audio.volume > 0 && !audio.muted))).toBe(true);
    },
  });
});
