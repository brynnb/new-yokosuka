import {expect} from "@playwright/test";
import {driveObservedDeliveries} from "./story-forklift-training.js";

export async function verifyMorningCargo(page,testInfo,character,{day="one"}={}){
  expect(["one","two","three","four","five"]).toContain(day);
  const chapter=`workday-${day}`,count=day==="one"||day==="five"?5:4;
  const success=day==="five"?"Five crates are delivered. Time for lunch with the other workers.":day!=="one"?"Four crates are delivered. Time for lunch with the other workers.":"The morning batch is finished. It is lunch break.";
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved(),done=`story.s1.${chapter}-morning.completed`;
  expect(initial.character.storyFlags[`story.s1.${chapter}-race.completed`]).toBe(true);
  expect(initial.character.storyFlags[done]).not.toBe(true);
  const noErrors=async()=>expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);await noErrors();};
  const unchanged=async()=>{const s=await saved();expect(s.character.yen).toBe(initial.character.yen);expect(s.inventory).toEqual(initial.inventory);expect(s.character.storyFlags[done]).not.toBe(true);};
  const approach=async()=>{
    await page.evaluate(()=>{const l=window.storyProbe.lifecycle,c=l.getController();l.resetPlayer(l.vectorFromArray([-20,0,117]),-Math.PI/2,{persist:false});c.setFirstPerson(true);c.cameraYaw=-Math.PI/2;c.cameraPitch=0;c.updateCamera(1);});
    await page.waitForTimeout(250);await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
    try{await page.waitForFunction(()=>window.storyProbe.regions.controller.status==="line"||window.storyProbe.sceneErrors.length,null,{timeout:15_000});}finally{await page.keyboard.up("KeyW");}await noErrors();
    await page.keyboard.press("Space");await page.getByRole("button",{name:"Start the deliveries",exact:true}).waitFor();
  };
  // The saved race return can already be inside this new dispatch volume.
  await page.waitForFunction(()=>["line","options"].includes(window.storyProbe.regions.controller.status)||window.storyProbe.sceneErrors.length);
  await noErrors();
  if(await page.evaluate(()=>window.storyProbe.regions.controller.status==="line"))await page.keyboard.press("Space");
  await page.getByRole("button",{name:"Leave it for now",exact:true}).click();
  await idle();
  await approach();await page.getByRole("button",{name:"Leave it for now",exact:true}).click();await idle();await unchanged();
  const start=async()=>{await approach();await page.getByRole("button",{name:"Start the deliveries",exact:true}).click();await page.waitForFunction(()=>window.storyProbe.delivery?.active?.entered||window.storyProbe.sceneErrors.length,null,{timeout:45_000});await noErrors();await page.waitForTimeout(1800);};
  await start();await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-morning-cargo-cancel"));await idle();await unchanged();
  await start();await page.locator("#renderCanvas").focus();
  await driveObservedDeliveries(page,testInfo,count,`${chapter}-morning`);
  await page.getByText(success,{exact:true}).waitFor();await unchanged();
  await page.keyboard.press("Space");
  if(day!=="one"){
    await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-workday-lunch"||window.storyProbe.sceneErrors.length,null,{timeout:65_000});await noErrors();
    await page.waitForTimeout(6000);await page.screenshot({path:testInfo.outputPath(`${chapter}-original-coworker-lunch.png`)});await unchanged();
    await expect.poll(async()=>(await saved()).character.storyFlags[done],{timeout:45_000,intervals:[1000]}).toBe(true);
  }
  await idle();
  const final=await saved();expect(final.character.storyFlags[done]).toBe(true);expect(final.character.storyFlags[`notebook.s1.${day!=="one"?`${chapter}-lunch`:"workday-one-morning"}`]).toBe(true);
  expect(final.character.yen).toBe(initial.character.yen);expect(final.inventory).toEqual(initial.inventory);expect(new Date(final.character.storyTimeMs).getUTCHours()).toBe(12);
  await page.screenshot({path:testInfo.outputPath(`${chapter}-morning-earned-lunch.png`)});
  await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);await idle();
  expect((await saved()).character.storyFlags[done]).toBe(true);expect(await page.getByRole("button",{name:"Start the deliveries",exact:true}).isVisible()).toBe(false);
}

