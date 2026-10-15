import {expect} from "@playwright/test";
import {openStoryRoomDoor} from "./story-object-input.js";

export async function verifyHomeTicketPreparation(page,testInfo,character){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved();expect(initial.character.storyFlags["story.s1.master-chen-mirror.completed"]).toBe(true);
  const noErrors=async()=>expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);await noErrors();};
  const scene=async id=>{await page.waitForFunction(id=>window.storyProbe.director?.activeCutscene?.cutscene.id===id||window.storyProbe.sceneErrors.length,id,{timeout:70_000});await noErrors();};
  const approach=async(position,yaw,label)=>{
    await page.evaluate(({position,yaw})=>{const l=window.storyProbe.lifecycle,c=l.getController();l.resetPlayer(l.vectorFromArray(position),yaw,{persist:false});c.setFirstPerson(true);c.cameraYaw=yaw;c.cameraPitch=0;c.updateCamera(1);},{position,yaw});
    await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
    try{await page.waitForFunction(()=>window.storyProbe.regions.controller.status==="options"||window.storyProbe.sceneErrors.length,null,{timeout:15_000});}
    catch(error){console.info("Story approach blocked",JSON.stringify(await page.evaluate(()=>{
      const l=window.storyProbe.lifecycle,c=l.getController(),p=c.collider.position;
      return{position:p.asArray(),status:window.storyProbe.regions.controller.status,
        doors:l.doorInteractions.entries.filter(d=>d.objectTag==="dor1").map(d=>({tag:d.objectTag,state:d.state,closedCenter:d.collisionBindCenter?.asArray(),nodes:d.nodes.map(n=>n.getAbsolutePosition().asArray())})),
        candidates:c.collisionCandidates(p,p.add(l.vectorFromArray([0,0,-1])),.6).filter(m=>m.checkCollisions).slice(0,18).map(m=>({name:m.name,position:m.position.asArray(),code:m.metadata?.nativeCollisionCode,moved:m.metadata?.nativeCollisionDoorMoved,segments:m.metadata?.nativeCollisionCode>=100?m.metadata.nativeCollisionSegments:undefined,bounds:[m.getBoundingInfo().boundingBox.minimumWorld.asArray(),m.getBoundingInfo().boundingBox.maximumWorld.asArray()]}))};
    }),null,2));throw error;}finally{await page.keyboard.up("KeyW");}
    await noErrors();await expect(page.getByRole("button",{name:label,exact:true})).toBeVisible();
  };
  const unchanged=async(flag)=>{const s=await saved();expect(s.character.storyFlags[flag]).not.toBe(true);expect(s.character.yen).toBe(initial.character.yen);expect(s.inventory).toEqual(initial.inventory);};
  if(await page.evaluate(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id)!=="interior")await page.evaluate(()=>window.storyProbe.lifecycle.travelToWorld("interior"));
  await page.waitForFunction(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id==="interior"&&window.storyProbe.lifecycle.worldRuntime.ready);
  const homeLabel="Tell Fuku-san about Master Chen",homeApproach=()=>approach([-17.6,0,4.1],0,homeLabel);
  if(!initial.character.storyFlags["story.s1.post-chen-home.completed"]){
    await openStoryRoomDoor(page,{tag:"dor7",position:[-17.6,0,4.1]});
    await homeApproach();await page.getByRole("button",{name:"Leave it for now",exact:true}).click();await idle();
    await homeApproach();await page.getByRole("button",{name:homeLabel,exact:true}).click();await scene("story-s1-post-chen-home");
    await page.waitForTimeout(1800);await page.screenshot({path:testInfo.outputPath("post-chen-home-cancelled.png")});
    await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-post-chen-cancel"));await idle();await unchanged("story.s1.post-chen-home.completed");
    await homeApproach();await page.getByRole("button",{name:homeLabel,exact:true}).click();await scene("story-s1-post-chen-home");
    await page.waitForTimeout(8000);await page.screenshot({path:testInfo.outputPath("post-chen-fuku-original.png")});
    await expect.poll(async()=>(await saved()).character.storyFlags["story.s1.post-chen-home.completed"],{timeout:35_000}).toBe(true);await idle();
  }
  const sleepFlag="story.s1.hong-kong-savings.completed",sleepLabel="Sleep and check my savings",sleepApproach=()=>approach([-17.6,0,3.0],Math.PI,sleepLabel);
  let expectedYen=initial.character.yen;
  if(!initial.character.storyFlags[sleepFlag]){
    await sleepApproach();await page.getByRole("button",{name:"Stay awake",exact:true}).click();await idle();await unchanged(sleepFlag);
    for(const part of ["mirror-dream","bank-savings"]){
      await sleepApproach();const before=await saved();await page.getByRole("button",{name:sleepLabel,exact:true}).click();await scene(`story-s1-${part}`);
      await page.waitForTimeout(1800);await page.screenshot({path:testInfo.outputPath(`${part}-cancelled.png`)});
      await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-home-funds-cancel"));await idle();await unchanged(sleepFlag);
      const after=await saved();expect(after.character.storyTimeMs-before.character.storyTimeMs).toBeLessThan(600_000);
    }
    await sleepApproach();const before=await saved();await page.getByRole("button",{name:sleepLabel,exact:true}).click();await scene("story-s1-mirror-dream");
    await page.waitForTimeout(9000);await page.screenshot({path:testInfo.outputPath("original-two-mirrors-dream.png")});await unchanged(sleepFlag);
    await scene("story-s1-bank-savings");await page.waitForTimeout(8000);await page.screenshot({path:testInfo.outputPath("original-bankbook-and-ryo.png")});await unchanged(sleepFlag);
    await expect.poll(async()=>(await saved()).character.storyFlags[sleepFlag],{timeout:35_000}).toBe(true);
    await page.waitForFunction(()=>{const l=window.storyProbe.lifecycle;return l.worldRuntime.ready&&!l.worldRuntime.switching;});await idle();
    const after=await saved(),b=new Date(before.character.storyTimeMs),a=new Date(after.character.storyTimeMs);
    expect(a.toISOString().slice(0,10)).toBe(new Date(Date.UTC(b.getUTCFullYear(),b.getUTCMonth(),b.getUTCDate()+1)).toISOString().slice(0,10));
    expect(a.getUTCHours()).toBe(8);expect(a.getUTCMinutes()).toBeGreaterThanOrEqual(30);expect(a.getUTCMinutes()).toBeLessThan(35);
    expectedYen+=36502;expect(after.character.yen).toBe(expectedYen);expect(after.inventory).toEqual(initial.inventory);
  }
  if(!(await saved()).character.storyFlags["story.s1.fuku-travel-advice.completed"]){
    const door=await openStoryRoomDoor(page,{tag:"dor1",position:[-21.9,0,1]});
    expect(door.gapCenter).toBeTruthy();
    const label="Discuss the trip with Fuku-san",fukuApproach=()=>approach([door.gapCenter[0],0,1.2],0,label);
    await fukuApproach();await page.getByRole("button",{name:"Leave it for now",exact:true}).click();await idle();
    await fukuApproach();await page.getByRole("button",{name:label,exact:true}).click();
    await page.waitForFunction(()=>window.storyProbe.authoredScene?.active?.scene.id==="s1.jomo.fuku-travel-advice");
    await page.screenshot({path:testInfo.outputPath("fuku-bedroom-travel-advice.png")});
    await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-travel-advice-cancel"));await idle();
    expect((await saved()).character.storyFlags["story.s1.fuku-travel-advice.completed"]).not.toBe(true);
    await fukuApproach();await page.getByRole("button",{name:label,exact:true}).click();
    for(let i=0;i<35&&!await page.evaluate(()=>window.storyProbe.director?.activeCutscene?.cutscene.id==="story-s1-travel-family"||window.storyProbe.sceneErrors.length);i++){await page.keyboard.press("Space");await page.waitForTimeout(200);}
    await scene("story-s1-travel-family");await page.waitForTimeout(10_000);await page.screenshot({path:testInfo.outputPath("ine-original-kitchen-travel-discussion.png")});
    await expect.poll(async()=>(await saved()).character.storyFlags["story.s1.fuku-travel-advice.completed"],{timeout:95_000,intervals:[1000]}).toBe(true);await idle();
  }
  const final=await saved();expect(final.character.yen).toBe(expectedYen);expect(final.inventory).toEqual(initial.inventory);expect(final.character.storyFlags["notebook.s1.travel-agencies"]).toBe(true);
  await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();
  await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();
  await page.waitForFunction(()=>window.storyProbe.ready&&window.storyProbe.regions?.getCharacter()?.id);await idle();
  expect(await page.evaluate(()=>window.storyProbe.starts.some(id=>["story-s1-post-chen-home","story-s1-mirror-dream","story-s1-bank-savings","story-s1-travel-family"].includes(id)))).toBe(false);
  expect((await saved()).character.yen).toBe(expectedYen);await page.screenshot({path:testInfo.outputPath("home-ticket-saved-reload.png")});
}
