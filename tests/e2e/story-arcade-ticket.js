import {expect} from "@playwright/test";
import {openStoryRoomDoor} from "./story-object-input.js";

// Continues a genuinely earned Asia/Jimmy save. No future story flags,
// calendar records, presentation results or inventory are injected here.
export async function verifyJimmyMorningCall(page,testInfo,character){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved();expect(initial.character.storyFlags["story.s1.boat-ticket-collection.completed"]).toBe(true);
  const noErrors=async()=>expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const idle=async()=>{
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");await noErrors();
    // Atomic travel can settle before the replacement world/controller finishes
    // loading. Check the gameplay boundary, not just Yarn's terminal receipt.
    await page.waitForFunction(()=>{const l=window.storyProbe.lifecycle;return l.worldRuntime.ready&&!l.worldRuntime.switching;},null,{timeout:60_000});
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  };
  const scene=async id=>{await page.waitForFunction(id=>window.storyProbe.director?.activeCutscene?.cutscene.id===`story-s1-${id}`||window.storyProbe.sceneErrors.length,id,{timeout:70_000});await noErrors();};
  const reset=async(position,yaw=0)=>{await page.evaluate(({position,yaw})=>{
    const l=window.storyProbe.lifecycle,c=l.getController();l.resetPlayer(l.vectorFromArray(position),yaw,{persist:false});
    c.setFirstPerson(true);c.cameraYaw=yaw;c.cameraPitch=0;c.updateCamera(1);
  },{position,yaw});await page.waitForTimeout(250);};
  const walk=async(predicate)=>{
    await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
    try{await page.waitForFunction(predicate,null,{timeout:15_000});}
    catch(error){console.info("Story approach",await page.evaluate(()=>({position:window.storyProbe.lifecycle.getController().collider.position.asArray(),status:window.storyProbe.regions.controller.status,inside:[...window.storyProbe.regions.inside]})));throw error;}
    finally{await page.keyboard.up("KeyW");}await noErrors();
  };
  const sleepFlag="story.s1.snow-dream.completed",callFlag="story.s1.jimmy-morning-call.completed";
  const unchanged=async flag=>{const s=await saved();expect(s.character.storyFlags[flag]).not.toBe(true);expect(s.character.yen).toBe(initial.character.yen);expect(s.inventory).toEqual(initial.inventory);};
  if(!(await saved()).character.storyFlags[callFlag]){
    await page.evaluate(()=>window.storyProbe.lifecycle.travelToWorld("interior"));
    await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==="interior"&&window.storyProbe.lifecycle.worldRuntime.ready);
    if(!(await saved()).character.storyFlags[sleepFlag]){
      // The earned fixture is still on the promise day. A foyer approach now
      // must decline rather than immediately inventing tomorrow's call.
      await reset([-17.6,0,2.9]);await page.waitForTimeout(1000);await idle();
      await unchanged(callFlag);expect(await page.evaluate(()=>window.storyProbe.starts.includes("story-s1-jimmy-morning-call"))).toBe(false);
      if(new Date((await saved()).character.storyTimeMs).getUTCHours()<20){
        await page.locator("#story-wait-button").click();await page.getByRole("option",{name:"Wait until 8 p.m.",exact:true}).click();
        await page.getByRole("button",{name:"Wait until 8 p.m.",exact:true}).click();await idle();
      }
      const approach=async()=>{await reset([-17.6,0,3],Math.PI);await walk(()=>window.storyProbe.regions.controller.status==="options"||window.storyProbe.sceneErrors.length);};
      await approach();await page.getByRole("button",{name:"Stay awake",exact:true}).click();await idle();await unchanged(sleepFlag);
      await approach();await page.getByRole("button",{name:"Sleep until tomorrow",exact:true}).click();await scene("snow-dream");
      await page.waitForTimeout(1800);await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-snow-dream-cancel"));await idle();await unchanged(sleepFlag);
      await approach();const beforeSleep=await saved();await page.getByRole("button",{name:"Sleep until tomorrow",exact:true}).click();await scene("snow-dream");
      await page.waitForTimeout(9000);await page.screenshot({path:testInfo.outputPath("original-snow-girl-dream.png")});await unchanged(sleepFlag);
      await expect.poll(async()=>(await saved()).character.storyFlags[sleepFlag],{timeout:100_000,intervals:[1000]}).toBe(true);await idle();
      const a=new Date((await saved()).character.storyTimeMs),b=new Date(beforeSleep.character.storyTimeMs);
      expect(a.toISOString().slice(0,10)).toBe(new Date(Date.UTC(b.getUTCFullYear(),b.getUTCMonth(),b.getUTCDate()+1)).toISOString().slice(0,10));
      expect(a.getUTCHours()).toBe(8);expect(a.getUTCMinutes()).toBeGreaterThanOrEqual(30);expect(a.getUTCMinutes()).toBeLessThan(35);
    }
    await openStoryRoomDoor(page,{tag:"dor7",position:[-17.6,0,4.1]});
    const approachCall=async()=>{await reset([-17.6,0,4.1]);await walk(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-jimmy-morning-call"||window.storyProbe.sceneErrors.length);await scene("jimmy-morning-call");};
    await approachCall();await page.waitForTimeout(2000);await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-jimmy-call-cancel"));await idle();await unchanged(callFlag);
    await approachCall();await page.waitForTimeout(9000);await page.screenshot({path:testInfo.outputPath("fuku-answers-jimmy-original-phone.png")});
    await page.waitForTimeout(17_000);await page.screenshot({path:testInfo.outputPath("ryo-jimmy-phone-original-camera.png")});await unchanged(callFlag);
    await expect.poll(async()=>(await saved()).character.storyFlags[callFlag],{timeout:55_000,intervals:[1000]}).toBe(true);await idle();
  }
  const final=await saved();expect(final.character.storyFlags["notebook.s1.jimmy-arcade-appointment"]).toBe(true);
  expect(final.character.yen).toBe(initial.character.yen);expect(final.inventory).toEqual(initial.inventory);
  await page.locator("button").filter({hasText:/^Notebook$/}).click();
  for(let i=0;i<120&&await page.locator("#journal-next").isEnabled();i++)await page.locator("#journal-next").click();
  await expect(page.locator("#journal-page-copy")).toContainText("Meet him at You Arcade in Dobuita at noon.");await page.screenshot({path:testInfo.outputPath("jimmy-arcade-appointment-notebook.png")});
  await page.locator("#journal-close").click();
  await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();
  await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();
  await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);await idle();
  expect((await saved()).character.storyFlags[callFlag]).toBe(true);expect(await page.evaluate(()=>window.storyProbe.starts.includes("story-s1-jimmy-morning-call"))).toBe(false);
}
