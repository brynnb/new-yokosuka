import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

test.skip(process.env.NEW_YOKOSUKA_STORY_E2E !== "true", "requires the isolated Story prototype server and offline assets");

const resumeId = Number(process.env.NEW_YOKOSUKA_STORY_RESUME_ID || 0);
const variants = resumeId ? [["resume", false]] : [["complete", false], ["skip", false], ["complete", true]];
for (const [ending, freshOpening] of variants) test(resumeId ? "investigation continues from an earned saved checkpoint" : `first allowance renders and persists after ${ending}${freshOpening ? " from a fresh opening" : ""}`, async ({ page }, testInfo) => {
  test.setTimeout(process.env.NEW_YOKOSUKA_INVESTIGATION_E2E === "true" ? 900_000 : process.env.NEW_YOKOSUKA_KITTEN_E2E === "true" ? 600_000 : freshOpening ? 480_000 : 240_000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const guestToken = resumeId ? process.env.NEW_YOKOSUKA_STORY_RESUME_TOKEN : randomUUID();
  expect(guestToken).toBeTruthy();
  const auth = await page.request.post("/api/auth/guest", { data: { guestToken } });
  expect(auth.ok(), await auth.text()).toBe(true);
  const name = "Scene" + randomUUID().slice(0, 6).replace(/[0-9]/g, digit => String.fromCharCode(103 + Number(digit)));
  const response = resumeId ? await page.request.get(`/api/characters/${resumeId}/state`)
    : await page.request.post("/api/characters", { data: { name, avatarId: "ryo" } });
  expect(response.ok(), await response.text()).toBe(true);
  const detail = await response.json();
  const character = resumeId ? detail.character : detail;
  if (!freshOpening && !resumeId) {
    const opening = await page.request.post(`/api/characters/${character.id}/opening-complete`, { data: { revision: 0 } });
    expect(opening.ok()).toBe(true);
  } else if (freshOpening) {
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
    ["scripts/ScriptEventController", `const probeFailure = ScriptEventController.prototype.fail;
      ScriptEventController.prototype.fail = function(error,...args) { window.storyProbe.sceneErrors.push(error.message); return probeFailure.call(this,error,...args); };`],
    ["dialogue/NativeDialogueOverlayRuntime", `window.nativeDialogueHookInstalled = true;
      const probeNativeStart = NativeDialogueOverlayRuntime.prototype.start;
      NativeDialogueOverlayRuntime.prototype.start = function(options,...args) { window.storyProbe.nativeStarts.push(options.actorCode); return probeNativeStart.call(this,options,...args); };`],
    ["scripts/ScriptEventDialoguePresenter", `const probeShow = ScriptEventDialoguePresenter.prototype.show;
      ScriptEventDialoguePresenter.prototype.show = function(...args) { window.storyProbe.dialogue = this; return probeShow.apply(this,args); };`],
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
    window.storyProbe = { starts: [], nativeStarts: [], ready: false, errors: [], sceneErrors: [] };
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
  if (resumeId) {
    expect(character.storyFlags["notebook.s1.chinese-community"]).toBe(true);
    if(process.env.NEW_YOKOSUKA_BAR_QTE_E2E === "true") {
      await verifyBarQte(page, testInfo, character);
      expect(errors).toEqual([]);
      expect(await page.evaluate(() => window.storyProbe.sceneErrors)).toEqual([]);
      return;
    }
    await continueWitnesses(page, testInfo, character, character.yen, true);
    if(process.env.NEW_YOKOSUKA_ALLEY_QTE_E2E === "true") {
      await page.locator("#journal-close").click();
      await verifyAlleyQte(page,testInfo,character);
    }
    if (process.env.NEW_YOKOSUKA_NIGHT_STORY_E2E === "true") {
      await page.locator("#journal-close").click();
      await continueNightWitnesses(page,testInfo,character);
    }
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => window.storyProbe.sceneErrors)).toEqual([]);
    return;
  }
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
  if (ending === "complete" && process.env.NEW_YOKOSUKA_DOJO_E2E === "true") {
    // Bounded continuation check: use real world loading, then place just
    // outside the dojo volume. Walking triggers it; no direct event start.
    await page.evaluate(async () => {
      const life = window.storyProbe.lifecycle;
      await life.travelToWorld("exterior");
      life.resetPlayer(life.vectorFromArray([4.6, 0.97, -17.8]), Math.PI, { persist: false });
    });
    await page.locator("#renderCanvas").focus();
    await page.keyboard.down("KeyW");
    try {
      await page.waitForFunction(() => window.storyProbe.starts.includes("story-s1-first-dojo"), null, { timeout: 20_000 });
    } finally { await page.keyboard.up("KeyW"); }
    await page.waitForFunction(() => window.storyProbe.director?.activeCutscene?.cutscene.id === "story-s1-first-dojo"
      || window.storyProbe.sceneErrors.length, null, { timeout: 60_000 });
    expect(await page.evaluate(() => window.storyProbe.sceneErrors)).toEqual([]);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: testInfo.outputPath("first-dojo-dialogue.png") });
    await page.waitForFunction(() => !window.storyProbe.director.active, null, { timeout: 120_000 });
    await expect.poll(() => page.evaluate(() => window.storyProbe.regions.getCharacter()?.storyFlags?.["story.s1.first-dojo.completed"])).toBe(true);
    const saved = await (await page.request.get(`/api/characters/${character.id}/state`)).json();
    expect(saved.character.storyFlags["notebook.s1.men-in-black"]).toBe(true);
    expect(saved.character.yen).toBe(character.yen + 500);
    expect(await page.evaluate(() => window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
    await page.locator("button").filter({ hasText: /^Notebook$/ }).click();
    await page.locator("#journal-next").click();
    await expect(page.getByText(/Ask around to find out/)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("first-dojo-notebook.png") });
    await page.locator("#journal-close").click();
    expect(errors).toEqual([]);
    if (process.env.NEW_YOKOSUKA_KITTEN_E2E === "true") {
      await page.evaluate(async () => {
        const life = window.storyProbe.lifecycle;
        await life.travelToWorld("yamanose");
        life.resetPlayer(life.vectorFromArray([36, 2.6, 45.3]), Math.PI, { persist: false });
      });
      await page.locator("#renderCanvas").focus();
      await page.keyboard.down("KeyW");
      try {
        await page.waitForFunction(() => window.storyProbe.starts.includes("story-s1-first-kitten-introduction"), null, { timeout: 20_000 });
      } finally { await page.keyboard.up("KeyW"); }
      await page.waitForFunction(() => window.storyProbe.director?.activeCutscene?.cutscene.id === "story-s1-first-kitten-introduction", null, { timeout: 60_000 });
      await page.waitForTimeout(3000);
      await page.screenshot({ path: testInfo.outputPath("first-kitten-introduction.png") });
      // A permitted scene skip must lead to a real choice, not automatically
      // award the fish-only witness clue or play both incompatible endings.
      await page.keyboard.press("KeyX");
      await expect(page.getByRole("button", { name: "Dried fish", exact: true })).toBeVisible();
      const beforeChoice = await (await page.request.get(`/api/characters/${character.id}/state`)).json();
      expect(beforeChoice.character.storyFlags["notebook.s1.yamagishi-witness"]).not.toBe(true);
      await page.screenshot({ path: testInfo.outputPath("first-kitten-food-choice.png") });
      await page.getByRole("button", { name: "Dried fish", exact: true }).click();
      await page.waitForFunction(() => window.storyProbe.director?.activeCutscene?.cutscene.id === "story-s1-first-kitten-fish", null, { timeout: 60_000 });
      await page.waitForTimeout(3000);
      await page.screenshot({ path: testInfo.outputPath("first-kitten-fish.png") });
      await page.waitForFunction(() => !window.storyProbe.director.active, null, { timeout: 120_000 });
      await expect.poll(() => page.evaluate(() => window.storyProbe.regions.getCharacter()?.storyFlags?.["story.s1.first-kitten.completed"])).toBe(true);
      const final = await (await page.request.get(`/api/characters/${character.id}/state`)).json();
      expect(final.character.storyFlags["notebook.s1.black-car"]).toBe(true);
      expect(final.character.storyFlags["notebook.s1.yamagishi-witness"]).toBe(true);
      expect(final.character.yen).toBe(character.yen + 500);
      expect(await page.evaluate(() => window.storyProbe.starts.some(id => id === "story-s1-first-kitten-tofu"))).toBe(false);
      expect(await page.evaluate(() => window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
      await page.locator("button").filter({ hasText: /^Notebook$/ }).click();
      await page.locator("#journal-next").click();
      await page.locator("#journal-next").click();
      await expect(page.getByText(/Visit him at home in Sakuragaoka/)).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("first-kitten-notebook.png") });
      await page.locator("#journal-close").click();
      if (process.env.NEW_YOKOSUKA_INVESTIGATION_E2E === "true") {
        await continueWitnesses(page, testInfo, character, character.yen + 500);
      }
      expect(await page.evaluate(() => window.storyProbe.sceneErrors)).toEqual([]);
      expect(errors).toEqual([]);
    }
  }
});

