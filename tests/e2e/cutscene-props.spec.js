import { expect, test } from "@playwright/test";
import { Matrix, Vector3 } from "@babylonjs/core";
import { Mt5Loader } from "../../src/Mt5Loader.js";
import { availableCutscene } from "../../play/config/cutscenes.js";
import { runCutscenePreview } from "./cutscene-preview-flow.js";
import { completionTimeoutForCutscene } from "./cutscene-preview-timeout.js";

async function reachPropFrame(page, activityId, frame) {
  await page.evaluate(() => document.activeElement?.blur());
  for (let attempts = 0; attempts < 60; attempts += 1) {
    const activity = await page.evaluate(() => window.__cutsceneBrowserProbe.activity);
    if (activity.id === activityId && activity.frame >= frame) return;
    if (activity.id !== activityId || activity.frame + 180 < frame) {
      await page.keyboard.press("Space");
      await page.waitForTimeout(100);
    } else {
      await page.waitForFunction(({ activityId, frame }) => (
        window.__cutsceneBrowserProbe.activity.id === activityId
        && window.__cutsceneBrowserProbe.activity.frame >= frame
      ), { activityId, frame }, { timeout: 15_000 });
      return;
    }
  }
  throw new Error(`Could not reach ${activityId} frame ${frame}`);
}

test("Lan Di holds the Dragon Mirror in the opening close-up and departure", async ({ page }, testInfo) => {
  const cutscene = availableCutscene("S1-000");
  const completionTimeout = completionTimeoutForCutscene(cutscene.id);
  test.setTimeout(completionTimeout + 120_000);
  await runCutscenePreview({ page, cutscene, completionTimeout, testInfo,
    inspectPlayback: async ({ report }) => {
      report.mirrorSamples = [];
      for (const [slot, frame] of [[17, 70], [17, 260], [20, 60], [20, 250]]) {
        await page.waitForFunction(({ slot, frame }) => {
          const activity = window.__cutsceneBrowserProbe.activity;
          return activity.id === `OP00/SEQDATA${slot}.AUTH` && activity.frame >= frame;
        }, { slot, frame }, { timeout: completionTimeout });
        const sample = await page.evaluate(() => ({
          activity: window.__cutsceneBrowserProbe.activity,
          prop: window.__readCutscenePropPresentation().find(prop => prop.actorTag === "RYUK"),
          hands: window.__readCutsceneHands().filter(hand => hand.actorTag === "SORY"),
        }));
        report.mirrorSamples.push(sample);
        expect(sample.prop.enabled).toBe(true);
        expect(sample.prop.attachment.binding.parentActorTag).toBe("SORY");
        const grip = sample.hands.find(hand => hand.side === "left");
        expect(grip).toMatchObject({ detailed: true, enabled: true, componentRotationRaw: [0, 0, 0] });
        expect(Math.max(...grip.attachmentMatrix.map((value, index) =>
          Math.abs(value - sample.prop.attachment.controllerMatrix[index]))),
        "mirror and detailed hand share the native wrist frame").toBeLessThan(1e-6);
        await page.screenshot({ path: testInfo.outputPath(`dragon-mirror-${slot}-${frame}.png`),
          style: "#dialogue-overlay, #dialogue-controls-hud { visibility: hidden !important; }" });
      }
    },
  });
});

for (const sample of [
  { id: "S1-TOKI-01", activity: "TOKI/SEQDATA2.AUTH", frame: 2000, prop: "TEGS", parent: "AKIR" },
  { id: "S1-EVSN-01", activity: "EVSN/SEQDATA3.AUTH", frame: 410, prop: "AIRO", parent: "KKEN" },
]) {
  test(`${sample.id} retains its held prop at the targeted presentation frame`, async ({ page }, testInfo) => {
    test.setTimeout(150_000);
    await runCutscenePreview({
      page, cutscene: availableCutscene(sample.id), sampleOnly: true,
      completionTimeout: 15_000, testInfo,
      inspectPlayback: async ({ page, report }) => {
        await reachPropFrame(page, sample.activity, sample.frame);
        report.targetedProp = await page.evaluate(tag => ({
          activity: window.__cutsceneBrowserProbe.activity,
          prop: window.__readCutscenePropPresentation().find(value => value.actorTag === tag),
        }), sample.prop);
        expect(report.targetedProp.prop.enabled).toBe(true);
        expect(report.targetedProp.prop.attachment.binding.parentActorTag).toBe(sample.parent);
        await page.screenshot({ path: testInfo.outputPath("held-prop.png") });
        await page.screenshot({
          path: testInfo.outputPath("held-prop-without-captions.png"),
          style: "#dialogue-overlay, #dialogue-controls-hud { visibility: hidden !important; }",
        });
      },
    });
  });
}

test("hand props use the same model space as the rendered character", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  await runCutscenePreview({
    page, cutscene: availableCutscene("S1-CATA1-01"), sampleOnly: true,
    completionTimeout: 15_000, testInfo,
    inspectPlayback: async ({ page, report }) => {
      await page.evaluate(() => document.activeElement?.blur());
      // Use the user's transport for a short alignment check. This is not
      // full-playback evidence; the uninterrupted completion test is separate.
      for (let attempts = 0; attempts < 25; attempts += 1) {
        const activity = await page.evaluate(() => window.__cutsceneBrowserProbe.activity);
        if (activity.id === "CATA1/SEQDATA1.AUTH") break;
        await page.keyboard.press("Space");
        await page.waitForTimeout(100);
      }
      expect(await page.evaluate(() => window.__cutsceneBrowserProbe.activity.id)).toBe("CATA1/SEQDATA1.AUTH");
      // After the frame-140 handoff, before frame-270 detach. The earlier
      // arrival sample (~120) frames Megumi, so it cannot show Ryo's grip.
      await reachPropFrame(page, "CATA1/SEQDATA1.AUTH", 210);
      const props = await page.evaluate(() => window.__readCutscenePropPresentation());
      report.handAlignment = props.filter(prop => prop.actorTag.startsWith("NBO")).map(prop => {
        expect(prop.enabled).toBe(true);
        expect(prop.attachment).not.toBeNull();
        const { binding, controllerMatrix, contentWorld } = prop.attachment;
        const local = Mt5Loader.sourceTransformMatrix({
          scl: { x: 1, y: 1, z: 1 },
          rot: Object.fromEntries(["x", "y", "z"].map((key, i) => [key, binding.rotationRaw[i] / 65536 * Math.PI * 2])),
          pos: Object.fromEntries(["x", "y", "z"].map((key, i) => [key, binding.translation[i]])),
        });
        const source = Matrix.FromArray(Mt5Loader.rowMultiply(local, controllerMatrix));
        const expected = Vector3.TransformCoordinates(Vector3.Zero(), source.multiply(Matrix.FromArray(contentWorld)));
        return { ...prop, expected: expected.asArray(), error: Vector3.Distance(expected, Vector3.FromArray(prop.position)) };
      });
      await page.screenshot({ path: testInfo.outputPath("hand-alignment.png") });
      // A second diagnostic image removes only the HTML captions, which cover
      // the grip in this shot. Retain the normal frame above as player evidence.
      await page.screenshot({
        path: testInfo.outputPath("hand-alignment-without-captions.png"),
        style: "#dialogue-overlay, #dialogue-controls-hud { visibility: hidden !important; }",
      });
      expect(report.handAlignment).toHaveLength(3);
      for (const prop of report.handAlignment) expect(prop.error, `${prop.actorTag} world-space attachment error`).toBeLessThan(0.001);
    },
  });
});
