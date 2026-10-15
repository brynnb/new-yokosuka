import {expect} from "@playwright/test";
import {driveObservedDeliveries} from "./story-forklift-training.js";
import {winHarborFight} from "./story-workday-one.js";

export async function verifyMarkAfterWork(page,testInfo,character){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved(),done="story.s1.mark-after-work-rescue.completed";
  expect(initial.character.storyFlags["story.s1.workday-two-payday.completed"]).toBe(true);
  const check=async(complete=false)=>{const s=await saved();expect(s.character.yen).toBe(initial.character.yen);expect(s.inventory).toEqual(initial.inventory);expect(s.character.storyFlags[done]===true).toBe(complete);expect(s.character.storyFlags["story.s1.workday-two.completed"]===true).toBe(complete);expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return s;};
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);};
  const scene=async part=>{await page.waitForFunction(part=>window.storyProbe.director?.activeCutscene?.cutscene.id===`story-s1-${part}`||window.storyProbe.sceneErrors.length,part,{timeout:75_000});expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);};
  const approach=async()=>{
    await idle();await page.evaluate(()=>{const l=window.storyProbe.lifecycle,c=l.getController();l.resetPlayer(l.vectorFromArray([-91,0,36]),0,{persist:false});c.setFirstPerson(true);c.cameraYaw=0;c.cameraPitch=0;c.updateCamera(1);});
    await page.waitForTimeout(250);await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");try{await scene("mark-after-work-intro");}finally{await page.keyboard.up("KeyW");}
  };
  const fight=async()=>{
    await page.waitForFunction(()=>window.storyProbe.combatRuntime?.active?.view.ready||window.storyProbe.sceneErrors.length,null,{timeout:65_000});await check(false);
    const view=await page.evaluate(()=>window.storyProbe.combatRuntime.active.view);expect(view.actors.length).toBe(6);expect(view.id).toBe("s1.mfsy.mark-after-work");
    await page.screenshot({path:testInfo.outputPath("warehouse-seventeen-actual-five-thug-fight.png")});await winHarborFight(page,{attack:"KeyJ"});
    await scene("mark-after-work-aftermath");await check(false);await scene("mark-brother-explanation");await check(false);
  };
  const reload=async(retry=false)=>{await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);if(retry)await scene("mark-after-work-intro");else await idle();};
  if(!initial.character.storyFlags[done]){
    // A previous interrupted check may already have saved the approach inside
    // the trigger. Accept the real automatic restart rather than teleporting
    // beneath an acquiring scene or requiring an idle frame that cannot occur.
    if(await page.evaluate(()=>window.storyProbe.regions.controller.status!=="idle"))await scene("mark-after-work-intro");else await approach();
    await page.waitForTimeout(6000);await page.screenshot({path:testInfo.outputPath("warehouse-seventeen-original-confrontation.png")});await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-warehouse-seventeen-intro-cancel"));await idle();await check(false);
    await approach();await fight();await page.waitForTimeout(6000);await page.screenshot({path:testInfo.outputPath("warehouse-seventeen-original-brother-explanation.png")});
    await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-mark-brother-ending-cancel"));await idle();await check(false);
    // Re-entering the saved activation area retries the uncommitted encounter.
    await reload(true);await check(false);
    await fight();await expect.poll(async()=>(await saved()).character.storyFlags[done],{timeout:90_000,intervals:[1000]}).toBe(true);await idle();
  }
  const final=await check(true);expect(final.character.storyFlags["notebook.s1.mark-brother"]).toBe(true);expect(final.character.storyFlags["notebook.s1.mad-angels-chi-you-men"]).toBe(true);expect(final.character.worldId).toBe("mfsy");
  expect(new Date(final.character.storyTimeMs).toISOString().slice(0,10)).toBe(new Date(initial.character.storyTimeMs).toISOString().slice(0,10));
  await reload();await check(true);expect(await page.evaluate(()=>window.storyProbe.starts.some(id=>id.startsWith("story-s1-mark-after-work")||id==="story-s1-mark-brother-explanation"))).toBe(false);
  await page.screenshot({path:testInfo.outputPath("warehouse-seventeen-earned-chapter-reload.png")});
}

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

