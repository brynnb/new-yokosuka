import {expect} from "@playwright/test";
import {fightWithKeyboard} from "./story-seventy-man.js";

export async function verifyShipDeparture(page,testInfo,character,{musicResponses}){
  await page.setViewportSize({width:1920,height:1080});
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved(),done="story.s1.departure.completed";
  for(const flag of ["story.s1.chen-introduction-letter.completed","story.s1.nozomi-amulet.completed"])expect(initial.character.storyFlags[flag]).toBe(true);
  expect(initial.character.storyFlags[done]).not.toBe(true);
  const check=async()=>{const s=await saved();expect(s.character.yen).toBe(initial.character.yen);expect(s.inventory).toEqual(initial.inventory);expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return s;};
  const pending=async()=>{const s=await check();expect(s.character.storyFlags).toEqual(initial.character.storyFlags);expect(s.character.worldId).toBe("mend");return s;};
  const choose=name=>page.getByRole("button",{name,exact:true}).click({timeout:100_000});
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);};
  const reload=async()=>{await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);};
  const scene=async part=>{await page.waitForFunction(part=>{const p=window.storyProbe,c=p.director?.activeCutscene;return (part==="boarding"?c?.cutscene.id==="story-s1-ship-boarding":c?.cutscene.id==="story-s1-ship-sailing"&&c.packageRuntime.activityRuntime.active?.record.activityId===`ENDAUTH/SEQDATA${({deck:"1",leaving:"7",farewell:"8",horizon:"9"})[part]}.AUTH`)||p.sceneErrors.length;},part,{timeout:100_000});await pending();};
  const cancel=async()=>{await page.evaluate(()=>window.storyProbe.regions.controller.cancel("ship-departure-check"));await idle();await pending();};
  const skip=process.env.NEW_YOKOSUKA_SHIP_SKIP_E2E==="true";
  console.info("Ship departure: original boarding/sailing, cancellation at the dock and acknowledged shipboard save");
  await choose("Not yet");await pending();await reload();await choose("Sail to Hong Kong");await scene("boarding");
  await expect.poll(()=>page.evaluate(()=>{const m=window.storyMusic?.director,a=m?.current?.audio;return m?.current?.trackId==="bgm095"&&!a.paused&&a.currentTime>1&&a.volume>0;}),{timeout:15000}).toBe(true);
  await page.waitForTimeout(8000);await page.screenshot({path:testInfo.outputPath("ship-original-boarding-cancel.png")});await cancel();
  await page.screenshot({path:testInfo.outputPath("ship-cancel-restored-earned-dock.png")});
  if(skip){
    console.info("Ship departure: supported explicit program skip, after cancelled program and reload");
    await reload();await choose("Sail to Hong Kong");await scene("boarding");await page.keyboard.press("KeyX");await scene("deck");await page.waitForTimeout(1200);await cancel();
    await reload();await choose("Sail to Hong Kong");await scene("boarding");await page.keyboard.press("KeyX");await scene("deck");await page.waitForTimeout(1200);await page.keyboard.press("KeyX");
  }else{
  await reload();await choose("Sail to Hong Kong");await scene("boarding");await scene("deck");
  await page.waitForTimeout(1800);await page.screenshot({path:testInfo.outputPath("ship-original-deck.png")});
  const scoreTime=await page.evaluate(()=>window.storyMusic.director.current.audio.currentTime);await scene("leaving");
  await page.waitForTimeout(9000);expect(await page.evaluate(()=>window.storyMusic.director.current.audio.currentTime)).toBeGreaterThan(scoreTime+8);
  await page.screenshot({path:testInfo.outputPath("ship-original-leaving-and-scenery.png")});await scene("farewell");
  await page.waitForTimeout(8000);await page.screenshot({path:testInfo.outputPath("ship-original-chen-farewell-cancel.png")});await cancel();
  await reload();await choose("Sail to Hong Kong");await scene("boarding");await scene("deck");await scene("leaving");await scene("farewell");
  await page.waitForTimeout(1100);await page.screenshot({path:testInfo.outputPath("ship-original-farewell-opening.png")});await scene("horizon");
  await page.waitForTimeout(6000);await page.screenshot({path:testInfo.outputPath("ship-original-horizon-before-settlement.png")});await pending();
  }
  await expect.poll(async()=>(await saved()).character.storyFlags[done],{timeout:60_000}).toBe(true);
  await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.ready&&window.storyProbe.lifecycle.worldRuntime.activeWorld.id==="s1-voyage",null,{timeout:100_000});await idle();
  const earned=await check();expect(earned.character.storyFlags["notebook.s1.departure"]).toBe(true);expect(earned.character.worldId).toBe("s1-voyage");
  expect(Math.abs(earned.character.y-6.277686675037195)).toBeLessThan(.15);
  expect(new Date(earned.character.storyTimeMs).toISOString().slice(0,10)).toBe(new Date(initial.character.storyTimeMs).toISOString().slice(0,10));
  expect(Object.keys(earned.character.storyFlags).filter(k=>!Object.hasOwn(initial.character.storyFlags,k)).sort()).toEqual(["notebook.s1.departure",done].sort());
  await page.waitForTimeout(3000);expect(Math.abs((await saved()).character.y-earned.character.y)).toBeLessThan(.15);
  await page.screenshot({path:testInfo.outputPath("ship-earned-real-deck-and-controls.png")});
  await page.keyboard.down("KeyW");await page.waitForTimeout(250);await page.keyboard.up("KeyW");await page.waitForTimeout(1500);
  expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().actorRoot.position.y)).toBeGreaterThan(5);
  await reload();await idle();await check();expect((await saved()).character.worldId).toBe("s1-voyage");expect(await page.evaluate(()=>window.storyProbe.starts)).toEqual([]);
  await page.screenshot({path:testInfo.outputPath("ship-earned-reloaded-deck.png")});
  // Use the actual sidebar switches and full teardown/reload. No future
  // storyline flags, artificial dates or forced runtime destinations.
  const switchMode=async(mode,label)=>{await page.locator('[role="radio"]').filter({hasText:label}).click();await page.waitForFunction(mode=>window.storyProbe?.ready&&window.storyProbe.regions?.getCharacter()?.playMode===mode,mode,{timeout:100_000});await idle();};
  await switchMode("free_roam","Free roam");expect((await saved()).character.worldId).not.toBe("s1-voyage");
  await switchMode("story","Story mode");expect((await check()).character.worldId).toBe("s1-voyage");expect((await saved()).character.storyFlags[done]).toBe(true);
  expect(Math.abs((await saved()).character.y-earned.character.y)).toBeLessThan(.15);await page.screenshot({path:testInfo.outputPath("ship-after-free-roam-round-trip.png")});
  expect(musicResponses.some(r=>r.url.includes("bgm095")&&[200,206].includes(r.status))).toBe(true);
}

