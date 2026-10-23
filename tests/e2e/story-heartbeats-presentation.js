import { expect } from "@playwright/test";

export async function placeAtHeartbeatsApproach(page) {
  const approach=await page.evaluate(async()=>{
    const life=window.storyProbe.lifecycle;
    await life.travelToWorld("dobuita");
    const c=life.getController();
    // Search both sides of the region's X boundary on the actual alley floor.
    // The old +Z approach (124.56,67.4) was over a void and produced misleading
    // passing progress tests with a below-map gameplay camera.
    for(const z of [64.41,63,65,62.5,65.5])for(const [fromX,toX] of [[121,123],[127,125]]){
      const points=[];
      for(let step=0;step<=8;step++){
        const p=c.recoveryCandidateAt(fromX+(toX-fromX)*step/8,z,-1.8,{constrainHeight:false});
        if(!p||Math.abs(p.y+1.8)>.2)break;
        points.push(p);
      }
      if(points.length!==9)continue;
      const from=points[0],to=points.at(-1);
      const yaw=Math.atan2(to.x-from.x,to.z-from.z);
      life.resetPlayer(from,yaw,{persist:false});
      c.setFirstPerson(true);c.cameraYaw=yaw-Math.PI;c.cameraPitch=0;c.updateCamera(1);
      return {from:from.asArray(),to:to.asArray()};
    }
    throw Error("No floor-supported clear Heartbeats test approach");
  });
  console.info("Supported Heartbeats approach",approach);
  return approach;
}

// Presentation-only review from an earned checkpoint: use the exact activity
// adapter used by Yarn, without changing flags or pretending to replay a gate.
export async function reviewHeartbeatsPresentation(page, testInfo, character) {
  expect(character.storyFlags["story.s1.heartbeats-alley.completed"]).toBe(true);
  const before = (await (await page.request.get(`/api/characters/${character.id}/state`)).json()).character;
  const approach=await placeAtHeartbeatsApproach(page);
  await page.locator("#renderCanvas").focus();
  await page.keyboard.down("KeyW");
  try {
    await page.waitForFunction(to=>{
      const p=window.storyProbe.lifecycle.getController().collider.position;
      return Math.hypot(p.x-to[0],p.z-to[2])<.6;
    },approach.to,{timeout:5000});
  } finally { await page.keyboard.up("KeyW"); }
  await page.evaluate(async () => {
    const life = window.storyProbe.lifecycle;
    await life.travelToWorld("dobuita");
    life.resetPlayer(life.vectorFromArray([124.56, -1.8, 64.41]), Math.PI, { persist: false });
  });
  await page.waitForTimeout(400);
  const ground = await page.evaluate(() => {
    const c = window.storyProbe.lifecycle.getController();
    return { position: c.collider.position.asArray(), floor: c.sampleTerrain(c.collider.position.x,c.collider.position.z,c.collider.position.y)?.height };
  });
  console.info("Heartbeats ground", ground);
  expect(ground.floor).toBeCloseTo(ground.position[1], 2);
  for (const part of ["introduction", "beer"]) {
    await page.evaluate(part => {
      const p=window.storyProbe;
      const presentation=p.regions.controller.presentation;
      p.activityReview={done:false,error:null};
      presentation.begin({area:p.lifecycle.worldRuntime.activeWorld.nativeArea});
      void presentation.execute({name:"start_activity",arguments:[{type:"string",isStatic:true,value:`s1.heartbeats.alley.${part}`}]})
        .then(()=>{presentation.commit();p.activityReview.done=true;},error=>{presentation.rollback("review-failed");p.activityReview.error=error.message;});
    },part);
    await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.runtime?.playback?.active?.frame>=15
      ||window.storyProbe.activityReview.error,null,{timeout:60_000});
    expect(await page.evaluate(()=>window.storyProbe.activityReview.error)).toBeNull();
    await page.screenshot({path:testInfo.outputPath(`alley-${part}-active.png`)});
    if(part==="beer") {
      await page.waitForTimeout(4000);
      await page.screenshot({path:testInfo.outputPath("alley-beer-later.png")});
    }
    await page.waitForFunction(()=>window.storyProbe.activityReview.done||window.storyProbe.activityReview.error,null,{timeout:45_000});
    expect(await page.evaluate(()=>window.storyProbe.activityReview.error)).toBeNull();
    const restored=await page.evaluate(()=>{
      const l=window.storyProbe.lifecycle,c=l.getController();
      return {position:c.collider.position.asArray(),locked:c.movementLocked,active:!!window.storyProbe.director.activeCutscene};
    });
    expect(restored.active).toBe(false);expect(restored.locked).toBe(false);
    for(let i=0;i<3;i++)expect(restored.position[i]).toBeCloseTo(ground.position[i],2);
  }
  const after=(await(await page.request.get(`/api/characters/${character.id}/state`)).json()).character;
  expect(after.storyFlags).toEqual(before.storyFlags);expect(after.yen).toBe(before.yen);
}
