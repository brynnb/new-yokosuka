import { expect, test } from "@playwright/test";
import { availableCutscene } from "../../play/config/cutscenes.js";
import { runCutscenePreview } from "./cutscene-preview-flow.js";
import { completionTimeoutForCutscene } from "./cutscene-preview-timeout.js";

test("Lan Di's native sleeve controls expose the tattoo without moving the hand", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  await runCutscenePreview({ page, cutscene: availableCutscene("S1-000"),
    completionTimeout: 20_000, sampleOnly: true, verifyMusicAcrossActivities: false, testInfo,
    inspectPlayback: async ({ report }) => {
      await page.locator("#loading.hidden").waitFor({ state: "attached" });
      // Traverse real stage boundaries; seeking does not spend leftover time
      // across async starts. This is targeted visual evidence, not full playback.
      for (let shot = 0; shot < 25; shot++) {
        const previous = await page.evaluate(() => window.__cutsceneBrowserProbe.activity.id);
        if (previous === "OP00/SEQDATA17.AUTH") break;
        await page.evaluate(() => {
          const activity = window.__cutsceneBrowserProbe.activity;
          window.__getCutsceneDirector().seekBySeconds(activity.durationFrames / 30 + 1);
        });
        await page.waitForFunction(previous => window.__cutsceneBrowserProbe.activity.id !== previous,
          previous, { timeout: 15_000 });
      }
      expect(await page.evaluate(() => window.__cutsceneBrowserProbe.activity.id)).toBe("OP00/SEQDATA17.AUTH");
      await page.evaluate(() => {
        const activity = window.__cutsceneBrowserProbe.activity;
        window.__getCutsceneDirector().seekBySeconds((200 - activity.frame) / 30);
      });
      await page.screenshot({ path: testInfo.outputPath("mirror-before-tattoo.png") });
      await page.evaluate(() => {
        const activity = window.__cutsceneBrowserProbe.activity;
        window.__getCutsceneDirector().seekBySeconds((370 - activity.frame) / 30);
      });
      report.sleeve = await page.evaluate(() => {
        const runtime = window.__getCutsceneDirector().activeCutscene.packageRuntime;
        const model = runtime.actors.activeActor("SORY").model;
        const nodes = model.renderRoot._mt5Nodes;
        const base = model.loader.characterRigWorldMatrices(model.renderRoot, model.latestRetargetedRoutes);
        const resolved = model.renderRoot._mt5CharacterWorldMatrices;
        return { activity: window.__cutsceneBrowserProbe.activity,
          controls: [0, 10, 20, 30].map(mode => runtime.programSceneState.readNativeSecondaryMotionGlobalFloat(mode)),
          sleeves: nodes.filter(node => (node.flag & 0xffff) === 0x81).map(node => ({
            addr: node.addr, base: base.get(node.addr), resolved: resolved.get(node.addr) })),
          hands: window.__readCutsceneHands().filter(hand => hand.actorTag === "SORY") };
      });
      expect(report.sleeve.controls).toEqual([0x3e6b851f, 0x4185999a, 0xc0966666, 0x41e80000]);
      expect(report.sleeve.sleeves.filter(node => JSON.stringify(node.base) !== JSON.stringify(node.resolved))).toHaveLength(3);
      await page.screenshot({ path: testInfo.outputPath("tattoo-native-sleeve.png"),
        style: "#dialogue-overlay, #dialogue-controls-hud { visibility: hidden !important; }" });
      // A same-shot diagnostic isolates the missing handler. Restore the
      // actual controls immediately afterward; no persistent scene override.
      const handInvariant = await page.evaluate(() => {
        const p = window.__getCutsceneDirector().activeCutscene.packageRuntime;
        const before = JSON.stringify(window.__readCutsceneHands().filter(hand => hand.actorTag === "SORY"));
        window.__sleeveControlWords = new Map(p.programSceneState.nativeSecondaryMotionControlState.globalFloatWords);
        p.programSceneState.nativeSecondaryMotionControlState.globalFloatWords.clear();
        p.presentation.secondaryMotion.apply(p.presentation.active.owner);
        return before === JSON.stringify(window.__readCutsceneHands().filter(hand => hand.actorTag === "SORY"));
      });
      expect(handInvariant).toBe(true);
      await page.screenshot({ path: testInfo.outputPath("tattoo-authored-uncontrolled.png"),
        style: "#dialogue-overlay, #dialogue-controls-hud { visibility: hidden !important; }" });
      await page.evaluate(() => {
        const p = window.__getCutsceneDirector().activeCutscene.packageRuntime;
        p.programSceneState.nativeSecondaryMotionControlState.globalFloatWords = window.__sleeveControlWords;
        p.presentation.secondaryMotion.apply(p.presentation.active.owner);
        delete window.__sleeveControlWords;
      });
      // The next callback resets that wrist and briefly shortens the other
      // sleeve. Verify the writes survive the real activity handoff too.
      await page.evaluate(() => {
        window.__getCutsceneDirector().seekBySeconds(10);
      });
      await page.waitForFunction(() => window.__cutsceneBrowserProbe.activity.id === "OP00/SEQDATA20.AUTH");
      report.departureControls = await page.evaluate(() => {
        const p = window.__getCutsceneDirector().activeCutscene.packageRuntime;
        return [0, 1, 10, 20, 30].map(mode => p.programSceneState.readNativeSecondaryMotionGlobalFloat(mode));
      });
      expect(report.departureControls).toEqual([0x3f800000, 0x3f666666, 0, 0, 0]);
      report.departureSleeveAxes = await page.evaluate(() => {
        const p = window.__getCutsceneDirector().activeCutscene.packageRuntime;
        const model = p.actors.activeActor("SORY").model;
        const base = model.loader.characterRigWorldMatrices(model.renderRoot, model.latestRetargetedRoutes);
        const resolved = model.renderRoot._mt5CharacterWorldMatrices;
        return model.renderRoot._mt5Nodes.filter(node => (node.flag & 0xffff) === 0x81).map(node => {
          const before = base.get(node.addr), after = resolved.get(node.addr);
          // Both controls are scale-only here. Cuffs must keep their authored
          // axes relative to the animated forearms after the tattoo reset.
          return [0, 4, 8].map(offset => {
            const a = before.slice(offset, offset + 3), b = after.slice(offset, offset + 3);
            return a.reduce((dot, value, index) => dot + value * b[index], 0)
              / (Math.hypot(...a) * Math.hypot(...b));
          });
        });
      });
      for (const axes of report.departureSleeveAxes) {
        for (const alignment of axes) expect(alignment).toBeGreaterThan(0.99999);
      }
      await page.screenshot({ path: testInfo.outputPath("departure-sleeves.png") });
      await page.evaluate(() => {
        const activity = window.__cutsceneBrowserProbe.activity;
        window.__getCutsceneDirector().seekBySeconds((300 - activity.frame) / 30);
      });
      await page.screenshot({ path: testInfo.outputPath("departure-sleeves-wide.png") });
    },
  });
});

