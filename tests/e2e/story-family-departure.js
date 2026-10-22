import {expect} from "@playwright/test";

// Only the genuinely earned post-battle morning is resumed. No flags, dates,
// gifts or authority outcomes are manufactured by this browser continuation.
export async function verifyFamilyDeparture(page,testInfo,character,{musicResponses}){
  await page.setViewportSize({width:1920,height:1080});
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved(),done="story.s1.family-departure.completed",note="notebook.s1.family-departure";
  expect(initial.character.storyFlags["story.s1.departure-rest.completed"]).toBe(true);
  expect(initial.character.storyFlags[done]).not.toBe(true);
  const check=async()=>{const s=await saved();expect(s.character.yen).toBe(initial.character.yen);expect(s.inventory).toEqual(initial.inventory);
    expect(s.character.storyFlags["story.s1.departure.completed"]).not.toBe(true);expect(s.character.storyFlags["story.s1.final-chai.completed"]).not.toBe(true);
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return s;};
  const choose=name=>page.getByRole("button",{name,exact:true}).click({timeout:90_000});
  const reload=async()=>{await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);};
  const scene=()=>page.waitForFunction(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-family-departure"||window.storyProbe.sceneErrors.length,null,{timeout:90_000});
  const stage=()=>page.evaluate(()=>{const s=window.storyProbe.lifecycle.getController().camera.getScene();return [...s.meshes,...s.transformNodes].filter(n=>/^RM\d\d$/.test(n.metadata?.nativeAseqPersistentSceneObject)&&!n.isDisposed()&&n.isEnabled()).length;});
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
  const final=await check();expect(final.character.storyFlags[note]).toBe(true);expect(final.character.worldId).toBe("mfsy");
  expect(new Date(final.character.storyTimeMs).toISOString().slice(0,10)).toBe(new Date(initial.character.storyTimeMs).toISOString().slice(0,10));
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  await page.screenshot({path:testInfo.outputPath("family-earned-harbor-arrival.png")});
  await reload();await page.waitForTimeout(1500);await check();expect(await page.evaluate(()=>window.storyProbe.starts)).toEqual([]);
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  expect(musicResponses.some(r=>r.url.includes("bgm107")&&[200,206].includes(r.status))).toBe(true);
}
