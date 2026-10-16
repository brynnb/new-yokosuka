import {expect} from "@playwright/test";

// Continue the genuinely earned alliance. No health, flags, clock, position
// or challenge outcomes are inserted. Every hit uses normal keyboard input.
export async function verifySeventyManBattle(page,testInfo,character,{musicResponses}){
  await page.setViewportSize({width:1920,height:1080});
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved(),done="story.s1.seventy-man.completed";
  expect(initial.character.storyFlags["story.s1.final-pipe.completed"]).toBe(true);
  expect(initial.character.storyFlags[done]).not.toBe(true);
  const check=async()=>{const s=await saved();expect(s.character.yen).toBe(initial.character.yen);expect(s.inventory).toEqual(initial.inventory);
    for(const key of ["terry-interrogation","departure"])expect(s.character.storyFlags[`story.s1.${key}.completed`]).not.toBe(true);
    expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return s;};
  const choose=name=>page.getByRole("button",{name,exact:true}).click({timeout:90_000});
  const reload=async()=>{await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);};
  const ready=async()=>{await page.waitForFunction(()=>window.storyProbe.combatRuntime?.active?.view.id==="s1.mfbt.seventy-man"&&window.storyProbe.combatRuntime.active.view.ready||window.storyProbe.sceneErrors.length,null,{timeout:120_000});await check();};
  console.info("70-man battle: decline, actual partial fight, cancellation and saved retry");
  await choose("Leave it for now");expect((await check()).character.storyFlags[done]).not.toBe(true);
  await reload();await choose("Fight the Mad Angels");await ready();
  const oldToken=await page.evaluate(()=>window.storyProbe.combatRuntime.active.token);
  await page.screenshot({path:testInfo.outputPath("seventy-man-original-cast-and-gui-zhang.png")});
  await fightWithKeyboard(page,()=>page.evaluate(()=>window.storyProbe.combatRuntime?.active?.view.defeated>=2));
  expect((await check()).character.storyFlags[done]).not.toBe(true);
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("partial-seventy-man-check"));
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  await reload();await choose("Fight the Mad Angels");await ready();
  expect(await page.evaluate(()=>window.storyProbe.combatRuntime.active.token)).not.toBe(oldToken);
  expect(await page.evaluate(()=>window.storyProbe.combatRuntime.active.view.defeated||0)).toBe(0);
  await expect.poll(()=>page.evaluate(()=>{const m=window.storyMusic?.director,a=m?.current?.audio;return m?.current?.trackId==="bgm120"&&!a.paused&&a.currentTime>1&&a.volume>0;}),{timeout:15000}).toBe(true);
  const waves=new Set(),bosses=new Set();let maximum=0;
  console.info("70-man battle: actual keyboard fight and all three boss reinforcements");
  await fightWithKeyboard(page,async()=>{
    const v=await page.evaluate(()=>window.storyProbe.combatRuntime?.active?.view);if(!v)return true;
    maximum=Math.max(maximum,v.defeated||0);
    if(!waves.has(v.wave)){waves.add(v.wave);console.info(`Battle group ${v.wave}: ${v.defeated||0}/70 down, Ryo ${v.actors[0].health}`);}
    if(v.bossTag&&!bosses.has(v.bossTag)){
      bosses.add(v.bossTag);await page.waitForTimeout(200);
      console.info("Boss render state",JSON.stringify(await page.evaluate(tag=>{
        const r=window.storyProbe.combatRuntime,c=r.getController(),a=r.actors.activeActor(tag);
        return{tag,view:r.active.view.actors.find(a=>a.tag===tag),enabled:a.root.isEnabled(),root:a.root.position.asArray(),visibleMeshes:a.root.getChildMeshes().filter(m=>m.isEnabled()&&m.isVisible&&m.visibility>0).length,yaw:c.cameraYaw,camera:c.camera.position.asArray()};
      },v.bossTag)));
      await page.screenshot({path:testInfo.outputPath(`seventy-man-boss-${v.bossTag}.png`)});
    }
    return false;
  });
  await page.waitForFunction(()=>window.storyProbe.authoredScene?.active?.scene.id==="s1.mfbt.seventy-man-victory"||window.storyProbe.sceneErrors.length,null,{timeout:20000});
  expect(waves.size).toBe(10);expect([...bosses]).toEqual(["MRSK","PEDR","STSI"]);expect(maximum).toBeGreaterThanOrEqual(68);
  // Combat hands straight to the victory tableau: the terminal70-KO state
  // is consumed by Yarn, not emitted as another live combat snapshot. The
  // compiler/engine test proves that this transition requires all70 KOs.
  expect(await page.evaluate(()=>window.storyProbe.lastCombatView.totalOpponents)).toBe(70);
  expect((await check()).character.storyFlags[done]).not.toBe(true);
  await page.screenshot({path:testInfo.outputPath("seventy-man-earned-independent-victory.png")});
  await page.keyboard.press("Space");
  await expect.poll(async()=>(await saved()).character.storyFlags[done],{timeout:20000}).toBe(true);
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  const final=await check();expect(new Date(final.character.storyTimeMs).toISOString().slice(0,10)).toBe(new Date(initial.character.storyTimeMs).toISOString().slice(0,10));
  await reload();await page.waitForTimeout(1500);await check();expect(await page.evaluate(()=>window.storyProbe.starts)).toEqual([]);
  await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  await page.screenshot({path:testInfo.outputPath("seventy-man-saved-reload-and-controls.png")});
  console.info("Battle original music responses",JSON.stringify(musicResponses.filter(r=>/bgm120/.test(r.url))));
}