export async function verifyNozomiAmulet(page,testInfo,character,{musicResponses}){
  await page.setViewportSize({width:1920,height:1080});
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved(),done="story.s1.nozomi-amulet.completed";
  expect(initial.character.storyFlags["story.s1.chen-introduction-letter.completed"]).toBe(true);
  expect(initial.inventory.find(i=>i.key==="letter_of_introduction")?.quantity).toBe(1);
  expect(initial.character.storyFlags[done]).not.toBe(true);expect(initial.inventory.some(i=>i.key==="nozomi_amulet")).toBe(false);
  const check=async(earned=false)=>{const s=await saved();expect(s.character.yen).toBe(initial.character.yen);
    expect(s.inventory.filter(i=>i.key!=="nozomi_amulet")).toEqual(initial.inventory);
    expect(s.inventory.filter(i=>i.key==="nozomi_amulet").map(i=>i.quantity)).toEqual(earned?[1]:[]);
    expect(s.character.storyFlags["story.s1.departure.completed"]).not.toBe(true);
    expect(new Date(s.character.storyTimeMs).toISOString().slice(0,10)).toBe(new Date(initial.character.storyTimeMs).toISOString().slice(0,10));
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return s;
  };
  const choose=name=>page.getByRole("button",{name,exact:true}).click({timeout:100_000});
  const reload=async()=>{await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);};
  const scene=()=>page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-nozomi-amulet"||window.storyProbe.sceneErrors.length,null,{timeout:100_000});
  console.info("Nozomi amulet: original temporary scenery, cancellation, natural farewell and separate saved keepsake");
  await choose("Not yet");await check();await reload();await choose("Remember Nozomi's farewell");await scene();
  await page.waitForTimeout(23000);await page.screenshot({path:testInfo.outputPath("nozomi-original-amulet-memory-and-scenery.png")});await check();
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("amulet-check"));
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);await check();
  expect(Math.abs((await saved()).character.y)).toBeLessThan(.5);await page.screenshot({path:testInfo.outputPath("nozomi-cancel-restored-dock.png")});
  await reload();await choose("Remember Nozomi's farewell");await scene();
  await expect.poll(()=>page.evaluate(()=>{const m=window.storyMusic?.director,a=m?.current?.audio;return m?.current?.trackId==="bgm070"&&!a.paused&&a.currentTime>1&&a.volume>0;}),{timeout:15000}).toBe(true);
  await page.waitForTimeout(64000);await page.screenshot({path:testInfo.outputPath("nozomi-original-giving-the-amulet.png")});await check();
  await expect.poll(async()=>(await saved()).character.storyFlags[done],{timeout:120_000}).toBe(true);
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  expect((await check(true)).character.storyFlags["notebook.s1.nozomi-amulet"]).toBe(true);
  // See the documented Settings modal/accessibility limitation; use the real
  // existing Inventory button without changing its ancestors' ARIA state.
  await page.locator("#inventory-button").click();await expect(page.getByText("Nozomi's Amulet",{exact:true})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath("nozomi-earned-amulet-inventory.png")});await page.getByRole("button",{name:"Close inventory",exact:true}).click();
  await reload();await page.waitForTimeout(1200);await check(true);expect(await page.evaluate(()=>window.storyProbe.starts)).toEqual([]);
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  expect(Math.abs((await saved()).character.y)).toBeLessThan(.5);await page.screenshot({path:testInfo.outputPath("nozomi-earned-amulet-reload-and-controls.png")});
  expect(musicResponses.some(r=>r.url.includes("bgm070")&&[200,206].includes(r.status))).toBe(true);
}

