import {expect} from "@playwright/test";

export async function verifyForkliftTraining(page,testInfo,character){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved(),completed="story.s1.forklift-training.completed";
  expect(initial.character.storyFlags["story.s1.harbor-job-hiring.completed"]).toBe(true);
  const noErrors=async()=>expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);await noErrors();};
  const unchanged=async()=>{const state=await saved();expect(state.character.yen).toBe(initial.character.yen);expect(state.inventory).toEqual(initial.inventory);expect(state.character.storyFlags[completed]).not.toBe(true);};
  await page.evaluate(()=>window.storyProbe.lifecycle.travelToWorld("mfsy"));
  await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.ready&&!window.storyProbe.lifecycle.worldRuntime.switching);
  if(await page.getByRole("button",{name:"Leave it for now",exact:true}).isVisible())await page.getByRole("button",{name:"Leave it for now",exact:true}).click();await idle();
  const approach=async()=>{
    await page.evaluate(()=>{const l=window.storyProbe.lifecycle,c=l.getController();l.resetPlayer(l.vectorFromArray([-20,0,117]),-Math.PI/2,{persist:false});c.setFirstPerson(true);c.cameraYaw=-Math.PI/2;c.cameraPitch=0;c.updateCamera(1);});
    await page.waitForTimeout(300);await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
    try{await page.waitForFunction(()=>window.storyProbe.regions.controller.status==="options"||window.storyProbe.sceneErrors.length,null,{timeout:15_000});}finally{await page.keyboard.up("KeyW");}await noErrors();
  };
  const start=async()=>{await approach();await page.getByRole("button",{name:"Start forklift practice",exact:true}).click();await page.waitForFunction(()=>window.storyProbe.delivery?.active?.entered||window.storyProbe.sceneErrors.length,null,{timeout:45_000});await noErrors();await page.waitForTimeout(1800);};
  await approach();await page.getByRole("button",{name:"Leave it for now",exact:true}).click();await idle();await unchanged();
  await start();await page.waitForTimeout(1800);await page.screenshot({path:testInfo.outputPath("forklift-training-ready.png")});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-training-cancel"));await idle();await unchanged();
  expect(await page.evaluate(()=>window.storyProbe.delivery.active)).toBe(null);
  await start();await page.locator("#renderCanvas").focus();
  await driveObservedDeliveries(page,testInfo,3,"forklift-training");
  await idle();const final=await saved();expect(final.character.storyFlags[completed]).toBe(true);expect(final.character.storyFlags["notebook.s1.first-workday"]).toBe(true);
  expect(new Date(final.character.storyTimeMs).getUTCHours()).toBe(17);expect(final.character.yen).toBe(initial.character.yen);expect(final.inventory).toEqual(initial.inventory);
  expect(await page.evaluate(()=>window.storyProbe.delivery.getForklifts().mode.driving)).toBe(false);
  await page.screenshot({path:testInfo.outputPath("forklift-training-earned-completion.png")});
  await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);await idle();
  expect((await saved()).character.storyFlags[completed]).toBe(true);
}

