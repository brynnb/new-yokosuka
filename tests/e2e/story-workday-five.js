import {expect} from "@playwright/test";
import {driveObservedDeliveries} from "./story-forklift-training.js";
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

export async function verifyChenWarning(page,testInfo,character){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved(),done="story.s1.chen-warning.completed";
  expect(initial.character.storyFlags["story.s1.warning-letter.completed"]).toBe(true);
  const allowed=new Set([done,"story.s1.chen-warning-visit.completed","notebook.s1.chen-warning","story.s1.workday-five.completed"]);
  const check=async(complete=false)=>{const s=await saved();expect(s.character.yen).toBe(initial.character.yen);expect(s.inventory).toEqual(initial.inventory);
    for(const flag of [done,"story.s1.workday-five.completed","notebook.s1.chen-warning"])expect(s.character.storyFlags[flag]===true).toBe(complete);
    for(const [key,value]of Object.entries(s.character.storyFlags))if(!allowed.has(key))expect(value).toBe(initial.character.storyFlags[key]);
    expect(new Date(s.character.storyTimeMs).toISOString().slice(0,10)).toBe(new Date(initial.character.storyTimeMs).toISOString().slice(0,10));
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return s;};
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);};
  const movie=()=>page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-chen-warning"||window.storyProbe.sceneErrors.length,null,{timeout:75_000});
  const approach=async(position,yaw,wait)=>{await idle();await page.evaluate(({position,yaw})=>{const l=window.storyProbe.lifecycle,c=l.getController();l.resetPlayer(l.vectorFromArray(position),yaw,{persist:false});c.setFirstPerson(true);c.cameraYaw=yaw;c.cameraPitch=0;c.updateCamera(1);},{position,yaw});await page.waitForTimeout(250);await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");try{await wait();}finally{await page.keyboard.up("KeyW");}};
  if(!initial.character.storyFlags[done]){
    if(initial.character.worldId==="mfsy"){
      console.info("Post-letter Chen: decline the ordinary visit offer, then enter the saved warehouse through real travel");
      const visit=page.getByRole("button",{name:"Visit Master Chen",exact:true});
      const {default:catalog}=await import("../../play/data/story-regions.json",{with:{type:"json"}}),region=catalog.regions.find(r=>r.id==="s1.mfsy.chen-warning-visit");
      const entered=[character.x,character.y,character.z].every((v,i)=>v>=region.min[i]&&v<=region.max[i]);
      if(!entered)await approach([25,0,66],Math.PI,()=>visit.waitFor());else await visit.waitFor();
      await page.getByRole("button",{name:"Leave it for now",exact:true}).click();await idle();
      expect((await check()).character.storyFlags["story.s1.chen-warning-visit.completed"]).not.toBe(true);
      await approach([25,0,66],Math.PI,()=>visit.waitFor());await visit.click();
    }
    await movie();await check();await page.waitForTimeout(8000);
    await page.screenshot({path:testInfo.outputPath("chen-warning-original-entry-cancel.png")});
    await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-chen-warning-cancel"));await idle();
    const cancelled=await check();expect(cancelled.character.worldId).toBe("ms08");expect(cancelled.character.storyFlags["story.s1.chen-warning-visit.completed"]).toBe(true);
    // Travel is durable, but the cancelled conversation is not. Reload the
    // actual saved entry and allow its ordinary region to offer the film again.
    await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();
    await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);await movie();await check();
    console.info("Post-letter Chen: original 137-second conversation, natural ending and atomic saved chapter");
    await page.waitForTimeout(36000);await page.screenshot({path:testInfo.outputPath("chen-warning-original-conversation.png")});
    await expect.poll(async()=>(await saved()).character.storyFlags[done],{timeout:145_000,intervals:[1000]}).toBe(true);await idle();await check(true);
  }
  await check(true);
  await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);await idle();await check(true);
  expect(await page.evaluate(()=>window.storyProbe.starts.includes("story-s1-chen-warning"))).toBe(false);
  const position=await page.evaluate(()=>window.storyProbe.lifecycle.getController().actorRoot.position.asArray());
  const final=await saved();expect(final.character.worldId).toBe("ms08");expect(position[0]).toBeCloseTo(final.character.x,1);expect(position[2]).toBeCloseTo(final.character.z,1);
  await page.screenshot({path:testInfo.outputPath("chen-warning-earned-chapter-reload.png")});
}

