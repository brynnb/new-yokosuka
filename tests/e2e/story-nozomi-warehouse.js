import {expect} from "@playwright/test";
import {winHarborFight} from "./story-workday-one.js";

// Continue a genuinely earned motorcycle arrival. No future flags, date,
// combat result or presentation result is injected into this character.
export async function verifyNozomiWarehouse(page,testInfo,character,{musicResponses}){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved(),flag=id=>`story.s1.${id}.completed`;
  expect(initial.character.storyFlags[flag("nozomi-ride")]).toBe(true);
  const errors=async()=>expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const check=async()=>{const s=await saved();expect(s.character.yen).toBe(initial.character.yen);expect(s.inventory).toEqual(initial.inventory);expect(s.character.storyFlags[flag("nozomi-home")]).not.toBe(true);await errors();return s;};
  const reload=async()=>{
    await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();
    await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();
    await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);
  };
  const choose=async name=>{await page.getByRole("button",{name,exact:true}).click({timeout:90_000});await errors();};
  const readyFight=async(id,count)=>{
    await page.waitForFunction(id=>window.storyProbe.combatRuntime?.active?.view.ready&&window.storyProbe.combatRuntime.active.view.id===id||window.storyProbe.sceneErrors.length,id,{timeout:90_000});
    await errors();expect(await page.evaluate(()=>window.storyProbe.combatRuntime.active.view.actors.length)).toBe(count);
  };
  if(!initial.character.storyFlags[flag("nozomi-outside-guards")]){
    console.info("Nozomi warehouse: outside leave, cancelled fight and earned victory");
    await choose("Leave it for now");await reload();await choose("Face the attackers");await readyFight("s1.mfsy.nozomi-guards",7);
    await page.waitForTimeout(1000);await page.screenshot({path:testInfo.outputPath("nozomi-outside-original-fighters.png")});
    await page.evaluate(()=>window.storyProbe.regions.controller.cancel("warehouse-battle-cancel"));expect((await check()).character.storyFlags[flag("nozomi-outside-guards")]).not.toBe(true);
    await reload();await choose("Face the attackers");await readyFight("s1.mfsy.nozomi-guards",7);await winHarborFight(page,{attack:"KeyJ"});
    await expect.poll(async()=>(await saved()).character.storyFlags[flag("nozomi-outside-guards")]).toBe(true);
    expect((await check()).character.storyFlags[flag("nozomi-inside-guards")]).not.toBe(true);
    await reload();
  }
  if((await saved()).character.worldId!=="tery"){
    console.info("Nozomi warehouse: confirmed original-world admission");
    await choose("Enter the warehouse");
    await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==="tery"&&window.storyProbe.lifecycle.worldRuntime.ready||window.storyProbe.sceneErrors.length,null,{timeout:90_000});await errors();
    await expect.poll(async()=>(await saved()).character.worldId).toBe("tery");
  }
  if(!(await saved()).character.storyFlags[flag("nozomi-inside-guards")]){
    console.info("Nozomi warehouse: inside leave/reload and actual second battle");
    await choose("Leave it for now");await reload();await choose("Face the attackers");await readyFight("s1.tery.nozomi-guards",8);
    await page.waitForTimeout(1000);await page.screenshot({path:testInfo.outputPath("nozomi-inside-original-warehouse-fight.png")});
    await winHarborFight(page,{attack:"KeyJ"});
    await expect.poll(async()=>(await saved()).character.storyFlags[flag("nozomi-inside-guards")]).toBe(true);
  }
  console.info("Nozomi warehouse: cancel hostage film, reload retains both victories");
  await choose("Confront Terry");
  const movie=async part=>{
    // D is 129 seconds long. Waiting for its successor must allow the real
    // remaining duration, rather than treating a correctly playing film as hung.
    await page.waitForFunction(part=>window.storyProbe.director?.activeCutscene?.cutscene.id===`story-s1-nozomi-rescue-${part}`||window.storyProbe.sceneErrors.length,part,{timeout:180_000});await errors();
  };
  const music=async()=>{
    await expect.poll(()=>page.evaluate(()=>{
      const m=window.storyMusic?.director,a=m?.current?.audio;
      return m?.current?.trackId==="bgm084"&&!a.paused&&a.currentTime>1&&a.volume>0;
    }),{timeout:15_000,message:"Original BGM084 must actually advance during the hostage scene"}).toBe(true);
  };
  await movie("intro");await page.waitForTimeout(5000);await page.evaluate(()=>window.storyProbe.regions.controller.cancel("warehouse-deal-cancel"));
  const cancelled=await check();expect(cancelled.character.storyFlags[flag("nozomi-rescue")]).not.toBe(true);
  expect(cancelled.character.storyFlags[flag("nozomi-outside-guards")]).toBe(true);expect(cancelled.character.storyFlags[flag("nozomi-inside-guards")]).toBe(true);
  await reload();await choose("Confront Terry");await movie("intro");
  console.info("Nozomi warehouse: natural original introduction, deal and coda");
  await music();
  await page.waitForTimeout(33_000);await page.screenshot({path:testInfo.outputPath("nozomi-original-hostage-introduction.png")});
  await movie("deal");await page.waitForTimeout(32_000);await page.screenshot({path:testInfo.outputPath("nozomi-original-terry-deal.png")});
  await movie("coda");await page.waitForTimeout(2800);await page.screenshot({path:testInfo.outputPath("nozomi-original-chai-coda.png")});
  await expect.poll(async()=>(await saved()).character.storyFlags[flag("nozomi-rescue")],{timeout:30_000}).toBe(true);
  const completed=await check();expect(completed.character.storyFlags["notebook.s1.terry-hostage-deal"]).toBe(true);
  const responses=musicResponses.filter(r=>r.url.includes("bgm084"));console.info("Nozomi BGM084 responses",JSON.stringify(responses));
  // Media elements legitimately use range requests (206), not only full 200s.
  expect(responses.some(r=>r.status===200||r.status===206),JSON.stringify(responses)).toBe(true);
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  await reload();await page.waitForTimeout(2500);await check();
  expect(await page.evaluate(()=>window.storyProbe.starts.filter(s=>s.startsWith("story-s1-nozomi-rescue")))).toEqual([]);
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
}
