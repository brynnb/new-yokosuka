import {expect} from "@playwright/test";
import {winHarborFight} from "./story-workday-one.js";

// Resume the genuinely earned third payday. Reset only near approaches; every
// timed input, fight and cinematic acknowledgement crosses the real server.
export async function verifyHarborBikers(page,testInfo,character){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved(),chase="story.s1.biker-chase.completed",done="story.s1.charlie-harbor.completed";
  expect(initial.character.storyFlags["story.s1.workday-three-payday.completed"]).toBe(true);
  const noErrors=async()=>expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);await noErrors();};
  const check=async(complete=false)=>{
    const s=await saved();expect(s.character.yen).toBe(initial.character.yen);expect(s.inventory).toEqual(initial.inventory);
    expect(s.character.storyFlags[done]===true).toBe(complete);expect(s.character.storyFlags["story.s1.workday-three.completed"]===true).toBe(complete);
    expect(s.character.storyFlags["notebook.s1.lan-di-harbor"]===true).toBe(complete);
    expect(new Date(s.character.storyTimeMs).toISOString().slice(0,10)).toBe(new Date(initial.character.storyTimeMs).toISOString().slice(0,10));await noErrors();return s;
  };
  const reload=async()=>{await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);};
  const approach=async()=>{
    // The lounge's north wall stops movement at z=66.51. Approach along the
    // original HANA/DJUN street east of its return doorway, not through that wall.
    await idle();await page.evaluate(()=>{const l=window.storyProbe.lifecycle,c=l.getController();l.resetPlayer(l.vectorFromArray([90,0,61]),Math.PI/2,{persist:false});c.setFirstPerson(true);c.cameraYaw=Math.PI/2;c.cameraPitch=0;c.updateCamera(1);});
    await page.waitForTimeout(250);await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
    try{await page.getByText("Charlie and the Mad Angels are leaving on bikes. Follow them through the harbor.",{exact:true}).waitFor();}finally{await page.keyboard.up("KeyW");}
    await page.keyboard.press("Space");await noErrors();
  };
  const prompt=async(button,beat)=>{
    await page.waitForFunction(({button,beat})=>{
      const p=window.storyProbe.regions.controller.active?.challengePrompt,s=window.storyProbe.authoredScene?.active?.scene;
      return p?.ready&&p.button===button&&s?.id===`s1.mfsy.biker-chase.beat-${String(beat).padStart(2,"0")}`||window.storyProbe.sceneErrors.length;
    },{button,beat},{timeout:60_000});await noErrors();
  };
  if(!initial.character.storyFlags[chase]){
    console.info("Harbor bikers stage: personal evening, leave and moving-scene cancellation");
    await idle();if(new Date((await saved()).character.storyTimeMs).getUTCHours()<19){
      await page.locator("#story-wait-button").click();await page.getByRole("option",{name:"Wait until 7 p.m.",exact:true}).click();await page.getByRole("button",{name:"Wait until 7 p.m.",exact:true}).click();await idle();
    }
    await approach();await page.getByRole("button",{name:"Leave it for now",exact:true}).click();await idle();expect((await check()).character.storyFlags[chase]).not.toBe(true);
    await approach();await page.getByRole("button",{name:"Chase the bikers",exact:true}).click();
    await page.waitForFunction(()=>window.storyProbe.authoredScene?.active?.scene.id==="s1.mfsy.biker-chase.beat-01"||window.storyProbe.sceneErrors.length,null,{timeout:60_000});await noErrors();
    await page.waitForTimeout(800);await page.screenshot({path:testInfo.outputPath("harbor-biker-original-motorcycle-moving.png")});
    await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-biker-running-cancel"));await idle();expect((await check()).character.storyFlags[chase]).not.toBe(true);
    console.info("Harbor bikers stage: wrong input, retry and twelve real inputs");
    await approach();await page.getByRole("button",{name:"Chase the bikers",exact:true}).click();await prompt("Left",1);await page.keyboard.press("ArrowDown");
    await page.getByText("I lost them. Try the chase again?",{exact:true}).waitFor();await page.keyboard.press("Space");await page.getByRole("button",{name:"Try again",exact:true}).click();
    const positions=[];
    const buttons=["Left","Right","A","Left","Left","A","Right","Right","Right","Left","Left","Right"];
    for(let i=0;i<buttons.length;i++){
      await prompt(buttons[i],i+1);
      const visual=await page.evaluate(()=>{const r=window.storyProbe.authoredScene,bike=r.active.sceneObjects.objects.get("BIK1").root,rider=r.actors.activeActor("CHRL").root;return{player:r.actors.activeActor("AKIR").root.getAbsolutePosition().asArray(),bike:bike.getAbsolutePosition().asArray(),rider:rider.getAbsolutePosition().asArray(),enabled:bike.isEnabled()&&rider.isEnabled()};});
      expect(visual.enabled).toBe(true);expect(Math.hypot(visual.bike[0]-visual.rider[0],visual.bike[2]-visual.rider[2])).toBeLessThan(.001);positions.push(visual.player);
      if([0,5,11].includes(i))await page.screenshot({path:testInfo.outputPath(`harbor-biker-moving-beat-${i+1}.png`)});
      await page.keyboard.press(buttons[i]==="A"?"Enter":`Arrow${buttons[i]}`);
    }
    expect(Math.hypot(positions[0][0]-positions.at(-1)[0],positions[0][2]-positions.at(-1)[2])).toBeGreaterThan(100);
    await expect.poll(async()=>(await saved()).character.storyFlags[chase]).toBe(true);await check();
    console.info("Harbor bikers stage: earned chase survives reload before the fights");
    await reload();
  }
  if(!(await saved()).character.storyFlags[done]){
    const briefing="The bikers stopped here. Five thugs are blocking the way to Charlie.";
    const waitFight=async(id,count)=>{await page.waitForFunction(id=>window.storyProbe.combatRuntime?.active?.view.ready&&window.storyProbe.combatRuntime.active.view.id===id||window.storyProbe.sceneErrors.length,id,{timeout:65_000});await noErrors();expect(await page.evaluate(()=>window.storyProbe.combatRuntime.active.view.actors.length)).toBe(count);await check();};
    const fights=async(captures=false)=>{
      await page.getByText(briefing,{exact:true}).waitFor({timeout:90_000});await page.keyboard.press("Space");await page.getByRole("button",{name:"Face the attackers",exact:true}).click();
      await waitFight("s1.mfsy.biker-thugs",6);if(captures)await page.screenshot({path:testInfo.outputPath("harbor-biker-actual-five-thug-fight.png")});await winHarborFight(page,{attack:"KeyJ"});
      await page.getByText("The others are down. Charlie is still standing.",{exact:true}).waitFor();await check();await page.keyboard.press("Space");
      await waitFight("s1.mfsy.charlie-harbor",2);if(captures)await page.screenshot({path:testInfo.outputPath("harbor-biker-actual-charlie-fight.png")});await winHarborFight(page,{attack:"KeyJ"});
      await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-charlie-harbor-interrogation"||window.storyProbe.sceneErrors.length,null,{timeout:65_000});await check();
    };
    console.info("Harbor bikers stage: actual five-thug and Charlie victories, cancellation of original interrogation");
    await fights(true);await page.waitForTimeout(7000);await page.screenshot({path:testInfo.outputPath("harbor-biker-original-charlie-interrogation.png")});
    await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-charlie-clue-cancel"));await idle();const cancelled=await check();expect(cancelled.character.storyFlags[chase]).toBe(true);
    await reload();console.info("Harbor bikers stage: earned chase retained, retry fights and naturally acknowledge the clue");
    await fights();await expect.poll(async()=>(await saved()).character.storyFlags[done],{timeout:95_000,intervals:[1000]}).toBe(true);await idle();
  }
  const final=await check(true);expect(final.character.worldId).toBe("mfsy");await reload();await idle();await check(true);
  expect(await page.evaluate(()=>window.storyProbe.starts.includes("story-s1-charlie-harbor-interrogation"))).toBe(false);
  await page.screenshot({path:testInfo.outputPath("harbor-bikers-earned-lan-di-clue-reload.png")});
}
