import {expect} from "@playwright/test";
import {verifyWorkdayNight} from "./story-workday-two.js";
import {verifyMorningRace} from "./story-morning-race.js";
import {verifyMorningCargo} from "./story-workday-one.js";

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
