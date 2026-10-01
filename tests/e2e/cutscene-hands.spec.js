import { expect, test } from "@playwright/test";
import { availableCutscene } from "../../play/config/cutscenes.js";
import { nativeHandPoseTarget } from "../../src/NativeHandRig.js";
import { nativeMhndTargetWords, signedNativeMhndWord } from "../../src/NativeMhndPose.js";
import manifest from "../../play/assets/hazuki/houo/manifest.json" with { type: "json" };
import training from "../../play/assets/hazuki/jhw0/manifest.json" with { type: "json" };
import mska from "../../play/assets/hazuki/mska/manifest.json" with { type: "json" };
import kakg from "../../play/assets/hazuki/kakg/manifest.json" with { type: "json" };
import tgma from "../../play/assets/hazuki/tgma/manifest.json" with { type: "json" };
import d0w0 from "../../play/assets/dobuita/d0w0/manifest.json" with { type: "json" };
import cata1 from "../../play/assets/yamanose/cata1/manifest.json" with { type: "json" };
import sakr from "../../play/assets/yd01/sakr/manifest.json" with { type: "json" };
import dnoz from "../../play/assets/sakuragaoka/dnoz/manifest.json" with { type: "json" };
import dnozSki from "../../play/assets/sakuragaoka/dnoz-ski/manifest.json" with { type: "json" };
import evsn from "../../play/assets/sakuragaoka/evsn/manifest.json" with { type: "json" };
import drauth from "../../play/assets/dobuita/drauth/manifest.json" with { type: "json" };
import op02 from "../../play/assets/introduction/op02/manifest.json" with { type: "json" };
import op00Mail from "../../play/assets/introduction/op00-mail/manifest.json" with { type: "json" };
import op00Dream from "../../play/assets/introduction/op00-dream/manifest.json" with { type: "json" };
import { runCutscenePreview } from "./cutscene-preview-flow.js";
import { completionTimeoutForCutscene } from "./cutscene-preview-timeout.js";

const orderedHandCues = activity => [...activity.nativeHandPoseCues, ...activity.nativeBodyHandPoseCues,
  ...(activity.nativeHandComponentCues || [])]
  .sort((a, b) => a.frame - b.frame || a.sourceOrder - b.sourceOrder);
const handCommandTuple = cue => [cue.componentMask != null ? "hand-component"
  : cue.poseTableOffset ? "hand-pose" : "body-hand-pose", cue.actorTag, cue.side ?? null, cue.poseTableOffset ?? null];

for (const [id, manifest, samples] of [
  ["S1-OP00-MAIL", op00Mail, [[25, 35, "INE_"], [25, 560, "INE_"], [25, 605, "INE_"], [25, 680, "INE_"]]],
  ["S1-OP00-DREAM", op00Dream, [[28, 60, "AKI_"], [37, 35, "IWAO"], [43, 20, "IWAO"], [44, 20, "IWAO"], [29, 60, "AKI_"]]],
]) test(`${id} plays its native continuation hands through complete playback`, async ({ page }, testInfo) => {
  const completionTimeout = completionTimeoutForCutscene(id);
  test.setTimeout(completionTimeout + 120_000);
  const report = await runCutscenePreview({ page, cutscene: availableCutscene(id), completionTimeout, testInfo,
    inspectPlayback: async ({ report }) => {
      report.handSamples = [];
      for (const [slot, frame, actorTag] of samples) {
        await page.waitForFunction(({ slot, frame }) => {
          const activity = window.__cutsceneBrowserProbe.activity;
          return activity.id === `OP00/SEQDATA${slot}.AUTH` && activity.frame >= frame;
        }, { slot, frame }, { timeout: completionTimeout });
        const hands = await page.evaluate(actorTag => window.__readCutsceneHands().filter(hand => hand.actorTag === actorTag), actorTag);
        expect(hands).toHaveLength(2);
        for (const hand of hands) {
          expect(hand).toMatchObject({ detailed: true, enabled: true });
          expect(hand.nonzeroPoseWords).toBeGreaterThan(0);
          expect(hand.attachmentMatrix).toHaveLength(16);
        }
        report.handSamples.push({ slot, frame, actorTag, hands });
        await page.screenshot({ path: testInfo.outputPath(`continuation-hands-${slot}-${frame}.png`),
          style: "#dialogue-overlay, #dialogue-controls-hud { visibility: hidden !important; }" });
      }
      if (id === "S1-OP00-MAIL") {
        const left = report.handSamples.map(sample => sample.hands.find(hand => hand.side === "left").pose);
        expect(left[2]).not.toEqual(left[1]);
        expect(report.handSamples[2].hands.find(hand => hand.side === "left").componentRotationRaw).toEqual([0, 0, 5097]);
        const right = report.handSamples.map(sample => sample.hands.find(hand => hand.side === "right").pose);
        expect(right[3]).not.toEqual(right[2]);
      }
    },
  });
  const expected = manifest.activities.flatMap(activity => orderedHandCues(activity).map(handCommandTuple));
  expect(report.probe.handCommands.map(command => [command.name, command.actorTag, command.side ?? null, command.poseTableOffset ?? null])).toEqual(expected);
  expect(report.probe.handCommands.every(command => command.accepted)).toBe(true);
});

