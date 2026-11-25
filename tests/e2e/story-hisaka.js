import {expect} from "@playwright/test";
import {observeLunch, verifyLunchDelivery, waitForLunchLine} from "./story-hisaka-lunch.js";

const stand = [-3, 0, 105];
const outside = [-12, 0, 105];
const choices = {accept: "I'll try.", decline: "I'm sorry, but..."};

export async function verifyHisaka(page, testInfo, character, enterStoryWorld, mode) {
  const legacy = mode === "legacy";
  const report = mode === "report" || legacy;
  if (!report && !Object.hasOwn(choices, mode)) throw Error("Unknown Hisaka review mode " + mode);
  const first = report ? "report" : "request";
  const receipt = "story.s1.hisaka-" + first + ".completed";
  const lunchDone = "story.s1.hisaka-lunches.completed";
  const routes = {accept: 248, decline: 600, lunch:798, report: 799};
  const data = async path => {
    const response = await page.request.get("/api/characters/" + character.id + "/" + path);
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const saved = async () => {
    const [{character: state, inventory}, dialogue] = await Promise.all([data("state"), data("dialogue")]);
    const bank = Buffer.from(dialogue.state.banks["2"] || "", "base64");
    const flags = Object.fromEntries(Object.entries(routes).map(([id, bit]) => [id, ((bank[bit >> 3] || 0) >> (bit % 8)) & 1]));
    return {state, flags, inventory};
  };
  const original = await saved();
  expect(Boolean(original.state.storyFlags[receipt])).toBe(legacy);
  expect(original.flags[report?"report":mode]).toBe(legacy?1:0);
  if(report){
    expect(original.state.storyFlags[lunchDone]).not.toBe(true);
    expect(original.flags.lunch).toBe(0);
  }
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
  const enter = async () => {
    await place(outside);
    if (report) await observeLunch(page);
    await place(stand);
    if (!legacy) await film(first);
  };
  await enter();
  if (report) {
    if (!legacy) await page.keyboard.press("KeyX");
    await waitForLunchLine(page, 6);
    await page.screenshot({path:testInfo.outputPath("hisaka-lunch-guards.png")});
    await page.evaluate(()=>window.stopOriginalDialogue());
  }
  await page.evaluate(() => window.storyProbe.regions.controller.cancel("hisaka-review-cancel"));
  await idle();
  const cancelled = await saved();
  expect(cancelled.state.storyFlags).toEqual(original.state.storyFlags);
  expect(cancelled.flags).toEqual(original.flags);
  await enter();
  if (!legacy) {
    await page.screenshot({path: testInfo.outputPath("hisaka-" + first + "-" + mode + ".png")});
    await page.keyboard.press("KeyX");
  }
  if (report) {
    await verifyLunchDelivery(page, testInfo);
    await expect.poll(async () => (await saved()).state.storyFlags[lunchDone], {timeout:60_000}).toBe(true);
  }
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
  expect(settled.flags).toEqual(report ? {...original.flags, lunch:1, report:1} : {...original.flags,[mode]:1});
  expect(settled.state.yen).toBe(original.state.yen);
  expect(settled.inventory).toEqual(original.inventory);
  if (legacy) expect(await page.evaluate(() => window.storyProbe.starts)).not.toContain("story-s1-hisaka-report");
  if (!report) expect(settled.state.storyFlags["story.s1.hisaka-request." + (mode === "accept" ? "accepted" : "declined")]).toBe(true);
  await page.reload();
  await enterStoryWorld(page, character.name);
  await idle();
  await place(outside);
  await place(stand);
  await idle();
  expect(await page.evaluate(() => window.storyProbe.starts)).not.toContain("story-s1-hisaka-" + first);
  if (report) expect(await page.evaluate(() => window.storyProbe.authoredScene?.active?.scene.id ?? null)).toBeNull();
  const reloaded = await saved();
  expect(reloaded.flags).toEqual(settled.flags);
  expect(reloaded.state.storyFlags).toEqual(settled.state.storyFlags);
}