async function leavePendingChenVisit(page,character){
  if(!character.storyFlags["story.s1.warning-letter.completed"]||character.storyFlags["story.s1.chen-warning.completed"])return;
  const {default:catalog}=await import("../../play/data/story-regions.json",{with:{type:"json"}}),region=catalog.regions.find(r=>r.id==="s1.mfsy.chen-warning-visit");
  if(character.worldId!==region.worldId||![character.x,character.y,character.z].every((v,i)=>v>=region.min[i]&&v<=region.max[i]))return;
  // The connected follow-up now offers travel at this same saved approach.
  // End a narrower checkpoint through the normal Leave choice, not a fake flag
  // or disabling the production trigger to manufacture an idle player.
  await page.getByRole("button",{name:"Visit Master Chen",exact:true}).waitFor();
  await page.getByRole("button",{name:"Leave it for now",exact:true}).click();
}

export async function verifyWarningLetter(page,testInfo,character,{musicResponses=[]}={}){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved(),done="story.s1.warning-letter.completed";
  expect(initial.character.storyFlags["story.s1.workday-five-payday.completed"]).toBe(true);
  const check=async()=>{const s=await saved();expect(s.character.yen).toBe(initial.character.yen);expect(s.inventory).toEqual(initial.inventory);
    expect(s.character.storyFlags["story.s1.workday-five.completed"]).not.toBe(true);expect(s.character.storyFlags["story.s1.chen-warning.completed"]).not.toBe(true);
    expect(new Date(s.character.storyTimeMs).toISOString().slice(0,10)).toBe(new Date(initial.character.storyTimeMs).toISOString().slice(0,10));
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return s;};
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);await check();};
  const movie=()=>page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-warning-letter"||window.storyProbe.sceneErrors.length,null,{timeout:65_000});
  const begin=async()=>{await idle();await page.evaluate(()=>{const l=window.storyProbe.lifecycle,c=l.getController();l.resetPlayer(l.vectorFromArray([25,0,66]),Math.PI,{persist:false});c.setFirstPerson(true);c.cameraYaw=Math.PI;c.cameraPitch=0;c.updateCamera(1);});await page.waitForTimeout(250);await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");try{await movie();}finally{await page.keyboard.up("KeyW");}};
  if(initial.character.storyFlags[done])await leavePendingChenVisit(page,initial.character);
  if(!initial.character.storyFlags[done]){
    console.info("Warning letter: original Alpha scene, cancellation/re-entry and natural completion without another salary");
    // A saved payday approach lies in the next event's volume. Let ordinary
    // dispatch start it; otherwise use normal movement into that volume.
    const {default:catalog}=await import("../../play/data/story-regions.json",{with:{type:"json"}});
    const region=catalog.regions.find(r=>r.id==="s1.mfsy.warning-letter");
    const entered=initial.character.worldId===region.worldId&&[initial.character.x,initial.character.y,initial.character.z].every((v,i)=>v>=region.min[i]&&v<=region.max[i]);
    if(!entered)await begin();
    await movie();await page.waitForTimeout(6000);await page.screenshot({path:testInfo.outputPath("warning-letter-original-alpha-scene.png")});
    expect((await check()).character.storyFlags[done]).not.toBe(true);
    await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-warning-letter-cancel"));await idle();
    expect((await check()).character.storyFlags[done]).not.toBe(true);
    await begin();await expect.poll(async()=>(await saved()).character.storyFlags[done],{timeout:85_000,intervals:[1000]}).toBe(true);await leavePendingChenVisit(page,(await saved()).character);await idle();
    // Record real responses from before navigation. Resource Timing's default
    // 250-entry buffer fills during world loading and loses later audio loads.
    expect(musicResponses.some(response=>[200,206].includes(response.status)),JSON.stringify(musicResponses)).toBe(true);
  }
  expect((await check()).character.storyFlags["notebook.s1.gui-zhang-warning"]).toBe(true);
  await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);await leavePendingChenVisit(page,(await saved()).character);await idle();await check();
  expect(await page.evaluate(()=>window.storyProbe.starts.includes("story-s1-warning-letter"))).toBe(false);
  await page.screenshot({path:testInfo.outputPath("warning-letter-earned-notebook-reload.png")});
}

