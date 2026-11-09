import {expect} from "@playwright/test";

// The park milestone and previous personal day are seeded on an isolated
// character; scene entry, cancellation, original playback and settlement are real.
export async function verifyFriendsVisit(page,testInfo,character,enterStoryWorld){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const done="story.s1.friends-visit.completed",before=await saved();
  expect(before.character.worldId).toBe("interior");expect(before.character.storyFlags[done]).not.toBe(true);
  await page.evaluate(()=>{window.friendVoices=new Set();const original=HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play=function(...args){if(this.src.includes("/friends-visit-")&&this.src.includes("/voice/"))this.addEventListener("playing",()=>window.friendVoices.add(this.src.split("/").at(-1).split("?")[0]),{once:true});return original.apply(this,args);};});
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status),{timeout:30_000}).toBe("idle");expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);};
  const approach=async()=>{
    await page.evaluate(()=>{const l=window.storyProbe.lifecycle,c=l.getController();l.resetPlayer(l.vectorFromArray([-16.9,0,2.2]),0,{persist:false});c.setFirstPerson(true);c.cameraYaw=0;c.cameraPitch=0;c.updateCamera(1);});
    await page.waitForTimeout(400);await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
    try{await page.getByRole("button",{name:"Visit with your friends",exact:true}).waitFor({timeout:30_000});}finally{await page.keyboard.up("KeyW");}
  };
  const scene=async id=>{await page.waitForFunction(id=>window.storyProbe.director?.activeCutscene?.cutscene.id===id||window.storyProbe.sceneErrors.length,id,{timeout:90_000});expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);};
  const start=async()=>{await approach();await page.getByRole("button",{name:"Visit with your friends",exact:true}).click();await scene("story-s1-friends-visit-arrival");};
  await start();await page.waitForTimeout(3500);await page.screenshot({path:testInfo.outputPath("friends-arrival.png")});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("friends-arrival-cancel"));await idle();expect((await saved()).character.storyFlags[done]).not.toBe(true);
  await start();await page.keyboard.press("KeyX");await scene("story-s1-friends-visit-departure");await page.waitForTimeout(2500);await page.screenshot({path:testInfo.outputPath("friends-departure.png")});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("friends-departure-cancel"));await idle();expect((await saved()).character.storyFlags[done]).not.toBe(true);
  await start();await scene("story-s1-friends-visit-departure");await expect.poll(async()=>(await saved()).character.storyFlags[done],{timeout:60_000}).toBe(true);await idle();
  expect((await page.evaluate(()=>[...window.friendVoices])).length).toBeGreaterThanOrEqual(12);
  const after=await saved();expect(after.character.yen).toBe(before.character.yen);expect(after.inventory).toEqual(before.inventory);expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  await page.reload();await enterStoryWorld(page,character.name);await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});expect((await saved()).character.storyFlags[done]).toBe(true);
}
