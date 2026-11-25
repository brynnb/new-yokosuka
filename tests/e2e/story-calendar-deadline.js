import {expect} from "@playwright/test";

export async function verifyCalendarDeadline(page, testInfo, character, enterStoryWorld, id) {
  const warning = id === "shenhua-warning";
  if (!warning && id !== "bad-ending") throw Error("Unknown bedtime event");
  const film = "story-s1-" + id;
  const receipt = "story.s1." + id + ".completed";
  const read = async (resource) => {
    const response = await page.request.get(`/api/characters/${character.id}/${resource}`);
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const initial = await read("state");
  expect(new Date(initial.character.storyTimeMs).toISOString().slice(0,10))
    .toBe(warning ? "1987-03-31" : "1987-04-14");
  async function verifyReceipt(completed) {
    const state = await read("state");
    expect(!!state.character.storyFlags[receipt]).toBe(completed);
    expect(state.character.yen).toBe(initial.character.yen);
    expect(state.character.currentHp).toBe(initial.character.currentHp);
    expect(state.inventory).toEqual(initial.inventory);
    if (warning) {
      const snapshot = await read("dialogue");
      const bank = Buffer.from(snapshot.state.banks["2"], "base64");
      expect((bank[181 >> 3] >> (181 % 8)) & 1).toBe(Number(completed));
    }
    return state.character;
  }
  async function idle() {
    await page.waitForFunction(() => {
      const probe = window.storyProbe, life = probe?.lifecycle;
      return probe?.ready && life.worldRuntime.ready && !life.worldRuntime.switching
        && probe.regions?.controller.status === "idle" && !life.getController().movementLocked;
    }, null, {timeout:60_000});
    expect(await page.evaluate(() => window.storyProbe.sceneErrors)).toEqual([]);
  }
  async function bedside() {
    await page.evaluate(() => {
      const life = window.storyProbe.lifecycle, controller = life.getController();
      life.resetPlayer(life.vectorFromArray([-17.6, 0, 3]), Math.PI, {persist: false});
      controller.setFirstPerson(true);
      controller.cameraYaw = Math.PI;
      controller.cameraPitch = 0;
      controller.updateCamera(1);
    });
    await page.waitForTimeout(500);
    await page.locator("#renderCanvas").focus();
    await page.keyboard.down("KeyW");
    try {
      await page.getByRole("button", {name:"Stay awake", exact:true}).waitFor({timeout:20_000});
    } finally {
      await page.keyboard.up("KeyW");
    }
  }
  async function sleep() {
    await bedside();
    await page.getByRole("button", {name:"Sleep", exact:true}).click();
    await page.waitForFunction(id => window.storyProbe.starts.includes(id)
      || window.storyProbe.sceneErrors.length, film);
    expect(await page.evaluate(() => window.storyProbe.sceneErrors)).toEqual([]);
    await page.waitForFunction(() => window.storyProbe.director?.activeCutscene, null, {timeout:60_000});
  }
  await idle();
  await verifyReceipt(false);
  await bedside();
  await page.getByRole("button", {name:"Stay awake", exact:true}).click();
  await idle();
  await verifyReceipt(false);
  await sleep();
  await page.waitForTimeout(2400);
  await page.evaluate(() => window.storyProbe.regions.controller.cancel("test-deadline-cancel"));
  await idle();
  await verifyReceipt(false);
  await sleep();
  await page.waitForTimeout(6000);
  await page.screenshot({path:testInfo.outputPath(id + "-film.png")});
  await verifyReceipt(false);
  if (!warning) {
    await page.waitForTimeout(5300);
    await page.screenshot({path:testInfo.outputPath("bad-ending-fuku.png")});
    await page.waitForTimeout(15_000);
    await page.screenshot({path:testInfo.outputPath("bad-ending-courtyard-cast.png")});
    const gameOver = page.locator('.dialogue-overlay[data-presentation="game-over"]');
    await expect(gameOver).toBeVisible({timeout:180_000});
    await expect(gameOver).toContainText("Game Over");
    await verifyReceipt(false);
    await page.screenshot({path:testInfo.outputPath("bad-ending-game-over.png")});
    await gameOver.getByRole("button", {name:"Return to bedroom", exact:true}).click();
  }
  await expect.poll(async () => !!(await read("state")).character.storyFlags[receipt],
    {timeout:180_000, intervals:[500]}).toBe(true);
  await idle();
  const after = await verifyReceipt(true);
  expect(after.worldId).toBe("interior");
  if (warning) {
    const date = new Date(after.storyTimeMs);
    expect(date.toISOString().slice(0, 13)).toBe("1987-04-01T08");
    expect(date.getUTCMinutes()).toBeGreaterThanOrEqual(30);
    expect(date.getUTCMinutes()).toBeLessThan(35);
  }
  await page.reload();
  await enterStoryWorld(page, character.name);
  await idle();
  await verifyReceipt(true);
  expect(await page.evaluate(() => window.storyProbe.starts)).not.toContain(film);
}
