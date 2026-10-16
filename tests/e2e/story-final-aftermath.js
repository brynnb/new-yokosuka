import {expect} from "@playwright/test";

// Continue actual earned70-man victory; no progress, date or QTE outcome is
// inserted. Film skips are normal input, never substitutes for the A prompt.
export async function verifyFinalAftermath(page,testInfo,character,{musicResponses}){
  await page.setViewportSize({width:1920,height:1080});
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved(),flag=id=>`story.s1.${id}.completed`;
  expect(initial.character.storyFlags[flag("seventy-man")]).toBe(true);
  const check=async()=>{const s=await saved();expect(s.character.yen).toBe(initial.character.yen);expect(s.inventory).toEqual(initial.inventory);
    expect(s.character.storyFlags[flag("departure")]).not.toBe(true);expect(s.character.storyFlags[flag("final-chai")]).not.toBe(true);
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return s;};
  const choose=name=>page.getByRole("button",{name,exact:true}).click({timeout:90_000});
  const reload=async()=>{await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);};
  const scene=async id=>{await page.waitForFunction(id=>window.storyProbe.director?.activeCutscene?.cutscene.id===`story-s1-${id}`||window.storyProbe.sceneErrors.length,id,{timeout:90_000});await check();};
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);await check();};
  const cancel=async()=>{await page.evaluate(()=>window.storyProbe.regions.controller.cancel("final-aftermath-cancel"));await idle();};
  const ready=async()=>{await page.waitForFunction(()=>window.storyProbe.regions.controller.active?.challengePrompt?.id==="s1.mfbt.terry-finisher"&&window.storyProbe.regions.controller.active.challengePrompt.ready||window.storyProbe.sceneErrors.length,null,{timeout:60_000});await check();};
  const music=async id=>{await expect.poll(()=>page.evaluate(id=>{const m=window.storyMusic?.director,a=m?.current?.audio;return m?.current?.trackId===id&&!a.paused&&a.currentTime>1&&a.volume>0;},id),{timeout:15000}).toBe(true);};
  const staged=async id=>{await page.waitForFunction(id=>window.storyProbe.authoredScene?.active?.scene.id===`s1.mfbt.${id}`||window.storyProbe.sceneErrors.length,id,{timeout:30_000});await check();};
  if(!(await saved()).character.storyFlags[flag("terry-interrogation")]){
    console.info("Final aftermath: original Terry approach, decline/cancellation, real A input and independent interrogation");
    await choose("Leave it for now");expect((await check()).character.storyFlags[flag("terry-interrogation")]).not.toBe(true);
    await reload();await choose("Confront Terry");await scene("terry-final-intro");await music("bgm120");await page.waitForTimeout(8000);
    await page.screenshot({path:testInfo.outputPath("terry-original-final-approach-and-correct-body.png")});await cancel();
    await reload();await choose("Confront Terry");await scene("terry-final-intro");await ready();
    await page.screenshot({path:testInfo.outputPath("terry-held-original-a-prompt.png")});await cancel();
    await reload();await choose("Confront Terry");await scene("terry-final-intro");await page.keyboard.press("KeyX");await ready();
    await page.keyboard.press("Shift");await staged("terry-finisher-failure");await page.waitForTimeout(3000);
    await page.screenshot({path:testInfo.outputPath("terry-original-failed-response-motion.png")});
    await choose("Try again");await ready();const expired=await page.evaluate(()=>window.storyProbe.regions.controller.active.challengePrompt.token);
    await choose("Try again");await ready();expect(await page.evaluate(()=>window.storyProbe.regions.controller.active.challengePrompt.token)).not.toBe(expired);
    await page.keyboard.press("Enter");await staged("terry-finisher-win");await page.waitForTimeout(3000);
    await page.screenshot({path:testInfo.outputPath("terry-original-winning-motion-fragment.png")});
    await scene("terry-final-success");await page.waitForTimeout(7000);await page.screenshot({path:testInfo.outputPath("terry-original-success-film.png")});
    await scene("terry-interrogation");await page.waitForTimeout(14000);await page.screenshot({path:testInfo.outputPath("terry-original-interrogation-cancelled-before-save.png")});
    await cancel();expect((await check()).character.storyFlags[flag("terry-interrogation")]).not.toBe(true);expect((await check()).character.storyFlags["notebook.s1.lan-di-hong-kong"]).not.toBe(true);
    await reload();await choose("Confront Terry");await scene("terry-final-intro");await page.keyboard.press("KeyX");await ready();await page.keyboard.press("Enter");
    await scene("terry-final-success");await scene("terry-interrogation");await page.waitForTimeout(18000);
    await page.screenshot({path:testInfo.outputPath("terry-original-lan-di-interrogation.png")});
    await expect.poll(async()=>(await saved()).character.storyFlags[flag("terry-interrogation")],{timeout:60000}).toBe(true);
    expect((await check()).character.storyFlags["notebook.s1.lan-di-hong-kong"]).toBe(true);expect((await check()).character.storyFlags[flag("gui-after-battle")]).not.toBe(true);
  }
  const pier=()=>page.evaluate(()=>{const s=window.storyProbe.lifecycle.getController().camera.getScene();return [...s.meshes,...s.transformNodes].filter(n=>n._filename==="MAP_TLYE.MAPM"&&!n.isDisposed()&&n.isEnabled()).length;});
  if(!(await saved()).character.storyFlags[flag("gui-after-battle")]){
    console.info("Final aftermath: original pier, separate cancellation/retry and next05:21 home arrival");
    await choose("Speak with Gui Zhang");await scene("gui-after-battle");await music("bgm106");await page.waitForTimeout(7000);
    expect(await pier()).toBeGreaterThan(0);await page.screenshot({path:testInfo.outputPath("gui-zhang-original-pier-room-and-cast.png")});
    await cancel();expect(await pier()).toBe(0);expect((await check()).character.storyFlags[flag("gui-after-battle")]).not.toBe(true);
    expect((await check()).character.worldId).toBe("mfbt");await reload();await choose("Speak with Gui Zhang");await scene("gui-after-battle");await music("bgm106");
    await page.waitForTimeout(25000);await page.screenshot({path:testInfo.outputPath("gui-zhang-original-pier-conversation.png")});
    await expect.poll(async()=>(await saved()).character.storyFlags[flag("gui-after-battle")],{timeout:70000}).toBe(true);
    const home=await check(),date=new Date(home.character.storyTimeMs),sourceDate=new Date(initial.character.storyTimeMs);sourceDate.setUTCDate(sourceDate.getUTCDate()+1);
    expect(home.character.worldId).toBe("interior");expect(date.getUTCHours()).toBe(5);expect(date.getUTCMinutes()).toBe(21);
    expect(date.toISOString().slice(0,10)).toBe(sourceDate.toISOString().slice(0,10));
  }
  if(!(await saved()).character.storyFlags[flag("departure-rest")]){
    console.info("Final aftermath: separate bedside stay/reload and actual08:30 saved rest");
    await choose("Stay awake");expect((await check()).character.storyFlags[flag("departure-rest")]).not.toBe(true);
    await reload();expect(await page.evaluate(()=>window.storyProbe.starts)).toEqual([]);await choose("Sleep until 8:30 a.m.");
    await expect.poll(async()=>(await saved()).character.storyFlags[flag("departure-rest")]).toBe(true);
    const wake=await check(),date=new Date(wake.character.storyTimeMs);expect(wake.character.worldId).toBe("interior");expect(date.getUTCHours()).toBe(8);expect(date.getUTCMinutes()).toBeGreaterThanOrEqual(30);expect(date.getUTCMinutes()).toBeLessThan(32);
  }
  await reload();await page.waitForTimeout(1500);await check();expect(await page.evaluate(()=>window.storyProbe.starts)).toEqual([]);
  // A newly published following chapter may now offer its normal choice.
  // Declining that offer is not replaying a completed aftermath film.
  const following=page.getByRole("button",{name:"Stay in Yokosuka for now",exact:true});if(await following.isVisible())await following.click();
  await idle();
  await page.screenshot({path:testInfo.outputPath("departure-morning-earned-bedside-and-controls.png")});
  console.info("Aftermath music responses",JSON.stringify(musicResponses.filter(r=>/bgm120|bgm106/.test(r.url))));
}