export async function verifyWorkdayNight(page,testInfo,character,{day="one"}={}){
  expect(["one","three"]).toContain(day);
  const chapter=`workday-${day}`,next=day==="one"?"workday-two":"workday-four",dreamName=day==="one"?"phoenix-vision":"lan-di-dream",trackId=day==="one"?"bgm079":"bgm201";
  const {default:routes}=await import("../../tools/scripting/story-investigation.json",{with:{type:"json"}});
  const briefing=routes.routes.find(r=>r.id===`${next}-race-entry`).authoredText.briefing;
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved(),done=`story.s1.${chapter}-night.completed`;
  expect(initial.character.storyFlags[`story.s1.${chapter}.completed`]).toBe(true);
  const noErrors=async()=>expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);await noErrors();};
  const economy=async()=>{const s=await saved();expect(s.character.yen).toBe(initial.character.yen);expect(s.inventory).toEqual(initial.inventory);return s;};
  const declineRace=async()=>{
    await page.getByText(briefing,{exact:true}).waitFor();
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
    const dream=async()=>{await page.waitForFunction(id=>window.storyProbe.director?.activeCutscene?.cutscene.id===id||window.storyProbe.sceneErrors.length,`story-s1-${dreamName}`,{timeout:75_000});await noErrors();await expect.poll(()=>page.evaluate(()=>window.storyProbe.director?.activeCutscene?.packageRuntime.music.trackId)).toBe(trackId);};
    await approach();await page.getByRole("button",{name:"Stay awake",exact:true}).click();await idle();expect((await economy()).character.storyFlags[done]).not.toBe(true);
    await approach();const beforeCancel=await saved();await page.getByRole("button",{name:"Sleep until tomorrow",exact:true}).click();await dream();
    // KKYF is an eight-second AUTH. The old Phoenix-only nine-second delay
    // cancelled after this shorter scene had legitimately settled its morning.
    await page.waitForTimeout(2000);expect(await page.evaluate(()=>window.storyProbe.director?.activeCutscene?.cutscene.id)).toBe(`story-s1-${dreamName}`);
    await page.screenshot({path:testInfo.outputPath(`${chapter}-original-${dreamName}.png`)});
    await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-workday-dream-cancel"));await idle();const cancelled=await economy();expect(cancelled.character.storyFlags[done]).not.toBe(true);expect(cancelled.character.worldId).toBe("interior");
    expect(new Date(cancelled.character.storyTimeMs).toISOString().slice(0,10)).toBe(new Date(beforeCancel.character.storyTimeMs).toISOString().slice(0,10));
    await approach();const before=await saved();await page.getByRole("button",{name:"Sleep until tomorrow",exact:true}).click();await dream();
    await expect.poll(async()=>(await saved()).character.storyFlags[done],{timeout:75_000,intervals:[1000]}).toBe(true);
    await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==="mfsy"&&window.storyProbe.lifecycle.worldRuntime.ready&&!window.storyProbe.lifecycle.worldRuntime.switching,null,{timeout:90_000});
    const after=await economy(),date=new Date(before.character.storyTimeMs),morningDate=new Date(after.character.storyTimeMs);
    expect(morningDate.toISOString().slice(0,10)).toBe(new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()+1)).toISOString().slice(0,10));expect(morningDate.getUTCHours()).toBe(8);expect(morningDate.getUTCMinutes()).toBeGreaterThanOrEqual(30);expect(morningDate.getUTCMinutes()).toBeLessThan(35);
    expect(after.character.storyFlags[`notebook.s1.${next}-morning`]).toBe(true);expect(after.character.worldId).toBe("mfsy");
    await declineRace();await page.screenshot({path:testInfo.outputPath(`${next}-earned-harbor-arrival.png`)});
    await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);
    await declineRace();await economy();expect(await page.evaluate(id=>window.storyProbe.starts.includes(id),`story-s1-${dreamName}`)).toBe(false);
  }else if(!initial.character.storyFlags[`story.s1.${next}-race.completed`]&&await page.evaluate(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==="mfsy"&&window.storyProbe.regions.controller.status!=="idle")){
    await declineRace();await economy();
  }
}
