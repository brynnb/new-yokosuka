import {expect} from "@playwright/test";

// Previous Nozomi park visit/day are seeded. The bar dialogue, transition and
// home visit are triggered through the actual personal Story event system.
export async function verifyFriendsBar(page,testInfo,character){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const flag="story.s1.friends-bar-lead.completed",visit="story.s1.friends-visit.completed",before=await saved();
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status),{timeout:30_000}).toBe("idle");expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);};
  const stage=()=>page.waitForFunction(()=>window.storyProbe.authoredScene?.active?.scene.id==="s1.dbyo.friends-lead"||window.storyProbe.sceneErrors.length,null,{timeout:60_000});
  await page.evaluate(()=>window.storyProbe.lifecycle.travelToWorld("dbyo"));await stage();
  expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  await page.waitForFunction(()=>{const a=window.storyProbe.dialogue?.audio;return a&&!a.paused&&a.currentTime>0;},null,{timeout:20_000});
  await page.screenshot({path:testInfo.outputPath("friends-bar-original-voices.png")});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("friends-bar-cancel"));await idle();
  expect((await saved()).character.storyFlags[flag]).not.toBe(true);expect(await page.evaluate(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id)).toBe("dbyo");
  await page.evaluate(()=>{const l=window.storyProbe.lifecycle;l.resetPlayer(l.vectorFromArray([-6.3,0,-.9]),0,{persist:false});});await page.waitForTimeout(700);
  await page.evaluate(()=>{const l=window.storyProbe.lifecycle,c=l.getController();l.resetPlayer(l.vectorFromArray([-3.2,0,-.9]),0,{persist:false});c.setFirstPerson(true);c.updateCamera(1);});
  await stage();expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  for(let i=0;i<40&&!(await saved()).character.storyFlags[flag];i++){await page.keyboard.press("Space");await page.waitForTimeout(350);}
  await expect.poll(async()=>(await saved()).character.storyFlags[flag],{timeout:40_000}).toBe(true);
  await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==="interior"&&window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});
  expect((await saved()).character.storyFlags[visit]).not.toBe(true);
  const choice=page.getByRole("button",{name:"Visit with your friends",exact:true});await expect(choice).toBeVisible({timeout:30_000});await choice.click();
  for(const id of ["story-s1-friends-visit-arrival","story-s1-friends-visit-departure"]){
    await page.waitForFunction(id=>window.storyProbe.director?.activeCutscene?.cutscene.id===id||window.storyProbe.sceneErrors.length,id,{timeout:90_000});
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);await page.keyboard.press("KeyX");
  }
  await expect.poll(async()=>(await saved()).character.storyFlags[visit],{timeout:30_000}).toBe(true);await idle();
  const after=await saved();expect(after.character.yen).toBe(before.character.yen);expect(after.inventory).toEqual(before.inventory);expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
}
