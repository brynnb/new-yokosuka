import {expect} from "@playwright/test";
import {verifyWorkdayNight} from "./story-workday-two.js";
import {verifyMorningRace} from "./story-morning-race.js";
import {verifyMorningCargo} from "./story-workday-one.js";
import {driveObservedDeliveries} from "./story-forklift-training.js";

// Continue the actual Charlie-earned character. These shared drivers use real
// sleep choices, course driving, forklift physics and original presentations.
export async function verifyFourthMorning(page,testInfo,character){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved();expect(initial.character.storyFlags["story.s1.charlie-harbor.completed"]).toBe(true);
  const check=async()=>{const s=await saved();expect(s.character.yen).toBe(initial.character.yen);expect(s.inventory).toEqual(initial.inventory);expect(s.character.storyFlags["story.s1.workday-four.completed"]).not.toBe(true);expect(s.character.storyFlags["story.s1.workday-four-payday.completed"]).not.toBe(true);expect(s.character.storyFlags["notebook.s1.long-zha"]).not.toBe(true);expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return s;};
  console.info("Fourth morning stage: original Lan Di dream, cancellation/retry and saved next-day arrival");
  await verifyWorkdayNight(page,testInfo,character,{day:"three"});await check();
  if(!(await saved()).character.storyFlags["story.s1.workday-four-race.completed"]){
    console.info("Fourth morning stage: new actual three-lap race");await verifyMorningRace(page,testInfo,character,{day:"four"});await check();
  }
  if(!(await saved()).character.storyFlags["story.s1.workday-four-morning.completed"]){
    console.info("Fourth morning stage: four physical deliveries, original lunch and saved noon");await verifyMorningCargo(page,testInfo,character,{day:"four"});await check();
  }
  const final=await check();expect(final.character.worldId).toBe("mfsy");expect(final.character.storyFlags["notebook.s1.workday-four-morning"]).toBe(true);expect(final.character.storyFlags["notebook.s1.workday-four-race"]).toBe(true);expect(final.character.storyFlags["notebook.s1.workday-four-lunch"]).toBe(true);
  expect(new Date(final.character.storyTimeMs).getUTCHours()).toBe(12);
  await page.screenshot({path:testInfo.outputPath("fourth-workday-earned-noon-reload.png")});
}

// Resume the earned noon save; no replayed morning, injected flags or edited
// clock. Wait through the ordinary personal-clock UI and walk into the region.
export async function verifyFourthLunch(page,testInfo,character){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved(),flag="story.s1.workday-four-spying.completed";
  expect(initial.character.storyFlags["story.s1.workday-four-morning.completed"]).toBe(true);
  const check=async()=>{const s=await saved();expect(s.character.yen).toBe(initial.character.yen);expect(s.inventory).toEqual(initial.inventory);for(const f of ["story.s1.workday-four-payday.completed","story.s1.workday-four.completed","notebook.s1.long-zha"])expect(s.character.storyFlags[f]).not.toBe(true);expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return s;};
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);};
  const position=()=>page.evaluate(()=>{const l=window.storyProbe.lifecycle,c=l.getController();l.resetPlayer(l.vectorFromArray([45.7,0,45]),Math.PI,{persist:false});c.setFirstPerson(true);c.cameraYaw=Math.PI;c.cameraPitch=0;c.updateCamera(1);});
  const begin=async()=>{await idle();await position();await page.waitForTimeout(250);await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");try{await page.getByText("Hey, if it isn't Ryo. What's up?",{exact:true}).waitFor({timeout:20_000});}finally{await page.keyboard.up("KeyW");}await page.waitForFunction(()=>window.storyProbe.authoredScene?.active?.scene.id==="s1.mfsy.workday-four-spying");};
  if(!initial.character.storyFlags[flag]){
    console.info("Fourth lunch stage: original voiced coworker warning, cancellation/retry");
    await idle();await position();
    const time=new Date((await saved()).character.storyTimeMs);
    if(time.getUTCHours()<13){await page.locator("#story-wait-button").click();await page.getByRole("option",{name:"Wait until 1 p.m.",exact:true}).click();await page.getByRole("button",{name:"Wait until 1 p.m.",exact:true}).click();await idle();}
    await begin();await page.waitForTimeout(1200);await page.screenshot({path:testInfo.outputPath("fourth-lunch-tsuyoshi-warning.png")});
    await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-fourth-lunch-warning-cancel"));await idle();expect((await check()).character.storyFlags[flag]).not.toBe(true);
    await begin();
    for(let i=0;i<30;i++){
      if((await saved()).character.storyFlags[flag])break;
      await page.keyboard.press("Space");await page.waitForTimeout(300);
    }
    await expect.poll(async()=>(await saved()).character.storyFlags[flag]).toBe(true);await idle();
  }
  const final=await check();expect(final.character.storyFlags["notebook.s1.harbor-spying"]).toBe(true);expect(final.character.worldId).toBe("mfsy");
  expect(new Date(final.character.storyTimeMs).toISOString().slice(0,10)).toBe(new Date(initial.character.storyTimeMs).toISOString().slice(0,10));
  await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);await idle();await check();
  expect(await page.evaluate(()=>window.storyProbe.authoredScene?.active?.scene.id)).not.toBe("s1.mfsy.workday-four-spying");
  await page.screenshot({path:testInfo.outputPath("fourth-lunch-earned-warning-reload.png")});
}

