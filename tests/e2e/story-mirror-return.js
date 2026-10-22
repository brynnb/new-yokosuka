import {expect} from "@playwright/test";
import {useStoryInspectable} from "./story-object-input.js";
import mksgPlacements from "../../play/data/mksg-runtime-placements.json" with {type:"json"};

// Continue the genuinely earned mirror save. Pose resets shorten approaches;
// real input, scene loading, object picks and server settlement own outcomes.
export async function verifyMirrorReturn(page,testInfo,character){
  const saved=()=>page.request.get(`/api/characters/${character.id}/state`).then(r=>r.json());
  const initial=await saved();expect(initial.inventory.some(i=>i.key==="phoenix_mirror"&&i.quantity===1)).toBe(true);
  const noErrors=async()=>expect(await page.evaluate(()=>window.storyProbe.sceneErrors)).toEqual([]);
  const idle=async()=>{await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("idle");expect(await page.evaluate(()=>window.storyProbe.lifecycle.getController().movementLocked)).toBe(false);await noErrors();};
  const options=async()=>{
    for(let i=0;i<50&&!await page.evaluate(()=>window.storyProbe.regions.controller.status==="options"||window.storyProbe.sceneErrors.length);i++){
      if(await page.evaluate(()=>window.storyProbe.regions.controller.status==="line"&&!!window.storyProbe.dialogue?.active))await page.keyboard.press("Space");
      await page.waitForTimeout(150);
    }
    await expect.poll(()=>page.evaluate(()=>window.storyProbe.regions.controller.status)).toBe("options");await noErrors();
  };
  const cutscene=async id=>{await page.waitForFunction(id=>window.storyProbe.director?.activeCutscene?.cutscene.id===id||window.storyProbe.sceneErrors.length,id,{timeout:100_000});await noErrors();};
  const arrived=async world=>{await page.waitForFunction(world=>window.storyProbe.ready&&window.storyProbe.lifecycle.worldRuntime.activeWorld.id===world,world,{timeout:120_000});await noErrors();};
  const walkInto=async(position,yaw,predicate)=>{
    await page.evaluate(({position,yaw})=>{const l=window.storyProbe.lifecycle,c=l.getController();l.resetPlayer(l.vectorFromArray(position),yaw,{persist:false});c.setFirstPerson(true);c.cameraYaw=yaw;c.cameraPitch=0;c.updateCamera(1);},{position,yaw});
    await page.locator("#renderCanvas").focus();await page.keyboard.down("KeyW");
    try{await page.waitForFunction(predicate,null,{timeout:20_000});}finally{await page.keyboard.up("KeyW");}await noErrors();
  };
  const economy=async()=>{const state=await saved();expect(state.inventory).toEqual(initial.inventory);expect(state.character.yen).toBe(initial.character.yen);expect(state.character.currentHp).toBe(initial.character.currentHp);};

  if(!initial.character.storyFlags["story.s1.fuku-phoenix-mirror.completed"]){
    if(initial.character.worldId==="ydb1"){
      await walkInto([-.758,-.005110997706651688,6],Math.PI,()=>window.storyProbe.authoredScene?.active?.scene.id==="s1.ydb1.basement-return");
      await options();await page.getByRole("button",{name:"Return to the dojo",exact:true}).click();await arrived("exterior");
    }else if(initial.character.worldId!=="exterior"){await page.evaluate(()=>window.storyProbe.lifecycle.travelToWorld("exterior"));await arrived("exterior");}
    const fukuChoice=()=>page.getByRole("button",{name:"Show Fuku-san the mirror",exact:true});
    if(!await fukuChoice().isVisible())await walkInto([8.1,.96,-22.5],-Math.PI/2,()=>window.storyProbe.regions.controller.status==="options"||window.storyProbe.sceneErrors.length);
    await expect(fukuChoice()).toBeVisible();await page.getByRole("button",{name:"Leave it for now",exact:true}).click();await idle();
    const fukuApproach=async()=>{await walkInto([8.1,.96,-22.5],-Math.PI/2,()=>window.storyProbe.regions.controller.status==="options"||window.storyProbe.sceneErrors.length);await expect(fukuChoice()).toBeVisible();};
    await fukuApproach();await fukuChoice().click();await cutscene("story-s1-fuku-phoenix-mirror");
    await page.waitForTimeout(1800);await page.screenshot({path:testInfo.outputPath("fuku-mirror-cancelled-original.png")});
    await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-mirror-referral-cancel"));await idle();
    expect((await saved()).character.storyFlags["story.s1.fuku-phoenix-mirror.completed"]).not.toBe(true);await economy();
    await fukuApproach();await fukuChoice().click();await cutscene("story-s1-fuku-phoenix-mirror");
    await page.waitForTimeout(30_000);await page.screenshot({path:testInfo.outputPath("fuku-original-mirror-conversation.png")});
    await expect.poll(async()=>(await saved()).character.storyFlags["story.s1.fuku-phoenix-mirror.completed"],{timeout:90_000,intervals:[1000]}).toBe(true);await idle();await economy();
  }

  if(!(await saved()).character.storyFlags["story.s1.master-chen-return-call.completed"]){
    if(await page.evaluate(()=>window.storyProbe.lifecycle.worldRuntime.activeWorld.id)!=="mfsy"){
      await useStoryInspectable(page,{world:"dobuita",tag:"BUS_",position:[-47,0,8],expectedChoice:"Board the bus to Amihama"});
      await page.getByRole("button",{name:"Stay in Dobuita",exact:true}).click();await idle();await economy();
      await useStoryInspectable(page,{world:"dobuita",tag:"BUS_",position:[-47,0,8],expectedChoice:"Board the bus to Amihama"});
      await page.getByRole("button",{name:"Board the bus to Amihama",exact:true}).click();await arrived("mfsy");await idle();
      expect((await saved()).character.storyFlags["story.s1.harbor-revisited"]).toBe(true);await economy();
    }
    const phone=async()=>useStoryInspectable(page,{world:"mfsy",tag:"BTEL",position:[118.1,0,121.4]});
    await phone();await page.getByRole("button",{name:"Call 0468-61-5647",exact:true}).click();await options();
    await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-return-password-cancel"));await idle();
    expect((await saved()).character.storyFlags["story.s1.master-chen-return-call.completed"]).not.toBe(true);
    await phone();await page.getByRole("button",{name:"Call 0468-61-5647",exact:true}).click();await options();
    const responses=()=>page.getByRole("button",{name:/^(Nine Dragons|Comrades|Mother's Earth|Father's Heaven)$/});
    await expect(responses()).toHaveCount(4);await responses().nth(1).click();await options();
    await page.getByRole("button",{name:"Leave the telephone",exact:true}).click();await idle();
    expect((await saved()).character.storyFlags["story.s1.master-chen-return-call.completed"]).not.toBe(true);await economy();
    await phone();await page.getByRole("button",{name:"Call 0468-61-5647",exact:true}).click();
    for(let i=0;i<2;i++){await options();await expect(responses()).toHaveCount(4);await responses().first().click();}
    for(let i=0;i<40&&!await page.evaluate(()=>window.storyProbe.regions.controller.status==="idle"||window.storyProbe.sceneErrors.length);i++){await page.keyboard.press("Space");await page.waitForTimeout(150);}
    await idle();expect((await saved()).character.storyFlags["story.s1.master-chen-return-call.completed"]).toBe(true);await economy();
  }

  if(!(await saved()).character.storyFlags["story.s1.old-district-revisited"]){
    await arrived("mfsy");
    const gateApproach=()=>walkInto([113,0,-11],-Math.PI/2,()=>window.storyProbe.authoredScene?.active?.scene.id==="s1.mfsy.old-district-day-gate"||window.storyProbe.sceneErrors.length);
    await gateApproach();await options();await page.getByRole("button",{name:"Leave it for now",exact:true}).click();await idle();
    await gateApproach();await options();await page.getByRole("button",{name:"Enter the Old Warehouse District",exact:true}).click();await arrived("mksg");await idle();
    expect((await saved()).character.storyFlags["story.s1.old-district-revisited"]).toBe(true);await economy();
    expect(await page.evaluate(()=>!!window.storyProbe.navigation?.active)).toBe(false);
  }
  if((await saved()).character.worldId!=="ms08"){
    const door=mksgPlacements.placements.find(p=>p.runtime?.objectTag==="dor3");expect(door).toBeTruthy();
    await useStoryInspectable(page,{world:"mksg",tag:"dor3",position:[door.position[0]+2,0,door.position[2]],expectedChoice:null});
    await arrived("ms08");
  }
  const meetingChoice=()=>page.getByRole("button",{name:"Show Master Chen the Phoenix Mirror",exact:true});
  if(!await meetingChoice().isVisible())await walkInto([23.5,0,-11],Math.PI/2,()=>window.storyProbe.regions.controller.status==="options"||window.storyProbe.sceneErrors.length);
  await expect(meetingChoice()).toBeVisible();await page.getByRole("button",{name:"Leave it for now",exact:true}).click();await idle();
  const meetingApproach=async()=>{await walkInto([23.5,0,-11],Math.PI/2,()=>window.storyProbe.regions.controller.status==="options"||window.storyProbe.sceneErrors.length);await expect(meetingChoice()).toBeVisible();};
  await meetingApproach();await meetingChoice().click();await cutscene("story-s1-mirror-meeting-explanation");
  await page.waitForTimeout(1800);await page.screenshot({path:testInfo.outputPath("chen-mirror-original-cancelled.png")});
  await page.evaluate(()=>window.storyProbe.regions.controller.cancel("test-return-meeting-cancel"));await idle();await economy();
  expect((await saved()).character.storyFlags["story.s1.master-chen-mirror.completed"]).not.toBe(true);
  await meetingApproach();await meetingChoice().click();await cutscene("story-s1-mirror-meeting-explanation");
  await page.waitForTimeout(12_000);await page.screenshot({path:testInfo.outputPath("chen-original-mirror-legend.png")});
  for(const part of ["theft-start","pursuit","scaffolding","crane"]){
    await cutscene(`story-s1-mirror-meeting-${part}`);await page.waitForTimeout(700);
    await page.screenshot({path:testInfo.outputPath(`chai-original-${part}.png`)});
  }
  const challenge=async()=>{await page.waitForFunction(()=>window.storyProbe.regions.controller.active?.challengePrompt?.ready||window.storyProbe.sceneErrors.length,null,{timeout:30_000});await noErrors();};
  await challenge();await page.keyboard.press("ArrowRight");await cutscene("story-s1-mirror-meeting-failure");
  await expect(page.getByRole("button",{name:"Try again",exact:true})).toBeVisible({timeout:25_000});
  expect((await saved()).character.storyFlags["story.s1.master-chen-mirror.completed"]).not.toBe(true);await economy();
  await page.getByRole("button",{name:"Try again",exact:true}).click();await challenge();
  expect(await page.evaluate(()=>window.storyProbe.regions.controller.dialogue.qte?.active?.steps[window.storyProbe.regions.controller.dialogue.qte.active.index]?.buttons[0])).toBe("Left");await page.keyboard.press("ArrowLeft");
  await cutscene("story-s1-mirror-meeting-save-mirror");await page.waitForTimeout(12_000);
  await page.screenshot({path:testInfo.outputPath("chai-original-mirror-recovered.png")});
  expect((await saved()).character.storyFlags["notebook.s1.hong-kong"]).not.toBe(true);
  await cutscene("story-s1-mirror-meeting-hong-kong");await page.waitForTimeout(10_000);
  await page.screenshot({path:testInfo.outputPath("chen-original-hong-kong-warning.png")});
  await expect.poll(async()=>(await saved()).character.storyFlags["story.s1.master-chen-mirror.completed"],{timeout:150_000,intervals:[1000]}).toBe(true);await idle();await economy();
  expect((await saved()).character.storyFlags["notebook.s1.hong-kong"]).toBe(true);
  await page.reload();await page.keyboard.press("Enter");await page.locator(".account-entry-actions button").filter({hasText:"Quick Play"}).click();
  await page.locator(".character-slot-button:not(.empty)").first().click();await page.locator("button").filter({hasText:/^Enter World$/}).click();await arrived("ms08");await idle();
  expect(await page.evaluate(()=>window.storyProbe.starts.some(id=>id.startsWith("story-s1-mirror-meeting")))).toBe(false);await economy();
  await page.screenshot({path:testInfo.outputPath("mirror-meeting-saved-reload.png")});
}
