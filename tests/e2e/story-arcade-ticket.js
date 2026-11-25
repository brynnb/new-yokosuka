import {expect} from "@playwright/test";
import {openStoryRoomDoor} from "./story-object-input.js";
import transitions from "../../play/data/native-map-transitions.json" with {type:"json"};

export async function verifyChaiArcade(page,testInfo,character,enterInteriorDoor,{fightStoryAmbush}={}){
  const ending=process.env.NEW_YOKOSUKA_CHAI_ENDING||"win";expect(["win","defeat"]).toContain(ending);
  if(ending==="win")expect(typeof fightStoryAmbush,"Chai win requires the injected keyboard helper").toBe("function");
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved();expect(initial.character.storyFlags["story.s1.jimmy-morning-call.completed"]).toBe(true);
  expect(initial.character.storyFlags["story.s1.chai-arcade.completed"]).not.toBe(true);
  const noErrors=async()=>expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const idle=async()=>{
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");await noErrors();
    await page.waitForFunction(()=>{const l=window.storyProbe.lifecycle;return l.worldRuntime.ready&&!l.worldRuntime.switching;},null,{timeout:70_000});
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.nativeStoryRuntime.ownsPlayerPresentation)).toBe(false);
  };
  const scene=async id=>{await page.waitForFunction(id=>window.storyProbe.director?.activeCutscene?.cutscene.id===`story-s1-${id}`||window.storyProbe.sceneErrors.length,id,{timeout:90_000});await noErrors();};
  const unchanged=async()=>{const s=await saved();expect(s.character.storyFlags["story.s1.chai-arcade.completed"]).not.toBe(true);expect(s.character.storyFlags["notebook.s1.chai-asia-travel"]).not.toBe(true);expect(s.character.yen).toBe(initial.character.yen);expect(s.inventory).toEqual(initial.inventory);};
  // A presentation review may leave this earned save inside You Arcade.
  // Waiting until noon there legitimately starts the ambush immediately.
  // Begin outside before testing the physical entrance, preserving all earned
  // flags/calendar state and cancelling any admitted scene through its owner.
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-chai-entrance-setup"));
  await idle();await unchanged();
  await page.evaluate(()=>window.storyProbe.lifecycle.travelToWorld("dobuita"));await idle();
  if(new Date(initial.character.storyTimeMs).getUTCHours()<12){
    await page.locator("#story-wait-button").click();await page.getByRole("option",{name:"Wait until 1 p.m.",exact:true}).click();
    await page.getByRole("button",{name:"Wait until 1 p.m.",exact:true}).click();await idle();
  }
  const inbound=transitions.reverseMatchedD000Transitions.find(t=>t.destination.area==="DGCT"),outbound=transitions.allExactDoorTransitions.find(t=>t.id===inbound.evidence.returnTransitionId);
  await enterInteriorDoor(page,{world:"arcade",filename:inbound.source.model,doorSelector:inbound.source.doorSelector,position:outbound.destination.browserSpawn.position,yaw:outbound.destination.browserSpawn.yawRadians});
  await scene("chai-intro");await page.waitForTimeout(1500);
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-chai-intro-cancel"));await idle();await unchanged();
  // Observe a processed outside frame before walking back into the region.
  // Cancellation keeps its entry latch until ordinary gameplay sees that exit.
  const retrySamples=[],region=await page.evaluate(()=>window.storyProbe.regions.regions.find(r=>r.id==="s1.dgct.chai-arcade"));
  expect(region).toBeTruthy();
  const inside=position=>position.every((value,axis)=>value>=region.min[axis]&&value<=region.max[axis]);
  const retrySample=stage=>page.evaluate(stage=>{
    const p=window.storyProbe,l=p.lifecycle,c=l.getController(),r=p.regions,input=l.simulationRuntime.playInput;
    return {stage,status:r.controller.status,slug:r.controller.active?.scriptIdentity.scriptSlug,pending:r.controller.pendingStart?.selector,
      entered:r.inside.has("s1.dgct.chai-arcade"),frame:p.lastRegionFrame,
      actorRoot:c.actorRoot.position.asArray(),collider:c.collider.position.asArray(),
      movementLocked:c.movementLocked,nativeOwnership:l.nativeStoryRuntime.ownsPlayerPresentation,
      rawForward:input.actions.value("keyboard","KeyW"),moveY:input.currentSnapshot?.value("moveY"),
      ready:l.worldRuntime.ready,switching:l.worldRuntime.switching,
      dispatches:p.regionDispatches.filter(value=>value.entered.includes("s1.dgct.chai-arcade")).length};
  },stage);
  let outside,entered;
  try{
    await page.evaluate(()=>{const l=window.storyProbe.lifecycle;l.resetPlayer(l.vectorFromArray([-2.7,0,-3]),0,{persist:false});});
    for(let n=0;n<50;n++){
      await page.waitForTimeout(100);outside=await retrySample("exit");retrySamples.push(outside);
      if(!outside.entered&&!inside(outside.actorRoot)&&!inside(outside.collider)&&outside.status==="idle"&&!outside.nativeOwnership)break;
    }
    expect(outside.entered,"the cancelled Chai region observes the actual exit").toBe(false);
    expect(inside(outside.actorRoot)||inside(outside.collider)).toBe(false);
    expect(outside.status).toBe("idle");expect(outside.nativeOwnership).toBe(false);
    await page.locator("#renderCanvas").focus();await expect(page.locator("#renderCanvas")).toBeFocused();
    await page.keyboard.down("KeyW");
    for(let n=0;n<100;n++){
      await page.waitForTimeout(100);entered=await retrySample("walk-in");retrySamples.push(entered);
      if(entered.dispatches>outside.dispatches)break;
    }
  }finally{
    await page.keyboard.up("KeyW");
    await testInfo.attach("chai-cancel-reentry-proof",{body:JSON.stringify(retrySamples),contentType:"application/json"});
  }
  expect(retrySamples.some(value=>value.stage==="walk-in"&&value.rawForward>0&&value.moveY>0),"real forward input re-enters the arcade trigger").toBe(true);
  expect(entered.dispatches,"a second Chai enter request is actually dispatched").toBeGreaterThan(outside.dispatches);
  expect(Math.hypot(entered.collider[0]-outside.collider[0],entered.collider[2]-outside.collider[2])).toBeGreaterThan(.2);
  console.info("Chai cancelled-intro re-entry proof:",JSON.stringify({outside,entered,samples:retrySamples.length}));
  await scene("chai-intro");await page.waitForTimeout(20_000);await page.screenshot({path:testInfo.outputPath("chai-original-ticket-confrontation.png")});await unchanged();
  // Explicit cinematic skip is not a combat result. The real fight must still
  // prepare, receive physical controls and reach its server-owned outcome.
  await page.keyboard.press("KeyX");
  await page.waitForFunction(()=>window.storyProbe.combatRuntime?.active?.view?.ready,null,{timeout:60_000});await noErrors();
  expect(await page.evaluate(()=>window.storyProbe.combatRuntime.active.view.actors.map(a=>a.tag))).toEqual(["AKIR","CHAI"]);
  await page.screenshot({path:testInfo.outputPath(`chai-server-fight-${ending}.png`)});await unchanged();
  if(ending==="win"){
    const inputStart=await page.evaluate(()=>window.storyProbe.combatInputs.length);
    const playerId=await page.evaluate(()=>window.storyProbe.combatRuntime.encounter.player.id);
    // Real directional attacks release guard first; the same helper already
    // earned ambush/Gao wins. A Chai loss is a separate Story branch, not a retry.
    await fightStoryAmbush(page,testInfo,{nextButton:null,artifactPrefix:"chai-arcade"});
    const proof=await page.evaluate(({inputStart,playerId})=>{
      const p=window.storyProbe,inputs=p.combatInputs.slice(inputStart);
      // fightStoryAmbush creates a fresh event list for this encounter.
      const hits=p.fightEvents.filter(event=>event.type==="hit"&&event.attackerId===playerId&&event.damage>0);
      return {actions:[...new Set(inputs.map(input=>input.action).filter(action=>["hand","leg","throw"].includes(action)))],
        guarded:inputs.some(input=>input.guard),damagingPlayerHits:hits.length,
        inputTail:inputs.slice(-12),hitTail:hits.slice(-8)};
    },{inputStart,playerId});
    await testInfo.attach("chai-arcade-combat-inputs",{body:JSON.stringify(proof),contentType:"application/json"});
    const outcome=await page.waitForFunction(()=>{
      const p=window.storyProbe,id=p.director?.activeCutscene?.cutscene.id;
      return p.sceneErrors.length?"scene-error":["story-s1-chai-victory","story-s1-chai-rescue"].includes(id)?id:false;
    },null,{timeout:90_000});await noErrors();
    const actualScene=await outcome.jsonValue();await outcome.dispose();
    if(actualScene==="story-s1-chai-rescue"){
      const state=await saved(),flags=state.character.storyFlags;
      const loss={requestedEnding:"win",actualEnding:"defeat",scene:actualScene,world:state.character.worldId,
        receipts:{completed:flags["story.s1.chai-arcade.completed"]===true,won:flags["story.s1.chai-arcade.won"]===true,
          lost:flags["story.s1.chai-arcade.lost"]===true,recoveryPending:flags["story.s1.chai-recovery.pending"]===true}};
      await testInfo.attach("chai-arcade-unexpected-defeat",{body:JSON.stringify(loss),contentType:"application/json"});
      console.info("Chai Arcade actual defeat branch:",JSON.stringify(loss));
      await page.screenshot({path:testInfo.outputPath("chai-arcade-unexpected-defeat.png")});
      throw Error("Chai Arcade required a win but reached the actual chai-rescue defeat branch. Recorded the observed receipts; no retry or outcome reset was attempted.");
    }
    expect(proof.actions.length,"Chai fight consumes a real hand, leg, or throw attack").toBeGreaterThan(0);
    expect(proof.guarded,"Chai fight consumes real guard input").toBe(true);
    expect(proof.damagingPlayerHits,"Chai victory includes a real player hit").toBeGreaterThan(0);
  }
  await scene(ending==="win"?"chai-victory":"chai-rescue");await page.waitForTimeout(7000);
  await page.screenshot({path:testInfo.outputPath(`chai-original-${ending}-ending.png`)});await unchanged();
  await expect.poll(async()=>(await saved()).character.storyFlags["story.s1.chai-arcade.completed"],{timeout:65_000,intervals:[1000]}).toBe(true);
  if(ending==="defeat"){
    await scene("chai-home-recovery");
    const pending=await saved();
    expect(pending.character.storyFlags["story.s1.chai-recovery.pending"]).toBe(true);
    expect(pending.character.storyFlags["story.s1.chai-recovery.completed"]).not.toBe(true);
    expect(new Date(pending.character.storyTimeMs).toISOString().slice(0,10)).toBe(new Date(initial.character.storyTimeMs).toISOString().slice(0,10));
    await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-chai-home-recovery-cancel"));await idle();
    const cancelled=await saved();
    expect(cancelled.character.storyFlags["story.s1.chai-recovery.pending"]).toBe(true);
    expect(cancelled.character.storyFlags["story.s1.chai-recovery.completed"]).not.toBe(true);
    expect(new Date(cancelled.character.storyTimeMs).toISOString().slice(0,10)).toBe(new Date(initial.character.storyTimeMs).toISOString().slice(0,10));
    const move=async position=>{await page.evaluate(position=>{const l=window.storyProbe.lifecycle;l.resetPlayer(l.vectorFromArray(position),0,{persist:false});},position);await page.waitForTimeout(600);};
    await move([-14,0,4.1]);await move([-17.6,0,4.1]);
    await scene("chai-home-recovery");
    await page.waitForTimeout(4000);await page.screenshot({path:testInfo.outputPath("chai-home-recovery.png")});
    await expect.poll(async()=>(await saved()).character.storyFlags["story.s1.chai-recovery.completed"],{timeout:65_000,intervals:[1000]}).toBe(true);
    expect((await saved()).character.storyFlags["story.s1.chai-recovery.pending"]).not.toBe(true);
  }
  await idle();
  const final=await saved();expect(final.character.storyFlags["notebook.s1.chai-asia-travel"]).toBe(true);
  expect(final.character.storyFlags[`story.s1.chai-arcade.${ending==="win"?"won":"lost"}`]).toBe(true);
  expect(final.character.storyFlags[`story.s1.chai-arcade.${ending==="win"?"lost":"won"}`]).not.toBe(true);
  expect(final.character.yen).toBe(initial.character.yen);expect(final.inventory).toEqual(initial.inventory);
  const beforeDay=new Date(initial.character.storyTimeMs),afterDay=new Date(final.character.storyTimeMs);
  if(ending==="defeat"){
    expect(final.character.worldId).toBe("interior");expect(afterDay.toISOString().slice(0,10)).toBe(new Date(Date.UTC(beforeDay.getUTCFullYear(),beforeDay.getUTCMonth(),beforeDay.getUTCDate()+1)).toISOString().slice(0,10));
    expect(afterDay.getUTCHours()).toBe(8);expect(afterDay.getUTCMinutes()).toBeGreaterThanOrEqual(30);expect(afterDay.getUTCMinutes()).toBeLessThan(35);
  }else{expect(final.character.worldId).toBe("arcade");expect(afterDay.toISOString().slice(0,10)).toBe(beforeDay.toISOString().slice(0,10));}
  await page.locator("button").filter({hasText:/^Notebook$/}).click();for(let i=0;i<120&&await page.locator("#journal-next").isEnabled();i++)await page.locator("#journal-next").click();
  await expect(page.locator("#journal-page-copy")).toContainText("Go back to Asia Travel Company.");await page.screenshot({path:testInfo.outputPath(`chai-${ending}-saved-notebook.png`)});await page.locator("#journal-close").click();
  await page.reload();await expect(page.getByLabel("Open the New Yokosuka menu")).toBeVisible({timeout:120_000});await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();await page.locator(".character-slot-button:not(.empty)").filter({hasText:character.name}).click();await page.locator("button").filter({hasText:/^Enter World$/}).click();
  await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);await idle();
  expect((await saved()).character.storyFlags["story.s1.chai-arcade.completed"]).toBe(true);expect(await page.evaluate(()=>window.storyProbe.starts.includes("story-s1-chai-intro"))).toBe(false);
}