test("OP02 switches Shenhua to her authored detailed hands and retains them in the final shot", async ({ page }, testInfo) => {
  const cutscene = availableCutscene("S1-OP02-00");
  const completionTimeout = completionTimeoutForCutscene(cutscene.id);
  test.setTimeout(completionTimeout + 120_000);
  const report = await runCutscenePreview({ page, cutscene, completionTimeout, testInfo,
    inspectPlayback: async ({ report }) => {
      report.handSamples = [];
      for (const [slot, frame, detailed] of [[4, 260, false], [4, 330, true], [4, 450, true], [5, 20, true]]) {
        await page.waitForFunction(({ slot, frame }) => {
          const activity = window.__cutsceneBrowserProbe.activity;
          return activity.id === `OP02/SEQDATA${slot}.AUTH` && activity.frame >= frame;
        }, { slot, frame }, { timeout: completionTimeout });
        const hands = await page.evaluate(() => window.__readCutsceneHands());
        expect(hands).toHaveLength(2);
        for (const hand of hands) {
          expect(hand.actorTag).toBe("SINF");
          expect(hand.detailed).toBe(detailed);
          expect(hand.enabled).toBe(detailed);
          if (detailed) {
            const cue = op02.activities.find(activity => activity.slot === 4).nativeHandPoseCues.find(cue => cue.side === hand.side);
            expect(hand.pose).toEqual(Array.from(nativeHandPoseTarget(op02.nativeHandPoseTables[cue.poseTableOffset].vectors)));
          }
        }
        report.handSamples.push({ slot, frame, hands });
        await page.screenshot({ path: testInfo.outputPath(`shenhua-hands-${slot}-${frame}.png`) });
      }
    },
  });
  expect(report.probe.handCommands.map(command => [command.name, command.actorTag, command.side ?? null, command.poseTableOffset ?? null])).toEqual(op02.activities.flatMap(activity => [
    ...(activity.nativeHandPoseCues || []), ...(activity.nativeHandComponentCues || []),
  ]).map(handCommandTuple));
  expect(report.probe.handCommands.every(command => command.accepted)).toBe(true);
});

