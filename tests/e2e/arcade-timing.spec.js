import { expect, test } from "@playwright/test";

async function measureCoreRate(page) {
  return page.evaluate(async () => {
    const manager = window.EJS_emulator.gameManager;
    const frame = manager.getFrameNum();
    const start = performance.now();
    await new Promise(resolve => setTimeout(resolve, 2000));
    return {
      refreshRate: window.__arcadeTestRefreshRate,
      fps: (manager.getFrameNum() - frame) * 1000 / (performance.now() - start),
    };
  });
}

// Exercise the shipped WASM core, not a JavaScript approximation of its loop.
// Control display callbacks and audio permission while measuring real elapsed
// time and native frame counts. The audio context is real, held suspended until
// a gesture: headless Chromium may otherwise waive its autoplay policy.
for (const game of ["harrier", "astrob"]) {
  test(`${game} keeps its native speed across display refresh rates`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.addInitScript(() => {
      window.__arcadeTestAudioContexts = [];
      window.__arcadeTestAllowAudio = false;
      const NativeAudioContext = window.AudioContext;
      window.AudioContext = class extends NativeAudioContext {
        constructor(options) {
          super(options);
          this.suspend();
          window.__arcadeTestAudioContexts.push(this);
        }
        resume() {
          return window.__arcadeTestAllowAudio ? super.resume() : new Promise(() => {});
        }
      };
      window.__arcadeTestRefreshRate = 60;
      window.requestAnimationFrame = callback => window.setTimeout(
        () => callback(performance.now()),
        1000 / window.__arcadeTestRefreshRate,
      );
      window.cancelAnimationFrame = id => window.clearTimeout(id);
    });
    await page.goto(`/arcade/emulator.html?game=${game}`);
    await page.waitForFunction(() => window.EJS_emulator?.started
      && window.EJS_emulator.gameManager.getFrameNum() > 20);
    expect(await page.evaluate(() => window.__arcadeTestAudioContexts.map(c => c.state))).toEqual(["suspended"]);
    const samples = [];
    for (const refreshRate of [60, 120, 144, 240]) {
      await page.evaluate(rate => { window.__arcadeTestRefreshRate = rate; }, refreshRate);
      const sample = await measureCoreRate(page);
      samples.push(sample);
      console.info(`[Arcade timing] ${game}: ${sample.refreshRate} Hz -> ${sample.fps.toFixed(2)} core frames/s`);
    }
    // Old persisted settings can still enable display sync. The core's own
    // clock must cap speed in that case too, without clearing player settings.
    await page.evaluate(() => window.EJS_emulator.gameManager.setVSync(true));
    samples.push({ ...await measureCoreRate(page), phase: "saved-vsync-enabled" });
    await page.evaluate(() => window.EJS_emulator.gameManager.setVSync(false));

    await page.evaluate(() => window.addEventListener("pointerdown", () => {
      window.__arcadeTestAllowAudio = true;
      window.__newYokosukaActivateArcadeAudio();
    }, { once: true }));
    await page.mouse.click(30, 30);
    await page.waitForFunction(() => window.__arcadeTestAudioContexts.every(c => c.state === "running"));
    samples.push({ ...await measureCoreRate(page), phase: "audio-running" });

    const pausedFrames = await page.evaluate(async () => {
      const emulator = window.EJS_emulator;
      emulator.pause();
      const frame = emulator.gameManager.getFrameNum();
      await new Promise(resolve => setTimeout(resolve, 200));
      const elapsed = emulator.gameManager.getFrameNum() - frame;
      emulator.play();
      return elapsed;
    });
    expect(pausedFrames).toBe(0);
    samples.push({ ...await measureCoreRate(page), phase: "resumed" });
    const managerState = await page.evaluate(() => {
      // RetroArch normalizes booleans to quoted strings when saving config.
      const text = window.EJS_emulator.gameManager.FS.readFile(
        "/home/web_user/.config/retroarch/retroarch.cfg", { encoding: "utf8" },
      );
      return {
        config: Object.fromEntries([...text.matchAll(
          /^(audio_sync|video_vsync|vrr_runloop_enable) = "?([^"\n]+)"?$/gm,
        )].map(([, key, value]) => [key, value])),
        errors: window.__newYokosukaArcadeErrors,
      };
    });
    expect(managerState.errors).toEqual([]);
    expect(managerState.config).toEqual({
      audio_sync: "false", video_vsync: "false", vrr_runloop_enable: "true",
    });
    await testInfo.attach("arcade-frame-rates", {
      body: JSON.stringify({ samples, ...managerState }, null, 2),
      contentType: "application/json",
    });
    for (const sample of samples) {
      expect(sample.fps, sample.phase || `${sample.refreshRate} Hz display`).toBeGreaterThan(50);
      expect(sample.fps, sample.phase || `${sample.refreshRate} Hz display`).toBeLessThan(70);
    }
    await page.screenshot({ path: testInfo.outputPath(`${game}.png`) });
  });
}
