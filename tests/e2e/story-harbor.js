import {observeFlashlight,verifyFlashlightPresentation,verifyFlashlightEffects} from "./old-district-flashlight-observer.js";
import {observeFlashlightContinuity,verifyFlashlightContinuity} from "./old-district-flashlight-continuity.js";
import {expect} from "@playwright/test";

export async function verifyFirstChenMeeting(page,testInfo,character){
  expect(character.worldId).toBe("ms08");expect(character.storyFlags["story.s1.old-district-stealth.completed"]).toBe(true);
  expect(character.storyFlags["story.s1.master-chen.completed"]).not.toBe(true);
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const noErrors=async()=>expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);};
  const approach=async()=>{
    // Isolate a nearby approach from the earned warehouse arrival. Do not set
    // milestones, item ownership or a movie/challenge outcome in the browser.
    await page.evaluate(()=>{const l=window.storyProbe.lifecycle;l.resetPlayer(l.vectorFromArray([22,0,-11.4]),-Math.PI/2,{persist:false});l.getController().setFirstPerson(false);});
    await page.waitForTimeout(250);await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
    try{await expect(page.getByRole("button",{name:"Inspect the plate",exact:true})).toBeVisible({timeout:20_000});}finally{await page.keyboard.up("KeyW");}
    await noErrors();
  };
  await approach();await page.screenshot({path:testInfo.outputPath("master-chen-plate-choice.png")});
  await page.getByRole("button",{name:"Leave it for now",exact:true}).click();await idle();
  expect((await saved()).character.storyFlags["story.s1.master-chen.completed"]).not.toBe(true);
  await approach();await page.getByRole("button",{name:"Inspect the plate",exact:true}).click();
  await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-master-chen-plate"||window.storyProbe.sceneErrors.length,null,{timeout:45_000});await noErrors();
  await page.waitForTimeout(700);await page.screenshot({path:testInfo.outputPath("master-chen-original-plate.png")});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-cancel-Chen-presentation"));await idle();
  expect((await saved()).character.worldId).toBe("ms08");expect((await saved()).character.storyFlags["notebook.s1.master-chen"]).not.toBe(true);
  await approach();await page.getByRole("button",{name:"Inspect the plate",exact:true}).click();
  for(const [part,delay]of [["plate",700],["arrival",65_000],["lan-di",5_000],["phoenix",5_000]]){
    await page.waitForFunction(id=>window.storyProbe.director?.activeCutscene?.cutscene.id===id||window.storyProbe.sceneErrors.length,`story-s1-master-chen-${part}`,{timeout:100_000});await noErrors();
    await page.waitForTimeout(delay);await page.screenshot({path:testInfo.outputPath(`master-chen-${part}.png`)});
    expect((await saved()).character.storyFlags["story.s1.master-chen.completed"]).not.toBe(true);
  }
  await expect.poll(async()=>(await saved()).character.worldId,{timeout:100_000}).toBe("interior");
  await expect(page.locator("#loading")).toBeHidden({timeout:90_000});await idle();await noErrors();
  const result=await saved();expect(result.character.storyFlags["story.s1.master-chen.completed"]).toBe(true);
  expect(result.character.storyFlags["notebook.s1.master-chen"]).toBe(true);expect(result.character.storyFlags["notebook.s1.phoenix-mirror-search"]).toBe(true);
  expect(result.character.storyFlags["story.s1.phoenix-mirror.completed"]).not.toBe(true);expect(result.character.yen).toBe(character.yen);expect(result.character.currentHp).toBe(character.currentHp);
  expect(new Date(result.worldState.gameTimeMs).getUTCHours()).toBe(8);expect(new Date(result.worldState.gameTimeMs).getUTCMinutes()).toBeGreaterThanOrEqual(30);
  await page.screenshot({path:testInfo.outputPath("master-chen-earned-next-morning-home.png")});
  await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();
  await page.waitForFunction(()=>window.storyProbe.ready,null,{timeout:90_000});await expect(page.locator("#loading")).toBeHidden({timeout:90_000});await noErrors();
  expect((await saved()).character.worldId).toBe("interior");expect(await page.evaluate(()=>window.storyProbe.starts.some(id=>id.startsWith("story-s1-master-chen")))).toBe(false);await idle();
}

