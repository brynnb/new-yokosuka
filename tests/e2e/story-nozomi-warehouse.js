import {expect} from "@playwright/test";
import {fightStoryAmbush} from "./story-fight-input.js";
import regions from "../../play/data/story-regions.json" with {type:"json"};

// Continue a genuinely earned motorcycle arrival. No future flags, date,
// combat result or presentation result is injected into this character.
export async function verifyNozomiWarehouse(page,testInfo,character,{musicResponses}){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved(),flag=id=>`story.s1.${id}.completed`;
  expect(initial.character.storyFlags[flag("nozomi-ride")]).toBe(true);
  const errors=async()=>expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const check=async()=>{const s=await saved();for(const key of ["yen","currentHp","maxHp"])expect(s.character[key]).toBe(initial.character[key]);expect(s.inventory).toEqual(initial.inventory);expect(s.character.storyFlags[flag("nozomi-home")]).not.toBe(true);await errors();return s;};
  const reload=async()=>{
    await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();
    await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();
    await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);
  };
  const choose=async name=>{await page.getByRole("button",{name,exact:true}).click({timeout:90_000});await errors();};
  const readyFight=async(id,count)=>{
    await page.waitForFunction(id=>window.storyProbe.combatRuntime?.active?.view?.ready&&window.storyProbe.combatRuntime.active.view.id===id||window.storyProbe.sceneErrors.length,id,{timeout:90_000});
    await errors();expect(await page.evaluate(()=>window.storyProbe.combatRuntime.active.view.actors.length)).toBe(count);
  };
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);};
  const declinePendingHome=async(stage)=>{
    const region=regions.regions.find(region=>region.id==="s1.tery.nozomi-home-entry");
    expect(region,"Missing published Nozomi home-entry region").toBeDefined();
    const before=await check(),c=before.character;
    if(c.playMode!==region.playMode||c.openingCompleted!==true||c.worldId!==region.worldId||
      !region.requiredFlags.every(flag=>c.storyFlags[flag]===true)||region.excludedFlags.some(flag=>c.storyFlags[flag]===true))return;
    const handoff=await page.evaluate(({worldId,min,max})=>{
      const l=window.storyProbe.lifecycle,position=l.getController().actorRoot.position.asArray();
      return {world:l.worldRuntime.activeWorld.id,ready:l.worldRuntime.ready,position,
        inside:l.worldRuntime.activeWorld.id===worldId&&position.every((value,i)=>value>=min[i]&&value<=max[i])};
    },region);
    if(!handoff.inside)return;
    expect(handoff.ready).toBe(true);
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.active?.scriptIdentity?.scriptSlug),{timeout:45_000}).toBe("story-s1-nozomi-home-entry");
    await expect(page.getByRole("button",{name:"Take Nozomi home",exact:true})).toBeVisible();
    await page.getByRole("button",{name:"Leave it for now",exact:true}).click();await idle();
    const after=await check();expect(after.character.storyFlags).toEqual(before.character.storyFlags);expect(after.inventory).toEqual(before.inventory);
    for(const key of ["yen","currentHp","maxHp","worldId","playMode"])expect(after.character[key]).toBe(before.character[key]);
    console.info("Nozomi warehouse: declined exact home offer without effects",JSON.stringify({stage,...handoff}));
  };
  const attemptTokens=new Set();
  const fight=async(id,count,receipt,prefix,firstScreenshot=null)=>{
    const retry=page.getByRole("button",{name:"Try again",exact:true});
    // Use the accepted directional keyboard strategy, with at most three
    // physical attempts. Yarn's ordinary retry preserves earlier victories.
    for(let attempt=1;attempt<=3;attempt++){
      await readyFight(id,count);
      const start=await page.evaluate(()=>window.storyProbe.combatRuntime.active.view);
      expect(start.id).toBe(id);expect(start.actors.length).toBe(count);
      expect(start.actors[0].health).toBe(start.actors[0].maxHealth);
      expect(typeof start.token).toBe("string");expect(start.token.length>0).toBe(true);
      expect(attemptTokens.has(start.token),"each battle or ordinary retry creates a fresh combat attempt").toBe(false);attemptTokens.add(start.token);
      // Assert fresh health before the existing live-combat observation.
      if(attempt===1&&firstScreenshot){await page.waitForTimeout(1000);await page.screenshot({path:testInfo.outputPath(firstScreenshot)});}
      const artifactPrefix=`${prefix}-attempt-${attempt}`;
      await fightStoryAmbush(page,testInfo,{nextButton:null,artifactPrefix});
      await page.waitForFunction(()=>!window.storyProbe.combatRuntime?.active,null,{timeout:20_000});
      await expect.poll(async()=>await retry.isVisible()||(await saved()).character.storyFlags[receipt]===true,{timeout:20_000,message:`${id} must settle its victory receipt or offer an ordinary retry`}).toBe(true);
      const state=await check(),result=await page.evaluate(()=>window.storyProbe.lastCombatView),lost=await retry.isVisible(),earned=state.character.storyFlags[receipt]===true;
      const evidence={attempt,id:result.id,lost,receiptEarned:earned,defeated:result.defeated,remainingMs:result.remainingMs,playerHealth:result.actors[0].health};
      await testInfo.attach(`${artifactPrefix}-outcome`,{body:JSON.stringify(evidence),contentType:"application/json"});
      console.info("Nozomi warehouse combat attempt:",JSON.stringify(evidence));
      expect(result.id).toBe(id);expect(result.actors.length).toBe(count);
      if(!lost){expect(earned).toBe(true);expect(result.defeated).toBe(count-1);expect(result.actors[0].health).toBeGreaterThan(0);return;}
      expect(earned,"a lost battle must not grant its victory receipt").toBe(false);
      expect(attempt,`${id} exhausted three ordinary keyboard attempts`).toBeLessThan(3);
      await retry.click();
    }
  };
  if(!initial.character.storyFlags[flag("nozomi-rescue")]){
    if(!initial.character.storyFlags[flag("nozomi-outside-guards")]){
      console.info("Nozomi warehouse: outside leave, cancelled fight and earned victory");
      await choose("Leave it for now");await reload();await choose("Face the attackers");await readyFight("s1.mfsy.nozomi-guards",7);
      await page.waitForTimeout(1000);await page.screenshot({path:testInfo.outputPath("nozomi-outside-original-fighters.png")});
      await page.evaluate(()=>window.storyProbe.regions.controller.cancel("warehouse-battle-cancel"));expect((await check()).character.storyFlags[flag("nozomi-outside-guards")]).not.toBe(true);
      await reload();await choose("Face the attackers");await fight("s1.mfsy.nozomi-guards",7,flag("nozomi-outside-guards"),"nozomi-outside");
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
      await choose("Leave it for now");await reload();await choose("Face the attackers");
      await fight("s1.tery.nozomi-guards",8,flag("nozomi-inside-guards"),"nozomi-inside","nozomi-inside-original-warehouse-fight.png");
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
  }
  const completed=await check();expect(completed.character.worldId).toBe("tery");
  for(const part of ["nozomi-outside-guards","nozomi-warehouse-entry","nozomi-inside-guards","nozomi-rescue"])expect(completed.character.storyFlags[flag(part)]).toBe(true);
  expect(completed.character.storyFlags["notebook.s1.terry-hostage-deal"]).toBe(true);
  await declinePendingHome("completion");await idle();
  await page.screenshot({path:testInfo.outputPath("nozomi-earned-rescue-checkpoint.png")});
  await reload();await page.waitForTimeout(2500);await check();await declinePendingHome("reload");await idle();
  expect(await page.evaluate(()=>window.storyProbe.starts.filter(s=>s.startsWith("story-s1-nozomi-rescue")))).toEqual([]);
  expect(await page.evaluate(()=>window.storyProbe.combatRuntime?.active||null)).toBe(null);
  await page.screenshot({path:testInfo.outputPath("nozomi-earned-rescue-reload.png")});
}
