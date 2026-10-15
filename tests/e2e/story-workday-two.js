import {expect} from "@playwright/test";

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