// Training and paid batches use the same actual keyboard/cargo boundary. Only
// the authored quota changes; neither helper can manufacture a delivered crate.
export async function driveObservedDeliveries(page,testInfo,count,prefix){
  const info=()=>page.evaluate(()=>{const r=window.storyProbe.delivery,a=r.getForklifts();if(!r.active||!a.mode.driving)return null;const v=r.active.prompt.delivery,c=a.cargo.physics.entries.get(v.cargoId),p=a.cargo.physics.dynamicForkliftPose(a.mode.activeId);if(!p)return null;return{view:v,position:a.mode.actorRoot.position.asArray(),yaw:a.mode.actorRoot.rotation.y,velocity:p.linearVelocity.asArray(),speed:a.mode.state.speed,lift:a.mode.state.lift,cargo:c?.node.position.asArray(),support:c?.forkSupportActive};});
  expect(await page.evaluate(()=>window.storyProbe.delivery.getForklifts().fleet.size)).toBe(1);
  const original=(await info()).position;
  // This exercise follows a clear straight corridor. Drive through the real
  // keyboard/physics boundary, without teleporting the vehicle or cargo.
  const slowDrive=async(field,targetX)=>{
    let held=null,last;const deadline=Date.now()+30_000;
    try{while(Date.now()<deadline){
      last=await info();if(!last)return;const point=field==="cargo"?last.cargo:last.position,x=point?.[0];expect(x).toBeDefined();
      expect(last.position[1],`Forklift left the road: ${JSON.stringify(last)}`).toBeLessThan(2);
      const dx=targetX-x,velocity=last.velocity[0];
      if(field==="cargo"&&x>=last.view.dropMin[0]&&x<=last.view.dropMax[0]&&last.cargo[2]>=last.view.dropMin[2]&&last.cargo[2]<=last.view.dropMax[2]&&Math.abs(velocity)<.2)return;
      if(Math.abs(dx)<.15&&Math.abs(velocity)<.2)return;
      const desired=Math.sign(dx)*Math.min(1.1,Math.abs(dx)*1.3),change=desired-velocity;
      const next=change>.15?"KeyW":change<-.15?"KeyS":null;
      if(held!==next){if(held)await page.keyboard.up(held);if(next)await page.keyboard.down(next);held=next;}
      await page.waitForTimeout(100);
    }throw Error(`Physical drive did not reach ${field} X=${targetX}: ${JSON.stringify(last)}`);}
    finally{if(held)await page.keyboard.up(held);}
  };
  for(let crate=0;crate<count;crate++){
    await page.waitForFunction(()=>{const r=window.storyProbe.delivery;return r.active?.prompt.delivery.cargoId&&r.getForklifts().cargo.physics.entries.has(r.active.prompt.delivery.cargoId);});
    const pickup=await info(),heading=1.3021669961391247;
    await slowDrive("vehicle",pickup.cargo[0]-Math.sin(heading)*1.3);
    await page.keyboard.down("KeyE");await page.waitForTimeout(500);await page.keyboard.up("KeyE");await page.waitForTimeout(400);
    const lifted=await info();expect(lifted.support,JSON.stringify(lifted)).toBe(true);
    if(crate===0){
      await page.evaluate(()=>{const r=window.storyProbe.delivery,a=r.getForklifts(),c=r.getController();a.vehicleController.cameraManuallyPositioned=true;c.cameraYaw=a.mode.actorRoot.rotation.y+Math.PI/2;c.cameraPitch=.3;c.cameraDistance=7;c.updateCamera(1);});
      await page.screenshot({path:testInfo.outputPath(`${prefix}-real-pickup.png`)});
    }
    const view=(await info()).view;
    await slowDrive("cargo",(view.dropMin[0]+view.dropMax[0])/2);
    const atGoal=await info();expect(atGoal.cargo[0]).toBeGreaterThanOrEqual(view.dropMin[0]);expect(atGoal.cargo[0]).toBeLessThanOrEqual(view.dropMax[0]);expect(atGoal.cargo[2]).toBeGreaterThan(view.dropMin[2]);expect(atGoal.cargo[2]).toBeLessThan(view.dropMax[2]);
    await page.keyboard.down("KeyF");
    try{await page.waitForFunction(()=>window.storyProbe.delivery.getForklifts().mode.state.lift<.02,null,{timeout:5000});}finally{await page.keyboard.up("KeyF");}
    const current=await info();
    if(current)await slowDrive("vehicle",crate<count-1?original[0]:current.position[0]-2);
    if(crate<count-1)await expect.poll(()=>page.evaluate(()=>window.storyProbe.delivery.active?.prompt.delivery.delivered),{timeout:15_000}).toBe(crate+1);
    console.log("Physical delivery finished",prefix,crate+1);
  }
}