export async function verifyEarnedIntroductionLetter(page,testInfo,character){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved();expect(initial.character.storyFlags["story.s1.chen-introduction-letter.completed"]).toBe(true);
  expect(initial.inventory.filter(i=>i.key==="letter_of_introduction").map(i=>i.quantity)).toEqual([1]);
  const following=page.getByRole("button",{name:"Not yet",exact:true});if(await following.isVisible())await following.click();
  // Persistent Settings content currently hides the sidebar from the ARIA
  // tree even while closed (docs/implementation/README.md). Use its real
  // button as other inventory tests do; do not mutate accessibility state.
  await page.locator("#inventory-button").click();
  await expect(page.getByText("Letter of Introduction",{exact:true})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath("chen-earned-introduction-letter-inventory.png")});
  await page.getByRole("button",{name:"Close inventory",exact:true}).click();
  expect((await saved()).inventory).toEqual(initial.inventory);
  expect(await page.evaluate(()=>window.storyProbe.starts)).toEqual([]);
  expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  await page.screenshot({path:testInfo.outputPath("chen-earned-letter-reload-and-controls.png")});
}

export async function verifyIntroductionLetter(page,testInfo,character,{musicResponses}){
  await page.setViewportSize({width:1920,height:1080});
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved(),done="story.s1.chen-introduction-letter.completed";
  expect(initial.character.storyFlags["story.s1.final-chai-counter.completed"]).toBe(true);
  expect(initial.character.storyFlags[done]).not.toBe(true);expect(initial.inventory.some(i=>i.key==="letter_of_introduction")).toBe(false);
  const check=async(earned=false)=>{const s=await saved();
    expect(s.character.yen).toBe(initial.character.yen);expect(s.inventory.filter(i=>i.key!=="letter_of_introduction")).toEqual(initial.inventory);
    expect(s.inventory.filter(i=>i.key==="letter_of_introduction").map(i=>i.quantity)).toEqual(earned?[1]:[]);
    expect(s.character.storyFlags["story.s1.departure.completed"]).not.toBe(true);
    expect(new Date(s.character.storyTimeMs).toISOString().slice(0,10)).toBe(new Date(initial.character.storyTimeMs).toISOString().slice(0,10));
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return s;
  };
  const choose=name=>page.getByRole("button",{name,exact:true}).click({timeout:100_000});
  const reload=async()=>{await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);};
  const scene=()=>page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-chen-introduction-letter"||window.storyProbe.sceneErrors.length,null,{timeout:100_000});
  console.info("Introduction letter: decline, original injury/farewell cancellation and independent inventory acknowledgement");
  await choose("Not yet");await check();await reload();await choose("Speak with Master Chen");await scene();
  await page.waitForTimeout(30000);await page.screenshot({path:testInfo.outputPath("chen-original-injured-gui-and-cancel.png")});await check();
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("letter-check"));
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);await check();
  await reload();await choose("Speak with Master Chen");await scene();
  await expect.poll(()=>page.evaluate(()=>{const m=window.storyMusic?.director,a=m?.current?.audio;return m?.current?.trackId==="bgm067"&&!a.paused&&a.currentTime>1&&a.volume>0;}),{timeout:15000}).toBe(true);
  await page.waitForTimeout(45000);await page.screenshot({path:testInfo.outputPath("chen-original-tao-li-shao-introduction.png")});await check();
  await expect.poll(async()=>(await saved()).character.storyFlags[done],{timeout:100_000}).toBe(true);
  const following=page.getByRole("button",{name:"Not yet",exact:true});if(await following.isVisible())await following.click();
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  const final=await check(true);expect(final.character.storyFlags["notebook.s1.tao-li-shao"]).toBe(true);
  await page.locator("#inventory-button").click();
  await expect(page.getByText("Letter of Introduction",{exact:true})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath("chen-earned-introduction-letter-inventory.png")});
  await page.getByRole("button",{name:"Close inventory",exact:true}).click();
  await reload();await page.waitForTimeout(1200);await check(true);
  if(await following.isVisible())await following.click();
  expect(await page.evaluate(()=>window.storyProbe.starts)).toEqual([]);
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  expect(Math.abs((await saved()).character.y)).toBeLessThan(.5);
  await page.screenshot({path:testInfo.outputPath("chen-earned-letter-reload-and-controls.png")});
  expect(musicResponses.some(r=>r.url.includes("bgm067")&&[200,206].includes(r.status))).toBe(true);
}