for (const [id, leadSlot] of [["S1-EVSN-01", 0], ["S1-EVSN-02", 3]]) {
  test(`${id} plays the rescue hand gestures across every actor and activity`, async ({ page }, testInfo) => {
    const completionTimeout = completionTimeoutForCutscene(id);
    test.setTimeout(completionTimeout + 120_000);
    const ordered = orderedHandCues;
    const report = await runCutscenePreview({
      page, cutscene: availableCutscene(id), completionTimeout, testInfo, verifyReplay: true,
      inspectPlayback: async ({ page, report }) => {
        report.handSamples = [];
        for (const [slot, sampleFrame] of [[leadSlot, 35], [1, 975], [1, 1210], [1, 1245], [1, 1335], [1, 1600], [2, 40], [2, 330], [2, 435], [2, 550]]) {
          const activity = evsn.activities.find(a => a.slot === slot);
          await page.waitForFunction(({ id, frame }) => window.__cutsceneBrowserProbe.activity.id === id
            && window.__cutsceneBrowserProbe.activity.frame >= frame,
          { id: activity.activityId, frame: sampleFrame }, { timeout: completionTimeout });
          const hands = await page.evaluate(() => window.__readCutsceneHands());
          const actors = activity.actors.filter(actor => actor !== "AIRO");
          expect(hands).toHaveLength(actors.length * 2);
          for (const hand of hands) {
            const cues = ordered(activity).filter(cue => cue.frame <= sampleFrame && cue.actorTag === hand.actorTag
              && (cue.side === hand.side || cue.channel === 2 || cue.channel === (hand.side === "right" ? 0 : 1)));
            const latest = cues.filter(cue => cue.poseTableOffset || cue.releaseDetailed).at(-1);
            const detailed = Boolean(latest?.poseTableOffset);
            expect(hand.detailed, `${slot}/${sampleFrame} ${hand.actorTag}/${hand.side}`).toBe(detailed);
            expect(hand.enabled).toBe(detailed);
            if (detailed) expect(hand.pose).toEqual(Array.from(nativeHandPoseTarget(evsn.nativeHandPoseTables[latest.poseTableOffset].vectors)));
            expect(hand.bodyPose).toEqual(nativeMhndTargetWords(8, hand.side === "right" ? 0 : 1).map(signedNativeMhndWord));
          }
          report.handSamples.push({ slot, sampleFrame, hands });
          await page.screenshot({ path: testInfo.outputPath(`hands-${slot}-${sampleFrame}.png`),
            style: "#dialogue-overlay, #dialogue-controls-hud { visibility: hidden !important; }" });
        }
      },
    });
    const expected = [leadSlot, 1, 2].flatMap(slot => ordered(evsn.activities.find(a => a.slot === slot)))
      .map(handCommandTuple);
    expect(report.probe.handCommands.slice(0, expected.length).map(command =>
      [command.name, command.actorTag, command.side ?? null, command.poseTableOffset ?? null])).toEqual(expected);
    expect(report.probe.handCommands.every(command => command.accepted)).toBe(true);
  });
}

for (const [id, pack, slots, samples] of [
  ["S1-DNOZ-01", dnozSki, [0, 1], [[0, 60], [1, 60], [1, 1925], [1, 2805]]],
  ["S1-DNOZ-02", dnoz, [0, 1], [[0, 60], [0, 1600], [1, 60], [1, 170], [1, 1200]]],
  ["S1-DRAUTH-01", drauth, [0], [[0, 35], [0, 170], [0, 365], [0, 1180]]],
  ["S1-DRAUTH-02", drauth, [1], [[0, 35], [0, 225], [0, 315], [0, 345], [0, 405]]],
]) {
  test(`${id} retains actor hand setup and timed handoffs`, async ({ page }, testInfo) => {
    const completionTimeout = completionTimeoutForCutscene(id);
    test.setTimeout(completionTimeout + 120_000);
    const ordered = orderedHandCues;
    const activities = slots.map(slot => pack.activities.find(activity => activity.slot === slot));
    const report = await runCutscenePreview({
      page, cutscene: availableCutscene(id), completionTimeout, testInfo, verifyReplay: true,
      inspectPlayback: async ({ page, report }) => {
        report.handSamples = [];
        for (const [index, sampleFrame] of samples) {
          const activity = activities[index];
          await page.waitForFunction(({ id, frame }) => window.__cutsceneBrowserProbe.activity.id === id
            && window.__cutsceneBrowserProbe.activity.frame >= frame,
          { id: activity.activityId, frame: sampleFrame }, { timeout: completionTimeout });
          const hands = await page.evaluate(() => window.__readCutsceneHands());
          const posedActors = new Set(ordered(activity).map(cue => cue.actorTag));
          expect(hands).toHaveLength(posedActors.size * 2);
          const cues = activities.slice(0, index).flatMap(ordered)
            .concat(ordered(activity).filter(cue => cue.frame <= sampleFrame));
          for (const hand of hands) {
            const applicable = cues.filter(cue => cue.actorTag === hand.actorTag
              && (cue.side === hand.side || cue.channel === 2 || cue.channel === (hand.side === "right" ? 0 : 1)));
            const latest = applicable.filter(cue => cue.poseTableOffset || cue.releaseDetailed).at(-1);
            const detailed = Boolean(latest?.poseTableOffset);
            expect(hand.detailed).toBe(detailed);
            expect(hand.enabled).toBe(detailed);
            if (detailed) expect(hand.pose).toEqual(Array.from(nativeHandPoseTarget(pack.nativeHandPoseTables[latest.poseTableOffset].vectors)));
            const bodyCue = applicable.filter(cue => cue.targetIndex != null).at(-1);
            expect(hand.bodyPose).toEqual(nativeMhndTargetWords(bodyCue.targetIndex, hand.side === "right" ? 0 : 1).map(signedNativeMhndWord));
          }
          report.handSamples.push({ index, sampleFrame, hands });
          await page.screenshot({ path: testInfo.outputPath(`hands-${index}-${sampleFrame}.png`),
            style: "#dialogue-overlay, #dialogue-controls-hud { visibility: hidden !important; }" });
        }
      },
    });
    const expected = activities.flatMap(ordered).map(handCommandTuple);
    expect(report.probe.handCommands.slice(0, expected.length).map(command =>
      [command.name, command.actorTag, command.side ?? null, command.poseTableOffset ?? null])).toEqual(expected);
    expect(report.probe.handCommands.every(command => command.accepted)).toBe(true);
  });
}

