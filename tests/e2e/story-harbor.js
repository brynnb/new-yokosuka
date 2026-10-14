import {expect} from "@playwright/test";

// Chapter continuation uses the genuinely earned warehouse-invoice checkpoint.
// Resetting a nearby approach position isolates the trigger, not its outcomes.
export async function verifyOldDistrictEntry(page,testInfo,character){
  expect(character.storyFlags["story.s1.warehouse-eight-overheard.completed"]).toBe(true);
  expect(character.storyFlags["story.s1.old-district-entry.completed"]).not.toBe(true);
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const noErrors=async()=>expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);};
  const waitUntil=async label=>{await page.locator("#story-wait-button").click();await page.getByRole("option",{name:label,exact:true}).click();await page.getByRole("button",{name:label,exact:true}).click();};
  // A cancelled prior attempt may resume at the eligible gate at night.
  // Leave that live event before selecting an earlier-time fixture approach.
  await page.evaluate(async()=>{
    await window.storyProbe.regions.controller.cancel("test-prepare-gate-continuation");
    const l=window.storyProbe.lifecycle;await l.travelToWorld("mfsy");
    l.resetPlayer(l.vectorFromArray([130,0,-12]),0,{persist:false});
  });
  await idle();await expect(page.locator("#loading")).toBeHidden({timeout:90_000});
  const hour=new Date((await saved()).worldState.gameTimeMs).getUTCHours();
  if(hour>=18)await waitUntil("Wait until tomorrow morning");
  const approach=async()=>{
    await page.evaluate(()=>{const l=window.storyProbe.lifecycle;l.resetPlayer(l.vectorFromArray([124,0,-12]),-Math.PI/2,{persist:false});l.getController().setFirstPerson(false);});
    await page.waitForTimeout(300);await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
    try{await page.waitForFunction(()=>window.storyProbe.regions.controller.active?.scriptIdentity.scriptSlug==="story-s1-old-district-day-gate"||window.storyProbe.sceneErrors.length,null,{timeout:20_000});}finally{await page.keyboard.up("KeyW");}
    await page.waitForFunction(()=>window.storyProbe.dialogue?.audio?.currentTime>0||window.storyProbe.sceneErrors.length,null,{timeout:30_000});await noErrors();
  };
  await approach();await page.screenshot({path:testInfo.outputPath("old-district-daytime-guard.png")});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-cancel-daytime-guard"));await idle();
  expect((await saved()).character.storyFlags["notebook.s1.old-district-night"]).not.toBe(true);
  await approach();
  for(let i=0;i<25&&!await page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.["notebook.s1.old-district-night"]);i++){await page.keyboard.press("Space");await page.waitForTimeout(150);await noErrors();}
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.["notebook.s1.old-district-night"])).toBe(true);await idle();
  // Stay in the gate volume. Waiting must change eligibility without needing
  // a new approach, even if the daytime region already consumed its dispatch.
  await waitUntil("Wait until 7 p.m.");
  await page.waitForFunction(()=>window.storyProbe.regions.controller.active?.scriptIdentity.scriptSlug==="story-s1-old-district-night-entry"||window.storyProbe.sceneErrors.length,null,{timeout:30_000});await noErrors();
  await page.waitForFunction(()=>window.storyProbe.dialogue?.audio?.currentTime>0||window.storyProbe.sceneErrors.length);await noErrors();
  await page.keyboard.press("Space");
  await page.waitForFunction(()=>window.storyProbe.authoredScene?.active?.scene.id==="s1.mfsy.old-district-head-bump"||window.storyProbe.sceneErrors.length);await noErrors();
  await page.waitForTimeout(500);await page.screenshot({path:testInfo.outputPath("old-district-original-head-bump.png")});
  await page.waitForFunction(()=>window.storyProbe.regions.controller.active?.challengePrompt?.ready||window.storyProbe.sceneErrors.length,null,{timeout:45_000});await noErrors();
  await page.screenshot({path:testInfo.outputPath("old-district-right-prompt.png")});
  await page.keyboard.press("ArrowLeft");await expect(page.getByRole("button",{name:"Try again",exact:true})).toBeVisible();
  expect((await saved()).character.storyFlags["story.s1.old-district-entry.completed"]).not.toBe(true);expect((await saved()).character.worldId).toBe("mfsy");
  await page.getByRole("button",{name:"Try again",exact:true}).click();
  await page.waitForFunction(()=>window.storyProbe.regions.controller.active?.challengePrompt?.ready);expect(await page.evaluate(()=>window.storyProbe.regions.controller.active.challengePrompt.button)).toBe("Right");
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(()=>window.storyProbe.authoredScene?.active?.scene.id==="s1.mfsy.old-district-catch"||window.storyProbe.sceneErrors.length);await noErrors();
  await page.waitForTimeout(5_000);await page.screenshot({path:testInfo.outputPath("old-district-original-flashlight-catch.png")});
  const flashlight=await page.evaluate(()=>{
    const root=window.storyProbe.authoredScene.active.objects.objects.get("FLAS").root;
    const box=root.getHierarchyBoundingVectors();
    return {enabled:root.isEnabled(),min:box.min.asArray(),max:box.max.asArray()};
  });
  expect(flashlight.enabled).toBe(true);
  console.info("Original flashlight presentation:",JSON.stringify(flashlight));
  await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==="mksg"||window.storyProbe.sceneErrors.length,null,{timeout:90_000});await noErrors();
  await expect(page.locator("#loading")).toBeHidden({timeout:90_000});await idle();
  await page.waitForTimeout(2_000);await noErrors();
  const position=await page.evaluate(()=>window.storyProbe.lifecycle.getController().collider.position.asArray());
  expect(position[1]).toBeGreaterThan(-.5);expect(position[1]).toBeLessThan(1);
  await page.screenshot({path:testInfo.outputPath("old-district-earned-compound-arrival.png")});
  const state=await saved();expect(state.character.worldId).toBe("mksg");expect(state.character.storyFlags["story.s1.old-district-entry.completed"]).toBe(true);
  expect(state.character.storyFlags["story.s1.old-district-stealth.completed"]).not.toBe(true);expect(state.character.storyFlags["story.s1.master-chen.completed"]).not.toBe(true);
  expect(state.character.yen).toBe(character.yen);expect(state.character.currentHp).toBe(character.currentHp);
  await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();
  await page.waitForFunction(()=>window.storyProbe.ready,null,{timeout:90_000});await expect(page.locator("#loading")).toBeHidden({timeout:90_000});await page.waitForTimeout(1_000);await noErrors();
  expect(await page.evaluate(()=>window.storyProbe.starts.includes("story-s1-old-district-night-entry"))).toBe(false);
  expect((await saved()).character.storyFlags["notebook.s1.old-district-patrols"]).toBe(true);await idle();
}
