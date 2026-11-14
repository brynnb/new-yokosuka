import {expect} from "@playwright/test";
import catalog from "../../play/data/story-driving.json" with {type:"json"};
import regions from "../../play/data/story-regions.json" with {type:"json"};

export async function verifyMotorcycleRide(page,testInfo,character){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved(),done="story.s1.nozomi-ride.completed";
  expect(initial.character.storyFlags["story.s1.nozomi-motorcycle.completed"]).toBe(true);
  const unchanged=async(complete=false)=>{const s=await saved();for(const key of ["yen","currentHp","maxHp"])expect(s.character[key]).toBe(initial.character[key]);expect(s.inventory).toEqual(initial.inventory);
    for(const key of new Set([...Object.keys(initial.character.storyFlags),...Object.keys(s.character.storyFlags)]))if(![done,"story.s1.nozomi-ride-entry.completed"].includes(key))expect(s.character.storyFlags[key]).toBe(initial.character.storyFlags[key]);
    expect(s.character.storyFlags[done]===true).toBe(complete);expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return s;};
  const world=async id=>page.waitForFunction(id=>{const w=window.storyProbe.lifecycle.worldRuntime;return w.activeWorld.id===id&&w.ready&&!w.switching;},id,{timeout:90_000});
  const reload=async()=>{await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);};
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);};
  const declinePendingGuards=async(stage)=>{
    const region=regions.regions.find(region=>region.id==="s1.mfsy.nozomi-outside-guards");
    expect(region,"Missing published outside-guards region").toBeDefined();
    const before=await unchanged(true),c=before.character;
    if(c.playMode!==region.playMode||c.openingCompleted!==true||c.worldId!==region.worldId||
      !region.requiredFlags.every(flag=>c.storyFlags[flag]===true)||c.storyFlags[region.completedFlag]===true)return;
    const handoff=await page.evaluate(({worldId,min,max})=>{
      const l=window.storyProbe.lifecycle,position=l.getController().actorRoot.position.asArray();
      return {world:l.worldRuntime.activeWorld.id,ready:l.worldRuntime.ready,position,
        inside:l.worldRuntime.activeWorld.id===worldId&&position.every((value,i)=>value>=min[i]&&value<=max[i])};
    },region);
    if(!handoff.inside)return;
    expect(handoff.ready).toBe(true);
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.active?.scriptIdentity?.scriptSlug),{timeout:45_000}).toBe("story-s1-nozomi-outside-guards");
    await expect(page.getByRole("button",{name:"Face the attackers",exact:true})).toBeVisible();
    await page.getByRole("button",{name:"Leave it for now",exact:true}).click();await idle();
    const after=await unchanged(true);expect(after.character.storyFlags).toEqual(before.character.storyFlags);expect(after.inventory).toEqual(before.inventory);
    for(const key of ["yen","currentHp","maxHp","worldId","playMode"])expect(after.character[key]).toBe(before.character[key]);
    console.info("Motorcycle arrival: declined exact outside-guards offer without effects",JSON.stringify({stage,...handoff}));
  };
  const enter=async()=>{await page.getByRole("button",{name:"Ride to the harbor",exact:true}).click();await world("nbik");await page.getByRole("button",{name:"Start the motorcycle ride",exact:true}).waitFor();};
  const start=async()=>{await page.getByRole("button",{name:"Start the motorcycle ride",exact:true}).click();await page.waitForFunction(()=>window.storyProbe.driving?.active?.ready||window.storyProbe.sceneErrors.length,null,{timeout:45_000});expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);await page.locator("#renderCanvas").focus();};
  let rideResult=null;
  if(initial.character.storyFlags[done]!==true){
    if(initial.character.worldId!=="nbik")await enter();else await world("nbik");expect((await unchanged()).character.worldId).toBe("nbik");
    console.info("Motorcycle entry starting",initial.character.worldId);
    await start();await page.screenshot({path:testInfo.outputPath("motorcycle-original-road-and-rider.png")});
    console.info("Motorcycle rendering",JSON.stringify(await page.evaluate(()=>{const o=window.storyProbe.driving.active,r=o.objects.objects.get("BIKE").root,c=window.storyProbe.lifecycle.getController();return{rider:c.actorRoot.position.asArray(),bike:r.position.asArray(),camera:c.camera.position.asArray(),meshes:r.getChildMeshes().filter(m=>m.getTotalVertices()>0&&m.isEnabled()&&m.isVisible&&m.visibility>0).length};})));
    await page.keyboard.down("KeyW");await page.waitForFunction(()=>window.storyProbe.driving.active?.view.actor.z< -72||window.storyProbe.sceneErrors.length);await page.keyboard.up("KeyW");expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
    await page.keyboard.press("KeyX");await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");await unchanged();
    await reload();await world("nbik");await unchanged();
    await page.getByRole("button",{name:"Return to Naoyuki",exact:true}).click();await world("sakuragaoka");await unchanged();
    await page.evaluate(()=>{const l=window.storyProbe.lifecycle,c=l.getController();l.resetPlayer(l.vectorFromArray([-14,0,32.5]),-Math.PI/2,{persist:false});c.setFirstPerson(true);c.cameraYaw=-Math.PI/2;c.cameraPitch=0;c.updateCamera(1);});
    await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");try{await page.getByRole("button",{name:"Ride to the harbor",exact:true}).waitFor({timeout:20_000});}finally{await page.keyboard.up("KeyW");}
    await enter();await start();
    const line=catalog.challenges[0].centerline;let target=1;const held=new Set();
    const keys=async desired=>{for(const key of [...held])if(!desired.has(key)){await page.keyboard.up(key);held.delete(key);}for(const key of desired)if(!held.has(key)){await page.keyboard.down(key);held.add(key);}};
    const deadline=Date.now()+135_000;let last,captured=false;
    try{
      while(Date.now()<deadline){
        const current=await page.evaluate(()=>window.storyProbe.driving?.active?.view||null);if(!current)break;last=current;
        const p=last.actor;
        while(target<line.length-1&&Math.hypot(line[target][0]-p.x,line[target][2]-p.z)<10)target++;
        const angle=Math.atan2(line[target][0]-p.x,line[target][2]-p.z)-p.yaw,error=Math.atan2(Math.sin(angle),Math.cos(angle));
        const desired=new Set();if(last.speed<10)desired.add("KeyW");if(Math.abs(error)>.3&&last.speed>7)desired.add("KeyS");if(error>.025)desired.add("KeyD");if(error< -.025)desired.add("KeyA");await keys(desired);
        if(last.checkpoint===5&&!captured){await page.screenshot({path:testInfo.outputPath("motorcycle-original-bends.png")});captured=true;}
        await page.waitForTimeout(100);
      }
    }finally{await keys(new Set());}
    await expect.poll(async()=>(await saved()).character.storyFlags[done],{timeout:20_000}).toBe(true);
    rideResult={last,target};
  }
  await world("mfsy");await unchanged(true);await declinePendingGuards("completion");await idle();
  console.info("Motorcycle earned checkpoint",JSON.stringify(rideResult??{previouslyEarned:true}));await page.screenshot({path:testInfo.outputPath("motorcycle-earned-harbor-arrival.png")});
  await reload();await world("mfsy");await unchanged(true);await declinePendingGuards("reload");await idle();
  expect(await page.evaluate(()=>window.storyProbe.driving?.active||null)).toBe(null);
  expect(await page.evaluate(()=>window.storyProbe.starts.filter(slug=>["story-s1-nozomi-ride","story-s1-nozomi-ride-entry"].includes(slug)))).toEqual([]);
  await page.screenshot({path:testInfo.outputPath("motorcycle-earned-harbor-reload.png")});
}