test("SAKR animates Iwao and young Ryo hands at their authored frames", async ({ page }, testInfo) => {
  const id = "S1-SAKR-01";
  const completionTimeout = completionTimeoutForCutscene(id);
  test.setTimeout(completionTimeout + 120_000);
  const activity = sakr.activities[0];
  const report = await runCutscenePreview({
    page, cutscene: availableCutscene(id), completionTimeout, testInfo, verifyReplay: true,
    inspectPlayback: async ({ page, report }) => {
      report.handSamples = [];
      for (const sampleFrame of [30, 275, 805, 895, 955, 1220, 1310]) {
        await page.waitForFunction(frame => window.__cutsceneBrowserProbe.activity.frame >= frame,
          sampleFrame, { timeout: completionTimeout });
        const hands = await page.evaluate(() => window.__readCutsceneHands());
        expect(hands).toHaveLength(4);
        for (const hand of hands) {
          const body = activity.nativeBodyHandPoseCues.filter(cue => cue.actorTag === hand.actorTag
            && cue.frame <= sampleFrame && cue.channel === (hand.side === "right" ? 0 : 1)).at(-1);
          expect(hand.bodyPose).toEqual(nativeMhndTargetWords(body.targetIndex, body.channel).map(signedNativeMhndWord));
          const cue = activity.nativeHandPoseCues.filter(cue => cue.frame <= sampleFrame
            && cue.actorTag === hand.actorTag && cue.side === hand.side).at(-1);
          expect(hand.detailed).toBe(Boolean(cue));
          expect(hand.enabled).toBe(Boolean(cue));
          if (cue) expect(hand.pose).toEqual(Array.from(nativeHandPoseTarget(sakr.nativeHandPoseTables[cue.poseTableOffset].vectors)));
        }
        report.handSamples.push({ sampleFrame, hands });
        await page.screenshot({ path: testInfo.outputPath(`hands-${sampleFrame}.png`),
          style: "#dialogue-overlay, #dialogue-controls-hud { visibility: hidden !important; }" });
        if (sampleFrame === 955 && process.env.E2E_HAND_SURFACE_DIAGNOSTICS === "true") {
          report.handSurfaceIsolation = await page.evaluate(() => window.__setCutsceneHandBodyVisible("JAKR", "right", false));
          try {
            await page.screenshot({ path: testInfo.outputPath("hands-955-detailed-only.png"),
              style: "#dialogue-overlay, #dialogue-controls-hud { visibility: hidden !important; }" });
          } finally {
            await page.evaluate(() => window.__setCutsceneHandBodyVisible("JAKR", "right", true));
          }
        }
      }
    },
  });
  const expected = orderedHandCues(activity).map(handCommandTuple);
  expect(report.probe.handCommands.slice(0, expected.length).map(command =>
    [command.name, command.actorTag, command.side ?? null, command.poseTableOffset ?? null])).toEqual(expected);
  expect(report.probe.handCommands.every(command => command.accepted)).toBe(true);
});

