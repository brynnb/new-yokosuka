import {expect} from "@playwright/test";

export async function verifyKittenAdoption(page,testInfo,character,residentClickPoint,enterStoryWorld){
  const requested=process.env.NEW_YOKOSUKA_KITTEN_ADOPTION_NAME||"none";
  if(!["mimi","chibi","tama","none","rejected"].includes(requested))throw Error("Invalid kitten adoption test name");
  const name=["mimi","chibi"].includes(requested)?requested:"tama",label=name[0].toUpperCase()+name.slice(1);
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const before=await saved(),adopted="story.s1.kitten-adopted.completed";expect(before.character.storyFlags[adopted]).not.toBe(true);
  await page.evaluate(()=>window.storyProbe.lifecycle.travelToWorld("yamanose"));
  await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==="yamanose"&&window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});
  const shrineKittenVisible=()=>page.evaluate(()=>{
    const cats=window.storyProbe.lifecycle.sceneState.currentMeshes.filter(root=>root.metadata?.runtimeObject?.objectTag==="CATM");
    return {count:cats.length,visible:cats.some(root=>root.isEnabled())};
  });
  await expect.poll(shrineKittenVisible,{timeout:30_000}).toEqual({count:1,visible:true});
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status),{timeout:30_000}).toBe("idle");expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);};
  const talk=async()=>{const p=await residentClickPoint(page,"MEGM");expect(p.pickedActor).toBe("MEGM");await page.mouse.click(p.x,p.y);await page.waitForFunction(()=>window.storyProbe.dialogue?.active||window.storyProbe.sceneErrors.length,null,{timeout:30_000});expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);};
  // The day of the roof visit is not yet eligible. Another normal Megumi
  // conversation may be selected instead; cancelling it saves nothing.
  await talk();expect(await page.getByText(/my mommy said i can keep/i).count()).toBe(0);
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("adoption-same-day-check"));await idle();expect((await saved()).character.storyFlags[adopted]).not.toBe(true);
  const previous=(await saved()).worldState.gameTimeMs;
  await page.locator("#story-wait-button").click();await page.getByRole("option",{name:"Wait until tomorrow morning",exact:true}).click();await page.getByRole("button",{name:"Wait until tomorrow morning",exact:true}).click();await expect.poll(async()=>(await saved()).worldState.gameTimeMs).toBeGreaterThan(previous);await idle();
  const intro=async()=>{await talk();await expect(page.getByText(new RegExp(`my mommy said i can keep\\s+${label}`,"i"))).toBeVisible({timeout:20_000});};
  await intro();await page.screenshot({path:testInfo.outputPath(`kitten-adoption-${name}.png`)});
  await page.waitForFunction(()=>{const a=window.storyProbe.dialogue?.audio;return a&&!a.paused&&a.currentTime>0;},null,{timeout:20_000});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("adoption-cancel-check"));await idle();
  const cancelled=await saved();expect(cancelled.character.storyFlags[adopted]).not.toBe(true);if(requested==="none"||requested==="rejected")expect(cancelled.character.storyFlags["story.s1.kitten-name.tama"]).not.toBe(true);
  await intro();for(let i=0;i<20&&!(await saved()).character.storyFlags[adopted];i++){await page.waitForTimeout(200);await page.keyboard.press("Space");}
  await expect.poll(async()=>(await saved()).character.storyFlags[adopted],{timeout:30_000}).toBe(true);await idle();
  const after=await saved();expect(after.character.storyFlags[`story.s1.kitten-name.${name}`]).toBe(true);expect(after.character.yen).toBe(before.character.yen);expect(after.inventory).toEqual(before.inventory);
  const shrineResidentVisible=()=>page.evaluate(()=>{const e=window.storyProbe.lifecycle.scheduledActors.entries.find(x=>x.definition.instanceId==="MEGM:story-shrine");return !!e?.root?.isEnabled();});
  await expect.poll(shrineResidentVisible,{timeout:30_000}).toBe(false);await expect.poll(shrineKittenVisible,{timeout:30_000}).toEqual({count:1,visible:false});await page.screenshot({path:testInfo.outputPath("kitten-adoption-shrine-after.png")});
  await page.reload();await enterStoryWorld(page,character.name);await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});
  const reloaded=await saved();expect(reloaded.character.storyFlags[adopted]).toBe(true);expect(reloaded.character.storyFlags[`story.s1.kitten-name.${name}`]).toBe(true);await expect.poll(shrineResidentVisible,{timeout:30_000}).toBe(false);await expect.poll(shrineKittenVisible,{timeout:30_000}).toEqual({count:1,visible:false});expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
}