export async function verifyFourthAfternoon(page,testInfo,character){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved(),trap="story.s1.goro-trap.completed",pay="story.s1.workday-four-payday.completed",chapter="story.s1.workday-four.completed",unpaid=initial.character.yen-(initial.character.storyFlags[pay]?2400:0);
  expect(initial.character.storyFlags["story.s1.workday-four-spying.completed"]).toBe(true);
  if(process.env.NEW_YOKOSUKA_GORO_PRESENTATION_ONLY==="true")expect(initial.character.storyFlags[trap]).not.toBe(true);
  const check=async()=>{const s=await saved();expect(s.character.yen).toBe(unpaid+(s.character.storyFlags[pay]?2400:0));expect(s.inventory).toEqual(initial.inventory);expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return s;};
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);await check();};
  const approach=async(position,yaw,wait)=>{await idle();await page.evaluate(({position,yaw})=>{const l=window.storyProbe.lifecycle,c=l.getController();l.resetPlayer(l.vectorFromArray(position),yaw,{persist:false});c.setFirstPerson(true);c.cameraYaw=yaw;c.cameraPitch=0;c.updateCamera(1);},{position,yaw});await page.waitForTimeout(250);await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");try{await wait();}finally{await page.keyboard.up("KeyW");}};
  const scene=async id=>{await page.waitForFunction(id=>window.storyProbe.director?.activeCutscene?.cutscene.id===id||window.storyProbe.sceneErrors.length,id,{timeout:65_000});await check();};
  const begin=()=>approach([-41.4,0,71],Math.PI,()=>page.getByRole("button",{name:"Help Goro",exact:true}).waitFor());
  const intro=async()=>{await page.getByRole("button",{name:"Help Goro",exact:true}).click();await page.getByText("Goro! What happened?!",{exact:true}).waitFor();};
  const advanceIntro=async()=>{for(let i=0;i<24;i++){if(await page.evaluate(()=>!!window.storyProbe.regions.controller.active?.challengePrompt))break;await page.keyboard.press("Space");await page.waitForTimeout(250);}};
  const prompt=async(i,button)=>{await page.waitForFunction(({i,button})=>{const p=window.storyProbe.regions.controller.active?.challengePrompt,s=window.storyProbe.authoredScene?.active?.scene;return p?.ready&&p.button===button&&p.index===(i<6?0:i-6)&&s?.id===`s1.mfsy.goro-trap.${i<6?String.fromCharCode(97+i):"gh"}.prompt`||window.storyProbe.sceneErrors.length;},{i,button},{timeout:65_000});await check();};
  const win=async(capture=false)=>{
    await advanceIntro();const buttons=["B","A","B","A","A","B","Left","Down","A"];
    for(let i=0;i<buttons.length;i++){
      await prompt(i,buttons[i]);
      if(i===1)expect(await page.evaluate(()=>{const a=window.storyProbe.authoredScene.actors;return !a.activeActor("BKA_").root.isEnabled()&&a.activeActor("BKB_").root.isEnabled();})).toBe(true);
      await page.locator(`[data-challenge-button="${buttons[i]}"]`).click();
      if(capture&&[0,5,8].includes(i)){
        await page.waitForFunction(i=>window.storyProbe.authoredScene?.active?.scene.id===`s1.mfsy.goro-trap.${i<6?String.fromCharCode(97+i):"gh"}.success`,i);
        await page.waitForTimeout(600);await page.screenshot({path:testInfo.outputPath(`goro-trap-original-paired-motion-${i+1}.png`)});
      }
    }
    await scene("story-s1-goro-trap-aftermath");
  };
  if(!initial.character.storyFlags[trap]){
    console.info("Fourth afternoon stage: earned personal14:00 approach, decline and original-voiced introduction cancellation");
    // A failed/cancelled prior attempt may have saved the real approach. Exit
    // its normal automatic offer before walking out and re-entering to retry.
    await page.waitForTimeout(500);if(await page.getByRole("button",{name:"Help Goro",exact:true}).isVisible())await page.getByRole("button",{name:"Leave it for now",exact:true}).click();
    await idle();if(new Date((await saved()).character.storyTimeMs).getUTCHours()<14){await page.locator("#story-wait-button").click();await page.getByRole("option",{name:"Wait until 2 p.m.",exact:true}).click();await page.getByRole("button",{name:"Wait until 2 p.m.",exact:true}).click();await idle();}
    await begin();await page.getByRole("button",{name:"Leave it for now",exact:true}).click();await idle();expect((await check()).character.storyFlags[trap]).not.toBe(true);
    await begin();await intro();await page.waitForTimeout(1200);await page.screenshot({path:testInfo.outputPath("goro-trap-original-voices-intro.png")});await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-goro-intro-cancel"));await idle();expect((await check()).character.storyFlags[trap]).not.toBe(true);
    console.info("Fourth afternoon stage: wrong input, original failure motion, retry and all nine inputs");
    await begin();await intro();await advanceIntro();await prompt(0,"B");await page.keyboard.press("ArrowUp");await page.getByText("I could not get through their trap. Try again?",{exact:true}).waitFor();await page.keyboard.press("Space");await page.getByRole("button",{name:"Try again",exact:true}).click();await page.getByText("Goro! What happened?!",{exact:true}).waitFor();await win(true);
    await page.waitForTimeout(6000);await page.screenshot({path:testInfo.outputPath("goro-trap-original-threats-ending.png")});await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-goro-ending-cancel"));await idle();expect((await check()).character.storyFlags[trap]).not.toBe(true);
    // Visual revalidation on a separate genuine pre-trap backup may stop
    // here. It proves the real nine-input path but deliberately saves nothing.
    if(process.env.NEW_YOKOSUKA_GORO_PRESENTATION_ONLY==="true")return;
    console.info("Fourth afternoon stage: retry full QTE and naturally acknowledge original ending");
    await begin();await intro();await win();await expect.poll(async()=>(await saved()).character.storyFlags[trap],{timeout:75_000,intervals:[1000]}).toBe(true);await idle();expect((await check()).character.storyFlags["notebook.s1.goro-trap"]).toBe(true);
  }
  if(!(await saved()).character.storyFlags["story.s1.workday-four-afternoon.completed"]){
    console.info("Fourth afternoon stage: four actual physical deliveries and acknowledged17:00 quota");
    const briefing=page.getByText("Goro is safe, but the Mad Angels threatened my family and friends. Finish the remaining four crates before collecting my wages.",{exact:true});
    // Reconnecting at the dispatch pad may already have its exact briefing.
    await page.waitForTimeout(500);if(!await briefing.isVisible())await approach([-20,0,117],-Math.PI/2,()=>briefing.waitFor());await page.keyboard.press("Space");await page.getByRole("button",{name:"Start the deliveries",exact:true}).click();await page.waitForFunction(()=>window.storyProbe.delivery?.active?.entered||window.storyProbe.sceneErrors.length,null,{timeout:45_000});await check();await page.waitForTimeout(1800);await page.locator("#renderCanvas").focus();await driveObservedDeliveries(page,testInfo,4,"workday-four-afternoon");
    await page.getByText("All eight crates are delivered. The shift is over; collect today's wages from Yada-san.",{exact:true}).waitFor();expect((await check()).character.storyFlags["story.s1.workday-four-afternoon.completed"]).not.toBe(true);await page.keyboard.press("Space");await idle();expect(new Date((await check()).character.storyTimeMs).getUTCHours()).toBe(17);
  }
  if(!(await saved()).character.storyFlags[pay]){
    console.info("Fourth afternoon stage: original salary motions, cancellation and once-only wages");
    const collect=async()=>{await approach([25,0,66],Math.PI,()=>page.getByText("Eight crates at 300 yen each: 2,400 yen. Yada-san has today's wages ready.",{exact:true}).waitFor());await page.keyboard.press("Space");await page.getByRole("button",{name:"Collect today's wages",exact:true}).click();await page.waitForFunction(()=>window.storyProbe.authoredScene?.active?.scene.id==="s1.mfsy.payday"||window.storyProbe.sceneErrors.length,null,{timeout:45_000});await check();};
    await collect();await page.waitForTimeout(6000);await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-fourth-payday-cancel"));await idle();expect((await check()).character.storyFlags[pay]).not.toBe(true);
    await collect();await page.getByText("Collected today's wages: 2,400 yen. Speak with Mark beside the harbor about the Mad Angels' trade.",{exact:true}).waitFor({timeout:65_000});expect((await check()).character.storyFlags[pay]).not.toBe(true);await page.keyboard.press("Space");await idle();expect((await check()).character.storyFlags[pay]).toBe(true);
  }
  if(!(await saved()).character.storyFlags[chapter]){
    console.info("Fourth afternoon stage: original Mark LongZha explanation, cancellation/retry and saved chapter");
    // The south-side test approach [13.1,66] is water and invokes normal
    // fall recovery. Walk along the quay from the east of original Ryo.
    const mark=()=>approach([18,0,70.8],Math.PI/2,()=>scene("story-s1-mark-long-zha"));
    await mark();await page.waitForTimeout(6000);await page.screenshot({path:testInfo.outputPath("fourth-day-original-mark-long-zha.png")});await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-long-zha-cancel"));await idle();expect((await check()).character.storyFlags[chapter]).not.toBe(true);
    await mark();await expect.poll(async()=>(await saved()).character.storyFlags[chapter],{timeout:95_000,intervals:[1000]}).toBe(true);await idle();
  }
  const final=await check();expect(final.character.storyFlags["notebook.s1.long-zha"]).toBe(true);expect(final.character.storyFlags["story.s1.mark-long-zha.completed"]).toBe(true);expect(final.character.worldId).toBe("mfsy");
  await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);await idle();await check();expect(await page.evaluate(()=>window.storyProbe.starts.includes("story-s1-mark-long-zha"))).toBe(false);
  await page.screenshot({path:testInfo.outputPath("fourth-workday-earned-long-zha-reload.png")});
}