// Entry hands directly to this event, including after reconnect. Reuse the
// same ordinary intro-dialogue readiness as the separate patrol acceptance.
async function readyOldDistrictStealth(page){
  const errors=async()=>expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  await page.waitForFunction(()=>window.storyProbe.regions.controller.active?.scriptIdentity.scriptSlug==="story-s1-old-district-stealth"||window.storyProbe.sceneErrors.length,null,{timeout:60_000});await errors();
  for(let n=0;n<30&&!await page.evaluate(()=>window.storyProbe.navigation?.active?.ready);n++){
    await page.keyboard.press("Space");await page.waitForTimeout(150);await errors();
  }
  await page.waitForFunction(()=>window.storyProbe.navigation?.active?.ready||window.storyProbe.sceneErrors.length,null,{timeout:30_000});await errors();
  await page.locator("#renderCanvas").focus();
}

// Resume a genuinely earned district arrival. Navigate with ordinary keyboard
// intents; no coordinate, detection or success writes are used to win.
export async function verifyOldDistrictStealth(page,testInfo,character){
  expect(character.worldId).toBe("mksg");
  expect(character.storyFlags["story.s1.old-district-entry.completed"]).toBe(true);
  expect(character.storyFlags["story.s1.old-district-stealth.completed"]).not.toBe(true);
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const errors=async()=>expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const ready=()=>readyOldDistrictStealth(page);
  await ready();
  if(process.env.NEW_YOKOSUKA_STEALTH_CAPTURE_E2E==="true"){
    const before=(await saved()).worldState.gameTimeMs;
    await page.keyboard.down("KeyW");
    try{
      for(let n=0;n<240&&await page.evaluate(()=>Boolean(window.storyProbe.navigation?.active));n++){
        await page.evaluate(()=>{const p=window.storyProbe.navigation.active.view.actors[0];window.storyProbe.lifecycle.getController().cameraYaw=Math.atan2(-(32-p.x),-(-22.9-p.z));});
        await page.waitForTimeout(100);await errors();
      }
    }finally{await page.keyboard.up("KeyW");}
    await page.waitForFunction(()=>window.storyProbe.authoredScene?.active?.scene.id==="s1.mksg.caught"||window.storyProbe.sceneErrors.length,null,{timeout:30_000});await errors();
    await page.screenshot({path:testInfo.outputPath("old-district-real-capture.png")});
    for(let n=0;n<60&&(await saved()).character.worldId!=="mfsy";n++){await page.keyboard.press("Space");await page.waitForTimeout(150);await errors();}
    await expect(page.locator("#loading")).toBeHidden({timeout:90_000});
    const caught=await saved();expect(caught.character.worldId).toBe("mfsy");
    expect(caught.character.storyFlags["story.s1.old-district-entry.completed"]).not.toBe(true);
    expect(caught.character.storyFlags["story.s1.old-district-stealth.completed"]).not.toBe(true);
    expect(new Date(caught.worldState.gameTimeMs).getUTCDate()).not.toBe(new Date(before).getUTCDate());
    expect(caught.character.yen).toBe(character.yen);
    await page.screenshot({path:testInfo.outputPath("old-district-caught-next-morning.png")});
    // Finish the legitimate daytime advice, wait through the existing Story
    // clock UI, and re-enter through the actual flashlight challenge.
    for(let n=0;n<60&&!await page.evaluate(()=>window.storyProbe.regions.getCharacter()?.storyFlags?.["story.s1.old-district-day-gate.completed"]);n++){
      await page.keyboard.press("Space");await page.waitForTimeout(150);await errors();
    }
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");
    await page.locator("#story-wait-button").click();await page.getByRole("option",{name:"Wait until 7 p.m.",exact:true}).click();await page.getByRole("button",{name:"Wait until 7 p.m.",exact:true}).click();
    await page.waitForFunction(()=>window.storyProbe.regions.controller.active?.scriptIdentity.scriptSlug==="story-s1-old-district-night-entry"||window.storyProbe.sceneErrors.length,null,{timeout:30_000});await errors();
    await page.waitForFunction(()=>window.storyProbe.dialogue?.audio?.currentTime>0||window.storyProbe.sceneErrors.length,null,{timeout:30_000});await errors();await page.keyboard.press("Space");
    if(!character.storyFlags["story.s1.old-district-flashlight.caught"]){
      await page.waitForFunction(()=>window.storyProbe.regions.controller.active?.challengePrompt?.ready||window.storyProbe.sceneErrors.length,null,{timeout:45_000});await errors();
      await page.keyboard.press("ArrowRight");
    }
    await ready();
  }
  await page.screenshot({path:testInfo.outputPath("old-district-patrols-ready.png")});
  expect(await page.evaluate(()=>window.storyProbe.navigation.active.view.actors.map(a=>a.tag))).toEqual(["AKIR","KEBB","KEBC","KEBD"]);
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-cancel-patrols"));
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  expect((await saved()).character.storyFlags["story.s1.old-district-stealth.completed"]).not.toBe(true);
  await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();
  await page.waitForFunction(()=>window.storyProbe.ready,null,{timeout:90_000});await ready();
  const view=()=>page.evaluate(()=>window.storyProbe.navigation?.active?.view);
  const walk=async(x,z,sprint=false)=>{
    if(sprint)await page.keyboard.down("ShiftLeft");await page.keyboard.down("KeyW");
    try{
      for(let n=0;n<180;n++){
        const v=await view();expect(v,"patrol attempt ended while walking").toBeTruthy();
        const p=v.actors[0],distance=Math.hypot(x-p.x,z-p.z);
        if(distance<.3)return;
        await page.evaluate(([x,z])=>{const p=window.storyProbe.navigation.active.view.actors[0];window.storyProbe.lifecycle.getController().cameraYaw=Math.atan2(-(x-p.x),-(z-p.z));},[x,z]);
        await page.waitForTimeout(100);await errors();
      }
      throw Error(`Navigation did not reach ${x}, ${z}: ${JSON.stringify(await view())}`);
    }finally{await page.keyboard.up("KeyW");if(sprint)await page.keyboard.up("ShiftLeft");}
  };
  await walk(17,-23.5);await walk(26,-23.5);await walk(23.1,-32.5);
  await page.keyboard.down("KeyC");
  try{
    await page.waitForFunction(()=>window.storyProbe.navigation.active.view.actors[0].hiding,null,{timeout:5_000});
    await page.screenshot({path:testInfo.outputPath("old-district-real-cover.png")});
    await page.waitForFunction(()=>{const a=window.storyProbe.navigation?.active?.view?.actors;return a&&a[2].z>a[0].z+1;},null,{timeout:45_000});
  }finally{await page.keyboard.up("KeyC");}
  await walk(26,-51.8,true);await walk(24,-55.8,true);await walk(22.9,-60.8,true);
  expect((await view()).canUse).toBe(true);
  await page.screenshot({path:testInfo.outputPath("old-district-warehouse-eight-door.png")});
  await page.keyboard.press("KeyE");
  await expect.poll(async()=>(await saved()).character.worldId,{timeout:30_000}).toBe("ms08");
  await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==="ms08",null,{timeout:90_000});
  await expect(page.locator("#loading")).toBeHidden({timeout:90_000});await errors();
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  const result=(await saved()).character;
  expect(result.storyFlags["story.s1.old-district-stealth.completed"]).toBe(true);
  expect(result.storyFlags["story.s1.master-chen.completed"]).not.toBe(true);
  expect(result.yen).toBe(character.yen);expect(result.currentHp).toBe(character.currentHp);
  await page.screenshot({path:testInfo.outputPath("old-district-earned-warehouse-eight-interior.png")});
  await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();
  await page.waitForFunction(()=>window.storyProbe.ready,null,{timeout:90_000});await expect(page.locator("#loading")).toBeHidden({timeout:90_000});await errors();
  expect((await saved()).character.worldId).toBe("ms08");
  expect(await page.evaluate(()=>window.storyProbe.starts.includes("story-s1-old-district-stealth"))).toBe(false);
}