export async function verifyMarkLunch(page,testInfo,character){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved(),done="story.s1.mark-lunch-rescue.completed";
  expect(initial.character.storyFlags["story.s1.workday-one-morning.completed"]).toBe(true);expect(initial.character.storyFlags[done]).not.toBe(true);
  const noErrors=async()=>expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);await noErrors();};
  const unchanged=async()=>{const s=await saved();expect(s.character.yen).toBe(initial.character.yen);expect(s.inventory).toEqual(initial.inventory);expect(s.character.storyFlags[done]).not.toBe(true);};
  const scene=async part=>{await page.waitForFunction(part=>window.storyProbe.director?.activeCutscene?.cutscene.id===`story-s1-mark-lunch-${part}`||window.storyProbe.sceneErrors.length,part,{timeout:65_000});await noErrors();};
  const approach=async()=>{
    await page.evaluate(()=>{const l=window.storyProbe.lifecycle,c=l.getController();l.resetPlayer(l.vectorFromArray([30.3,0,64]),0,{persist:false});c.setFirstPerson(true);c.cameraYaw=0;c.cameraPitch=0;c.updateCamera(1);});
    await page.waitForTimeout(250);await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
    try{await scene("intro");}finally{await page.keyboard.up("KeyW");}
  };
  await idle();await approach();await page.waitForTimeout(8000);await page.screenshot({path:testInfo.outputPath("mark-lunch-original-confrontation.png")});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-mark-intro-cancel"));await idle();await unchanged();
  await approach();
  // Natural original introduction must lead to actual combat, not a victory.
  await page.waitForFunction(()=>window.storyProbe.combatRuntime?.active?.view.ready||window.storyProbe.sceneErrors.length,null,{timeout:80_000});await noErrors();await unchanged();
  expect(await page.evaluate(()=>window.storyProbe.combatRuntime.active.view.actors.map(a=>a.tag))).toEqual(["AKIR","MRSK","OKYS","THG3"]);
  await page.screenshot({path:testInfo.outputPath("mark-lunch-three-opponent-fight.png")});
  await winHarborFight(page);
  await scene("aftermath");await unchanged();await page.waitForTimeout(8000);await page.screenshot({path:testInfo.outputPath("mark-lunch-original-aftermath.png")});
  await expect.poll(async()=>(await saved()).character.storyFlags[done],{timeout:55_000,intervals:[1000]}).toBe(true);await idle();
  const final=await saved();expect(final.character.storyFlags["notebook.s1.mark-chen-rivals"]).toBe(true);expect(final.character.yen).toBe(initial.character.yen);expect(final.inventory).toEqual(initial.inventory);
  await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);await idle();
  expect((await saved()).character.storyFlags[done]).toBe(true);expect(await page.evaluate(()=>window.storyProbe.starts.some(id=>id.startsWith("story-s1-mark-lunch-")))).toBe(false);
}

