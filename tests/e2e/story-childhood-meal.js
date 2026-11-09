import {expect} from "@playwright/test";
import {useStoryInspectable} from "./story-object-input.js";

// Opening and the first allowance are seeded in the isolated database. The
// actual table pick, film, cancellation, settlement and reload use game UI.
export async function verifyChildhoodMeal(page,testInfo,character,enterStoryWorld){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const flag="story.s1.childhood-meal.completed",before=await saved();
  expect(before.character.worldId).toBe("interior");expect(before.character.storyFlags[flag]).not.toBe(true);
  await page.evaluate(()=>{
    window.mealVoices=new Set();const original=HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play=function(...args){
      if(this.src.includes("/childhood-meal/voice/"))this.addEventListener("playing",()=>window.mealVoices.add(this.src.split("/").at(-1).split("?")[0]),{once:true});
      return original.apply(this,args);
    };
  });
  const idle=()=>expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status),{timeout:30_000}).toBe("idle");
  const start=async()=>{
    await useStoryInspectable(page,{world:"interior",tag:"sykj",position:[-10.6,0,-1.2],expectedChoice:null});
    await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-childhood-meal"||window.storyProbe.sceneErrors.length,null,{timeout:60_000});
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  };
  await start();await page.waitForTimeout(2500);
  expect(await page.evaluate(()=>window.storyProbe.director.activeCutscene.packageRuntime.sceneObjects.objects.get("SYKJ").root.isEnabled())).toBe(false);
  await page.screenshot({path:testInfo.outputPath("childhood-meal-initial.png")});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("childhood-meal-cancel-check"));await idle();
  expect((await saved()).character.storyFlags[flag]).not.toBe(true);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.scene.meshes.find(m=>m.metadata?.runtimeObject?.objectTag==="sykj")?.metadata.runtimeObject.root.isEnabled(false))).toBe(true);
  await start();await page.waitForTimeout(5000);
  await page.screenshot({path:testInfo.outputPath("childhood-meal-original.png")});
  const objects=await page.evaluate(()=>{
    const p=window.storyProbe.director.activeCutscene.packageRuntime.sceneObjects;
    return ["GOHI","NINJ","NIMR"].map(tag=>({tag,enabled:p.objects.get(tag)?.root.isEnabled()}));
  });
  expect(objects.every(o=>o.enabled)).toBe(true);
  await expect.poll(async()=>(await saved()).character.storyFlags[flag],{timeout:120_000}).toBe(true);
  expect((await page.evaluate(()=>[...window.mealVoices])).sort()).toEqual(["A0122A001.wav","A0122A002.wav","A0122B001.wav","A0122B002.wav","A0122B003.wav","A0122B004.wav"]);
  await idle();const after=await saved();expect(after.character.yen).toBe(before.character.yen);expect(after.inventory).toEqual(before.inventory);
  await page.reload();await enterStoryWorld(page,character.name);
  await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});
  expect((await saved()).character.storyFlags[flag]).toBe(true);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
}
