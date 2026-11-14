import {expect} from "@playwright/test";
import regions from "../../play/data/story-regions.json" with {type:"json"};

// Only the genuinely earned post-battle morning is resumed. No flags, dates,
// gifts or authority outcomes are manufactured by this browser continuation.
export async function verifyFamilyDeparture(page,testInfo,character,{musicResponses}){
  await page.setViewportSize({width:1920,height:1080});
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved(),done="story.s1.family-departure.completed",note="notebook.s1.family-departure";
  expect(initial.character.storyFlags["story.s1.departure-rest.completed"]).toBe(true);
  const check=async()=>{const s=await saved();for(const key of ["yen","currentHp","maxHp"])expect(s.character[key]).toBe(initial.character[key]);expect(s.inventory).toEqual(initial.inventory);
    expect(s.character.storyFlags["story.s1.departure.completed"]).not.toBe(true);expect(s.character.storyFlags["story.s1.final-chai.completed"]).not.toBe(true);
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return s;};
  const choose=name=>page.getByRole("button",{name,exact:true}).click({timeout:90_000});
  const reload=async()=>{await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);};
  const scene=()=>page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-family-departure"||window.storyProbe.sceneErrors.length,null,{timeout:90_000});
  const stage=()=>page.evaluate(()=>{const s=window.storyProbe.lifecycle.getController().camera.getScene();return [...s.meshes,...s.transformNodes].filter(n=>/^RM\d\d$/.test(n.metadata?.nativeAseqPersistentSceneObject)&&!n.isDisposed()&&n.isEnabled()).length;});
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);await check();};
  const declinePendingDock=async(stage)=>{
    const region=regions.regions.find(region=>region.id==="s1.mfsy.departure-harbor");
    expect(region,"Missing published departure-harbor region").toBeDefined();
    const before=await check(),c=before.character;
    if(c.playMode!==region.playMode||c.openingCompleted!==true||c.worldId!==region.worldId||
      !region.requiredFlags.every(flag=>c.storyFlags[flag]===true)||c.storyFlags[region.completedFlag]===true)return;
    const handoff=await page.evaluate(({worldId,min,max})=>{
      const l=window.storyProbe.lifecycle,position=l.getController().actorRoot.position.asArray();
      return {world:l.worldRuntime.activeWorld.id,ready:l.worldRuntime.ready,position,
        inside:l.worldRuntime.activeWorld.id===worldId&&position.every((value,i)=>value>=min[i]&&value<=max[i])};
    },region);
    if(!handoff.inside)return;
    expect(handoff.ready).toBe(true);
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.active?.scriptIdentity?.scriptSlug),{timeout:45_000}).toBe("story-s1-departure-harbor");
    await expect(page.getByRole("button",{name:"Meet Master Chen",exact:true})).toBeVisible();
    await page.getByRole("button",{name:"Explore the harbor first",exact:true}).click();await idle();
    const after=await check();expect(after.character.storyFlags).toEqual(before.character.storyFlags);expect(after.inventory).toEqual(before.inventory);
    for(const key of ["yen","currentHp","maxHp","worldId","playMode"])expect(after.character[key]).toBe(before.character[key]);
    expect(after.character.storyFlags[region.completedFlag]).not.toBe(true);
    console.info("Family departure: declined exact dock offer without effects",JSON.stringify({stage,...handoff}));
  };
  if(!initial.character.storyFlags[done]){
  console.info("Family departure: original YDMA film, local scenery lease, cancellation/retry, separate home departure");
  await choose("Stay in Yokosuka for now");expect((await check()).character.storyFlags[done]).not.toBe(true);
  await reload();await choose("Leave for the harbor");await scene();await page.waitForTimeout(16000);
  expect(await stage()).toBe(10);await page.screenshot({path:testInfo.outputPath("family-original-fuku-gift-and-scenery.png")});
  expect((await check()).character.storyFlags[done]).not.toBe(true);
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("family-departure-cancel"));
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  expect(await stage()).toBe(0);const cancelled=await check();expect(cancelled.character.worldId).toBe("interior");expect(cancelled.character.storyFlags[done]).not.toBe(true);expect(cancelled.character.storyFlags[note]).not.toBe(true);
  await page.screenshot({path:testInfo.outputPath("family-cancel-restores-bedroom-without-scenery-leak.png")});
  await reload();await choose("Leave for the harbor");await scene();
  await expect.poll(()=>page.evaluate(()=>{const m=window.storyMusic?.director,a=m?.current?.audio;return m?.current?.trackId==="bgm107"&&!a.paused&&a.currentTime>1&&a.volume>0;}),{timeout:15000}).toBe(true);
  // The original final Ine-san shot starts around69s. An earlier43s capture
  // showed only the house; don't mistake loaded actors for visible ones.
  await page.waitForTimeout(71000);await page.screenshot({path:testInfo.outputPath("family-original-ine-san-farewell.png")});
  await expect.poll(async()=>(await saved()).character.storyFlags[done],{timeout:60000}).toBe(true);
  await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.ready&&window.storyProbe.lifecycle.worldRuntime.activeWorld.id==="mfsy",null,{timeout:90000});
  }
  const final=await check();expect(final.character.storyFlags[done]).toBe(true);expect(final.character.storyFlags[note]).toBe(true);expect(final.character.worldId).toBe("mfsy");
  expect(final.character.storyFlags["story.s1.departure-harbor.completed"]).not.toBe(true);
  await declinePendingDock("completion");await idle();
  expect(new Date(final.character.storyTimeMs).toISOString().slice(0,10)).toBe(new Date(initial.character.storyTimeMs).toISOString().slice(0,10));
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  await page.screenshot({path:testInfo.outputPath("family-earned-harbor-arrival.png")});
  await reload();await page.waitForTimeout(1500);await check();expect(await page.evaluate(()=>window.storyProbe.starts)).toEqual([]);
  await declinePendingDock("reload");await idle();
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  if(!initial.character.storyFlags[done])expect(musicResponses.some(r=>r.url.includes("bgm107")&&[200,206].includes(r.status))).toBe(true);
}
