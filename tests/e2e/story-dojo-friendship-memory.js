import {expect} from "@playwright/test";
import {useStoryInspectable} from "./story-object-input.js";

// The first dojo scene is seeded; the actual plaque pick, film and receipt
// go through the normal game and server. Travel and walking are shortened.
export async function verifyDojoFriendshipMemory(page,testInfo,character,enterStoryWorld){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const flag="story.s1.dojo-friendship-memory.completed",before=await saved();
  expect(before.character.storyFlags[flag]).not.toBe(true);
  await page.evaluate(()=>window.storyProbe.lifecycle.travelToWorld("exterior"));
  await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==="exterior"&&window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});
  await page.evaluate(()=>{
    window.dojoMemoryVoices=new Set();const original=HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play=function(...args){if(this.src.includes("/hihy/voice/"))this.addEventListener("playing",()=>window.dojoMemoryVoices.add(this.src.split("/").at(-1).split("?")[0]),{once:true});return original.apply(this,args);};
  });
  const idle=()=>expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status),{timeout:30_000}).toBe("idle");
  const start=async()=>{
    await useStoryInspectable(page,{world:"exterior",tag:"GART",position:[6.8,1.06,-18.5],expectedChoice:null});
    await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-dojo-friendship-memory"||window.storyProbe.sceneErrors.length,null,{timeout:60_000});
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
    return page.evaluate(()=>window.storyProbe.actorLeases.findLast(x=>x.scene==="story-s1-dojo-friendship-memory").position);
  };
  await start();await page.waitForTimeout(2000);await page.screenshot({path:testInfo.outputPath("dojo-friendship-start.png")});
  expect(await page.evaluate(()=>[...window.storyProbe.lifecycle.scheduledActors.activityActorSuppressions.values()].some(lease=>lease.codes.has("FUKU")))).toBe(true);
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("dojo-friendship-cancel-check"));await idle();
  expect((await saved()).character.storyFlags[flag]).not.toBe(true);
  expect(await page.evaluate(()=>[...window.storyProbe.lifecycle.scheduledActors.activityActorSuppressions.values()].some(lease=>lease.codes.has("FUKU")))).toBe(false);
  const position=await start();await page.waitForTimeout(10_000);await page.screenshot({path:testInfo.outputPath("dojo-friendship-original.png")});
  await expect.poll(async()=>(await saved()).character.storyFlags[flag],{timeout:150_000}).toBe(true);
  await idle();const after=await saved();expect(after.character.yen).toBe(before.character.yen);expect(after.inventory).toEqual(before.inventory);
  expect(await page.evaluate(()=>[...window.storyProbe.lifecycle.scheduledActors.activityActorSuppressions.values()].some(lease=>lease.codes.has("FUKU")))).toBe(false);
  for(const key of ["story.s1.dojo-handguard-switch.completed","story.s1.dojo-sword-switch.completed"])
    expect(after.character.storyFlags[key]).toBe(before.character.storyFlags[key]);
  expect((await page.evaluate(()=>[...window.dojoMemoryVoices])).length).toBeGreaterThan(1);
  const restored=await page.evaluate(()=>{const l=window.storyProbe.lifecycle,c=l.getController();return{world:l.worldRuntime.activeWorld.id,position:c.collider.position.asArray(),locked:c.movementLocked,firstPerson:c.firstPerson};});
  expect(restored.world).toBe("exterior");expect(restored.locked).toBe(false);expect(restored.firstPerson).toBe(true);
  expect(Math.hypot(...restored.position.map((v,i)=>v-position[i]))).toBeLessThan(.15);
  await page.reload();await enterStoryWorld(page,character.name);
  await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});
  expect((await saved()).character.storyFlags[flag]).toBe(true);
}