test("CATA1 retains Ryo's grips and Megumi's body hands through all three shots", async ({ page }, testInfo) => {
  const id = "S1-CATA1-01";
  const completionTimeout = completionTimeoutForCutscene(id);
  test.setTimeout(completionTimeout + 120_000);
  const report = await runCutscenePreview({
    page, cutscene: availableCutscene(id), completionTimeout, testInfo, verifyReplay: true,
    inspectPlayback: async ({ page, report }) => {
      report.handSamples = [];
      for (const [index, sampleFrame] of [[0, 675], [1, 165], [2, 80], [2, 180]]) {
        const activity = cata1.activities[index];
        await page.waitForFunction(({ id, frame }) => window.__cutsceneBrowserProbe.activity.id === id
          && window.__cutsceneBrowserProbe.activity.frame >= frame,
        { id: activity.activityId, frame: sampleFrame }, { timeout: completionTimeout });
        const hands = await page.evaluate(() => window.__readCutsceneHands());
        expect(hands).toHaveLength(4);
        for (const hand of hands) {
          const body = activity.nativeBodyHandPoseCues.filter(cue => cue.actorTag === hand.actorTag
            && cue.frame <= sampleFrame && (cue.channel === 2 || cue.channel === (hand.side === "right" ? 0 : 1))).at(-1);
          expect(hand.bodyPose).toEqual(nativeMhndTargetWords(body.targetIndex, hand.side === "right" ? 0 : 1)
            .map(signedNativeMhndWord));
          expect(hand.detailed).toBe(hand.actorTag === "AKIR");
          if (hand.actorTag === "AKIR") {
            const cue = activity.nativeHandPoseCues.filter(cue => cue.frame <= sampleFrame && cue.side === hand.side).at(-1);
            expect(hand.pose).toEqual(Array.from(nativeHandPoseTarget(cata1.nativeHandPoseTables[cue.poseTableOffset].vectors)));
          }
        }
        const props = await page.evaluate(() => window.__readCutscenePropPresentation());
        const cloth = await page.evaluate(() => window.__readCutsceneCloth());
        const skirt = cloth.find(state => state.modelCode === "SIA_L");
        expect(skirt.active).toBe(true);
        expect(skirt.runtimeSeconds).toBeGreaterThan(0);
        expect(skirt.groups).toHaveLength(1);
        expect(skirt.groups[0].simulated).toBe(true);
        expect(skirt.groups[0].positions).toHaveLength(24);
        report.handSamples.push({ activityId: activity.activityId, sampleFrame, hands, props, cloth });
        if (index === 1) for (const tag of ["NBO1", "NBO2", "NBO3"]) {
          const prop = props.find(prop => prop.actorTag === tag);
          expect(prop.borrowedSceneObject).toBe(true);
          expect(prop.rootId).toBe(prop.sceneRootId);
          // Native FIXO at 0x24532/0x24564/0x245a4 keeps all three fish on
          // AKIR and changes his hand controller from 18 to 12 at frame 140.
          expect(prop.attachment.binding.parentActorTag).toBe("AKIR");
          expect(prop.attachment.binding.controlId).toBe(12);
        }
        await page.screenshot({ path: testInfo.outputPath(`hands-${index}-${sampleFrame}.png`),
          style: "#dialogue-overlay, #dialogue-controls-hud { visibility: hidden !important; }" });
      }
    },
  });
  const expected = cata1.activities.flatMap(orderedHandCues).map(handCommandTuple);
  expect(report.probe.handCommands.slice(0, expected.length).map(command =>
    [command.name, command.actorTag, command.side ?? null, command.poseTableOffset ?? null])).toEqual(expected);
  expect(report.probe.handCommands.every(command => command.accepted)).toBe(true);
});