export async function fightWithKeyboard(page,stop){
  await page.locator("#renderCanvas").focus();
  const bindings=await page.evaluate(()=>window.storyProbe.combatRuntime.active.input.getBindings()),held=new Set();
  const keys=async next=>{for(const key of held)if(!next.includes(key)){await page.keyboard.up(key);held.delete(key);}for(const key of next)if(!held.has(key)){await page.keyboard.down(key);held.add(key);}};
  await page.keyboard.down(bindings.guard);
  let recovering=false;
  try{
    for(let i=0;i<7500;i++){
      if(await stop()){
        if(await page.evaluate(()=>!!window.storyProbe.combatRuntime?.active))return;
        break;
      }
      const intent=await page.evaluate(recovering=>{
        const r=window.storyProbe.combatRuntime,v=r.active?.view;if(!v)return null;
        const p=v.actors[0],e=v.actors.filter(a=>a.tag!=="AKIR"&&a.team!=="ally"&&!a.inactive&&a.health>0).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];
        let x=0,z=0,d=e?Math.hypot(e.x-p.x,e.z-p.z):Infinity;
        if(p.health<=30)recovering=true;else if(p.health>=85)recovering=false;
        if(recovering){
          // The guide recommends circling to recover. Use real movement/run
          // bindings, not a health write or a pause of the server simulation.
          const a=r.active.definition.bounds,cx=(a.minX+a.maxX)/2,cz=(a.minZ+a.maxZ)/2;
          const radius=Math.min(a.maxX-a.minX,a.maxZ-a.minZ)/2-1,angle=Math.atan2(p.z-cz,p.x-cx)+.55;
          x=cx+radius*Math.cos(angle)-p.x;z=cz+radius*Math.sin(angle)-p.z;
          const length=Math.hypot(x,z);x/=Math.max(.01,length);z/=Math.max(.01,length);
        }else if(e&&(d>1.45||d<.9)){const sign=d<.9?-1:1;x=sign*(e.x-p.x)/Math.max(.01,d);z=sign*(e.z-p.z)/Math.max(.01,d);}
        const yaw=r.getController().cameraYaw,b=r.active.input.getBindings(),f=-Math.sin(yaw)*x-Math.cos(yaw)*z,s=Math.cos(yaw)*x-Math.sin(yaw)*z;
        return{recovering,attack:!recovering&&d<=1.5,keys:[recovering?b.run:null,Math.abs(f)>.25?(f>0?b.up:b.down):null,Math.abs(s)>.25?(s>0?b.right:b.left):null].filter(Boolean)};
      },recovering);
      if(!intent)break;recovering=intent.recovering;await keys(intent.keys);if(intent.attack)await page.keyboard.press(bindings.leg);await page.waitForTimeout(80);
    }
  }finally{await keys([]);await page.keyboard.up(bindings.guard);}
  if(await page.getByRole("button",{name:"Try again",exact:true}).isVisible())console.info("Battle failure",JSON.stringify(await page.evaluate(()=>window.storyProbe.lastCombatView)));
  expect(await page.getByRole("button",{name:"Try again",exact:true}).isVisible(),"Actual keyboard battle ended in defeat").toBe(false);
}
