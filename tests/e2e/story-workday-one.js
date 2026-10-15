import {expect} from "@playwright/test";
import {driveObservedDeliveries} from "./story-forklift-training.js";

export async function verifyMorningCargo(page,testInfo,character){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved(),done="story.s1.workday-one-morning.completed";
  expect(initial.character.storyFlags["story.s1.workday-one-race.completed"]).toBe(true);
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
  await driveObservedDeliveries(page,testInfo,5,"workday-one-morning");
  await page.getByText("The morning batch is finished. It is lunch break.",{exact:true}).waitFor();await unchanged();
  await page.keyboard.press("Space");await idle();
  const final=await saved();expect(final.character.storyFlags[done]).toBe(true);expect(final.character.storyFlags["notebook.s1.workday-one-morning"]).toBe(true);
  expect(final.character.yen).toBe(initial.character.yen);expect(final.inventory).toEqual(initial.inventory);expect(new Date(final.character.storyTimeMs).getUTCHours()).toBe(12);
  await page.screenshot({path:testInfo.outputPath("workday-one-morning-earned-lunch.png")});
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
  await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyI");
  const held=new Set();
  const keys=async next=>{for(const key of held)if(!next.includes(key)){await page.keyboard.up(key);held.delete(key);}for(const key of next)if(!held.has(key)){await page.keyboard.down(key);held.add(key);}};
  const movement=async retreat=>page.evaluate(retreat=>{
    const r=window.storyProbe.combatRuntime,v=r.active?.view;if(!v)return[];
    const p=v.actors[0],e=v.actors.slice(1).filter(a=>a.health>0).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];if(!e)return[];
    const d=Math.hypot(e.x-p.x,e.z-p.z);let x=0,z=0;
    if(retreat)z=-1;else if(d<.9){x=(p.x-e.x)/Math.max(.01,d);z=(p.z-e.z)/Math.max(.01,d);}else if(d>1.4){x=(e.x-p.x)/d;z=(e.z-p.z)/d;}
    const yaw=r.getController().cameraYaw,b=r.active.input.getBindings(),f=-Math.sin(yaw)*x-Math.cos(yaw)*z,s=Math.cos(yaw)*x-Math.sin(yaw)*z;
    return[Math.abs(f)>.25?(f>0?b.up:b.down):null,Math.abs(s)>.25?(s>0?b.right:b.left):null].filter(Boolean);
  },retreat);
  try{
    // A short real retreat draws the attackers in from one side. Standing
    // surrounded while continuously attacking is not a reliable win strategy.
    await keys([...(await movement(true)),"ShiftLeft"]);await page.waitForTimeout(1000);await keys([]);
    for(let i=0;i<1700&&await page.evaluate(()=>!!window.storyProbe.combatRuntime?.active);i++){
      await keys(await movement(false));await page.keyboard.press("KeyK");await page.waitForTimeout(80);
    }
  }finally{await page.keyboard.up("KeyI");await keys([]);}
  await scene("aftermath");await unchanged();await page.waitForTimeout(8000);await page.screenshot({path:testInfo.outputPath("mark-lunch-original-aftermath.png")});
  await expect.poll(async()=>(await saved()).character.storyFlags[done],{timeout:55_000,intervals:[1000]}).toBe(true);await idle();
  const final=await saved();expect(final.character.storyFlags["notebook.s1.mark-chen-rivals"]).toBe(true);expect(final.character.yen).toBe(initial.character.yen);expect(final.inventory).toEqual(initial.inventory);
  await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);await idle();
  expect((await saved()).character.storyFlags[done]).toBe(true);expect(await page.evaluate(()=>window.storyProbe.starts.some(id=>id.startsWith("story-s1-mark-lunch-")))).toBe(false);
}