for (const [index, activity] of d0w0.activities.entries()) {
  const id = `S1-D0W0-${String(index + 1).padStart(2, "0")}`;
  test(`${id} applies authored hand helpers and body handoffs`, async ({ page }, testInfo) => {
    const completionTimeout = completionTimeoutForCutscene(id);
    test.setTimeout(completionTimeout + 120_000);
    const report = await runCutscenePreview({
      page, cutscene: availableCutscene(id), completionTimeout, testInfo,
      verifyReplay: id === "S1-D0W0-07",
      inspectPlayback: async ({ page, report }) => {
        const cues = [...activity.nativeHandPoseCues, ...activity.nativeBodyHandPoseCues]
          .sort((a, b) => a.frame - b.frame || a.sourceOrder - b.sourceOrder);
        const sampleFrames = [...new Set([Math.max(30, cues[0].frame + 20),
          ...activity.nativeBodyHandPoseCues.filter(cue => cue.frame > 0).map(cue => cue.frame + 20)])];
        report.handSamples = [];
        for (const sampleFrame of sampleFrames) {
          await page.waitForFunction(frame => window.__cutsceneBrowserProbe.activity.frame >= frame,
            sampleFrame, { timeout: completionTimeout });
          const hands = await page.evaluate(() => window.__readCutsceneHands());
          expect(hands).toHaveLength(4);
          for (const hand of hands) {
            expect(hand.bodyPose).toEqual(nativeMhndTargetWords(8, hand.side === "right" ? 0 : 1)
              .map(signedNativeMhndWord));
            const cue = cues.filter(cue => cue.frame <= sampleFrame && cue.actorTag === hand.actorTag
              && (cue.side === hand.side || cue.channel === 2
                || cue.channel === (hand.side === "right" ? 0 : 1))).at(-1);
            const detailed = Boolean(cue?.poseTableOffset);
            expect(hand.detailed).toBe(detailed);
            expect(hand.enabled).toBe(detailed);
            if (detailed) expect(hand.pose).toEqual(Array.from(nativeHandPoseTarget(
              d0w0.nativeHandPoseTables[cue.poseTableOffset].vectors)));
          }
          report.handSamples.push({ sampleFrame, hands });
          await page.screenshot({ path: testInfo.outputPath(`hands-${sampleFrame}.png`),
            style: "#dialogue-overlay, #dialogue-controls-hud { visibility: hidden !important; }" });
        }
      },
    });
    const expected = orderedHandCues(activity).map(handCommandTuple);
    expect(report.probe.handCommands.slice(0, expected.length).map(command =>
      [command.name, command.actorTag, command.side ?? null, command.poseTableOffset ?? null])).toEqual(expected);
    expect(report.probe.handCommands.every(command => command.accepted)).toBe(true);
  });
}

test("Phoenix Mirror applies the native hand poses to both actors", async ({ page }, testInfo) => {
  const cutscene = availableCutscene("S1-HOUO-01");
  const completionTimeout = completionTimeoutForCutscene(cutscene.id);
  test.setTimeout(completionTimeout + 120_000);
  await runCutscenePreview({
    page, cutscene, completionTimeout, testInfo,
    inspectPlayback: async ({ page, report }) => {
      await expect.poll(() => page.evaluate(() => window.__readCutsceneHands().length)).toBe(4);
      const hands = await page.evaluate(() => window.__readCutsceneHands());
      report.handPresentation = hands;
      for (const hand of hands) {
        expect(hand.detailed).toBe(true);
        expect(hand.enabled).toBe(true);
        expect(hand.nonzeroPoseWords).toBeGreaterThan(0);
        const table = hand.actorTag === "AKIR" && hand.side === "right" ? "0x5d35c" : "0x5ca74";
        expect(hand.pose).toEqual(Array.from(nativeHandPoseTarget(manifest.nativeHandPoseTables[table].vectors)));
      }
      await page.screenshot({ path: testInfo.outputPath("native-hand-poses.png") });
    },
  });
});

