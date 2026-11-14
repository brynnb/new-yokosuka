import {expect} from "@playwright/test";
import {driveObservedDeliveries} from "./story-forklift-training.js";
import {fightWithKeyboard} from "./story-seventy-man.js";
import {fightStoryAmbush} from "./story-fight-input.js";

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
    await page.waitForFunction(()=>window.storyProbe.combatRuntime?.active?.view?.ready||window.storyProbe.sceneErrors.length,null,{timeout:65_000});await check(false);
    const view=await page.evaluate(()=>window.storyProbe.combatRuntime.active.view);expect(view.actors.length).toBe(6);expect(view.id).toBe("s1.mfsy.mark-after-work");
    await page.screenshot({path:testInfo.outputPath("warehouse-seventeen-actual-five-thug-fight.png")});await fightWithKeyboard(page,()=>page.evaluate(()=>!window.storyProbe.combatRuntime?.active));
    await scene("mark-after-work-aftermath");await check(false);await scene("mark-brother-explanation");await check(false);
  };
  const reload=async(retry=false)=>{await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();await page.locator(".character-slot-button:not(.empty)").filter({hasText:character.name}).click();await page.locator("button").filter({hasText:/^Enter World$/}).click();await page.waitForFunction(id=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id===id,character.id);if(retry)await scene("mark-after-work-intro");else await idle();};
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
  const approach=async(position,yaw,regionId=null)=>{
    await idle();await page.evaluate(({position,yaw})=>{const l=window.storyProbe.lifecycle,c=l.getController();l.resetPlayer(l.vectorFromArray(position),yaw,{persist:false});c.setFirstPerson(true);c.cameraYaw=yaw;c.cameraPitch=0;c.updateCamera(1);},{position,yaw});
    if(regionId){
      // Observe the outside update that re-arms this exact entry before W.
      await page.waitForFunction(regionId=>{
        const p=window.storyProbe,r=p.regions,region=r.regions.find(region=>region.id===regionId);
        if(!region)throw Error(`Missing published cargo region: ${regionId}`);
        const position=p.lifecycle.getController().actorRoot.position.asArray();
        const inside=position.every((value,axis)=>value>=region.min[axis]&&value<=region.max[axis]);
        return r.controller.status==="idle"&&!inside&&!r.inside.has(regionId);
      },regionId,{timeout:15_000});
    }else await page.waitForTimeout(250);
    await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");try{await page.waitForFunction(()=>["line","options"].includes(window.storyProbe.regions.controller.status)||window.storyProbe.sceneErrors.length,null,{timeout:15_000});}finally{await page.keyboard.up("KeyW");}
  };
  if(!initial.character.storyFlags[flag("afternoon")]){
    if(new Date((await saved()).character.storyTimeMs).getUTCHours()<14){await idle();await page.locator("#story-wait-button").click();await page.getByRole("option",{name:"Wait until 2 p.m.",exact:true}).click();await page.getByRole("button",{name:"Wait until 2 p.m.",exact:true}).click();}
    const {default:routes}=await import("../../tools/scripting/story-investigation.json",{with:{type:"json"}});
    const route=routes.routes.find(route=>route.id==="workday-two-afternoon"),briefing=route.authoredText.briefing;
    const current=await check(false),clock=current.worldState.gameTimeMs;
    expect(current.character.playMode).toBe("story");expect(current.character.openingCompleted).toBe(true);
    expect(Number.isFinite(clock)).toBe(true);
    const hour=new Date(clock).getUTCHours()+new Date(clock).getUTCMinutes()/60;
    expect(hour).toBeGreaterThanOrEqual(route.hours[0]);expect(hour).toBeLessThan(route.hours[1]);
    // Waiting until 14:00 or loading this earned checkpoint can enable the
    // published trigger around the stationary actor. Four seconds of missing
    // text does not prove an outside approach or an idle handoff is needed.
    const handoff=await page.evaluate(regionId=>{
      const p=window.storyProbe,r=p.regions,l=p.lifecycle;
      const region=r.regions.find(region=>region.id===regionId);
      if(!region)throw Error(`Missing published afternoon cargo region: ${regionId}`);
      const position=l.getController().actorRoot.position.asArray();
      return {world:l.worldRuntime.activeWorld.id,ready:l.worldRuntime.ready,position,
        regionId,min:region.min,max:region.max,
        inside:position.every((value,axis)=>value>=region.min[axis]&&value<=region.max[axis]),
        status:r.controller.status,script:r.controller.active?.scriptIdentity?.scriptSlug};
    },route.bounds);
    expect(handoff.world).toBe("mfsy");expect(handoff.ready).toBe(true);
    await testInfo.attach("workday-two-afternoon-handoff",{body:JSON.stringify(handoff),contentType:"application/json"});
    console.info("Second workday afternoon handoff:",JSON.stringify(handoff));
    if(!handoff.inside&&handoff.status==="idle")await approach([-20,0,117],-Math.PI/2,route.bounds);
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.active?.scriptIdentity?.scriptSlug),{timeout:45_000}).toBe("story-s1-workday-two-afternoon");
    await page.getByText(briefing,{exact:true}).waitFor();await page.keyboard.press("Space");await page.getByRole("button",{name:"Leave it for now",exact:true}).click();await idle();
    expect((await check(false)).character.storyFlags[flag("afternoon")]).not.toBe(true);
    await approach([-20,0,117],-Math.PI/2,route.bounds);
    await page.getByText(briefing,{exact:true}).waitFor();await page.keyboard.press("Space");await page.getByRole("button",{name:"Start the deliveries",exact:true}).click();
    await page.waitForFunction(()=>window.storyProbe.delivery?.active?.entered||window.storyProbe.sceneErrors.length,null,{timeout:45_000});await check(false);await page.waitForTimeout(1800);await page.locator("#renderCanvas").focus();
    await driveObservedDeliveries(page,testInfo,4,"workday-two-afternoon");await page.getByText("All eight crates are delivered. The quota is finished.",{exact:true}).waitFor();await check(false);await page.keyboard.press("Space");await expect.poll(async()=>(await saved()).character.storyFlags[flag("afternoon")]).toBe(true);
  }
  if(!(await saved()).character.storyFlags[flag("attack")]){
    // Yarn retries the failed wave in place. Keep that actual UI recovery,
    // bounded to three attempts, instead of treating one ordinary defeat as
    // a broken progression route or replaying an already-won first wave.
    const betweenWaves="The first five have backed off, but four more are coming. Catch my breath and face them.";
    const afterFight="They said the Mad Angels meet behind Warehouse No. 17. The shift is over; collect my wages, then look for Mark there.";
    const attemptTokens=new Set();
    const fightWave=async(wave,actorCount,firstScreenshot,successText)=>{
      const id=`s1.mfsy.workday-two-wave-${wave}`,retry=page.getByRole("button",{name:"Try again",exact:true}),win=page.getByText(successText,{exact:true});
      for(let attempt=1;attempt<=3;attempt++){
        await page.waitForFunction(id=>{
          const p=window.storyProbe,v=p.combatRuntime?.active?.view;
          return (v?.ready&&v.id===id)||p.sceneErrors.length;
        },id,{timeout:45_000});await check(false);
        const start=await page.evaluate(()=>window.storyProbe.combatRuntime.active.view);
        expect(start.id).toBe(id);expect(start.actors.length).toBe(actorCount);
        expect(start.actors[0].health).toBe(start.actors[0].maxHealth);
        expect(typeof start.token).toBe("string");expect(start.token.length>0).toBe(true);
        expect(attemptTokens.has(start.token),"each ordinary retry creates a fresh combat attempt").toBe(false);attemptTokens.add(start.token);
        const prefix=`second-workday-wave-${wave}-attempt-${attempt}`;
        await page.screenshot({path:testInfo.outputPath(attempt===1?firstScreenshot:`${prefix}-start.png`)});
        await fightStoryAmbush(page,testInfo,{nextButton:null,artifactPrefix:prefix});
        await page.waitForFunction(()=>!window.storyProbe.combatRuntime?.active,null,{timeout:20_000});
        await page.waitForFunction(()=>["line","options"].includes(window.storyProbe.regions.controller.status)||window.storyProbe.sceneErrors.length,null,{timeout:15_000});
        await expect.poll(async()=>(await retry.isVisible())||(await win.isVisible()),{timeout:15_000}).toBe(true);
        const pending=await check(false);expect(pending.character.storyFlags[flag("afternoon")]).toBe(true);
        expect(pending.character.storyFlags[flag("attack")]).not.toBe(true);
        const result=await page.evaluate(()=>window.storyProbe.lastCombatView),lost=await retry.isVisible();
        const evidence={wave,attempt,id:result.id,lost,defeated:result.defeated,remainingMs:result.remainingMs,playerHealth:result.actors[0].health};
        await testInfo.attach(`${prefix}-outcome`,{body:JSON.stringify(evidence),contentType:"application/json"});
        console.info("Second workday combat attempt:",JSON.stringify(evidence));
        expect(result.id).toBe(id);
        if(!lost){expect(result.defeated).toBe(actorCount-1);expect(result.actors[0].health).toBeGreaterThan(0);return;}
        expect(attempt,`Wave ${wave} exhausted three ordinary keyboard attempts`).toBeLessThan(3);
        await retry.click();
      }
    };
    // The saved quota returns inside the same trigger, including on reconnect.
    // Await dispatch rather than racing its first idle networking snapshot.
    await page.getByText("The Mad Angels are blocking my work again. Five of them are waiting for a fight.",{exact:true}).waitFor();await page.keyboard.press("Space");await page.getByRole("button",{name:"Face the attackers",exact:true}).click();
    await fightWave("one",6,"second-workday-five-attackers.png",betweenWaves);
    await page.getByText(betweenWaves,{exact:true}).waitFor();expect((await check(false)).character.storyFlags[flag("attack")]).not.toBe(true);await page.keyboard.press("Space");
    await fightWave("two",5,"second-workday-four-attackers-fresh-health.png",afterFight);
    await page.getByText(afterFight,{exact:true}).waitFor();expect((await check(false)).character.storyFlags[flag("attack")]).not.toBe(true);await page.keyboard.press("Space");await idle();
    const s=await check(false);expect(s.character.storyFlags["notebook.s1.warehouse-seventeen-hangout"]).toBe(true);expect(new Date(s.character.storyTimeMs).getUTCHours()).toBe(17);
  }
  if(!(await saved()).character.storyFlags[flag("payday")]){
    const collect=async()=>{await approach([25,0,66],Math.PI);await page.keyboard.press("Space");await page.getByRole("button",{name:"Collect today's wages",exact:true}).click();await page.waitForFunction(()=>window.storyProbe.authoredScene?.active?.scene.id==="s1.mfsy.payday"||window.storyProbe.sceneErrors.length,null,{timeout:45_000});};
    await collect();await page.waitForTimeout(6000);await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-second-payday-cancel"));await idle();await check(false);
    await collect();await page.getByText("Collected today's wages: 2,400 yen. Look behind Warehouse No. 17 for Mark.",{exact:true}).waitFor({timeout:65_000});await check(false);await page.keyboard.press("Space");await idle();await check(true);
  }
  const before=await check(true);expect(before.character.storyFlags[flag("payday")]).toBe(true);expect(before.character.storyFlags["notebook.s1.second-payday"]).toBe(true);expect(before.character.storyFlags["story.s1.workday-two.completed"]).not.toBe(true);
  await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();await page.locator(".character-slot-button:not(.empty)").filter({hasText:character.name}).click();await page.locator("button").filter({hasText:/^Enter World$/}).click();await page.waitForFunction(id=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id===id,character.id);await idle();await check(true);
  expect(await page.getByRole("button",{name:"Collect today's wages",exact:true}).isVisible()).toBe(false);await page.screenshot({path:testInfo.outputPath("second-workday-earned-payday-reload.png")});
}

