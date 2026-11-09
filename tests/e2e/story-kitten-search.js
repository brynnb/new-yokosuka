import {expect} from "@playwright/test";
import {clickStoryKitten} from "./story-kitten-input.js";

// Prior healing and Chen's meeting are seeded; the report, search interaction,
// name-aware reunion, accepted return, reload and cancellation are real.
export async function verifyKittenSearch(page,testInfo,character,residentClickPoint,enterStoryWorld){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const missing="story.s1.kitten-missing.completed",found="story.s1.kitten-found.completed",before=await saved();
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status),{timeout:30_000}).toBe("idle");expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);};
  const catPosition=()=>page.evaluate(()=>window.storyProbe.lifecycle.sceneState.currentMeshes.find(x=>x.metadata?.runtimeObject?.objectTag==="CATM")?.position.asArray());
  const talk=async()=>{const p=await residentClickPoint(page,"MEGM");expect(p.pickedActor).toBe("MEGM");await page.mouse.click(p.x,p.y);await expect(page.getByText(/hey, megumi/i)).toBeVisible({timeout:30_000});};
  await page.evaluate(()=>window.storyProbe.lifecycle.travelToWorld("yamanose"));await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==="yamanose"&&window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});
  await talk();await page.evaluate(()=>window.storyProbe.regions.controller.cancel("kitten-missing-cancel"));await idle();expect((await saved()).character.storyFlags[missing]).not.toBe(true);expect((await catPosition())[2]).toBeCloseTo(38.52,1);
  await talk();for(let i=0;i<30&&!(await saved()).character.storyFlags[missing];i++){await page.keyboard.press("Space");await page.waitForTimeout(250);}await expect.poll(async()=>(await saved()).character.storyFlags[missing],{timeout:30_000}).toBe(true);await idle();
  await expect.poll(async()=>(await catPosition())?.[2],{timeout:30_000}).toBeCloseTo(72.8,1);await page.screenshot({path:testInfo.outputPath("kitten-reported-missing.png")});
  await page.reload();await enterStoryWorld(page,character.name);await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});
  expect((await saved()).character.storyFlags[missing]).toBe(true);await expect.poll(async()=>(await catPosition())?.[2],{timeout:30_000}).toBeCloseTo(72.8,1);
  {const p=await residentClickPoint(page,"MEGM");expect(p.pickedActor).toBe("MEGM");await page.mouse.click(p.x,p.y);await expect(page.getByText(/didcha.*find mimi/i)).toBeVisible({timeout:30_000});await page.evaluate(()=>window.storyProbe.regions.controller.cancel("kitten-search-wait-cancel"));await idle();expect((await saved()).character.storyFlags[found]).not.toBe(true);}
  const startFind=async()=>{await clickStoryKitten(page,[31.5,.91,74.5]);await page.waitForFunction(()=>window.storyProbe.authoredScene?.active?.scene.id==="s1.ju00.kitten-found"||window.storyProbe.sceneErrors.length,null,{timeout:45_000});expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);};
  await startFind();await expect(page.getByText(/well, there you are/i)).toBeVisible({timeout:20_000});await page.waitForFunction(()=>{const a=window.storyProbe.dialogue?.audio;return a&&!a.paused&&a.currentTime>0;},null,{timeout:20_000});await page.screenshot({path:testInfo.outputPath("kitten-found-lower-stairs.png")});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("kitten-found-cancel"));await idle();expect((await saved()).character.storyFlags[found]).not.toBe(true);expect((await catPosition())[2]).toBeCloseTo(72.8,1);
  const reachReunion=async()=>{await startFind();for(let i=0;i<35&&await page.evaluate(()=>window.storyProbe.authoredScene?.active?.scene.id!=="s1.ju00.kitten-reunion");i++){await page.keyboard.press("Space");await page.waitForTimeout(250);}await page.waitForFunction(()=>window.storyProbe.authoredScene?.active?.scene.id==="s1.ju00.kitten-reunion"||window.storyProbe.sceneErrors.length,null,{timeout:45_000});expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);};
  await reachReunion();await page.screenshot({path:testInfo.outputPath("kitten-reunion-shrine.png")});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("kitten-reunion-cancel"));await idle();expect((await saved()).character.storyFlags[found]).not.toBe(true);expect((await catPosition())[2]).toBeCloseTo(72.8,1);
  await reachReunion();
  for(let i=0;i<40&&!(await saved()).character.storyFlags[found];i++){await page.keyboard.press("Space");await page.waitForTimeout(250);}await expect.poll(async()=>(await saved()).character.storyFlags[found],{timeout:30_000}).toBe(true);await idle();
  const after=await saved();expect(after.character.storyFlags[missing]).toBe(true);expect(after.character.storyFlags["notebook.s1.kitten-found"]).toBe(true);expect(after.character.yen).toBe(before.character.yen);expect(after.inventory).toEqual(before.inventory);
  await expect.poll(async()=>(await catPosition())?.[2],{timeout:30_000}).toBeCloseTo(38.52,1);expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  await page.reload();await enterStoryWorld(page,character.name);await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});
  expect((await saved()).character.storyFlags[found]).toBe(true);await expect.poll(async()=>(await catPosition())?.[2],{timeout:30_000}).toBeCloseTo(38.52,1);
}
