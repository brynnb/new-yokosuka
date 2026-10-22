import {expect} from "@playwright/test";
import catalog from "../../play/data/story-driving.json" with {type:"json"};

export async function verifyMotorcycleRide(page,testInfo,character){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved(),done="story.s1.nozomi-ride.completed";
  expect(initial.character.storyFlags["story.s1.nozomi-motorcycle.completed"]).toBe(true);expect(initial.character.storyFlags[done]).not.toBe(true);
  const unchanged=async(complete=false)=>{const s=await saved();expect(s.character.yen).toBe(initial.character.yen);expect(s.inventory).toEqual(initial.inventory);
    for(const [key,value]of Object.entries(s.character.storyFlags))if(![done,"story.s1.nozomi-ride-entry.completed"].includes(key))expect(value).toBe(initial.character.storyFlags[key]);
    expect(s.character.storyFlags[done]===true).toBe(complete);expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);return s;};
  const world=async id=>page.waitForFunction(id=>{const w=window.storyProbe.lifecycle.worldRuntime;return w.activeWorld.id===id&&w.ready&&!w.switching;},id,{timeout:90_000});
  const reload=async()=>{await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);};
  const enter=async()=>{await page.getByRole("button",{name:"Ride to the harbor",exact:true}).click();await world("nbik");await page.getByRole("button",{name:"Start the motorcycle ride",exact:true}).waitFor();};
  const start=async()=>{await page.getByRole("button",{name:"Start the motorcycle ride",exact:true}).click();await page.waitForFunction(()=>window.storyProbe.driving?.active?.ready||window.storyProbe.sceneErrors.length,null,{timeout:45_000});expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);await page.locator("#renderCanvas").focus();};
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
  await world("mfsy");await unchanged(true);await expect.poll(()=>page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);
  console.info("Real motorcycle result",JSON.stringify({last,target}));await page.screenshot({path:testInfo.outputPath("motorcycle-earned-harbor-arrival.png")});
  await reload();await world("mfsy");await unchanged(true);expect(await page.evaluate(()=>window.storyProbe.driving?.active||null)).toBe(null);
}
