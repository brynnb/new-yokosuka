import {expect} from "@playwright/test";

// Resume genuinely earned rest. Only ordinary positioning/presence, original
// presentations and real choices are used; no future flags/date are inserted.
export async function verifyFinalDayMorning(page,testInfo,character){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved(),flag=id=>`story.s1.${id}.completed`;
  expect(initial.character.storyFlags[flag("final-morning")]).toBe(true);
  const check=async()=>{
    const s=await saved();expect(s.character.yen).toBe(initial.character.yen);expect(s.inventory).toEqual(initial.inventory);
    for(const id of ["tom-farewell","tornado-kick","final-battle","departure"])expect(s.character.storyFlags[flag(id)]).not.toBe(true);
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return s;
  };
  const reload=async()=>{
    await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();
    await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();
    await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);
  };
  const choose=name=>page.getByRole("button",{name,exact:true}).click({timeout:90_000});
  const scene=async id=>{await page.waitForFunction(id=>window.storyProbe.director?.activeCutscene?.cutscene.id===`story-s1-${id}`||window.storyProbe.sceneErrors.length,id,{timeout:90_000});await check();};
  if(!(await saved()).character.storyFlags[flag("final-meditation")]){
    console.info("Final day: real dojo world/approach, decline, cancellation, saved retry");
    await page.evaluate(async()=>{const l=window.storyProbe.lifecycle;if(l.worldRuntime.activeWorld.id!=="exterior")await l.travelToWorld("exterior");l.resetPlayer(l.vectorFromArray([4.6,1.06,-20]),0,{persist:false});});
    await choose("Not yet");expect((await check()).character.storyFlags[flag("final-meditation")]).not.toBe(true);
    await reload();await choose("Meditate");await scene("final-meditation");await page.waitForTimeout(19000);
    await page.screenshot({path:testInfo.outputPath("final-meditation-original-iwao-and-ryo.png")});
    await page.evaluate(()=>window.storyProbe.regions.controller.cancel("meditation-cancel"));expect((await check()).character.storyFlags[flag("final-meditation")]).not.toBe(true);
    await reload();await choose("Meditate");await scene("final-meditation");
    await expect.poll(async()=>(await saved()).character.storyFlags[flag("final-meditation")],{timeout:90_000}).toBe(true);
    const arrival=await check(),date=new Date(arrival.character.storyTimeMs);expect(arrival.character.worldId).toBe("mfsy");
    expect(date.toISOString().slice(0,10)).toBe(new Date(initial.character.storyTimeMs).toISOString().slice(0,10));
    expect(date.getUTCHours()).toBe(10);expect(date.getUTCMinutes()).toBeGreaterThanOrEqual(15);expect(date.getUTCMinutes()).toBeLessThan(17);
  }
  for(const [id,accept,decline,seconds,notebook]of [
    ["tom-lunch-invitation","Talk with Tom","Leave it for now",8,"notebook.s1.tom-lunch-promise"],
    ["yada-dismissal","Speak with Yada","Leave it for now",14,"notebook.s1.yada-dismissal"],
  ]){
    if((await saved()).character.storyFlags[flag(id)])continue;
    console.info(`Final day: ${id} decline/cancel/reload/natural acknowledgement`);
    await choose(decline);expect((await check()).character.storyFlags[flag(id)]).not.toBe(true);
    await reload();await choose(accept);await scene(id);await page.waitForTimeout(seconds*1000);
    await page.screenshot({path:testInfo.outputPath(`${id}-original-cast-and-room.png`)});
    await page.evaluate(()=>window.storyProbe.regions.controller.cancel("final-day-film-cancel"));expect((await check()).character.storyFlags[flag(id)]).not.toBe(true);
    await reload();await choose(accept);await scene(id);
    await expect.poll(async()=>(await saved()).character.storyFlags[flag(id)],{timeout:100_000}).toBe(true);
    expect((await check()).character.storyFlags[notebook]).toBe(true);
  }
  await reload();await page.waitForTimeout(2000);await check();
  expect(await page.evaluate(()=>window.storyProbe.starts)).toEqual([]);
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  await page.screenshot({path:testInfo.outputPath("final-day-dismissal-saved-and-unlocked.png")});
  if(process.env.NEW_YOKOSUKA_FINAL_DAY_CAST_E2E==="true"){
    // A separately labelled renderer audit, not another narrative completion.
    // Reuse the same pose snapshot/restore used by the shared activity runner.
    const before=await check();
    await page.evaluate(async()=>{
      const p=window.storyProbe,{ScriptEventPresentationCatalog}=await import("/play/scripts/ScriptEventPresentationCatalog.js");
      p.visualReturn=p.lifecycle.capturePlayerReturnState();
      if(!await p.director.start(new ScriptEventPresentationCatalog().activity("s1.mfsy.tom-lunch-invitation.scene").cutscene))throw Error("Tom renderer audit did not start");
    });
    try{
      for(const [delay,label]of [[3000,"opening"],[9000,"reply"],[7000,"closing"]]){
        await page.waitForTimeout(delay);await page.screenshot({path:testInfo.outputPath(`tom-original-cast-${label}.png`)});
      }
    }finally{
      await page.evaluate(async()=>{const p=window.storyProbe;await p.director.end("renderer-audit-cancel");p.lifecycle.restorePlayerPose(p.visualReturn);delete p.visualReturn;});
    }
    const after=await check();expect(after.character.storyFlags).toEqual(before.character.storyFlags);
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  }
}

