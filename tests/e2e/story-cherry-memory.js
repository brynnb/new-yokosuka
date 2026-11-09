import {expect} from "@playwright/test";

// Opening and first allowance are seeded, but the entrance is crossed by W;
// the scene, cancellation, receipt and reload use the real Story flow.
export async function verifyCherryMemory(page,testInfo,character,enterStoryWorld){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const flag="story.s1.cherry-memory.completed",before=await saved();
  expect(before.character.storyFlags[flag]).not.toBe(true);
  await page.evaluate(()=>window.storyProbe.lifecycle.travelToWorld("exterior"));
  await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==="exterior"&&window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});
  await page.evaluate(()=>{
    window.cherryVoices=new Set();const original=HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play=function(...args){if(this.src.includes("/sakr/voice/"))this.addEventListener("playing",()=>window.cherryVoices.add(this.src.split("/").at(-1).split("?")[0]),{once:true});return original.apply(this,args);};
  });
  const idle=()=>expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status),{timeout:30_000}).toBe("idle");
  const approach=async()=>{
    await page.evaluate(()=>{const l=window.storyProbe.lifecycle,c=l.getController();l.resetPlayer(l.vectorFromArray([-2.3,0,-25]),0,{persist:false});c.setFirstPerson(true);c.cameraYaw=Math.PI/2;c.cameraPitch=0;c.updateCamera(1);});
    await page.waitForTimeout(1000);await page.keyboard.down("KeyW");
    try{await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-cherry-memory"||window.storyProbe.sceneErrors.length,null,{timeout:30_000});}
    finally{await page.keyboard.up("KeyW");}
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
    return page.evaluate(()=>window.storyProbe.actorLeases.findLast(x=>x.scene==="story-s1-cherry-memory").position);
  };
  await approach();await page.waitForTimeout(3000);await page.screenshot({path:testInfo.outputPath("cherry-memory-start.png")});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("cherry-memory-cancel-check"));await idle();
  expect((await saved()).character.storyFlags[flag]).not.toBe(true);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id)).toBe("exterior");
  const startPosition=await approach();await page.waitForTimeout(9000);
  await page.screenshot({path:testInfo.outputPath("cherry-memory-original.png")});
  await expect.poll(async()=>(await saved()).character.storyFlags[flag],{timeout:150_000}).toBe(true);
  await idle();const after=await saved();expect(after.character.yen).toBe(before.character.yen);expect(after.inventory).toEqual(before.inventory);
  expect((await page.evaluate(()=>[...window.cherryVoices])).length).toBeGreaterThan(1);
  const restored=await page.evaluate(()=>{const l=window.storyProbe.lifecycle,c=l.getController();return{world:l.worldRuntime.activeWorld.id,position:c.collider.position.asArray(),locked:c.movementLocked,firstPerson:c.firstPerson};});
  expect(restored.world).toBe("exterior");expect(restored.locked).toBe(false);expect(restored.firstPerson).toBe(true);
  expect(Math.hypot(...restored.position.map((v,i)=>v-startPosition[i]))).toBeLessThan(0.15);
  await page.reload();await enterStoryWorld(page,character.name);
  await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});
  expect((await saved()).character.storyFlags[flag]).toBe(true);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
}
