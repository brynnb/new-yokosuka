import { expect, test } from "@playwright/test";
import { ARCADE_SCORE_MACHINE_IDS } from "../../src/ArcadeScoreClient.js";

test("sidebar intro previews return to the live avatar and location on completion and skip", async ({ page }, testInfo) => {
  test.skip(process.env.PLAYWRIGHT_CUTSCENE_RETURN !== "true", "Requires local intro and Dobuita assets");
  test.setTimeout(360_000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("new-yokosuka.quick-play-confirmations.v1", "3");
    window.returnTest = { ready: false, errors: [], results: [], presence: [] };
  });
  await page.route("**/api/status", route => route.fulfill({ json: {} }));
  await page.route("**/api/auth/guest", route => route.fulfill({ json: { account: { id: 1, accountType: "guest" } } }));
  await page.route("**/api/arcade-scores", route => route.fulfill({ json: {
    scores: ARCADE_SCORE_MACHINE_IDS.map(machineId => ({ machineId, score: 0 })),
  } }));
  await page.route("**/api/world-state", route => route.fulfill({ json: {
    serverTimeMs: Date.now(), gameTimeMs: Date.UTC(1986, 11, 3, 12),
  } }));
  await page.route("**/api/characters", route => route.fulfill({ json: { characters: [{
    id: 42, name: "Returntester", avatarId: "fuku", worldId: "dobuita",
    lastLoginAt: "2026-01-01T00:00:00Z", x: -24.5, y: 0, z: 29.5, yaw: 0.7,
  }] } }));
  const instrument = (path, body) => page.route(`**/${path}*`, async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\n${body}` });
  });
  await instrument("play/world/PlayWorldLifecycle.js", `
    const returnInitialize = PlayWorldLifecycle.prototype.initialize;
    PlayWorldLifecycle.prototype.initialize = function(options) {
      window.returnTest.lifecycle = this;
      return returnInitialize.call(this, options);
    };
  `);
  await instrument("play/cutscenes/CutscenePreviewRuntime.js", `
    const returnRequest = CutscenePreviewRuntime.prototype.requestInGame;
    CutscenePreviewRuntime.prototype.requestInGame = async function(id) {
      window.returnTest.preview = this;
      const result = await returnRequest.call(this, id);
      window.returnTest.results.push({ id, result });
      return result;
    };
  `);
  await instrument("play/cutscenes/NativeCutsceneDirector.js", `
    const returnStart = NativeCutsceneDirector.prototype.start;
    NativeCutsceneDirector.prototype.start = function(...args) {
      window.returnTest.director = this;
      return returnStart.apply(this, args);
    };
  `);
  // Observe the actual presence boundary without connecting to a real server.
  await instrument("play/multiplayer/MultiplayerSession.js", `
    MultiplayerSession.prototype.connect = function() {
      this.client.setLocalPresence = presence => {
        window.returnTest.presence.push({ ...presence, preview: Boolean(window.returnTest.preview?.gameplayPreview) });
        return true;
      };
    };
  `);
  await page.route("**/play/play.js*", route => route.fulfill({ contentType: "application/javascript", body: `
    import { PlayApplication } from '/play/PlayApplication.js';
    const probe = window.returnTest;
    probe.application = new PlayApplication();
    probe.application.start().then(() => { probe.ready = true; }).catch(error => {
      probe.errors.push(error.message);
      probe.application.showStartupError(error);
    });
  ` }));
  await page.goto("/play/");
  await page.locator(".account-intro-prompt").waitFor();
  await page.keyboard.press("Enter");
  await page.locator(".account-entry-actions button").filter({ hasText: "Quick Play" }).click();
  await page.locator(".account-shell-characters button").filter({ hasText: /^Enter World$/ }).click();
  await page.waitForFunction(() => window.returnTest.ready || window.returnTest.errors.length, null, { timeout: 150_000 });
  expect(await page.evaluate(() => window.returnTest.errors)).toEqual([]);
  await page.waitForTimeout(600);
  const snapshot = () => page.evaluate(() => {
    const l = window.returnTest.lifecycle, c = l.getController();
    return { world: l.worldRuntime.activeWorld.id, avatar: l.playerRuntime.activeCharacterId,
      position: l.actorRoot.position.asArray(), yaw: l.actorRoot.rotation.y,
      cameraYaw: c.cameraYaw, cameraPitch: c.cameraPitch, distance: c.cameraDistance,
      locked: c.movementLocked, presentation: l.nativeStoryRuntime.ownsPlayerPresentation };
  });
  await page.evaluate(() => { window.returnTest.lifecycle.getController().cameraYaw = 2.4; });
  const before = await snapshot();
  expect(before.avatar).toBe("fuku");

  for (const [index, [id, label, exit]] of [
    ["S1-OP00-MAIL", "Ine-san Collects the Mail", "complete"],
    ["S1-000", "Iwao's Murder", "skip"],
    ["S1-OP02-00", "Shenhua and the Hawk", "skip"],
    ["S1-OP00-DREAM", "Lan Di Dream and Awakening", "skip"],
  ].entries()) {
    await page.locator("#cutscene-button").click();
    await page.getByRole("option", { name: new RegExp(label) }).click();
    await page.waitForFunction(id => window.returnTest.preview?.active?.started
      && window.returnTest.director.activeCutscene?.cutscene.id === id, id, { timeout: 120_000 });
    await expect(page.locator("body")).toHaveClass(/cutscene-active/);
    await expect(page.locator("body")).not.toHaveClass(/cutscene-starting/);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: testInfo.outputPath(`${id}-playing.png`) });
    if (exit === "skip") await page.keyboard.press("KeyX");
    else {
      // Exercise authored completion using the real transport's five-second
      // advances, not a fake director completion callback.
      for (let step = 0; step < 70; step++) {
        if (await page.evaluate(() => !window.returnTest.director.active)) break;
        await page.keyboard.press("Space");
        await page.waitForTimeout(350);
      }
    }
    await page.waitForFunction(count => window.returnTest.results.length === count, index + 1, { timeout: 120_000 });
    expect(await page.evaluate(() => window.returnTest.results.at(-1))).toEqual({ id, result: true });
    await expect(page.locator("body")).not.toHaveClass(/cutscene-active|cutscene-starting/);
    const after = await snapshot();
    expect(after.world).toBe(before.world);
    expect(after.avatar).toBe(before.avatar);
    after.position.forEach((value, i) => expect(value).toBeCloseTo(before.position[i], 4));
    for (const field of ["yaw", "cameraYaw", "cameraPitch", "distance"]) expect(after[field]).toBeCloseTo(before[field], 4);
    expect(after.locked).toBe(false);
    expect(after.presentation).toBe(false);
    await page.screenshot({ path: testInfo.outputPath(`${id}-returned.png`) });
  }
  const presence = await page.evaluate(() => window.returnTest.presence);
  expect(presence.length).toBeGreaterThan(0);
  expect(presence.every(p => p.avatarId === "fuku" && p.worldId === "dobuita" && !p.preview)).toBe(true);
  expect(errors).toEqual([]);
});
