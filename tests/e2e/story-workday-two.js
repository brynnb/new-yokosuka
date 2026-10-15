import {expect} from "@playwright/test";
import {driveObservedDeliveries} from "./story-forklift-training.js";
import {winHarborFight} from "./story-workday-one.js";

export async function verifySecondWorkday(page,testInfo,character){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved(),flag=part=>`story.s1.workday-two-${part}.completed`;
  expect(initial.character.storyFlags[flag("morning")]).toBe(true);
  const paidInitially=!!initial.character.storyFlags[flag("payday")],unpaid=initial.character.yen-(paidInitially?2400:0);
  const check=async(paid=false)=>{const s=await saved();expect(s.character.yen).toBe(unpaid+(paid?2400:0));expect(s.inventory).toEqual(initial.inventory);expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return s;};
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);};
  const approach=async(position,yaw)=>{
    await idle();await page.evaluate(({position,yaw})=>{const l=window.storyProbe.lifecycle,c=l.getController();l.resetPlayer(l.vectorFromArray(position),yaw,{persist:false});c.setFirstPerson(true);c.cameraYaw=yaw;c.cameraPitch=0;c.updateCamera(1);},{position,yaw});
    await page.waitForTimeout(250);await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");try{await page.waitForFunction(()=>["line","options"].includes(window.storyProbe.regions.controller.status)||window.storyProbe.sceneErrors.length,null,{timeout:15_000});}finally{await page.keyboard.up("KeyW");}
  };
  if(!initial.character.storyFlags[flag("afternoon")]){
    if(new Date((await saved()).character.storyTimeMs).getUTCHours()<14){await idle();await page.locator("#story-wait-button").click();await page.getByRole("option",{name:"Wait until 2 p.m.",exact:true}).click();await page.getByRole("button",{name:"Wait until 2 p.m.",exact:true}).click();}
    // The earned checkpoint is in the loading volume. Wait for its actual
    // asynchronous dispatch instead of racing an initial idle snapshot.
    await page.getByText("Four more crates for Warehouse No. 3 will finish today's quota of eight. Yada-san pays after the shift.",{exact:true}).waitFor();await page.keyboard.press("Space");await page.getByRole("button",{name:"Leave it for now",exact:true}).click();await idle();
    await approach([-20,0,117],-Math.PI/2);
    await page.getByText("Four more crates for Warehouse No. 3 will finish today's quota of eight. Yada-san pays after the shift.",{exact:true}).waitFor();await page.keyboard.press("Space");await page.getByRole("button",{name:"Start the deliveries",exact:true}).click();
    await page.waitForFunction(()=>window.storyProbe.delivery?.active?.entered||window.storyProbe.sceneErrors.length,null,{timeout:45_000});await check(false);await page.waitForTimeout(1800);await page.locator("#renderCanvas").focus();
    await driveObservedDeliveries(page,testInfo,4,"workday-two-afternoon");await page.getByText("All eight crates are delivered. The quota is finished.",{exact:true}).waitFor();await check(false);await page.keyboard.press("Space");await expect.poll(async()=>(await saved()).character.storyFlags[flag("afternoon")]).toBe(true);
  }
  if(!(await saved()).character.storyFlags[flag("attack")]){
    // The saved quota returns inside the same trigger, including on reconnect.
    // Await dispatch rather than racing its first idle networking snapshot.
    await page.getByText("The Mad Angels are blocking my work again. Five of them are waiting for a fight.",{exact:true}).waitFor();await page.keyboard.press("Space");await page.getByRole("button",{name:"Face the attackers",exact:true}).click();
    await page.waitForFunction(()=>window.storyProbe.combatRuntime?.active?.view.ready||window.storyProbe.sceneErrors.length,null,{timeout:45_000});await check(false);
    expect(await page.evaluate(()=>window.storyProbe.combatRuntime.active.view.actors.length)).toBe(6);await page.screenshot({path:testInfo.outputPath("second-workday-five-attackers.png")});await winHarborFight(page,{attack:"KeyJ"});
    await page.getByText("The first five have backed off, but four more are coming. Catch my breath and face them.",{exact:true}).waitFor();expect((await check(false)).character.storyFlags[flag("attack")]).not.toBe(true);await page.keyboard.press("Space");
    await page.waitForFunction(()=>window.storyProbe.combatRuntime?.active?.view.ready||window.storyProbe.sceneErrors.length,null,{timeout:45_000});await check(false);
    const second=await page.evaluate(()=>window.storyProbe.combatRuntime.active.view);expect(second.actors.length).toBe(5);expect(second.actors[0].health).toBe(second.actors[0].maxHealth);
    await page.screenshot({path:testInfo.outputPath("second-workday-four-attackers-fresh-health.png")});await winHarborFight(page,{attack:"KeyJ"});
    await page.getByText("They said the Mad Angels meet behind Warehouse No. 17. The shift is over; collect my wages, then look for Mark there.",{exact:true}).waitFor();expect((await check(false)).character.storyFlags[flag("attack")]).not.toBe(true);await page.keyboard.press("Space");await idle();
    const s=await check(false);expect(s.character.storyFlags["notebook.s1.warehouse-seventeen-hangout"]).toBe(true);expect(new Date(s.character.storyTimeMs).getUTCHours()).toBe(17);
  }
  if(!(await saved()).character.storyFlags[flag("payday")]){
    const collect=async()=>{await approach([25,0,66],Math.PI);await page.keyboard.press("Space");await page.getByRole("button",{name:"Collect today's wages",exact:true}).click();await page.waitForFunction(()=>window.storyProbe.authoredScene?.active?.scene.id==="s1.mfsy.payday"||window.storyProbe.sceneErrors.length,null,{timeout:45_000});};
    await collect();await page.waitForTimeout(6000);await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-second-payday-cancel"));await idle();await check(false);
    await collect();await page.getByText("Collected today's wages: 2,400 yen. Look behind Warehouse No. 17 for Mark.",{exact:true}).waitFor({timeout:65_000});await check(false);await page.keyboard.press("Space");await idle();await check(true);
  }
  const before=await check(true);expect(before.character.storyFlags[flag("payday")]).toBe(true);expect(before.character.storyFlags["notebook.s1.second-payday"]).toBe(true);expect(before.character.storyFlags["story.s1.workday-two.completed"]).not.toBe(true);
  await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);await idle();await check(true);
  expect(await page.getByRole("button",{name:"Collect today's wages",exact:true}).isVisible()).toBe(false);await page.screenshot({path:testInfo.outputPath("second-workday-earned-payday-reload.png")});
}