test("Yamagishi retains the source wrist correction until its authored reset", async ({ page }, testInfo) => {
  const id = "S1-D0W0-01";
  const completionTimeout = completionTimeoutForCutscene(id);
  test.setTimeout(completionTimeout + 120_000);
  await runCutscenePreview({ page, cutscene: availableCutscene(id), completionTimeout, testInfo, verifyReplay: true,
    inspectPlayback: async ({ page, report }) => {
      report.wristSamples = [];
      for (const frame of [90, 400, 880, 960]) {
        await page.waitForFunction(frame => window.__cutsceneBrowserProbe.activity.frame >= frame,
          frame, { timeout: completionTimeout });
        const hand = await page.evaluate(() => window.__readCutsceneHands()
          .find(value => value.actorTag === "YAMA" && value.side === "left"));
        expect(hand.enabled).toBe(true);
        expect(hand.componentRotationRaw).toEqual(frame < 920 ? [-8920, 4004, -5643] : [0, 0, 0]);
        expect(hand.attachmentMatrix).toHaveLength(16);
        report.wristSamples.push({ frame, hand });
        await page.screenshot({ path: testInfo.outputPath(`yamagishi-wrist-${frame}.png`),
          style: "#dialogue-overlay, #dialogue-controls-hud { visibility: hidden !important; }" });
      }
    },
  });
});

for (const sample of [
  { id: "S1-D0W0-01", frame: 400, actor: "YAMA", side: "left", raw: [-8920, 4004, -5643] },
  { id: "S1-TGMA-01", frame: 620, actor: "AKIR", side: "right", raw: [-4662, -691, 1742] },
  { id: "S1-HOUO-01", frame: 120, actor: "AKIR", side: "right", raw: [1274, -546, 728] },
  { id: "S1-JHW0-06", frame: 200, actor: "AKIR", side: "right", raw: [-3822, 5643, 0] },
  { id: "S1-DRAUTH-02", frame: 170, actor: "TONY", side: "right", raw: [0, -3640, -364] },
  { id: "S1-TOKI-01", frame: 2100, actor: "ASDA", side: "left", raw: [-3640, 728, 4733] },
]) {
  test(`${sample.id} renders its corrected hand attachment`, async ({ page }, testInfo) => {
    test.setTimeout(150_000);
    await runCutscenePreview({ page, cutscene: availableCutscene(sample.id), completionTimeout: 15_000,
      sampleOnly: true, testInfo, inspectPlayback: async ({ page, report }) => {
        await page.evaluate(() => document.activeElement?.blur());
        for (let i = 0; i < 50; i++) {
          const frame = await page.evaluate(() => window.__cutsceneBrowserProbe.activity.frame);
          if (frame + 180 >= sample.frame) break;
          await page.keyboard.press("Space"); await page.waitForTimeout(100);
        }
        await page.waitForFunction(frame => window.__cutsceneBrowserProbe.activity.frame >= frame,
          sample.frame, { timeout: 20_000 });
        const hand = await page.evaluate(sample => window.__readCutsceneHands()
          .find(value => value.actorTag === sample.actor && value.side === sample.side), sample);
        expect(hand.componentRotationRaw).toEqual(sample.raw);
        expect(hand.enabled).toBe(true);
        report.correctedHand = hand;
        await page.screenshot({ path: testInfo.outputPath("authored-shot.png") });
        await page.evaluate(sample => window.__frameCutsceneSurface("hand", sample.actor, sample.side), sample);
        await page.waitForFunction(() => window.__cutsceneSurfaceFrames >= 2);
        await page.screenshot({ path: testInfo.outputPath("diagnostic-hand-closeup.png"),
          style: "#dialogue-overlay, #dialogue-controls-hud { visibility: hidden !important; }" });
        await page.evaluate(() => window.__frameCutsceneSurface("restore"));
      },
    });
  });
}
