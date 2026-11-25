import {expect} from "@playwright/test";
import {verifyHisaka} from "./story-hisaka.js";

const prefix = "s1.mfsy.mai-alley.";
const completed = "story.s1.mai-alley.completed";
const pending = "story.s1.encounter-recovery.pending";

export async function verifyMaiAlley(page, testInfo, character, enterStoryWorld, mode) {
  if (!["win", "lose", "pipe"].includes(mode)) throw Error("Unknown Mai alley outcome " + mode);
  const win = mode === "win";
  async function saved() {
    const get = async endpoint => {
      const reply = await page.request.get(`/api/characters/${character.id}/${endpoint}`);
      expect(reply.ok()).toBe(true);
      return reply.json();
    };
    const [current, dialogue] = await Promise.all([get("state"), get("dialogue")]);
    const bits = Buffer.from(dialogue.state.banks["2"], "base64");
    return {...current, bit: index => (bits[index >> 3] >> (index % 8)) & 1};
  }
  const initial = await saved();
  for (const bit of [183, 248, 249, 799, 824]) expect(initial.bit(bit)).toBe(0);
  await verifyHisaka(page, testInfo, character, enterStoryWorld, "accept");
  expect((await saved()).bit(248)).toBe(1);
  const place = position => page.evaluate(position => {
    const world = window.storyProbe.lifecycle;
    world.resetPlayer(world.vectorFromArray(position), 0, {persist:false});
  }, position);
  async function stage(branch) {
    await page.waitForFunction(id => window.storyProbe.authoredScene?.active?.scene.id === id
      || window.storyProbe.sceneErrors.length, prefix + branch, {timeout:75000});
    expect(await page.evaluate(() => window.storyProbe.sceneErrors)).toEqual([]);
  }
  async function answer(phase, key) {
    await page.waitForFunction(id => {
      const prompt = window.storyProbe.regions.controller.active?.challengePrompt;
      return (prompt?.id === id && prompt.ready) || window.storyProbe.sceneErrors.length;
    }, prefix + phase, {polling:"raf", timeout:75000});
    expect(await page.evaluate(() => window.storyProbe.sceneErrors)).toEqual([]);
    await page.keyboard.press(key);
  }
  if (!win) {
    await page.evaluate(() => {
      const world = window.storyProbe.lifecycle.worldRuntime;
      const select = world.select;
      window.maiAlleyArrivals = [];
      world.select = function(next, options) {
        const destination = options?.transition?.destination;
        if (destination) window.maiAlleyArrivals.push({
          worldId:destination.worldId, scene:destination.scene, area:destination.area, entry:destination.entry,
        });
        return select.apply(this, arguments);
      };
    });
  }
  await place([-120, 0, 30]);
  await page.waitForTimeout(650);
  await place([-125, 0, 30]);
  await stage("intro");
  await page.waitForFunction(() => {
    const stage = window.storyProbe.authoredScene.active;
    return stage?.actorsBegun && stage.elapsed > 0
      && ["AKIR", "HINA", "ISYM", "NMNO"].every(tag => stage.actors.activeActor(tag)?.root);
  }, null, {timeout:60000});
  await page.screenshot({path:testInfo.outputPath("mai-alley-intro.png")});
  await answer("first", "ArrowLeft");
  await answer("second", mode === "lose" ? "ArrowLeft" : "Enter");
  if (win) {
    await answer("final", "ArrowLeft");
    await stage("win");
    await page.waitForFunction(() => {
      const stage = window.storyProbe.authoredScene.active;
      return stage?.scene.id === "s1.mfsy.mai-alley.win" && stage.elapsed >= 10;
    }, null, {timeout:30000});
    await page.screenshot({path:testInfo.outputPath("mai-alley-victory.png")});
    await stage("win-conversation");
    await expect.poll(async () => (await saved()).character.storyFlags[completed], {timeout:150000}).toBe(true);
    const victory = await saved();
    expect([183,249,799,824].map(victory.bit)).toEqual([1,1,0,0]);
    await verifyHisaka(page, testInfo, character, enterStoryWorld, "report");
  } else {
    if (mode === "pipe") {
      await answer("final", "Enter");
      await answer("final-retry", "Enter");
      await answer("final-last", "Enter");
      await stage("lose");
    } else {
      await answer("second-retry", "ArrowLeft");
      await stage("lose-razor");
    }
    await page.screenshot({path:testInfo.outputPath("mai-alley-" + mode + "-knockout.png")});
    await page.waitForFunction(() => {
      const cut = window.storyProbe.director?.activeCutscene;
      return cut?.cutscene.id === "story-s1-chai-home-recovery"
        && cut.packageRuntime.activityRuntime.active?.currentFrame >= 35;
    }, null, {timeout:90000});
    const knockout = await saved();
    expect(knockout.character.worldId).toBe("interior");
    expect(knockout.character.storyFlags[pending]).toBe(true);
    const arrival = await page.evaluate(() => window.maiAlleyArrivals);
    expect(arrival).toContainEqual({worldId:"interior",scene:1,area:"JOMO",entry:19});
    await testInfo.attach("mai-alley-native-arrival", {body:JSON.stringify(arrival),contentType:"application/json"});
    await page.screenshot({path:testInfo.outputPath("mai-alley-fuku-recovery.png")});
    await expect.poll(async () => Boolean((await saved()).character.storyFlags[pending]), {timeout:120000}).toBe(false);
    expect(await page.evaluate(() => window.storyProbe.starts.filter(id => id === "story-s1-chai-home-recovery"))).toHaveLength(1);
    await page.reload();
    await enterStoryWorld(page, character.name);
    await page.waitForFunction(() => window.storyProbe?.ready && window.storyProbe.regions?.getCharacter()?.id, null, {timeout:120000});
    await page.waitForFunction(() => window.storyProbe.regions.controller.status === "idle"
      && !window.storyProbe.lifecycle.getController().movementLocked);
    expect(await page.evaluate(() => window.storyProbe.starts)).not.toContain("story-s1-chai-home-recovery");
  }
  const finish = await saved();
  expect([183,249,799,824].map(finish.bit)).toEqual(win ? [1,1,1,0] : [0,1,0,1]);
  expect(finish.character.worldId).toBe(win ? "mfsy" : "interior");
  expect(finish.character.yen).toBe(initial.character.yen);
  expect(finish.inventory).toEqual(initial.inventory);
  for (const flag of ["story.s1.chai-arcade.lost", "story.s1.chai-recovery.pending", "story.s1.chai-recovery.completed"]) {
    expect(finish.character.storyFlags[flag]).toBe(initial.character.storyFlags[flag]);
  }
  expect(await page.evaluate(() => window.storyProbe.sceneErrors)).toEqual([]);
}