export async function verifyWorkdayNight(page,testInfo,character){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved(),done="story.s1.workday-one-night.completed";
  expect(initial.character.storyFlags["story.s1.workday-one.completed"]).toBe(true);
  const noErrors=async()=>expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);await noErrors();};
  const economy=async()=>{const s=await saved();expect(s.character.yen).toBe(initial.character.yen);expect(s.inventory).toEqual(initial.inventory);return s;};
  const declineRace=async()=>{
    await page.getByText("Another morning at the harbor. Mark starts the day with the forklift race. Today's quota will be eight crates for Warehouse No. 3.",{exact:true}).waitFor();
    await page.keyboard.press("Space");await page.getByRole("button",{name:"Leave it for now",exact:true}).click();await idle();
  };
  if(!initial.character.storyFlags[done]){
    await page.evaluate(()=>window.storyProbe.lifecycle.travelToWorld("interior"));await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==="interior"&&window.storyProbe.lifecycle.worldRuntime.ready&&!window.storyProbe.lifecycle.worldRuntime.switching);await idle();
    await page.evaluate(()=>{const l=window.storyProbe.lifecycle;l.resetPlayer(l.vectorFromArray([-17.6,0,3]),Math.PI,{persist:true});});
    if(new Date((await saved()).character.storyTimeMs).getUTCHours()<20){await page.locator("#story-wait-button").click();await page.getByRole("option",{name:"Wait until 8 p.m.",exact:true}).click();await page.getByRole("button",{name:"Wait until 8 p.m.",exact:true}).click();await idle();}
    const approach=async()=>{
      await page.evaluate(()=>{const l=window.storyProbe.lifecycle,c=l.getController();l.resetPlayer(l.vectorFromArray([-17.6,0,3]),Math.PI,{persist:false});c.setFirstPerson(true);c.cameraYaw=Math.PI;c.cameraPitch=0;c.updateCamera(1);});
      await page.waitForTimeout(250);await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");try{await page.getByRole("button",{name:"Sleep until tomorrow",exact:true}).waitFor();}finally{await page.keyboard.up("KeyW");}await noErrors();
    };
    const dream=async()=>{await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-phoenix-vision"||window.storyProbe.sceneErrors.length,null,{timeout:75_000});await noErrors();};
    await approach();await page.getByRole("button",{name:"Stay awake",exact:true}).click();await idle();expect((await economy()).character.storyFlags[done]).not.toBe(true);
    await approach();const beforeCancel=await saved();await page.getByRole("button",{name:"Sleep until tomorrow",exact:true}).click();await dream();await page.waitForTimeout(9000);await page.screenshot({path:testInfo.outputPath("first-workday-original-phoenix-vision.png")});
    await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-workday-dream-cancel"));await idle();const cancelled=await economy();expect(cancelled.character.storyFlags[done]).not.toBe(true);expect(cancelled.character.worldId).toBe("interior");
    expect(new Date(cancelled.character.storyTimeMs).toISOString().slice(0,10)).toBe(new Date(beforeCancel.character.storyTimeMs).toISOString().slice(0,10));
    await approach();const before=await saved();await page.getByRole("button",{name:"Sleep until tomorrow",exact:true}).click();await dream();
    await expect.poll(async()=>(await saved()).character.storyFlags[done],{timeout:75_000,intervals:[1000]}).toBe(true);
    await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==="mfsy"&&window.storyProbe.lifecycle.worldRuntime.ready&&!window.storyProbe.lifecycle.worldRuntime.switching,null,{timeout:90_000});
    const after=await economy(),date=new Date(before.character.storyTimeMs),next=new Date(after.character.storyTimeMs);
    expect(next.toISOString().slice(0,10)).toBe(new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()+1)).toISOString().slice(0,10));expect(next.getUTCHours()).toBe(8);expect(next.getUTCMinutes()).toBeGreaterThanOrEqual(30);expect(next.getUTCMinutes()).toBeLessThan(35);
    expect(after.character.storyFlags["notebook.s1.workday-two-morning"]).toBe(true);expect(after.character.worldId).toBe("mfsy");
    await declineRace();await page.screenshot({path:testInfo.outputPath("second-workday-earned-harbor-arrival.png")});
    await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);
    await declineRace();await economy();expect(await page.evaluate(()=>window.storyProbe.starts.includes("story-s1-phoenix-vision"))).toBe(false);
  }else if(!initial.character.storyFlags["story.s1.workday-two-race.completed"]&&await page.evaluate(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==="mfsy"&&window.storyProbe.regions.controller.status!=="idle")){
    await declineRace();await economy();
  }
}
