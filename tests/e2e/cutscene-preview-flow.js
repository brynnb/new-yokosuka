import { expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";

export async function runCutscenePreview({
  page,
  cutscene,
  completionTimeout,
  sampleOnly = false,
  expectedMusicTrack = null,
  verifyMusicAcrossActivities = true,
  inspectPlayback = null,
  testInfo = null,
}) {
  const browserErrors = [];
  const failedResources = [];
  const report = {
    cutsceneId: cutscene.id,
    label: cutscene.label,
    mode: sampleOnly ? "launch-progress-cancel" : "complete-playback",
    reachedPlayback: false,
    advanced: false,
    returnedToMenu: false,
    navigations: [],
    authRequests: [],
    expectedAborts: [],
    mediaRequests: [],
    verifiedMediaRangeAborts: [],
    browserErrors,
    failedResources,
  };
  const runtimeModuleUrls = {};
  const mediaRequests = new Map();
  let cancelling = false;
  const stage = value => {
    report.stage = value;
    if (testInfo) console.info(`[cutscene ${cutscene.id}] ${value}`);
  };
  page.on("framenavigated", frame => {
    if (frame === page.mainFrame()) report.navigations.push(frame.url());
  });
  page.on("request", request => {
    if (request.resourceType() === "media") {
      const record = { url: request.url(), range: request.headers().range, stage: report.stage };
      mediaRequests.set(request, record);
      report.mediaRequests.push(record);
    }
    if (/\.AUTH(?:[?#]|$)/i.test(request.url())) report.authRequests.push(request.url());
    const pathname = new URL(request.url()).pathname;
    if ([
      "/play/events/NativeAseqActivityRuntime.js",
      "/play/cutscenes/NativeCutsceneDirector.js",
      "/play/audio/MusicDirector.js",
      "/play/characters/ScheduledActorRuntime.js",
      "/src/state.js",
      "/play/world/WorldEnvironmentRuntime.js",
    ].includes(pathname)) runtimeModuleUrls[pathname] = request.url();
  });
  page.on("pageerror", error => {
    browserErrors.push(`pageerror: ${error.message}`);
  });
  page.on("console", message => {
    if (message.type() !== "error") return;
    // The account shell polls its optional status endpoint. A plain Vite
    // preview deliberately has no backend, so this is not a cutscene failure.
    if (message.text().startsWith("Failed to load resource:")) return;
    // Babylon VideoTexture reports Chrome's expected AbortError as an error
    // when an attract-screen video is paused during world teardown. It is not
    // a thrown page error and is unrelated to cutscene playback.
    if (
      message.text().startsWith("BJS - ")
      && message.text().includes(
        "The play() request was interrupted by a call to pause().",
      )
    ) return;
    const location = message.location();
    const source = location.url
      ? ` (${location.url}:${location.lineNumber}:${location.columnNumber})`
      : "";
    browserErrors.push(`console: ${message.text()}${source}`);
  });
  page.on("response", response => {
    const media = mediaRequests.get(response.request());
    if (media) {
      media.status = response.status();
      media.contentRange = response.headers()["content-range"];
    }
    if (
      response.status() >= 400 &&
      !response.url().endsWith("/api/status")
    ) {
      failedResources.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on("requestfailed", request => {
    if (new URL(request.url()).pathname === "/api/status") return;
    const failure = request.failure()?.errorText || "network failure";
    const media = mediaRequests.get(request);
    if (media) { media.failure = failure; media.failureStage = report.stage; }
    // Cancellation intentionally aborts outstanding requests. Keep genuine
    // startup/network failures, which the HTTP response listener cannot see.
    if (failure === "net::ERR_ABORTED" && (
      cancelling || /\/music\/shenmue-main-menu\.ogg$/.test(new URL(request.url()).pathname)
    )) {
      // Disposing the menu cancels its streaming music, independently of the
      // selected cutscene. Retain the evidence but do not label it asset loss.
      report.expectedAborts.push(request.url());
      return;
    }
    failedResources.push(`${failure} ${request.url()}`);
  });

  try {
    stage("opening-menu");
    await page.goto("/play/");
    const introPrompt = page.getByLabel("Open the New Yokosuka menu");
    // Headed runs can receive a real key while the splash is mounting. Either
    // valid entry state is fine; do not wait for a prompt already dismissed.
    await expect(introPrompt.or(page.locator(".account-shell-welcome"))).toBeVisible({ timeout: 120_000 });
    // The production prompt listens at window capture level and removes itself
    // immediately. Keyboard input exercises that path without retrying a click
    // against the intentionally disappearing element.
    if (await introPrompt.isVisible()) await page.keyboard.press("Enter");
    // Previews are internal-only: enter the existing selector through the dev
    // module, without reintroducing a public button or a production debug hook.
    await page.evaluate(async (moduleUrls) => {
      const { useAccountStore } = await import('/play/account/react/accountStore.js');
      const activityUrl = moduleUrls["/play/events/NativeAseqActivityRuntime.js"];
      const directorUrl = moduleUrls["/play/cutscenes/NativeCutsceneDirector.js"];
      if (!activityUrl || !directorUrl) throw new Error("Cutscene runtime modules were not observed loading");
      // Preserve Vite's versioned module URLs: importing a bare path after a
      // code edit can create a second class that the application never uses.
      const { NativeAseqActivityRuntime } = await import(activityUrl);
      const { NativeCutsceneDirector } = await import(directorUrl);
      // Observe the real adapters without replacing their results or rendering.
      // Program transport intentionally has no aggregate elapsed-time field;
      // counting actual accepted AUTH updates avoids relying on that debug UI.
      const probe = window.__cutsceneBrowserProbe = {
        acceptedUpdates: 0, activity: null, events: [], musicEvents: [], scheduledActorSelections: [], scheduledActorPreparations: [],
      };
      const scheduledUrl = moduleUrls["/play/characters/ScheduledActorRuntime.js"];
      if (!scheduledUrl) throw new Error("Scheduled actor runtime module was not observed loading");
      const { ScheduledActorRuntime } = await import(scheduledUrl);
      const prepareActors = ScheduledActorRuntime.prototype.prepareActivityActors;
      ScheduledActorRuntime.prototype.prepareActivityActors = async function(codes, options) {
        const records = this.entries.filter(entry => codes.includes(entry.definition.actorCode)).map(entry => ({
          actorCode: entry.definition.actorCode, modelCode: entry.definition.modelCode,
          loadedBefore: [...entry.models.keys()],
        }));
        const accepted = await prepareActors.call(this, codes, options);
        for (const record of records) {
          const entry = this.entries.find(entry => entry.definition.actorCode === record.actorCode);
          record.loadedAfter = [...entry.models.keys()];
        }
        probe.scheduledActorPreparations.push(...records);
        return accepted;
      };
      const beginActors = ScheduledActorRuntime.prototype.beginActivityActors;
      let selectedActorRuntime = null;
      ScheduledActorRuntime.prototype.beginActivityActors = function(owner, codes) {
        selectedActorRuntime = this;
        const records = this.entries.filter(entry => codes.includes(entry.definition.actorCode)).map(entry => ({
          actorCode: entry.definition.actorCode,
          instanceId: entry.definition.instanceId,
          modelCode: entry.definition.modelCode,
          activityOnly: Boolean(entry.definition.activityOnly),
          authoritative: Boolean(entry.definition.authoritative),
          loadedModels: [...entry.models.keys()],
          pendingModels: [...entry.pendingModels.keys()],
          defaultModel: entry.defaultModel?.modelCode || null,
          enabledModels: [...entry.models.values()].filter(model => model.root.isEnabled()).map(model => model.modelCode),
        }));
        probe.scheduledActorSelections.push(...records);
        return beginActors.call(this, owner, codes);
      };
      window.__readCutsceneActorPresentation = () => selectedActorRuntime ? {
        cameraFadeEnabled: selectedActorRuntime.getCameraFadeEnabled?.() !== false,
        actors: selectedActorRuntime.entries.filter(entry => entry.activityPresentation).map(entry => ({
          actorCode: entry.definition.actorCode,
          models: [...entry.models.values()].filter(model => model.root.isEnabled()).map(model => ({
            modelCode: model.modelCode,
            cameraFaded: Boolean(model.cameraFadeState),
            materials: [...new Set(model.renderMeshes.map(mesh => mesh.material))].filter(Boolean)
              .map(material => ({ name: material.name, alpha: material.alpha })),
          })),
        })),
      } : null;
      const musicUrl = moduleUrls["/play/audio/MusicDirector.js"];
      if (!musicUrl) throw new Error("Music runtime module was not observed loading");
      const { PlayMusicDirector } = await import(musicUrl);
      let musicOwner = null;
      let musicEntry = null;
      const playMusic = PlayMusicDirector.prototype.playTemporaryTrack;
      PlayMusicDirector.prototype.playTemporaryTrack = function(trackId, options) {
        const accepted = playMusic.call(this, trackId, options);
        probe.musicEvents.push({ event: "start", trackId, accepted });
        if (accepted) { musicOwner = this; musicEntry = this.current; }
        return accepted;
      };
      const stopMusic = PlayMusicDirector.prototype.stopTemporaryTrack;
      PlayMusicDirector.prototype.stopTemporaryTrack = function(trackId) {
        const accepted = stopMusic.call(this, trackId);
        probe.musicEvents.push({ event: "stop", trackId, accepted });
        return accepted;
      };
      window.__readCutsceneMusic = () => musicEntry ? {
        trackId: musicEntry.trackId,
        current: musicOwner.current === musicEntry,
        time: musicEntry.audio.currentTime,
        readyState: musicEntry.audio.readyState,
        paused: musicEntry.audio.paused,
        muted: musicEntry.audio.muted,
        volume: musicEntry.audio.volume,
        error: musicEntry.audio.error?.message || null,
        src: musicEntry.audio.currentSrc,
      } : null;
      const update = NativeAseqActivityRuntime.prototype.updateActivity;
      NativeAseqActivityRuntime.prototype.updateActivity = function(detail) {
        const result = update.call(this, detail);
        if (result === true) {
          probe.acceptedUpdates += 1;
          probe.activity = {
            id: detail.activityId, frame: detail.currentFrame,
            durationFrames: detail.durationFrames,
          };
        }
        return result;
      };
      const start = NativeCutsceneDirector.prototype.start;
      NativeCutsceneDirector.prototype.start = async function(cutscene, options) {
        probe.events.push({ event: "start", id: cutscene.id });
        try {
          const result = await start.call(this, cutscene, options);
          probe.events.push({ event: "start-result", result });
          return result;
        } catch (error) {
          probe.events.push({ event: "start-error", message: error.message });
          throw error;
        }
      };
      const stop = NativeCutsceneDirector.prototype.stop;
      NativeCutsceneDirector.prototype.stop = function(reason) {
        probe.events.push({ event: "stop", reason });
        return stop.call(this, reason);
      };
      useAccountStore.getState().controller.showCutscenes();
    }, runtimeModuleUrls);

    const cutsceneOption = page.locator(
      `[data-cutscene-id="${cutscene.id}"]`,
    );
    await expect(cutsceneOption).toHaveCount(1);
    await cutsceneOption.click();
    stage("loading-scene");
    await page.locator(".account-footer-actions button.primary").click();

    const cutsceneMenu = page.locator(".account-shell-cutscenes");
    await expect(cutsceneMenu).toBeHidden({ timeout: 120_000 });
    const launchStarted = Date.now();
    // A menu disappearing and reappearing can also mean startup failed. Require
    // the real presentation lease and a changing transport before calling this
    // a playback pass; no no-op actor or camera adapters are used here.
    const launchOutcome = await Promise.race([
      page.locator("body.cutscene-active").waitFor({ state: "attached", timeout: 120_000 })
        .then(() => "playing"),
      cutsceneMenu.waitFor({ state: "visible", timeout: 120_000 })
        .then(() => "returned-to-menu-before-playback"),
    ]);
    report.launchOutcome = launchOutcome;
    report.returnedToMenu = launchOutcome === "returned-to-menu-before-playback";
    expect(launchOutcome, `Launch ${cutscene.id}; ${browserErrors.join("\n")}`).toBe("playing");
    report.reachedPlayback = true;
    stage("playing");
    report.launchMs = Date.now() - launchStarted;
    const initialUpdates = await page.evaluate(() => window.__cutsceneBrowserProbe.acceptedUpdates);
    await expect.poll(() => page.evaluate(() => window.__cutsceneBrowserProbe.acceptedUpdates), {
      timeout: 15_000, message: `${cutscene.id} timeline advances`,
    }).toBeGreaterThan(initialUpdates);
    report.advanced = true;
    report.activity = await page.evaluate(() => window.__cutsceneBrowserProbe.activity);
    if (expectedMusicTrack) {
      await expect.poll(() => page.evaluate(() => window.__readCutsceneMusic()), {
        timeout: 15_000, message: "Authored cutscene music actually plays",
      }).toMatchObject({ trackId: expectedMusicTrack, current: true, paused: false, muted: false, error: null });
      await expect.poll(() => page.evaluate(() => window.__readCutsceneMusic()?.time), {
        timeout: 15_000,
      }).toBeGreaterThan(0.5);
      report.musicAtStart = await page.evaluate(() => window.__readCutsceneMusic());
      expect(report.musicAtStart.volume).toBeGreaterThan(0);
    }
    if (expectedMusicTrack && verifyMusicAcrossActivities) {
      // A successful play() is insufficient: cross an actual shot boundary
      // and verify the same stream continues, rather than restarting per AUTH.
      await expect.poll(() => page.evaluate(() => window.__cutsceneBrowserProbe.activity?.id), {
        // AUTH duration is authored at 30 frames/second. Some first segments
        // (notably CATA1) last over a minute; do not mistake that for a stall.
        timeout: Math.max(35_000, report.activity.durationFrames / 30 * 1_000 + 15_000),
      }).not.toBe(report.activity.id);
      report.musicAfterShotChange = await page.evaluate(() => window.__readCutsceneMusic());
      expect(report.musicAfterShotChange).toMatchObject({ trackId: expectedMusicTrack, current: true, paused: false, error: null });
      expect(report.musicAfterShotChange.time).toBeGreaterThan(report.musicAtStart.time);
      expect(await page.evaluate(trackId => window.__cutsceneBrowserProbe.musicEvents.filter(
        event => event.event === "start" && event.trackId === trackId,
      ).length, expectedMusicTrack)).toBe(1);
    }
    if (inspectPlayback) await inspectPlayback({ page, report, runtimeModuleUrls });
    if (testInfo) {
      const path = testInfo.outputPath("first-playback-frame.png");
      await page.screenshot({ path });
      await testInfo.attach("cutscene-first-playback-frame", {
        path, contentType: "image/png",
      });
    }
    if (sampleOnly) {
      // Observe several rendered seconds, not just the first ownership change.
      await page.waitForTimeout(3_000);
      report.activityAfterSample = await page.evaluate(() => window.__cutsceneBrowserProbe.activity);
      if (testInfo) {
        const path = testInfo.outputPath("sampled-frame.png");
        await page.screenshot({ path });
        await testInfo.attach("cutscene-sampled-frame", {
          path, contentType: "image/png",
        });
      }
      if (expectedMusicTrack) {
        report.musicBeforeExit = await page.evaluate(() => window.__readCutsceneMusic());
        expect(report.musicBeforeExit).toMatchObject({
          trackId: expectedMusicTrack, current: true, paused: false, muted: false, error: null,
        });
        expect(report.musicBeforeExit.time).toBeGreaterThan(report.musicAtStart.time);
        expect(await page.evaluate(trackId => window.__cutsceneBrowserProbe.musicEvents.filter(
          event => event.event === "start" && event.trackId === trackId,
        ).length, expectedMusicTrack)).toBe(1);
      }
      cancelling = true;
      stage("cancelling");
      // Follow the visible configured binding, rather than assuming Escape.
      const cancelKey = await page.locator('#dialogue-controls-hud [data-control-binding="cancel"]').textContent();
      await page.evaluate(() => document.activeElement?.blur());
      await page.keyboard.press(cancelKey.trim());
    }
    await expect(cutsceneMenu).toBeVisible({ timeout: completionTimeout });
    report.returnedToMenu = true;
    stage(sampleOnly ? "cancelled-to-menu" : "completed-to-menu");
    if (expectedMusicTrack) {
      report.musicAfterExit = await page.evaluate(() => window.__readCutsceneMusic());
      expect(report.musicAfterExit).toMatchObject({ current: false, paused: true });
      expect(await page.evaluate(trackId => window.__cutsceneBrowserProbe.musicEvents.filter(
        event => event.event === "stop" && event.trackId === trackId && event.accepted,
      ).length, expectedMusicTrack)).toBe(1);
      // Chrome reads Ogg headers, requests the tail for duration, then resumes
      // a buffered range. These 206 streams can end with ERR_ABORTED despite
      // healthy audio. Classify only this explicitly observed track, AFTER
      // proving playback advanced during the sample, had no media error, and ended
      // under our owner. HTTP errors and unverified media remain failures.
      for (const media of report.mediaRequests) {
        if (media.url !== report.musicAtStart.src
          || media.failure !== "net::ERR_ABORTED"
          || media.status !== 206 || !media.range || !media.contentRange) continue;
        const index = failedResources.indexOf(`${media.failure} ${media.url}`);
        if (index !== -1) {
          failedResources.splice(index, 1);
          report.verifiedMediaRangeAborts.push(media);
        }
      }
    }

    const alerts = await page.locator('[role="alert"]').allTextContents();
    const cutsceneErrors = [...browserErrors, ...failedResources];
    expect(
      cutsceneErrors,
      `Browser errors while playing ${cutscene.id} — ${cutscene.label}:\n${[
        ...browserErrors,
        ...failedResources,
      ].join("\n")}`,
    ).toEqual([]);
    expect(
      alerts,
      `UI errors after playing ${cutscene.id} — ${cutscene.label}:\n${alerts.join("\n")}`,
    ).toEqual([]);
    return report;
  } finally {
    if (testInfo) {
      report.probe = await page.evaluate(() => window.__cutsceneBrowserProbe).catch(() => null);
      const path = testInfo.outputPath("browser-inventory.json");
      await writeFile(path, JSON.stringify(report, null, 2));
      await testInfo.attach("cutscene-browser-inventory", {
        path,
        contentType: "application/json",
      });
    }
  }
}