export async function verifyFinalChaiPresentation(page,testInfo,character){
  await page.setViewportSize({width:1920,height:1080});
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const before=await saved();expect(before.character.storyFlags["story.s1.final-chai-counter.completed"]).toBe(true);
  // This is a renderer-only continuation of an earned win, not another
  // narrative completion or a way to manufacture combat/QTE success.
  await page.evaluate(async()=>{
    const p=window.storyProbe,{ScriptEventPresentationCatalog}=await import("/play/scripts/ScriptEventPresentationCatalog.js");
    p.visualReturn=p.lifecycle.capturePlayerReturnState();
    if(!await p.director.start(new ScriptEventPresentationCatalog().activity("s1.mend.chai-counter-win.scene").cutscene))throw Error("Chai ending renderer review did not start");
  });
  try{
    await page.waitForTimeout(4400);await page.screenshot({path:testInfo.outputPath("final-chai-original-falling-late.png")});
    await page.waitForTimeout(200);await page.screenshot({path:testInfo.outputPath("final-chai-restored-dock-after-fall.png")});
  }finally{await page.evaluate(async()=>{const p=window.storyProbe;await p.director.end("renderer-review-cancel");p.lifecycle.restorePlayerPose(p.visualReturn);delete p.visualReturn;});}
  const after=await saved();expect(after.character.storyFlags).toEqual(before.character.storyFlags);expect(after.character.yen).toBe(before.character.yen);expect(after.inventory).toEqual(before.inventory);
  expect(Math.hypot(after.character.x-before.character.x,after.character.z-before.character.z)).toBeLessThan(.2);
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
}

