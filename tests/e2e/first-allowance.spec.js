import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

test.skip(process.env.NEW_YOKOSUKA_STORY_E2E !== "true", "requires the isolated Story prototype server and offline assets");

for (const [ending, freshOpening] of [["complete", false], ["skip", false], ["complete", true]]) test(`first allowance renders and persists after ${ending}${freshOpening ? " from a fresh opening" : ""}`, async ({ page }, testInfo) => {
  test.setTimeout(freshOpening ? 480_000 : 240_000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const guestToken = randomUUID();
  const auth = await page.request.post("/api/auth/guest", { data: { guestToken } });
  expect(auth.ok(), await auth.text()).toBe(true);
  const name = "Scene" + randomUUID().slice(0, 6).replace(/[0-9]/g, digit => String.fromCharCode(103 + Number(digit)));
  const response = await page.request.post("/api/characters", { data: { name, avatarId: "ryo" } });
  expect(response.ok(), await response.text()).toBe(true);
  const character = await response.json();
  if (!freshOpening) {
    const opening = await page.request.post(`/api/characters/${character.id}/opening-complete`, { data: { revision: 0 } });
    expect(opening.ok()).toBe(true);
  } else {
    expect(character.playMode).toBe("story");
    expect(character.openingCompleted).toBe(false);
    // No gameplay writer may start with the pre-opening clock and location.
    const earlyConnection = await page.request.get(`/ws?characterId=${character.id}`);
    expect(earlyConnection.status()).toBe(409);
  }
  await page.addInitScript(token => {
    localStorage.setItem("new-yokosuka.guest-token.v1", token);
    localStorage.setItem("new-yokosuka.quick-play-confirmations.v1", "3");
  }, guestToken);
  // Instrument the actual served modules, including HMR timestamp variants.
  // Importing a bare second copy can observe a different prototype from /play.
  for (const [file, hook] of [
    ["world/PlayWorldLifecycle", `const probeInitialize = PlayWorldLifecycle.prototype.initialize;
      PlayWorldLifecycle.prototype.initialize = function(...args) { window.storyProbe.lifecycle = this; return probeInitialize.apply(this,args); };`],
    ["cutscenes/NativeCutsceneDirector", `const probeStart = NativeCutsceneDirector.prototype.start;
      NativeCutsceneDirector.prototype.start = function(cutscene,...args) { window.storyProbe.director = this; window.storyProbe.starts.push(cutscene.id); return probeStart.call(this,cutscene,...args).catch(error => { window.storyProbe.sceneErrors.push(error.message); throw error; }); };`],
    ["scripts/StoryRegionRuntime", `const probeUpdate = StoryRegionRuntime.prototype.update;
      StoryRegionRuntime.prototype.update = function(...args) { window.storyProbe.regions = this; window.storyProbe.lastRegionFrame = args[0]; return probeUpdate.apply(this,args); };`],
  ]) await page.route(`**/play/${file}.js*`, async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()) + "\n" + hook });
  });
  await page.route("**/play/play.js*", route => route.fulfill({ contentType: "application/javascript", body: `
    import { PlayApplication } from '/play/PlayApplication.js';
    import { ArcadeAttractScreens } from '/play/arcade/ArcadeAttractScreens.js';
    window.storyProbe = { starts: [], ready: false, errors: [], sceneErrors: [] };
    const create = ArcadeAttractScreens.prototype.create;
    ArcadeAttractScreens.prototype.create = function(id) { return this.definitions[id]?.audioChannel === 'tv' ? null : create.call(this,id); };
    const application = new PlayApplication();
    application.start().then(() => window.storyProbe.ready = true).catch(error => { window.storyProbe.errors.push(error.message); application.showStartupError(error); });
  ` }));
  await page.goto("/play/");
  await page.keyboard.press("Enter");
  await page.locator(".account-entry-actions button").filter({ hasText: "Quick Play" }).click();
  await page.locator(".character-slot-button:not(.empty)").first().click();
  await page.locator("button").filter({ hasText: /^Enter World$/ }).click();
  const openingScenes = ["S1-OP02-00", "S1-000", "S1-OP00-MAIL", "S1-OP00-DREAM"];
  if (freshOpening) {
    // Exercise real loading and the explicit player skip, not the completion
    // API or a fake director result. Natural intro timing is a separate check.
    for (const id of openingScenes) {
      await page.waitForFunction(id => window.storyProbe.director?.activeCutscene?.cutscene.id === id
        || window.storyProbe.errors.length || window.storyProbe.sceneErrors.length, id, { timeout: 120_000 });
      expect(await page.evaluate(() => [...window.storyProbe.errors, ...window.storyProbe.sceneErrors])).toEqual([]);
      const before = await (await page.request.get(`/api/characters/${character.id}/state`)).json();
      expect(before.character.openingCompleted).toBe(false);
      await page.screenshot({ path: testInfo.outputPath(`${id}-before-skip.png`) });
      await page.keyboard.press("KeyX");
    }
  }
  await page.waitForFunction(() => window.storyProbe.ready || window.storyProbe.errors.length, null, { timeout: 120_000 });
  expect(await page.evaluate(() => window.storyProbe.errors)).toEqual([]);
  await page.waitForFunction(() => window.storyProbe.regions?.getCharacter()?.id);
  if (freshOpening) {
    const arrival = await page.evaluate(() => ({
      position: window.storyProbe.lifecycle.getController().collider.position.asArray(),
      locked: window.storyProbe.lifecycle.getController().movementLocked,
      character: window.storyProbe.regions.getCharacter(),
    }));
    expect(arrival.character.openingCompleted).toBe(true);
    expect(arrival.character.storyTimeMs).toBe(Date.UTC(1986, 11, 3, 8, 55));
    expect(arrival.character.worldId).toBe("interior");
    expect(Math.hypot(arrival.position[0] + 17.6, arrival.position[2] - 4.1)).toBeLessThan(0.2);
    expect(arrival.locked).toBe(false);
    expect(await page.evaluate(() => window.storyProbe.starts)).toEqual(openingScenes);
    await page.screenshot({ path: testInfo.outputPath("fresh-bedside.png") });
    // Project the actual bedroom door into the canvas, click it through the
    // normal picker, then walk out with normal collisions. No hallway teleport.
    const doorPoint = await page.evaluate(() => {
      const life = window.storyProbe.lifecycle;
      const door = life.doorInteractions.entries.find(entry => entry.objectTag === "dor7");
      if (!door) throw new Error("Bedroom door dor7 is unavailable");
      const bounds = door.root.getHierarchyBoundingVectors(true);
      const point = bounds.min.add(bounds.max).scale(0.5);
      const canvas = life.engine.getRenderingCanvas();
      const rect = canvas.getBoundingClientRect();
      const screen = point.constructor.Project(point, life.scene.getTransformMatrix().constructor.Identity(), life.scene.getTransformMatrix(),
        life.scene.activeCamera.viewport.toGlobal(life.engine.getRenderWidth(), life.engine.getRenderHeight()));
      return { state: door.state, x: rect.x + screen.x * rect.width / life.engine.getRenderWidth(),
        y: rect.y + screen.y * rect.height / life.engine.getRenderHeight() };
    });
    if (doorPoint.state === "closed") await page.mouse.click(doorPoint.x, doorPoint.y);
    await page.waitForFunction(() => window.storyProbe.lifecycle.doorInteractions.entries
      .find(entry => entry.objectTag === "dor7")?.state === "open");
    await page.locator("#renderCanvas").focus();
    await page.keyboard.down("KeyW");
    try {
      await page.waitForFunction(() => window.storyProbe.starts.includes("story-s1-first-allowance"), null, { timeout: 15_000 });
    } finally { await page.keyboard.up("KeyW"); }
  } else {
    await page.evaluate(() => {
      const life = window.storyProbe.lifecycle;
      life.resetPlayer(life.vectorFromArray([-16.75, 0, 1]), Math.PI, { persist: false });
    });
  }
  try {
    await page.waitForFunction(() => window.storyProbe.director?.activeCutscene?.cutscene.id === "story-s1-first-allowance" || window.storyProbe.sceneErrors.length, null, { timeout: 30_000 });
    expect(await page.evaluate(() => window.storyProbe.sceneErrors)).toEqual([]);
  } catch (error) {
    console.log(await page.evaluate(() => ({ frame: window.storyProbe.lastRegionFrame,
      character: window.storyProbe.regions?.getCharacter(), inside: [...(window.storyProbe.regions?.inside || [])],
      status: window.storyProbe.regions?.controller.status, starts: window.storyProbe.starts })));
    throw error;
  }
  await page.waitForTimeout(2000);
  await page.screenshot({ path: testInfo.outputPath("allowance-playing.png") });
  if (ending === "skip") await page.keyboard.press("KeyX");
  else {
    await page.waitForTimeout(7000);
    await page.screenshot({ path: testInfo.outputPath("allowance-conversation.png") });
    await page.waitForFunction(() => !window.storyProbe.director.active, null, { timeout: 90_000 });
  }
  await expect.poll(() => page.evaluate(() => window.storyProbe.regions.getCharacter()?.storyFlags?.["notebook.s1.allowance"]), { timeout: 30_000 }).toBe(true);
  const stateResponse = await page.request.get(`/api/characters/${character.id}/state`);
  expect(stateResponse.ok()).toBe(true);
  const state = await stateResponse.json();
  expect(state.character.yen).toBe(character.yen + 500);
  expect(state.character.storyFlags["story.s1.first-allowance.completed"]).toBe(true);
  expect(await page.evaluate(() => window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  const continuation = await page.evaluate(() => ({
    position: window.storyProbe.lifecycle.getController().collider.position.asArray(),
    avatar: window.storyProbe.lifecycle.playerRuntime.activeCharacterId,
  }));
  expect(continuation.avatar).toBe("ryo");
  if (freshOpening) {
    expect(continuation.position[0]).toBeGreaterThanOrEqual(-17.5);
    expect(continuation.position[0]).toBeLessThanOrEqual(-16);
    expect(continuation.position[2]).toBeGreaterThanOrEqual(0.4);
    expect(continuation.position[2]).toBeLessThanOrEqual(1.6);
  }
  expect(await page.evaluate(() => window.storyProbe.starts)).toEqual([
    ...(freshOpening ? openingScenes : []), "story-s1-first-allowance",
  ]);
  await page.locator("button").filter({ hasText: /^Notebook$/ }).click();
  for (let index = 0; index < 5; index++) await page.locator("#journal-next").click();
  await expect(page.getByText(/Ine-san leaves.*500/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("earned-notebook.png") });
  await page.locator("#journal-close").click();
  if (ending === "complete") {
    await page.reload();
    await page.keyboard.press("Enter");
    await page.locator(".account-entry-actions button").filter({ hasText: "Quick Play" }).click();
    await page.locator(".character-slot-button:not(.empty)").first().click();
    await page.locator("button").filter({ hasText: /^Enter World$/ }).click();
    await page.waitForFunction(() => window.storyProbe.ready || window.storyProbe.errors.length, null, { timeout: 120_000 });
    await page.waitForFunction(() => window.storyProbe.regions?.getCharacter()?.storyFlags?.["notebook.s1.allowance"]);
    expect(await page.evaluate(() => window.storyProbe.starts)).toEqual([]);
    expect(await page.evaluate(() => window.storyProbe.regions.getCharacter().yen)).toBe(character.yen + 500);
    const resumed = await page.evaluate(() => ({
      position: window.storyProbe.lifecycle.getController().collider.position.asArray(),
      locked: window.storyProbe.lifecycle.getController().movementLocked,
      avatar: window.storyProbe.lifecycle.playerRuntime.activeCharacterId,
    }));
    expect(Math.hypot(...resumed.position.map((value, index) => value - continuation.position[index]))).toBeLessThan(0.2);
    expect(resumed.locked).toBe(false);
    expect(resumed.avatar).toBe("ryo");
    await page.screenshot({ path: testInfo.outputPath("saved-continuation.png") });
  }
  expect(errors).toEqual([]);
});