// Reload the actual loss checkpoint; never re-inject its outcome or clock.
export async function verifyChaiRecoveryBody(page, testInfo, character) {
  const state = () => page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const before = await state(), done = "story.s1.chai-recovery.completed", pending = "story.s1.chai-recovery.pending";
  expect(before.character.storyFlags[pending]).toBe(true);
  const waitForBody = () => page.waitForFunction(() => {
    const pack = window.storyProbe.director?.activeCutscene?.packageRuntime;
    const root = pack?.packageActors?.records.get("AKIR")?.root;
    if (!root || pack.packageActors.variantRecords.get("AKIR")?.get("YKD_M")?.root !== root) return false;
    window.recoveryBody = root;
    return root.isEnabled() && root.getChildMeshes(false).some(m=>m.isEnabled() && m.isVisible && m.getTotalVertices()>0);
  }, null, {timeout:30_000});
  const futon = () => page.evaluate(() => {
    const rows = window.storyProbe.lifecycle.sceneState.currentMeshes;
    return ["FUT1","FUT2"].map(tag => rows.find(r=>r._runtimePlacementRecord?.runtime?.objectTag===tag)?.position.asArray());
  });
  await waitForBody();
  expect(await futon()).toEqual([[-19.188601,.608,4.379],[-18.995001,-10,4.391]]);
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("sleepwear-cancel"));
  await page.waitForFunction(()=>window.storyProbe.regions.controller.status==="idle" && !window.storyProbe.lifecycle.getController().movementLocked);
  expect(await page.evaluate(()=>window.recoveryBody.isDisposed() || !window.recoveryBody.isEnabled())).toBe(true);
  expect(await futon()).toEqual([[-19.188601,.608,4.379],[-18.995001,.551,4.391]]);
  expect((await state()).character.storyFlags[done]).not.toBe(true);
  for (const position of [[-14,0,4.1], [-17.6,0,4.1]]) {
    await page.evaluate(position=>{
      const l=window.storyProbe.lifecycle;
      l.resetPlayer(l.vectorFromArray(position),0,{persist:false});
    },position);
    await page.waitForTimeout(600);
  }
  await waitForBody();
  expect(await futon()).toEqual([[-19.188601,.608,4.379],[-18.995001,-10,4.391]]);
  await page.waitForTimeout(4000);
  await page.screenshot({path:testInfo.outputPath("chai-original-sleepwear.png")});
  if (process.env.NEW_YOKOSUKA_4S_PICK === "true") {
    console.info("A0173 per-pixel surface review", await page.evaluate(() => {
      const l=window.storyProbe.lifecycle,scene=l.scene,w=l.engine.getRenderWidth(),h=l.engine.getRenderHeight();
      return [[.92,.41],[.85,.43],[.70,.45],[.8,.50],[.8,.35]].map(([x,y])=>{
        const hits=scene.multiPick(x*w,y*h,m=>m.isVisible&&m.isEnabled()&&m.getTotalVertices()>0,scene.activeCamera) || [];
        return {x,y,hits:hits.filter(hit=>hit.hit).sort((a,b)=>a.distance-b.distance).slice(0,2).map(hit=>{
          if(x>.9 && hit===hits.filter(h=>h.hit).sort((a,b)=>a.distance-b.distance)[0])window.coverDiagMesh=hit.pickedMesh;
          let m=hit.pickedMesh;const chain=[];
          while(m){chain.push([m.name,m._filename,m._runtimePlacementRecord?.runtime?.objectTag]);m=m.parent;}
          return {d:hit.distance,mat:hit.pickedMesh.material?.name,chain};
        })};
      })
    }).then(JSON.stringify));
    await page.evaluate(()=>{window.coverDiagMesh.setEnabled(false);});
    await page.screenshot({path:testInfo.outputPath("chai-identify-ribbon.png")});
    await page.evaluate(()=>{window.coverDiagMesh.setEnabled(true);});

  }
  await expect.poll(async()=>(await state()).character.storyFlags[done],{timeout:90_000}).toBe(true);
  expect((await state()).character.storyFlags[pending]).not.toBe(true);
  await verifyChaiRecoveryReload(page,character);
  const after = await state();
  expect(after.character.yen).toBe(before.character.yen);
  expect(after.inventory).toEqual(before.inventory);
  expect(after.character.avatarId).toBe("ryo");
  expect(await futon()).toEqual([[-19.188601,.608,4.379],[-18.995001,.551,4.391]]);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().actorRoot.getChildMeshes(false)
    .some(m=>m.isEnabled() && m.isVisible && m.getTotalVertices()>0))).toBe(true);
}