export async function verifyFinalChai(page,testInfo,character,{musicResponses}){
  await page.setViewportSize({width:1920,height:1080});
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved(),battle="story.s1.final-chai.completed",counter="story.s1.final-chai-counter.completed";
  expect(initial.character.storyFlags["story.s1.swallow-flip.completed"]).toBe(true);expect(initial.character.storyFlags[battle]).not.toBe(true);
  const check=async()=>{const s=await saved();expect(s.character.yen).toBe(initial.character.yen);expect(s.inventory).toEqual(initial.inventory);
    expect(s.character.storyFlags["story.s1.departure.completed"]).not.toBe(true);expect(s.character.storyFlags["notebook.s1.tao-li-shao"]).not.toBe(true);
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return s;};
  const choose=name=>page.getByRole("button",{name,exact:true}).click({timeout:100_000});
  const reload=async()=>{await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);};
  const scene=async id=>{await page.waitForFunction(id=>window.storyProbe.director?.activeCutscene?.cutscene.id===`story-s1-${id}`||window.storyProbe.sceneErrors.length,id,{timeout:100_000});await check();};
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);await check();};
  const cancel=async()=>{await page.evaluate(()=>window.storyProbe.regions.controller.cancel("final-chai-check"));await idle();};
  const combatReady=async()=>{await page.waitForFunction(()=>window.storyProbe.combatRuntime?.active?.view.id==="s1.mend.final-chai"&&window.storyProbe.combatRuntime.active.view.ready||window.storyProbe.sceneErrors.length,null,{timeout:100_000});await check();};
  const fight=()=>fightWithKeyboard(page,()=>page.evaluate(()=>!window.storyProbe.combatRuntime?.active));
  const ready=async()=>{await page.waitForFunction(()=>window.storyProbe.regions.controller.active?.challengePrompt?.id==="s1.mend.chai-last-attack"&&window.storyProbe.regions.controller.active.challengePrompt.ready||window.storyProbe.sceneErrors.length,null,{timeout:60000});await check();};
  const winCounter=async()=>{for(const [index,key]of ["ArrowDown","Enter","Enter","Shift"].entries()){
    await page.waitForFunction(index=>window.storyProbe.regions.controller.active?.challengePrompt?.ready&&window.storyProbe.regions.controller.active.challengePrompt.index===index,index);await page.keyboard.press(key);
  }};
  console.info("Final Chai: original ambush, actual battle, cancelled questioning and independent saved victory");
  await choose("Not yet");await reload();await choose("Stop Chai");await scene("final-chai-intro");await page.waitForTimeout(9000);
  await page.screenshot({path:testInfo.outputPath("final-chai-original-beam-ambush.png")});await cancel();
  expect((await check()).character.storyFlags[battle]).not.toBe(true);
  await reload();await choose("Stop Chai");await scene("final-chai-intro");await combatReady();
  await fightWithKeyboard(page,()=>page.evaluate(()=>window.storyProbe.combatRuntime?.active?.view.actors.find(a=>a.tag==="CHAI")?.health<=142));
  await page.screenshot({path:testInfo.outputPath("final-chai-original-fight-and-partial-damage.png")});await cancel();
  await reload();await choose("Stop Chai");await scene("final-chai-intro");await page.keyboard.press("KeyX");await combatReady();
  await expect.poll(()=>page.evaluate(()=>{const m=window.storyMusic?.director,a=m?.current?.audio;return m?.current?.trackId==="bgm032"&&!a.paused&&a.currentTime>1&&a.volume>0;}),{timeout:15000}).toBe(true);
  await fight();await scene("final-chai-interrogation");await page.waitForTimeout(6500);
  await page.screenshot({path:testInfo.outputPath("final-chai-original-questioning-cancel.png")});expect((await check()).character.storyFlags[battle]).not.toBe(true);await cancel();
  await reload();await choose("Stop Chai");await scene("final-chai-intro");await page.keyboard.press("KeyX");await combatReady();await fight();await scene("final-chai-interrogation");
  await expect.poll(async()=>(await saved()).character.storyFlags[battle],{timeout:60000}).toBe(true);
  await choose("Not yet");await idle();const victory=await check();expect(victory.character.storyFlags[counter]).not.toBe(true);expect(victory.character.storyFlags["notebook.s1.final-chai"]).toBe(true);
  expect(Math.hypot(victory.character.x+71.01832580566406,victory.character.z-21.592845916748047)).toBeLessThan(.2);expect(Math.abs(victory.character.y)).toBeLessThan(.5);
  await page.screenshot({path:testInfo.outputPath("final-chai-earned-waterfront-arrival.png")});
  console.info("Final Chai: independent counter, wrong/expired input, cancelled winning film and saved retry");
  await reload();await choose("Face Chai's last attack");await scene("chai-counter-ready");await ready();
  await page.screenshot({path:testInfo.outputPath("final-chai-original-held-counter-and-harbor.png")});await cancel();
  expect((await check()).character.storyFlags[battle]).toBe(true);expect((await check()).character.storyFlags[counter]).not.toBe(true);
  await reload();await choose("Face Chai's last attack");await scene("chai-counter-ready");await ready();await page.keyboard.press("ArrowLeft");
  await choose("Try again");await ready();await choose("Try again");await ready();await winCounter();await scene("chai-counter-win");await page.waitForTimeout(1700);
  await page.screenshot({path:testInfo.outputPath("final-chai-original-counter-ending-cancel.png")});await cancel();expect((await check()).character.storyFlags[counter]).not.toBe(true);
  await reload();await choose("Face Chai's last attack");await scene("chai-counter-ready");await ready();await winCounter();await scene("chai-counter-win");
  await page.waitForTimeout(3300);await page.screenshot({path:testInfo.outputPath("final-chai-original-water-fall.png")});
  await expect.poll(async()=>(await saved()).character.storyFlags[counter],{timeout:30000}).toBe(true);
  const following=page.getByRole("button",{name:"Not yet",exact:true});if(await following.isVisible())await following.click();
  await idle();const final=await check();expect(final.character.storyFlags["notebook.s1.chai-last-attack"]).toBe(true);
  expect(new Date(final.character.storyTimeMs).toISOString().slice(0,10)).toBe(new Date(initial.character.storyTimeMs).toISOString().slice(0,10));
  await reload();await page.waitForTimeout(1200);if(await following.isVisible())await following.click();await idle();expect(await page.evaluate(()=>window.storyProbe.starts)).toEqual([]);
  await page.screenshot({path:testInfo.outputPath("final-chai-earned-counter-reload-and-controls.png")});
  expect(musicResponses.some(r=>r.url.includes("bgm032")&&[200,206].includes(r.status))).toBe(true);
}

