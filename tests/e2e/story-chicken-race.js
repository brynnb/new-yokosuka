import {expect} from "@playwright/test";

export async function verifyChickenRace(page,testInfo,character){
  await page.setViewportSize({width:1920,height:1080});
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved(),done="story.s1.chicken-race.completed";
  expect(initial.character.storyFlags["story.s1.forklift-training.completed"]).toBe(true);
  expect(initial.character.storyFlags[done]).not.toBe(true);
  const noErrors=async()=>expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);await noErrors();};
  const unchanged=async()=>{const s=await saved();expect(s.character.yen).toBe(initial.character.yen);expect(s.inventory).toEqual(initial.inventory);expect(s.character.storyFlags[done]).not.toBe(true);};
  const pose=()=>page.evaluate(()=>{const l=window.storyProbe.lifecycle,c=l.getController();return{position:l.capturePlayerReturnState().position,firstPerson:c.firstPerson,cameraYaw:c.cameraYaw,cameraPitch:c.cameraPitch,cameraDistance:c.cameraDistance};});
  await page.evaluate(()=>window.storyProbe.lifecycle.travelToWorld("mfsy"));
  await page.waitForFunction(()=>["idle","options"].includes(window.storyProbe.regions.controller.status));
  if(await page.evaluate(()=>window.storyProbe.regions.controller.status==="options"))await page.getByRole("button",{name:"Leave it for now",exact:true}).click();
  await idle();
  const approach=async(expected=true)=>{
    await page.evaluate(()=>{const l=window.storyProbe.lifecycle,c=l.getController();l.resetPlayer(l.vectorFromArray([1.7,0,95]),0,{persist:false});c.setFirstPerson(true);c.cameraYaw=0;c.cameraPitch=0;c.updateCamera(1);});
    await page.waitForTimeout(200);await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
    try{if(expected)await page.waitForFunction(()=>window.storyProbe.regions.controller.status==="options"||window.storyProbe.sceneErrors.length,null,{timeout:15_000});else await page.waitForTimeout(1600);}finally{await page.keyboard.up("KeyW");}await noErrors();
  };
  const scene=async()=>{await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-chicken-race-intro"||window.storyProbe.sceneErrors.length,null,{timeout:60_000});await noErrors();};
  const ready=async()=>{await page.waitForFunction(()=>window.storyProbe.regions.controller.active?.challengePrompt?.id==="s1.mfsy.chicken-race"&&window.storyProbe.regions.controller.active.challengePrompt.ready||window.storyProbe.sceneErrors.length,null,{timeout:70_000});await noErrors();};
  const win=async()=>{for(const [index,button]of ["A","Down","Left","Right"].entries()){await page.waitForFunction(index=>window.storyProbe.regions.controller.dialogue.qte?.active?.index===index,index);await page.locator(`[data-challenge-button="${button}"]`).click();}await page.getByText("The riders back down. Shozo is safe.",{exact:true}).waitFor();};
  const caption=async()=>{await page.keyboard.press("Space");};
  const cancel=async()=>{await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-chicken-cancel"));await idle();await unchanged();};
  if(new Date(initial.character.storyTimeMs).getUTCHours()<19){await approach(false);await idle();await unchanged();}
  await page.evaluate(()=>{const l=window.storyProbe.lifecycle;l.resetPlayer(l.vectorFromArray([1.7,0,95]),0,{persist:true});});
  if(new Date(initial.character.storyTimeMs).getUTCHours()<19||new Date(initial.character.storyTimeMs).getUTCHours()>=23){
    await page.locator("#story-wait-button").click();await page.getByRole("option",{name:"Wait until 7 p.m.",exact:true}).click();await page.getByRole("button",{name:"Wait until 7 p.m.",exact:true}).click();await idle();
  }
  await approach();await page.getByRole("button",{name:"Leave it for now",exact:true}).click();await idle();await unchanged();
  await approach();await page.getByRole("button",{name:"Help the old man",exact:true}).click();await scene();
  await page.waitForTimeout(18_000);await page.screenshot({path:testInfo.outputPath("chicken-race-original-introduction.png")});await cancel();
  await approach();await page.getByRole("button",{name:"Help the old man",exact:true}).click();await scene();
  // Let the original introduction finish naturally once. It cannot win the QTE.
  await ready();await unchanged();await page.screenshot({path:testInfo.outputPath("chicken-race-original-bikes-and-riders.png")});
  await page.locator('[data-challenge-button="Down"]').click();
  await page.getByText("The riders got the better of you. Try the chicken race again?",{exact:true}).waitFor();await caption();await unchanged();
  await page.getByRole("button",{name:"Try again",exact:true}).click();await scene();await page.keyboard.press("KeyX");await ready();
  await win();await cancel();
  await approach();const before=await pose();await page.getByRole("button",{name:"Help the old man",exact:true}).click();await scene();await page.keyboard.press("KeyX");await ready();
  await win();await caption();await idle();
  const final=await saved();expect(final.character.storyFlags[done]).toBe(true);expect(final.character.storyFlags["notebook.s1.chicken-race"]).toBe(true);
  expect(final.character.yen).toBe(initial.character.yen);expect(final.inventory).toEqual(initial.inventory);
  const after=await pose();expect(Math.hypot(...after.position.map((v,i)=>v-before.position[i]))).toBeLessThan(.1);
  expect(after.firstPerson).toBe(before.firstPerson);expect(after.cameraYaw).toBeCloseTo(before.cameraYaw,3);expect(after.cameraPitch).toBeCloseTo(before.cameraPitch,3);
  await page.screenshot({path:testInfo.outputPath("chicken-race-earned-return.png")});
  await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);await idle();
  expect((await saved()).character.storyFlags[done]).toBe(true);expect(await page.evaluate(()=>window.storyProbe.starts.includes("story-s1-chicken-race-intro"))).toBe(false);
}
