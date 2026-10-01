import { expect, test } from "@playwright/test";
import { availableCutscene } from "../../play/config/cutscenes.js";
import { runCutscenePreview } from "./cutscene-preview-flow.js";

test("opening narration finishes across cuts without truncated voice clips", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    const BrowserAudio = window.Audio;
    window.__voicePlayback = [];
    window.Audio = class extends BrowserAudio {
      constructor(source) {
        super(source);
        if (!String(source).includes("/audio/world/op02/voice/")) return;
        const record = { source, events: [] };
        window.__voicePlayback.push(record);
        for (const kind of ["playing", "pause", "ended", "error"]) {
          this.addEventListener(kind, () => record.events.push({ kind,
            time: this.currentTime, duration: this.duration,
            shot: window.__cutsceneBrowserProbe?.activity?.id }));
        }
      }
    };
  });
  await runCutscenePreview({ page, cutscene: availableCutscene("S1-OP02-00"),
    completionTimeout: 150_000, testInfo });
  const voices = await page.evaluate(() => window.__voicePlayback);
  await testInfo.attach("voice-lifetimes", { body: JSON.stringify(voices, null, 2), contentType: "application/json" });
  expect(voices).toHaveLength(10);
  for (const voice of voices) {
    const ended = voice.events.filter(event => event.kind === "ended");
    expect(ended, voice.source).toHaveLength(1);
    expect(voice.events.filter(event => event.kind === "error"), voice.source).toHaveLength(0);
    expect(ended[0].time).toBeCloseTo(ended[0].duration, 1);
    expect(voice.events.filter(event => event.kind === "pause" && event.time < event.duration - 0.1), voice.source).toHaveLength(0);
  }
  for (const id of ["A0100B005", "A0100B007", "A0100B010"]) {
    const events = voices.find(voice => voice.source.includes(id)).events;
    expect(events.find(event => event.kind === "ended").shot)
      .not.toBe(events.find(event => event.kind === "playing").shot);
  }
});

test("murder opening has its native score during the initial gate approach", async ({ page }, testInfo) => {
  test.setTimeout(210_000);
  await runCutscenePreview({ page, cutscene: availableCutscene("S1-000"),
    expectedMusicTrack: "op00-open1", verifyMusicAcrossActivities: false,
    sampleOnly: true, completionTimeout: 15_000, testInfo,
    inspectPlayback: async ({ page, report }) => {
      expect(report.musicStartActivity.id).toBe("OP00/SEQDATA0.AUTH");
      const before = await page.evaluate(() => window.__readCutsceneMusic().time);
      await page.keyboard.press("Space");
      // A normal five seconds of playback must not satisfy the seek check.
      await expect.poll(() => page.evaluate(() => window.__readCutsceneMusic().time), {
        timeout: 2_000,
      }).toBeGreaterThan(before + 4.5);
    },
  });
});

test("opening vision music continues between shots and stops on cancel", async ({ page }, testInfo) => {
  test.setTimeout(210_000);
  await runCutscenePreview({
    page,
    cutscene: availableCutscene("S1-OP02-00"),
    expectedMusicTrack: "bgm019",
    sampleOnly: true,
    completionTimeout: 15_000,
    testInfo,
  });
});

test("kitten music continues between shots and stops on cancel", async ({ page }, testInfo) => {
  test.setTimeout(210_000);
  await runCutscenePreview({
    page,
    cutscene: availableCutscene("S1-CATA1-01"),
    expectedMusicTrack: "bgm051",
    sampleOnly: true,
    completionTimeout: 15_000,
    testInfo,
  });
});