export async function verifySwallowPresentation(page,testInfo,character){
  await page.setViewportSize({width:1920,height:1080});
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const before=await saved();expect(before.character.worldId).toBe("mend");
  // Renderer-only review after a legitimately completed lesson. It is not a
  // second narrative outcome and cannot bypass server progress authority.
  await page.evaluate(async()=>{
    const p=window.storyProbe,{ScriptEventPresentationCatalog}=await import("/play/scripts/ScriptEventPresentationCatalog.js");
    p.visualReturn=p.lifecycle.capturePlayerReturnState();
    if(!await p.director.start(new ScriptEventPresentationCatalog().activity("s1.mend.swallow-intro.scene").cutscene))throw Error("Swallow Flip renderer review did not start");
  });
  try{await page.waitForTimeout(28000);await page.screenshot({path:testInfo.outputPath("swallow-original-cast-one-grounded-bag.png")});}
  finally{await page.evaluate(async()=>{const p=window.storyProbe;await p.director.end("renderer-review-cancel");p.lifecycle.restorePlayerPose(p.visualReturn);delete p.visualReturn;});}
  const after=await saved();expect(after.character.storyFlags).toEqual(before.character.storyFlags);expect(after.character.yen).toBe(before.character.yen);expect(after.inventory).toEqual(before.inventory);
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  await page.screenshot({path:testInfo.outputPath("swallow-render-review-restored-dock.png")});
}

