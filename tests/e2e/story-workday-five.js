import {expect} from "@playwright/test";
import {verifyWorkdayNight} from "./story-workday-two.js";
import {verifyMorningRace} from "./story-morning-race.js";
import {verifyMorningCargo} from "./story-workday-one.js";

// Resume the actual Long Zha-earned character. No injected future calendar,
// result, cargo credit or dialogue flags; shared real-input drivers do the work.
export async function verifyFifthMorning(page,testInfo,character){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved();expect(initial.character.storyFlags["story.s1.mark-long-zha.completed"]).toBe(true);
  const check=async()=>{const s=await saved();expect(s.character.yen).toBe(initial.character.yen);expect(s.inventory).toEqual(initial.inventory);for(const f of ["story.s1.workday-five-afternoon.completed","story.s1.workday-five-payday.completed","story.s1.workday-five.completed"])expect(s.character.storyFlags[f]).not.toBe(true);expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return s;};
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);await check();};
  if(!(await saved()).character.storyFlags["story.s1.workday-five-race.completed"]){
    console.info("Fifth morning stage: ordinary sleep, decline/cancel/retry and saved commute");await verifyWorkdayNight(page,testInfo,character,{day:"four"});await check();
    console.info("Fifth morning stage: independently earned actual three-lap race");await verifyMorningRace(page,testInfo,character,{day:"five"});await check();
  }
  if(!(await saved()).character.storyFlags["story.s1.workday-five-morning.completed"]){
    console.info("Fifth morning stage: five real deliveries and original coworker lunch");await verifyMorningCargo(page,testInfo,character,{day:"five"});await check();
  }
  const done="story.s1.goro-mai-marriage.completed";
  if(!(await saved()).character.storyFlags[done]){
    console.info("Fifth lunch stage: original Goro/Mai announcement, cancellation/retry");
    const begin=async()=>{await idle();await page.evaluate(()=>{const l=window.storyProbe.lifecycle,c=l.getController();l.resetPlayer(l.vectorFromArray([40,0,58.5]),Math.PI/2,{persist:false});c.setFirstPerson(true);c.cameraYaw=Math.PI/2;c.cameraPitch=0;c.updateCamera(1);});await page.waitForTimeout(250);await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");try{await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-goro-mai-marriage"||window.storyProbe.sceneErrors.length,null,{timeout:65_000});}finally{await page.keyboard.up("KeyW");}await check();};
    await begin();await page.waitForTimeout(6000);await page.screenshot({path:testInfo.outputPath("fifth-lunch-original-goro-mai-announcement.png")});await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-goro-mai-announcement-cancel"));await idle();expect((await check()).character.storyFlags[done]).not.toBe(true);
    await begin();await expect.poll(async()=>(await saved()).character.storyFlags[done],{timeout:100_000,intervals:[1000]}).toBe(true);await idle();
  }
  const final=await check();for(const f of ["notebook.s1.workday-five-morning","notebook.s1.workday-five-race","notebook.s1.workday-five-lunch","notebook.s1.goro-mai-marriage"])expect(final.character.storyFlags[f]).toBe(true);expect(new Date(final.character.storyTimeMs).getUTCHours()).toBe(12);
  await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);await idle();await check();
  expect(await page.evaluate(()=>window.storyProbe.starts.includes("story-s1-goro-mai-marriage"))).toBe(false);await page.screenshot({path:testInfo.outputPath("fifth-morning-earned-lunch-reload.png")});
}
