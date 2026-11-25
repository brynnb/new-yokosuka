import {expect} from "@playwright/test";

const film = "story-s1-nozomi-flowers";
const receipt = "story.s1.nozomi-flowers.completed";

export async function verifyNozomiFlowers(page, testInfo, character, enterStoryWorld) {
  const saved = async () => {
    const result = await page.request.get(`/api/characters/${character.id}/state`);
    expect(result.ok()).toBe(true);
    return result.json();
  };
  const before = await saved();
  expect(before.character.storyFlags["story.s1.boat-ticket-collection.completed"]).toBe(true);
  expect(before.character.storyFlags[receipt]).not.toBe(true);
  async function verifyState(completed) {
    const state = await saved();
    const flags = {...before.character.storyFlags};
    if (completed) flags[receipt] = true;
    expect(state.character.storyFlags).toEqual(flags);
    expect(state.character.yen).toBe(before.character.yen);
    expect(state.inventory).toEqual(before.inventory);
    const response = await page.request.get(`/api/characters/${character.id}/dialogue`);
    expect(response.ok()).toBe(true);
    const snapshot = await response.json();
    const bank = Buffer.from(snapshot.state.banks["2"], "base64");
    expect(bank.length).toBeGreaterThan(924 >> 3);
    expect((bank[924 >> 3] >> (924 % 8)) & 1).toBe(Number(completed));
    expect((bank[380 >> 3] >> (380 % 8)) & 1).toBe(0);
  }
  async function idle() {
    await page.waitForFunction(() => {
      const probe = window.storyProbe;
      return probe?.ready && probe.regions?.controller.status === "idle"
        && !probe.director?.activeCutscene && !probe.lifecycle.getController().movementLocked;
    }, null, {timeout: 45_000});
    expect(await page.evaluate(() => window.storyProbe.sceneErrors)).toEqual([]);
  }
  async function approach(expectFilm = true) {
    // Start in the adjoining passage. Cross the recovered rectangle with
    // normal controller movement, collision and server presence updates.
    await page.evaluate(() => {
      const life = window.storyProbe.lifecycle;
      const controller = life.getController();
      life.resetPlayer(life.vectorFromArray([-7.85, 0, -2.65]), Math.PI / 2, {persist: false});
      controller.setFirstPerson(true);
      controller.cameraYaw = -Math.PI / 2;
      controller.cameraPitch = 0;
      controller.updateCamera(1);
    });
    await page.waitForTimeout(500);
    await page.locator("#renderCanvas").focus();
    await page.keyboard.down("KeyW");
    try {
      if (expectFilm) {
        await page.waitForFunction(id => window.storyProbe.director?.activeCutscene?.cutscene.id === id
          || window.storyProbe.sceneErrors.length, film, {timeout: 30_000});
      } else {
        await page.waitForFunction(() => {
          const pos = window.storyProbe.lifecycle.getController().collider.position;
          return pos.x >= -7.25 && pos.x <= -5.45 && pos.z >= -3.5 && pos.z <= -1.8;
        }, null, {timeout: 10_000});
      }
    } finally {
      await page.keyboard.up("KeyW");
    }
    expect(await page.evaluate(() => window.storyProbe.sceneErrors)).toEqual([]);
  }
  async function waitForFrame(frame) {
    await page.waitForFunction(frame => {
      const probe = window.storyProbe;
      return probe.sceneErrors.length
        || probe.director?.activeCutscene?.packageRuntime.activityRuntime.active?.currentFrame >= frame;
    }, frame, {timeout: 60_000});
    expect(await page.evaluate(() => window.storyProbe.sceneErrors)).toEqual([]);
  }
  if (character.worldId !== "interior") {
    await page.evaluate(() => window.storyProbe.lifecycle.travelToWorld("interior"));
  }
  await page.waitForFunction(() => window.storyProbe.lifecycle.worldRuntime.ready
    && window.storyProbe.lifecycle.worldRuntime.activeWorld.id === "interior");
  await approach();
  await waitForFrame(100);
  await page.waitForFunction(() => {
    const records = window.storyProbe.director?.activeCutscene?.packageRuntime.audio.active?.elements;
    return [...(records || [])].some(({kind, audio}) => kind === "voice" && !audio.paused && audio.currentTime > 0);
  }, null, {timeout: 45_000});
  await verifyState(false);
  await page.evaluate(() => window.storyProbe.regions.controller.cancel("test-cancel-nozomi-flowers"));
  await idle();
  await verifyState(false);

  await approach();
  const skip = process.env.NEW_YOKOSUKA_NOZOMI_FLOWERS_SKIP_E2E === "true";
  for (const frame of (skip ? [120] : [120, 540, 1050])) {
    await waitForFrame(frame);
    await page.screenshot({path: testInfo.outputPath(`nozomi-flowers-frame-${frame}.png`)});
  }
  if (skip) await page.keyboard.press("KeyX");
  await expect.poll(async () => (await saved()).character.storyFlags[receipt],
    {timeout: 70_000, intervals: [500]}).toBe(true);
  await idle();
  await verifyState(true);

  await page.reload();
  await enterStoryWorld(page, character.name);
  await idle();
  await approach(false);
  await page.waitForTimeout(900);
  await idle();
  await verifyState(true);
  expect(await page.evaluate(() => window.storyProbe.starts)).not.toContain(film);
}
