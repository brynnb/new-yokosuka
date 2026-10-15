import {expect} from "@playwright/test";
import {openStoryRoomDoor} from "./story-object-input.js";
import transitions from "../../play/data/native-map-transitions.json" with {type:"json"};

export async function verifyNozomiTransport(page,testInfo,character,{residentClickPoint,enterInteriorDoor,musicResponses=[]}){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved(),referral="story.s1.saijo-nozomi-transport.completed",borrow="story.s1.nozomi-motorcycle.completed";
  expect(initial.character.storyFlags["story.s1.nozomi-night-call.completed"]).toBe(true);
  const allowed=new Set([referral,borrow,"notebook.s1.naoyuki-motorcycle","notebook.s1.borrowed-motorcycle"]);
  const nightEnd=new Date(initial.character.storyTimeMs);nightEnd.setUTCHours(3,0,0,0);if(nightEnd.getTime()<=initial.character.storyTimeMs)nightEnd.setUTCDate(nightEnd.getUTCDate()+1);
  const check=async()=>{const s=await saved();expect(s.character.yen).toBe(initial.character.yen);expect(s.inventory).toEqual(initial.inventory);
    for(const [key,value]of Object.entries(s.character.storyFlags))if(!allowed.has(key))expect(value).toBe(initial.character.storyFlags[key]);
    expect(s.character.storyTimeMs).toBeGreaterThanOrEqual(initial.character.storyTimeMs);expect(s.character.storyTimeMs).toBeLessThan(nightEnd.getTime());
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return s;};
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");await page.waitForFunction(()=>{const w=window.storyProbe.lifecycle.worldRuntime;return w.ready&&!w.switching;});await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);};
  const reload=async({idleAfter=true}={})=>{await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);if(idleAfter)await idle();};
  if(!initial.character.storyFlags[referral]&&!initial.character.storyFlags[borrow]){
    const door=transitions.reverseMatchedD000Transitions.find(d=>d.destination.area==="DBYO"),back=transitions.allExactDoorTransitions.find(d=>d.id===door.evidence.returnTransitionId);
    await enterInteriorDoor(page,{world:"dbyo",filename:door.source.model,doorSelector:door.source.doorSelector,position:back.destination.browserSpawn.position,yaw:back.destination.browserSpawn.yawRadians});
    await page.waitForFunction(()=>window.storyProbe.lifecycle.scheduledActors.dialogueActor("SAJO"),null,{timeout:45_000});await idle();
    const talk=async()=>{const p=await residentClickPoint(page,"SAJO");console.info("Saijo transport body",p.modelCode);await page.mouse.click(p.x,p.y);await page.waitForFunction(()=>window.storyProbe.regions.controller.status!=="idle"||window.storyProbe.sceneErrors.length);};
    console.info("Nozomi transport: real bar entry, Saijo click and cancelled original inquiry");
    await talk();await page.waitForTimeout(700);await page.keyboard.press("Space");await page.waitForTimeout(250);await page.keyboard.press("Space");await page.waitForTimeout(350);
    await page.screenshot({path:testInfo.outputPath("nozomi-saijo-original-motorcycle-inquiry.png")});await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-saijo-transport-cancel"));await idle();expect((await check()).character.storyFlags[referral]).not.toBe(true);
    await talk();for(let i=0;i<20&&!(await saved()).character.storyFlags[referral];i++){await page.keyboard.press("Space");await page.waitForTimeout(180);}await idle();
    const s=await check();expect(s.character.storyFlags[referral]).toBe(true);expect(s.character.storyFlags["notebook.s1.naoyuki-motorcycle"]).toBe(true);expect(s.character.storyFlags[borrow]).not.toBe(true);
    await reload();await check();
  }
  if(!(await saved()).character.storyFlags[borrow]){
    await page.evaluate(()=>window.storyProbe.lifecycle.travelToWorld("sakuragaoka"));await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==="sakuragaoka"&&window.storyProbe.lifecycle.worldRuntime.ready);await idle();
    const approach=async()=>{await idle();await page.evaluate(()=>{const l=window.storyProbe.lifecycle,c=l.getController();l.resetPlayer(l.vectorFromArray([-14,0,32.5]),-Math.PI/2,{persist:false});c.setFirstPerson(true);c.cameraYaw=-Math.PI/2;c.cameraPitch=0;c.updateCamera(1);});await page.waitForTimeout(250);await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");try{await page.getByRole("button",{name:"Ask to borrow the motorcycle",exact:true}).waitFor({timeout:20_000});}finally{await page.keyboard.up("KeyW");}};
    const movie=()=>page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-nozomi-motorcycle"||window.storyProbe.sceneErrors.length,null,{timeout:65_000});
    await approach();await page.getByRole("button",{name:"Leave it for now",exact:true}).click();await idle();expect((await check()).character.storyFlags[borrow]).not.toBe(true);
    await approach();await page.getByRole("button",{name:"Ask to borrow the motorcycle",exact:true}).click();await movie();await page.waitForTimeout(12_000);await page.screenshot({path:testInfo.outputPath("nozomi-naoyuki-original-cancelled-handoff.png")});await check();
    await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-naoyuki-borrow-cancel"));await idle();expect((await check()).character.storyFlags[borrow]).not.toBe(true);
    // Reload the actually saved approach. The normal confirmation must be
    // offered again, not a fake completion or an automatically won journey.
    // Saved re-entry correctly owns the normal choice, so expecting idle here
    // would reject the very retry behavior this check is intended to prove.
    await reload({idleAfter:false});await page.getByRole("button",{name:"Ask to borrow the motorcycle",exact:true}).click();await movie();await check();
    console.info("Nozomi transport: original Naoyuki film, natural ending and permission-only settlement");
    // Original C003 starts at27.67s: Naoyuki agrees to lend the bike.
    await page.waitForTimeout(28_000);await page.screenshot({path:testInfo.outputPath("nozomi-naoyuki-original-motorcycle.png")});
    await expect.poll(async()=>(await saved()).character.storyFlags[borrow],{timeout:65_000,intervals:[1000]}).toBe(true);await idle();await check();
    expect(musicResponses.some(r=>r.url.includes("bgm200")&&[200,206].includes(r.status))).toBe(true);
  }
  const end=await check();expect(end.character.worldId).toBe("sakuragaoka");expect(end.character.storyFlags["notebook.s1.borrowed-motorcycle"]).toBe(true);
  await reload();await check();expect(await page.evaluate(()=>window.storyProbe.starts.includes("story-s1-nozomi-motorcycle"))).toBe(false);
  await page.locator("button").filter({hasText:/^Notebook$/}).click();for(let i=0;i<160&&await page.locator("#journal-next").isEnabled();i++)await page.locator("#journal-next").click();
  await expect(page.locator("#journal-page-copy")).toContainText("Naoyuki lent me his motorcycle.");await page.screenshot({path:testInfo.outputPath("nozomi-borrowed-motorcycle-earned-reload.png")});await page.locator("#journal-close").click();await idle();
}