// Continue the earned dismissal without editing date, flags or rewards. The
// movie offers the lesson; only real challenge input can earn mastery.
export async function verifyTomLessonAndFarewell(page,testInfo,character){
  await page.setViewportSize({width:1920,height:1080});
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved(),lesson="story.s1.tom-lesson.completed",learned="story.s1.tornado-kick.learned",farewell="story.s1.tom-farewell.completed";
  expect(initial.character.storyFlags["story.s1.yada-dismissal.completed"]).toBe(true);
  const check=async()=>{
    const s=await saved();expect(s.character.yen).toBe(initial.character.yen);expect(s.inventory).toEqual(initial.inventory);
    for(const id of ["final-battle","departure"])expect(s.character.storyFlags[`story.s1.${id}.completed`]).not.toBe(true);
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return s;
  };
  const choose=name=>page.getByRole("button",{name,exact:true}).click({timeout:90_000});
  const scene=async id=>{await page.waitForFunction(id=>window.storyProbe.director?.activeCutscene?.cutscene.id===`story-s1-${id}`||window.storyProbe.sceneErrors.length,id,{timeout:90_000});await check();};
  const ready=async()=>{await page.waitForFunction(()=>window.storyProbe.regions.controller.active?.challengePrompt?.id==="s1.mfsy.tornado-kick"&&window.storyProbe.regions.controller.active.challengePrompt.ready||window.storyProbe.sceneErrors.length,null,{timeout:90_000});await check();};
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);await check();};
  const reload=async()=>{
    await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();
    await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();
    await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);
  };
  const approach=()=>page.evaluate(async()=>{const l=window.storyProbe.lifecycle;if(l.worldRuntime.activeWorld.id!=="mfsy")await l.travelToWorld("mfsy");l.resetPlayer(l.vectorFromArray([106.778,0,14.119]),0,{persist:true});});
  const learn=async(skip=false)=>{
    await choose("Have lunch with Tom");await scene("tom-lesson-offer");if(skip)await page.keyboard.press("KeyX");
    await choose("Learn the Tornado Kick");await scene("tom-lesson-accept");if(skip)await page.keyboard.press("KeyX");
    await scene("tom-lesson-demo");if(skip)await page.keyboard.press("KeyX");await ready();
  };
  if(!(await saved()).character.storyFlags[lesson]){
    console.info("Final day: original optional lesson, actual input, cancellation and retries");
    await approach();
    const lunchClock=new Date((await saved()).character.storyTimeMs);
    if(lunchClock.getUTCHours()+lunchClock.getUTCMinutes()/60<11.5){
      await page.locator("#story-wait-button").click();await page.getByRole("option",{name:"Wait until 11:30 a.m.",exact:true}).click();await choose("Wait until 11:30 a.m.");
    }
    await choose("Leave it for now");await reload();await learn();
    await page.screenshot({path:testInfo.outputPath("tom-original-practice-and-input.png")});
    expect((await check()).character.storyFlags[learned]).not.toBe(true);
    await page.evaluate(()=>window.storyProbe.regions.controller.cancel("tom-practice-cancel"));await idle();
    expect((await check()).character.storyFlags[lesson]).not.toBe(true);
    await reload();await learn(true);
    await page.keyboard.press("Shift");await choose("Try again");await ready();
    await choose("Try again");await ready(); // Let the previous input window expire.
    for(const [index,button]of ["Up","Up","A","A"].entries()){
      await page.waitForFunction(index=>window.storyProbe.regions.controller.active?.challengePrompt?.index===index,index);
      await page.locator(`[data-challenge-button="${button}"]`).click();
    }
    await scene("tom-lesson-success");expect((await check()).character.storyFlags[learned]).not.toBe(true);
    await page.screenshot({path:testInfo.outputPath("tom-original-success-before-settlement.png")});
    await expect.poll(async()=>(await saved()).character.storyFlags[learned],{timeout:90_000}).toBe(true);
    const s=await check();expect(s.character.storyFlags[lesson]).toBe(true);expect(s.character.storyFlags["notebook.s1.tornado-kick"]).toBe(true);
    expect(s.character.storyFlags[farewell]).not.toBe(true);
  }
  if(!(await saved()).character.storyFlags[farewell]){
    console.info("Final day: separate cancelled/retried original farewell and personal nightfall");
    await choose("Leave it for now");await reload();await choose("Say goodbye to Tom");await scene("tom-farewell");
    await page.waitForTimeout(7000);await page.screenshot({path:testInfo.outputPath("tom-original-farewell-opening.png")});
    await page.evaluate(()=>window.storyProbe.regions.controller.cancel("tom-farewell-cancel"));await idle();
    expect((await check()).character.storyFlags[farewell]).not.toBe(true);expect((await check()).character.storyFlags[learned]).toBe(true);
    await reload();await choose("Say goodbye to Tom");await scene("tom-farewell");
    for(const [delay,label]of [[18000,"conversation"],[30000,"promise"],[20000,"departure"]]){
      await page.waitForTimeout(delay);await page.screenshot({path:testInfo.outputPath(`tom-original-farewell-${label}.png`)});await check();
    }
    await expect.poll(async()=>(await saved()).character.storyFlags[farewell],{timeout:70_000}).toBe(true);
  }
  const final=await check(),date=new Date(final.character.storyTimeMs);
  expect(date.toISOString().slice(0,10)).toBe(new Date(initial.character.storyTimeMs).toISOString().slice(0,10));
  expect(date.getUTCHours()).toBe(22);expect(final.character.storyFlags["notebook.s1.tom-farewell"]).toBe(true);
  await idle();await reload();await idle();
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.starts)).toEqual([]);
  const residents=await page.evaluate(()=>[...window.storyProbe.lifecycle.characterAssembly.scheduledActors.entries.values()]
    .filter(e=>e.definition.actorCode==="TOM_"&&!e.definition.activityOnly)
    .map(e=>({id:e.definition.id,enabled:[e.root,...(e.modelRoots?.values()||[])].filter(Boolean).some(r=>r.isEnabled())})));
  expect(residents.length).toBeGreaterThan(0);expect(residents.every(r=>!r.enabled)).toBe(true);
  await page.screenshot({path:testInfo.outputPath("tom-farewell-saved-personal-night-unlocked.png")});
}
