import {expect} from "@playwright/test";

const prefix = "s1.d000.drunkard.";
const completed = "story.s1.dobuita-drunkard.completed";
const pendingRecovery = "story.s1.encounter-recovery.pending";

// The fixture earns the previous story milestone. Encounter choices and both
// kinds of home arrival always go through the normal client and server.
export async function verifyDobuitaDrunkard(page, testInfo, character, enterStoryWorld, mode) {
  if (!["success", "grapple", "recovery", "curfew"].includes(mode)) throw Error("Unknown E1005 outcome " + mode);
  const read = async () => {
    const response = await page.request.get(`/api/characters/${character.id}/state`);
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const initial = await read();
  const errors = async () => expect(await page.evaluate(() => window.storyProbe.sceneErrors)).toEqual([]);
  async function approach() {
    await page.evaluate(() => {
      const l = window.storyProbe.lifecycle;
      const c = l.getController();
      l.resetPlayer(l.vectorFromArray([113.58, .1, 101.70]), -4, {persist:false});
      c.setFirstPerson(true);
      c.cameraYaw = -4 - Math.PI;
      c.cameraPitch = 0;
      c.updateCamera(1);
    });
    await page.locator("#renderCanvas").focus();
    await page.keyboard.down("KeyW");
    try {
      await page.waitForFunction((id) => window.storyProbe.authoredScene?.active?.scene.id === id
        || window.storyProbe.sceneErrors.length, prefix + "intro", {timeout:35000});
    } finally {
      await page.keyboard.up("KeyW");
    }
    await errors();
  }
  async function respond(phase, key) {
    const id = prefix + phase;
    // Poll inside the browser; the retail response window is shorter than a
    // Playwright polling loop that waits on the network or captures a frame.
    await page.waitForFunction((id) => {
      const p = window.storyProbe.regions.controller.active?.challengePrompt;
      return (p?.id === id && p.ready) || window.storyProbe.sceneErrors.length;
    }, id, {polling:"raf",timeout:60000});
    await page.keyboard.press(key);
    await errors();
  }
  async function staged(branch) {
    await page.waitForFunction(id => window.storyProbe.authoredScene?.active?.scene.id === id
      || window.storyProbe.sceneErrors.length, prefix + branch, {timeout:45000});
    await errors();
  }
  const grappleLines = {
    E1005B003:"You wanna drink with me?",E1005B004:"You're no fun.",
    E1005B005:"Come on, kid.",E1005B006:"Let me buy you a drink.",
  };
  if (mode === "grapple") {
    await page.evaluate(async ids => {
      const presenter = window.storyProbe.regions.controller.dialogue;
      const urls = new Map(await Promise.all(ids.map(async id =>
        [await presenter.voiceManifest.urlFor(id), id])));
      const samples = [];
      const timer = setInterval(() => {
        const audio = presenter.audio;
        if (!audio || audio.paused || audio.currentTime <= 0) return;
        const id = urls.get(audio.src);
        if (id && samples.at(-1)?.id !== id) samples.push({id, line:document.querySelector("#dialogue-source").textContent.trim()});
      },25);
      window.finishDrunkardGrappleTrace = () => { clearInterval(timer); return samples; };
    }, Object.keys(grappleLines));
  }
  await approach();
  if (mode === "success") {
    await page.waitForFunction(() => {
      const a = window.storyProbe.regions.controller.dialogue?.audio;
      return a && !a.paused && a.currentTime > 0;
    }, null, {timeout:20000});
    const pose = await page.evaluate(() => window.storyProbe.authoredScene.active.snapshot.position);
    await page.evaluate(() => window.storyProbe.regions.controller.cancel("e1005-cancel-before-input"));
    await expect.poll(() => page.evaluate(() => window.storyProbe.regions.controller.status)).toBe("idle");
    const restored = await page.evaluate(() => window.storyProbe.lifecycle.capturePlayerReturnState().position);
    expect(Math.hypot(...restored.map((v,i) => v-pose[i]))).toBeLessThan(.25);
    expect((await read()).character.storyFlags[completed]).not.toBe(true);
    await approach();
  }
  const grapple = mode === "grapple" || mode === "curfew";
  await respond("front", grapple ? "ArrowLeft" : "Enter");
  await staged(grapple ? "front-miss" : "front-pass");
  if (grapple) {
    if (mode === "grapple") {
      await staged("grapple-lead");
      const angle = async () => {
        const shot = await page.waitForFunction(id => {
          const stage=window.storyProbe.authoredScene.active;
          return stage?.scene.id===id && stage.shot?.cameraNumber;
        },prefix+"grapple-lead",{timeout:20000});
        const number = await shot.jsonValue();
        await shot.dispose();
        return number;
      };
      expect(await angle()).toBe(8502);
      await respond("grapple","ArrowLeft");
      await staged("grapple-miss");
      await staged("grapple-lead");
      const retryCamera=await angle();
      expect([8515,8516]).toContain(retryCamera);
      await testInfo.attach("dobuita-drunkard-grapple-cameras",{body:JSON.stringify([8502,retryCamera]),contentType:"application/json"});
    }
    await respond("grapple", mode === "curfew" ? "ArrowLeft" : "Shift");
    await staged(mode === "curfew" ? "grapple-miss" : "grapple-pass");
    if (mode === "grapple") {
      const played = await page.evaluate(() => window.finishDrunkardGrappleTrace());
      expect(played).toHaveLength(4);
      expect(new Set(played.map(cue=>cue.id)).size).toBe(4);
      for (const cue of played) expect(cue.line).toBe(grappleLines[cue.id]);
      await testInfo.attach("dobuita-drunkard-grapple-voices",{body:JSON.stringify(played),contentType:"application/json"});
    }
  }
  if (mode !== "curfew") {
    await respond("rear", mode === "recovery" ? "Enter" : "ArrowLeft");
    await staged(mode === "recovery" ? "rear-miss" : "rear-pass");
    await page.screenshot({path:testInfo.outputPath("dobuita-drunkard-" + mode + ".png")});
  }
  const win = mode === "grapple" || mode === "success";
  if (win) {
    await expect.poll(async () => (await read()).character.storyFlags[completed], {timeout:90000}).toBe(true);
  } else {
    await expect.poll(async () => (await read()).character.worldId, {timeout:90000}).toBe("interior");
    if (mode === "recovery") {
      await page.waitForFunction(() => window.storyProbe.director?.activeCutscene?.cutscene.id === "story-s1-chai-home-recovery"
        || window.storyProbe.sceneErrors.length, null, {timeout:90000});
      await errors();
      expect((await read()).character.storyFlags[pendingRecovery]).toBe(true);
      await page.screenshot({path:testInfo.outputPath("dobuita-drunkard-fuku-recovery.png")});
      await expect.poll(async () => Boolean((await read()).character.storyFlags[pendingRecovery]), {timeout:120000}).toBe(false);
    }
  }
  await page.reload();
  await enterStoryWorld(page, character.name);
  const after = await read();
  expect(after.character.worldId).toBe(win ? "dobuita" : "interior");
  expect(Boolean(after.character.storyFlags[completed])).toBe(win);
  if (mode === "recovery") {
    const nextDay = new Date(initial.character.storyTimeMs);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    expect(new Date(after.character.storyTimeMs).toISOString().slice(0,10)).toBe(nextDay.toISOString().slice(0,10));
  }
  expect(after.character.storyFlags[pendingRecovery]).not.toBe(true);
  for (const flag of ["story.s1.chai-recovery.completed", "story.s1.chai-recovery.pending", "story.s1.chai-arcade.lost"]) {
    expect(after.character.storyFlags[flag]).toBe(initial.character.storyFlags[flag]);
  }
  expect(after.character.yen).toBe(initial.character.yen);
  expect(after.inventory).toEqual(initial.inventory);
  await errors();
}