export async function verifyFifthAfternoon(page,testInfo,character,{musicResponses=[]}={}){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved(),quota="story.s1.workday-five-afternoon.completed",pay="story.s1.workday-five-payday.completed";
  expect(initial.character.storyFlags["story.s1.sailor-chase.completed"]).toBe(true);
  const unpaid=initial.character.yen-(initial.character.storyFlags[pay]?3000:0);
  const check=async()=>{const s=await saved();expect(s.character.yen).toBe(unpaid+(s.character.storyFlags[pay]?3000:0));expect(s.inventory).toEqual(initial.inventory);
    expect(s.character.storyFlags["story.s1.workday-five.completed"]).not.toBe(true);expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return s;};
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);await check();};
  const approach=async(position,yaw,text)=>{await idle();await page.evaluate(({position,yaw})=>{const l=window.storyProbe.lifecycle,c=l.getController();l.resetPlayer(l.vectorFromArray(position),yaw,{persist:false});c.setFirstPerson(true);c.cameraYaw=yaw;c.cameraPitch=0;c.updateCamera(1);},{position,yaw});await page.waitForTimeout(250);await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");try{await page.getByText(text,{exact:true}).waitFor();}finally{await page.keyboard.up("KeyW");}};
  if(!initial.character.storyFlags[quota]){
    console.info("Fifth afternoon: five new physical deliveries after the earned sailor chase");
    const text="Terry leads the Mad Angels. Finish the remaining five deliveries, then collect today's wages from Yada-san.";
    if(!await page.getByText(text,{exact:true}).isVisible())await approach([-20,0,117],-Math.PI/2,text);
    await page.keyboard.press("Space");await page.getByRole("button",{name:"Start the deliveries",exact:true}).click();
    await page.waitForFunction(()=>window.storyProbe.delivery?.active?.entered||window.storyProbe.sceneErrors.length,null,{timeout:45_000});await check();
    await page.waitForTimeout(1800);await page.locator("#renderCanvas").focus();await driveObservedDeliveries(page,testInfo,5,"workday-five-afternoon");
    await page.getByText("All ten deliveries are finished. The shift is over; collect today's wages from Yada-san.",{exact:true}).waitFor();
    expect((await check()).character.storyFlags[quota]).not.toBe(true);await page.keyboard.press("Space");await idle();
    expect((await check()).character.storyFlags[quota]).toBe(true);expect(new Date((await saved()).character.storyTimeMs).getUTCHours()).toBe(17);
  }
  if(!(await saved()).character.storyFlags[pay]){
    console.info("Fifth afternoon: original salary handover, cancellation/retry and once-only 3000yen");
    const collect=async()=>{await approach([25,0,66],Math.PI,"Ten deliveries at 300 yen each: 3,000 yen. Yada-san has today's wages ready.");await page.keyboard.press("Space");await page.getByRole("button",{name:"Collect today's wages",exact:true}).click();await page.waitForFunction(()=>window.storyProbe.authoredScene?.active?.scene.id==="s1.mfsy.payday"||window.storyProbe.sceneErrors.length,null,{timeout:45_000});await check();};
    await collect();await page.waitForTimeout(6000);await page.screenshot({path:testInfo.outputPath("fifth-payday-original-handover-cancel.png")});
    await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-fifth-payday-cancel"));await idle();expect((await check()).character.storyFlags[pay]).not.toBe(true);
    await collect();await page.getByText("Collected today's wages: 3,000 yen. Yada-san has something else to give me.",{exact:true}).waitFor({timeout:65_000});
    expect((await check()).character.storyFlags[pay]).not.toBe(true);await page.keyboard.press("Space");await expect.poll(async()=>(await saved()).character.storyFlags[pay]).toBe(true);
  }
  if(!(await saved()).character.storyFlags["story.s1.warning-letter.completed"])await verifyWarningLetter(page,testInfo,character,{musicResponses});
  else await leavePendingChenVisit(page,(await saved()).character);
  await idle();
  const final=await check();for(const f of [quota,pay,"notebook.s1.workday-five-quota","notebook.s1.fifth-payday"])expect(final.character.storyFlags[f]).toBe(true);
  await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);await leavePendingChenVisit(page,(await saved()).character);await idle();await check();
  await page.screenshot({path:testInfo.outputPath("fifth-payday-earned-reload.png")});
}