export async function verifyChaiRecoveryReload(page,character){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const before=await saved();
  expect(before.character.storyFlags["story.s1.chai-arcade.lost"]).toBe(true);
  expect(before.character.storyFlags["story.s1.chai-recovery.completed"]).toBe(true);
  expect(before.character.storyFlags["story.s1.chai-recovery.pending"]).not.toBe(true);
  await page.reload();
  await expect(page.getByLabel("Open the New Yokosuka menu")).toBeVisible({timeout:120_000});
  await page.keyboard.press("Enter");
  await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();
  await page.locator(".character-slot-button:not(.empty)").filter({hasText:character.name}).click();
  await page.locator("button").filter({hasText:/^Enter World$/}).click();
  await page.waitForFunction(()=>window.storyProbe?.ready&&window.storyProbe.regions?.getCharacter()?.id,null,{timeout:120_000});
  await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.ready&&!window.storyProbe.lifecycle.worldRuntime.switching,null,{timeout:120_000});
  await page.waitForTimeout(3000);
  const after=await saved();
  expect(after.character.storyFlags["story.s1.chai-recovery.completed"]).toBe(true);
  expect(after.character.storyFlags["story.s1.chai-recovery.pending"]).not.toBe(true);
  expect(new Date(after.character.storyTimeMs).toISOString().slice(0,10)).toBe(new Date(before.character.storyTimeMs).toISOString().slice(0,10));
  expect(after.character.yen).toBe(before.character.yen);
  expect(after.inventory).toEqual(before.inventory);
  expect(await page.evaluate(()=>window.storyProbe.starts.includes("story-s1-chai-home-recovery"))).toBe(false);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
}

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
      await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.packageRuntime?.stageWeather?.particles?.getActiveCount()>0,null,{timeout:20_000});
      await page.evaluate(()=>window.storyWeatherReview=window.storyProbe.director.activeCutscene.packageRuntime.stageWeather);
      await page.waitForTimeout(1800);await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-snow-dream-cancel"));await idle();await unchanged(sleepFlag);
      expect(await page.evaluate(()=>window.storyWeatherReview.particles)).toBe(null);
      await approach();const beforeSleep=await saved();await page.getByRole("button",{name:"Sleep until tomorrow",exact:true}).click();await scene("snow-dream");
      await page.waitForTimeout(9000);await page.screenshot({path:testInfo.outputPath("original-snow-girl-dream.png")});await unchanged(sleepFlag);
      if(process.env.NEW_YOKOSUKA_SNOW_PROJECTION_REVIEW_E2E==="true"){
        const diagnostic=await page.evaluate(()=>{
          const w=window.storyProbe.director.activeCutscene.packageRuntime.stageWeather,s=w.scene,m=s.getTransformMatrix();
          const projected=w.particles.particles.map(p=>p.position.constructor.TransformCoordinates(p.position,m));
          return {active:projected.length,inView:projected.filter(p=>Math.abs(p.x)<=1&&Math.abs(p.y)<=1&&p.z>=0&&p.z<=1).length,
            camera:w.cameraPosition()?.asArray(),emitter:w.emitter.position.asArray()};
        });
        console.info("Snow projection review",JSON.stringify(diagnostic));
      }
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