export async function winHarborFight(page,{attack="KeyK"}={}){
  await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyI");
  const held=new Set();
  const keys=async next=>{for(const key of held)if(!next.includes(key)){await page.keyboard.up(key);held.delete(key);}for(const key of next)if(!held.has(key)){await page.keyboard.down(key);held.add(key);}};
  const movement=async retreat=>page.evaluate(retreat=>{
    const r=window.storyProbe.combatRuntime,v=r.active?.view;if(!v)return[];
    const p=v.actors[0],e=v.actors.slice(1).filter(a=>a.health>0).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];if(!e)return[];
    const d=Math.hypot(e.x-p.x,e.z-p.z);let x=0,z=0;
    if(retreat){const enemies=v.actors.slice(1).filter(a=>a.health>0),center=enemies.reduce((c,a)=>[c[0]+a.x/enemies.length,c[1]+a.z/enemies.length],[0,0]),length=Math.hypot(p.x-center[0],p.z-center[1]);x=(p.x-center[0])/length;z=(p.z-center[1])/length;}
    else if(d<.9){x=(p.x-e.x)/Math.max(.01,d);z=(p.z-e.z)/Math.max(.01,d);}else if(d>1.4){x=(e.x-p.x)/d;z=(e.z-p.z)/d;}
    const yaw=r.encounter.playerTargetYaw()+Math.PI,b=r.active.input.getBindings(),f=-Math.sin(yaw)*x-Math.cos(yaw)*z,s=Math.cos(yaw)*x-Math.sin(yaw)*z;
    return[Math.abs(f)>.25?(f>0?b.up:b.down):null,Math.abs(s)>.25?(s>0?b.right:b.left):null].filter(Boolean);
  },retreat);
  try{
    // A short real retreat draws the attackers in from one side. Standing
    // surrounded while continuously attacking is not a reliable win strategy.
    await keys([...(await movement(true)),"ShiftLeft"]);await page.waitForTimeout(1000);await keys([]);
    for(let i=0;i<1700&&await page.evaluate(()=>!!window.storyProbe.combatRuntime?.active);i++){
      await keys(await movement(false));await page.keyboard.press(attack);await page.waitForTimeout(80);
    }
  }finally{await page.keyboard.up("KeyI");await keys([]);}
  const failed=await page.getByRole("button",{name:"Try again",exact:true}).isVisible();
  if(failed)console.info("Failed rendered fight",JSON.stringify(await page.evaluate(()=>{const inputs=window.storyProbe.combatInputs;return{view:window.storyProbe.lastCombatView,count:inputs.length,guarded:inputs.filter(i=>i.guard).length,actions:Object.fromEntries(["hand","leg","throw", ""].map(a=>[a,inputs.filter(i=>i.action===a).length])),last:inputs.slice(-3)};})));
  expect(failed,"Keyboard fight ended in defeat rather than success").toBe(false);
}