export async function verifyFifthSailorChase(page,testInfo,character,{reconnectOnly=false,arrivalOnly=false,lostReceipt=false}={}){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved(),done="story.s1.sailor-chase.completed";
  expect(initial.character.storyFlags["story.s1.goro-mai-marriage.completed"]).toBe(true);
  if(reconnectOnly||arrivalOnly)expect(initial.character.storyFlags[done]).not.toBe(true);
  const check=async(complete=false)=>{
    const s=await saved();expect(s.character.yen).toBe(initial.character.yen);expect(s.inventory).toEqual(initial.inventory);
    for(const f of [done,"notebook.s1.terry-mad-angels"])expect(s.character.storyFlags[f]===true).toBe(complete);
    for(const f of ["story.s1.workday-five-afternoon.completed","story.s1.workday-five-payday.completed","story.s1.workday-five.completed"])expect(s.character.storyFlags[f]).not.toBe(true);
    expect(new Date(s.character.storyTimeMs).toISOString().slice(0,10)).toBe(new Date(initial.character.storyTimeMs).toISOString().slice(0,10));
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return s;
  };
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);};
  const {default:regions}=await import("../../play/data/story-regions.json",{with:{type:"json"}}),region=regions.regions.find(r=>r.id==="s1.mfsy.sailor-chase");
  const loaded=async()=>{
    const c=(await saved()).character,hour=new Date(c.storyTimeMs).getUTCHours();
    // A cancelled attempt legitimately saves the approach inside this volume.
    // Reconnect offers it again; decline through UI instead of assuming idle.
    if(!c.storyFlags[done]&&c.worldId==="mfsy"&&hour>=region.hours[0]&&hour<region.hours[1]&&[c.x,c.y,c.z].every((v,i)=>v>=region.min[i]&&v<=region.max[i])){
      await page.getByText("Tony and Smith are near Tomato. Ask them about the Long Zha.",{exact:true}).waitFor();await page.keyboard.press("Space");await page.getByRole("button",{name:"Leave it for now",exact:true}).click();
    }
    await idle();
  };
  const reload=async()=>{await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);await loaded();};
  await loaded();
  if(initial.character.storyFlags[done]){
    console.info("Fifth afternoon sailors: earned saved arrival, completed re-entry and no replay");await check(true);
    const position=await page.evaluate(()=>window.storyProbe.lifecycle.getController().actorRoot.position.asArray());
    expect(position[0]).toBeCloseTo(character.x,1);expect(position[2]).toBeCloseTo(character.z,1);
    await page.evaluate(()=>{const l=window.storyProbe.lifecycle,c=l.getController();l.resetPlayer(l.vectorFromArray([90,0,61]),Math.PI/2,{persist:false});c.setFirstPerson(true);c.cameraYaw=Math.PI/2;c.cameraPitch=0;c.updateCamera(1);});
    await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");try{await page.waitForFunction(()=>window.storyProbe.lifecycle.getController().actorRoot.position.x<88);}finally{await page.keyboard.up("KeyW");}
    await idle();await check(true);expect(await page.evaluate(()=>window.storyProbe.starts.some(id=>id.startsWith("story-s1-sailor-chase-")))).toBe(false);
    await page.screenshot({path:testInfo.outputPath("fifth-sailors-completed-reentry-no-replay.png")});return;
  }
  if(reconnectOnly){for(let i=0;i<3;i++){await reload();await check();}return;}
  if(new Date((await saved()).character.storyTimeMs).getUTCHours()<14){await page.locator("#story-wait-button").click();await page.getByRole("option",{name:"Wait until 2 p.m.",exact:true}).click();await page.getByRole("button",{name:"Wait until 2 p.m.",exact:true}).click();await idle();}
  const approach=async()=>{
    await idle();await page.evaluate(()=>{const l=window.storyProbe.lifecycle,c=l.getController();l.resetPlayer(l.vectorFromArray([90,0,61]),Math.PI/2,{persist:false});c.setFirstPerson(true);c.cameraYaw=Math.PI/2;c.cameraPitch=0;c.updateCamera(1);});
    await page.waitForTimeout(250);await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");try{await page.getByText("Tony and Smith are near Tomato. Ask them about the Long Zha.",{exact:true}).waitFor();}finally{await page.keyboard.up("KeyW");}await page.keyboard.press("Space");
  };
  const movie=async part=>{await page.waitForFunction(part=>window.storyProbe.director?.activeCutscene?.cutscene.id===`story-s1-sailor-chase-${part}`||window.storyProbe.sceneErrors.length,part,{timeout:65_000});await check();};
  const prompt=async(id,button)=>{await page.waitForFunction(({id,button})=>{const p=window.storyProbe.regions.controller.active?.challengePrompt;return p?.ready&&p.button===button&&window.storyProbe.authoredScene?.active?.scene.id===`s1.mfsy.sailor-chase.${id}`||window.storyProbe.sceneErrors.length;},{id,button},{timeout:65_000});await check();};
  const press=async(id,button)=>{await prompt(id,button);await page.keyboard.press(button==="A"?"Enter":button==="B"?"Shift":`Arrow${button}`);};
  const begin=async()=>{await approach();await page.getByRole("button",{name:"Question the sailors",exact:true}).click();await movie("intro");};
  if(!arrivalOnly){
    console.info("Fifth afternoon sailors: decline and cancel original introduction");
    await approach();await page.getByRole("button",{name:"Leave it for now",exact:true}).click();await idle();await check();
    await begin();await page.waitForTimeout(6000);await page.screenshot({path:testInfo.outputPath("fifth-sailors-original-introduction.png")});await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-sailor-intro-cancel"));await idle();await check();
    await begin();await prompt("common-1","Left");await page.keyboard.press("ArrowDown");await page.getByText("I lost them. Try following the sailors again?",{exact:true}).waitFor();await check();await page.keyboard.press("Space");await page.getByRole("button",{name:"Try again",exact:true}).click();
  }
  const route=async(branch,left)=>{
    for(const [i,b]of ["Left","B","B","Left","A"].entries())await press(`common-${i+1}`,b);
    await page.getByRole("button",{name:left?"Take the left path":"Take the right path",exact:true}).click();if(left)await press("fork-left","Left");
    await page.getByRole("button",{name:branch==="tony"?"Follow Tony (left)":"Follow Smith (right)",exact:true}).click();
    const buttons=branch==="tony"?["Left","Right","A","Right","Left","Right"]:["Right","A","Left","Right","Left","Right"];
    for(const [i,b]of buttons.entries()){await press(`${branch}-${i+1}`,b);if(i===0)await page.screenshot({path:testInfo.outputPath(`fifth-sailors-${branch}-moving-chase.png`)});}
    await movie(branch);await page.waitForTimeout(18000);await page.screenshot({path:testInfo.outputPath(`fifth-sailors-original-${branch}-interrogation.png`)});
  };
  if(!arrivalOnly){
    console.info("Fifth afternoon sailors: left fork, actual Tony route, cancelled interrogation");await route("tony",true);
    await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-sailor-tony-ending-cancel"));await idle();await check();await reload();await check();
  }
  console.info("Fifth afternoon sailors: right fork, actual Smith route, natural ending and saved arrival");await begin();await route("smith",false);
  await expect.poll(async()=>(await saved()).character.storyFlags[done],{timeout:75_000,intervals:[1000]}).toBe(true);await idle();
  if(lostReceipt){
    await page.waitForFunction(()=>window.storyLostArrival?.dropped&&window.storyLostArrival.welcomes.length&&window.storyLostArrival.presence.length);
    const probe=await page.evaluate(()=>window.storyLostArrival);
    const welcome=probe.welcomes[0],presence=probe.presence[0],destination=probe.destination;
    expect(probe.before[0]).not.toBeCloseTo(destination.position[0],1);
    expect(welcome.storyFlags[done]).toBe(true);expect(welcome.scriptStateRevision).toBe(probe.revision);
    for(const pose of [welcome,presence]){
      expect(pose.worldId).toBe(destination.worldId);expect(pose.x).toBeCloseTo(destination.position[0],1);
      expect(pose.z).toBeCloseTo(destination.position[2],1);expect(pose.yaw).toBeCloseTo(destination.yaw,3);
    }
    expect(presence.storyArrivalRevision).toBe(probe.revision);
    const position=await page.evaluate(()=>window.storyProbe.lifecycle.getController().actorRoot.position.asArray());
    expect(position[0]).toBeCloseTo(destination.position[0],1);expect(position[2]).toBeCloseTo(destination.position[2],1);
    expect(await page.evaluate(()=>window.storyProbe.starts.filter(id=>id==="story-s1-sailor-chase-smith").length)).toBe(1);
    console.info("Fifth afternoon sailors: lost completion reply recovered by actual same-world socket reconnect");
    await page.screenshot({path:testInfo.outputPath("fifth-sailors-lost-reply-reconnected-arrival.png")});
  }
  await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.ready&&!window.storyProbe.lifecycle.worldRuntime.switching);
  const final=await check(true);expect(final.character.worldId).toBe("mfsy");expect(final.character.x).toBeCloseTo(-35.093055725097656,1);expect(final.character.z).toBeCloseTo(88.52650451660156,1);
  await reload();await check(true);expect(await page.evaluate(()=>window.storyProbe.starts.some(id=>id.startsWith("story-s1-sailor-chase-")))).toBe(false);
  await page.screenshot({path:testInfo.outputPath("fifth-sailors-earned-terry-clue-reload.png")});
}