// Start from the earned Chen save. Use normal travel, waiting, a real room
// door and movement; never manufacture the next chapter's flags or timestamp.
export async function verifyNozomiNightCall(page,testInfo,character,{musicResponses=[]}={}){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved(),rest="story.s1.nozomi-night-rest.completed",call="story.s1.nozomi-night-call.completed";
  for(const flag of ["story.s1.chen-warning.completed","story.s1.workday-five.completed"])expect(initial.character.storyFlags[flag]).toBe(true);
  const allowed=new Set([rest,call,"notebook.s1.nozomi-kidnapped"]);
  const check=async(complete=false)=>{
    const s=await saved();expect(s.character.yen).toBe(initial.character.yen);expect(s.inventory).toEqual(initial.inventory);
    for(const f of [call,"notebook.s1.nozomi-kidnapped"])expect(s.character.storyFlags[f]===true).toBe(complete);
    for(const [key,value]of Object.entries(s.character.storyFlags))if(!allowed.has(key))expect(value).toBe(initial.character.storyFlags[key]);
    const date=new Date(initial.character.storyTimeMs);
    if(s.character.storyFlags[rest]){
      // Real loading/reconnect time may cross midnight. It must remain the
      // same continuous night, not the old clock's nine-hour morning skip.
      const night=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate(),23,45);
      expect(s.character.storyTimeMs).toBeGreaterThanOrEqual(night);
      expect(s.character.storyTimeMs).toBeLessThan(night+75*60_000);
    }else expect(new Date(s.character.storyTimeMs).toISOString().slice(0,10)).toBe(date.toISOString().slice(0,10));
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return s;
  };
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");await page.waitForFunction(()=>{const w=window.storyProbe.lifecycle.worldRuntime;return w.ready&&!w.switching;});await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);};
  const reset=async(position,yaw=0)=>{await page.evaluate(({position,yaw})=>{const l=window.storyProbe.lifecycle,c=l.getController();l.resetPlayer(l.vectorFromArray(position),yaw,{persist:false});c.setFirstPerson(true);c.cameraYaw=yaw;c.cameraPitch=0;c.updateCamera(1);},{position,yaw});await page.waitForTimeout(250);};
  const walk=async(predicate)=>{await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");try{await page.waitForFunction(predicate,null,{timeout:20_000});}finally{await page.keyboard.up("KeyW");}};
  const reload=async()=>{await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);};
  const movie=()=>page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-nozomi-night-call"||window.storyProbe.sceneErrors.length,null,{timeout:60_000});
  if(!initial.character.storyFlags[call]){
    await page.evaluate(()=>window.storyProbe.lifecycle.travelToWorld("interior"));await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==="interior"&&window.storyProbe.lifecycle.worldRuntime.ready);await idle();
    if(!(await saved()).character.storyFlags[rest]){
      // Daytime foyer entry must not manufacture a call. Advance to evening
      // through the ordinary personal waiting UI, then approach the bed.
      await reset([-17.6,0,3]);await page.waitForTimeout(750);await idle();await check();
      expect(await page.evaluate(()=>window.storyProbe.starts.includes("story-s1-nozomi-night-call"))).toBe(false);
      if(new Date((await saved()).character.storyTimeMs).getUTCHours()<20){await page.locator("#story-wait-button").click();await page.getByRole("option",{name:"Wait until 8 p.m.",exact:true}).click();await page.getByRole("button",{name:"Wait until 8 p.m.",exact:true}).click();await idle();}
      const bed=async()=>{await reset([-17.6,0,3],Math.PI);await walk(()=>window.storyProbe.regions.controller.status==="options");};
      await bed();await page.getByRole("button",{name:"Stay awake",exact:true}).click();await idle();expect((await check()).character.storyFlags[rest]).not.toBe(true);
      await bed();await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-nozomi-rest-cancel"));await idle();expect((await check()).character.storyFlags[rest]).not.toBe(true);
      await bed();await page.getByRole("button",{name:"Rest for a while",exact:true}).click();await expect.poll(async()=>(await saved()).character.storyFlags[rest]).toBe(true);await idle();
      const wake=new Date((await check()).character.storyTimeMs);expect(wake.getUTCHours()).toBe(23);expect(wake.getUTCMinutes()).toBeGreaterThanOrEqual(45);expect(wake.getUTCMinutes()).toBeLessThan(48);
      await reload();await idle();expect((await check()).character.storyFlags[rest]).toBe(true);
    }
    await openStoryRoomDoor(page,{tag:"dor7",position:[-17.6,0,4.1]});
    const approach=async()=>{await reset([-17.6,0,4.1]);await walk(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-nozomi-night-call"||window.storyProbe.sceneErrors.length);await movie();await check();};
    console.info("Nozomi: saved same-date rest, real bedroom exit, original call cancellation and reload");
    await approach();await page.waitForTimeout(6000);await page.screenshot({path:testInfo.outputPath("nozomi-call-ine-san-warning.png")});
    await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-nozomi-call-cancel"));await idle();await check();
    await reload();await movie();await check();
    console.info("Nozomi: natural original call ending and independent saved notebook, no rescue grant");
    await page.waitForTimeout(43000);await page.screenshot({path:testInfo.outputPath("nozomi-call-ryo-telephone.png")});await check();
    await expect.poll(async()=>(await saved()).character.storyFlags[call],{timeout:75_000,intervals:[1000]}).toBe(true);await idle();await check(true);
    expect(musicResponses.some(r=>r.url.includes("bgm063")&&[200,206].includes(r.status))).toBe(true);
  }
  await check(true);await reload();await idle();await check(true);
  expect(await page.evaluate(()=>window.storyProbe.starts.includes("story-s1-nozomi-night-call"))).toBe(false);
  await page.locator("button").filter({hasText:/^Notebook$/}).click();for(let i=0;i<160&&await page.locator("#journal-next").isEnabled();i++)await page.locator("#journal-next").click();
  await expect(page.locator("#journal-page-copy")).toContainText("Nozomi has been kidnapped!");await page.screenshot({path:testInfo.outputPath("nozomi-call-earned-notebook-reload.png")});await page.locator("#journal-close").click();await idle();
}
