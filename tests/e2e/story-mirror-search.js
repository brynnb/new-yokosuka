import {expect} from "@playwright/test";

export async function verifyFamilyMirrorLead(page,testInfo,character,residentClickPoint){
  expect(character.storyFlags["story.s1.master-chen.completed"]).toBe(true);
  expect(character.storyFlags["story.s1.family-mirror-lead.completed"]).not.toBe(true);
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const noErrors=async()=>expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const idle=async()=>{
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");
    expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  };
  // Exercise an ordinary click on the actual home NPC, not a scripted trigger
  // injected from the test. The clue remains optional for the courtyard event.
  await page.waitForFunction(()=>window.storyProbe.lifecycle.scheduledActors.dialogueActor("INE_"),null,{timeout:30_000});
  const point=await residentClickPoint(page,"INE_");
  await page.mouse.click(point.x,point.y);
  await page.waitForFunction(()=>window.storyProbe.dialogue?.active||window.storyProbe.sceneErrors.length,null,{timeout:15_000});
  await noErrors();
  await page.waitForFunction(()=>window.storyProbe.dialogue?.audio?.currentTime>0,null,{timeout:15_000});
  await page.screenshot({path:testInfo.outputPath("mirror-search-ine-hint.png")});
  for(let i=0;i<15;i++){
    if((await saved()).character.storyFlags["notebook.s1.fuku-looking"])break;
    await page.keyboard.press("Space");await page.waitForTimeout(300);
  }
  await expect.poll(async()=>(await saved()).character.storyFlags["notebook.s1.fuku-looking"]).toBe(true);
  await idle();
  await page.evaluate(async()=>window.storyProbe.lifecycle.travelToWorld("exterior"));
  await expect(page.locator("#loading")).toBeHidden({timeout:90_000});
  const approach=async()=>{
    // Nearby positioning isolates the earned approach, not a story outcome.
    await page.evaluate(()=>{const l=window.storyProbe.lifecycle;l.resetPlayer(l.vectorFromArray([-3.1,0,-20.5]),Math.PI,{persist:false});l.getController().setFirstPerson(false);});
    await page.waitForTimeout(300);await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
    try{
      await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-family-fuku-approach"||window.storyProbe.sceneErrors.length,null,{timeout:45_000});
    }finally{await page.keyboard.up("KeyW");}
    await noErrors();
  };
  await approach();await page.waitForTimeout(1200);
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-cancel-family"));
  await idle();expect((await saved()).character.storyFlags["notebook.s1.antique-shop-lead"]).not.toBe(true);
  await approach();
  for(const [part,sampleMs] of [["family-fuku-approach",2500],["family-fuku-conversation",9000],["family-ine-conversation",25_000]]){
    await page.waitForFunction(part=>window.storyProbe.director?.activeCutscene?.cutscene.id===`story-s1-${part}`||window.storyProbe.sceneErrors.length,part,{timeout:90_000});
    await noErrors();await page.waitForTimeout(sampleMs);
    await page.screenshot({path:testInfo.outputPath(`mirror-search-${part}.png`)});
    expect((await saved()).character.storyFlags["notebook.s1.antique-shop-lead"]).not.toBe(true);
  }
  await expect.poll(async()=>(await saved()).character.storyFlags["notebook.s1.antique-shop-lead"],{timeout:100_000,intervals:[1000]}).toBe(true);
  await idle();await noErrors();
  const after=await saved();
  expect(after.character.worldId).toBe("exterior");
  expect(after.character.avatarId).toBe("ryo");
  expect(after.character.yen).toBe(character.yen);
  expect(after.character.currentHp).toBe(character.currentHp);
  expect(after.character.storyFlags["story.s1.phoenix-mirror.completed"]).not.toBe(true);
  // Ordinary control must move Ryo after the last cinematic cleans up.
  const before=await page.evaluate(()=>window.storyProbe.lifecycle.getController().actorRoot.position.asArray());
  await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");await page.waitForTimeout(500);await page.keyboard.up("KeyW");
  const position=await page.evaluate(()=>window.storyProbe.lifecycle.getController().actorRoot.position.asArray());
  expect(Math.hypot(position[0]-before[0],position[2]-before[2])).toBeGreaterThan(.2);
  await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();
  await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();
  await page.waitForFunction(()=>window.storyProbe.ready,null,{timeout:90_000});
  await idle();await noErrors();
  expect((await saved()).character.storyFlags["notebook.s1.antique-shop-lead"]).toBe(true);
  expect(await page.evaluate(()=>window.storyProbe.director?.activeCutscene)).toBeFalsy();
}
