import {expect} from "@playwright/test";

// Start at the genuinely earned rescue. Every scene acknowledgement, time and
// destination crosses the real server; no future progress is injected.
export async function verifyNozomiHome(page,testInfo,character,{musicResponses}){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved(),flag=id=>`story.s1.${id}.completed`;
  expect(initial.character.storyFlags[flag("nozomi-rescue")]).toBe(true);
  const errors=async()=>expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const economy=async()=>{const s=await saved();expect(s.character.yen).toBe(initial.character.yen);expect(s.inventory).toEqual(initial.inventory);expect(s.character.storyFlags["story.s1.final-battle.completed"]).not.toBe(true);await errors();return s;};
  const reload=async()=>{
    await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();
    await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();
    await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);
  };
  const choose=async name=>{await page.getByRole("button",{name,exact:true}).click({timeout:90_000});await errors();};
  const slot=async n=>{await page.waitForFunction(n=>window.storyProbe.homeActivities?.some(a=>a.slot===n)||window.storyProbe.sceneErrors.length,n,{timeout:150_000});await errors();};
  if(!initial.character.storyFlags[flag("nozomi-home")]){
  if((await saved()).character.worldId!=="nbik-home"){
    console.info("Nozomi home: decline admission, reload, confirmed original road arrival");
    await choose("Leave it for now");expect((await economy()).character.storyFlags[flag("nozomi-home")]).not.toBe(true);
    await reload();await choose("Take Nozomi home");
  }
  await slot(0);await page.waitForTimeout(3000);await page.screenshot({path:testInfo.outputPath("nozomi-home-original-conversation.png")});
  console.info("Nozomi home: cancel original program, saved cinematic-world reload/retry");
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("ride-home-cancel"));
  expect((await economy()).character.storyFlags[flag("nozomi-home")]).not.toBe(true);
  await reload();await slot(0);
  const skip=process.env.NEW_YOKOSUKA_NOZOMI_HOME_SKIP_E2E==="true";
  if(skip){
    console.info("Nozomi home: supported explicit program skip");await page.keyboard.press("KeyX");
  }else{
  console.info("Nozomi home: natural23-clip sequence and original CD audio");
  await slot(1);
  await expect.poll(()=>page.evaluate(()=>{const m=window.storyMusic?.director,a=m?.current?.audio;return m?.current?.trackId==="nozomi-home"&&!a.paused&&a.currentTime>1&&a.volume>0;}),{timeout:15_000}).toBe(true);
  await slot(4);await page.waitForTimeout(6000);await page.screenshot({path:testInfo.outputPath("nozomi-home-original-paired-riding.png")});
  await slot(19);await page.waitForTimeout(1000);await page.screenshot({path:testInfo.outputPath("nozomi-home-original-embrace.png")});
  }
  await expect.poll(async()=>(await saved()).character.storyFlags[flag("nozomi-home")],{timeout:100_000}).toBe(true);
  if(!skip)expect(await page.evaluate(()=>window.storyProbe.homeActivities.map(a=>a.slot))).toEqual(Array.from({length:23},(_,i)=>i));
  const home=await economy();expect(home.character.worldId).toBe("interior");expect(home.character.storyFlags["notebook.s1.nozomi-home"]).toBe(true);
  const date=new Date(home.character.storyTimeMs);expect(date.getUTCHours()).toBe(5);expect(date.getUTCMinutes()).toBe(56);
  expect(date.toISOString().slice(0,10)).toBe(new Date(initial.character.storyTimeMs).toISOString().slice(0,10));
  if(!skip){const responses=musicResponses.filter(r=>r.url.includes("nozomi-home-cdda05"));expect(responses.some(r=>r.status===200||r.status===206),JSON.stringify(responses)).toBe(true);}
  }
  console.info("Nozomi home: separate bedside stay/reload/sleep and next07:30 save");
  await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==="interior"&&window.storyProbe.lifecycle.worldRuntime.ready);
  await page.waitForTimeout(2000);
  console.info("Bedside state",JSON.stringify(await page.evaluate(()=>{const p=window.storyProbe,r=p.regions,c=r.getCharacter();return{frame:p.lastRegionFrame,status:r.controller.status,inside:[...r.inside],character:{id:c.id,mode:c.playMode,opening:c.openingCompleted,home:c.storyFlags?.["story.s1.nozomi-home.completed"],rest:c.storyFlags?.["story.s1.final-morning.completed"]}};})));
  await choose("Stay awake");expect((await economy()).character.storyFlags[flag("final-morning")]).not.toBe(true);
  await reload();expect(await page.evaluate(()=>window.storyProbe.starts.includes("story-s1-nozomi-home"))).toBe(false);
  await choose("Sleep until 7:30 a.m.");
  await expect.poll(async()=>(await saved()).character.storyFlags[flag("final-morning")]).toBe(true);
  const wake=await economy(),morning=new Date(wake.character.storyTimeMs);expect(wake.character.worldId).toBe("interior");expect(morning.getUTCHours()).toBe(7);expect(morning.getUTCMinutes()).toBeGreaterThanOrEqual(30);expect(morning.getUTCMinutes()).toBeLessThan(32);expect(morning.toISOString().slice(0,10)).toBe(new Date(initial.character.storyTimeMs).toISOString().slice(0,10));
  await reload();await page.waitForTimeout(2500);await economy();
  expect(await page.evaluate(()=>window.storyProbe.starts)).toEqual([]);
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  await page.screenshot({path:testInfo.outputPath("nozomi-home-saved-final-morning.png")});
}