export async function verifyWorkdayNight(page,testInfo,character,{day="one"}={}){
  expect(["one","three","four"]).toContain(day);
  const chapter=`workday-${day}`,next=day==="one"?"workday-two":day==="three"?"workday-four":"workday-five",dreamName=day==="one"?"phoenix-vision":day==="three"?"lan-di-dream":null,trackId=day==="one"?"bgm079":"bgm201";
  const {default:routes}=await import("../../tools/scripting/story-investigation.json",{with:{type:"json"}});
  const briefing=routes.routes.find(r=>r.id===`${next}-race-entry`).authoredText.briefing;
  const ordinarySleep=routes.routes.find(r=>r.id===`${chapter}-night`).authoredText;
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
      await page.waitForTimeout(250);await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");try{if(ordinarySleep)await page.getByText(ordinarySleep.briefing,{exact:true}).waitFor();else await page.getByRole("button",{name:"Sleep until tomorrow",exact:true}).waitFor();}finally{await page.keyboard.up("KeyW");}if(ordinarySleep)await page.keyboard.press("Space");await noErrors();
    };
    const dream=async()=>{if(ordinarySleep){await page.getByText(ordinarySleep.success,{exact:true}).waitFor();return;}await page.waitForFunction(id=>window.storyProbe.director?.activeCutscene?.cutscene.id===id||window.storyProbe.sceneErrors.length,`story-s1-${dreamName}`,{timeout:75_000});await noErrors();await expect.poll(()=>page.evaluate(()=>window.storyProbe.director?.activeCutscene?.packageRuntime.music.trackId)).toBe(trackId);};
    await approach();await page.getByRole("button",{name:"Stay awake",exact:true}).click();await idle();expect((await economy()).character.storyFlags[done]).not.toBe(true);
    await approach();const beforeCancel=await saved();await page.getByRole("button",{name:"Sleep until tomorrow",exact:true}).click();await dream();
    // KKYF is an eight-second AUTH. The old Phoenix-only nine-second delay
    // cancelled after this shorter scene had legitimately settled its morning.
    if(dreamName){await page.waitForTimeout(2000);expect(await page.evaluate(()=>window.storyProbe.director?.activeCutscene?.cutscene.id)).toBe(`story-s1-${dreamName}`);}
    await page.screenshot({path:testInfo.outputPath(`${chapter}-${dreamName||"ordinary-sleep-acknowledgement"}.png`)});
    if(process.env.NEW_YOKOSUKA_DREAM_LIGHT_REVIEW_E2E==="true"&&dreamName==="phoenix-vision"){
      await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.packageRuntime?.stageWeather?.particles?.getActiveCount()>0,null,{timeout:20_000});
      await page.evaluate(()=>window.storyWeatherReview=window.storyProbe.director.activeCutscene.packageRuntime.stageWeather);
      for(const frame of [300,600,900]){
        await page.waitForFunction(frame=>window.storyProbe.director?.activeCutscene?.packageRuntime?.activityRuntime?.active?.currentFrame>=frame,frame,{timeout:45_000});
        await page.screenshot({path:testInfo.outputPath(`phoenix-vision-frame-${frame}.png`)});
      }
    }
    await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-workday-dream-cancel"));await idle();const cancelled=await economy();expect(cancelled.character.storyFlags[done]).not.toBe(true);expect(cancelled.character.worldId).toBe("interior");
    if(process.env.NEW_YOKOSUKA_DREAM_LIGHT_REVIEW_E2E==="true"&&dreamName==="phoenix-vision")expect(await page.evaluate(()=>window.storyWeatherReview.particles)).toBe(null);
    expect(new Date(cancelled.character.storyTimeMs).toISOString().slice(0,10)).toBe(new Date(beforeCancel.character.storyTimeMs).toISOString().slice(0,10));
    await approach();const before=await saved();await page.getByRole("button",{name:"Sleep until tomorrow",exact:true}).click();await dream();if(ordinarySleep)await page.keyboard.press("Space");
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