export async function verifyFirstAfternoon(page,testInfo,character){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved(),flag=id=>`story.s1.${id}.completed`;
  expect(initial.character.storyFlags[flag("mark-lunch-rescue")]).toBe(true);expect(initial.character.storyFlags[flag("workday-one-payday")]).not.toBe(true);
  const noErrors=async()=>expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);await noErrors();};
  const economy=async paid=>{const s=await saved();expect(s.character.yen).toBe(initial.character.yen+(paid?3000:0));expect(s.inventory).toEqual(initial.inventory);return s;};
  const reset=async(position,yaw)=>{await page.evaluate(({position,yaw})=>{const l=window.storyProbe.lifecycle,c=l.getController();l.resetPlayer(l.vectorFromArray(position),yaw,{persist:true});c.setFirstPerson(true);c.cameraYaw=yaw;c.cameraPitch=0;c.updateCamera(1);},{position,yaw});await page.waitForTimeout(250);};
  const approach=async(position,yaw)=>{await reset(position,yaw);await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");try{await page.waitForFunction(()=>["line","options"].includes(window.storyProbe.regions.controller.status)||window.storyProbe.director?.activeCutscene||window.storyProbe.sceneErrors.length,null,{timeout:15_000});}finally{await page.keyboard.up("KeyW");}await noErrors();};
  const reload=async()=>{await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);await idle();};
  await idle();
  if(!(await saved()).character.storyFlags[flag("workday-one-afternoon")]){
    const hour=new Date((await saved()).character.storyTimeMs).getUTCHours();
    if(hour<14){await page.locator("#story-wait-button").click();await page.getByRole("option",{name:"Wait until 2 p.m.",exact:true}).click();await page.getByRole("button",{name:"Wait until 2 p.m.",exact:true}).click();await idle();}
    await approach([-20,0,117],-Math.PI/2);await page.keyboard.press("Space");await page.getByRole("button",{name:"Start the deliveries",exact:true}).click();
    await page.waitForFunction(()=>window.storyProbe.delivery?.active?.entered||window.storyProbe.sceneErrors.length,null,{timeout:45_000});await noErrors();await page.waitForTimeout(1800);await page.locator("#renderCanvas").focus();
    await driveObservedDeliveries(page,testInfo,5,"workday-one-afternoon");
    await page.getByText("The afternoon batch is finished. All ten crates are delivered.",{exact:true}).waitFor();expect((await economy(false)).character.storyFlags[flag("workday-one-afternoon")]).not.toBe(true);
    await page.keyboard.press("Space");await expect.poll(async()=>(await saved()).character.storyFlags[flag("workday-one-afternoon")]).toBe(true);
  }
  if(!(await saved()).character.storyFlags[flag("workday-one-attack")]){
    if(await page.evaluate(()=>window.storyProbe.regions.controller.status==="idle"))await approach([-20,0,117],-Math.PI/2);
    await page.getByText("Three thugs are trying to stop my work. I need to get past them before going to Yada-san.",{exact:true}).waitFor();await page.keyboard.press("Space");await page.getByRole("button",{name:"Face the attackers",exact:true}).click();
    await page.waitForFunction(()=>window.storyProbe.combatRuntime?.active?.view.ready||window.storyProbe.sceneErrors.length,null,{timeout:45_000});await noErrors();await economy(false);
    await page.screenshot({path:testInfo.outputPath("workday-one-afternoon-three-attackers.png")});await winHarborFight(page);
    await page.getByText("The attackers have backed off. The shift is over. I should collect my wages from Yada-san at Alpha Trading.",{exact:true}).waitFor();await economy(false);
    await page.keyboard.press("Space");await idle();expect((await economy(false)).character.storyFlags[flag("workday-one-attack")]).toBe(true);
  }
  const payApproach=async()=>{await approach([25,0,66],Math.PI);await page.getByText("Ten crates at 300 yen each: 3,000 yen. Yada-san has today's wages ready.",{exact:true}).waitFor();await page.keyboard.press("Space");await page.getByRole("button",{name:"Collect today's wages",exact:true}).click();await page.waitForFunction(()=>window.storyProbe.authoredScene?.active?.scene.id==="s1.mfsy.payday"||window.storyProbe.sceneErrors.length,null,{timeout:45_000});await noErrors();};
  await payApproach();await page.waitForTimeout(8000);await page.screenshot({path:testInfo.outputPath("workday-one-original-salary-motion.png")});await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-payday-cancel"));await idle();await economy(false);
  await payApproach();await page.getByText("My first wages: 3,000 yen. Time to head outside.",{exact:true}).waitFor({timeout:65_000});await economy(false);
  await page.keyboard.press("Space");await expect.poll(async()=>(await saved()).character.storyFlags[flag("workday-one-payday")]).toBe(true);await economy(true);
  const goro=async()=>{await page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-after-work-goro"||window.storyProbe.sceneErrors.length,null,{timeout:65_000});await noErrors();};
  await goro();await page.waitForTimeout(8000);await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-goro-after-pay-cancel"));await idle();await economy(true);
  expect((await saved()).character.storyFlags[flag("after-work-goro")]).not.toBe(true);
  await reset([25,0,64],Math.PI);await reload();await economy(true);expect(await page.getByRole("button",{name:"Collect today's wages",exact:true}).isVisible()).toBe(false);
  await approach([25,0,64],Math.PI);await goro();await page.waitForTimeout(25_000);await page.screenshot({path:testInfo.outputPath("workday-one-original-goro-warning.png")});
  await expect.poll(async()=>(await saved()).character.storyFlags[flag("after-work-goro")],{timeout:85_000,intervals:[1000]}).toBe(true);await idle();
  const final=await economy(true);expect(final.character.storyFlags[flag("workday-one")]).toBe(true);expect(final.character.storyFlags["notebook.s1.first-payday"]).toBe(true);expect(final.character.storyFlags["notebook.s1.goro-work-warning"]).toBe(true);
  await reload();await economy(true);expect(await page.evaluate(()=>window.storyProbe.starts.includes("story-s1-after-work-goro"))).toBe(false);
}
