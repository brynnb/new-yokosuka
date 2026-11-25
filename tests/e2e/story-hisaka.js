import {expect} from "@playwright/test";

const stand = [-3, 0, 105];
const outside = [-12, 0, 105];
const choices = {accept: "I'll try.", decline: "I'm sorry, but..."};

export async function verifyHisaka(page, testInfo, character, enterStoryWorld, mode) {
  const report = mode === "report";
  if (!report && !Object.hasOwn(choices, mode)) throw Error("Unknown Hisaka review mode " + mode);
  const first = report ? "report" : "request";
  const receipt = "story.s1.hisaka-" + first + ".completed";
  const routes = {accept: 248, decline: 600, report: 799};
  const data = async path => {
    const response = await page.request.get("/api/characters/" + character.id + "/" + path);
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const saved = async () => {
    const [{character: state}, dialogue] = await Promise.all([data("state"), data("dialogue")]);
    const bank = Buffer.from(dialogue.state.banks["2"] || "", "base64");
    const flags = Object.fromEntries(Object.entries(routes).map(([id, bit]) => [id, ((bank[bit >> 3] || 0) >> (bit % 8)) & 1]));
    return {state, flags};
  };
  const original = await saved();
  expect(original.state.storyFlags[receipt]).not.toBe(true);
  expect(original.flags[mode]).toBe(0);
  const place = async position => {
    await page.evaluate(position => {
      const l = window.storyProbe.lifecycle;
      l.resetPlayer(l.vectorFromArray(position), 0, {persist: false});
    }, position);
    await page.waitForTimeout(650);
  };
  const idle = () => page.waitForFunction(() => {
    const p = window.storyProbe;
    return p?.ready && p.regions?.controller.status === "idle" && !p.director?.activeCutscene
      && !p.lifecycle.getController().movementLocked;
  }, null, {timeout: 90_000});
  const film = async (part, frame = 15) => {
    await page.waitForFunction(({part, frame}) => {
      const p = window.storyProbe, cut = p.director?.activeCutscene;
      if (p.sceneErrors.length) return true;
      if (cut?.cutscene.id !== "story-s1-hisaka-" + part) return false;
      const pkg = cut.packageRuntime;
      const actor = pkg.actors.activeActor("HISA")?.model;
      return pkg.activityRuntime.active?.currentFrame >= frame
        && actor?.renderMeshes.some(mesh => mesh.isEnabled() && p.lifecycle.scene.isActiveMesh(mesh));
    }, {part, frame}, {timeout: 100_000});
    expect(await page.evaluate(() => window.storyProbe.sceneErrors)).toEqual([]);
  };
  if (await page.evaluate(() => window.storyProbe.lifecycle.worldRuntime.activeWorld.id !== "mfsy")) {
    await page.evaluate(() => window.storyProbe.lifecycle.travelToWorld("mfsy"));
  }
  await page.waitForFunction(() => window.storyProbe.lifecycle.worldRuntime.ready
    && window.storyProbe.lifecycle.worldRuntime.activeWorld.id === "mfsy");
  await place(outside);
  await place(stand);
  await film(first);
  await page.evaluate(() => window.storyProbe.regions.controller.cancel("hisaka-review-cancel"));
  await idle();
  const cancelled = await saved();
  expect(cancelled.state.storyFlags).toEqual(original.state.storyFlags);
  expect(cancelled.flags).toEqual(original.flags);
  await place(outside);
  await place(stand);
  await film(first);
  await page.screenshot({path: testInfo.outputPath("hisaka-" + first + "-" + mode + ".png")});
  await page.keyboard.press("KeyX");
  if (!report) {
    const button = page.getByRole("button", {name: choices[mode], exact: true});
    await expect(button).toBeVisible({timeout: 100_000});
    expect((await saved()).flags).toEqual(original.flags);
    await button.click();
    await film(mode);
    await page.screenshot({path: testInfo.outputPath("hisaka-response-" + mode + ".png")});
    await page.keyboard.press("KeyX");
  }
  await expect.poll(async () => (await saved()).state.storyFlags[receipt], {timeout: 60_000}).toBe(true);
  await idle();
  const settled = await saved();
  expect(settled.flags).toEqual({...original.flags, [mode]: 1});
  expect(settled.state.yen).toBe(original.state.yen);
  if (!report) expect(settled.state.storyFlags["story.s1.hisaka-request." + (mode === "accept" ? "accepted" : "declined")]).toBe(true);
  await page.reload();
  await enterStoryWorld(page, character.name);
  await idle();
  await place(outside);
  await place(stand);
  await idle();
  expect(await page.evaluate(() => window.storyProbe.starts)).not.toContain("story-s1-hisaka-" + first);
  const reloaded = await saved();
  expect(reloaded.flags).toEqual(settled.flags);
  expect(reloaded.state.storyFlags).toEqual(settled.state.storyFlags);
}