async function continueWitnesses(page, testInfo, character, expectedYen, resumeAfterTom = false) {
  for (const [actor, world, flag] of [
    ...(resumeAfterTom ? [] : [
      ["SUMI", "sakuragaoka", "story.s1.sumiya-witness.completed"],
      ["YAMA", "sakuragaoka", "notebook.s1.dobuita-black-car"],
      ["HRSK", "dobuita", "notebook.s1.tom-witness"],
      ["TOM_", "dobuita", "notebook.s1.chinese-community"],
    ]),
    ...(process.env.NEW_YOKOSUKA_THREE_BLADES_E2E === "true" ? [
      ["UNO_", "dcha", "notebook.s1.three-blades"],
      ["ITOI", "dobuita", "notebook.s1.liu-barber"],
      ["MADA", "dtky", "story.s1.maeda-liu-referral.completed"],
      ["KYUR", "drht", "notebook.s1.liu-senior"],
      ["RKKI", "dobuita", "notebook.s1.sailors"],
    ] : []),
  ]) {
    if (resumeAfterTom && character.storyFlags?.[flag]) continue;
    if (actor === "UNO_") {
      // Use the advancing personal clock; don't bypass opening hours.
      const state = await (await page.request.get(`/api/characters/${character.id}/state`)).json();
      const target = new Date(state.worldState.gameTimeMs);
      target.setUTCHours(10, 0, 0, 0);
      const remainingGameMs = Math.max(0, target.getTime() - state.worldState.gameTimeMs);
      const remainingRealMs = remainingGameMs * state.worldState.dayLengthMs / 86_400_000;
      await expect.poll(async () => {
        const state = await (await page.request.get(`/api/characters/${character.id}/state`)).json();
        return state.worldState.gameTimeMs;
      }, { timeout: remainingRealMs + 30_000, intervals: [2000] }).toBeGreaterThanOrEqual(target.getTime());
    }
    await page.evaluate(async world => { await window.storyProbe.lifecycle.travelToWorld(world); }, world);
    await page.waitForFunction(actor => window.storyProbe.lifecycle.scheduledActors.dialogueActor(actor), actor, { timeout: 60_000 });
    if (actor === "RKKI") {
      const position = await page.evaluate(() => window.storyProbe.lifecycle.scheduledActors.dialogueActor("RKKI").position);
      expect(Math.hypot(position[0] + 13.35, position[2] - 47.71)).toBeLessThan(0.3);
    }
    const point = await residentClickPoint(page, actor);
    await page.screenshot({ path: testInfo.outputPath(`${actor}-before-talk.png`) });
    await page.mouse.click(point.x, point.y);
    await page.waitForFunction(() => window.storyProbe.dialogue?.active, null, { timeout: 15_000 });
    await page.waitForFunction(() => {
      const audio = window.storyProbe.dialogue?.audio;
      return audio && !audio.paused && audio.currentTime > 0;
    }, null, { timeout: 15_000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: testInfo.outputPath(`${actor}-dialogue.png`) });
    // First voice really plays; advance the remaining original lines
    // with the supported Space control to keep this smoke test bounded.
    for (let line = 0; line < 100; line++) {
      if (await page.evaluate(flag => !!window.storyProbe.regions.getCharacter()?.storyFlags?.[flag], flag)) break;
      await page.keyboard.press("Space");
      await page.waitForTimeout(250);
    }
    await expect.poll(() => page.evaluate(flag => window.storyProbe.regions.getCharacter()?.storyFlags?.[flag], flag)).toBe(true);
    expect(await page.evaluate(() => window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
    const saved = await (await page.request.get(`/api/characters/${character.id}/state`)).json();
    expect(saved.character.storyFlags[flag]).toBe(true);
    expect(saved.character.yen).toBe(expectedYen);
    if (actor === "KYUR") {
      const snapshot = await (await page.request.get(`/api/characters/${character.id}/dialogue`)).json();
      expect(Buffer.from(snapshot.state.banks[2], "base64")[8] & 2).toBe(2);
    }
  }
  if (process.env.NEW_YOKOSUKA_THREE_BLADES_E2E === "true") {
    await page.evaluate(async () => { await window.storyProbe.lifecycle.travelToWorld("dobuita"); });
    await page.waitForFunction(() => window.storyProbe.lifecycle.scheduledActors.dialogueActor("RKKI"));
    const point = await residentClickPoint(page, "RKKI");
    expect(await page.evaluate(() => window.nativeDialogueHookInstalled)).toBe(true);
    const beforeNative = await page.evaluate(() => window.storyProbe.nativeStarts.length);
    await page.mouse.click(point.x, point.y);
    await expect(page.getByText("This conversation is not available right now. Check your notebook for the next lead.", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.storyProbe.nativeStarts.length)).toBe(beforeNative);
    expect(await page.evaluate(() => window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
    await page.locator("button").filter({ hasText: /^Notebook$/ }).click();
    for (let index = 0; index < 30 && await page.locator("#journal-next").isEnabled(); index++) await page.locator("#journal-next").click();
    for(let index=0;index<30 && !await page.getByText(/Ask sailors who travel to Hong Kong or Shanghai/).isVisible() && await page.locator("#journal-previous").isEnabled();index++)await page.locator("#journal-previous").click();
    await expect(page.getByText(/Ask sailors who travel to Hong Kong or Shanghai/)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("sailors-notebook.png") });
  }
}

async function residentClickPoint(page, actor) {
  // Bound travel time without fabricating a talk result: position by the
  // real scheduled NPC, then project its visible mesh for a normal click.
  await page.evaluate(actor => {
    const life = window.storyProbe.lifecycle;
    const [x, y, z] = life.scheduledActors.dialogueActor(actor).position;
    life.resetPlayer(life.vectorFromArray([x, y, z + 2]), Math.PI, { persist: false });
    const controller = life.getController();
    controller.setFirstPerson(true);
    controller.cameraYaw = 0;
    controller.cameraPitch = 0;
  }, actor);
  await page.waitForTimeout(1200);
  return page.evaluate(actor => {
    const life = window.storyProbe.lifecycle;
    const point = life.vectorFromArray(life.scheduledActors.dialogueActor(actor).position);
    point.y += 1.3;
    const rect = life.engine.getRenderingCanvas().getBoundingClientRect();
    const screen = point.constructor.Project(point, life.scene.getTransformMatrix().constructor.Identity(), life.scene.getTransformMatrix(),
      life.scene.activeCamera.viewport.toGlobal(life.engine.getRenderWidth(), life.engine.getRenderHeight()));
    return { x: rect.x + screen.x * rect.width / life.engine.getRenderWidth(),
      y: rect.y + screen.y * rect.height / life.engine.getRenderHeight() };
  }, actor);
}

async function continueNightWitnesses(page,testInfo,character) {
  const state=await (await page.request.get(`/api/characters/${character.id}/state`)).json();
  if (new Date(state.worldState.gameTimeMs).getUTCHours()<19) {
    await page.locator("#story-wait-button").click();
    await page.getByRole("option",{name:"Wait until 7 p.m.",exact:true}).click();
    await expect(page.getByRole("button",{name:"Wait until 7 p.m.",exact:true})).toBeVisible();
    await page.screenshot({path:testInfo.outputPath("wait-evening-choice.png")});
    await page.getByRole("button",{name:"Keep exploring",exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");
    const declined=await (await page.request.get(`/api/characters/${character.id}/state`)).json();
    expect(new Date(declined.worldState.gameTimeMs).getUTCHours()).toBeLessThan(19);
    await page.locator("#story-wait-button").click();
    await page.getByRole("option",{name:"Wait until 7 p.m.",exact:true}).click();
    await page.getByRole("button",{name:"Wait until 7 p.m.",exact:true}).click();
    await expect.poll(async()=>new Date((await(await page.request.get(`/api/characters/${character.id}/state`)).json()).worldState.gameTimeMs).getUTCHours()).toBe(19);
  }
  for(const [actor,world,flag] of [["JUKY","drme","notebook.s1.yong-wu"],["GRKN","dbyo","story.s1.yong-wu-liu-referral.completed"],["SAJO","dbyo","notebook.s1.heartbeats"]]) {
    await page.evaluate(async world=>{await window.storyProbe.lifecycle.travelToWorld(world);},world);
    await page.waitForFunction(actor=>window.storyProbe.lifecycle.scheduledActors.dialogueActor(actor),actor,{timeout:60_000});
    const point=await residentClickPoint(page,actor);await page.mouse.click(point.x,point.y);
    await page.waitForFunction(()=>window.storyProbe.dialogue?.active,null,{timeout:15_000});
    await page.waitForFunction(()=>{const a=window.storyProbe.dialogue?.audio;return a&&!a.paused&&a.currentTime>0;},null,{timeout:15_000});
    await page.screenshot({path:testInfo.outputPath(`${actor}-night-dialogue.png`)});
    for(let line=0;line<100;line++){if(await page.evaluate(flag=>!!window.storyProbe.regions.getCharacter()?.storyFlags?.[flag],flag))break;await page.keyboard.press("Space");await page.waitForTimeout(250);}
    await expect.poll(()=>page.evaluate(flag=>window.storyProbe.regions.getCharacter()?.storyFlags?.[flag],flag)).toBe(true);
    expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  }
  await page.locator("button").filter({hasText:/^Notebook$/}).click();
  while(await page.locator("#journal-next").isEnabled())await page.locator("#journal-next").click();
  await expect(page.getByText(/Heartbeats is in the alley across from Knocking Motorcycle Shop/)).toBeVisible();
  await page.screenshot({path:testInfo.outputPath("heartbeats-notebook.png")});
  await page.locator("#journal-close").click();
  const evening=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
  await page.locator("#story-wait-button").click();
  await page.getByRole("option",{name:"Wait until tomorrow morning",exact:true}).click();
  await page.getByRole("button",{name:"Wait until tomorrow morning",exact:true}).click();
  await expect.poll(async()=>new Date((await(await page.request.get(`/api/characters/${character.id}/state`)).json()).worldState.gameTimeMs).getUTCDate()).toBe(new Date(evening.worldState.gameTimeMs).getUTCDate()+1);
  const morning=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
  expect(new Date(morning.worldState.gameTimeMs).getUTCHours()).toBe(8);
  expect(morning.character.storyFlags["notebook.s1.heartbeats"]).toBe(true);
  expect(morning.character.yen).toBe(character.yen);
}

async function verifyAlleyQte(page,testInfo,character) {
  const state=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
  if(new Date(state.worldState.gameTimeMs).getUTCHours()<19){
    await page.locator("#story-wait-button").click();
    await page.getByRole("option",{name:"Wait until 7 p.m.",exact:true}).click();
    await page.getByRole("button",{name:"Wait until 7 p.m.",exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");
  }
  await page.evaluate(async()=>{const life=window.storyProbe.lifecycle;await life.travelToWorld("dobuita");life.resetPlayer(life.vectorFromArray([124.56,-1.8,67.4]),Math.PI,{persist:false});});
  await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
  try{await page.waitForFunction(()=>window.storyProbe.starts.includes("story-s1-heartbeats-introduction")||window.storyProbe.sceneErrors.length,null,{timeout:20_000});}
  finally{await page.keyboard.up("KeyW");}
  expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  await page.screenshot({path:testInfo.outputPath("heartbeats-alley-introduction.png")});
  await page.waitForFunction(()=>window.storyProbe.regions.controller.active?.challengePrompt?.ready,null,{timeout:90_000});
  await page.screenshot({path:testInfo.outputPath("heartbeats-alley-prompt.png")});
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button",{name:"Try again",exact:true})).toBeVisible();
  const failed=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
  expect(failed.character.storyFlags["story.s1.heartbeats-alley.completed"]).not.toBe(true);
  await page.getByRole("button",{name:"Try again",exact:true}).click();
  await page.waitForFunction(()=>window.storyProbe.regions.controller.active?.challengePrompt?.ready&&window.storyProbe.regions.controller.active.challengePrompt.button==="B",null,{timeout:90_000});
  await page.keyboard.press("Shift");
  await page.waitForFunction(()=>window.storyProbe.regions.controller.active?.challengePrompt?.button==="A",null,{timeout:5000});
  await page.keyboard.press("Enter");
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.["story.s1.heartbeats-alley.completed"])).toBe(true);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  const saved=await(await page.request.get(`/api/characters/${character.id}/state`)).json();
  expect(saved.character.storyFlags["story.s1.heartbeats-alley.completed"]).toBe(true);
  expect(saved.character.yen).toBe(character.yen);
}

async function verifyBarQte(page, testInfo, character) {
  expect(character.storyFlags["story.s1.heartbeats-alley.completed"]).toBe(true);
  const state = await (await page.request.get(`/api/characters/${character.id}/state`)).json();
  if (new Date(state.worldState.gameTimeMs).getUTCHours() < 19) {
    await page.locator("#story-wait-button").click();
    await page.getByRole("option", { name: "Wait until 7 p.m.", exact: true }).click();
    await page.getByRole("button", { name: "Wait until 7 p.m.", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.storyProbe.regions.controller.status)).toBe("idle");
  }
  if (await page.evaluate(() => window.storyProbe.lifecycle.worldRuntime.activeWorld.id !== "dbhb")) {
    await page.evaluate(async () => {
      const life = window.storyProbe.lifecycle;
      await life.travelToWorld("dobuita");
      life.resetPlayer(life.vectorFromArray([124.56, -1.8, 64.41]), -.955742, { persist: false });
      const door = life.doorInteractions.entries.find(entry => entry.root._filename === "S1_D000_DR02_016.MT5");
      if (!door) throw new Error("Heartbeats door is missing");
      const bounds = door.root.getHierarchyBoundingVectors(true), center = bounds.min.add(bounds.max).scale(.5);
      const controller = life.getController();
      controller.setFirstPerson(true);
      controller.cameraYaw = Math.atan2(-(center.x - 124.56), -(center.z - 64.41));
      controller.cameraPitch = 0;
      controller.updateCamera(1);
    });
    await page.waitForTimeout(800);
    const point = await page.evaluate(() => {
      const life = window.storyProbe.lifecycle;
      const door = life.doorInteractions.entries.find(entry => entry.root._filename === "S1_D000_DR02_016.MT5");
      if (!door) throw new Error("Heartbeats door is missing");
      const bounds = door.root.getHierarchyBoundingVectors(true);
      const center = bounds.min.add(bounds.max).scale(.5), canvas = life.engine.getRenderingCanvas(), rect = canvas.getBoundingClientRect();
      const screen = center.constructor.Project(center, life.scene.getTransformMatrix().constructor.Identity(), life.scene.getTransformMatrix(),
        life.scene.activeCamera.viewport.toGlobal(life.engine.getRenderWidth(), life.engine.getRenderHeight()));
      return { x: rect.x + screen.x * rect.width / life.engine.getRenderWidth(), y: rect.y + screen.y * rect.height / life.engine.getRenderHeight() };
    });
    await page.mouse.click(point.x, point.y);
    await page.waitForFunction(() => window.storyProbe.lifecycle.worldRuntime.activeWorld.id === "dbhb", null, { timeout: 30_000 });
  }
  await page.waitForFunction(() => window.storyProbe.dialogue?.active || window.storyProbe.sceneErrors.length, null, { timeout: 60_000 });
  expect(await page.evaluate(() => window.storyProbe.sceneErrors)).toEqual([]);
  await page.waitForFunction(() => window.storyProbe.dialogue?.audio?.currentTime > 0, null, { timeout: 15_000 });
  await page.screenshot({ path: testInfo.outputPath("heartbeats-bar-introduction.png") });
  // Read the rendered cast and perform the real challenge. Space only skips
  // voice lines; it must not answer or bypass a challenge prompt.
  for (let i = 0; i < 20 && !await page.evaluate(() => !!window.storyProbe.regions.controller.active?.challengePrompt); i++) {
    await page.keyboard.press("Space"); await page.waitForTimeout(150);
  }
  await page.waitForFunction(() => window.storyProbe.regions.controller.active?.challengePrompt?.ready);
  await page.screenshot({ path: testInfo.outputPath("heartbeats-bar-prompt.png") });
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
  let saved = await (await page.request.get(`/api/characters/${character.id}/state`)).json();
  expect(saved.character.storyFlags["notebook.s1.charlie"]).not.toBe(true);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  for (let i = 0; i < 20 && !await page.evaluate(() => !!window.storyProbe.regions.controller.active?.challengePrompt); i++) {
    await page.keyboard.press("Space"); await page.waitForTimeout(150);
  }
  for (const [index, button] of ["B", "A", "B", "A"].entries()) {
    await page.waitForFunction(({ index, button }) => {
      const p = window.storyProbe.regions.controller.active?.challengePrompt;
      return p?.ready && p.index === index && p.button === button;
    }, { index, button });
    await page.keyboard.press(button === "B" ? "Shift" : "Enter");
  }
  await page.waitForFunction(() => window.storyProbe.regions.controller.status === "line");
  for (let i = 0; i < 30 && !await page.evaluate(() => window.storyProbe.regions.getCharacter()?.storyFlags?.["notebook.s1.charlie"]); i++) {
    await page.keyboard.press("Space"); await page.waitForTimeout(200);
  }
  await expect.poll(() => page.evaluate(() => window.storyProbe.regions.getCharacter()?.storyFlags?.["notebook.s1.charlie"])).toBe(true);
  expect(await page.evaluate(() => window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  saved = await (await page.request.get(`/api/characters/${character.id}/state`)).json();
  expect(saved.character.yen).toBe(character.yen);
  expect(saved.character.storyFlags["story.s1.heartbeats-bar.completed"]).toBe(true);
  const returned = await page.evaluate(() => ({
    position: window.storyProbe.lifecycle.getController().collider.position.asArray(),
    firstPerson: window.storyProbe.lifecycle.getController().firstPerson,
    avatar: window.storyProbe.lifecycle.playerRuntime.activeCharacterId,
    owners: window.storyProbe.lifecycle.scheduledActors.activityActorOwners.size,
  }));
  expect(returned.avatar).toBe("ryo");
  expect(returned.owners).toBe(0);
  expect(returned.firstPerson).toBe(true);
  expect(Math.hypot(returned.position[0] + .68, returned.position[2] + 7.32)).toBeLessThan(.1);
  await page.locator("button").filter({ hasText: /^Notebook$/ }).click();
  for (let i = 0; i < 30 && !await page.getByText(/Hato at Heartbeats told me about Charlie/).isVisible(); i++) await page.locator("#journal-next").click();
  await expect(page.getByText(/Hato at Heartbeats told me about Charlie/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("charlie-notebook.png") });
  await page.locator("#journal-close").click();
  // Room reload must not replay the encounter or leave its event-only cast.
  await page.evaluate(async () => { const life = window.storyProbe.lifecycle; await life.travelToWorld("dobuita"); await life.travelToWorld("dbhb"); });
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.storyProbe.regions.controller.status)).toBe("idle");
  expect(await page.evaluate(() => window.storyProbe.lifecycle.scheduledActors.activityActorOwners.size)).toBe(0);
}