for (const [index, activity] of training.activities.entries()) {
  const id = `S1-JHW0-${String(index + 1).padStart(2, "0")}`;
  test(`${id} preserves authored finger changes through full playback`, async ({ page }, testInfo) => {
    const cutscene = availableCutscene(id);
    const completionTimeout = completionTimeoutForCutscene(id);
    test.setTimeout(completionTimeout + 120_000);
    const report = await runCutscenePreview({
      page, cutscene, completionTimeout, testInfo,
      inspectPlayback: async ({ page, report }) => {
        const initial = await page.evaluate(() => window.__readCutsceneHands());
        expect(initial).toHaveLength(4);
        const cue = activity.nativeHandPoseCues.find(cue => cue.frame > 0);
        const sampleFrame = cue.frame + Math.ceil(cue.durationNativeTicks / 2) + 3;
        await page.waitForFunction(frame => window.__cutsceneBrowserProbe.activity.frame >= frame,
          sampleFrame, { timeout: completionTimeout });
        const changed = await page.evaluate(() => window.__readCutsceneHands());
        report.handTransition = { initial, changed, sampleFrame };
        for (const hand of changed) {
          expect(hand.detailed).toBe(true);
          expect(hand.enabled).toBe(true);
          const target = activity.nativeHandPoseCues.filter(cue => cue.actorTag === hand.actorTag
            && cue.side === hand.side && cue.frame <= sampleFrame).at(-1);
          expect(hand.pose).toEqual(Array.from(nativeHandPoseTarget(training.nativeHandPoseTables[target.poseTableOffset].vectors)));
        }
        expect(changed.some((hand, i) => JSON.stringify(hand.pose) !== JSON.stringify(initial[i].pose))).toBe(true);
        await page.screenshot({ path: testInfo.outputPath("changed-hand-pose.png"),
          style: "#dialogue-overlay, #dialogue-controls-hud { visibility: hidden !important; }" });
      },
    });
    const commands = report.probe.handCommands.filter(command => command.name === "hand-pose");
    expect(commands).toHaveLength(activity.nativeHandPoseCues.length);
    expect(commands.every(command => command.accepted)).toBe(true);
  });
}

for (const [id, pack, slot, sampleFrame] of [
  ["S1-MSKA-01", mska, 0, 40],
  ["S1-KAKG-01", kakg, 2, 1330],
  ["S1-KAKG-02", kakg, 3, 40],
  ["S1-TGMA-01", tgma, 0, 735],
]) {
  test(`${id} retains its dialogue hand setup and authored overrides`, async ({ page }, testInfo) => {
    const activity = pack.activities.find(activity => activity.slot === slot);
    const cutscene = availableCutscene(id);
    const completionTimeout = completionTimeoutForCutscene(id);
    test.setTimeout(completionTimeout + 120_000);
    const report = await runCutscenePreview({
      page, cutscene, completionTimeout, testInfo, verifyReplay: id === "S1-KAKG-02",
      inspectPlayback: async ({ page, report }) => {
        await page.waitForFunction(frame => window.__cutsceneBrowserProbe.activity.frame >= frame,
          sampleFrame, { timeout: completionTimeout });
        const hands = await page.evaluate(() => window.__readCutsceneHands());
        report.handPresentation = hands;
        expect(hands).toHaveLength(4);
        for (const hand of hands) {
          expect(hand.detailed).toBe(true);
          expect(hand.enabled).toBe(true);
          const target = activity.nativeHandPoseCues.filter(cue => cue.frame <= sampleFrame
            && cue.actorTag === hand.actorTag && cue.side === hand.side).at(-1);
          expect(hand.pose).toEqual(Array.from(nativeHandPoseTarget(pack.nativeHandPoseTables[target.poseTableOffset].vectors)));
        }
        await page.screenshot({ path: testInfo.outputPath("dialogue-hand-poses.png"),
          style: "#dialogue-overlay, #dialogue-controls-hud { visibility: hidden !important; }" });
      },
    });
    const commands = report.probe.handCommands.filter(command => command.name === "hand-pose");
    expect(commands.slice(0, activity.nativeHandPoseCues.length).map(command =>
      [command.actorTag, command.side, command.poseTableOffset])).toEqual(activity.nativeHandPoseCues.map(cue =>
      [cue.actorTag, cue.side, cue.poseTableOffset]));
    expect(commands.every(command => command.accepted)).toBe(true);
  });
}