// Chapter continuation uses the genuinely earned warehouse-invoice checkpoint.
// Resetting a nearby approach position isolates the trigger, not its outcomes.
export async function verifyOldDistrictEntry(page,testInfo,character){
  expect(character.storyFlags["story.s1.warehouse-eight-overheard.completed"]).toBe(true);
  expect(character.storyFlags["story.s1.old-district-stealth.completed"]).not.toBe(true);
  if(character.storyFlags["story.s1.old-district-entry.completed"]) expect(character.worldId).toBe("mksg");
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const noErrors=async()=>expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);};
  const waitUntil=async label=>{await page.locator("#story-wait-button").click();await page.getByRole("option",{name:label,exact:true}).click();await page.getByRole("button",{name:label,exact:true}).click();};
  const checkpoint=async()=>{
    const state=await saved();expect(state.character.id).toBe(character.id);expect(state.character.worldId).toBe("mksg");
    for(const flag of ["story.s1.old-district-entry.completed","story.s1.old-district-flashlight.caught","notebook.s1.old-district-patrols"]) expect(state.character.storyFlags[flag],flag).toBe(true);
    expect(state.character.storyFlags["story.s1.old-district-stealth.completed"]).not.toBe(true);expect(state.character.storyFlags["story.s1.master-chen.completed"]).not.toBe(true);
    expect(state.character.yen).toBe(character.yen);expect(state.character.currentHp).toBe(character.currentHp);
  };
  const handoff=async label=>{
    await readyOldDistrictStealth(page);
    const state=await page.evaluate(()=>{
      const p=window.storyProbe;
      return {world:p.lifecycle.worldRuntime.activeWorld.id,script:p.regions.controller.active?.scriptIdentity.scriptSlug,
        controllerStatus:p.regions.controller.status,movementLocked:p.lifecycle.getController().movementLocked,
        navigationReady:p.navigation?.active?.ready,actors:p.navigation?.active?.view?.actors.map(actor=>actor.tag)};
    });
    expect(state).toMatchObject({world:"mksg",script:"story-s1-old-district-stealth",movementLocked:true,navigationReady:true});
    expect(state.actors).toEqual(["AKIR","KEBB","KEBC","KEBD"]);
    await testInfo.attach(label,{body:JSON.stringify(state),contentType:"application/json"});
  };
  // Resume an earned entry without cancelling its next event or repeating the
  // daytime gate, wait, and flashlight QTE. STEALTH earns its own result later.
  if(!character.storyFlags["story.s1.old-district-entry.completed"]){
    // A cancelled prior attempt may resume at the eligible gate at night.
    // Leave that live event before selecting an earlier-time fixture approach.
    await page.evaluate(async()=>{
      await window.storyProbe.regions.controller.cancel("test-prepare-gate-continuation");
      const l=window.storyProbe.lifecycle;if(l.worldRuntime.activeWorld.id!=="mfsy")await l.travelToWorld("mfsy");
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
    await observeFlashlight(page);
    await observeFlashlightContinuity(page);
    await waitUntil("Wait until 7 p.m.");
    await page.waitForFunction(()=>window.storyProbe.regions.controller.active?.scriptIdentity.scriptSlug==="story-s1-old-district-night-entry"||window.storyProbe.sceneErrors.length,null,{timeout:30_000});await noErrors();
    await page.waitForFunction(()=>window.storyProbe.dialogue?.audio?.currentTime>0||window.storyProbe.sceneErrors.length);await noErrors();
    await page.keyboard.press("Space");
    await page.waitForFunction(()=>window.storyProbe.authoredScene?.active?.scene.id==="s1.mfsy.old-district-head-bump"||window.storyProbe.sceneErrors.length);await noErrors();
    await page.waitForTimeout(500);await page.screenshot({path:testInfo.outputPath("old-district-original-head-bump.png")});
    await page.waitForFunction(()=>window.storyProbe.regions.controller.active?.challengePrompt?.ready||window.storyProbe.sceneErrors.length,null,{timeout:45_000});await noErrors();
    const retry=page.getByRole("button",{name:"Try again",exact:true});
    await expect(retry).toBeVisible({timeout:25_000});
    expect((await saved()).character.storyFlags["story.s1.old-district-entry.completed"]).not.toBe(true);expect((await saved()).character.worldId).toBe("mfsy");
    if(process.env.NEW_YOKOSUKA_FLASHLIGHT_CANCEL_E2E==="true"){
      await retry.click();
      await page.waitForFunction(()=>window.storyProbe.regions.controller.active?.challengePrompt?.ready);
      const advertised=await page.evaluate(()=>{
        const qte=window.storyProbe.regions.controller.dialogue.qte.active;
        return qte.steps[qte.index].windowMs;
      });
      expect(advertised).toBe(1000);
      await page.screenshot({path:testInfo.outputPath("old-district-right-prompt.png")});
      await expect(retry).toBeVisible({timeout:25_000});
      expect((await saved()).character.storyFlags["story.s1.old-district-entry.completed"]).not.toBe(true);
    }
    await retry.click();
    await page.waitForFunction(()=>window.storyProbe.authoredScene?.active?.scene.id==="s1.mfsy.old-district-catch"||window.storyProbe.sceneErrors.length);await noErrors();
    await page.waitForFunction(()=>window.storyProbe.authoredScene.active?.objects?.objects?.get("KAIS")?.root.isEnabled(),null,{timeout:30_000});
    if(process.env.NEW_YOKOSUKA_FLASHLIGHT_CANCEL_E2E!=="true")await page.screenshot({path:testInfo.outputPath("old-district-original-flashlight-catch.png")});
    const flashlight=await page.evaluate(()=>{
      const root=window.storyProbe.authoredScene.active.objects.objects.get("KAIS").root;
      const box=root.getHierarchyBoundingVectors();
      return {enabled:root.isEnabled(),min:box.min.asArray(),max:box.max.asArray()};
    });
    expect(flashlight.enabled).toBe(true);
    console.info("Original flashlight presentation:",JSON.stringify(flashlight));
    if(process.env.NEW_YOKOSUKA_FLASHLIGHT_CANCEL_E2E==="true"){
      await page.waitForFunction(()=>window.flashlightFinalEffectPlaying(),null,{timeout:5000});
      await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-flashlight-before-travel"));
      await idle();
      const stopped=await saved();
      expect(stopped.character.worldId).toBe("mfsy");
      for(const key of ["story.s1.old-district-entry.completed","story.s1.old-district-flashlight.caught","notebook.s1.old-district-patrols"]) {
        expect(stopped.character.storyFlags[key]).not.toBe(true);
      }
      const cleaned=await page.evaluate(()=>{
        const p=window.storyProbe;
        return {staged:Boolean(p.authoredScene.active),locked:p.lifecycle.getController().movementLocked,
          status:p.regions.controller.status,id:p.lifecycle.worldRuntime.activeWorld.id};
      });
      expect(cleaned).toEqual({staged:false,locked:false,status:"idle",id:"mfsy"});
      await verifyFlashlightContinuity(page,testInfo,true);
      const presentation=await page.evaluate(()=>window.finishFlashlightRun());
      await testInfo.attach("flashlight-cancelled-after-right",{body:JSON.stringify({world:stopped.character.worldId,
        entry:!!stopped.character.storyFlags["story.s1.old-district-entry.completed"],
        caught:!!stopped.character.storyFlags["story.s1.old-district-flashlight.caught"],
        notebook:!!stopped.character.storyFlags["notebook.s1.old-district-patrols"],
        cleaned,presentation}),contentType:"application/json"});
      verifyFlashlightEffects(presentation,true);
      return;
    }
  }
  await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==="mksg"||window.storyProbe.sceneErrors.length,null,{timeout:90_000});await noErrors();
  await expect(page.locator("#loading")).toBeHidden({timeout:90_000});await handoff("old-district-entry-handoff");
  await page.waitForTimeout(2_000);await noErrors();
  const position=await page.evaluate(()=>window.storyProbe.lifecycle.getController().collider.position.asArray());
  expect(position[1]).toBeGreaterThan(-.5);expect(position[1]).toBeLessThan(1);
  await page.screenshot({path:testInfo.outputPath("old-district-earned-compound-arrival.png")});
  await checkpoint();
  if(!character.storyFlags["story.s1.old-district-entry.completed"]){
    await verifyFlashlightContinuity(page,testInfo,false);
    verifyFlashlightEffects(await verifyFlashlightPresentation(page,testInfo),false);
  }
  await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();
  await page.waitForFunction(()=>window.storyProbe.ready,null,{timeout:90_000});await expect(page.locator("#loading")).toBeHidden({timeout:90_000});await page.waitForTimeout(1_000);await noErrors();
  expect(await page.evaluate(()=>window.storyProbe.starts.includes("story-s1-old-district-night-entry"))).toBe(false);
  await handoff("old-district-entry-reloaded-handoff");await checkpoint();
  await page.screenshot({path:testInfo.outputPath("old-district-entry-reloaded-handoff.png")});
}