// Continue only the genuinely earned family-farewell save. Never manufacture
// arrival, mastery, date, inventory or final-battle outcomes for this check.
export async function verifySwallowFlip(page,testInfo,character,{musicResponses}){
  await page.setViewportSize({width:1920,height:1080});
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved(),arrival="story.s1.departure-harbor.completed",done="story.s1.swallow-flip.completed",learned="story.s1.swallow-flip.learned";
  expect(initial.character.storyFlags["story.s1.family-departure.completed"]).toBe(true);
  expect(initial.character.storyFlags[done]).not.toBe(true);
  const check=async()=>{const s=await saved();expect(s.character.yen).toBe(initial.character.yen);expect(s.inventory).toEqual(initial.inventory);
    for(const flag of ["story.s1.final-chai.completed","story.s1.departure.completed"])expect(s.character.storyFlags[flag]).not.toBe(true);
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return s;};
  const pending=async()=>{const s=await check();for(const flag of [done,learned,"notebook.s1.swallow-flip"])expect(s.character.storyFlags[flag]).not.toBe(true);};
  const choose=name=>page.getByRole("button",{name,exact:true}).click({timeout:100_000});
  const reload=async()=>{await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);};
  const scene=async part=>{await page.waitForFunction(part=>window.storyProbe.director?.activeCutscene?.cutscene.id===`story-s1-swallow-${part}`||window.storyProbe.sceneErrors.length,part,{timeout:120_000});await pending();};
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);await check();};
  const cancel=async()=>{await page.evaluate(()=>window.storyProbe.regions.controller.cancel("swallow-flip-check"));await idle();await pending();};
  const ready=async()=>{await page.waitForFunction(()=>window.storyProbe.regions.controller.active?.challengePrompt?.id==="s1.mend.swallow-flip"&&window.storyProbe.regions.controller.active.challengePrompt.ready||window.storyProbe.sceneErrors.length,null,{timeout:160_000});await pending();};
  const win=async()=>{for(const [index,key]of ["ArrowDown","j","Enter"].entries()){
    await page.waitForFunction(index=>window.storyProbe.regions.controller.active?.challengePrompt?.ready&&window.storyProbe.regions.controller.active.challengePrompt.index===index,index);
    await page.keyboard.press(key);
  }};
  console.info("Final departure: independent dock admission, original lesson, actual input and acknowledged mastery");
  await choose("Explore the harbor first");expect((await check()).character.storyFlags[arrival]).not.toBe(true);
  await reload();await choose("Meet Master Chen");
  await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.ready&&window.storyProbe.lifecycle.worldRuntime.activeWorld.id==="mend",null,{timeout:100_000});
  expect((await check()).character.storyFlags[arrival]).toBe(true);
  await choose("Not yet");await idle();await page.waitForTimeout(1200);
  const dock=await check();expect(dock.character.worldId).toBe("mend");expect(Math.abs(dock.character.y)).toBeLessThan(.5);
  await page.screenshot({path:testInfo.outputPath("departure-original-dock-arrival.png")});
  await reload();await choose("Learn from Master Chen");await scene("intro");await page.waitForTimeout(28000);
  await page.screenshot({path:testInfo.outputPath("swallow-original-chen-gui-and-ryo-cancel.png")});await cancel();
  await reload();await choose("Learn from Master Chen");await scene("intro");
  await expect.poll(()=>page.evaluate(()=>{const m=window.storyMusic?.director,a=m?.current?.audio;return m?.current?.trackId==="bgm064"&&!a.paused&&a.currentTime>1&&a.volume>0;}),{timeout:15000}).toBe(true);
  await scene("demo");await page.waitForTimeout(16000);await page.screenshot({path:testInfo.outputPath("swallow-original-form-demonstration.png")});
  await ready();await page.screenshot({path:testInfo.outputPath("swallow-original-held-cast-and-input.png")});
  await page.keyboard.press("Shift");await choose("Try again");await ready();
  // Deliberately expire this attempt; a fresh prompt must be earned by retry.
  await choose("Try again");await ready();await win();await scene("flip");
  await page.waitForTimeout(4000);await page.screenshot({path:testInfo.outputPath("swallow-original-successful-throw.png")});
  await scene("praise");await choose("I'm ready to go");await scene("exit");await cancel();
  await reload();await choose("Learn from Master Chen");await scene("intro");await page.keyboard.press("KeyX");
  await scene("demo");await page.keyboard.press("KeyX");await ready();await win();
  await scene("flip");await scene("praise");await choose("I'm ready to go");await scene("exit");
  await expect.poll(async()=>(await saved()).character.storyFlags[done],{timeout:60000}).toBe(true);
  const final=await check();expect(final.character.storyFlags[learned]).toBe(true);expect(final.character.storyFlags["notebook.s1.swallow-flip"]).toBe(true);
  expect(new Date(final.character.storyTimeMs).toISOString().slice(0,10)).toBe(new Date(initial.character.storyTimeMs).toISOString().slice(0,10));
  await idle();await reload();await page.waitForTimeout(1200);
  // The newly published following ambush may offer its normal confirmation;
  // declining it is not replaying the completed lesson or granting a fight.
  const following=page.getByRole("button",{name:"Not yet",exact:true});if(await following.isVisible())await following.click();
  await idle();expect(await page.evaluate(()=>window.storyProbe.starts)).toEqual([]);
  await page.screenshot({path:testInfo.outputPath("swallow-earned-dock-reload-and-controls.png")});
  expect(musicResponses.some(r=>r.url.includes("bgm064")&&[200,206].includes(r.status))).toBe(true);
}
