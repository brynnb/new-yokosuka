import { expect, test } from "@playwright/test";

test.use({viewport: {width: 390, height: 844}, hasTouch: true});

test("splash tap authorizes reused audio; interruption recovery is visible and cancel safe", async ({page}, testInfo) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/status", route => route.fulfill({json: {}}));
  // Exercise the real account UI and shared backend without loading a world.
  await page.route("**/play/play.js*", route => route.fulfill({contentType: "application/javascript", body: ""}));
  await page.addInitScript(() => {
    localStorage.setItem("new-yokosuka.music-muted", "1");
    window.audioProbe = {block: false};
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function() {
      // Model a renewed OS/browser policy denial on actual players, not a fake
      // audio adapter. Successful playback still goes through the real decoder.
      if (window.audioProbe.block && this.src.includes("audio-probe.wav")) {
        return Promise.reject(new DOMException("simulated mobile interruption", "NotAllowedError"));
      }
      return play.call(this);
    };
  });
  // Deterministic audible PCM fixture: native HTML media must advance its clock.
  const samples = 8000 * 3;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF", 0); wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write("data", 36); wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) wav.writeInt16LE(Math.round(Math.sin(i * Math.PI * 2 * 440 / 8000) * 2000), 44 + i * 2);
  await page.route("**/audio-probe.wav*", route => route.fulfill({contentType: "audio/wav", body: wav}));
  await page.goto("/play/");
  await page.locator(".account-intro-prompt").waitFor();
  await page.evaluate(async () => {
    const {getBrowserAudioPlayback} = await import("/play/audio/BrowserAudioPlayback.js");
    const {createGameAudio} = await import("/play/audio/MediaElementAudio.js");
    window.audioProbe.backend = getBrowserAudioPlayback();
    window.audioProbe.factory = createGameAudio;
    const clip = createGameAudio("/audio-probe.wav", {recovery: "resume"});
    window.audioProbe.clip = clip;
    try { await clip.play(); } catch (error) { window.audioProbe.firstError = error.name; }
  });
  expect(await page.evaluate(() => window.audioProbe.firstError)).toBe("NotAllowedError");
  // Existing force-mounted Settings content hides sibling portals from the
  // accessibility tree even while closed. Include it in the locator only;
  // real taps still verify visibility, stacking and pointer actionability.
  const enable = page.getByRole("button", {name: "Tap to enable sound", includeHidden: true});
  await expect(enable).toBeVisible();
  await page.locator(".account-intro-prompt").tap();
  await expect(enable).toBeHidden();
  await page.waitForFunction(() => window.audioProbe.clip.currentTime > 0.1 && !window.audioProbe.clip.paused);
  const physicalCount = await page.evaluate(() => window.audioProbe.backend.slots.length);
  await page.evaluate(() => window.audioProbe.clip.pause());
  // Subsequent voices are created asynchronously, without any additional tap.
  await page.evaluate(async () => {
    await new Promise(resolve => setTimeout(resolve, 40));
    window.audioProbe.clip = window.audioProbe.factory("/audio-probe.wav?next", {recovery: "resume"});
    await window.audioProbe.clip.play();
  });
  await page.waitForFunction(() => window.audioProbe.clip.currentTime > 0.1);
  expect(await page.evaluate(() => window.audioProbe.backend.slots.length)).toBe(physicalCount);
  await expect(enable).toBeHidden();
  await page.evaluate(async () => {
    window.audioProbe.clip.pause();
    window.audioProbe.block = true;
    window.audioProbe.clip = window.audioProbe.factory("/audio-probe.wav?interrupted", {recovery: "resume"});
    try { await window.audioProbe.clip.play(); } catch {}
  });
  await expect(enable).toBeVisible();
  await page.screenshot({path: testInfo.outputPath("audio-recovery.png")});
  await page.evaluate(() => { window.audioProbe.block = false; });
  await enable.tap();
  await expect(enable).toBeHidden();
  await page.waitForFunction(() => window.audioProbe.clip.currentTime > 0.1);
  await page.evaluate(async () => {
    window.audioProbe.clip.pause(); window.audioProbe.block = true;
    window.audioProbe.clip = window.audioProbe.factory("/audio-probe.wav?cancelled", {recovery: "resume"});
    try { await window.audioProbe.clip.play(); } catch {}
    window.audioProbe.clip.pause(); window.audioProbe.block = false;
  });
  await expect(enable).toBeHidden();
  await page.locator(".account-entry-actions").tap();
  expect(await page.evaluate(() => window.audioProbe.clip.paused)).toBe(true);
  expect(errors).toEqual([]);
});
