import {expect} from "@playwright/test";

// Opening/first dojo are seeded; use real walking, visible geometry, NPC
// picking, conversations and server settlements for the full side story.
export async function verifyYamamotoStory(page,testInfo,character,residentClickPoint,enterStoryWorld){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const request="story.s1.yamamoto-request.completed",plate="story.s1.yamamoto-nameplate.completed",escort="story.s1.yamamoto-escort.completed";
  const before=await saved();expect(before.character.storyFlags[request]).not.toBe(true);
  await page.evaluate(()=>window.storyProbe.lifecycle.travelToWorld("sakuragaoka"));
  await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==="sakuragaoka"&&window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});
  const idle=()=>expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status),{timeout:30_000}).toBe("idle");
  const noErrors=async()=>expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const advanceUntil=async flag=>{
    for(let i=0;i<45&&!(await saved()).character.storyFlags[flag];i++){await page.waitForTimeout(300);await page.keyboard.press("Space");}
    await expect.poll(async()=>(await saved()).character.storyFlags[flag],{timeout:30_000}).toBe(true);await idle();await noErrors();
  };
  const approach=async()=>{
    await page.evaluate(()=>{const l=window.storyProbe.lifecycle,c=l.getController();l.resetPlayer(l.vectorFromArray([-10.2,0,30.5]),0,{persist:false});c.setFirstPerson(true);c.cameraYaw=0;c.cameraPitch=0;c.updateCamera(1);});
    await page.waitForTimeout(800);await page.keyboard.down("KeyW");
    try{await page.waitForFunction(()=>window.storyProbe.dialogue?.active||window.storyProbe.sceneErrors.length,null,{timeout:40_000});}
    finally{await page.keyboard.up("KeyW");}await noErrors();
  };
  await approach();await page.screenshot({path:testInfo.outputPath("yamamoto-street.png")});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("yamamoto-request-check"));await idle();
  expect((await saved()).character.storyFlags[request]).not.toBe(true);
  await approach();await advanceUntil(request);
  await page.waitForFunction(()=>window.storyProbe.lifecycle.scheduledActors.dialogueActor("KAME")?.instanceId==="KAME:story-park",null,{timeout:30_000});
  const personal=await page.evaluate(()=>window.storyProbe.lifecycle.scheduledActors.dialogueActor("KAME"));
  expect(personal.position[0]).toBeCloseTo(-19.2,0);expect(personal.position[2]).toBeCloseTo(-8.7,0);
  const talk=async()=>{const point=await residentClickPoint(page,"KAME");expect(point.pickedActor).toBe("KAME");await page.mouse.click(point.x,point.y);await page.waitForFunction(()=>window.storyProbe.dialogue?.active||window.storyProbe.sceneErrors.length,null,{timeout:25_000});await noErrors();};
  await talk();await page.evaluate(()=>window.storyProbe.regions.controller.cancel("yamamoto-wait-check"));await idle();
  expect((await saved()).character.storyFlags[plate]).not.toBe(true);
  const clickPlate=async()=>{
    await page.evaluate(()=>{const l=window.storyProbe.lifecycle,c=l.getController();l.resetPlayer(l.vectorFromArray([-12,0,1.5]),0,{persist:false});c.setFirstPerson(true);c.cameraYaw=-Math.PI/2;c.cameraPitch=0;c.updateCamera(1);});
    await page.waitForTimeout(500);
    const point=await page.evaluate(()=>{const l=window.storyProbe.lifecycle,s=l.nativeStoryRuntime.storyObjects,r=l.engine.getRenderingCanvas().getBoundingClientRect();for(let x=490;x<=570;x+=5)for(let y=410;y<=500;y+=5){const p=l.scene.pick(x,y,m=>s.isSurfaceMesh(m),false,l.scene.activeCamera);if(s.pickSurface(p)?.objectTag==="YAMN"&&r.x+x<1024)return{x:r.x+x,y:r.y+y};}return null;});
    expect(point).not.toBeNull();console.info("Yamamoto surface pick",point);await page.mouse.click(point.x,point.y);
    await page.waitForFunction(()=>window.storyProbe.dialogue?.active||window.storyProbe.sceneErrors.length,null,{timeout:25_000});await noErrors();
  };
  await clickPlate();await page.screenshot({path:testInfo.outputPath("yamamoto-nameplate.png")});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("yamamoto-plate-check"));await idle();expect((await saved()).character.storyFlags[plate]).not.toBe(true);
  await clickPlate();await advanceUntil(plate);
  const startEscort=async()=>{
    await talk();for(let i=0;i<8;i++){if(await page.evaluate(()=>window.storyProbe.authoredScene?.active?.scene.id==="s1.jd00.yamamoto-escort"))break;await page.waitForTimeout(300);await page.keyboard.press("Space");}
    await page.waitForFunction(()=>window.storyProbe.authoredScene?.active?.scene.id==="s1.jd00.yamamoto-escort"||window.storyProbe.sceneErrors.length,null,{timeout:30_000});await noErrors();
  };
  await startEscort();await page.waitForTimeout(3000);await page.screenshot({path:testInfo.outputPath("yamamoto-escort.png")});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("yamamoto-escort-check"));await idle();expect((await saved()).character.storyFlags[escort]).not.toBe(true);
  await startEscort();await page.waitForTimeout(8000);await page.screenshot({path:testInfo.outputPath("yamamoto-escort-midway.png")});await page.waitForTimeout(6000);await advanceUntil(escort);
  const after=await saved();expect(after.character.yen).toBe(before.character.yen);expect(after.inventory).toEqual(before.inventory);expect(after.character.worldId).toBe("sakuragaoka");expect(after.character.x).toBeCloseTo(-11.5,1);expect(after.character.z).toBeCloseTo(1.5,1);
  await page.reload();await enterStoryWorld(page,character.name);await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.lifecycle.worldRuntime.ready,null,{timeout:120_000});
  const reloaded=await saved();expect(reloaded.character.storyFlags[escort]).toBe(true);expect(reloaded.character.x).toBeCloseTo(-11.5,1);expect(reloaded.character.z).toBeCloseTo(1.5,1);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
}
